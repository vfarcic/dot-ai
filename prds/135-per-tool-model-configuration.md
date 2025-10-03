# PRD: Per-Tool AI Model Configuration

**Status**: ✅ Active Development
**Priority**: Medium
**GitHub Issue**: [#135](https://github.com/vfarcic/dot-ai/issues/135)
**Created**: 2025-10-03
**Dependencies**: **REQUIRED** - PRD #73 (Multi-Model AI Provider Support) must be complete

## Executive Summary

The DevOps AI Toolkit currently uses a single AI model configuration for all MCP tools, limiting users' ability to optimize cost and performance. Different tools have vastly different AI requirements - some need fast responses for simple operations, while others require deep reasoning for complex analysis. This PRD introduces per-tool model configuration that allows users to select optimal models for each tool's specific needs.

### Problem Statement
- **Single model for all operations**: All MCP tools share one model configuration via `MODEL` environment variable
- **No cost optimization**: Cannot use cheaper/faster models for simple tasks and reserve powerful models for complex operations
- **Performance tradeoffs**: Users must choose between speed for all operations or reasoning capability for all operations
- **Resource inefficiency**: Over-provisioning AI capability for simple operations wastes resources and increases latency
- **Limited flexibility**: Cannot experiment with different models for different tool types

### Solution Overview
Implement per-tool model configuration system that allows users to specify different AI models for different MCP tools via environment variables (e.g., `DOT_AI_MODEL_RECOMMEND`, `DOT_AI_MODEL_REMEDIATE`). This builds on PRD #73's multi-provider architecture to enable granular control over model selection.

## Technical Architecture

### Current State Analysis
- **Single Configuration**: `MODEL` environment variable (default: `claude-sonnet-4-5-20250929`)
- **Shared AI Client**: All tools use same `ClaudeIntegration` instance
- **No Differentiation**: Schema analysis, remediation, and recommendations all use same model
- **12+ AI Usage Points**: Multiple tools call `claudeIntegration.sendMessage()` with varying complexity needs

### Target Architecture
```typescript
// Per-tool model configuration
environment variables: {
  DOT_AI_MODEL_RECOMMEND: "claude-sonnet-4-5",
  DOT_AI_MODEL_REMEDIATE: "gpt-4o",
  DOT_AI_MODEL_BUILD_PLATFORM: "claude-opus-4",
  DOT_AI_MODEL_DEFAULT: "claude-sonnet-4-5"
}

// Fallback hierarchy: tool-specific → DEFAULT → hardcoded
```

### Tool Categories and Model Requirements
| Tool Category | Complexity | Example Operations | Model Needs |
|--------------|-----------|-------------------|-------------|
| **Recommendations** | High | Resource matching, solution generation | Deep reasoning, schema understanding |
| **Remediation** | High | Issue analysis, fix generation | Complex reasoning, error understanding |
| **Platform Operations** | Medium-High | Script discovery, parameter mapping | Code understanding, workflow reasoning |
| **Schema Analysis** | Medium | Field extraction, validation | Structured data processing |
| **Capability Inference** | Medium | Resource capability detection | Pattern recognition |
| **Simple Queries** | Low | Status checks, basic responses | Fast response, basic understanding |

## Major Milestones

### ✅ Milestone 1: Configuration System Design
- [ ] Define environment variable naming convention
- [ ] Design fallback hierarchy (tool-specific → DEFAULT → hardcoded)
- [ ] Map all MCP tools to configuration keys
- [ ] Document model selection best practices per tool type
- [ ] Create configuration validation system

**Success Criteria**:
- Clear naming convention documented
- All tools mapped to configuration keys
- Validation logic designed

### ✅ Milestone 2: AIProvider Extension (Depends on PRD #73)
- [ ] Extend `AIProvider` class to support per-operation model selection
- [ ] Implement model resolution logic with fallback hierarchy
- [ ] Add configuration loading from environment variables
- [ ] Create tool-to-model mapping service
- [ ] Maintain backward compatibility with single `MODEL` variable

**Success Criteria**:
- AIProvider supports per-tool model configuration
- Fallback hierarchy works correctly
- Existing single-model setup still works

### ✅ Milestone 3: MCP Tool Integration
- [ ] Update `recommend.ts` to use tool-specific model
- [ ] Update `remediate.ts` to use tool-specific model
- [ ] Update `build-platform.ts` to use tool-specific model
- [ ] Update remaining AI-powered tools
- [ ] Add configuration logging for debugging

**Success Criteria**:
- All tools respect tool-specific configuration
- Configuration choices logged for transparency
- No breaking changes to tool interfaces

### ✅ Milestone 4: MCP Server Setup Integration
- [ ] Update `.mcp-docker.json` with per-tool model examples
- [ ] Update `docker-compose.yml` with configuration options
- [ ] Add environment variable validation on startup
- [ ] Implement helpful error messages for misconfiguration
- [ ] Add runtime configuration inspection endpoint

**Success Criteria**:
- Easy to configure via MCP setup files
- Clear validation errors guide users
- Users can inspect active configuration

### ✅ Milestone 5: Documentation and Best Practices
- [ ] Create per-tool model configuration guide
- [ ] Document recommended models per tool type
- [ ] Add cost optimization strategies guide
- [ ] Update all setup documentation (Docker, npx, development)
- [ ] Create troubleshooting guide for model selection

**Success Criteria**:
- Users understand which models work best for which tools
- Clear examples for common configurations
- Cost/performance tradeoffs documented

### ✅ Milestone 6: Integration Testing and Validation
- [ ] Add integration tests for per-tool configuration
- [ ] Test fallback hierarchy behavior
- [ ] Validate backward compatibility with existing setup
- [ ] Test configuration error handling
- [ ] Performance comparison across model selections

**Success Criteria**:
- All integration tests pass
- Backward compatibility verified
- Performance benchmarks documented

### ✅ Milestone 7: Feature Complete and Deployed
- [ ] Feature flag for gradual rollout (if needed)
- [ ] Production deployment validation
- [ ] Monitor real-world usage patterns
- [ ] Collect user feedback on model selection
- [ ] Documentation validated by users

**Success Criteria**:
- Feature available and working
- Users successfully configuring different models per tool
- Positive feedback on cost/performance optimization

## Success Metrics

### Technical Metrics
- **Configuration Coverage**: 100% of AI-powered tools support per-tool configuration
- **Fallback Reliability**: Fallback hierarchy works in 100% of edge cases
- **Backward Compatibility**: 100% compatibility with existing single-model setup
- **Setup Time**: Users can configure per-tool models in <5 minutes
- **Validation Coverage**: All configuration errors provide clear guidance

### User Experience Metrics
- **Cost Optimization**: Users report 20%+ cost savings by using appropriate models per tool
- **Performance Flexibility**: Users can optimize latency for frequently-used tools
- **Configuration Clarity**: Users understand which models to use for which tools
- **Troubleshooting Time**: Configuration issues resolved in <2 minutes with error messages

## Risk Assessment

### High Priority Risks
1. **PRD #73 Dependency**: This PRD cannot proceed until multi-provider support is complete
   - **Mitigation**: Track PRD #73 progress closely, plan implementation after completion
2. **Configuration Complexity**: Too many options may confuse users
   - **Mitigation**: Provide sensible defaults, document recommended configurations
3. **Model Compatibility**: Not all models work well for all operations
   - **Mitigation**: Test and document which models work best for which tools

### Medium Priority Risks
1. **Cost Implications**: Users may select expensive models for all tools
   - **Mitigation**: Document cost implications, provide budget-conscious examples
2. **Testing Coverage**: Need to test all combinations of tool × model
   - **Mitigation**: Focus on recommended configurations, document known limitations
3. **Documentation Maintenance**: Model landscape changes frequently
   - **Mitigation**: Keep model recommendations in separate, easy-to-update guide

## Documentation Impact

### Files Requiring Updates
- `.mcp-docker.json`: Add per-tool model configuration examples
- `docker-compose.yml`: Environment variable examples
- `docs/mcp-setup.md`: Per-tool configuration instructions
- `docs/setup/docker-setup.md`: Docker-specific configuration
- `docs/setup/development-setup.md`: Development environment setup
- `README.md`: Mention per-tool configuration capability

### New Documentation Required
- `docs/per-tool-model-configuration.md`: Comprehensive guide for model selection per tool
- `docs/model-selection-best-practices.md`: Best practices and cost optimization strategies

## Dependencies

### Critical Dependency
- **PRD #73: Multi-Model AI Provider Support** (REQUIRED)
  - Must be complete before this PRD can be implemented
  - This PRD extends the `AIProvider` abstraction from #73
  - Leverages the multi-provider infrastructure

### Technical Dependencies
- Vercel AI SDK (from PRD #73)
- Environment variable management
- MCP server configuration system

## Future Considerations

### Phase 2 Enhancements (Future PRDs)
- **Dynamic Model Selection**: Automatically choose models based on query complexity
- **Cost Budgeting**: Set per-tool or overall cost limits
- **Performance Monitoring**: Track response times and quality per model/tool combination
- **A/B Testing**: Compare model performance for specific tools
- **User Preferences**: Remember user's model preferences per tool

### Compatibility Planning
- **Model Updates**: Plan for new models and deprecations
- **Configuration Migration**: Support configuration format changes
- **Usage Analytics**: Collect anonymized data on model selection patterns

## References

- **PRD #73**: Multi-Model AI Provider Support - https://github.com/vfarcic/dot-ai/issues/73
- **Current Implementation**: `src/core/claude.ts` (line 181 - MODEL env var)
- **GitHub Issue**: [#135](https://github.com/vfarcic/dot-ai/issues/135)
- **MCP Configuration**: `.mcp-docker.json`, `docker-compose.yml`

---

**Last Updated**: 2025-10-03
**Next Review**: Weekly milestone review
**Stakeholders**: DevOps AI Toolkit Users, Cost-conscious Teams, Performance-focused Users
