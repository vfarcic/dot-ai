# PRD #459: Configure SDK Retry Behavior per Provider and Operation

## Status: Draft
## Priority: Low
## Created: 2026-04-11

## Problem

No explicit retry configuration exists for AI API calls. The Vercel AI SDK defaults to 2 retries (3 total attempts) with exponential backoff and jitter, but this one-size-fits-all approach may not be optimal:
- Embedding calls to a flaky provider might benefit from more retries
- Interactive chat calls should fail fast rather than make users wait
- Some providers may have different rate limit behaviors

## Solution

Configure `maxRetries` per operation type and potentially per provider:
- Embeddings: higher retry count (resilience over speed)
- Interactive chat: lower retry count (responsiveness over resilience)
- Tool loops: moderate retry count per step

Key considerations:
- Default SDK behavior (2 retries) may already be adequate for most cases
- Over-retrying can mask underlying issues
- Should be configurable via environment variables or provider config
- Assess whether retry-related failures are actually occurring before investing

## Success Criteria

- Retry behavior explicitly configured where it matters
- No silent over-retrying that masks issues
- Configuration is tunable
- Integration tests pass

## Milestones

- [ ] Audit current failure patterns to determine if retries are actually needed
- [ ] Configure `maxRetries` for embeddings, chat, and tool loop operations
- [ ] Add environment variable override for retry configuration
- [ ] Integration tests passing
