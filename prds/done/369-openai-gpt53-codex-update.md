# PRD #369: Update OpenAI Model to GPT-5.4

**Status: Complete**

## Problem Statement

The codebase currently uses `gpt-5.1-codex` as the default OpenAI model. OpenAI released GPT-5.4 on March 5, 2026, their most capable general-purpose model:

- Incorporates GPT-5.3-Codex coding capabilities into a general-purpose model
- 33% fewer factual errors vs GPT-5.2
- More token-efficient reasoning (fewer tokens to solve problems)
- 1M+ token context window (1,050,000 tokens)
- Native computer-use capabilities
- $2.50/1M input tokens, $15.00/1M output tokens

GPT-5.4 is available via API now. The previous Codex-specific model line (gpt-5.1-codex, gpt-5.2-codex, gpt-5.3-codex) has been superseded — GPT-5.4 absorbs the Codex coding capabilities into the main model.

## Solution Overview

Update the OpenAI model configuration from `gpt-5.1-codex` to `gpt-5.4`. This is a minimal change:

- Same API endpoint and authentication (`OPENAI_API_KEY`)
- Same OpenAI-compatible API format
- Single line change in `src/core/model-config.ts`

## Success Criteria

1. Model name updated to `gpt-5.4` in `model-config.ts` (both `openai` and `custom` entries)
2. Build succeeds without errors
3. Integration tests pass with `npm run test:integration:gpt`
4. Documentation updated in `docs/ai-engine/setup/deployment.md`

## Technical Details

### Current Implementation

**File: `src/core/model-config.ts`**
```typescript
openai: 'gpt-5.1-codex',
custom: 'gpt-5.1-codex',
```

### New Implementation

**File: `src/core/model-config.ts`**
```typescript
openai: 'gpt-5.4',
custom: 'gpt-5.4',
```

### Available GPT-5.4 Variants

| Model ID | Description | Context Window |
|----------|-------------|----------------|
| `gpt-5.4` | Most capable general-purpose model | 1,050,000 tokens |
| `gpt-5.4-pro` | Smarter, more precise responses (higher cost) | 1,050,000 tokens |

### Files to Update

- `src/core/model-config.ts` - Update model names (2 entries)
- `docs/ai-engine/setup/deployment.md` - Update model name in Available Models table

### No Changes Required

- `ai-provider-factory.ts` - Same `OPENAI_API_KEY` env var
- `vercel-provider.ts` - Same provider logic
- API endpoint unchanged

## Milestones

- [x] **Milestone 1**: Update model names in `model-config.ts` to `gpt-5.4`
- [x] **Milestone 2**: Run integration tests with `npm run test:integration`
- [x] **Milestone 3**: Update documentation to reflect GPT-5.4
- [x] **Milestone 4**: Verify version tool reports correct model name

## Risk Assessment

**Low Risk Implementation:**
- No infrastructure changes required
- Same API endpoint and authentication
- Backward compatible (no breaking changes to env vars or configuration)
- Existing integration tests will validate the model works

**Potential Issues:**
- GPT-5.4 is a general-purpose model vs the previous Codex-specific models — verify coding-focused tasks still perform well
- Pricing change: GPT-5.4 may have different cost profile than gpt-5.1-codex
- Token-efficient reasoning may produce different output formats

## References

- [Introducing GPT-5.4 - OpenAI](https://openai.com/index/introducing-gpt-5-4/)
- [GPT-5.4 Model - OpenAI API](https://developers.openai.com/api/docs/models/gpt-5.4)
- [OpenAI Models - API Docs](https://developers.openai.com/api/docs/models)
