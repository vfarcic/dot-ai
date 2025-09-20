# PRD: Unified Deployment Tool (deploy)

**Status**: In Progress  
**Created**: 2025-01-20  
**Last Updated**: 2025-01-20  
**GitHub Issue**: [#114](https://github.com/vfarcic/dot-ai/issues/114)

## Problem Statement

The current Kubernetes deployment workflow requires users and AI agents to manually orchestrate **5 separate MCP tools** in sequence:

1. `recommend` - Get deployment recommendations  
2. `chooseSolution` - Select a specific solution
3. `answerQuestion` - Configure solution parameters
4. `generateManifests` - Create Kubernetes manifests
5. `deployManifests` - Deploy to cluster

This creates unnecessary complexity for:
- **AI Agents**: Must manage complex state and error handling across 5 tools
- **Developers**: Need to understand and coordinate multiple tool interactions
- **Integration**: Each tool integration point is a potential failure point

## Solution Overview

Create a **unified `deploy` tool** that consolidates the entire deployment workflow into a single MCP tool, following the same pattern as `remediate` and `manageOrgData`.

### Key Principles
- **Same User Experience**: Zero changes to user interaction patterns
- **Internal Routing**: Use `stage` parameter to route to existing tool handlers
- **Universal Scope**: Support deployment of anything accessible through Kubernetes API (including CRDs)
- **Function Reuse**: All existing tool functions remain unchanged

## Technical Approach

### Stage-Based Routing
Single tool with `stage` parameter routes to existing handlers:
- `stage: 'recommend'` → `handleRecommendTool()`
- `stage: 'chooseSolution'` → `handleChooseSolutionTool()`
- `stage: 'answerQuestion'` → `handleAnswerQuestionTool()`
- `stage: 'generateManifests'` → `handleGenerateManifestsTool()`
- `stage: 'deployManifests'` → `handleDeployManifestsTool()`

### Parameter Consolidation
Unified parameter schema accepts all parameters from existing tools plus routing:
```typescript
{
  stage?: string,
  // All existing parameters from 5 tools
  intent?: string,
  final?: boolean,
  solutionId?: string,
  answers?: object,
  // etc...
}
```

## Success Criteria

### Must Have
- [ ] Single `deploy` tool replaces 5-tool orchestration
- [ ] Identical user experience to current workflow
- [ ] All existing tool functions work unchanged
- [ ] Complete workflow from intent to deployment
- [ ] Backwards compatibility during transition period

### Should Have  
- [ ] Improved error handling through unified workflow
- [ ] Enhanced debugging through consolidated logging
- [ ] Simplified agent integration patterns

## Implementation Milestones

### Milestone 1: Core Tool Structure ✅
- [x] Create unified `deploy` tool scaffold
- [x] Implement stage-based routing system
- [x] Import and route to existing tool handlers
- [x] Validate basic parameter passing

### Milestone 2: MCP Integration ✅
- [ ] Update MCP server registration
- [ ] Remove 5 separate tool registrations
- [ ] Add single unified tool registration
- [ ] Test MCP tool discovery

### Milestone 3: Complete Workflow Testing ✅
- [ ] Test each stage routing correctly
- [ ] Validate parameter passing between stages
- [ ] Test complete deployment workflows
- [ ] Ensure session continuity

### Milestone 4: Test Suite Updates ✅
- [ ] Update existing tests for unified tool
- [ ] Create integration tests for complete workflow
- [ ] Ensure all existing functionality covered
- [ ] Performance testing

### Milestone 5: Documentation & Migration ✅
- [ ] Update shared prompts to use new tool
- [ ] Update MCP documentation
- [ ] Create migration guide for existing integrations
- [ ] Update user guides and examples

### Milestone 6: Backwards Compatibility ✅
- [ ] Maintain existing tools during transition
- [ ] Implement deprecation warnings
- [ ] Plan migration timeline
- [ ] Monitor adoption metrics

## Risk Assessment

### Low Risks
- **Function Changes**: All existing tool functions remain unchanged
- **User Experience**: Exact same interaction patterns maintained
- **Testing**: Existing tests can be adapted with minimal changes

### Medium Risks  
- **MCP Registration**: Changes to tool registration require careful validation
- **Parameter Handling**: Must ensure all parameters reach correct handlers

## Dependencies

### Internal Dependencies
- Existing deployment tools and handlers
- MCP server infrastructure
- Current parameter schemas
- Session management systems

### External Dependencies
- MCP protocol compliance
- Kubernetes API access
- Vector database services
- AI service integrations

## Definition of Done

- [ ] `deploy` tool implemented with stage-based routing
- [ ] MCP registration updated to single tool
- [ ] All existing workflows function identically
- [ ] Tests passing (unit, integration, workflow)
- [ ] Documentation updated
- [ ] Backwards compatibility maintained
- [ ] Migration guide available

## Progress Log

### 2025-01-20
- **Created**: Initial PRD and implementation planning
- **Status**: Beginning implementation with core tool structure

---

*This PRD represents a consolidation effort to simplify tool orchestration while maintaining identical functionality and user experience.*