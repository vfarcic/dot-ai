# PRD #456: Add AI SDK Middleware for Cross-Cutting Concerns

## Status: Draft
## Priority: Low
## Created: 2026-04-11

## Problem

Telemetry, logging, prompt augmentation, and other cross-cutting concerns are implemented as custom wrapper code scattered across the provider layer (vercel-provider.ts, ai-tracing.ts, provider-debug-utils.ts). This makes the provider code complex and mixes concerns.

## Solution

Use the Vercel AI SDK's middleware system (`wrapGenerate`/`wrapStream`) to centralize cross-cutting concerns into composable middleware layers:
- **Telemetry middleware** — automatic span creation without wrapping every call
- **Guardrails middleware** — input/output validation
- **RAG middleware** — inject retrieved context into prompts
- **Logging/debug middleware** — centralized debug logging

Key considerations:
- Middleware is still `experimental_` prefixed in the SDK — API may change
- Current custom tracing captures metrics the SDK middleware might not
- Need to assess whether middleware composition simplifies or complicates the code
- This is a significant refactor — should be evaluated carefully

## Success Criteria

- Cross-cutting concerns extracted into composable middleware
- Provider code simplified and focused on core AI interactions
- No loss of current telemetry, logging, or caching capabilities
- Integration tests pass

## Milestones

- [ ] Audit current cross-cutting concerns in provider layer
- [ ] Prototype one middleware (e.g., logging) to validate the pattern
- [ ] Evaluate complexity reduction vs. migration effort
- [ ] Decide go/no-go based on prototype findings
- [ ] If go: migrate remaining concerns to middleware
- [ ] Integration tests passing
