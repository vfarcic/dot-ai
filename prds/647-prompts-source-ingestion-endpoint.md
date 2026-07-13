# PRD #647: Server-Side Ingestion Endpoint for CLI-Uploaded Skill Sources

**Status**: Server-side implementation COMPLETE (2026-06-16) — all of M1–M7 landed and integration-verified; companion to `vfarcic/dot-ai-cli#13`. **Both halves must ship in the same release**; neither is usable alone. Design Decisions #1–#6 were resolved **server-side** per the leaning recommendations and frozen in `.dot-agent-deck/647-contract.md`; the cross-repo contract still needs `vfarcic/dot-ai-cli#13` sign-off. Remaining before release: (a) republish the mock-server image (manual `publish-mock-server`), (b) coordinate the joint release with cli#13.
**Priority**: Medium (the static-credential network-isolated case is already covered by #621; this targets only what #621 cannot reach, plus local dev directories — see Scope)
**Related Issues**: #647 (this PRD); **CLI companion** [`vfarcic/dot-ai-cli#13`](https://github.com/vfarcic/dot-ai-cli/issues/13) (`--repo-fetch` / `--repo-dir` + source upload); #621 / PRD #621 (per-request path/branch/credential override — the reason this is scoped narrowly); #607 / #581 (the original `?repo=` override and the "each request serves exactly one repo, server-fetched" model this extends); #575 (multi-source / per-hook multi-realm discussion)

## Problem

Every skill source is fetched **server-side** today: the CLI forwards a repo URL (`?repo=`, optionally `?path=`/`?branch=`/`X-Dot-AI-Git-Token` from #621) and the server clones it (`cloneRepo` in `src/core/git-utils.ts`, driven by `getUserPromptsConfigFromOverride` in `src/core/user-prompts-loader.ts`). PRD #581 baked the model in deliberately: *"Each request serves exactly one repo… the server fetches it."*

After #621 that model covers any source reachable with a **static credential** — a private cross-realm repo now works via `--repo` + a per-hook `DOT_AI_GIT_TOKEN` forwarded as `X-Dot-AI-Git-Token`. Two classes of source remain unreachable, and in both the developer's laptop (where `dot-ai-cli` runs) **can** fetch while the server **cannot**:

1. **Sources the server cannot authenticate or route to, even with a static token** — VPNs gated by SSO / OIDC / device attestation (no static credential to hand the server), and managed/hardened clusters where the operator can neither deploy an egress path nor mint a service-account token for the source.
2. **On-disk directories** — work-in-progress skills on a developer's filesystem with no remote at all (dev loops).

`vfarcic/dot-ai-cli#13` adds CLI-side flags (`--repo-fetch`, `--repo-dir`) so the CLI fetches these locally. But most dot-ai skills take arguments (`dot-ai-recommend "deploy postgres"`, the `dot-ai-prd-*` family, …) and depend on the **server's** renderer to substitute them at invocation time via `POST /api/v1/prompts/:name`. There is currently **no way for the CLI to hand the server a source it fetched itself** — so a CLI-fetched source has nothing to render against.

## Solution

Add one additive endpoint that lets the CLI **upload** a skill source the server then caches and renders through the existing path — **one renderer, server-side**:

- **`POST /api/v1/prompts/sources`** — accepts uploaded skill source plus a **stable source identifier**. The server stashes the source keyed by that identifier in the same coordinate space the git-fetch loader cache already uses, so the existing render path can look it up uniformly.
- The existing **`POST /api/v1/prompts/:name`** render path resolves a source by identifier and renders it **unchanged** — same template engine, same argument substitution. The only difference from a `?repo=` request is how the source reached the cache: **received from the CLI**, not cloned from git.
- **`GET /api/v1/prompts?source=<identifier>`** — **contract amendment (2026-06-19, requested by `vfarcic/dot-ai-cli#13`).** Enumerates the prompts contained in an uploaded source (same list schema as `GET /api/v1/prompts`, scoped to the ingested source, `data.source` echoes the scrubbed identifier). The CLI's `generate` flow is upload → **list** → render-each; without this, only skill names that already exist in the built-in set could be generated, so the PRD's primary "brand-new on-disk WIP skills" case was unreachable. Unknown/evicted `?source=` returns 400 with the same re-upload guidance as the render-miss path; no clone is ever attempted. The CLI **accepted** the explicit-`?source=` render signal (Design Decision #1 option b) and the caller-side `local:<user>-<label>` uniqueness convention (#4).

This is symmetric with today's model — the server already does "fetch git → cache source → render on demand"; this adds "receive source from CLI → cache source → render on demand."

### Source-identifier key space

| CLI flag | Identifier | Server behavior |
|---|---|---|
| `--repo-fetch <git-url>` | the git URL verbatim (credentials scrubbed) | render from **ingested** source; **must not** attempt its own clone of that URL (the whole point is the server can't reach it) |
| `--repo-dir <path> --source-label <label>` | `local:<label>` | render from ingested source; `local:` is intrinsically non-clonable |

> **Disambiguation is a load-bearing design decision (see Design Decisions #1).** A render request carrying a `--repo-fetch` identifier presents as `?repo=<git-url>` — which today triggers a *server-side clone*. The server must instead recognize that this identifier has an ingested source and serve from it **without cloning**.

### Wire format (illustrative — finalize in M1)

```
POST /api/v1/prompts/sources
Authorization: Bearer <token>           # same bearer gate as every non-OpenAPI request
Content-Type: application/json

{
  "source": "local:team-dev",           # or "https://gitlab.corp.internal/team/skills"
  "contentHash": "sha256:…",            # CLI-computed; lets the server 304 an unchanged upload
  "files": [ { "path": "dot-ai-foo/SKILL.md", "content": "<base64>", "mode": "0644" }, … ]
}
```

```
POST /api/v1/prompts/<name>?source=local:team-dev   # render from an ingested source
Authorization: Bearer <token>
```

(Transport shape — JSON manifest with base64 file bodies vs. a tarball — and the exact render-time signal are open; see Design Decisions.)

## Backward Compatibility (Non-Negotiable)

Same hard rule as #621: **users who do not use the new endpoint see zero change.**

- The ingestion endpoint is purely additive. No request that omits it changes behavior.
- The existing `?repo=` server-side fetch + render path is **byte-identical** to post-#621 behavior. An ingested source is consulted only when a render request explicitly references an ingested identifier (Design Decision #1) — never for a plain `?repo=<url>` the server is expected to clone.
- No change to the env-var configuration model (`DOT_AI_USER_PROMPTS_REPO/PATH/BRANCH`, `DOT_AI_GIT_TOKEN`) or to the MCP `prompts/list` / `prompts/get` surfaces (this is REST/CLI-only, like #581/#621).
- No new **required** deployment configuration. Deployments that never receive an upload never need to know the endpoint exists.

## Design Decisions (OPEN — settle with the CLI PRD before coding)

1. **Render-time disambiguation: ingested vs. clone.** How does `POST /api/v1/prompts/:name` know to serve an ingested source instead of cloning `?repo=<url>`? Options: (a) consult the ingested cache first for any identifier, clone only on miss — simple but lets a stale/poisoned upload shadow a real repo; (b) an explicit signal — a distinct `?source=` param or an `uploaded:`/`local:` scheme — so ingested and clone paths never overlap. **Leaning (b)**: `local:<label>` is already non-clonable, and `--repo-fetch` should set an explicit "use ingested" marker so a server-unreachable URL is never attempted as a clone.
2. **Cache lifecycle for pushed sources.** Git-fetched sources refresh via `POST /api/v1/prompts/refresh` (pull). Ingested sources are **pushed** — there is nothing to pull. Define: TTL / LRU eviction, what happens on render-miss for an evicted identifier (error vs. instruct CLI to re-upload), and whether ingested entries survive a server restart (in-memory vs. persisted).
3. **Content-hash dedup.** The CLI gates re-upload on a content hash. Decide the mechanism: upload carries `contentHash` and the server replies "unchanged, skipped," or a cheap pre-check (`HEAD`/`GET /api/v1/prompts/sources/:id/hash`) the CLI calls before uploading.
4. **`local:<label>` uniqueness is per-server, not per-host.** Two CLI hosts uploading `local:foo` collide in one server's cache and overwrite each other. Decide: document a convention (`local:<user>-<label>` / `local:<host>-<label>`), have the CLI auto-prefix with `$USER`/`$HOSTNAME`, or namespace ingested sources by authenticated principal server-side. **This is the single most important cross-repo contract item** — the CLI cannot finalize its `--source-label` semantics without it.
4. **Multi-tenant overwrite / trust.** Ingested source is global server state keyed by identifier. Without per-principal namespacing, any authenticated caller can overwrite any `local:<label>` (or any ingested `?repo=` identifier). Decide whether ingestion is namespaced per authenticated principal and how that interacts with the shared loader cache key.
5. **Upload input safety.** Accepting uploaded files is a new untrusted-input surface: enforce a max payload size, a max file count, and path-traversal / zip-slip rejection on file paths (reuse the folder-write hardening from the folder-based-skills work). Strip/validate `mode` bits.
6. **Transport format.** JSON manifest with base64 file bodies (mirrors the folder-based-skills decode path) vs. a streamed tarball. JSON is simplest and symmetric with existing handlers; tarball is leaner for large sources. Decide with the CLI.

## Scope

**In scope:**
- `POST /api/v1/prompts/sources` ingestion endpoint: validate, decode, and cache an uploaded source keyed by its identifier, in a coordinate space the render path can resolve uniformly with git-fetched sources.
- Render-path resolution of an ingested identifier in `POST /api/v1/prompts/:name` (Design Decision #1), with **no clone attempt** for an ingested `--repo-fetch` URL.
- Cache lifecycle for pushed sources (Design Decision #2) and content-hash dedup support (#3).
- Credential/secret hygiene consistent with #621: never log or echo a credentialed `?repo=` identifier; the ingested `source` echoed back is the scrubbed form (reuse `sanitizeUrlForLogging` / `scrubCredentials`).
- Upload-input hardening (#5): size/count caps, path-traversal rejection, mode validation.
- Bearer-auth gating (same `checkBearerAuth` path as all non-OpenAPI requests) and CORS allowlist update if a new header is introduced.
- Mock-server parity (`mock-server/`) so the CLI can test `--repo-fetch` / `--repo-dir` end-to-end against the mock — **this is the CLI PRD's M0 prerequisite**.
- Tests (including a backward-compat parity test asserting plain `?repo=` is unchanged) and documentation.

**Out of scope:**
- All CLI-side work — flags, local clone cache, source upload, hook wiring (companion `vfarcic/dot-ai-cli#13`).
- The static-credential network-isolated case — **already solved by #621** (`?repo=` + `X-Dot-AI-Git-Token`); explicitly not re-addressed here.
- Server-side fetching of these sources (the premise is the server *can't*; that's why the CLI uploads).
- A second renderer / CLI-side rendering (rejected in cli#13 — the single-renderer property is the reason this endpoint exists).
- Multi-slot / per-repo cache performance optimization (still deferred from #581; add only the isolation/lifecycle needed for correctness).

## Architecture (relevant code, current)

- `src/interfaces/routes/index.ts`: registers `/api/v1/prompts`, `/api/v1/prompts/refresh`, `/api/v1/prompts/:promptName`. **Add** `/api/v1/prompts/sources`.
- `src/interfaces/rest-api.ts`: `extractPromptsOverride` builds the override from query/body; `setCorsHeaders` holds the CORS allowlist. New handler reads the uploaded manifest + identifier; render handler learns the ingested-source signal.
- `src/core/user-prompts-loader.ts`: `UserPromptsOverride` + `getUserPromptsConfigFromOverride` + the loader cache keyed on `repoUrl`/`branch`/`subPath`. Ingested sources must slot into a compatible coordinate so render lookup is uniform; an ingested entry is populated by upload rather than by `cloneRepo`.
- `src/core/git-utils.ts`: `cloneRepo` — **must be bypassed** for ingested identifiers.
- `src/tools/prompts.ts`: prompts list/get/render — the rendering this endpoint reuses unchanged.
- `mock-server/`: must mirror the new endpoint for the CLI's integration tests.

## Success Criteria

- `POST /api/v1/prompts/sources` accepts an uploaded source + identifier and caches it; a subsequent `POST /api/v1/prompts/:name` referencing that identifier renders the skill **with full argument substitution**, byte-identical to the same skill rendered from a `?repo=` clone.
- A `--repo-fetch <git-url>` identifier for a URL the **server cannot reach** still renders (from the ingested source) and triggers **no clone attempt**.
- A `local:<label>` identifier renders with **no git operation** of any kind.
- An unchanged re-upload (same content hash) is recognized and skipped/short-circuited.
- A plain `?repo=<url>` request with no ingested entry behaves **exactly** as post-#621 (clone + render); no new log lines, no behavior change — enforced by a parity test.
- No credential or credentialed identifier appears in logs, errors, or the echoed `source`.
- Upload input limits and path-traversal rejection are enforced and tested.
- The mock server mirrors the endpoint, unblocking the CLI PRD's M0.
- **`GET /api/v1/prompts?source=<identifier>`** enumerates an uploaded source's prompts — including **genuinely-new** skill names not in the built-in set — with the standard list schema and scrubbed identifier echo; an unknown/evicted identifier returns 400 with re-upload guidance and **no clone**. (Contract amendment for cli#13's upload→list→render flow.)

## Milestones

- [x] **M1 — Contract finalized.** Resolve Design Decisions #1–#6 jointly with `vfarcic/dot-ai-cli#13`; freeze the wire format (upload shape, render-time signal, identifier key space, `local:` uniqueness rule). Output: a fixed contract both PRDs cite. — *Server-side decisions frozen in `.dot-agent-deck/647-contract.md` (D1 explicit `?source=` signal, D2 in-memory push-cache, D3 content-hash dedup, D4 verbatim `local:<label>` + documented convention, D6 JSON+base64). Cross-repo "both PRDs cite" sign-off with cli#13 still pending.*
- [x] **M2 — Ingestion endpoint.** `POST /api/v1/prompts/sources`: validate, decode, hardening (#5), cache the source by identifier. Bearer-gated; CORS updated if needed. — *Implemented in `src/core/user-prompts-loader.ts` (`ingestPromptsSource`) + `src/interfaces/rest-api.ts` (`handlePromptsSourceIngest`); bearer-gated; hardening: zip-slip/null-byte 400, file-count cap 100, decoded-bytes cap 256 KiB, raw-body cap 512 KiB→413, mode-bit stripping, mkdtemp+0700. Integration-verified.*
- [x] **M3 — Render-path resolution.** `POST /api/v1/prompts/:name` resolves ingested identifiers (Decision #1) with no clone for unreachable `--repo-fetch` URLs; argument substitution unchanged. — *`extractPromptsOverride` reads `?source=`; ingested path short-circuits before URL validation, never clones; arg substitution via the existing renderer. Integration-verified.*
- [x] **M4 — Lifecycle + dedup.** Cache TTL/eviction for pushed sources (#2); content-hash dedup (#3); defined render-miss-after-eviction behavior. — *Content-hash dedup (`status:'unchanged'`); LRU eviction `MAX_INGESTED_SOURCES=50`; render-miss → 400 with (re)upload guidance, no clone. Integration + unit verified.*
- [x] **M5 — Secret hygiene + backward-compat parity.** Scrub credentialed identifiers everywhere; parity test asserting plain `?repo=` is byte-identical to post-#621. — *`scrubSourceUrl` on echo/store/error + request-URL logging (`?source=` now scrubbed); parity test confirms plain `?repo=` clones and never serves an ingested entry. Integration-verified.*
- [x] **M6 — Mock-server parity.** Mirror the endpoint in `mock-server/` so the CLI can integration-test `--repo-fetch` / `--repo-dir`. **Unblocks cli#13 M0.** — *`mock-server/prompts-ingest.ts` + routes/server mirror ingest + `?source=` render (dedup, caps, render-miss, parity); 14 unit tests. ⚠️ Mock image must be republished (manual `publish-mock-server`) before cli#13 e2e sees it.*
- [x] **M7 — Tests + docs.** Endpoint + render + lifecycle + hardening coverage; documentation; coordinate release so both halves ship together. — *Integration coverage (10 PRD #647 cases GREEN) + unit tests; docs in `docs/ai-engine/api/rest-api.md` and `docs/ai-engine/tools/prompts.md`. Joint release coordination with cli#13 still pending.*

## Open Questions

- **Does the candidate source set justify this post-#621?** With #621 covering static-credential sources, confirm there are real SSO/device-attested or genuinely server-unroutable sources (plus the `--repo-dir` dev-loop demand) before building. External stakeholder on the CLI side: [@vtmocanu](https://github.com/vfarcic/dot-ai-cli/issues/13#issuecomment-4565887861).
- **Namespacing authority** (Decisions #4): document-a-convention vs. CLI auto-prefix vs. server-side per-principal — decide before the CLI freezes `--source-label`.
- **Persistence**: do ingested sources survive a server restart, or is re-upload on the next hook fire acceptable (and cheaper)?
