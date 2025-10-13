# PRD: AI Model Comparison for MCP Platform

**Created**: 2025-10-07
**Status**: In Progress - Milestone 1 Complete ✅, Milestone 2 Ready
**Owner**: Viktor Farcic
**Last Updated**: 2025-10-13
**GitHub Issue**: [#151](https://github.com/vfarcic/dot-ai/issues/151)
**Priority**: Medium
**Complexity**: Medium

---

## Executive Summary

Test and compare 6 AI models across ALL MCP platform AI interactions using the existing integration test suite as the data generation method. This research will provide comprehensive performance analysis, reliability assessment, and cost-benefit recommendations based on real-world usage patterns across all MCP tools.

**Methodology**: Run complete integration test suite with each AI model to generate comprehensive comparison data across all AI-powered features.

**Builds on**: [PRD #143 - Tool-Based Remediation Observability](https://github.com/vfarcic/dot-ai/blob/main/prds/143-tool-based-remediation-observability.md) (Extended metrics infrastructure)

---

## Problem Statement

### Current Limitations

**1. Limited Model Testing Scope**
- Only remediation tool tested with multiple models (Claude, GPT-5, Gemini)
- No testing across other AI-powered MCP tools: recommend, answer-question, generate-manifests
- Missing coverage of complete user workflows and interactions

**2. Incomplete Market Coverage**
- Premium segment: Claude, GPT-5 tested for remediation only
- Mid-tier segment: Missing (Mistral Large, xAI Grok-4)  
- Budget segment: Missing (DeepSeek-R1)
- No cross-tool consistency analysis

**3. Limited Real-World Validation**
- Testing focused on single tool (remediation)
- No validation of model performance across diverse AI interaction types
- Missing data on tool-specific model strengths/weaknesses

### Impact

Users must:
- Make AI model decisions without comprehensive platform-wide comparison data
- Risk choosing models that work well for some tools but poorly for others
- Cannot optimize for overall platform cost/performance
- Miss opportunities to use different models for different tool types

---

## Solution Overview

**Integration Test-Based Model Comparison**:

### Testing Strategy
Use existing integration test suite as comprehensive data generation method:
- Tests ALL AI-powered MCP tools in realistic scenarios
- Captures real user workflows and interaction patterns
- Provides consistent testing methodology across tools
- Generates extensive metrics across all AI interactions

### Model Selection (6 Total)
**Premium Tier (Established Leaders)**:
- ✅ Claude Sonnet 4.5 - Current platform recommendation
- ✅ OpenAI GPT-5 - High-cost reference standard

**Mid-Tier (Regional Champions & Challengers)**:
- ✅ xAI Grok-4 (+ Fast-Reasoning variant) - Emerging challenger (Elon Musk's model)
- ⏳ Mistral Large - European champion, cost-effective

**Budget Tier (Disruptors)**:
- ⏳ DeepSeek-R1 - Ultra-low cost, reasoning-focused

**Problematic (Case Study)**:
- ✅ Google Gemini 2.5 Pro - Reliability issues documented (remediation)

### MCP Tools Coverage
All AI-powered tools will be tested:
- **recommend** - Intent analysis and solution recommendations
- **remediate** - Investigation and troubleshooting (already tested)
- **answer-question** - Solution configuration and enhancement
- **generate-manifests** - Kubernetes manifest generation
- **version** - AI provider connectivity testing
- **platform discovery** - Build platform operations discovery

---

## User Journey

### Before (Current State)
```
1. User wants to choose AI model for MCP platform
2. Limited to remediation-specific testing data
3. No understanding of cross-tool performance trade-offs
4. May choose model that works poorly for their primary use cases
5. No platform-wide cost optimization guidance
```

### After (With Comprehensive Testing)
```
1. User reviews model comparison guide with ALL MCP tools tested
2. Sees performance across their specific tool usage patterns
3. Identifies optimal model for their primary workflows
4. Understands cost implications across all interactions
5. Makes informed decision with confidence in overall platform performance
6. Has fallback recommendations for different tool combinations
```

---

## Technical Approach

### Testing Infrastructure (Leverage Existing)
- ✅ Integration test suite covering all MCP tools
- ✅ Extended metrics collection system (Decision 5 from PRD #143)
- ✅ Vercel AI SDK provider supporting multiple models
- ✅ Debug infrastructure for conversation analysis
- ✅ Metrics storage and analysis pipeline

### Integration Test Inventory
Based on codebase analysis, AI-powered tests include:

**Core AI Tools**:
- `tests/integration/tools/recommend.test.ts` - Intent analysis and recommendations
- `tests/integration/tools/remediate.test.ts` - Investigation and troubleshooting  
- `tests/integration/tools/answer-question.test.ts` - Configuration enhancement
- `tests/integration/tools/generate-manifests.test.ts` - Manifest generation
- `tests/integration/tools/version.test.ts` - AI provider connectivity

**Platform Operations**:
- Tests involving build platform discovery
- Solution selection and configuration workflows
- Cross-tool integration scenarios

### Model Integration Requirements

**xAI Grok-4**:
- Package: `@ai-sdk/xai` (needs installation)
- Integration: Add to `PROVIDER_MODELS` in `vercel-provider.ts`
- API Key: `XAI_API_KEY` environment variable

**Mistral Large**:
- Package: `@ai-sdk/mistral` (needs installation)
- Integration: Add to `PROVIDER_MODELS` in `vercel-provider.ts` 
- API Key: `MISTRAL_API_KEY` environment variable

**DeepSeek-R1**:
- Available through OpenAI-compatible API
- Integration: Use existing OpenAI provider with custom endpoint
- Model: `deepseek-reasoner` or `deepseek-r1`

### Testing Protocol

**Phase 1: Test Suite Analysis**
1. Inventory all integration tests using AI interactions
2. Identify test coverage gaps (if any)  
3. Ensure tests capture diverse AI interaction patterns
4. Validate extended metrics collection across all tests

**Phase 2: Model Infrastructure Setup**
1. Install required SDK packages for new models
2. Extend provider configuration for all 6 models
3. Set up API keys and environment configuration
4. Validate basic connectivity for each model

**Phase 3: Comprehensive Testing**
1. Run COMPLETE integration test suite with each of 6 models
2. Capture extended metrics for every AI interaction
3. Document failure modes and edge cases per tool
4. Save comprehensive baseline data for analysis

**Phase 4: Analysis & Recommendations**
1. Analyze metrics across all 6 models and all tools
2. Identify tool-specific model performance patterns
3. Create decision matrix for different use case priorities
4. Document platform-wide recommendations and trade-offs

---

## Success Criteria

### Testing Completion
- [ ] All 6 models integrated and tested across complete integration suite
- [ ] Extended metrics captured for every AI interaction across all tools
- [ ] Reliability assessment completed for each model-tool combination
- [ ] Performance comparison analysis across all MCP AI features

### Analysis & Documentation
- [ ] Model comparison guide covering all MCP AI interactions
- [ ] Tool-specific model recommendations (if patterns emerge)
- [ ] Platform-wide cost optimization guide
- [ ] Implementation instructions for all supported models

### Quality Assurance
- [ ] All model configurations validated across all AI tools
- [ ] Test results reproducible and comprehensive
- [ ] Failure modes documented per model-tool combination
- [ ] Cost estimates for different usage patterns

---

## Milestones

### Milestone 1: Test Suite Analysis & Infrastructure Setup
**Goal**: Prepare comprehensive testing infrastructure

**Tasks**:
- [x] Inventory all integration tests using AI interactions ✅
- [x] Install required AI SDK packages - `@ai-sdk/xai` completed ✅
- [x] Install `@ai-sdk/mistral` package ✅
- [x] Extend `vercel-provider.ts` to support xAI models ✅
- [x] Extend `vercel-provider.ts` to support Mistral ✅
- [x] Extend `vercel-provider.ts` to support DeepSeek ✅
- [x] Set up API keys and environment configuration for xAI ✅
- [x] Set up API keys and environment configuration for Mistral ✅
- [x] Set up API keys for DeepSeek ✅
- [x] Validate basic connectivity for xAI Grok models ✅
- [x] Validate basic connectivity for Mistral Large ✅
- [x] Validate basic connectivity for DeepSeek ✅

**Success Criteria**: All 6 models integrated with infrastructure setup complete ✅

**CRITICAL DISCOVERY**: DeepSeek R1 model lacks tool calling support and cannot participate in MCP tool-based workflows. Integration infrastructure complete but model unsuitable for comprehensive testing.

### Milestone 2: Complete Model Testing (All 6 Models × All AI Tools)
**Goal**: Generate comprehensive dataset across all AI interactions

**Tasks**:
- [ ] Run complete integration test suite with Claude Sonnet 4.5 (baseline)
- [ ] Run complete integration test suite with OpenAI GPT-5
- [ ] Run complete integration test suite with Google Gemini 2.5 Pro
- [x] Run remediation integration tests with xAI Grok-4 ✅
- [x] Run remediation integration tests with xAI Grok-4-Fast-Reasoning ✅
- [ ] Run complete integration test suite with xAI models (other tools pending)
- [ ] Run complete integration test suite with Mistral Large
- [x] Attempted integration test suite with DeepSeek-R1 ⚠️ (Model limitation discovered)
- [x] Capture and store extended metrics for xAI remediation tests ✅
- [ ] Capture metrics for remaining model-tool combinations

**Success Criteria**: Complete metrics dataset for **5 working models** across all AI-powered MCP tools

**SCOPE ADJUSTMENT**: DeepSeek R1 excluded from tool-based testing due to lack of function calling support

### Milestone 3: Comprehensive Analysis
**Goal**: Extract insights from complete testing data

**Tasks**:
- [ ] Analyze performance patterns across all model-tool combinations
- [ ] Identify tool-specific model strengths and weaknesses
- [ ] Calculate cost implications for different usage patterns
- [ ] Document reliability and consistency patterns
- [ ] Create decision framework for model selection

**Success Criteria**: Clear insights into optimal model choices for different use cases

### Milestone 4: Documentation & Recommendations
**Goal**: Create user-facing guidance based on comprehensive testing

**Tasks**:
- [ ] Create platform-wide model selection guide
- [ ] Document tool-specific recommendations (if applicable)
- [ ] Update MCP documentation with model configuration options
- [ ] Publish comprehensive comparison analysis
- [ ] Archive baseline data for future reference

**Success Criteria**: Public documentation with actionable model selection guidance

---

## Dependencies

### External Dependencies
- [ ] API access to xAI Grok-4 (API key required)
- [x] API access to Mistral Large ✅ 
- [ ] API access to DeepSeek-R1 (API key required)
- [x] NPM packages: `@ai-sdk/xai`, `@ai-sdk/mistral` ✅

### Internal Dependencies
- [x] Extended metrics collection system (Decision 5, PRD #143) ✅
- [x] Vercel AI SDK provider (Milestone 2.5, PRD #143) ✅
- [x] Complete integration test suite ✅
- [x] Debug infrastructure and metrics storage ✅

### Potential Blockers
- API rate limits across extensive testing
- Cost constraints for running complete suite 6 times
- Model availability or API changes during testing

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Extensive testing exceeds API cost budgets | High | Monitor usage, implement test batching, use smaller test subsets for validation |
| New models fail consistently across tools | Medium | Document failures, focus on working models, treat failures as valuable data |
| Test suite runtime becomes prohibitive | Medium | Parallel execution, selective test running, optimize test efficiency |
| Model behavior inconsistent between test runs | Medium | Multiple runs for statistical significance, version pinning |
| Integration test coverage insufficient | Low | Add missing tests if gaps identified, focus on existing comprehensive coverage |

---

## Open Questions

1. **Test Execution Strategy**: Serial vs parallel model testing to manage costs and time?
2. **Statistical Significance**: How many test runs per model needed for reliable data?
3. **Cost Management**: What budget exists for comprehensive testing across 6 models?
4. **Tool-Specific Optimization**: Should we allow different models for different tools?
5. **Baseline Comparison**: Use current production model as baseline across all tests?

---

## Out of Scope

### Deferred to Future Work
- [ ] Tool-specific model optimization
- [ ] Automated model selection based on interaction type
- [ ] Custom model endpoints beyond standard APIs
- [ ] Integration with non-Vercel AI SDK providers

### Explicitly Not Included
- Model fine-tuning or customization
- Testing with different prompt strategies per model
- Performance optimization for specific model-tool combinations
- Real-time model switching during operations

---

## Decision Log

### Decision 1: DeepSeek R1 Exclusion from Tool-Based Testing (2025-10-13)

**Context**: Completed DeepSeek R1 integration infrastructure and attempted remediation testing

**Discovery**: DeepSeek R1 model fundamentally lacks tool/function calling support
- Returns generic error messages instead of executing Kubernetes investigation tools
- Zero tool calls executed despite proper integration setup
- Confirmed by external research: DeepSeek reasoner models do not support function calling

**Decision**: Exclude DeepSeek R1 from comprehensive tool-based MCP testing
- **Rationale**: Cannot provide meaningful comparison data for tool-based workflows
- **Scope Impact**: Testing focus shifts to 5 working models instead of 6
- **Value Preserved**: DeepSeek integration serves as valuable negative result for evaluation

**Implementation**: 
- Mark DeepSeek infrastructure setup as complete
- Document limitation in success criteria
- Update testing scope to reflect 5-model comparison

---

## Work Log

### 2025-10-07: PRD Creation
**Duration**: Initial planning session
**Status**: Draft

**Context**:
- Started with remediation-specific model testing scope
- Expanded to full MCP platform coverage based on user feedback
- Integration test-based approach chosen for comprehensive real-world validation

**Key Insight**: Using integration tests as data generation method provides:
- Comprehensive coverage of ALL AI interactions
- Realistic usage patterns and workflows
- Consistent testing methodology
- Extensive metrics across diverse tool types

**Scope Defined**:
- 6 models × Complete integration test suite = comprehensive comparison data
- Focus on platform-wide recommendations rather than tool-specific optimization
- Leverage existing testing infrastructure from PRD #143

**Next Steps**: Begin Milestone 1 - Test suite analysis and model infrastructure setup

### 2025-10-13: xAI Model Integration and Comparative Analysis Complete
**Duration**: ~4 hours (based on conversation timeline)
**Commits**: Multiple implementation commits
**Primary Focus**: Complete xAI Grok model integration and remediation testing

**Completed PRD Items**:
- [x] xAI package installation and integration - Evidence: @ai-sdk/xai package, provider configuration
- [x] Both Grok model variants tested - Evidence: grok-4 and grok-4-fast-reasoning both pass all remediation tests
- [x] Extended metrics collection - Evidence: Debug logging captures comprehensive performance data
- [x] First comparative analysis complete - Evidence: Detailed evaluation report generated

**Additional Work Done**:
- Fixed debug logging timing to capture raw AI responses before processing
- Simplified dataset filename generation using direct modelVersion
- Added Google Gemini 2.5 Flash as google_fast variant  
- Created npm test targets for new models (test:integration:grok, test:integration:grok-fast)
- Renamed existing dataset files to match new naming convention
- Refactored provider code to eliminate duplication

**Key Findings from xAI Comparative Analysis**:
- **Grok-4-Fast-Reasoning**: Excels in automatic workflows (0.92 score), 2.5x execution speed
- **Grok-4**: Superior for manual workflows (0.847 avg), more resource efficient, thorough analysis
- Both models production-ready with distinct strengths for different use cases
- Performance gap significant for time-sensitive troubleshooting scenarios

**Technical Infrastructure Improvements**:
- Debug logging now captures raw responses immediately after generation
- Dataset filename generation uses modelVersion directly (eliminates 'unknown' in filenames)
- AI provider factory recognizes all new model variants
- Comprehensive test coverage with proper timeout handling

**Next Session Priorities**:
- Integrate DeepSeek-R1 model (Mistral Large completed)
- Expand testing beyond remediation to other MCP tools (recommend, answer-question, generate-manifests)
- Begin cross-tool comparative analysis once more models integrated
- Complete Milestone 1 with DeepSeek integration

### 2025-10-13: Mistral Large Integration Complete
**Duration**: ~4 hours implementation session
**Primary Focus**: Complete Mistral Large model integration for PRD-151

**Completed PRD Items**:
- [x] Install `@ai-sdk/mistral` package - Evidence: package.json, npm install successful
- [x] Extend `vercel-provider.ts` to support Mistral - Evidence: createMistral() integration, SUPPORTED_PROVIDERS array
- [x] Set up API keys and environment configuration for Mistral - Evidence: PROVIDER_ENV_KEYS mapping, environment setup
- [x] Validate basic connectivity for Mistral Large - Evidence: Integration tests executed, debug datasets generated
- [x] API access to Mistral Large - Evidence: Working API key, successful authentication
- [x] NPM packages installation complete - Evidence: Both @ai-sdk/xai and @ai-sdk/mistral installed

**Technical Implementation Achievements**:
- Centralized provider configuration using CURRENT_MODELS dynamic approach
- Enhanced ai-provider-factory.ts with automatic provider list generation from model config
- Added npm test script `test:integration:mistral` for evaluation workflows
- Implemented step limit optimization (20→30) for thorough investigation models
- Created comprehensive debug logging and dataset generation infrastructure

**Architecture Improvements Made**:
- Eliminated hardcoded provider lists in favor of single source of truth (model-config.ts)
- Unified provider validation logic across vercel-provider.ts and ai-provider-factory.ts
- Enhanced debug infrastructure with immediate raw response capture
- Improved dataset filename generation using direct modelVersion identification

**Milestone 1 Status**: 75% complete (6/8 items) - Mistral fully integrated, DeepSeek-R1 pending

**Next Session Priority**: DeepSeek-R1 integration to complete Milestone 1 infrastructure setup

### 2025-10-13: DeepSeek R1 Integration Complete & Critical Model Limitation Discovery
**Duration**: ~3 hours implementation and analysis session
**Primary Focus**: Complete DeepSeek R1 model integration and investigate tool calling compatibility

**Completed PRD Items**:
- [x] Extend `vercel-provider.ts` to support DeepSeek - Evidence: OpenAI-compatible API integration added
- [x] Set up API keys for DeepSeek - Evidence: `DEEPSEEK_API_KEY` environment configuration working
- [x] Validate basic connectivity for DeepSeek - Evidence: API connectivity confirmed via direct testing
- [x] Attempted integration test suite with DeepSeek-R1 - Evidence: Test execution completed, datasets generated

**Technical Implementation Achievements**:
- Added `deepseek: 'deepseek-reasoner'` to model configuration
- Extended VercelProvider with DeepSeek case using OpenAI-compatible API (`https://api.deepseek.com/v1`)
- Created `npm run test:integration:deepseek` test script
- Enhanced error logging system to capture actual AI response content during JSON parsing failures
- Cleaned up dead code in AI provider factory (removed unused switch cases and factory methods)

**Critical Discovery - Model Limitation**:
- **Issue**: DeepSeek R1 fundamentally lacks tool/function calling support
- **Evidence**: Returns "Error during investigation: Not Found" instead of using Kubernetes tools
- **Research Confirmation**: External sources confirm DeepSeek reasoner models don't support function calling
- **Impact**: Cannot participate in tool-based MCP workflows (remediation, recommendation, etc.)

**Milestone 1 Status**: **COMPLETE** ✅ (11/11 items) - All infrastructure setup finished

**Architecture Improvements Made**:
- Eliminated redundant provider factory code paths
- Enhanced error handling with actual response content logging
- Streamlined provider configuration using centralized model config
- Improved debugging capabilities for future AI model integrations

**Next Session Priorities**:
- Focus Milestone 2 testing on 5 working models (Claude, GPT, Gemini, xAI, Mistral)
- Begin comprehensive cross-tool testing with working models
- Generate comparative analysis excluding DeepSeek from tool-based workflows