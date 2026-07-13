# PRD #621: Per-Request Path, Branch, and Credential for the Prompts Repo Override

**Status**: Implementation complete — CI-verified green (run 27431461358; commits 33e3716, 06907a8). M1–M6 done; M7 (companion CLI PRD) drafted, cross-repo filing pending. Mock-image republish pending at release.
**Priority**: Important (workarounds exist but are painful)
**Related Issues**: #621 (this PRD); #607 / #581 (the override this extends); #575 (multi-realm auth discussion); CLI companion `vfarcic/dot-ai-cli#15`

## Problem

The per-request repo override shipped in #607 (PRD #581, v1.21.0) — `GET`/`POST /api/v1/prompts?repo=<url>`, surfaced as `dot-ai skills generate --repo <url>` — is intentionally minimal: the override carries only the repo URL. That leaves three things unreachable for a secondary `--repo` source, all from the same `{ repoUrl }`-only override:

1. **Subdirectory.** The override reads the repo root and ignores any `skills/`-style layout. A repo that keeps its skills under `skills/` (the same layout an env-var-configured repo uses via `DOT_AI_USER_PROMPTS_PATH`) cannot be consumed as a `--repo` source without moving files to the repo root.
2. **Branch.** The override always uses `main`; there is no way to pull a source from a non-default branch.
3. **Credential.** The override clone authenticates with the server's single `DOT_AI_GIT_TOKEN`, so a second repo in a different auth realm (another Forgejo, private GitHub, GitLab) cannot be authenticated. `UserPromptsOverride` has no token field, and the clone happens server-side, so a per-hook `DOT_AI_GIT_TOKEN` set on the CLI host never reaches the server's clone.

These are exactly the items PRD #581 explicitly deferred as "addable later additively": per-request `branch`/`path` overrides, and per-repo / request-supplied tokens.

## Solution

Let the override carry `path`, `branch`, and a credential — all optional and additive. Omitting all three reproduces today's behavior exactly: repo root, `main` branch, server env credential.

- **path / branch:** accept `?path=` and `?branch=` query params (and POST-body equivalents) and flow them into `candidate.subPath` / `candidate.branch` in `extractPromptsOverride`. The loader is already wired for both — `UserPromptsOverride` already declares optional `subPath` and `branch`, `getUserPromptsConfigFromOverride` already validates them (`sanitizeRelativePath`, `isValidGitBranch`), and `cloneRepo` already accepts a `branch`. They are simply never populated from the request today.
- **credential:** let the CLI forward a git token to the server for the override clone via a request header over the already-authenticated channel, and have the server prefer that credential when cloning an overridden repo. This avoids putting tokens in query strings (the loader already scrubs credential-bearing query-param values, so a header is the natural fit) and makes the per-hook env-var model from #575 work end to end.

### Wire format

```
GET /api/v1/prompts?repo=https://github.com/org/skills&path=skills&branch=main
X-Dot-AI-Git-Token: <token for that repo>     # optional; only when the source needs auth
```

POST body equivalents (`{ repo, path, branch }`) for `POST /api/v1/prompts/refresh` and `POST /api/v1/prompts/:name`. The token always travels as a header, never in the body or query string.

## Backward Compatibility (Non-Negotiable)

**The single hard requirement of this PRD: existing users who do not use the new parameters must see zero change.**

- All three additions (`path`, `branch`, token header) are **optional and additive**. Absent = today's behavior.
- A request with no `path`/`branch`/token-header — whether it uses the env-var repo (no `?repo=`) **or** uses `?repo=` exactly as today — must behave **byte-identically** to v1.21.0: same clone target (root, `main`), same credential (`DOT_AI_GIT_TOKEN`), same response, **no new log lines**.
- No change to the env-var configuration model (`DOT_AI_USER_PROMPTS_REPO`, `DOT_AI_USER_PROMPTS_PATH`, `DOT_AI_USER_PROMPTS_BRANCH`, `DOT_AI_GIT_TOKEN`) — these continue to drive the no-override path unchanged.
- The MCP `prompts/list` / `prompts/get` surfaces are unchanged (override is REST/CLI-only, same as #581).
- No new required deployment configuration. The token header is opt-in per request; deployments that never send it never need to know it exists.

This is enforced by a dedicated parity test (see Milestone 4) that asserts no-new-param requests are unchanged, and is restated as a success criterion below.

## Design Decisions

These were resolved during issue analysis and are fixed for implementation:

1. **Token transport = request header, named `X-Dot-AI-Git-Token`.** Not a query param (logged/scrubbed surface) and not a POST body field. The `X-Dot-AI-` prefix matches the existing credential-bearing header convention (`X-Dot-AI-Authorization` in `src/interfaces/oauth/middleware.ts`); the un-namespaced `X-Session-Id` is the only non-namespaced custom header and is not credential-bearing. The new header must be added to **both** CORS allowlists, which are currently out of sync: `src/interfaces/mcp.ts` (`Content-Type, X-Session-Id, Authorization, X-Dot-AI-Authorization`) and `src/interfaces/rest-api.ts` `setCorsHeaders` (`Content-Type, Authorization`).

2. **Cache isolation without leaking the secret into the key.** The loader cache is keyed on `repoUrl`/`branch`/`subPath`. The token must **not** enter the cache key (it is a secret) yet must **not** let one caller's authenticated clone be served from cache to a different caller for a private repo. The chosen approach: an authenticated override clone (token-bearing request) is not served to, and does not serve from, the shared unauthenticated cache slot for that coordinate — token-bearing override requests are isolated per request (or keyed by a non-reversible hash of the token alongside the coordinate). Concrete mechanism finalized in Milestone 3.

3. **Credential scope = intended host only; no cross-host redirect forwarding.** When the server injects the caller's token into the clone, the token must reach only the host in `repoUrl`. Git must not forward the credential across an HTTP redirect to a different host (token-leak vector). Verified explicitly in tests.

4. **Env-var fallback preserved.** When no token header is present, the override clone uses `getGitAuthConfigFromEnv()` exactly as today (`DOT_AI_GIT_TOKEN` / GitHub App). The header, when present, takes precedence **for that request only**.

5. **SSRF posture (no new boundary required).** The server already clones arbitrary http/https `?repo=` URLs as of #607, and every non-OpenAPI request is already gated behind `checkBearerAuth` (`src/interfaces/mcp.ts`). This PRD does not introduce the arbitrary-outbound-fetch surface; it adds attaching a caller-supplied credential to it. The existing http/https-only scheme check is retained. No URL allowlist is added (consistent with #581's deferred-until-multi-tenant-need stance); the real new risk is credential handling (decisions 2 and 3), which is addressed directly.

## Scope

**In scope:**
- `?path=` / `?branch=` query params on `GET /api/v1/prompts` and `POST /api/v1/prompts/:name`; `path` / `branch` body fields on `POST /api/v1/prompts/refresh`. Threaded into `candidate.subPath` / `candidate.branch` in `extractPromptsOverride`; validation already exists downstream.
- `X-Dot-AI-Git-Token` request header read in the REST handlers, threaded through the override into the override clone, taking precedence over env credentials for that request only.
- `cloneRepo` / auth path accepts a per-call token that overrides `getGitAuthConfigFromEnv()` when supplied.
- Cache isolation for token-bearing override requests (decision 2).
- Credential scrubbing extended to the new params and header (no token in logs, error messages, or the `source` field); re-use existing `sanitizeUrlForLogging` / `scrubCredentials`.
- Mock-server parity (`mock-server/`) for the new params and header.
- Tests, including the backward-compat parity test.
- Documentation update.
- Companion CLI PRD handoff (final milestone).

**Out of scope:**
- CLI-side implementation of `--repo-path` / `--repo-branch` / token forwarding (companion PRD in `vfarcic/dot-ai-cli`, scaffolded by the final milestone here).
- Per-repo cache map / multi-slot cache optimization (still deferred from #581; this PRD only adds the isolation needed for correctness, not a performance optimization).
- Server-side indexed env vars (`DOT_AI_USER_PROMPTS_REPO_N` + `DOT_AI_GIT_TOKEN_N`) — heavier alternative the per-request model subsumes.
- URL allowlist / SSRF prevention beyond the existing scheme check (decision 5).
- Changes to the MCP `prompts/*` surfaces.

## Architecture

Relevant code at v1.21.0:

- `src/interfaces/rest-api.ts`: `extractPromptsOverride` constructs `{ repoUrl }` only; GET handlers read `searchParams.get('repo')`; POST refresh reads `bodyObj?.repo`. No path/branch/token. CORS in `setCorsHeaders`.
- `src/core/user-prompts-loader.ts`: `UserPromptsOverride` = `{ repoUrl; branch?; subPath? }` (no token). `getUserPromptsConfigFromOverride` defaults `subPath=''`, `branch='main'`, `gitToken=process.env.DOT_AI_GIT_TOKEN`; validates `subPath` (`sanitizeRelativePath`) and `branch` (`isValidGitBranch`).
- `src/core/git-utils.ts`: `cloneRepo(repoUrl, targetDir, { branch?, depth? })` calls `getGitAuthConfigFromEnv()` internally and injects the env credential into any host via `getAuthenticatedUrl`. Accepts `branch`; does not accept a per-call token.
- `src/interfaces/mcp.ts`: every non-OpenAPI request passes `checkBearerAuth` before routing to the REST handler.

Change shape:

```
Request (repo, path, branch, X-Dot-AI-Git-Token?) 
   │
   ▼
extractPromptsOverride           ── now reads path → subPath, branch → branch; header → token
   │  builds UserPromptsOverride { repoUrl, branch?, subPath?, gitToken? }
   ▼
getUserPromptsConfigFromOverride ── token: override.gitToken ?? process.env.DOT_AI_GIT_TOKEN
   │  (validation already present for subPath/branch)
   ▼
ensureRepository / cloneRepo     ── accepts per-call token; scope to host; no cross-host redirect
   │  cache: token-bearing requests isolated (decision 2)
   ▼
scan + load (unchanged)
```

`UserPromptsOverride` gains an optional `gitToken?: string`. `UserPromptsConfig.gitToken` already exists; the only new behavior is sourcing it from the override when present.

## Success Criteria

- **Backward compat:** requests with no `path`/`branch`/token-header behave byte-identically to v1.21.0 — no behavioral drift, no new log lines — for both the no-`repo` path and the `?repo=`-only path. (Asserted by a dedicated parity test.)
- `?path=` / `?branch=` (and POST-body equivalents) flow into the override and are honored by the clone; invalid values return a request-scoped 400 with credentials scrubbed, without corrupting the env-var cache.
- `X-Dot-AI-Git-Token`, when present, authenticates the override clone against the source host and takes precedence over `DOT_AI_GIT_TOKEN` for that request only; when absent, the env credential is used exactly as today.
- The forwarded token never appears in logs, error messages, the `source` field, or the cache key, and is never forwarded across a cross-host redirect.
- A token-bearing override clone of a private repo is never served from cache to a different caller, and never populates the shared unauthenticated cache slot for that coordinate.
- Mock-server mirrors the new params and header.
- Documentation describes the new params, the header, defaults, precedence, and the unchanged-by-default guarantee.
- Companion CLI PRD exists in `vfarcic/dot-ai-cli` with the full server-side contract.

## Milestones

Sequenced so the low-risk, high-value path lands first; the credential work (which carries the cache/redirect decisions) follows.

- [x] **M1 — Path + branch wiring.** `extractPromptsOverride` reads `?path=`/`?branch=` (GET) and `path`/`branch` body fields (POST) into `candidate.subPath`/`candidate.branch`. Existing downstream validation (`sanitizeRelativePath`, `isValidGitBranch`) and cache-key tracking are reused unchanged. Credential scrubbing extended to the new params.
- [x] **M2 — Credential header.** Read `X-Dot-AI-Git-Token` in the REST handlers; add `gitToken?` to `UserPromptsOverride`; `getUserPromptsConfigFromOverride` sources the token from the override when present, else env. Add the header to both CORS allowlists.
- [x] **M3 — Clone auth + cache isolation.** `cloneRepo` / auth path accepts a per-call token that overrides `getGitAuthConfigFromEnv()`; token scoped to the source host with no cross-host redirect forwarding (decision 3). Cache isolation for token-bearing override requests (decision 2) — finalize the concrete mechanism here.
- [x] **M4 — Tests.** Including the **backward-compat parity test** (no-new-param requests unchanged, for both no-`repo` and `?repo=`-only paths); path/branch honored + invalid-value 400s with scrubbing; token precedence over env; token absent from logs/errors/`source`/cache key; cross-host redirect does not leak the token; private authenticated clone not served cross-caller from cache. `npm run test:integration` green.
- [x] **M5 — Mock-server parity.** (Code done; mock image republish via `publish-mock-server` pending at release.) `mock-server/routes.ts` and `mock-server/fixtures/prompts/` accept `path`/`branch` (query + body) and the `X-Dot-AI-Git-Token` header, and reflect behavior consistently. Mock image republished via `publish-mock-server` at release time.
- [x] **M6 — Documentation.** (Docs + changelog fragment `changelog.d/621.feature.md` done; optional live-validation of example `promptsLoaded` counts pending.) Update `docs/ai-engine/api/rest-api.md` (Prompts Endpoints) and `docs/ai-engine/tools/prompts.md` (multi-source override section) with the new params, the header, defaults, token precedence, and the explicit unchanged-by-default guarantee. Changelog fragment in `changelog.d/` (`621-*.feature.md`).
- [ ] **M7 — Companion CLI PRD handoff.** (Drafted at `tmp/621-cli-companion-prd.md` with the full server-side contract; cross-repo filing in `vfarcic/dot-ai-cli` pending user confirmation.) Create a PRD in `vfarcic/dot-ai-cli` (building on `vfarcic/dot-ai-cli#15`) for the CLI-side `--repo-path`, `--repo-branch`, and `DOT_AI_GIT_TOKEN`-forwarding work. Package the complete server-side contract the CLI needs (see below) so the CLI team can implement and verify against the mock without re-deriving it.

### M7 — Contract the CLI PRD must carry

The companion CLI PRD must include, sourced from this project:

- **Endpoints + parameter placement:**
  - `GET /api/v1/prompts` — `?repo=`, `?path=`, `?branch=` (query); token via `X-Dot-AI-Git-Token` header.
  - `POST /api/v1/prompts/refresh` — `repo`, `path`, `branch` (JSON body); token via header.
  - `POST /api/v1/prompts/:name` — `?repo=`, `?path=`, `?branch=` (query); token via header.
- **Token transport:** always the `X-Dot-AI-Git-Token` header — never query string or body. CLI forwards its `DOT_AI_GIT_TOKEN` (per-hook env) into this header when set.
- **Defaults / precedence:** omitting `path` = repo root; omitting `branch` = `main`; omitting the header = server env credential. Header token takes precedence over server env for that request only.
- **`source` field:** unchanged from #581 — echoes the override repo URL (credentials scrubbed), stable per repo, used by the CLI as the skill-tagging key. The CLI must confirm `path`/`branch`/token do not alter the `source` value for a given repo.
- **Errors:** invalid `path`/`branch` → request-scoped 400 with credentials scrubbed; unreachable/unauthorized repo → error scoped to the request.
- **Mock pinning:** pin to the mock image tag published from this PRD's branch (older tags silently ignore the new params, so CLI tests would pass while exercising nothing).
- **Verification checklist** for the CLI: flags map to the right param/header on every relevant request; private cross-realm source authenticates with the forwarded token; non-default branch and `skills/`-style subdir both resolve; URLs with embedded credentials never reach logs or skill frontmatter.

## Open Questions

- **M3 cache-isolation mechanism:** per-request isolation (no caching for token-bearing requests) vs. coordinate + non-reversible token-hash key. Decide in M3 based on the clone-cost vs. correctness trade-off; either satisfies the success criteria. Default lean: per-request isolation (simplest, provably safe), revisit only if clone cost bites.
