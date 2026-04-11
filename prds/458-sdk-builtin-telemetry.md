# PRD #458: Use SDK Built-in Telemetry for AI Operation Tracing

## Status: Draft
## Priority: Medium
## Created: 2026-04-11

## Problem

Custom OpenTelemetry tracing code in `src/core/tracing/ai-tracing.ts` manually wraps every AI call with `withAITracing`. The Vercel AI SDK has built-in `experimental_telemetry` that automatically creates spans with GenAI semantic conventions, potentially reducing custom code.

## Solution

Evaluate replacing custom tracing with the SDK's `experimental_telemetry` parameter:

```typescript
const result = await generateText({
  model,
  prompt,
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'tool-loop',
    metadata: { provider: 'anthropic' },
  },
});
```

Key considerations:
- Current custom tracing captures: cache tokens, embedding dimensions, embedding count, duration
- SDK telemetry captures: model ID, provider, prompt/completion tokens, finish reason
- Gap analysis needed — some custom metrics may not be available via SDK telemetry
- Could use SDK telemetry as base and supplement with custom spans for missing metrics
- `experimental_` prefix means API may change

## Success Criteria

- Clear gap analysis between SDK telemetry and current custom tracing
- If adopted: reduced custom tracing code with no loss of critical metrics
- OpenTelemetry spans still follow GenAI semantic conventions
- Integration tests pass

## Milestones

- [ ] Gap analysis: compare SDK telemetry output vs. current custom tracing metrics
- [ ] Prototype SDK telemetry alongside current tracing to compare output
- [ ] Decide: full replacement, hybrid approach, or keep current
- [ ] Implement chosen approach
- [ ] Integration tests passing
