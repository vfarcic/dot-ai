# PRD #581: Per-Request User Prompts Repository Override

**Status**: Draft
**Priority**: Medium
**Related Issue**: #575 (discussion); CLI companion PRD lives in `vfarcic/dot-ai-cli`

## Problem

The server can only fetch user prompts from a single git repository, configured at startup via `DOT_AI_USER_PROMPTS_REPO` (`src/core/user-prompts-loader.ts:48-70`). Real organizations want to compose skills from multiple sources with independent credentials — org-wide public skills + per-team private skills, OSS skills on GitHub + internal skills on a self-hosted GitLab, etc.

Current workarounds all fail:
- **Aggregator repo** — loses credential isolation (one token reads all sources).
- **Multiple dot-ai servers** — blocked client-side because `dot-ai skills generate` deletes all `dot-ai-*` files on each run, so two servers cannot coexist in one Claude Code install.

## Solution

Accept an optional `repo` parameter on the existing prompts endpoint. When supplied, the server fetches from that repository for the single request, overriding `DOT_AI_USER_PROMPTS_REPO`. When omitted, behavior is identical to today.

The CLI (companion PRD in `vfarcic/dot-ai-cli`) orchestrates composition by calling the endpoint once with no override (env-var-configured repo) and once per `--repo` flag, then accumulating results and writing them with a single wipe.

**Example flow:**
```
CLI:  dot-ai skills generate --repo https://github.com/orgA/skills --repo https://github.com/orgB/skills
   ├── GET  prompts  (server uses DOT_AI_USER_PROMPTS_REPO)
   ├── GET  prompts?repo=https://github.com/orgA/skills
   └── GET  prompts?repo=https://github.com/orgB/skills
       → accumulated, deduped, written to disk
```

## Scope

**In scope:**
- Optional `repo` parameter on `POST /api/v1/prompts/refresh` and `GET /api/v1/prompts` (and equivalent MCP surface, if applicable).
- When `repo` is supplied: clone/pull the specified repo with the existing `DOT_AI_GIT_TOKEN` for that request, load prompts, return them. Bypass the env-var repo entirely for that call.
- Per-request branch and path stay at defaults (`main`, repo root) for MVP — match the existing env-var defaults.
- Log scrubbing for user-supplied URLs (re-use existing `sanitizeUrlForLogging` and `scrubCredentials`).
- Branch validation for any user-supplied branch in the future (re-use existing `isValidGitBranch`).
- Failure isolation: a malformed `repo` parameter returns an error to that request without affecting the env-var-configured cache.

**Out of scope (deferred, can be added later additively):**
- Per-repo cache map (`Map<repoUrl, CacheState>`). MVP keeps the existing single-slot cache. Trade-off: if the CLI hits N different repos in sequence, the server re-clones each time. Acceptable; fixable later in pure code-change with no API contract impact.
- Per-repo tokens (`DOT_AI_GIT_TOKEN_N` or request-supplied tokens). MVP uses the existing single `DOT_AI_GIT_TOKEN` for all repos. Limitation: users with repos across different providers (GitHub + private GitLab) cannot authenticate to both. To be revisited if requested.
- Per-request `branch` and `path` overrides. Defaults match the env-var defaults; we can add these additively without breaking compatibility.
- URL allowlist / SSRF prevention. The server is not the security boundary for skill content (users can clone repos directly), and the proposed flow is dominated by self-hosted single-user setups. To be revisited if a multi-tenant shared-server need surfaces.
- Indexed env vars (the Option B framing from #575 — `DOT_AI_USER_PROMPTS_REPO_2`, etc.). The per-request param subsumes the use case and is more flexible. If a static multi-tenant config need surfaces later, indexed env vars become a thin layer over the same per-repo plumbing.

## Architecture

### Current behavior

```
Request ──▶ loadUserPrompts(logger, forceRefresh)
                 │
                 └─▶ getUserPromptsConfig()  # reads env vars, returns single config or null
                 └─▶ ensureRepository()       # uses module-level cacheState
                 └─▶ scan + load             # flat .md + skill folders
```

### Proposed behavior

```
Request (repo=?) ──▶ loadUserPrompts(logger, forceRefresh, override?)
                          │
                          ├─ if override: use override config, ignore env vars
                          └─ else:        getUserPromptsConfig() as today
                          │
                          └─▶ ensureRepository() + scan + load (unchanged)
```

The `override` shape mirrors `UserPromptsConfig` but carries only the fields that vary per request:

```typescript
export interface UserPromptsOverride {
  repoUrl: string;
  branch?: string;   // defaults to 'main'
  subPath?: string;  // defaults to ''
}
```

Token reuses `process.env.DOT_AI_GIT_TOKEN` (MVP scope above). Cache TTL reuses the env-var-derived value.

### Cache behavior (MVP — single slot)

The existing module-level `cacheState` (`user-prompts-loader.ts:42`) caches one repo. When `override` is supplied with a different `repoUrl` than the currently cached one, the loader treats the cache as invalid and clones fresh. This produces cache thrashing if the CLI alternates between repos within the TTL window, but is correct.

Documented as a known performance wart, fixable later by promoting `cacheState` to `Map<repoUrl, CacheState>` and giving `getCacheDirectory()` a per-repo subdirectory (hash of URL).

### API surface

Two REST endpoints exercise user prompts today (`src/interfaces/rest-api.ts`):
- `POST /api/v1/prompts/refresh` (PRD #386) — currently refreshes the env-var repo
- `GET /api/v1/prompts` and `POST /api/v1/prompts/:name` — list and retrieve prompts

For the refresh endpoint, accept an optional `repo` field in the request body. For the list/get endpoints, accept an optional `repo` query parameter. When present, the request is served against the specified repo only; when absent, behavior is unchanged.

The MCP `prompts/list` and `prompts/get` surfaces are not changed — MCP does not have a natural way to pass a per-request repo override, and the composition use case is CLI-driven.

### Wire format example

```http
POST /api/v1/prompts/refresh
Content-Type: application/json

{ "repo": "https://github.com/orgA/skills" }
```

Response includes a `source` field identifying which repo the result came from (for observability and CLI-side dedup tracking):

```json
{
  "success": true,
  "data": {
    "refreshed": true,
    "promptsLoaded": 7,
    "source": "https://github.com/orgA/skills"
  }
}
```

For requests with no override, `source` retains today's `"built-in"` or `"built-in+repository"` strings for backwards compatibility.

## Success Criteria

- Existing requests with no `repo` parameter behave byte-identically to today (no behavioral drift, no new log lines).
- Requests with `repo=<url>` fetch prompts from the specified repository using the existing token, ignoring `DOT_AI_USER_PROMPTS_REPO` for that call.
- Invalid or unreachable `repo` returns an error scoped to the request; the env-var cache is not corrupted.
- User-supplied URLs are scrubbed from logs and error messages (no token leakage).
- Documentation describes the new parameter and its scope clearly.

## Milestones

- [ ] Loader change: `loadUserPrompts` accepts an optional override config; existing call sites pass `undefined`. New helper `getUserPromptsConfigFromOverride()` constructs a `UserPromptsConfig` from the override.
- [ ] REST endpoints: `POST /api/v1/prompts/refresh` accepts `{ repo }`; `GET /api/v1/prompts` and `POST /api/v1/prompts/:name` accept `?repo=...`. All thread the override through to the loader. `source` field reflects the override URL when present.
- [ ] Integration tests covering: no-override path is byte-identical; override path fetches the correct repo; invalid URL returns error without corrupting cache; logs scrub credentials in override URL.
- [ ] Documentation update: `docs/` describes the new parameter, its defaults, and the single-token / single-cache-slot caveats. Reference the CLI companion PRD.
- [ ] CLI companion PRD merged in `vfarcic/dot-ai-cli` and linked from this PRD.
