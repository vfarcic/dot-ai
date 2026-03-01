# PRD #386: REST Endpoint for On-Demand Prompts Cache Refresh

**Status**: Open
**Priority**: Medium
**Created**: 2026-02-27

## Problem

User-defined prompts loaded from git repositories (via `DOT_AI_USER_PROMPTS_REPO`) are cached with a TTL (`DOT_AI_USER_PROMPTS_CACHE_TTL`). When prompts are updated in the git repo, users must either wait for the cache TTL to expire or restart the pod. There is no way to trigger an on-demand refresh.

This is especially painful when iterating on prompt development, deploying critical prompt updates across a team, or debugging prompt loading issues.

## Solution

Add a `POST /api/v1/prompts/refresh` REST endpoint that triggers a force-refresh of the prompts cache. The internal `forceRefresh` plumbing already exists throughout the call chain (`ensureRepository` -> `loadUserPrompts` -> `loadAllPrompts`) but is never exposed to users.

A REST endpoint is the right choice because:
- **No MCP tool needed** — avoids permanently increasing system context sent with every AI request
- **CLI auto-generated** — the dot-ai CLI discovers new endpoints via OpenAPI spec, so `dot-ai prompts refresh` works automatically with no CLI changes
- **Scriptable** — can be called via `curl` or wired to git webhooks for automation

## Key Details

| Property | Value |
|----------|-------|
| **Endpoint** | `POST /api/v1/prompts/refresh` |
| **Auth** | Same as existing endpoints |
| **Response** | Count of refreshed prompts + source info |
| **CLI command** | Auto-generated: `dot-ai prompts refresh` |
| **Existing infra** | `forceRefresh` param already threaded through loader chain |

## Success Criteria

- `POST /api/v1/prompts/refresh` triggers a git pull and cache refresh
- Response includes count of loaded prompts and refresh confirmation
- Endpoint appears in OpenAPI spec (auto-discovered by CLI)
- Integration tests pass

## Milestones

- [x] Add Zod schemas for refresh request/response in `src/interfaces/schemas/prompts.ts`
- [x] Add route definition in `src/interfaces/routes/index.ts` for `POST /api/v1/prompts/refresh`
- [x] Implement REST handler in `src/interfaces/rest-api.ts` that calls `loadAllPrompts` with `forceRefresh: true`
- [x] Integration tests passing for the new endpoint
- [ ] Notify original requester in issue #378 and close it
- [ ] Changelog fragment created

## Technical Notes

- The `forceRefresh` parameter is already accepted by:
  - `ensureRepository()` in `src/core/user-prompts-loader.ts` (line 241)
  - `loadUserPrompts()` in `src/core/user-prompts-loader.ts` (line 276)
  - `loadAllPrompts()` in `src/tools/prompts.ts` (line 232)
- None of the current handlers (MCP or REST) ever invoke these with `forceRefresh = true`
- The route definition pattern uses Zod schemas and auto-generates OpenAPI — follow the existing pattern in `src/interfaces/routes/index.ts`
- Cache state is in-process (`cacheState` variable in user-prompts-loader) — the refresh affects the current pod instance

## Dependencies

- `DOT_AI_USER_PROMPTS_REPO` must be configured for refresh to have effect (endpoint should succeed gracefully without it)

## Risks

| Risk | Mitigation |
|------|-----------|
| Frequent refresh calls causing git rate limiting | Endpoint is user-triggered, not automated by default; document recommended usage |
| Refresh during concurrent prompt reads | Existing loader already handles this — `loadAllPrompts` is async and returns merged results |
| No user prompts repo configured | Return success with message indicating no user prompts repo configured |
