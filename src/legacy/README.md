# Legacy Code Reference

This directory contains code that was replaced by the **stateful session-based MCP architecture** (Task 20). These files are preserved for reference during development of the new conversational tools.

## ⚠️ IMPORTANT

**DO NOT IMPORT OR USE ANY CODE FROM THIS DIRECTORY IN ACTIVE CODEBASE**

This is reference-only code to help understand patterns and logic that should be preserved in the new implementation.

## What's Preserved

### 📁 `core/solution-enhancer.ts`
- **Original**: `src/core/schema.ts` (lines 796-1010) 
- **Contains**: `SolutionEnhancer` class
- **Key Patterns**:
  - Solution validation logic (`applyEnhancements` method)
  - Question answer processing patterns
  - Error handling approaches
  - Resource mapping validation techniques
  - JSON schema validation methods

### 📁 `tools/enhance-solution.ts`
- **Original**: `src/tools/enhance-solution.ts`
- **Contains**: Complete enhance_solution tool implementation
- **Key Patterns**:
  - Input validation logic
  - Claude API key checking
  - Solution data parsing and validation
  - Open response extraction and validation
  - Error handling with detailed context
  - Integration with SolutionEnhancer class

## Replaced By

The legacy JSON-heavy approach was replaced by:

- **Task 20.1**: File-based session storage infrastructure
- **Task 20.2**: This legacy migration (completed)
- **Task 20.3**: `chooseSolution` tool (stateful solution selection)
- **Task 20.4**: `answerQuestion` tool (conversational question flow)

## Why Moved

### Problems with Legacy Approach
1. **JSON Complexity**: Agents had to manually construct complex JSON structures
2. **High Error Rate**: 80% of agent errors due to JSON syntax issues
3. **Overwhelming UX**: All questions presented at once
4. **State Management**: Complex validation in single-pass operations

### Benefits of New Approach
1. **Conversational Flow**: Natural dialogue instead of JSON construction
2. **Progressive Disclosure**: Questions asked incrementally
3. **Better Error Recovery**: Clear guidance for agents
4. **Session State**: Persistent storage across interactions

## Reference Guidelines

When implementing new stateful tools, reference these files for:

### ✅ Patterns to Preserve
- **Validation Logic**: How to validate solution data and answers
- **Error Handling**: Detailed error context with actionable suggestions
- **AI Integration**: How to interact with Claude for enhancement
- **Resource Discovery**: Integration with cluster discovery systems

### ❌ Patterns to Avoid
- **JSON String Passing**: Don't make agents construct complex JSON
- **Single-Pass Operations**: Use conversation state instead
- **Overwhelming Questions**: Use progressive disclosure
- **Cryptic Errors**: Provide clear, actionable guidance

## Timeline

- **Moved**: 2025-07-01 (Task 20.2)
- **Reason**: Replaced by stateful session architecture
- **Migration**: Safe - all tests passing without these files
- **Future**: May be deleted after new architecture is stable

---

**Remember**: This code worked well, but the user experience for agents was problematic. The new stateful approach maintains all the sophisticated functionality while dramatically improving agent usability.