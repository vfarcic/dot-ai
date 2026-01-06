# PRD #323: Consolidate Duplicated Constants and Messages

## Executive Summary

Eliminate code duplication by creating a centralized constants system that consolidates hardcoded strings, error messages, and repeated text throughout the codebase. This technical improvement will reduce maintenance burden, improve consistency, and establish a foundation for future internationalization.

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
- [ ] All investigation messages use centralized constants
- [ ] All validation error messages follow standardized templates  
- [ ] All user-facing text consolidated into typed constants
- [ ] No hardcoded strings for common operations (success/failure/loading states)
- [ ] Template functions support dynamic message generation
- [ ] Comprehensive test coverage for message generation

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
└── operations.ts      # CRUD operation messages
```

### Key Features
1. **Typed Constants**: TypeScript const assertions for compile-time safety
2. **Template Functions**: Dynamic message generation with parameters
3. **Categorized Organization**: Logical grouping by functional domain
4. **Consistent Patterns**: Standardized naming and structure conventions
5. **Future-Ready**: Foundation for internationalization (i18n)

### Implementation Strategy
- **Phase 1**: Infrastructure and high-impact duplications (investigation messages)
- **Phase 2**: Validation and error message consolidation  
- **Phase 3**: User interface and workflow messages
- **Phase 4**: Testing, documentation, and final cleanup

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
- [ ] Consolidate all "Missing required parameter" messages
- [ ] Create validation message templates with parameters
- [ ] Update capability-tools.ts, kubectl-tools.ts, and related files
- [ ] Implement error message template functions

**Validation Criteria**:
- All validation messages use centralized templates
- Consistent error message format across tools
- Template functions support dynamic parameter injection

### Milestone 3: Error Handling Integration
**Target**: Week 2
- [ ] Integrate constants with existing error-handling.ts
- [ ] Consolidate authentication and network error messages
- [ ] Standardize Kubernetes error message patterns
- [ ] Update AI service error messages

**Validation Criteria**:
- Error handling system uses centralized messages
- Consistent error categorization and messaging
- Enhanced user experience with clear error messages

### Milestone 4: User Interface Message Consolidation  
**Target**: Week 2-3
- [ ] Consolidate stage-specific instructions and guidance
- [ ] Standardize success/failure notification messages
- [ ] Unify loading and processing state messages
- [ ] Update workflow completion messages

**Validation Criteria**:
- All user-facing messages use centralized constants
- Consistent terminology across different workflows
- Professional and polished user experience

### Milestone 5: Testing and Quality Assurance
**Target**: Week 3
- [ ] Comprehensive test coverage for message generation
- [ ] Validate no functionality regressions
- [ ] Performance testing for message templates
- [ ] Code review and quality validation

**Validation Criteria**:
- 100% test coverage for new constants system
- No performance degradation
- All functionality preserved during migration

### Milestone 6: Documentation and Finalization
**Target**: Week 3-4
- [ ] Developer documentation for constants patterns
- [ ] Update core index.ts exports
- [ ] Create contribution guidelines for new messages
- [ ] Final cleanup and optimization

**Validation Criteria**:
- Complete developer documentation
- Clear patterns for future contributors
- Optimized and production-ready implementation

## Risks and Mitigation

### Technical Risks
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaking existing functionality | High | Low | Comprehensive testing during migration |
| Performance degradation | Medium | Low | Benchmark static vs template performance |
| Developer adoption resistance | Medium | Medium | Clear documentation and gradual migration |
| Missed message instances | Medium | Medium | Comprehensive search and systematic approach |

### Process Risks  
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Scope creep into full i18n | Low | Medium | Clear boundaries and phased approach |
| Inconsistent implementation | Medium | Medium | Code review and pattern documentation |
| Timeline extension | Low | Low | Conservative milestone planning |

## Testing Strategy

### Unit Testing
- **Message Generation**: Test all template functions with various parameters
- **Type Safety**: Validate TypeScript compilation with new constants
- **Edge Cases**: Test empty parameters, special characters, long strings

### Integration Testing  
- **Functionality Preservation**: Ensure no regressions in existing features
- **Cross-Module**: Validate constants work across different modules
- **Error Scenarios**: Test error message generation in failure cases

### Performance Testing
- **Template Performance**: Benchmark vs hardcoded strings
- **Memory Usage**: Validate no memory leaks from message generation
- **Build Performance**: Ensure no impact on compilation time

## Future Considerations

### Internationalization Foundation
The centralized constants system provides foundation for future i18n support:
- Message templates can be extended with locale-specific variants
- Parameter injection patterns support translated content
- Categorized organization enables selective translation priorities

### Message Analytics
Future opportunities for message effectiveness analysis:
- Track which error messages users encounter most
- Analyze user response to different message variants
- A/B testing framework for message optimization

### Advanced Features
- **Message Versioning**: Support for message evolution over time
- **Context-Aware Messages**: Dynamic messages based on user state
- **Message Personalization**: User-specific message customization

## Definition of Done

### Code Quality
- [ ] All duplicated messages consolidated into constants
- [ ] TypeScript compilation passes with strict mode
- [ ] ESLint and Prettier compliance
- [ ] No hardcoded strings in affected files

### Testing
- [ ] Unit tests for all message template functions  
- [ ] Integration tests prove no functionality regression
- [ ] Performance benchmarks show no degradation
- [ ] Edge case testing completed

### Documentation
- [ ] Developer documentation for constants patterns
- [ ] Code comments explain template usage
- [ ] Contribution guidelines updated
- [ ] ADR (Architecture Decision Record) created

### Review and Validation
- [ ] Code review completed and approved
- [ ] QA testing in development environment
- [ ] Performance validation completed
- [ ] Security review (if applicable)

## Appendix

### Current Duplication Analysis
**High Priority Duplications Identified:**
1. Investigation wrapUp message (2 instances) ✅ Fixed
2. "Missing required parameter" pattern (20+ instances)
3. Validation error formats (multiple patterns)
4. Stage instruction messages (repeated across tools)
5. Success/failure operation messages

### Message Categories Defined
1. **Investigation**: AI workflow and tool loop messages
2. **Validation**: Parameter and input validation errors  
3. **Errors**: Error templates and specific error messages
4. **Stages**: Workflow stage instructions and guidance
5. **Operations**: CRUD operation status and confirmation
6. **UI**: User interface prompts and notifications

---

**PRD Status**: ✅ Complete and Ready for Implementation
**Last Updated**: January 6, 2026
**Next Review**: After Milestone 3 completion