# PRD-40: Extend Prompts as Triggers for External MCP Tools

**GitHub Issue**: [#40](https://github.com/vfarcic/dot-ai/issues/40)
**Status**: Draft
**Created**: 2025-07-31
**Owner**: TBD

## Problem Statement

Currently, MCP tools in the dot-ai system are invoked individually through explicit function calls. While the system has sophisticated prompt management and workflow capabilities, users must manually orchestrate complex workflows across multiple MCP tools. This limits the potential for:

- Natural language interfaces that can intelligently select and chain tools
- Automated workflow orchestration based on user intent
- Context-aware tool selection and parameter generation
- Reusable prompt libraries that encode complex tool interaction patterns

## Solution Overview

Extend the existing file-based prompt system to serve as intelligent triggers that can automatically invoke and coordinate other MCP tools through AI-generated prompts and workflow orchestration.

### Core Capabilities

1. **Prompt-to-Tool Mapping**: Enable prompts to specify which MCP tools should be triggered
2. **Dynamic Parameter Generation**: Use AI to generate appropriate tool parameters based on prompt context
3. **Workflow Orchestration**: Chain multiple MCP tools through prompt-driven workflows
4. **Tool Discovery Integration**: Automatically discover and integrate with available MCP tools
5. **Context Preservation**: Maintain state and context across multi-tool workflows

## User Stories

### Primary Users: Claude Code Users
- **As a user**, I want to describe complex deployment scenarios in natural language and have the system automatically coordinate multiple tools
- **As a user**, I want prompts to intelligently select the right combination of MCP tools for my specific use case
- **As a user**, I want my workflow context preserved across multiple tool invocations

### Secondary Users: MCP Tool Developers  
- **As an MCP tool developer**, I want my tools to be discoverable and integrable with the prompt-trigger system
- **As an MCP tool developer**, I want standard interfaces for tool metadata and parameter schemas

## Success Criteria

### Must Have (MVP)
- [ ] Prompt templates can specify target MCP tools and parameter mappings
- [ ] AI can generate tool parameters from natural language descriptions
- [ ] Basic workflow orchestration through sequential tool chaining
- [ ] Integration with existing dot-ai MCP tools (recommend, deploy, etc.)

### Should Have  
- [ ] Tool discovery mechanism for external MCP tools
- [ ] Complex workflow patterns (conditional, parallel, error handling)
- [ ] Prompt library with reusable tool interaction patterns
- [ ] Context-aware tool selection based on available tools and user history

### Could Have
- [ ] Visual workflow designer for prompt-tool mappings
- [ ] Prompt optimization based on tool execution success rates
- [ ] Integration with external workflow engines
- [ ] Multi-tenant prompt libraries

## Technical Approach

### Architecture Extension Points

Building on existing infrastructure:

1. **Prompt System Extension** (`prompts/` directory)
   - Add tool trigger metadata to prompt templates
   - Extend template variable system for tool parameters
   - Create prompt categories for different tool interaction patterns

2. **Workflow Engine Enhancement** (`src/core/session-utils.ts`)
   - Extend session management for multi-tool workflows
   - Add tool dependency and sequencing capabilities
   - Implement error handling and rollback mechanisms

3. **MCP Tool Registry** (new component)
   - Discover available MCP tools and their schemas
   - Maintain tool capability and compatibility mappings
   - Provide tool selection algorithms

4. **Prompt-Tool Bridge** (new component)
   - Parse prompt templates for tool triggers
   - Generate tool invocation parameters from AI analysis
   - Coordinate workflow execution and state management

### Implementation Phases

**Phase 1: Foundation** (2-3 weeks)
- Extend prompt template format with tool trigger metadata
- Create basic prompt-to-tool parameter mapping
- Implement simple sequential tool chaining
- Integration with existing dot-ai tools

**Phase 2: Intelligence** (3-4 weeks)  
- AI-powered parameter generation from natural language
- Tool selection algorithms based on context and availability
- Error handling and workflow recovery mechanisms
- Tool discovery and registration system

**Phase 3: Advanced Workflows** (4-5 weeks)
- Complex workflow patterns (conditional, parallel)
- Prompt library with reusable interaction patterns
- Context-aware tool selection and optimization
- Integration testing with external MCP tools

## Dependencies & Constraints

### Technical Dependencies
- Existing MCP tool architecture must remain stable
- Anthropic API for AI-powered parameter generation
- Model Context Protocol SDK for tool discovery
- Current prompt management system (`prompts/` directory)

### Constraints
- Must maintain backward compatibility with existing MCP tools
- Performance impact should be minimal for simple tool usage
- Security considerations for automatic tool invocation

### External Dependencies
- External MCP tools must follow standard MCP protocol
- Tool schemas must be discoverable and well-documented

## Risks & Mitigations

### Technical Risks
- **Performance degradation**: Tool discovery and AI analysis could slow down workflows
  - *Mitigation*: Implement caching and lazy loading for tool metadata
- **Complex error handling**: Multi-tool workflows increase failure complexity
  - *Mitigation*: Design comprehensive error handling and rollback mechanisms

### User Experience Risks
- **Unpredictable behavior**: AI-generated parameters might not match user intent
  - *Mitigation*: Provide parameter preview and confirmation workflows
- **Tool selection confusion**: Users might not understand which tools were selected
  - *Mitigation*: Transparent logging and explanation of tool selection decisions

### Integration Risks
- **External tool compatibility**: Third-party MCP tools might not integrate cleanly
  - *Mitigation*: Define clear integration standards and fallback mechanisms

## Metrics & Measurement

### Success Metrics
- **Adoption**: Percentage of workflows using prompt-triggered tools vs manual tool invocation
- **Efficiency**: Reduction in user steps required for complex multi-tool workflows
- **Accuracy**: Success rate of AI-generated tool parameters
- **Integration**: Number of external MCP tools successfully integrated

### Technical Metrics
- **Performance**: Tool discovery and workflow orchestration latency
- **Reliability**: Multi-tool workflow success rates
- **Compatibility**: Percentage of MCP tools successfully integrated

## Documentation Requirements

### User Documentation
- [ ] Prompt template format with tool trigger syntax
- [ ] Workflow orchestration patterns and examples
- [ ] Tool integration guide for external MCP tools
- [ ] Troubleshooting guide for workflow failures

### Developer Documentation  
- [ ] MCP tool integration specification
- [ ] Prompt-tool mapping architecture
- [ ] Workflow engine API documentation
- [ ] Tool discovery and registration protocols

## Future Considerations

### Potential Extensions
- Integration with external workflow engines (GitHub Actions, Jenkins)
- Visual workflow designer for non-technical users
- Machine learning optimization of tool selection and parameters
- Multi-tenant prompt libraries for organizational patterns

### Scalability Considerations
- Tool registry performance with large numbers of MCP tools
- Workflow state management for long-running processes
- Resource utilization for AI-powered parameter generation

---

## Milestones & Progress Tracking

### Milestone 1: Foundation Architecture ⏳
**Target**: Week 2
**Success Criteria**: 
- Prompt templates can specify tool triggers
- Basic sequential tool chaining works
- Integration with existing dot-ai MCP tools

**Progress**: Not started

### Milestone 2: AI Parameter Generation ⏳  
**Target**: Week 4
**Success Criteria**:
- AI generates tool parameters from natural language
- Parameter validation and error handling
- Tool selection based on context

**Progress**: Not started

### Milestone 3: Workflow Orchestration ⏳
**Target**: Week 6  
**Success Criteria**:
- Complex workflow patterns (conditional, parallel)
- Error handling and rollback mechanisms
- Context preservation across tools

**Progress**: Not started

### Milestone 4: Tool Discovery System ⏳
**Target**: Week 8
**Success Criteria**:
- Automatic discovery of external MCP tools
- Tool registry and capability mapping
- Integration standards and protocols

**Progress**: Not started

### Milestone 5: Production Ready ⏳
**Target**: Week 10
**Success Criteria**:
- Full documentation and examples
- Performance optimization complete
- Integration testing with external tools

**Progress**: Not started

---

**Last Updated**: 2025-07-31
**Next Review**: TBD