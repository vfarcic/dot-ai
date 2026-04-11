# PRD #454: Use generateObject for Structured AI Responses

## Status: Draft
## Priority: Medium
## Created: 2026-04-11

## Problem

When structured output is needed from AI (e.g., remediation steps, recommendations, deployment decisions), the codebase uses `generateText` and then manually parses free-text responses. This approach is:
- Fragile — parsing can fail on unexpected formats
- Verbose — requires custom validation logic
- Untyped — no compile-time guarantees on response shape

## Solution

Use the Vercel AI SDK's `generateObject` with Zod schemas to get type-safe, validated structured responses directly from the model. The SDK constrains the model to produce valid output matching the schema.

Key considerations:
- Identify call sites where structured output is parsed from free-text
- Define Zod schemas for expected response shapes
- `generateObject` may not work with all providers equally — test across providers
- Some responses are genuinely free-text and should remain as `generateText`
- Consider `streamObject` for cases where partial results could improve UX

## Success Criteria

- Identified call sites benefit from structured output
- Zod schemas defined for structured response types
- `generateObject` used where appropriate, with proper error handling
- Works across supported providers
- Integration tests pass

## Milestones

- [ ] Audit codebase to identify call sites that parse structured data from free-text AI responses
- [ ] Define Zod schemas for the most impactful structured response types
- [ ] Replace identified call sites with `generateObject` usage
- [ ] Test across multiple AI providers for compatibility
- [ ] Integration tests passing
