# PRD #464: Use MockLanguageModelV1 for Unit Testing AI Interactions

**Status: Complete**
**Completion Date**: 2026-07-28
**GitHub Issue**: [#464](https://github.com/vfarcic/dot-ai/issues/464)
**Priority**: Low
**Created**: 2026-04-11

## Problem

Testing AI provider logic currently requires real API calls via integration tests. The Vercel AI SDK provides `MockLanguageModelV1` and `simulateReadableStream` for deterministic unit tests without API calls, enabling:
- Faster test execution
- No API key requirements for unit tests
- Deterministic, reproducible test results
- Testing error paths and edge cases that are hard to trigger with real APIs

## Solution

Use SDK testing utilities to add unit test coverage for AI provider logic:

```typescript
import { MockLanguageModelV1 } from 'ai/test';

const model = new MockLanguageModelV1({
  doGenerate: async () => ({
    text: 'mocked response',
    // ...
  }),
});
```

Key considerations:
- Complements, does not replace, existing integration tests
- Most valuable for testing provider-layer logic (error handling, retry behavior, response processing)
- Mock fidelity — mocks may not catch provider-specific quirks
- Should focus on logic that's hard to test via integration tests

## Success Criteria

- Unit tests added for key provider-layer logic
- Tests run without API keys
- Fast execution (part of `npm run test:unit`)
- Integration tests still provide end-to-end coverage

## Milestones

- [x] Identify provider-layer logic that benefits from unit testing
- [x] Set up MockLanguageModelV1 test infrastructure
- [x] Write unit tests for error handling, response processing, and edge cases
- [x] Ensure unit tests run as part of `npm run test:unit`
- [x] Integration tests still passing

## Outcome

Delivered by @nicknikolakakis across three PRs:

- [#493](https://github.com/vfarcic/dot-ai/pull/493) — `tests/unit/core/providers/_helpers/mock-language-model.ts` plus happy-path coverage for `VercelProvider.sendMessage`
- [#572](https://github.com/vfarcic/dot-ai/pull/572) — `sendMessage` error paths (rate-limit, auth, network), verifying the `<provider> API error:` wrapping preserves the original on `cause`
- [#574](https://github.com/vfarcic/dot-ai/pull/574) — `toolLoop` coverage: tool-call dispatch, ordered multi-call iteration, and unknown-tool handling

Note: the SDK renamed the utility between the PRD being written and implemented — `ai@^6` exports `MockLanguageModelV3`, not `MockLanguageModelV1`. The examples above reflect the original V1 API; the shipped tests use V3.

The helper became the default pattern for provider unit tests rather than a one-off. It is imported by four test files, prompted a sibling in `tests/unit/core/_helpers/mock-embedding-model.ts` ([#494](https://github.com/vfarcic/dot-ai/pull/494)), and was picked up independently for `vercel-provider.bedrock.test.ts` in [#698](https://github.com/vfarcic/dot-ai/pull/698).

Two proposed follow-up slices were never started and are ordinary coverage backlog, not blockers: unit tests for `src/core/providers/provider-debug-utils.ts`, and an OpenAI-provider mirror of the Vercel coverage.
