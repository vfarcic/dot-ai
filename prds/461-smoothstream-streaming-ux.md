# PRD #461: Use smoothStream for Better Streaming UX

## Status: Draft
## Priority: Low
## Created: 2026-04-11
## Depends On: PRD #455 (streamText adoption)

## Problem

If `streamText` is adopted (PRD #455), raw token streaming can feel choppy — tokens arrive in bursts that don't match natural reading pace.

## Solution

Use the Vercel AI SDK's `smoothStream` utility to buffer and release tokens smoothly:

```typescript
const result = streamText({
  model,
  prompt,
  experimental_transform: smoothStream({ chunking: 'word' }),
});
```

Key considerations:
- This PRD is entirely dependent on PRD #455 (streamText adoption)
- If streamText is not adopted, this PRD should be closed
- `smoothStream` supports chunking by word, line, or custom regex
- Adds slight latency in exchange for smoother output
- Only applicable to CLI and REST paths (not MCP)

## Success Criteria

- Streaming output feels natural and smooth
- Configurable chunking strategy
- No meaningful latency increase
- Integration tests pass

## Milestones

- [ ] Wait for PRD #455 decision
- [ ] If streamText adopted: integrate smoothStream with appropriate chunking
- [ ] Test UX improvement with different chunking strategies
- [ ] Integration tests passing
