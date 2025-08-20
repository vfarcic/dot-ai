# PRD: Multi-Model AI Provider Support

**Status**: ✅ Active Development  
**Priority**: High  
**GitHub Issue**: [#73](https://github.com/vfarcic/dot-ai/issues/73)  
**Created**: 2024-08-20  

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
| Anthropic | Claude 3.5 Sonnet, Claude 3 | `ANTHROPIC_API_KEY` | ✅ Existing |
| OpenAI | GPT-4, GPT-4o, GPT-3.5 | `OPENAI_API_KEY` | 🔄 New |
| Google | Gemini 1.5 Pro, Gemini Pro | `GOOGLE_API_KEY` | 🔄 New |

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
- [ ] Install Vercel AI SDK dependencies
- [ ] Create new `AIProvider` class with unified interface
- [ ] Implement provider factory pattern
- [ ] Add configuration system for provider selection
- [ ] Create backward compatibility wrapper

**Success Criteria**: 
- All existing `ClaudeIntegration` methods work through new interface
- Provider can be switched via environment variable
- Comprehensive unit tests pass

### ✅ Milestone 2: Multi-Provider Integration
- [ ] Implement Anthropic provider (migrating existing functionality)
- [ ] Add OpenAI provider with GPT-4 models
- [ ] Add Google Gemini provider integration
- [ ] Implement provider-specific model mapping
- [ ] Add error handling and fallback mechanisms

**Success Criteria**:
- All three providers work through unified interface
- Provider switching works seamlessly
- Fallback to secondary provider on failures

### ✅ Milestone 3: Tool Migration and Testing
- [ ] Migrate `recommend.ts` to new AI provider
- [ ] Migrate `generate-manifests.ts` to new interface
- [ ] Migrate `answer-question.ts` and other tools
- [ ] Update all prompt loading to work with new providers
- [ ] Comprehensive test suite with mocked providers

**Success Criteria**:
- All MCP tools work with any configured provider
- Tests validate functionality across all providers
- No breaking changes to existing API

### ✅ Milestone 4: Configuration and Environment
- [ ] Environment variable validation and setup
- [ ] Docker Compose configuration with multi-provider support
- [ ] Development setup scripts for provider configuration
- [ ] Runtime provider switching capabilities
- [ ] Health checks for provider availability

**Success Criteria**:
- Easy setup for any supported provider
- Clear error messages for misconfiguration
- Graceful degradation when providers unavailable

### ✅ Milestone 5: Documentation and Examples
- [ ] Complete AI providers configuration guide
- [ ] Updated setup documentation for all deployment methods
- [ ] Code examples for each provider
- [ ] Migration guide from Claude-only setup
- [ ] Best practices for provider selection

**Success Criteria**:
- Users can easily configure any provider
- Clear migration path documented
- Examples work for all providers

### ✅ Milestone 6: Performance and Monitoring
- [ ] Performance benchmarks across providers
- [ ] Cost analysis and optimization recommendations
- [ ] Provider-specific error handling and retry logic
- [ ] Monitoring and observability for provider usage
- [ ] Rate limiting and quota management

**Success Criteria**:
- Performance parity with current Claude integration
- Clear cost implications documented
- Robust error handling implemented

### ✅ Milestone 7: Feature Complete and Deployed
- [ ] Feature flag for gradual rollout
- [ ] Production deployment validation
- [ ] User acceptance testing
- [ ] Performance monitoring in production
- [ ] Documentation complete and tested

**Success Criteria**:
- Feature available to all users
- No regressions from current functionality
- Positive user feedback on flexibility

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

## References

- **Vercel AI SDK Documentation**: https://ai-sdk.dev/docs/introduction
- **Current Implementation**: `src/core/claude.ts`
- **GitHub Issue**: [#73](https://github.com/vfarcic/dot-ai/issues/73)
- **Provider Documentation**:
  - Anthropic: https://docs.anthropic.com/
  - OpenAI: https://platform.openai.com/docs
  - Google AI: https://ai.google.dev/docs

---

**Last Updated**: 2024-08-20  
**Next Review**: Weekly milestone review  
**Stakeholders**: DevOps AI Toolkit Users, Contributors, Maintainers