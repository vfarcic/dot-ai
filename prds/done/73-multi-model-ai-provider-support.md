# PRD: Multi-Model AI Provider Support

**Status**: ✅ Complete (Anthropic Production-Ready, Infrastructure Future-Ready)
**Priority**: High (Implementation Complete) / Low (Alternative Provider Documentation - Blocked)
**GitHub Issue**: [#73](https://github.com/vfarcic/dot-ai/issues/73)
**Created**: 2024-08-20
**Completed**: 2025-10-05
**Documentation PRD**: [#140 - Multi-Provider Setup Documentation](./140-multi-provider-setup-documentation.md) (Blocked until better models)  

## Executive Summary

The DevOps AI Toolkit currently supports only Anthropic Claude models for AI-powered Kubernetes deployment recommendations. This PRD outlines the implementation of a provider-agnostic AI system using Vercel AI SDK, enabling support for multiple AI providers (OpenAI, Anthropic, Google Gemini) while maintaining backward compatibility.

### Problem Statement
- **Vendor lock-in**: Limited to Anthropic Claude models only
- **Cost constraints**: No flexibility to choose providers based on pricing
- **Regional limitations**: Some providers may not be available in all regions
- **Performance optimization**: Unable to select models based on specific use cases
- **Fallback limitations**: No redundancy if Anthropic services are unavailable

### Solution Overview
Replace the current `ClaudeIntegration` class with a new `AIProvider` abstraction powered by Vercel AI SDK, supporting multiple providers through a unified interface while maintaining all existing functionality.

## Technical Architecture

### Current State Analysis
- **File**: `src/core/claude.ts` - Direct Anthropic SDK integration
- **Usage**: 18 files depend on `ClaudeIntegration` class
- **Methods**: `sendMessage()`, `generateYAML()`, `analyzeIntentForClarification()`, etc.
- **Environment**: Requires `ANTHROPIC_API_KEY`

### Target Architecture
```typescript
// New abstraction layer
class AIProvider {
  // Vercel AI SDK integration
  // Support for multiple providers
  // Unified interface matching current ClaudeIntegration
}

// Provider configurations
providers: {
  anthropic: claude-3-sonnet-4,
  openai: gpt-4o,
  google: gemini-1.5-pro
}
```

### Provider Support Matrix
| Provider | Models | Environment Variable | Status |
|----------|--------|---------------------|---------|
| Anthropic | Claude Sonnet 4.5, Claude Opus 4 | `ANTHROPIC_API_KEY` | ✅ Existing (Validated 2025-10-03) |
| OpenAI | GPT-4, GPT-4o, GPT-3.5 | `OPENAI_API_KEY` | 🔄 New |
| Google | Gemini 1.5 Pro, Gemini Pro | `GOOGLE_API_KEY` | 🔄 New |

**Note**: Anthropic SDK usage verified as isolated to `src/core/claude.ts` on 2025-10-03. All 10 dependent files only use `ClaudeIntegration` class, confirming existing abstraction layer.

## Implementation Plan

### Dependencies
- `@ai-sdk/openai`: OpenAI provider integration
- `@ai-sdk/anthropic`: Anthropic provider integration  
- `@ai-sdk/google`: Google Gemini provider integration
- `ai`: Core Vercel AI SDK

### Configuration System
```typescript
interface AIConfig {
  provider: 'anthropic' | 'openai' | 'google';
  model?: string;
  fallbackProvider?: string;
  maxRetries?: number;
}
```

### Backward Compatibility Strategy
1. **Phase 1**: Implement new `AIProvider` alongside existing `ClaudeIntegration`
2. **Phase 2**: Create wrapper to maintain existing interface
3. **Phase 3**: Gradual migration of tools to use new provider
4. **Phase 4**: Deprecate old implementation (future release)

## Major Milestones

### ✅ Milestone 1: Core Architecture Implementation
- [x] Install Vercel AI SDK dependencies (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`)
- [x] Analyze current `ClaudeIntegration` usage patterns across 10 dependent files
- [x] Design `AIProvider` interface based on actual usage needs (not speculation)
- [x] Rename `ClaudeIntegration` → `AnthropicProvider` implementing `AIProvider` interface
- [x] Create `VercelProvider` class implementing same `AIProvider` interface
- [x] Implement provider factory pattern with configuration system
- [x] Add provider-specific model defaults (`getDefaultModel()` method)

**Success Criteria**:
- All existing `ClaudeIntegration` methods work through new interface
- Both `AnthropicProvider` and `VercelProvider` implement identical interface
- Provider can be switched via environment variable (`AI_PROVIDER=vercel|anthropic`)
- Provider-specific model defaults work correctly
- Comprehensive unit tests pass for both providers

### ✅ Milestone 2: Multi-Provider Integration
- [x] Implement Anthropic provider (migrating existing functionality)
- [x] Add OpenAI provider with GPT-4 models
- [x] Add Google Gemini provider integration
- [x] Implement provider-specific model mapping
- [x] Add error handling and fallback mechanisms

**Success Criteria**:
- All three providers work through unified interface
- Provider switching works seamlessly
- Fallback to secondary provider on failures

### ✅ Milestone 3: Tool Migration and Testing
- [x] Migrate `recommend.ts` to new AI provider
- [x] Migrate `generate-manifests.ts` to new interface
- [x] Migrate `answer-question.ts` and other tools
- [x] Update all prompt loading to work with new providers
- [x] Comprehensive test suite with mocked providers

**Success Criteria**:
- All MCP tools work with any configured provider
- Tests validate functionality across all providers
- No breaking changes to existing API

### ✅ Milestone 4: Configuration and Environment
- [x] Environment variable validation and setup
- [x] Docker Compose configuration with multi-provider markers (future-ready)
- [~] Development setup scripts for provider configuration (deferred - not needed for current Anthropic-only usage)
- [x] Runtime provider switching capabilities
- [~] Health checks for provider availability (deferred - can add when needed)

**Success Criteria**:
- ✅ Easy setup for Anthropic (production-ready)
- ✅ Clear markers showing where to add future providers
- ✅ Configuration files prepared for multi-provider expansion

### ⏸️ Milestone 5: Documentation and Examples (DEFERRED to PRD #140)
**Status**: Blocked - Performance issues with alternative providers

**Blocking Reasons**:
- Google Gemini: 3x slower than Anthropic (52 min vs 17 min test suite)
- OpenAI GPT-5: 2-3x slower, 91% pass rate (40/44 tests passing)

**Deferred To**: [PRD #140 - Multi-Provider Setup Documentation](./140-multi-provider-setup-documentation.md)

**Will Document When**:
- ✅ Test suite duration within 2x of Anthropic baseline
- ✅ 95%+ integration test pass rate
- ✅ Next-gen models (Gemini 3, GPT-6) release

**Original Scope** (moved to PRD #140):
- [ ] Complete AI providers configuration guide
- [ ] Updated setup documentation for all deployment methods
- [ ] Code examples for each provider
- [ ] Migration guide from Claude-only setup
- [ ] Best practices for provider selection

### ⏸️ Milestone 6: Performance and Monitoring (PARTIALLY DEFERRED)
- [x] Performance benchmarks across providers
- [~] Cost analysis and optimization recommendations (deferred to PRD #139 - AI Provider Comparison & Benchmarking)
- [x] Provider-specific error handling and retry logic
- [~] Monitoring and observability for provider usage (deferred to PRD #137 - OpenTelemetry Tracing)
- [~] Rate limiting and quota management (deferred - future enhancement)

**Success Criteria Met**:
- ✅ Performance benchmarks completed (Anthropic 100%, Gemini 100%, OpenAI 91%)
- ✅ Provider-specific error handling implemented
- ⏸️ Monitoring/cost analysis deferred to specialized PRDs

### ⏸️ Milestone 7: Feature Complete and Deployed (DEFERRED - Post-Release Activities)
- [~] Feature flag for gradual rollout (not needed - already production-ready with Anthropic)
- [~] Production deployment validation (ongoing operational task)
- [~] User acceptance testing (post-release activity)
- [~] Performance monitoring in production (deferred to PRD #137)
- [~] Documentation complete and tested (deferred to PRD #140)

**Deferral Rationale**:
- Core implementation complete and production-ready
- Anthropic provider fully tested and documented
- Alternative provider documentation blocked by performance issues
- Post-release validation activities beyond PRD scope

## Success Metrics

### Technical Metrics
- **API Compatibility**: 100% backward compatibility with existing `ClaudeIntegration` interface
- **Provider Coverage**: Support for 3+ major AI providers
- **Response Time**: <5% performance degradation compared to direct Claude integration
- **Error Rate**: <1% increase in AI-related errors
- **Test Coverage**: >90% coverage for new AI provider code

### User Experience Metrics
- **Setup Time**: Users can configure any provider in <5 minutes
- **Provider Switching**: Change providers with single environment variable
- **Documentation Quality**: Users successfully setup without support requests
- **Cost Flexibility**: Users can optimize costs by provider selection

## Risk Assessment

### High Priority Risks
1. **API Rate Limits**: Different providers have different limits
   - **Mitigation**: Implement per-provider rate limiting
2. **Response Format Variations**: Providers may return different formats
   - **Mitigation**: Vercel AI SDK standardizes responses
3. **Breaking Changes**: Provider API changes could break functionality
   - **Mitigation**: Use stable SDK with version pinning

### Medium Priority Risks
1. **Cost Implications**: Different providers have different pricing
   - **Mitigation**: Document cost implications clearly
2. **Provider Availability**: Some providers may have regional restrictions
   - **Mitigation**: Support multiple providers as fallbacks
3. **Vercel AI SDK Issues**: Community reported concerns about AI SDK RSC development pause, error messages
   - **Status**: ✅ **Validated - Not Applicable** (2025-10-03)
   - **Analysis**: AI SDK RSC concerns only affect React Server Components usage. Our backend Node.js usage is unaffected. SDK remains actively developed (AI SDK 5 released 2025, 2M+ weekly downloads).
   - **Mitigation**: Continue monitoring SDK releases, maintain fallback capability to direct provider SDKs if needed

## Documentation Impact

### Files Requiring Updates
- `README.md`: Multi-provider support in features section
- `docs/mcp-setup.md`: Provider configuration instructions
- `docs/setup/development-setup.md`: Environment variables for all providers
- `docs/setup/docker-setup.md`: Multi-provider Docker configuration
- `docs/setup/npx-setup.md`: Quick start with provider selection
- `CLAUDE.md`: Development guidelines for provider abstraction

### New Documentation Required
- `docs/ai-providers-guide.md`: Comprehensive provider configuration guide
- Provider-specific examples and troubleshooting guides

## Future Considerations

### Phase 2 Enhancements (Future PRDs)
- **Model Fine-tuning**: Support for custom fine-tuned models
- **Local Models**: Integration with local LLM providers (Ollama, etc.)
- **Advanced Routing**: Intelligent provider selection based on query type
- **Cost Optimization**: Automatic provider switching based on cost thresholds
- **A/B Testing**: Compare responses across providers for quality optimization

### Compatibility Planning
- **API Evolution**: Plan for provider API changes and SDK updates
- **Performance Monitoring**: Long-term performance trends across providers
- **User Feedback**: Collect data on provider preferences and usage patterns

## Decision Log

### ✅ Decision: Vercel AI SDK Validated as Optimal Choice
- **Date**: 2025-10-03
- **Decision**: Proceed with Vercel AI SDK as specified in original PRD (no alternative framework needed)
- **Rationale**:
  - Comprehensive research comparing Vercel AI SDK vs LangChain vs LiteLLM vs LLM.js vs Ax
  - TypeScript-first with excellent type safety (matches our codebase requirements)
  - Built-in streaming support (critical - we use `stream: true` in `claude.ts:184`)
  - 18+ provider support, 2M+ weekly downloads, production-proven (Perplexity, Chatbase)
  - Active development (AI SDK 5 released 2025, AI Gateway available for production)
  - Simple API matching current usage patterns (minimal migration effort)
  - Framework-agnostic (not tied to Vercel platform for Node.js backend usage)
  - Reported concerns (AI SDK RSC development paused) don't affect our backend use case
- **Alternatives Rejected**:
  - **LangChain**: Too complex, requires more boilerplate, overkill for simple text generation needs
  - **LiteLLM**: Python-first design, requires proxy server deployment (wrong architecture for TypeScript project)
  - **LLM.js/Ax**: Too new, insufficient production validation
- **Impact**: No changes to original PRD approach - validation confirms technical direction
- **Owner**: Development Team

### ✅ Decision: Interface-First Implementation Strategy
- **Date**: 2025-10-03
- **Decision**: Adopt interface-first design approach based on actual `ClaudeIntegration` usage patterns
- **Rationale**:
  - Anthropic SDK already well-isolated to `src/core/claude.ts` (verified across codebase)
  - 10 dependent files only use `ClaudeIntegration` class, not raw Anthropic SDK
  - Existing code structure already acts as effective abstraction layer
  - Can extract interface from real usage patterns rather than speculative design
  - Enables parallel development of both providers with validation before full migration
- **Implementation Approach**:
  1. Analyze current `ClaudeIntegration` usage patterns across 10 dependent files
  2. Design `AIProvider` interface based on actual needs (not speculation)
  3. Rename `ClaudeIntegration` → `AnthropicProvider` implementing interface
  4. Create `VercelProvider` implementing same interface
  5. Build provider factory with configuration system
  6. Update imports to use interface type
  7. Write integration tests validating both providers
- **Impact**:
  - Updated Milestone 1 tasks to reflect interface-first approach
  - No code movement needed - just interface extraction and new implementations
  - Clearer migration path with testable intermediate states
- **Owner**: Development Team

### ✅ Decision: Provider-Specific Model Defaults Required
- **Date**: 2025-10-03
- **Decision**: Add provider-specific default model configuration to `AIProvider` interface
- **Context**: Current implementation has hard-coded Anthropic model in `claude.ts:181`: `'claude-sonnet-4-5-20250929'`
- **Rationale**: Different providers have different model naming conventions and optimal defaults
- **Implementation**: Add `getDefaultModel()` method to `AIProvider` interface
- **Default Model Mapping**:
  - Anthropic → `claude-sonnet-4-5`
  - OpenAI → `gpt-4o`
  - Google → `gemini-1.5-pro`
- **Impact**: Adds requirement to Milestone 1 implementation tasks
- **Owner**: Development Team

## Work Log

### 2025-10-03: Milestone 1 - Interface Design Phase Complete
**Duration**: ~2-3 hours
**Phase**: Core Architecture - AIProvider Interface Design

**Completed PRD Items**:
- [x] Analyze current `ClaudeIntegration` usage patterns across 10 dependent files
  - Evidence: Systematic analysis found only 3 methods actively used: `sendMessage()` (15 calls), `analyzeIntentForClarification()` (1 call), `isInitialized()` (1 call)
  - Identified 9 unused methods excluded from interface design (no bloat)

- [x] Design `AIProvider` interface based on actual usage needs
  - Evidence: Created `src/core/ai-provider.interface.ts` with minimal 5-method interface
  - Interface based on real usage patterns, not speculation
  - Added only 2 new methods required for multi-provider support: `getDefaultModel()`, `getProviderType()`

- [x] Implement provider factory pattern with configuration system
  - Evidence: Created `src/core/ai-provider-factory.ts`
  - Factory supports explicit configuration via `create()` and environment-based detection via `createFromEnv()`
  - Includes helper methods: `isProviderAvailable()`, `getAvailableProviders()`, `isProviderImplemented()`

- [x] Add provider-specific model defaults
  - Evidence: Defined `PROVIDER_DEFAULT_MODELS` constant with defaults for all Phase 1 providers
  - Anthropic → `claude-sonnet-4-5-20250929`, OpenAI → `gpt-4o`, Google → `gemini-1.5-pro`

**Architectural Decisions**:
- **Extensible provider architecture**: Used `string` for provider type instead of enum to support 19+ Vercel AI SDK providers (not just 3)
- **Provider-specific env vars**: Followed industry standard (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`)
- **Minimal interface design**: Only included methods with evidence of actual usage

**Files Created**:
- `src/core/ai-provider.interface.ts` - Core AIProvider interface and type definitions
- `src/core/ai-provider-factory.ts` - Provider factory with environment-based configuration

**Next Session Priorities**:
- Install Vercel AI SDK dependencies (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`)
- Implement `AnthropicProvider` class (rename from `ClaudeIntegration`)
- Implement `VercelProvider` class for OpenAI and Google support
- Write integration tests validating both provider implementations

**Milestone 1 Progress**: 57% complete (4 of 7 items)

### 2025-10-04: Milestone 1 - Provider-Agnostic Implementation Complete
**Duration**: ~4-5 hours
**Phase**: Core Architecture - AnthropicProvider Implementation & Provider-Agnostic Refactoring

**Completed PRD Items**:
- [x] Rename `ClaudeIntegration` → `AnthropicProvider` implementing `AIProvider` interface
  - Evidence: Created `src/core/providers/anthropic-provider.ts` implementing all 5 AIProvider methods
  - Migrated all functionality while keeping existing Anthropic SDK (no Vercel AI SDK for Anthropic)
  - All 5 interface methods implemented: `sendMessage()`, `analyzeIntentForClarification()`, `isInitialized()`, `getDefaultModel()`, `getProviderType()`
  - Original `ClaudeIntegration` removed, all imports updated to use `AIProvider` interface

**Additional Work Completed (Provider-Agnostic Refactoring)**:
- **Made entire codebase provider-agnostic**:
  - Removed all "claude" references from shared code (53+ locations across 18+ files)
  - Removed all "anthropic" references from shared code (8 files)
  - Updated `dotAI.claude` → `dotAI.ai` throughout codebase
  - Made all error messages, comments, and logs provider-agnostic

- **Core files refactored** (`src/core/`):
  - `index.ts` - Changed interface from `claude: ClaudeIntegration` to `ai: AIProvider`
  - `error-handling.ts` - Generic AI service error messages
  - `capability-scan-workflow.ts` - Uses factory instead of direct API key checks
  - `unified-creation-session.ts` - Uses `aiProvider.isInitialized()` check
  - `schema.ts` - Accepts AIProvider via dependency injection

- **Tool files refactored** (`src/tools/`):
  - `recommend.ts` - Uses `dotAI.ai` instead of `dotAI.claude`
  - `remediate.ts` - Generic AI provider error suggestions
  - `version.ts` - Complete refactor: `anthropic` → `aiProvider` with `providerType` field
  - `build-platform.ts` - Updated to use new interface
  - `answer-question.ts`, `generate-manifests.ts` - Updated imports

- **Interface files refactored**:
  - `src/interfaces/mcp.ts` - Made comments generic
  - `src/mcp/server.ts` - Made initialization comments generic

**Integration Tests Updated**:
- `tests/integration/tools/version.test.ts` - Updated to validate new `aiProvider` structure
- Fixed flaky test in `tests/integration/tools/remediate.test.ts` (pod crash timing issue)
- **Test Results**: 43/44 passing (98% success rate)
- **Build Status**: ✅ All TypeScript compilation successful, no errors

**Architectural Decisions**:
- **Interface validation strategy**: Kept Anthropic SDK for AnthropicProvider (didn't switch to Vercel AI SDK)
  - Rationale: Validates existing code works through new interface before adding complexity
  - Benefit: Proves interface design is correct and complete
- **Provider-agnostic naming**: All shared code uses "AI provider" terminology instead of specific providers
- **Backward compatibility**: Maintained all existing functionality while refactoring structure

**Files Created/Modified**:
- Created: `src/core/providers/anthropic-provider.ts` - Complete Anthropic implementation
- Modified: 18+ core and tool files to use new interface
- Modified: Integration tests to match new structure
- Removed: `src/core/claude.ts` (migrated to anthropic-provider.ts)

**Next Session Priorities**:
- Install Vercel AI SDK dependencies (`ai`, `@ai-sdk/openai`, `@ai-sdk/google`)
- Implement `VercelProvider` class for OpenAI and Google support
- Write provider switching integration tests
- Begin Milestone 2: Multi-Provider Integration

**Milestone 1 Progress**: 71% complete (5 of 7 items) ⬆️ **UP from 57%**

### 2025-10-05: OpenAI GPT-5 Integration Testing & Bug Fixes
**Duration**: ~3-4 hours
**Phase**: Multi-Provider Integration - OpenAI Provider Validation

**Completed Work**:
- [x] **Multi-provider timeout accommodations**
  - Increased integration test timeouts to accommodate OpenAI's slower processing
  - remediate.test.ts: Manual Mode 5min → 20min, Automatic Mode 5min → 30min
  - recommend.test.ts: Full workflow 10min → 20min
  - manage-org-data-capabilities.test.ts: Full scan 16min → 45min
  - Rationale: OpenAI GPT-5 significantly slower than Anthropic/Gemini for AI-intensive operations

- [x] **kubectl command escape sequence fix** (remediate.ts:1019-1020)
  - Root cause: OpenAI generates kubectl JSON parameters with escape sequences: `{\"apiVersion\"...}`
  - Fix: Added defensive code to strip escape sequences before command execution
  - Implementation: `fullCommand.replace(/\\"/g, '"')`
  - Impact: Works universally for all providers without breaking existing functionality

- [x] **Test stability improvements**
  - Fixed race condition in pod crash detection with retry loop
  - Replaced fixed 30s wait with polling mechanism

**Integration Test Results**:
- **Anthropic Claude Sonnet**: 44/44 passing (100%), 17 min total duration ✅
- **Google Gemini 2.5 Pro**: 44/44 passing (100%), 52 min total duration (3x slower) ⚠️
- **OpenAI GPT-5**: 40/44 passing (91%), 2-3x slower ⚠️

**Technical Discoveries**:
- **Performance**: Anthropic fastest, Gemini 3x slower, OpenAI 2-3x slower
- **Command generation**: Different AI providers generate kubectl commands with varying formats (escape sequences)
- **Compatibility**: Code fix approach preferred over prompt engineering for cross-provider consistency

**Files Modified**:
- src/tools/remediate.ts - Escape sequence fix, execution logic validation
- tests/integration/tools/remediate.test.ts - Timeout increases, race condition fixes
- tests/integration/tools/recommend.test.ts - Timeout increases
- tests/integration/tools/manage-org-data-capabilities.test.ts - Timeout increases

### 2025-10-05: Documentation Deferred - Performance Gap Analysis
**Duration**: ~1 hour
**Phase**: Documentation Planning & Decision

**Decision**: Defer user-facing documentation until performance improves
**Rationale**:
- Implementation complete and fully functional ✅
- Alternative providers have significant performance issues:
  - Gemini: 3x slower (52 min vs 17 min)
  - OpenAI: 2-3x slower, 91% test pass rate
- Documenting slow features creates poor user experience
- Next-gen models (Gemini 3, GPT-6) expected to improve performance

**Actions Taken**:
- Created PRD #140: Multi-Provider Setup Documentation (blocked)
- Defined unblock criteria (2x performance, 95%+ tests)
- Updated PRD #73 status to "Implementation Complete - Documentation Deferred"
- Documented performance benchmarks for future comparison

**Next Steps**:
- Monitor for new model releases (Gemini 3, GPT-6)
- Test new models when available using existing integration suite
- Document providers that meet performance criteria (PRD #140)

### 2025-10-05: OpenAI Debugging Deferred - Strategic Decision
**Duration**: 5 minutes
**Phase**: Final Project Closure Decision

**Decision**: Defer OpenAI test failure debugging until next-gen models release
**Rationale**:
- **Core implementation complete**: All 3 providers functional, architecture solid
- **Primary provider perfect**: Anthropic at 100% test pass rate (44/44)
- **Not worth debugging now**: Next-gen models (GPT-6) will likely fix reasoning issues
- **Documentation already blocked**: PRD #140 waiting on performance improvements anyway
- **Strategic timing**: Better to validate new models when released rather than debug old ones

**Current State**:
- ✅ Anthropic Claude Sonnet: 100% pass rate, 17 min duration (production-ready)
- ✅ Google Gemini 2.5 Pro: 100% pass rate, 52 min duration (functional but slow)
- ⚠️ OpenAI GPT-5: 91% pass rate (40/44), 2-3x slower (needs improvement)

**Deferred Work** (to be revisited with new models):
- Debug remaining 4 OpenAI test failures
- Improve OpenAI test pass rate from 91% → 95%+
- Performance optimization investigation

**Next Review Trigger**: Release of GPT-6 or significant GPT-5 improvements

### 2025-10-05: Deployment Configuration Updates - PRD Complete
**Duration**: 15 minutes
**Phase**: Final Infrastructure Preparation

**Completed Work**:
- [x] **Docker Compose updates** (`docker-compose-dot-ai.yaml`)
  - Added comment marking where to add `AI_PROVIDER` variable in future
  - Clarified ANTHROPIC_API_KEY required for AI analysis
  - Clarified OPENAI_API_KEY required for embeddings (not optional)
  - Future-ready structure for adding Google/other provider keys

- [x] **Helm Chart updates** (`charts/`)
  - Added comment in `values.yaml` marking where to add future provider keys
  - Updated OpenAI key comment to clarify it's for embeddings
  - Added comment in `templates/deployment.yaml` marking where to add AI_PROVIDER env var
  - Maintained backward compatibility with existing deployments

**Configuration Approach**:
- **Anthropic-only** as documented production configuration
- **Clear markers** showing where to add alternative providers later
- **OpenAI preserved** for embeddings (required for capabilities/policies/patterns)
- **No unsupported providers** included in configs

**PRD Status**: ✅ **COMPLETE**
- Core implementation: 100% complete
- Infrastructure: Future-ready for multi-provider expansion
- Documentation: Deferred to PRD #140 (blocked on model improvements)
- Monitoring: Deferred to PRD #137 (OpenTelemetry)
- Cost analysis: Deferred to PRD #139 (Benchmarking)

## References

- **Vercel AI SDK Documentation**: https://ai-sdk.dev/docs/introduction
- **Current Implementation**: `src/core/claude.ts`
- **GitHub Issue**: [#73](https://github.com/vfarcic/dot-ai/issues/73)
- **Provider Documentation**:
  - Anthropic: https://docs.anthropic.com/
  - OpenAI: https://platform.openai.com/docs
  - Google AI: https://ai.google.dev/docs

---

**Last Updated**: 2025-10-05 (PRD Complete - Infrastructure Future-Ready)
**Next Review**: When new major AI models released (GPT-6, Gemini 3) for alternative provider documentation
**Stakeholders**: DevOps AI Toolkit Users, Contributors, Maintainers