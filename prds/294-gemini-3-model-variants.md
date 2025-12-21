# PRD #294: Add Gemini 3 Model Variants Support

## Overview

**Status**: Draft
**Priority**: Medium
**Created**: 2025-12-21
**GitHub Issue**: [#294](https://github.com/vfarcic/dot-ai/issues/294)

## Problem Statement

Users currently only have access to Gemini 3 Pro (`google` provider) but lack access to other Gemini 3 variants that offer different trade-offs:
- **Gemini 3 Flash**: Faster response times, lower cost, same 1M context
- **Thinking configurations**: Control reasoning depth vs speed/cost

## Solution

Add Gemini 3 variants iteratively: implement one variant, run all tests, document based on results, then proceed to the next.

## Gemini 3 Model Specifications

| Variant | Model ID | Input Context | Output Limit | Thinking Levels |
|---------|----------|---------------|--------------|-----------------|
| Pro (existing) | `gemini-3-pro-preview` | 1,048,576 | 65,536 | low, high |
| Flash | `gemini-3-flash-preview` | 1,048,576 | 65,536 | minimal, low, medium, high |

**Pricing** (Gemini 3 Flash): $0.50/1M input, $3/1M output

## Proposed Provider Names

| Provider Name | Model | Thinking Level | Use Case |
|---------------|-------|----------------|----------|
| `google` | gemini-3-pro-preview | high (default) | Existing - complex reasoning |
| `google_flash` | gemini-3-flash-preview | high (default) | Fast + smart - balanced |
| `google_flash_fast` | gemini-3-flash-preview | minimal | Maximum speed, simple tasks |

## Implementation Approach

**Iterative process for each variant:**
1. Add to `model-config.ts`
2. Add case to `vercel-provider.ts`
3. Run full integration test suite
4. Document results (pass/fail, any issues)
5. Update `docs/setup/mcp-setup.md` if tests pass
6. Proceed to next variant

## Success Criteria

- [ ] Each new provider works with existing functionality
- [ ] Integration tests pass for each variant
- [ ] Documentation accurately describes each option
- [ ] Thinking level configuration works correctly (if implemented)

## Milestones

### Milestone 1: Gemini 3 Flash (google_flash)
- [ ] Add `google_flash: 'gemini-3-flash-preview'` to `CURRENT_MODELS`
- [ ] Add `google_flash` case to `vercel-provider.ts`
- [ ] Run integration tests
- [ ] Document results and update docs if successful

### Milestone 2: Gemini 3 Flash Fast (google_flash_fast)
- [ ] Research Vercel AI SDK support for `thinking_level` parameter
- [ ] Add `google_flash_fast` with minimal thinking configuration
- [ ] Run integration tests
- [ ] Document results and update docs if successful

### Milestone 3: Documentation & Cleanup
- [ ] Final documentation review
- [ ] Update CLAUDE.md if needed
- [ ] Verify all variants work end-to-end

## Technical Notes

### Thinking Level Configuration

Gemini 3 uses `thinking_config` in generation config:
```python
thinking_config=ThinkingConfig(thinking_level="minimal")
```

Need to verify Vercel AI SDK (`@ai-sdk/google`) support for this parameter.

### API Key

All Gemini 3 variants use the same `GOOGLE_GENERATIVE_AI_API_KEY`.

## Out of Scope

- Gemini 2.5 models
- Gemini 3 Pro Image (`gemini-3-pro-image-preview`)
- Custom Gemini endpoint support
- Per-request thinking level configuration

## Dependencies

- Existing `@ai-sdk/google` package
- `GOOGLE_GENERATIVE_AI_API_KEY` environment variable

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Models still in preview | Medium | Low | Document preview status; monitor for GA |
| Vercel SDK lacks thinking_level support | Medium | Medium | Skip fast variant or implement workaround |
| API behavior differences between variants | Low | Medium | Test each variant thoroughly |

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-21 | PRD created with iterative implementation approach |

## Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Iterative implementation | 2025-12-21 | Test each variant before proceeding; reduces risk |
| Start with `google_flash` | 2025-12-21 | Most straightforward - same config as existing `google` |
| Share API key across variants | 2025-12-21 | Same Google AI API; reduces configuration burden |
