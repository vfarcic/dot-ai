# PRD: Consolidate Documentation Testing Issues and Recommendations Format

**GitHub Issue**: [#34](https://github.com/vfarcic/dot-ai/issues/34)  
**Status**: Planning  
**Priority**: Medium  
**Start Date**: 2025-07-23  
**Target Completion**: TBD  

## Overview

Simplify the documentation testing tool output format by consolidating separate "issues" and "recommendations" arrays into a single "issues" format where each issue contains both the problem description and its solution.

## Problem Statement

The current documentation testing tool returns results in a format with redundant information:

```json
{
  "whatWasDone": "...",
  "issues": ["Problem description", "Another problem"],
  "recommendations": ["Fix for first problem", "Fix for second problem"]
}
```

**Problems with current approach:**
- **Redundant work**: AI generates essentially the same information twice
- **Processing complexity**: Clients must correlate issues with their solutions  
- **Missed connections**: Easy to have issues without recommendations or vice versa
- **User experience**: People want both "what's wrong" AND "how to fix it" together
- **Prompt complexity**: Instructions are more complex with separate arrays

## Success Criteria

**Primary Goals:**
- Single consolidated format with issues containing both problem and solution
- Simplified AI prompt instructions and client processing
- Complete information available in one place per issue
- No loss of detail from current format

**Quality Gates:**
- All documentation testing prompts use identical format
- Clear examples and instructions for new format
- MCP server correctly processes consolidated format
- Improved user experience with complete problem+solution context

## Implementation Milestones

### Phase 1: Format Design & Examples
- [ ] **Define consolidated format standard** - Create new JSON structure with "Problem. Fix: Solution" pattern and provide clear examples

### Phase 2: Update All Testing Prompts  
- [ ] **Update all documentation testing prompts** - Apply new format to `doc-testing-test-section.md`, `doc-testing-scan.md`, and related prompts
- [ ] **Remove recommendations arrays** - Eliminate all references to separate recommendations field

### Phase 3: Validation & Documentation
- [ ] **Test new format with sample documents** - Validate consolidated format works with real documentation testing scenarios
- [ ] **Update any client code** - Ensure MCP server and any processing code handles new format correctly

## Technical Approach

**Target Format:**
```json
{
  "whatWasDone": "Brief summary of testing performed",
  "issues": [
    "In 'Section Name': Problem description. Fix: Specific actionable solution",
    "Under 'Heading': Another problem description. Fix: Another specific solution"
  ]
}
```

**Format Requirements:**
- **Location specificity**: Each issue includes precise location (section, heading)
- **Problem clarity**: Clear description of what's wrong or missing
- **Solution specificity**: Exact actionable fix following "Fix:" prefix
- **User impact focus**: Emphasize how problems affect user success
- **Consistent structure**: "[Location]: [Problem]. Fix: [Solution]" pattern

## Risk Assessment

### Technical Risks
- **🟢 Low: Format processing issues** - Simpler format should be easier to process
  - *Mitigation*: JSON structure remains valid, just removes one field
  - *Testing*: Validate with actual MCP server and client tools

- **🟢 Low: Information loss** - All current information preserved in new format
  - *Mitigation*: Format includes same problem and solution details
  - *Validation*: Compare information completeness before and after

### User Experience Risks
- **🟢 Low: User confusion** - New format is more intuitive than current
- **🟢 Low: Tool adoption** - Simplified format should improve adoption

## Dependencies

### Internal Dependencies
- **MCP server functionality** - Must continue processing JSON output correctly
- **Documentation testing session handling** - Existing session management should be unaffected
- **Client agent compatibility** - MCP clients should handle simplified format easily

### External Dependencies
- **No external blockers identified** - This is internal format improvement

## Content Location Map

This PRD focuses on updating internal tool prompts:

### Files to Update
- `prompts/doc-testing-test-section.md` - Main testing prompt with output format
- `prompts/doc-testing-scan.md` - Scanning prompt if it uses similar format
- `prompts/doc-testing-done.md` - Completion prompt if it references format
- Any other prompts in `prompts/` directory that use issues/recommendations structure

### Files to Verify
- MCP server code that processes documentation testing results
- Any client-side code that handles documentation testing output
- Documentation that describes the testing tool format

## Decision Log

### 2025-07-23: Format Approach Decision
**Decision**: Use single string format with "Fix:" separator instead of structured objects  
**Rationale**: Simpler for AI to generate, easier for clients to process, maintains readability  
**Impact**: Reduces JSON complexity while preserving all necessary information  

### 2025-07-23: Backward Compatibility Decision
**Decision**: No backward compatibility required  
**Rationale**: Clean break allows better design, no critical dependencies on old format  
**Impact**: Simplifies implementation and reduces technical debt  

## Work Log

### 2025-07-23: PRD Creation
**Duration**: 30 minutes  
**Tasks Completed**:
- [x] Created GitHub issue #34
- [x] Created milestone-focused PRD document
- [x] Defined new consolidated format structure
- [x] Identified all prompt files requiring updates
- [x] Planned implementation phases for systematic rollout

**Next Session Priority**: Begin Phase 1 with updating main documentation testing prompt format instructions