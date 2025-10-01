# PRD: Unified Deployment Tool (recommend)

**Status**: In Progress
**Created**: 2025-01-20
**Last Updated**: 2025-10-01
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

Extend the **`recommend` tool** with stage-based routing to consolidate the entire deployment workflow into a single MCP tool, following the same pattern as `remediate` and `manageOrgData`.

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
  stage?: 'recommend' | 'chooseSolution' | 'answerQuestion' | 'generateManifests' | 'deployManifests',
  // Default: 'recommend' if stage is undefined/empty

  // All existing parameters from 5 tools
  intent?: string,
  final?: boolean,
  solutionId?: string,
  answers?: object,
  timeout?: number,
  // etc...
}
```

**Stage Parameter Behavior**: When `stage` is undefined or omitted, it defaults to `'recommend'`. This simplifies initial deployment requests where users can call `recommend({ intent: "deploy database" })` without explicitly specifying the stage.

## Success Criteria

### Must Have
- [ ] Single `recommend` tool with stage routing replaces 5-tool orchestration
- [ ] Identical user experience to current workflow
- [ ] All existing tool functions work unchanged
- [ ] Complete workflow from intent to deployment
- [ ] Clean cutover with immediate removal of 4 separate tools (chooseSolution, answerQuestion, generateManifests, deployManifests)

### Should Have  
- [ ] Improved error handling through unified workflow
- [ ] Enhanced debugging through consolidated logging
- [ ] Simplified agent integration patterns

## Implementation Milestones

### Milestone 1: Core Tool Structure ✅
- [x] Extend `recommend` tool with stage-based routing
- [x] Implement stage routing system in recommend handler
- [x] Route to existing tool handlers based on stage
- [x] Validate basic parameter passing with stage

### Milestone 2: MCP Integration ✅
- [ ] Update `recommend` tool MCP registration
- [ ] Remove 4 separate tool registrations (chooseSolution, answerQuestion, generateManifests, deployManifests)
- [ ] Update `recommend` registration with unified schema supporting stage parameter
- [ ] Test MCP tool discovery shows single `recommend` tool

### Milestone 3: Complete Workflow Testing ✅
- [ ] Test each stage routing correctly
- [ ] Validate parameter passing between stages
- [ ] Test complete deployment workflows
- [ ] Ensure session continuity

### Milestone 4: Test Suite Updates ✅
- [x] Update `tests/integration/tools/recommend.test.ts` to test stage-based routing
- [x] Refactor test to include `stage` parameter in all calls
- [x] Ensure all 5 workflow stages validated (recommend, chooseSolution, answerQuestion, generateManifests, deployManifests)
- [x] Validate default stage behavior (undefined → 'recommend')
- [ ] Performance testing

### Milestone 5: Documentation & Migration ✅
- [ ] Update shared prompts to reference stage parameter
- [ ] Update MCP documentation for `recommend` tool with stages
- [ ] Create migration guide showing stage parameter usage
- [ ] Update user guides and examples

### Milestone 6: Backwards Compatibility ✅
~~This milestone has been removed based on design decision to perform immediate cutover without backwards compatibility period.~~

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

## Design Decisions

### Decision 1: Immediate Tool Removal (2025-10-01)
**Decision**: Remove all 5 separate MCP tools immediately without backwards compatibility period

**Rationale**:
- Simplifies implementation and testing
- Eliminates maintenance burden of parallel tool sets
- Cleaner architecture with single tool interface
- No existing external integrations to migrate

**Impact**:
- Milestone 6 (Backwards Compatibility) removed from scope
- Success criteria updated to reflect clean cutover approach
- MCP registration will only include unified `deploy` tool
- No deprecation warnings or migration timeline needed

**Code Impact**: `src/interfaces/mcp.ts` will remove 4 tool registrations (chooseSolution, answerQuestion, generateManifests, deployManifests) and update `recommend` registration with unified schema

---

### Decision 2: Default Stage Behavior (2025-10-01)
**Decision**: Empty/undefined `stage` parameter defaults to `'recommend'`

**Rationale**:
- Simplifies initial deployment requests
- Users can start workflow with just `deploy({ intent: "..." })`
- Reduces cognitive load for most common use case
- Follows principle of least surprise

**Impact**:
- Parameter schema documentation updated
- Router implementation includes default logic
- Integration tests validate default behavior

**Code Impact**:
```typescript
const stage = args.stage || 'recommend'; // Default routing
```

---

### Decision 4: Integration Test Update Strategy (2025-10-01)
**Decision**: Update existing `recommend.test.ts` integration tests to test stage-based routing instead of creating new test files

**Rationale**:
- Existing `tests/integration/tools/recommend.test.ts` already covers complete 5-stage deployment workflow
- Follows integration testing principle: "Eliminate Redundancy - always check if functionality is already covered"
- Maintains "One Comprehensive Test" pattern from integration testing standards
- Reduces maintenance burden by updating rather than duplicating test coverage

**Impact**:
- Milestone 4 scope changed from "create integration tests" to "update existing integration tests"
- Test file will be renamed/refactored to test `deploy` tool instead of separate `recommend` tool
- All existing workflow coverage preserved while validating unified tool interface

**Code Impact**: `tests/integration/tools/recommend.test.ts` will be updated to include `stage` parameter in calls instead of using separate tool endpoints

---

### Decision 3: Test-Driven Development Approach (2025-10-01)
**Decision**: Implement using strict TDD methodology (tests before code)

**Rationale**:
- Ensures comprehensive test coverage from start
- Validates design before implementation
- Catches integration issues early
- Provides living documentation of expected behavior

**Impact**:
- Implementation order changed: tests → code → validation
- Integration tests created before tool implementation
- Each milestone requires passing tests before proceeding

**Code Impact**: `tests/integration/tools/recommend.test.ts` updated with stage parameters first, then `src/tools/recommend.ts` and `src/interfaces/mcp.ts` updated to implement routing and pass tests

---

### Decision 5: Use `recommend` Tool Name Instead of `deploy` (2025-10-01)
**Decision**: Keep tool name as `recommend` with stage-based routing instead of creating new `deploy` tool

**Rationale**:
- `recommend` is already the natural entry point for the deployment workflow
- More intuitive for users - "recommend" encompasses the full deployment journey from intent to deployment
- Avoids confusion with kubectl deploy/deployManifests commands
- Maintains existing tool naming conventions while consolidating functionality
- Users already understand `recommend` as the starting point

**Impact**:
- Tool naming: Use `recommend` (not `deploy`) for unified tool
- API endpoint remains: `/api/v1/tools/recommend`
- Test file naming: `recommend.test.ts` already correct, no rename needed
- Success criteria updated to reference `recommend` tool
- Documentation clarity: "recommend with stages" is more descriptive than "deploy"

**Code Impact**:
```typescript
// MCP registration uses 'recommend' as tool name
export const RECOMMEND_TOOL_NAME = 'recommend';

// Routing logic within recommend tool handler
const stage = args.stage || 'recommend'; // Default to initial stage
switch (stage) {
  case 'recommend': return handleRecommendLogic(...);
  case 'chooseSolution': return handleChooseSolutionTool(...);
  // etc...
}
```

---

## Definition of Done

- [ ] `recommend` tool extended with stage-based routing
- [ ] MCP registration updated (4 separate tools removed: chooseSolution, answerQuestion, generateManifests, deployManifests)
- [ ] All existing workflows function identically
- [ ] Tests passing (integration tests updated in `recommend.test.ts` to validate stage routing)
- [ ] Documentation updated
- [ ] Integration tests validate all stages including default behavior

## Progress Log

### 2025-01-20
- **Created**: Initial PRD and implementation planning
- **Status**: Beginning implementation with core tool structure

### 2025-10-01 (Morning)
- **Design Decisions**: Captured 3 key decisions from implementation planning
  - Immediate tool removal (no backwards compatibility)
  - Default stage behavior (undefined → 'recommend')
  - Test-Driven Development approach
- **PRD Updates**: Updated success criteria, parameter schema, and removed Milestone 6
- **Status**: Ready to begin TDD implementation starting with integration tests

### 2025-10-01 (Afternoon): TDD Preparation - Integration Tests Written
**Duration**: ~2 hours
**Focus**: Test-driven development preparation and design decisions

**Completed PRD Items**:
- [x] Decision 5: Use `recommend` tool name instead of `deploy` - Evidence: PRD updated with rationale and code examples
- [x] Update integration tests for stage-based routing - Evidence: tests/integration/tools/recommend.test.ts refactored with stage parameters
- [x] Define stage routing format - Evidence: `answerQuestion:required` pattern documented
- [x] Define agent instruction format - Evidence: `'Call recommend tool with stage: X'` pattern in tests

**Key Decisions Made**:
- **Tool naming**: Keep `recommend` (not `deploy`) for intuitive user experience and avoid confusion with kubectl deploy
- **Stage format**: Use colon notation (`answerQuestion:required`) to combine routing with sub-parameters, eliminating parameter naming conflicts
- **Agent instructions**: Explicit format `'Call recommend tool with stage: X'` for maximum clarity to AI agents

**Test Updates**:
- Updated all API calls from separate tool endpoints to unified `/api/v1/tools/recommend` with stage parameter
- Updated all response expectations to use `tool: 'recommend'`
- Updated all `nextAction` instructions to reference stage-based routing
- Added test coverage for default stage behavior (omitted stage defaults to 'recommend')

**Next Session Priorities**:
1. Implement stage routing in `src/tools/recommend.ts` handler
2. Update MCP registration in `src/interfaces/mcp.ts` to remove 4 separate tools
3. Run integration tests to validate implementation (tests currently written but will fail until implementation complete)

---

*This PRD represents a consolidation effort to simplify tool orchestration while maintaining identical functionality and user experience.*