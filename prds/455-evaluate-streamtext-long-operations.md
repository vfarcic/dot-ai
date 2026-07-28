# PRD #455: Evaluate streamText for Long-Running Operations (REST/CLI)

## Status: Draft
## Priority: Medium
## Created: 2026-04-11
## Updated: 2026-07-28

## Problem

All AI generation uses blocking `generateText`. For long multi-step agentic loops (up to 20 iterations), users get no feedback until the entire operation completes. This can mean minutes of silence.

On the **REST** path there is no mechanism to surface anything mid-call: `src/interfaces/rest-api.ts:872` invokes the tool handler and races it against a hard `requestTimeout`, returning a single JSON body. Behind a proxy with an idle timeout, a long call is dropped exactly as described in [#704](https://github.com/vfarcic/dot-ai/discussions/704) — and unlike MCP, there is no out-of-band channel to keep it warm.

On the **CLI** path, step-by-step output would be a straightforward UX improvement.

## Scope correction (2026-07-28)

This PRD originally carried the constraint:

> **MCP does not support streaming tool responses** — tool results are single-shot, so this won't help MCP clients

The first clause is correct; the conclusion drawn from it was not. Tool *results* are single-shot over MCP, but `notifications/progress` is an **out-of-band base-protocol utility** — a separate JSON-RPC notification correlated by an opaque token, entirely independent of how the AI call is made. It works fine wrapping a blocking `generateText`.

Result-streaming and progress signalling are different mechanisms. Treating them as one is what scoped the applicable fix out of #704's problem space. Raised by @FlorianGerdes in [#704](https://github.com/vfarcic/dot-ai/discussions/704).

**MCP progress is now tracked in #705.** This PRD covers REST/CLI token streaming only.

## Solution

Evaluate where `streamText` with `onStepFinish` could provide real-time progress for CLI and REST API paths.

Key constraints:
- CLI path could benefit from step-by-step progress output
- REST API path would need a streaming response mode (SSE or chunked) — a larger change than the MCP case, since `rest-api.ts:872` is single-shot by construction
- MCP is covered separately by #705 and is **not** a reason to skip this work, but also no longer depends on it
- Need to assess whether the architectural changes are worth it for the REST/CLI paths on their own merits

## Success Criteria

- Clear assessment of which access paths benefit from streaming
- If adopted: real-time progress visible during multi-step operations via CLI/REST
- No regression for the MCP path
- Integration tests pass

## Milestones

- [ ] Assess which access paths (CLI, REST) can benefit from streaming
- [ ] Prototype `streamText` with `onStepFinish` in the tool loop
- [ ] Evaluate UX improvement vs. implementation complexity
- [ ] Decide go/no-go based on prototype findings
- [ ] If go: implement streaming for applicable access paths
- [ ] Integration tests passing
