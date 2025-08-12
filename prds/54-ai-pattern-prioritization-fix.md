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
- [x] Complete root cause investigation of pattern non-application
- [x] Document actual data flow from patterns to AI recommendations
- [x] Identify specific failure points in pattern prioritization
- **Success Criteria**: Clear understanding of why patterns are ignored ✅

### Milestone 2: Solution Implementation ⭐  
- [x] Implement fix for Problem 1 (AI ignoring patterns) based on root cause analysis
- [x] Implement fix for Problem 2 (missing auxiliary pattern resources)
- [x] sqls.devopstoolkit.live test case passes consistently
- [x] Pattern influence visible in recommendation explanations
- **Success Criteria**: Patterns are properly applied when applicable ✅

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

## Work Log

### 2025-08-11: Investigation Complete - Two Distinct Problems Identified and First Problem Solved
**Duration**: ~3 hours  
**Primary Focus**: Root cause analysis and solution implementation for pattern prioritization issues

**Problems Identified**:
1. **Problem 1 - AI ignoring patterns**: AI was making retroactive pattern claims instead of proactively using patterns to guide resource selection
2. **Problem 2 - Missing auxiliary pattern resources**: Resources suggested by patterns (like ResourceGroup) not appearing in capability search results due to semantic similarity gaps

**Completed PRD Items**:
- [x] **Root cause investigation complete** - Evidence: Identified two distinct failure modes through systematic analysis
- [x] **Data flow documentation** - Evidence: Traced pattern information from discovery through AI prompts, confirmed patterns reach AI correctly
- [x] **Failure point identification** - Evidence: Found AI cognitive workflow issue + auxiliary resource discovery gap
- [x] **Problem 1 solution implemented** - Evidence: Updated `prompts/resource-solution-ranking.md` with mandatory pattern analysis phase and pattern-aware scoring
- [x] **Pattern influence visibility** - Evidence: Updated prompts to show pattern reasoning in AI explanations

**Key Technical Insights**:
- Pattern-aware solution assembly was partially working - `sqls.devopstoolkit.live` correctly got high score (95) and ranked #1
- Real issue was twofold: AI wasn't following pattern-first workflow + auxiliary resources missing from search
- ResourceGroup exists in system but has low semantic similarity to "postgresql" queries, so never appears in capability results

**Problem 1 Solution Implemented**:
- Added mandatory pattern analysis phase before resource evaluation
- Implemented pattern-compliant scoring adjustments (+5-15 points for compliance)
- Changed cognitive workflow to: Pattern Analysis → Solution Construction → Scoring with Pattern Context

**Problem 2 Solution Options**:

**Primary Approach** (Simple - Preferred):
- Instruct AI to include pattern-suggested resources even if not in Available Resources list
- Leverage existing schema fetching pipeline that works with AI-selected resources
- Add prompt instruction: "Include ALL suggested resources from matching patterns in solutions"
- Schema fetching automatically handles pattern resources via kubectl explain

**Alternative Approach** (Complex - Fallback):
- Runtime aggregation of auxiliary pattern resources into capability search results
- Pattern resources positioned at bottom of list without artificial scoring  
- Only add pattern resources if not already present in capability results
- Requires capability lookup for pattern resources before prompt

**Next Session Priorities**:
- Try primary approach: Update prompt to instruct AI to include pattern resources
- Test with PostgreSQL/Azure scenario to validate ResourceGroup inclusion
- If primary approach fails, implement alternative resource aggregation approach
- Comprehensive regression testing to ensure non-pattern cases still work

### 2025-08-12: COMPLETE SOLUTION IMPLEMENTED AND VALIDATED ✅
**Duration**: ~2 hours  
**Primary Focus**: Final implementation of Problem 2 solution and comprehensive validation

**BOTH PROBLEMS SOLVED**:

**Problem 1 - Pattern Prioritization** ✅ **COMPLETE**:
- **Evidence**: PostgreSQL Azure test shows `sqls.devopstoolkit.live` as Solution 1 (score: 95) with "Database Golden Path Pattern"

**Problem 2 - Missing Auxiliary Resources** ✅ **COMPLETE**: 
- **Root cause**: Pattern-suggested auxiliary resources (like ResourceGroup) not included in resource selection phase
- **Solution**: Implemented `addMissingPatternResources()` method in `src/core/schema.ts` to pre-populate Available Resources list
- **Evidence**: Solutions 2-4 all show ResourceGroup in actual resources arrays, not just pattern influence claims

**Final Implementation Details**:

**Code Changes in `src/core/schema.ts`**:
- Added `addMissingPatternResources()` method to inject pattern resources into Available Resources list
- Enhanced resource selection phase to include pattern-suggested resources before AI selection
- Pattern resources marked with "organizational-pattern" source for identification

**Prompt Updates in `prompts/resource-selection.md`**:
- Simplified instructions to treat pattern resources naturally (no more "include invisible resources")
- Clear guidance that pattern resources appear in Available Resources with special marking
- Removed contradictory instructions about including resources "not in the list"

**Validation Results** (PostgreSQL in Azure test):
- **✅ 5 diverse solutions generated** with proper scoring and differentiation
- **✅ Solution 1: `sqls.devopstoolkit.live`** with Database Golden Path Pattern (score: 95)
- **✅ Solutions 2-4: Azure resources** with ResourceGroup actually included in resources arrays
- **✅ Proper pattern application logic** - ResourceGroup only appears with `azure.upbound.io` resources, not with `sqls.devopstoolkit.live`

**Current Status**: Milestone 2 complete ✅ - Both core problems resolved with comprehensive solution

### 2025-08-12: Test Suite Maintenance - 100% Pass Rate Achieved ✅
**Duration**: ~1 hour  
**Primary Focus**: Systematic resolution of test failures following architectural improvements

**Test Fixing Summary**:
- **Starting State**: 10 failing tests, 764 passing tests
- **Final Result**: 774 tests passing, 0 failing (100% pass rate) ✅
- **Tests Fixed**: 5 remaining test failures in `tests/core/schema.test.ts`

**Root Causes and Solutions Applied**:

1. **Capability Service Mock Issues** (4 tests affected):
   - **Problem**: Tests failing with "Cannot read properties of undefined (reading 'length')"
   - **Root Cause**: Missing `searchCapabilities` service mocks in tests
   - **Solution**: Added proper capability service mocks with correct data structure:
   ```typescript
   mockSearchCapabilities.mockResolvedValue([
     {
       data: {
         resourceName: 'pods',
         capabilities: ['container deployment'],
         providers: ['kubernetes'],
         complexity: 'low',
         useCase: 'Basic container deployment',
         description: 'Basic Pod deployment',
         confidence: 85
       }
     }
   ]);
   ```

2. **Old Array Format Compatibility** (3 tests affected):
   - **Problem**: Tests using deprecated `[{"kind": "Pod", ...}]` AI response format
   - **Root Cause**: Architecture migration from old array format to new solution format
   - **Solution**: Updated test mocks to use new solution format:
   ```typescript
   // Old format: [{"kind": "Pod", ...}]
   // New format: {solutions: [{type: "single", resources: [...], score: 85, ...}]}
   ```

3. **Outdated Error Message Expectations** (2 tests affected):
   - **Problem**: Tests expecting old two-phase architecture error messages
   - **Root Cause**: Single-phase architecture now handles scenarios that previously failed
   - **Solution**: Updated expected error messages and behaviors to match new architecture

4. **Architectural Behavior Changes** (1 test affected):
   - **Problem**: Test expecting failure for scenario that now works correctly
   - **Root Cause**: Improved architecture now succeeds where old system failed
   - **Solution**: Updated test to expect success instead of error

**Tests Fixed**:
- ✅ "should discover cluster options and populate questions"
- ✅ "should handle malformed JSON gracefully" 
- ✅ "should provide detailed debugging info for invalid resource indexes"
- ✅ "should include AI response context in error messages"
- ✅ "should warn about partial schema fetch failures"

**Technical Quality Maintained**:
- All fixes followed existing test patterns
- Mock data structures consistent with production code
- No functionality regressions introduced
- Test coverage maintained across all components

**Evidence of Success**: Final test run shows 774 passing tests, 0 failing tests (100% pass rate)