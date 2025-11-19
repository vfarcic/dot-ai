# PRD: AI Model Comparison Testing - Model Portfolio Management

**Status**: Draft
**Created**: 2025-11-08
**Last Updated**: 2025-11-19
**GitHub Issue**: [#209](https://github.com/vfarcic/dot-ai/issues/209)
**Priority**: Medium

## Problem Statement

The DevOps AI Toolkit performs comprehensive comparative evaluation across multiple AI models to identify the best models for different Kubernetes operations (remediation, deployment recommendations, capability analysis, pattern recognition, and policy compliance).

We need to maintain a curated portfolio of ~10 diverse AI models and track changes as new models emerge and older models become less relevant.

## Solution Overview

This PRD serves as a living document tracking which AI models are currently being tested in our comparative evaluation framework. Implementation details (pricing, API access, configuration) are determined at test time.

## Current Model Portfolio

### Active Models (10)

| # | Provider | Model Name | API Model ID | Status |
|---|----------|------------|--------------|--------|
| 1 | Anthropic | Claude Sonnet 4.5 | claude-sonnet-4-5-20250929 | Active |
| 2 | Anthropic | Claude Haiku 4.5 | claude-haiku-4-5-20251001 | Active |
| 3 | OpenAI | GPT-5 | gpt-5 | Active |
| 4 | OpenAI | GPT-5 Pro | gpt-5-pro | Active |
| 5 | Google | Gemini 3 Pro | gemini-3-pro-preview (thinkingLevel: high) | Active |
| 6 | Google | Gemini 3 Pro (Fast) | gemini-3-pro-preview (thinkingLevel: low) | Active |
| 7 | xAI | Grok 4 | grok-4 | Active |
| 8 | xAI | Grok 4 Fast Reasoning | grok-4-fast-reasoning | Active |
| 9 | Mistral | Mistral Large | mistral-large-latest | **Pending Removal** |
| 10 | DeepSeek | DeepSeek Reasoner | deepseek-reasoner | Active |

### Pending Changes

**To Remove:**
- Mistral Large

**To Add:**
- Kimi K2 Thinking (MoonshotAI)

## Success Criteria

✅ **Portfolio Maintained**: Always maintain ~10 active models for comparison
✅ **Provider Diversity**: Represent at least 5 different AI providers
✅ **Documented Changes**: All additions/removals documented in change history
✅ **Evaluation Coverage**: All models tested across all 5 evaluation tools

## Implementation Milestones

### Milestone 0: Model Version Verification
- [ ] Research and verify current API model identifiers for all 10 models
- [ ] Update model-config.ts with latest model versions
- [ ] Verify API access for all models (especially GPT-5-Codex and Kimi K2)
- [ ] Update integration tests with new model identifiers
- [ ] Document any model version changes

### Milestone 1: Kimi K2 Thinking Integration
- [ ] Replace Mistral with Kimi K2 Thinking in codebase
- [ ] Run integration tests with new model
- [ ] Generate comparative evaluation datasets
- [ ] Update documentation

### Milestone 2: Production Ready
- [ ] All tests passing with updated portfolio
- [ ] Documentation current
- [ ] Changes committed and pushed

## Change History

### 2025-11-19: Gemini 2.5 → Gemini 3 Upgrade
- **Rationale**: Gemini 3 released with state-of-the-art reasoning and multimodal capabilities
  - Just released (November 18, 2025) - Google's most intelligent model
  - State-of-the-art reasoning across all major AI benchmarks
  - Advanced agentic capabilities and improved multimodal understanding
  - Single model (`gemini-3-pro-preview`) with configurable thinking depth
- **Implementation Strategy**: Test both thinking configurations
  - **Gemini 3 Pro** (thinkingLevel: "high") - Maximum reasoning depth (replaces Gemini 2.5 Pro)
  - **Gemini 3 Pro (Fast)** (thinkingLevel: "low") - Optimized for speed/cost (replaces Gemini 2.5 Flash)
- **Trade-off**: No separate "Flash" model yet, but thinking levels provide similar speed/cost optimization
- **API Details**:
  - Model: `gemini-3-pro-preview`
  - Parameter: `thinkingLevel` ("low" | "high")
  - Pricing: $2/million input tokens, $12/million output tokens (≤200K context)
  - Note: Cannot fully disable thinking; only adjust intensity

### 2025-11-16: GPT-5 Pro → GPT-5-Codex Replacement
- **Rationale**: GPT-5-Codex is better suited for infrastructure-as-code tasks
  - Optimized for code generation, refactoring, and review
  - Larger context window (400K tokens) at lower cost
  - Trained on real-world engineering tasks including complex refactoring
  - Better fit for Kubernetes manifests, operators, and CRD generation
- **Trade-off**: Specialized coding capability vs general reasoning (acceptable for our use case)
- **Status**: Documented but not yet implemented in model-config.ts

### 2025-11-08: Portfolio Established
- **Initial Portfolio**: 10 models across 6 providers documented
- **Pending**: Mistral Large → Kimi K2 Thinking replacement

### Future Changes
*(Changes will be documented here as they occur)*

## References

- [Model Comparison PRD #151](prds/151-ai-model-comparison-mcp-platform.md) - Original comparative evaluation framework
- [Integration Test Standards](tests/integration/CLAUDE.md)

---

**Next Steps**: Implement Mistral → Kimi K2 Thinking replacement when ready.
