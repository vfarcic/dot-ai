# PRD #353: Update to Kimi K2.5 Model Support

## Problem Statement

The codebase currently uses Kimi K2 models (`kimi-k2-0905-preview` and `kimi-k2-thinking`) but Moonshot AI has released Kimi K2.5 in January 2026 with significant improvements:

- 1T parameters (32B active) MoE architecture
- Native multimodality with visual coding capabilities
- Agent swarm support (up to 100 specialized agents, 1,500 simultaneous tool calls)
- Improved benchmarks: 76.8% SWE-Bench Verified, 85.0% LiveCodeBench v6
- State-of-the-art web navigation (60.2% BrowseComp)

Users should have access to the latest model capabilities.

## Solution Overview

Update the model configuration to use Kimi K2.5 model names. This is a minimal change since Kimi K2.5 uses the same:
- API endpoint: `https://api.moonshot.ai/v1`
- Authentication: `MOONSHOT_API_KEY` environment variable
- OpenAI-compatible API format

## Success Criteria

1. Model names updated from K2 to K2.5 in configuration
2. Build succeeds without errors
3. Integration tests pass with Kimi K2.5 models
4. Version tool reports correct model names

## Technical Details

### Current Implementation (to be updated)

**File: `src/core/model-config.ts`**
```typescript
kimi: 'kimi-k2-0905-preview',
kimi_thinking: 'kimi-k2-thinking',
```

### New Implementation

**File: `src/core/model-config.ts`**
```typescript
kimi: 'kimi-k2.5-preview',
kimi_thinking: 'kimi-k2.5-thinking',
```

### No Changes Required

- `ai-provider-factory.ts` - Same `MOONSHOT_API_KEY` env var
- `vercel-provider.ts` - Same API endpoint (`https://api.moonshot.ai/v1`)
- `package.json` - Test scripts already exist (`test:integration:kimi`)

## Milestones

- [ ] **Milestone 1**: Update model names in `model-config.ts`
- [ ] **Milestone 2**: Verify build succeeds
- [ ] **Milestone 3**: Run integration tests against Kimi K2.5
- [ ] **Milestone 4**: Update documentation to reflect K2.5

## Implementation Notes

### Kimi K2.5 Modes

| Mode | Model Name | Recommended Temp | Notes |
|------|------------|------------------|-------|
| Instant | `kimi-k2.5-preview` | 0.6 | Direct responses without reasoning traces |
| Thinking | `kimi-k2.5-thinking` | 1.0 | Includes `reasoning_content` in response |

### Pricing (Reference)

- Input: $0.60/M tokens
- Output: $3.00/M tokens

## References

- [OpenRouter - Kimi K2.5](https://openrouter.ai/moonshotai/kimi-k2.5)
- [Together AI - Kimi K2.5](https://www.together.ai/models/kimi-k2-5)
- [HuggingFace - Kimi K2.5](https://huggingface.co/moonshotai/Kimi-K2.5)
- [Moonshot AI Platform](https://platform.moonshot.ai/)

## Risk Assessment

**Low Risk Implementation:**
- No infrastructure changes required
- Same API endpoint and authentication
- Backward compatible (no breaking changes to env vars or configuration)
- Existing tests will validate the model names work

**Potential Issue:**
- If Moonshot AI model names differ from documented, API errors will occur during testing
