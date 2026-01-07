# PRD #323: Consolidate Duplicated Constants and Messages

## Executive Summary

Eliminate code duplication by creating a centralized constants system that consolidates actually-duplicated hardcoded strings, error messages, and repeated text throughout the codebase. This technical improvement reduces maintenance burden and improves consistency for messages that were genuinely duplicated across multiple files.

## Problem Statement

### Current State
- Hardcoded strings duplicated across multiple files (e.g., wrapUp message in both host-provider.ts and vercel-provider.ts)
- Inconsistent error message formats and wording
- No central place to manage user-facing text
- Difficult to maintain message consistency
- Risk of typos and inconsistencies when updating messages

### Impact of Current State
- **Maintenance Burden**: Changes to messages require updates in multiple locations
- **Inconsistency Risk**: Same concepts expressed differently across the application  
- **Technical Debt**: Code smell that will compound over time
- **Developer Experience**: Harder to find and update messages consistently
- **Quality Issues**: Inconsistent error messages confuse users

## Goals and Success Criteria

### Primary Goals
1. **Eliminate Duplication**: Remove all instances of duplicated constants and messages
2. **Centralize Management**: Create single source of truth for all application text
3. **Improve Consistency**: Standardize message formats and terminology
4. **Enable Type Safety**: Leverage TypeScript for compile-time validation of message usage

### Success Metrics
- **Code Duplication**: Reduce hardcoded string duplication by 90%+
- **Message Consistency**: Achieve 100% consistent terminology across similar operations
- **Maintainability**: Single location for message updates
- **Type Safety**: Zero runtime errors from missing or incorrect message references

### Success Criteria
- [x] All investigation messages use centralized constants
- [x] All validation error messages follow standardized templates  
- [x] Stage-specific instructions consolidated (answer-question.ts)
- [x] Template functions support dynamic message generation
- [x] No runtime errors from constants migration

## Solution Overview

### Technical Approach
Create a hierarchical constants system organized by functional domains:

```
src/core/constants/
├── index.ts           # Re-export everything
├── investigation.ts   # AI investigation messages  
├── validation.ts      # Parameter & input validation
├── errors.ts          # Error messages & templates
├── stages.ts          # Workflow stage messages
```

### Key Features
1. **Typed Constants**: TypeScript const assertions for compile-time safety
2. **Template Functions**: Dynamic message generation with parameters
3. **Categorized Organization**: Logical grouping by functional domain
4. **Consistent Patterns**: Standardized naming and structure conventions

### Implementation Strategy
- **Phase 1**: Infrastructure and high-impact duplications (investigation messages)
- **Phase 2**: Validation and error message consolidation  
- **Phase 3**: Stage instructions consolidation (answer-question.ts)

## User Stories

### As a Developer
- **Story**: I want to update error messages in one place
- **Benefit**: Consistent messaging across the entire application
- **Acceptance Criteria**: Single change updates message everywhere it's used

### As a Maintainer  
- **Story**: I want to ensure message consistency across features
- **Benefit**: Professional, polished user experience
- **Acceptance Criteria**: All similar operations use identical terminology

### As a Future Contributor
- **Story**: I want clear patterns for adding new messages
- **Benefit**: Easy onboarding and consistent code quality
- **Acceptance Criteria**: Documentation and examples for message patterns

## Technical Requirements

### Functional Requirements
1. **Message Templates**: Support parameterized messages for dynamic content
2. **Type Safety**: Compile-time validation of message usage
3. **Categorization**: Logical organization by functional domain
4. **Backwards Compatibility**: No breaking changes during migration
5. **Performance**: Zero runtime overhead for static messages

### Non-Functional Requirements
1. **Maintainability**: Clear organization and documentation
2. **Extensibility**: Easy to add new message categories
3. **Developer Experience**: IntelliSense support for message discovery
4. **Testing**: Comprehensive coverage for message generation
5. **Documentation**: Clear patterns and examples

### Technical Constraints
- Must maintain existing functionality during migration
- No runtime performance degradation
- TypeScript compatibility required
- Consistent with existing code patterns

## Dependencies and Integration

### Internal Dependencies
- **Core System**: Integration with existing error handling
- **Logging**: Consistent with current logging patterns  
- **Testing**: Compatible with existing test infrastructure
- **Build System**: No changes to build/deployment process

### External Dependencies
- **TypeScript**: Leverages const assertions and type system
- **Node.js**: Compatible with current runtime environment
- **Testing Framework**: Works with existing test setup

### Integration Points
1. **Error Handling**: Enhanced integration with error-handling.ts
2. **Logging Systems**: Consistent message formatting across loggers
3. **User Interfaces**: Standardized messaging for all user interactions
4. **API Responses**: Consistent error and success message formats

## Implementation Plan

### Milestone 1: Infrastructure and Core Messages ✅
**Target**: Week 1
- [x] Create constants directory structure
- [x] Implement investigation message constants
- [x] Update provider files to use centralized wrapUp message
- [x] Establish patterns for message categorization

**Validation Criteria**: 
- Constants infrastructure exists and is functional
- WrapUp message duplication eliminated
- Clear patterns established for future consolidation

### Milestone 2: Validation Message Consolidation
**Target**: Week 1-2
- [x] Consolidate all "Missing required parameter" messages
- [x] Create validation message templates with parameters
- [x] Update capability-tools.ts, kubectl-tools.ts, and related files
- [x] Implement error message template functions

**Validation Criteria**:
- All validation messages use centralized templates
- Consistent error message format across tools
- Template functions support dynamic parameter injection

### Milestone 3: Error Handling Integration
**Target**: Week 2
- [x] Integrate constants with existing error-handling.ts
- [x] Consolidate authentication and network error messages
- [x] Standardize Kubernetes error message patterns
- [x] Update AI service error messages

**Validation Criteria**:
- Error handling system uses centralized messages
- Consistent error categorization and messaging
- Enhanced user experience with clear error messages

### Milestone 4: Stage Instructions Consolidation ✅
**Target**: Week 2-3
- [x] Consolidate stage-specific instructions and guidance in answer-question.ts
- [x] Add missing constants (UNKNOWN_INSTRUCTIONS, UNKNOWN_MESSAGE)
- [x] Update STAGE_MESSAGES to match actual usage patterns
- [x] Verify TypeScript compilation and existing tests pass

**Validation Criteria**:
- Stage messages use centralized STAGE_MESSAGES constants
- No hardcoded stage instructions in answer-question.ts
- All existing functionality preserved

## Risks and Mitigation

### Technical Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking existing functionality | High | Low | Comprehensive testing during migration ✅ Mitigated |
| Missed message instances | Medium | Medium | Comprehensive search and systematic approach ✅ Mitigated |

### Process Risks  
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Scope creep into full i18n | Low | Medium | Clear boundaries - stayed focused on actual duplications ✅ Avoided |

## Definition of Done

### Code Quality
- [x] All identified duplicated messages consolidated into constants
- [x] TypeScript compilation passes
- [x] No breaking changes to existing functionality

### Testing
- [x] Existing unit tests continue to pass
- [x] No functionality regressions observed

### Implementation Complete
- [x] Constants infrastructure created (src/core/constants/)
- [x] Investigation messages consolidated
- [x] Validation messages consolidated  
- [x] Error messages consolidated
- [x] Stage instructions consolidated

## Appendix

### Duplication Analysis - Completed
**High Priority Duplications Fixed:**
1. ✅ Investigation wrapUp message (2 instances) - Consolidated
2. ✅ "Missing required parameter" pattern - Consolidated via VALIDATION_MESSAGES
3. ✅ Validation error formats - Consolidated via template functions
4. ✅ Stage instruction messages - Consolidated via STAGE_MESSAGES
5. ✅ Error message patterns - Consolidated via ERRORS constants

**Out of Scope (No Actual Duplication Found):**
- Success/failure operation messages - Context-specific, not duplicated
- Loading/processing state messages - Logger messages, not user-facing duplicates
- UI prompts and notifications - No real duplication identified

### Constants Files Created
1. **investigation.ts**: AI workflow and tool loop messages
2. **validation.ts**: Parameter and input validation errors  
3. **errors.ts**: Error templates and specific error messages
4. **stages.ts**: Workflow stage instructions and guidance
5. **index.ts**: Re-exports all constants

---

**PRD Status**: ✅ COMPLETE
**Last Updated**: January 6, 2026
**Completion Date**: January 6, 2026