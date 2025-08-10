# PRD #54: AI Pattern Prioritization Investigation and Fix

**GitHub Issue**: [#54](https://github.com/vfarcic/dot-ai/issues/54)  
**Status**: Draft  
**Priority**: High  
**Owner**: TBD  

## Problem Statement

The AI recommendation system is not applying organizational patterns as expected. Despite patterns being discovered, passed to AI prompts, and their suggested resources being available in capability search results, the AI consistently chooses alternative resources.

**Observed Behavior**:
- User request: "PostgreSQL database in Azure"  
- Pattern exists: "Database deployment preference" pattern suggesting `sqls.devopstoolkit.live`
- Capability search results: `sqls.devopstoolkit.live` found at rank 11 (score 0.44)
- AI recommendation: Chose Azure FlexibleServer resources (ranks 1-3, higher scores)
- **Issue**: Pattern guidance was completely ignored, no mention of pattern or sqls in AI reasoning

## Current State Analysis

### What We Know Works ✅
- Pattern discovery and search functionality
- Patterns are passed to AI prompts (both resource selection and ranking phases)
- Pattern-suggested resources are found in capability searches
- Pattern influence data structures are implemented

### What's Not Working ❌
- AI recommendations don't reflect pattern guidance
- Pattern-suggested resources are ignored even when available
- No apparent pattern consideration in AI reasoning/explanations

### What We Don't Know Yet ❓
- Root cause of pattern non-application
- Whether this is prompt design, AI interpretation, or data formatting issue
- Whether patterns are actually reaching the AI in usable format
- If there are conflicting instructions in the prompts

## Investigation Areas

### Hypothesis 1: Prompt Design Issues
- Pattern instructions may be unclear or contradictory
- Scoring guidance might override pattern considerations
- AI may not understand how to balance patterns vs similarity scores

### Hypothesis 2: Data Formatting Problems  
- Pattern information might not be properly formatted for AI consumption
- Context limits might truncate pattern information
- Pattern data structure might be incompatible with AI processing

### Hypothesis 3: AI Interpretation Issues
- AI may be misunderstanding pattern application instructions
- Conflicting priorities in prompt guidance
- Pattern weighting insufficient compared to other factors

### Hypothesis 4: Implementation Gaps
- Pattern information might not actually reach the AI prompts
- Integration points between pattern service and AI prompts may have issues
- Pattern matching logic may have bugs

## Success Criteria

### Primary Objective
When organizational patterns match user intent AND suggested resources are available in capability results, the AI should prioritize pattern resources appropriately.

### Validation Test Cases
- **"PostgreSQL database in Azure"** → Should recommend sqls.devopstoolkit.live (with clear pattern rationale)
- **Pattern influence visibility** → Users should understand why specific resources were chosen
- **Fallback behavior** → When patterns don't apply, generic recommendations should work normally

### Success Metrics
1. Pattern compliance when applicable
2. Clear explanation of pattern influence in recommendations
3. No regression in non-pattern recommendation scenarios

## Investigation and Solution Approach

### Phase 1: Root Cause Investigation 🔍
**Objective**: Understand exactly why patterns are being ignored

**Investigation Tasks**:
- Analyze actual AI prompts and pattern data flow
- Test pattern information formatting and delivery to AI
- Review prompt instructions for conflicts or ambiguity
- Trace pattern data from discovery through to AI consumption

**Deliverables**: Clear understanding of the actual problem

### Phase 2: Solution Implementation 🔧
**Objective**: Fix the identified root cause

**Potential Solutions** (depending on findings):
- Enhanced prompt engineering with clearer pattern guidance
- Improved pattern data formatting for AI consumption
- Pattern scoring/weighting mechanism implementation
- Integration fixes between pattern service and AI prompts

**Deliverables**: Working pattern prioritization system

### Phase 3: Validation and Testing ✅
**Objective**: Ensure fix works and doesn't break existing functionality

**Tasks**:
- Comprehensive test coverage for pattern scenarios
- Regression testing for non-pattern recommendations  
- User experience validation with clear pattern explanations

**Deliverables**: Reliable, tested pattern prioritization feature

## Technical Scope

### Investigation Points
- `prompts/resource-selection.md` - How patterns are presented to AI
- `prompts/resource-solution-ranking.md` - How pattern guidance is structured  
- AI prompt data flow from pattern discovery to recommendation
- Pattern formatting and context delivery mechanisms

### Potential Changes (TBD based on investigation)
- Prompt template modifications
- Pattern data formatting improvements
- AI scoring mechanism adjustments
- Integration point fixes

### Testing Strategy
- Automated test for sqls.devopstoolkit.live prioritization scenario
- Pattern application validation across different use cases
- Regression testing to ensure existing functionality preserved

## Dependencies & Constraints

### Dependencies
- ✅ Pattern Vector Service (implemented)
- ✅ Capability Vector Service (implemented)  
- ✅ Pattern influence tracking structures (implemented)

### Constraints
- Must maintain recommendation quality for non-pattern scenarios
- Cannot break existing MCP interface compatibility
- Solution should be based on actual root cause, not assumptions

## Risks & Mitigations

### Risk: Complex Root Cause
- **Impact**: Solution might be more involved than prompt changes
- **Mitigation**: Thorough investigation before implementation

### Risk: Over-Engineering  
- **Impact**: Solving wrong problem or creating unnecessary complexity
- **Mitigation**: Evidence-based approach, validate assumptions before building

### Risk: Pattern Quality Issues
- **Impact**: Prioritizing bad patterns could degrade recommendations
- **Mitigation**: Ensure pattern validation and quality gates

## Milestones

### Milestone 1: Problem Diagnosis ⭐
- [ ] Complete root cause investigation of pattern non-application
- [ ] Document actual data flow from patterns to AI recommendations
- [ ] Identify specific failure points in pattern prioritization
- **Success Criteria**: Clear understanding of why patterns are ignored

### Milestone 2: Solution Implementation ⭐  
- [ ] Implement fix based on root cause analysis
- [ ] sqls.devopstoolkit.live test case passes consistently
- [ ] Pattern influence visible in recommendation explanations
- **Success Criteria**: Patterns are properly applied when applicable

### Milestone 3: Comprehensive Validation ⭐
- [ ] Test pattern prioritization across multiple scenarios
- [ ] Regression testing ensures non-pattern cases still work
- [ ] User documentation updated with pattern behavior
- **Success Criteria**: Reliable pattern application without breaking existing functionality

### Milestone 4: Production Readiness ⭐
- [ ] Feature deployed and monitored
- [ ] Pattern application success metrics tracked  
- [ ] User feedback on organizational governance effectiveness
- **Success Criteria**: Production-ready pattern prioritization system

## Out of Scope

### Not Included in This PRD
- **Pattern Discovery Enhancement**: Pattern search and matching already works
- **Two-Pass Architecture**: Different problem (PRD #53) for when pattern resources aren't found
- **Pattern Creation Tools**: Pattern authoring UX is separate concern
- **Resource Discovery Changes**: Capability search functionality works correctly

### Future Considerations
- Advanced pattern conflict resolution  
- Pattern analytics and effectiveness metrics
- Dynamic pattern weighting based on success rates