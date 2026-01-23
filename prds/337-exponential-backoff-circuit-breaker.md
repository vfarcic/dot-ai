# PRD 337: Exponential Backoff and Circuit Breaker for LLM API Rate Limits

## Status: In Progress
## Priority: Medium
## GitHub Issue: #337
## Related Issue: #334

---

## Problem Statement

When rate limits or quota errors hit, dot-ai retries quickly in succession without any backoff, then fails. New requests continue hitting the same rate-limited API, generating hundreds of identical errors (965 identical errors observed in production logs):

```
"error": "Embedding generation failed: openai embedding failed: Failed after 3 attempts. Last error: You exceeded your current quota..."
```

Current issues:
- **No exponential backoff**: Retries happen immediately without delay
- **No circuit breaker**: After repeated failures, new requests keep hitting the same wall
- **No rate limit detection**: 429/quota errors are treated the same as transient errors
- **Log noise**: Hundreds of identical errors flood the logs
- **Wasted API budget**: Repeated calls to rate-limited APIs consume quota unnecessarily

## Solution Overview

Implement a resilience layer with three components:

1. **Exponential Backoff**: Add increasing delays between retry attempts (1s → 2s → 4s → 8s)
2. **Circuit Breaker**: After consecutive failures, block requests for a cooldown period before allowing new attempts
3. **Rate Limit Detection**: Specifically detect 429/quota errors and apply appropriate backoff strategies

## Technical Context

### Current Retry Implementations

| Component | Location | Current Behavior |
|-----------|----------|------------------|
| ErrorHandler | `src/core/error-handling.ts:390-445` | Simple retry loop, no backoff |
| Embedding generation | `src/core/embedding-service.ts` | No retry, fails immediately |
| Manifest generation | `src/tools/generate-manifests.ts` | Up to 10 retries, no delay |
| Qdrant operations | `src/core/vector-db-service.ts` | No retry, semaphore for concurrency |

### Files to Modify

- **New**: `src/core/circuit-breaker.ts` - Circuit breaker implementation
- **Modify**: `src/core/error-handling.ts` - Add exponential backoff to `withErrorHandling()`
- **Modify**: `src/core/embedding-service.ts` - Wrap with retry + circuit breaker
- **Modify**: `src/core/providers/vercel-provider.ts` - Add provider-level circuit breaker

## Success Criteria

1. Rate limit errors (429) trigger exponential backoff with appropriate delays
2. Circuit breaker opens after 3 consecutive failures, blocking requests for 30-60s
3. Circuit breaker enters half-open state to test recovery
4. Log noise reduced by 90%+ during rate limit scenarios
5. API budget waste eliminated during sustained rate limit periods
6. Existing functionality unaffected when no rate limits occur
7. Integration tests cover retry, backoff, and circuit breaker behaviors

## Out of Scope

- Changing LLM provider logic (focus is on resilience layer)
- Request queuing or rate limiting on the client side (proactive limiting)
- Multi-instance coordination (circuit breaker is per-instance)
- Configuration UI (use environment variables)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Backoff too aggressive, slowing normal operations | Only apply backoff on retry, not first attempt |
| Circuit breaker blocks legitimate requests | Half-open state allows testing; configurable thresholds |
| Different providers have different rate limit behaviors | Provider-specific configuration options |
| Breaking existing retry behavior | Comprehensive integration tests before/after |

---

## Milestones

- [x] **Milestone 1**: Create circuit breaker module with open/half-open/closed states
- [x] **Milestone 2**: Add exponential backoff to ErrorHandler retry logic
- [ ] **Milestone 3**: Implement rate limit detection (429 status, quota error messages)
- [ ] **Milestone 4**: Integrate circuit breaker with embedding service
- [ ] **Milestone 5**: Integrate circuit breaker with Vercel AI provider layer
- [ ] **Milestone 6**: Add configuration options (env vars for thresholds, delays)
- [ ] **Milestone 7**: Integration tests for retry, backoff, and circuit breaker scenarios
- [ ] **Milestone 8**: Documentation for configuration and behavior

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-01-23 | Milestone 2 complete: Added exponential backoff to ErrorHandler.withErrorHandling() with BackoffConfig interface, 15 unit tests passing |
| 2025-01-23 | Milestone 1 complete: Created circuit breaker module with state machine, unit tests (37 passing), exported from core |
| 2025-01-21 | PRD created based on issue #334 analysis |

---

## Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Per-instance circuit breaker | 2025-01-21 | Multi-instance coordination adds complexity; per-instance is sufficient for most deployments |
| Exponential backoff 1s base | 2025-01-21 | Balances quick recovery with API protection; 1s → 2s → 4s → 8s provides reasonable progression |
| Circuit breaker 30-60s cooldown | 2025-01-21 | Matches typical rate limit reset windows; configurable for different providers |

---

## Open Questions

1. Should circuit breaker state be shared via Redis for multi-instance deployments?
2. What are the specific rate limit windows for each supported provider (OpenAI, Anthropic, Google)?
3. Should we parse `Retry-After` headers when available?
4. Should circuit breaker metrics be exposed via OpenTelemetry?
