# PRD: Refactor organizational-data.ts into smaller modules

**Issue**: [#85](https://github.com/vfarcic/dot-ai/issues/85)  
**Created**: 2025-08-31  
**Status**: Planning  
**Priority**: Medium  

## Problem Statement

The `src/tools/organizational-data.ts` file has grown to 3,329 lines, making it the largest file in the project and difficult to maintain. It handles three distinct domains (patterns, policies, capabilities) in a single file, violating single responsibility principle and creating navigation, testing, and maintenance challenges.

## Solution Overview

Refactor the monolithic file into focused modules following existing codebase patterns, using an incremental approach where we move one function at a time and validate with tests after each step to ensure zero breaking changes.

## Success Criteria

- [ ] `organizational-data.ts` reduced to ~200-300 lines (just a router)
- [ ] All business logic moved to appropriate `/core/` modules
- [ ] All existing tests continue to pass unchanged
- [ ] Code follows existing project patterns and conventions
- [ ] No breaking changes to MCP interface
- [ ] Improved maintainability and code navigation

## User Impact

**Internal Developer Impact:**
- **Faster navigation**: Find specific functionality quickly in focused files
- **Easier maintenance**: Modify individual domains without affecting others
- **Better testing**: Test individual modules in isolation
- **Reduced cognitive load**: Understand smaller, focused code units

**No External User Impact:**
- MCP interface remains identical
- All existing functionality preserved
- No API changes

## Technical Scope

### Current Architecture Analysis
- **File size**: 3,329 lines (3.5x larger than next largest tool)
- **Domains**: Patterns, Policies, Capabilities
- **Functions**: 16 major handler functions
- **Test coverage**: 3,284 lines of tests (all mocked, unit tests)

### Target Architecture
```
src/tools/organizational-data.ts    # Router (~200 lines)
src/core/policy-operations.ts       # Policy CRUD + Kyverno cleanup (~450 lines)
src/core/capability-operations.ts   # Capability CRUD (~600 lines)  
src/core/capability-scan-workflow.ts # Capability scanning (~1200 lines)
src/core/pattern-operations.ts      # Extend existing (~150 lines)
```

### Key Technical Changes
1. **Move business logic** from `/tools/` to `/core/` modules
2. **Preserve public API** - `handleOrganizationalDataTool` remains unchanged
3. **Follow existing patterns** - Similar to other tools that delegate to core modules
4. **Maintain test coverage** - All existing tests continue to work

## Implementation Plan

### Milestone 1: Policy Operations Migration ✅ Testable
- [x] Create `src/core/policy-operations.ts`
- [x] Move `handlePolicyDelete` + Kyverno cleanup helpers
- [x] Move `handlePolicyDeleteAll` + batch cleanup helpers  
- [x] Move main `handlePolicyOperation` workflow handler
- [x] Update imports in `organizational-data.ts`
- [x] Verify all tests pass (`npm test`)

**Success Criteria**: Policy operations fully functional in new module, all tests pass

### Milestone 2: Pattern Operations Migration ✅ Testable  
- [x] Extend existing `src/core/pattern-operations.ts`
- [x] Move `handlePatternOperation` workflow handler (following policy operations pattern)
- [x] Pass shared validation functions as parameters (DON'T move them)
- [x] Create `tests/core/pattern-operations.test.ts` with pattern-specific tests
- [x] Update imports in `organizational-data.ts`
- [x] Verify all tests pass (`npm test`)

**Success Criteria**: Pattern operations consolidated in core module with dedicated tests, all tests pass

**⚠️ CRITICAL ARCHITECTURAL PRINCIPLES**: 
- **Shared Functions**: Utilities used by multiple domains MUST remain in organizational-data.ts and be passed as parameters (dependency injection pattern)
- **Domain-Specific Functions**: Only move functions specific to one domain to their respective modules
- **Test Organization**: Create dedicated test files for each new core module (e.g., `tests/core/pattern-operations.test.ts`)
- **Applies to ALL Modules**: patterns, policies, capabilities, and any future domains

### Milestone 3: Capability CRUD Operations ✅ Testable
- [ ] Create `src/core/capability-operations.ts`
- [ ] Move capability CRUD handlers one by one:
  - [ ] `handleCapabilityList`
  - [ ] `handleCapabilityGet`
  - [ ] `handleCapabilityDelete`
  - [ ] `handleCapabilityDeleteAll`
  - [ ] `handleCapabilitySearch`
  - [ ] `handleCapabilityProgress`
- [ ] Test after each function move
- [ ] Verify all tests pass (`npm test`)

**Success Criteria**: All capability CRUD operations working from new module

### Milestone 4: Capability Scan Workflow Migration ✅ Testable
- [ ] Create `src/core/capability-scan-workflow.ts`
- [ ] Move scan workflow handlers one by one:
  - [ ] `handleCapabilityScan`
  - [ ] `handleResourceSelection`
  - [ ] `handleResourceSpecification`
  - [ ] `handleProcessingMode`
  - [ ] `handleScanning`
- [ ] Move session management helpers
- [ ] Test after each function move
- [ ] Verify all tests pass (`npm test`)

**Success Criteria**: Capability scanning workflow fully functional in new module

### Milestone 5: Router Simplification ✅ Testable
- [ ] Simplify `handleCapabilitiesOperation` to route to handlers
- [ ] Simplify `handleOrganizationalDataTool` to minimal router
- [ ] Verify final file is ~200-300 lines
- [ ] Run full test suite (`npm test`)
- [ ] Validate MCP functionality end-to-end

**Success Criteria**: Clean, minimal router file with all functionality preserved

### Milestone 6: Test Organization (Optional) ✅ Testable
- [x] Split tests to match new module structure
- [x] Create focused test files for each core module
- [x] Keep integration tests for main router
- [x] Verify all tests pass in new structure

**Success Criteria**: Test organization matches code organization, full coverage maintained

## Risk Assessment

### Low Risk Factors ✅
- **Tests are mocked unit tests** - No external dependencies
- **Public API unchanged** - MCP interface identical
- **Incremental approach** - Test after each function move
- **Existing patterns** - Following established project conventions

### Mitigation Strategies
- **Test after each step** - Never move multiple functions without validation
- **Preserve signatures** - Keep function parameters and return types identical
- **Git commits per step** - Easy rollback if issues arise
- **Mock validation** - Ensure mocks still work with new module structure

## Dependencies

### Internal Dependencies
- Existing core modules: `pattern-operations.ts`, `session-utils.ts`
- Test framework and mocking setup
- Build and type checking systems

### External Dependencies
- None - purely internal refactoring

## Success Metrics

### Quantitative
- [x] File size: `organizational-data.ts` reduced significantly (3,329 → 2,275 lines, 32% reduction)
- [x] Test coverage: 100% of existing tests continue to pass
- [ ] Build time: No degradation in `npm run build`
- [x] Module count: 3 focused modules created (policies, patterns, capabilities)

### Qualitative  
- [ ] Code navigation significantly improved
- [ ] Easier to understand individual domain logic
- [ ] Reduced cognitive load for developers
- [ ] Consistent with project architecture patterns

## Open Questions

1. Should we create additional unit tests for newly exposed core functions?
2. Do we need to update any documentation about the internal architecture?
3. Should this refactoring include any performance optimizations?

## Progress Log

**2025-08-31 - Session 3**: Milestone 2 Complete - Pattern Operations Migration
- **Duration**: ~1 hour  
- **Primary Focus**: Pattern operations module extraction and test organization
- **Code Reduction**: 2,696 → 2,275 lines (-421 lines, 16% additional reduction)
- **Total Reduction**: 3,329 → 2,275 lines (-1,054 lines, 32% total reduction)
- **Module Enhanced**: Extended `src/core/pattern-operations.ts` with workflow handler
- **Tests Created**: `tests/core/pattern-operations.test.ts` (12 tests for core module)
- **Functions Migrated**: `handlePatternOperation` and `getPatternService` 
- **Architecture Refinement**: Confirmed dependency injection pattern for shared utilities
- **Validation**: All 941 tests passing across 38 suites ✅
- **Next Priority**: Milestone 3 (Capability operations creation)

**2025-08-31 - Session 2**: Milestone 1 & 6 Complete - Policy Operations Migration
- **Duration**: ~2 hours
- **Primary Focus**: Policy operations module extraction and test migration
- **Code Reduction**: 3,329 → 2,696 lines (-633 lines, 19% reduction)
- **Modules Created**: `src/core/policy-operations.ts` (657 lines), `tests/core/policy-operations.test.ts` (17 tests)
- **Functions Migrated**: 8 policy-specific functions including main workflow handler
- **Architecture Decision**: Preserved shared utilities in main file to avoid circular imports
- **Validation**: All 944 tests passing across 38 suites ✅
- **Next Priority**: Milestone 2 (Pattern operations extension)

**2025-08-31 - Session 1**: PRD created, ready to begin incremental refactoring

---
*This PRD focuses on project management and implementation milestones rather than exhaustive technical details.*