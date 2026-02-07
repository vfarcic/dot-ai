# PRD #369: Update OpenAI Model to GPT-5.3-Codex

**Status: Pending** - Blocked on OpenAI enabling API access for GPT-5.3-Codex (expected within weeks of Feb 5, 2026 release).

## Problem Statement

The codebase currently uses `gpt-5.1-codex` as the default OpenAI model. OpenAI has released GPT-5.3-Codex on February 5, 2026, with significant improvements:

- 25% faster than GPT-5.2-Codex
- State-of-the-art on SWE-Bench Pro and Terminal-Bench 2.0
- Advanced agentic coding capabilities
- First model that was instrumental in creating itself (self-improving)

However, API access for GPT-5.3-Codex is **not yet available**. OpenAI is delaying full developer access due to cybersecurity concerns (first model rated "high" on their Preparedness Framework). API access is expected "in the coming weeks."

The recommended interim model is `gpt-5.2-codex`, which is already available via API.

## Solution Overview

Update the OpenAI model configuration from `gpt-5.1-codex` to `gpt-5.3-codex` once API access is enabled. This is a minimal change:

- Same API endpoint and authentication (`OPENAI_API_KEY`)
- Same OpenAI-compatible API format
- Single line change in `src/core/model-config.ts`

## Success Criteria

1. Model name updated to `gpt-5.3-codex` in `model-config.ts` (both `openai` and `custom` entries)
2. Build succeeds without errors
3. Integration tests pass with `npm run test:integration:gpt`
4. Documentation updated in `docs/setup/mcp-setup.md`

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
openai: 'gpt-5.3-codex',
custom: 'gpt-5.3-codex',
```

### Files to Update

- `src/core/model-config.ts` - Update model names (2 entries)
- `docs/setup/mcp-setup.md` - Update model name in Available Models table

### No Changes Required

- `ai-provider-factory.ts` - Same `OPENAI_API_KEY` env var
- `vercel-provider.ts` - Same provider logic
- API endpoint unchanged

## Milestones

- [ ] **Milestone 1**: Confirm GPT-5.3-Codex API access is enabled (check OpenAI status/changelog)
- [ ] **Milestone 2**: Update model names in `model-config.ts`
- [ ] **Milestone 3**: Run integration tests with `npm run test:integration:gpt`
- [ ] **Milestone 4**: Update documentation to reflect GPT-5.3-Codex
- [ ] **Milestone 5**: Verify version tool reports correct model name

## Risk Assessment

**Low Risk Implementation:**
- No infrastructure changes required
- Same API endpoint and authentication
- Backward compatible (no breaking changes to env vars or configuration)
- Existing integration tests will validate the model works

**Potential Issues:**
- API access may be further delayed by OpenAI's cybersecurity review
- GPT-5.3-Codex may have different behavior on complex agentic workflows due to new capabilities
- OpenAI may gate certain features behind a "trusted access" program

## Interim Option

If GPT-5.3-Codex API access is significantly delayed, consider updating to `gpt-5.2-codex` as an intermediate step:
- Already available via API
- Improvement over `gpt-5.1-codex`
- Same minimal change process

## References

- [Introducing GPT-5.3-Codex - OpenAI](https://openai.com/index/introducing-gpt-5-3-codex/)
- [Codex Models - OpenAI Developers](https://developers.openai.com/codex/models/)
- [GPT-5.3-Codex System Card](https://openai.com/index/gpt-5-3-codex-system-card/)
- [Codex Changelog](https://developers.openai.com/codex/changelog/)

---

## Action Required

**Monitor for API availability:** Check the [Codex Changelog](https://developers.openai.com/codex/changelog/) periodically for GPT-5.3-Codex API access announcement. Once available, this PRD can be implemented in a single session.
