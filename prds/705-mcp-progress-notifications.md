# PRD #705: MCP Progress Notifications for Long-Running Tools

## Status

Draft

## Problem

When dot-ai runs as a remote MCP server behind a load balancer, `recommend` calls fail on the client with a timeout even though the server completes the work successfully. Reported in [discussion #704](https://github.com/vfarcic/dot-ai/discussions/704) with a concrete case: a ~150s `recommend` against an AWS ALB, freezing at "Generating configuration options" and never returning.

Two things combine:

1. **dot-ai emits nothing for the duration of a tool call.** There is no progress signalling of any kind — grepping `src/` and `packages/` for `notifications/progress`, `progressToken`, and `sendNotification` returns zero hits.
2. **Any proxy or LB with an idle timeout closes the connection.** A long request that is genuinely working but sending no bytes is indistinguishable from a hung one.

Raising the LB idle timeout only moves the goalpost — there is no correct timeout for an operation whose duration depends on the intent.

### Root cause (verified against the code)

**The longest silent window is a serial per-solution AI loop.** `src/core/schema.ts:857-865`:

```ts
// Phase 3: Generate questions for each capability-based solution
for (const solution of solutionResult.solutions) {
  solution.questions = await this.generateQuestionsWithAI(...);
}
```

Each iteration is a full LLM round-trip (`schema.ts:1447`). With 3-5 solutions that is 3-5 sequential generations with zero bytes out — matching the reported freeze at the "generating configuration options" step.

`recommend`'s other AI phases are also single blocking calls: solution assembly/ranking at `schema.ts:891`, Helm chart selection at `src/tools/recommend.ts:390`, Helm question generation at `schema.ts:1627`.

### Why a per-step heartbeat in the agentic loop does not fix this

Discussion #704 proposes hooking the provider's agentic loop so every AI step emits a heartbeat. **That would not fix the reported bug.**

All of `recommend`'s AI phases call `aiProvider.sendMessage()`, which at `src/core/providers/vercel-provider.ts:415` is a bare single-shot `generateText`. It **never enters `toolLoop()`** (`vercel-provider.ts:587`) and has no steps to hook. `toolLoop` is used only by `query` (`src/tools/query.ts:287`), `remediate` (`src/tools/remediate.ts:335`), `operate` (`src/tools/operate-analysis.ts:257`), `impact-analysis` (`src/tools/impact-analysis.ts:211`), and two REST paths (`src/interfaces/rest-api.ts:2689,3541`).

The silence is **wall-clock silence, not step silence**. A step-driven heartbeat covers the agentic tools and leaves `recommend` — the tool that was actually reported — exactly as broken as before. The heartbeat must be time-driven.

### Why PRD #455 ruled this out incorrectly

[#455](https://github.com/vfarcic/dot-ai/issues/455) states *"MCP does not support streaming tool responses — tool results are single-shot, so this won't help MCP clients"* and scopes MCP out.

The first half is true; the conclusion does not follow. `notifications/progress` is a base-protocol MCP utility that is **out-of-band** from the tool result — a separate JSON-RPC notification correlated by an opaque token. The `tools/call` response still arrives once, at the end, unchanged. Result-streaming and progress signalling are different mechanisms, and #455 conflated them, which is what pushed the applicable fix out of scope. #455 is being rescoped to REST/CLI token streaming; see the cross-reference there.

## Solution

Emit MCP `notifications/progress` for the duration of every MCP tool call, driven by a **time-based** heartbeat rather than per-step hooks.

### Mechanism

The client opts in by sending `_meta.progressToken` on the call. `progressToken` lives on `BaseRequestParams._meta` (`@modelcontextprotocol/sdk` `types.d.ts:47-49`), so it applies to `tools/call` like any other request:

```jsonc
// client → server
{"method":"tools/call","params":{"name":"recommend","_meta":{"progressToken":42}}}
// server → client, any number of these, mid-flight
{"method":"notifications/progress","params":{"progressToken":42,"progress":3,"total":5,"message":"Generating configuration options…"}}
// server → client, the normal single-shot result, unchanged
{"id":7,"result":{"content":[...]}}
```

### Why no transport work is needed

`src/interfaces/mcp.ts:856` already sets `enableJsonResponse: false`, so responses go out over SSE and the stream stays open for the duration of the call. Notifications flow down that same connection — which is exactly what stops the LB from seeing an idle socket. No transport change.

### Where the code goes

`registerMcpTool` (`src/interfaces/mcp.ts:262-303`) currently discards the MCP SDK's `extra` argument, which carries `sendNotification` (`protocol.d.ts:207`) and `_meta.progressToken`. That is the entire gap.

Capture `extra` there, extend the existing request-scoped `AsyncLocalStorage` (`src/interfaces/request-context.ts:16`, already run around MCP requests at `mcp.ts:776`) to carry a progress emitter, start an interval, and clear it in a `finally`.

This is tool-agnostic by construction: it covers `recommend`'s blocking `sendMessage` phases, every `toolLoop` tool, **and** non-AI stalls (capability vector search at `schema.ts:798`, knowledge search at `schema.ts:1089`, ArtifactHub fetches, kubectl discovery).

Semantic phase labels layer on top of the same channel where they are cheap — the heartbeat guarantees liveness, labels make it legible.

### Non-negotiables

- **No-op without a `progressToken`.** REST calls and clients that do not opt in must be entirely unaffected. This is the common case, not an edge case.
- **A failed notification never aborts the work.** Emit failures are logged and swallowed.
- **The final result is unchanged.** Progress is additive; no change to any tool's response shape.

## Known limitation: the client timeout is a second, independent ceiling

Progress notifications fix the LB unconditionally. They fix the *client* hang only for clients that opt into extending their own deadline.

The MCP SDK defaults to `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000` (`protocol.d.ts:57`) and only extends it on progress when the caller sets `resetTimeoutOnProgress` (`protocol.d.ts:83`) — with `maxTotalTimeout` (`protocol.d.ts:89`) capping it regardless.

This must be verified against the target clients before the work is called done, or we ship heartbeats and still see timeouts. Documenting the required client configuration is part of the deliverable.

## Scope

**In scope**

1. Progress emitter bound into `requestContext` (`src/interfaces/request-context.ts`), populated from `extra` in `registerMcpTool` (`src/interfaces/mcp.ts:262-303`).
2. Time-based heartbeat with a configurable interval (default ~20s), started/stopped per MCP tool call.
3. Semantic phase labels for `recommend` at the natural boundaries in `findBestSolutions` (`src/core/schema.ts:765`): capability search, knowledge search, solution assembly/ranking, question generation (with `progress`/`total` across the per-solution loop), Helm chart selection.
4. Integration tests: token present → notifications observed during a long call; token absent → byte-identical behavior to today.
5. Documentation of the client-side `resetTimeoutOnProgress` requirement.

**Out of scope**

- **REST path.** `src/interfaces/rest-api.ts:872` is single-shot JSON behind a hard `requestTimeout` with no notification channel. Same ALB exposure, not fixable this way — that belongs to the rescoped #455.
- **`streamText` / token streaming.** Different mechanism, different paths, tracked in #455.
- **Abort/cancellation.** [#460](https://github.com/vfarcic/dot-ai/issues/460) wants the same ALS context and sequences naturally after this, but is separate work.
- **Changing LB/proxy configuration.** Infrastructure concern; the point of this PRD is to stop depending on it.

**Deliberately deferred (candidate follow-up)**

- Parallelizing the `schema.ts:857` question-generation loop with `Promise.all`. This attacks the duration rather than the silence and would cut the worst window by roughly N×. It is orthogonal to progress reporting, needs its own thinking about provider rate limits and concurrency, and should not ride along with a liveness fix.

## Success Criteria

- A `recommend` call that takes longer than the LB idle timeout completes successfully end to end through a proxy, instead of the client seeing a dropped connection.
- Notifications are emitted during the `schema.ts:857` question-generation loop specifically — the reported freeze point.
- All `toolLoop` tools (`query`, `remediate`, `operate`, `impact-analysis`) get the same liveness for free, with no per-tool wiring.
- Clients that do not send a `progressToken`, and all REST callers, are unaffected.
- A notification failure never fails a tool call.
- `npm run test:integration` green.

## Milestones

- [ ] **M1 — Progress plumbing.** Extend `RequestContext` with a progress emitter; capture `extra` in `registerMcpTool` and populate it; no-op when `_meta.progressToken` is absent. Emit failures logged, never thrown.
- [ ] **M2 — Time-based heartbeat.** Interval-driven emitter started/stopped per MCP tool call with `finally` cleanup; configurable interval. Verify no timer leaks across concurrent sessions and on error paths.
- [ ] **M3 — Semantic phases for `recommend`.** Phase labels at the `findBestSolutions` boundaries, including `progress`/`total` across the per-solution loop.
- [ ] **M4 — Tests.** Integration coverage for both the opt-in and no-token paths; assert the no-token path is unchanged. `npm run test:integration` green.
- [ ] **M5 — Client verification and docs.** Confirm `resetTimeoutOnProgress` behavior against the clients we care about; document required client config and the LB interaction. Changelog fragment in `changelog.d/`.

## Open questions

1. **Heartbeat interval.** ~20s (as used in the reporter's fork) is comfortably inside a 60s ALB default. Configurable, or fixed?
2. **Heartbeat vs. phase labels when both apply.** Should a phase label reset the heartbeat timer, or do both channels emit independently?
3. **Which clients must be verified** for `resetTimeoutOnProgress` before this is considered done?
4. **Should the `progress`/`total` counters be meaningful** (monotonic across known phases) or is `message`-only sufficient? Meaningful counters need a phase count known up front, which the Helm branch makes conditional.
