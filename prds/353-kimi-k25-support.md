# PRD #353: Update to Kimi K2.5 Model Support

**Status: Deferred** - Blocked on Vercel AI SDK compatibility issues with tool calling.

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
kimi: 'kimi-k2.5', // Single model - thinking mode is default (NOT kimi-k2.5-preview)
```

**Note**: K2.5 is a single model (`kimi-k2.5`) with thinking mode enabled by default. There is no separate `kimi-k2.5-thinking` variant - modes are controlled via API parameters, not model names.

### Required Changes

- `model-config.ts` - Update model name to `kimi-k2.5`
- `vercel-provider.ts` - Switch from `@ai-sdk/openai` to `@ai-sdk/openai-compatible` (see Investigation Notes)
- Remove `kimi_thinking` provider - no longer needed

### No Changes Required

- `ai-provider-factory.ts` - Same `MOONSHOT_API_KEY` env var
- API endpoint remains `https://api.moonshot.ai/v1`

## Milestones

- [ ] **Milestone 1**: Update model names in `model-config.ts`
- [ ] **Milestone 2**: Verify build succeeds
- [ ] **Milestone 3**: Run integration tests against Kimi K2.5
- [ ] **Milestone 4**: Update documentation to reflect K2.5

## Implementation Notes

### Kimi K2.5 Model

K2.5 is a **single model** (`kimi-k2.5`) with 256K context. Thinking mode is enabled by default.

| Aspect | Value |
|--------|-------|
| Model Name | `kimi-k2.5` |
| Context Window | 256K tokens |
| Default Mode | Thinking (includes `reasoning_content`) |
| Architecture | 1T params total, 32B active (MoE) |

**Note**: Instant vs Thinking modes are controlled via API parameters (`extra_body`), not separate model names. We use the default thinking mode.

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

---

## Investigation Notes (January 2026)

### What Works

- **Correct model name**: `kimi-k2.5` (NOT `kimi-k2.5-preview` as documented elsewhere)
- **Simple chat** (`sendMessage`): Works correctly
- **Direct API tool calling**: Works when properly formatted (tested via curl)
- **114 of 135 integration tests pass** with simple operations

### What Doesn't Work

**Vercel AI SDK tool loops fail with two errors:**

#### 1. `ROLE_UNSPECIFIED` Error
```
"invalid request: unsupported role ROLE_UNSPECIFIED"
```
- **Cause**: Vercel AI SDK sends messages with empty/null/missing `role` fields during tool loops
- **Reproduced**: Sending `{"role": "", "content": "..."}` to Moonshot API returns this error
- **Affects**: 5+ tests in query.test.ts

#### 2. Missing `reasoning_content` Error
```
"thinking is enabled but reasoning_content is missing in assistant tool call message"
```
- **Cause**: Kimi K2.5 with thinking mode (default) requires `reasoning_content` in assistant messages containing tool calls
- **Reproduced**: Multi-turn tool calling without `reasoning_content` fails; with it, succeeds
- **Root cause**: Vercel AI SDK's `@ai-sdk/openai` provider doesn't preserve `reasoning_content` in conversation history

### Recommended Fix

1. **Switch provider**: Use `@ai-sdk/openai-compatible` instead of `@ai-sdk/openai`
   - Version 2.0.20 includes fix: "include reasoning_content in assistant messages for multi-turn tool calls"

2. **File Vercel issue** for `ROLE_UNSPECIFIED` bug (empty role in messages)

3. **Increase timeouts** for thinking-mode responses (slower due to reasoning)

### Related Vercel AI SDK Issues

- [#11682](https://github.com/vercel/ai/issues/11682) - `reasoning_content` not parsed (closed, use `openai-compatible`)
- [#11342](https://github.com/vercel/ai/issues/11342) - Provider-specific fields lost in multi-turn conversations
- [#5576](https://github.com/vercel/ai/issues/5576) - Empty text content blocks with tool calling
- [#3593](https://github.com/vercel/ai/discussions/3593) - Empty messages during tool calls

### Related Kimi/Moonshot Issues

- [strands-agents #1150](https://github.com/strands-agents/sdk-python/issues/1150) - `invalid part type: thinking` in multi-turn
- [instructor #1925](https://github.com/567-labs/instructor/issues/1925) - Server error with `tools`/`tool_choice` params
- [Kimi-K2 #41](https://github.com/MoonshotAI/Kimi-K2/issues/41) - Empty `tool_calls` at low temperature

### Test Results Summary

| Category | Count | Notes |
|----------|-------|-------|
| Tests Passed | 114 | Simple operations work |
| Tests Failed | 21 | Tool calling / agentic workflows |
| `ROLE_UNSPECIFIED` | 5 | SDK sends empty role |
| Server crashes/timeouts | 9 | `socket hang up`, `ECONNREFUSED` |
| Other assertion failures | 7 | Downstream effects |

### Conclusion

Kimi K2.5 **partially works** for simple chat operations but **fails for agentic tool-calling workflows** due to Vercel AI SDK incompatibilities. Recommend deferring until:
1. Vercel fixes `ROLE_UNSPECIFIED` issue
2. We migrate to `@ai-sdk/openai-compatible` and retest
