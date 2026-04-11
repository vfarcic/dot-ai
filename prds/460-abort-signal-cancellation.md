# PRD #460: Add Abort Signal Support for Cancelling Long-Running AI Operations

## Status: Draft
## Priority: Low
## Created: 2026-04-11

## Problem

Long-running agentic loops (up to 20 iterations) cannot be cancelled once started. No `AbortController` usage was found in AI calls. Users must wait for the full operation to complete even if they realize it's going in the wrong direction.

## Solution

Pass `AbortSignal` to `generateText` calls so operations can be cancelled cleanly:

```typescript
const controller = new AbortController();
const result = await generateText({
  model,
  prompt,
  abortSignal: controller.signal,
});
```

Key considerations:
- MCP protocol supports cancellation notifications — wire these to AbortController
- CLI could support Ctrl+C cancellation
- Need graceful cleanup on abort (return partial results, log cancellation)
- Circuit breaker state should not be affected by intentional cancellation

## Success Criteria

- Long-running AI operations can be cancelled via abort signal
- MCP cancellation notifications trigger abort
- Partial results returned gracefully on cancellation
- Integration tests pass

## Milestones

- [ ] Add AbortController plumbing to vercel-provider tool loop
- [ ] Wire MCP cancellation notifications to abort signal
- [ ] Handle graceful cleanup and partial result return on abort
- [ ] Ensure circuit breaker ignores intentional cancellations
- [ ] Integration tests passing
