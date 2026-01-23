# PRD 337: Exponential Backoff and Circuit Breaker for LLM API Rate Limits

## Status: Complete
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

Implement a resilience layer focused on the embedding service (the source of the 965 errors in issue #334):

1. **Exponential Backoff**: Leverage Vercel AI SDK's built-in retry with backoff (configurable via `maxRetries`). SDK provides 2 retries with 2s base delay and 2x multiplier by default, and automatically respects `Retry-After` headers.
2. **Circuit Breaker**: After consecutive failures, block requests for a cooldown period before allowing new attempts. This prevents cascading failures when SDK retries are exhausted.

**Deferred (YAGNI)**:
- Rate limit detection: Circuit breaker works on failure counts regardless of error type
- Vercel provider integration: Can be added later if text generation rate limits become a problem

## Technical Context

### Current Retry Implementations

| Component | Location | Current Behavior |
|-----------|----------|------------------|
| ErrorHandler | `src/core/error-handling.ts:390-445` | Simple retry loop, no backoff |
| Embedding generation | `src/core/embedding-service.ts` | No retry, fails immediately |
| Manifest generation | `src/tools/generate-manifests.ts` | Up to 10 retries, no delay |
| Qdrant operations | `src/core/vector-db-service.ts` | No retry, semaphore for concurrency |

### Files to Modify

- **Done**: `src/core/circuit-breaker.ts` - Circuit breaker implementation (Milestone 1 complete)
- **Done**: `src/core/embedding-service.ts` - Wrapped with circuit breaker (Milestone 4 complete)
- **Note**: Vercel SDK handles retry/backoff internally via `maxRetries` config in `embed()`

**Deferred**:
- `src/core/rate-limit-detector.ts` - Not needed; circuit breaker works on failure counts
- `src/core/providers/vercel-provider.ts` - Can add later if text generation rate limits become a problem

## Success Criteria

1. Rate limit errors (429) trigger exponential backoff with appropriate delays
2. Circuit breaker opens after 3 consecutive failures, blocking requests for 30-60s
3. Circuit breaker enters half-open state to test recovery
4. Log noise reduced by 90%+ during rate limit scenarios
5. API budget waste eliminated during sustained rate limit periods
6. Existing functionality unaffected when no rate limits occur
7. ~~Integration tests cover retry, backoff, and circuit breaker behaviors~~ (Deferred - unit tests provide coverage; rate limit scenarios not reproducible)

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
- [~] **Milestone 2**: ~~Add exponential backoff to ErrorHandler retry logic~~ (Reverted - Vercel SDK provides built-in retry)
- [~] **Milestone 3**: ~~Implement rate limit detection~~ (Deferred - circuit breaker works on failure counts; YAGNI)
- [x] **Milestone 4**: Integrate circuit breaker with embedding service
- [~] **Milestone 5**: ~~Integrate circuit breaker with Vercel AI provider layer~~ (Deferred - issue #334 is embeddings-specific)
- [~] **Milestone 6**: ~~Add configuration options (env vars for thresholds, delays)~~ (Deferred - hardcoded defaults sufficient for now; can add if tuning needed)
- [~] **Milestone 7**: ~~Integration tests for circuit breaker scenarios~~ (Deferred - rate limit scenarios not reproducible across providers/subscriptions)
- [~] **Milestone 8**: ~~Documentation for configuration and behavior~~ (Deferred - no configuration to document until M6 is implemented)

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-01-23 | Deferred Milestone 7 (integration tests) - rate limit scenarios depend on provider/subscription and aren't reproducible. Unit tests (37) cover logic; existing integration tests verify normal operation. PRD complete. |
| 2025-01-23 | Deferred Milestones 6 (env var config) and 8 (docs) - hardcoded defaults sufficient, no config to document. Only M7 (integration tests) remains. |
| 2025-01-23 | Milestone 4 complete: Integrated circuit breaker with embedding service. Both generateEmbedding and generateEmbeddings wrapped with circuit breaker. Added getCircuitBreakerStats() for monitoring. |
| 2025-01-23 | Scope narrowed: Focus on embedding service only (source of 965 errors in #334). Deferred Milestone 3 (rate limit detection) and Milestone 5 (Vercel provider) as YAGNI. |
| 2025-01-23 | Design pivot: Reverting Milestone 2 (ErrorHandler backoff) - Vercel SDK provides built-in retry with backoff. Circuit breaker (Milestone 1) retained as it provides unique value SDK lacks. |
| 2025-01-23 | Milestone 2 implemented then reverted: Added exponential backoff to ErrorHandler but found Vercel SDK already provides this |
| 2025-01-23 | Milestone 1 complete: Created circuit breaker module with state machine, unit tests (37 passing), exported from core |
| 2025-01-21 | PRD created based on issue #334 analysis |

---

## Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Per-instance circuit breaker | 2025-01-21 | Multi-instance coordination adds complexity; per-instance is sufficient for most deployments |
| ~~Exponential backoff 1s base~~ | 2025-01-21 | ~~Balances quick recovery with API protection~~ → Superseded by SDK built-in |
| Circuit breaker 30-60s cooldown | 2025-01-21 | Matches typical rate limit reset windows; configurable for different providers |
| Use Vercel SDK built-in retry | 2025-01-23 | SDK already has exponential backoff (2s base, 2x multiplier), `Retry-After` support; avoids redundant double-retry |
| Revert ErrorHandler backoff | 2025-01-23 | Redundant with SDK; only circuit breaker provides unique value not in SDK |
| Circuit breaker wraps SDK calls | 2025-01-23 | Circuit breaker prevents cascading failures across requests; SDK handles individual call retry internally |
| Focus on embedding service only | 2025-01-23 | Issue #334 reports 965 embedding errors specifically; Vercel provider integration deferred until needed |
| Skip rate limit detection | 2025-01-23 | Circuit breaker works on failure counts regardless of error type; rate limit detection is over-engineering for now |
| Defer env var configuration (M6) | 2025-01-23 | Hardcoded defaults (3 failures, 30s cooldown) are reasonable; add configuration only if tuning becomes necessary |
| Defer documentation (M8) | 2025-01-23 | No configuration options to document until M6 is implemented; circuit breaker behavior is self-explanatory |
| Defer integration tests (M7) | 2025-01-23 | Rate limit scenarios depend on provider and subscription tier; not reproducible in CI. Unit tests cover circuit breaker logic; integration tests already verify embeddings work (circuit breaker doesn't break normal operation). |

---

## Open Questions

1. Should circuit breaker state be shared via Redis for multi-instance deployments?
2. What are the specific rate limit windows for each supported provider (OpenAI, Anthropic, Google)?
3. ~~Should we parse `Retry-After` headers when available?~~ → **Resolved**: Vercel SDK automatically parses and respects `Retry-After` and `Retry-After-Ms` headers
4. Should circuit breaker metrics be exposed via OpenTelemetry?
