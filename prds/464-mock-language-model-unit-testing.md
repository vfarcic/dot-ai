# PRD #464: Use MockLanguageModelV1 for Unit Testing AI Interactions

## Status: Draft
## Priority: Low
## Created: 2026-04-11

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

- [ ] Identify provider-layer logic that benefits from unit testing
- [ ] Set up MockLanguageModelV1 test infrastructure
- [ ] Write unit tests for error handling, response processing, and edge cases
- [ ] Ensure unit tests run as part of `npm run test:unit`
- [ ] Integration tests still passing
