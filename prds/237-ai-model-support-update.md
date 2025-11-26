# PRD #237: AI Model Support Update

**Status**: Draft
**Created**: 2025-11-27
**GitHub Issue**: [#237](https://github.com/vfarcic/dot-ai/issues/237)
**Priority**: High

---

## Problem Statement

The current AI model lineup is outdated and includes models that are no longer the best options for our use cases. Additionally, the documentation contains subjective opinions about model comparisons rather than objective factual information.

### Current State

| Provider | Current Models |
|----------|----------------|
| Anthropic | claude-sonnet-4-5, claude-haiku-4-5 |
| OpenAI | gpt-5, gpt-5-pro |
| Google | gemini-2.5-pro, gemini-2.5-flash |
| xAI | grok-4, grok-4-fast-reasoning |
| Mistral | mistral-large-latest |
| DeepSeek | deepseek-reasoner |

### Issues

1. **Missing newer models**: Claude Opus 4.5 and Kimi K2 series are not supported
2. **Outdated OpenAI models**: GPT-5.1 Codex variants are now available
3. **Outdated Google models**: Gemini 3 series has been released
4. **Low-value models**: xAI Fast Reasoning, Mistral, and DeepSeek don't provide sufficient differentiation
5. **Opinionated documentation**: Current docs include subjective analysis about which models are better

---

## Solution Overview

Update the AI model support through incremental changes, each validated by running integration tests. Clean up documentation to be factual and alphabetically organized.

### Target State

| Provider | Models After Update |
|----------|---------------------|
| Anthropic | claude-opus-4-5, claude-sonnet-4-5, claude-haiku-4-5 |
| Google | gemini-3, gemini-3-pro |
| Kimi (Moonshot AI) | kimi-k2, kimi-k2-thinking |
| OpenAI | gpt-5.1-codex, gpt-5.1-codex-max |
| xAI | grok-4 |

### Changes Summary

| Action | Details |
|--------|---------|
| **Add** | Claude Opus 4.5, Kimi K2, Kimi K2 Thinking |
| **Replace** | GPT-5 → GPT-5.1 Codex, GPT-5 Pro → GPT-5.1 Codex Max |
| **Replace** | Gemini 2.5 Pro/Flash → Gemini 3/Gemini 3 Pro |
| **Remove** | xAI Fast Reasoning, Mistral, DeepSeek |

---

## User Stories

### Primary User Stories

1. **As a user**, I want access to Claude Opus 4.5 so I can use Anthropic's most capable model for complex tasks
   - **Acceptance**: Can set `AI_PROVIDER=anthropic AI_MODEL=claude-opus-4-5-*` and get valid responses

2. **As a user**, I want access to Kimi K2 models so I can leverage Moonshot AI's capabilities, especially for agentic tasks
   - **Acceptance**: Can set `AI_PROVIDER=kimi` and use both K2 and K2 Thinking models

3. **As a user**, I want access to GPT-5.1 Codex models so I can use OpenAI's latest code-optimized models
   - **Acceptance**: Can set `AI_PROVIDER=openai` and use GPT-5.1 Codex variants

4. **As a user**, I want access to Gemini 3 models so I can use Google's latest generation
   - **Acceptance**: Can set `AI_PROVIDER=google` and use Gemini 3 variants

5. **As a user**, I want documentation that lists available models factually without subjective recommendations
   - **Acceptance**: Model documentation is alphabetically organized with factual descriptions only

---

## Technical Approach

### Implementation Strategy

Each model change will be implemented incrementally:
1. Update code (model-config.ts, provider files)
2. Run integration tests to validate
3. Update documentation
4. Commit and move to next model

### Key Files to Modify

- `src/core/model-config.ts` - Central model configuration
- `src/core/providers/vercel-provider.ts` - Provider implementations
- `src/core/ai-provider-factory.ts` - Provider factory
- `docs/` - Documentation updates

### Kimi K2 Integration Notes

Kimi K2 uses an OpenAI-compatible API hosted at `https://api.moonshot.cn/v1`. Integration approach:
- Use Vercel AI SDK's OpenAI-compatible provider with custom base URL
- Environment variables: `MOONSHOT_API_KEY`
- Models: `moonshot-v1-128k` (K2) and thinking variant

---

## Milestones

### Milestone 1: Add Claude Opus 4.5
**Goal**: Add Anthropic's most capable model alongside existing Sonnet and Haiku

**Success Criteria**:
- [ ] Add `anthropic_opus` to model-config.ts with correct model ID
- [ ] Update provider to support Opus selection
- [ ] Integration tests pass with Opus model
- [ ] Documentation updated

### Milestone 2: Replace GPT-5 with GPT-5.1 Codex Models
**Goal**: Update OpenAI support to GPT-5.1 Codex and GPT-5.1 Codex Max

**Success Criteria**:
- [ ] Replace `gpt-5` with `gpt-5.1-codex` in model-config.ts
- [ ] Replace `gpt-5-pro` with `gpt-5.1-codex-max`
- [ ] Update any references in provider code
- [ ] Integration tests pass with new models
- [ ] Documentation updated

### Milestone 3: Remove xAI Fast Reasoning, Mistral, DeepSeek
**Goal**: Remove providers that don't provide sufficient value

**Success Criteria**:
- [ ] Remove `xai_fast` from model-config.ts (keep `xai` with grok-4)
- [ ] Remove `mistral` configuration and provider code
- [ ] Remove `deepseek` configuration and provider code
- [ ] Clean up any unused dependencies
- [ ] Integration tests pass
- [ ] Documentation updated to remove references

### Milestone 4: Replace Gemini Models with Gemini 3 Series
**Goal**: Update Google support to Gemini 3 and Gemini 3 Pro

**Success Criteria**:
- [ ] Replace `gemini-2.5-pro` with `gemini-3-pro`
- [ ] Replace `gemini-2.5-flash` with `gemini-3`
- [ ] Integration tests pass with new models
- [ ] Documentation updated

### Milestone 5: Add Kimi K2 and Kimi K2 Thinking
**Goal**: Add Moonshot AI's Kimi K2 series models

**Success Criteria**:
- [ ] Add Kimi provider configuration to model-config.ts
- [ ] Implement Kimi provider using OpenAI-compatible endpoint
- [ ] Support both K2 (standard) and K2 Thinking models
- [ ] Add `MOONSHOT_API_KEY` environment variable support
- [ ] Integration tests pass with Kimi models
- [ ] Documentation updated

### Milestone 6: Documentation Cleanup
**Goal**: Remove opinions and organize alphabetically

**Success Criteria**:
- [ ] Remove all subjective comparisons ("better for X", "recommended for Y")
- [ ] Organize model listings alphabetically by provider
- [ ] Each model has factual description only (capabilities, context length, etc.)
- [ ] Documentation reviewed for completeness

---

## Success Criteria

### Functional Success
- [ ] All new models (Opus 4.5, Kimi K2, Kimi K2 Thinking) working and tested
- [ ] All replaced models (GPT-5.1 Codex, Gemini 3) working and tested
- [ ] All removed models cleanly removed from codebase
- [ ] Integration tests pass for all remaining providers

### Documentation Success
- [ ] No subjective opinions in model documentation
- [ ] All models listed alphabetically
- [ ] Factual information only (model IDs, context lengths, capabilities)

---

## Risks and Mitigations

### Risk 1: Model API Changes
**Risk**: New model versions may have different API behaviors

**Mitigation**:
- Test each model change with integration tests before committing
- Verify API compatibility with Vercel AI SDK

**Severity**: Medium
**Likelihood**: Low

### Risk 2: Kimi API Availability
**Risk**: Moonshot AI API may have regional restrictions or availability issues

**Mitigation**:
- Research API availability before implementation
- Document any regional requirements
- Consider graceful fallback if API unavailable

**Severity**: Medium
**Likelihood**: Medium

### Risk 3: Breaking Changes for Users
**Risk**: Users relying on removed models (Mistral, DeepSeek) will lose access

**Mitigation**:
- Document removed models in release notes
- Provide migration guidance to alternative providers

**Severity**: Low
**Likelihood**: Low

---

## Dependencies

### External Dependencies
- Vercel AI SDK support for all target models
- Moonshot AI API access for Kimi models
- Valid API keys for testing each provider

### Internal Dependencies
- None (can proceed independently)

---

## References

- **Kimi K2 Documentation**: https://moonshotai.github.io/Kimi-K2/
- **Moonshot AI Platform**: https://platform.moonshot.ai/
- **Current Model Config**: `src/core/model-config.ts`

---

## Progress Log

### 2025-11-27 - PRD Created
- Initial PRD draft created
- Defined 6 major milestones for incremental implementation
- Research confirmed Kimi K2 as latest Moonshot AI model
- Identified files requiring modification
