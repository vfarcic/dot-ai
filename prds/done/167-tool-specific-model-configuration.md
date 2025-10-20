# PRD: Tool-Specific AI Model Configuration

**Issue**: #167
**Status**: No Longer Needed
**Created**: 2025-10-16
**Last Updated**: 2025-10-20
**Closed**: 2025-10-20

---

## Problem Statement

Currently, all MCP tools (`recommend`, `remediate`, `manageOrgData`, `testDocs`) use the same AI model configured globally via `AI_PROVIDER` environment variable. This one-size-fits-all approach prevents optimization opportunities:

- **Cost inefficiency**: Complex reasoning tools use the same expensive models as simpler operations
- **Performance limitations**: Time-sensitive operations can't leverage faster models
- **Testing constraints**: Developers can't easily test different models for different tools

Users need the ability to configure different AI models per tool while maintaining the simplicity of global defaults.

---

## Success Criteria

### Must Have
- [ ] Tool-specific model configuration through environment variables
- [ ] Backward compatibility: existing deployments work without changes
- [ ] All current tools support tool-specific models
- [ ] Configuration follows existing patterns (no new paradigms)
- [ ] Clear error handling for invalid model configurations

### Nice to Have
- [ ] Logging/visibility of which model was used per tool invocation
- [ ] Documentation with optimization recommendations per tool
- [ ] Examples of common configuration patterns

---

## User Impact

### Before
```yaml
# .env or MCP config
AI_PROVIDER=claude-3-5-sonnet-20241022

# All tools use the same model
```

### After
```yaml
# .env or MCP config
AI_PROVIDER=claude-3-5-sonnet-20241022           # Global default
AI_PROVIDER_REMEDIATE=gpt-4o                      # Fast model for remediation
AI_PROVIDER_RECOMMEND=claude-3-5-sonnet-20241022  # Best model for recommendations
AI_PROVIDER_MANAGE_ORG_DATA=gpt-4o-mini           # Cheaper model for data management
AI_PROVIDER_TEST_DOCS=gpt-4o-mini                 # Fast, cheap model for doc testing

# Tools use specific models when configured, fall back to global default
```

**User Benefits:**
- Cost optimization by using cheaper models for simpler tasks
- Performance tuning with faster models for time-sensitive operations
- Flexibility to test and evaluate different models per tool
- Zero breaking changes - opt-in enhancement

---

## Technical Approach

### Configuration System

**Environment Variable Naming Convention:**
```
AI_PROVIDER                    # Global default (existing)
AI_PROVIDER_RECOMMEND          # Override for recommend tool
AI_PROVIDER_REMEDIATE          # Override for remediate tool
AI_PROVIDER_MANAGE_ORG_DATA    # Override for manageOrgData tool
AI_PROVIDER_TEST_DOCS          # Override for testDocs tool
```

**Resolution Order:**
1. Check for tool-specific `AI_PROVIDER_[TOOL_NAME]` variable
2. Fall back to global `AI_PROVIDER` variable
3. Error if neither is configured

### Supported Models

All currently supported models should work for tool-specific configuration:
- Claude models (Anthropic)
- GPT models (OpenAI)
- Any other models supported by the Vercel AI SDK integration

### Error Handling

Follow existing error handling patterns:
- Invalid model name → clear error message
- Model unavailable → fallback behavior or error
- Missing API keys → existing key validation behavior

### Implementation Areas

**Core Changes:**
- `src/core/claude.ts`: Model resolution logic
- Configuration loading: Tool-specific env var lookup
- Tool handlers: Pass tool identifier for model resolution

**Testing:**
- Integration tests for each tool with custom model
- Configuration validation tests
- Fallback behavior tests
- Backward compatibility verification

**Documentation:**
- README.md: Feature overview and configuration examples
- Environment variable documentation
- Performance/cost optimization guide per tool

---

## Implementation Milestones

### Milestone 1: Core Model Resolution System
**Goal**: Implement the foundational model selection logic that enables tool-specific overrides

**Success Criteria:**
- Model resolution function that checks tool-specific env vars first, then falls back to global
- Configuration validation and error handling working
- Unit tests passing for model resolution logic

**Deliverables:**
- Enhanced configuration system supporting `AI_PROVIDER_[TOOL_NAME]` pattern
- Model resolution utility function
- Configuration validation with clear error messages

---

### Milestone 2: Tool Integration
**Goal**: Integrate tool-specific model selection into all existing MCP tools

**Success Criteria:**
- All tools (`recommend`, `remediate`, `manageOrgData`, `testDocs`) support tool-specific models
- Tools correctly fall back to global model when tool-specific not configured
- No breaking changes to existing tool behavior

**Deliverables:**
- Updated tool handlers to use model resolution system
- Tool identifier passed through call chain
- Backward compatibility maintained

---

### Milestone 3: Testing & Validation
**Goal**: Comprehensive test coverage ensuring feature works correctly and safely

**Success Criteria:**
- Integration tests for each tool with custom model configuration
- Configuration validation tests (invalid models, missing keys, etc.)
- Fallback behavior tests
- Backward compatibility tests (existing configs still work)
- All tests passing

**Deliverables:**
- Integration test suite covering all tools with custom models
- Configuration error handling tests
- Regression tests for existing behavior

---

### Milestone 4: Documentation & Examples
**Goal**: Complete user-facing documentation with practical examples and optimization guidance

**Success Criteria:**
- README updated with feature overview
- Environment variable reference complete
- Optimization recommendations per tool documented
- Example configurations for common scenarios

**Deliverables:**
- Updated README.md with feature documentation
- Configuration examples (cost optimization, performance tuning)
- Per-tool model recommendations guide
- Migration guide (if needed)

---

### Milestone 5: Feature Complete & Ready for Use
**Goal**: Feature fully implemented, tested, documented, and ready for production use

**Success Criteria:**
- All previous milestones complete
- Feature working in real MCP server environment
- No regressions in existing functionality
- Documentation reviewed and clear
- Ready for users to adopt

**Deliverables:**
- Production-ready feature
- Complete test coverage
- User documentation
- Release notes prepared

---

## Risks & Mitigations

### Risk: Configuration Complexity
**Mitigation**: Use consistent naming convention matching existing patterns. Provide clear examples.

### Risk: Unexpected Model Behavior
**Mitigation**: Document recommended models per tool. Log which model is used for debugging.

### Risk: Breaking Changes
**Mitigation**: Make tool-specific models purely additive. Existing configs work unchanged.

### Risk: Model Availability/API Keys
**Mitigation**: Reuse existing model validation and error handling. Clear error messages.

---

## Open Questions

- [ ] Should we log which model was used for each tool invocation? (Nice to have - defer decision)
- [ ] Should we provide default tool-specific model recommendations? (Document after testing)
- [ ] Should configuration support model parameters per tool (temperature, etc.)? (Out of scope - future enhancement)

---

## Dependencies

- Existing AI provider integration (`src/core/claude.ts`)
- Existing configuration system
- Vercel AI SDK model support

---

## Future Enhancements (Out of Scope)

- Per-tool model parameters (temperature, max tokens, etc.)
- Runtime model switching via API
- Model usage metrics and cost tracking
- Automatic model selection based on task complexity

---

## Progress Log

### 2025-10-16
- PRD created
- GitHub issue #167 created
- Ready for implementation planning

### 2025-10-20: PRD Closure - No Longer Needed
**Duration**: N/A (administrative closure)
**Status**: Closed

**Closure Summary**:
After beginning implementation work on this PRD, we determined that the architectural complexity and required changes outweigh the practical benefits for the use case.

**Reason for Closure**:
- **Architectural Complexity**: Implementing tool-specific model configuration requires significant refactoring of the AI provider system, particularly around making toolName mandatory throughout the call chain
- **Limited Practical Benefit**: The current global `AI_PROVIDER` and `AI_MODEL` environment variables already provide sufficient flexibility for most use cases
- **Cost Optimization Alternative**: Users can already switch models globally based on workload, which addresses the primary cost optimization concern
- **Maintenance Burden**: Adding per-tool configuration increases system complexity and maintenance overhead without proportional value
- **User Experience**: The current simple global configuration is easier to understand and manage for most users

**Key Points**:
- Original PRD requested tool-specific AI model configuration via `AI_PROVIDER_[TOOL_NAME]` environment variables
- Goal was to enable cost optimization and performance tuning by using different models for different tool complexity levels
- Implementation began but was abandoned after architectural review revealed excessive complexity
- Current global configuration pattern (`AI_PROVIDER` + optional `AI_MODEL` override) is sufficient

**Decision**:
This feature does not provide sufficient value to justify the architectural changes and ongoing maintenance burden. The existing configuration system adequately serves user needs.
