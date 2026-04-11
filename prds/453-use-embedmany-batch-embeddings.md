# PRD #453: Use embedMany for Batch Embeddings

## Status: Draft
## Priority: High
## Created: 2026-04-11

## Problem

In `src/core/embedding-service.ts`, batch embedding generation uses a manual `Promise.all` over individual `embed()` calls:

```typescript
const results = await Promise.all(
  validTexts.map(text => embed({ model: this.modelInstance!, value: text }))
);
```

The Vercel AI SDK provides `embedMany` which handles batching and chunking automatically. Using individual calls means:
- Provider-level batching optimizations are missed
- More boilerplate code than necessary
- No automatic chunking for large input sets

## Solution

Replace the `Promise.all` + `embed()` pattern with `embedMany`:

```typescript
const { embeddings } = await embedMany({
  model: this.modelInstance!,
  values: validTexts,
});
```

Key considerations:
- Preserve Google-specific `providerOptions` (outputDimensionality, taskType)
- Maintain circuit breaker wrapping
- Maintain OpenTelemetry tracing integration
- Verify behavior with all supported embedding providers (OpenAI, Google, Bedrock)

## Success Criteria

- Batch embeddings use `embedMany` instead of manual `Promise.all`
- All embedding providers still work correctly
- Circuit breaker and tracing still function
- Integration tests pass

## Milestones

- [ ] Replace `Promise.all` + `embed()` with `embedMany` in embedding-service.ts
- [ ] Verify provider-specific options (Google outputDimensionality) work with embedMany
- [ ] Verify circuit breaker and tracing integration
- [ ] Integration tests passing for all embedding providers
