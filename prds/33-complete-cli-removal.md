# PRD: Complete CLI Interface Removal

**GitHub Issue**: [#33](https://github.com/vfarcic/dot-ai/issues/33)  
**Status**: Planning  
**Priority**: Medium  
**Start Date**: 2025-07-23  
**Target Completion**: TBD  

## Overview

Complete the removal of CLI interface functionality that was previously started but left incomplete. This involves removing all CLI-related source code, tests, build configurations, and documentation while preserving the MCP server functionality.

## Problem Statement

A previous session attempted to remove the CLI interface but left significant CLI-related code in the codebase:

- **Core CLI files still exist**: `src/cli.ts`, `src/interfaces/cli.ts`, `bin/dot-ai.ts`
- **Package.json still defines CLI**: Binary entries, CLI scripts, build configurations
- **Full CLI test suite remains**: Comprehensive test coverage for removed functionality
- **Documentation still references CLI**: Commands that no longer should exist
- **Build system still compiles CLI**: Creates working CLI binaries

This incomplete removal creates confusion about the project's interface strategy and maintains unnecessary code complexity.

## Success Criteria

### Primary Goals
- [x] **All CLI source code removed**: No CLI-related files in `src/` directory
- [x] **Package.json updated**: No CLI binary entries, scripts, or build references  
- [x] **Clean MCP-only interface**: Only MCP server functionality remains
- [ ] **Documentation updated**: No references to non-existent CLI commands
- [x] **Tests updated**: No CLI test files, clean test suite execution
- [x] **Build system cleaned**: No CLI compilation or binary generation

### Quality Gates
- [x] **All tests pass**: `npm test` succeeds after all removals
- [x] **MCP functionality intact**: MCP server and prompts work correctly
- [x] **No broken references**: No imports or exports to removed CLI code
- [ ] **Documentation accuracy**: All documented commands and workflows are valid

## Functional Requirements

### CLI Code Removal
- [x] **Remove core CLI files**:
  - [x] Delete `src/cli.ts`
  - [x] Delete `src/interfaces/cli.ts`
  - [x] Delete `bin/dot-ai.ts`
  - [x] Remove CLI export from `src/index.ts`

- [x] **Remove CLI test infrastructure**:
  - [x] Delete `tests/interfaces/cli.test.ts`
  - [x] Update any other test files that reference CLI components
  - [x] Verify test suite runs cleanly

### Package.json Updates
- [x] **Remove CLI binary entries**:
  - [x] Remove `"dot-ai": "./dist/cli.js"` from bin section
  - [x] Keep only `"dot-ai-mcp": "./dist/mcp/server.js"`

- [x] **Remove CLI scripts**:
  - [x] Remove `"build:cli"` script
  - [x] Remove `"start:cli"` script
  - [x] Update `"postbuild"` to only handle MCP server permissions

### Documentation Updates
- [ ] **Update CLAUDE.md**:
  - [ ] Remove references to `dot-ai discover`, `dot-ai explain`, `dot-ai fingerprint`
  - [ ] Update "Key Commands" section to focus on MCP and npm commands
  - [ ] Update project description to reflect MCP-only interface

- [ ] **Update project documentation**:
  - [ ] Review all files in `docs/` directory for CLI references
  - [ ] Update or remove CLI-focused documentation files
  - [ ] Ensure setup guides focus on MCP server configuration

- [ ] **Update README.md**:
  - [ ] Remove CLI installation and usage instructions
  - [ ] Focus on MCP server setup and integration
  - [ ] Update feature descriptions to reflect current architecture

## Implementation Approach

### Phase 1: Code Removal (Safe Cleanup)
1. **Remove CLI source files** - Delete main CLI implementation files
2. **Update exports** - Remove CLI exports from index files
3. **Remove CLI tests** - Delete CLI-specific test files
4. **Verify compilation** - Ensure project builds without CLI code

### Phase 2: Package Configuration (Interface Changes)
1. **Update package.json** - Remove CLI binary and script entries
2. **Update build scripts** - Remove CLI-specific build configurations
3. **Test packaging** - Verify npm package works correctly
4. **Verify MCP functionality** - Ensure MCP server still works

### Phase 3: Documentation Cleanup (User-Facing Updates)
1. **Audit all documentation** - Find every CLI reference across all files
2. **Update core documentation** - CLAUDE.md, README.md, setup guides
3. **Remove/update CLI-specific docs** - Handle docs that are CLI-only
4. **Verify documentation accuracy** - Test that all documented workflows work

## Dependencies

### Internal Dependencies
- **MCP server functionality must remain intact** - This is the primary interface going forward
- **Shared prompts functionality preserved** - CLI removal should not affect prompt library
- **Core discovery and schema functionality preserved** - Business logic should be unaffected

### External Dependencies
- **No external blockers identified** - This is internal code cleanup

## Risk Assessment

### Technical Risks
- **🟡 Medium: Missed CLI references** - May miss some CLI imports or references in complex codebase
  - *Mitigation*: Comprehensive search for CLI-related patterns before removal
  - *Detection*: Build errors will catch missing imports
  
- **🟡 Medium: Accidental MCP functionality removal** - Could accidentally remove shared code
  - *Mitigation*: Careful analysis of what CLI and MCP share before deletion
  - *Testing*: Verify MCP functionality after each removal step

- **🟢 Low: Test suite breakage** - Some tests might fail after CLI removal
  - *Mitigation*: Update tests incrementally and run test suite frequently
  - *Recovery*: Easy to fix broken test imports and references

### Business Risks
- **🟢 Low: User impact** - CLI removal should not affect current MCP users
- **🟢 Low: Feature regression** - Core functionality delivered via MCP should be unaffected

## Success Metrics

### Technical Metrics
- **Zero CLI-related files**: No files with CLI in name or primary purpose
- **Clean package.json**: Only MCP-related scripts and binaries
- **100% test pass rate**: All remaining tests execute successfully
- **No build warnings**: Clean compilation without CLI references

### Documentation Metrics
- **Zero broken CLI references**: No documentation mentions non-existent CLI commands
- **Complete MCP focus**: All setup and usage docs focus on MCP integration
- **Accurate workflows**: All documented workflows can be successfully executed

## Content Location Map

This PRD manages code removal rather than documentation creation, so content changes are primarily deletions and updates to existing files:

### Files to Delete
- `src/cli.ts` - Main CLI entry point
- `src/interfaces/cli.ts` - CLI interface implementation  
- `bin/dot-ai.ts` - CLI binary entry point
- `tests/interfaces/cli.test.ts` - CLI test suite

### Files to Update
- `package.json` - Remove CLI binary and scripts
- `src/index.ts` - Remove CLI exports
- `CLAUDE.md` - Remove CLI command references, update project description
- `README.md` - Remove CLI installation/usage, focus on MCP
- Various `docs/*.md` files - Remove/update CLI references

### Files to Verify
- All TypeScript files for CLI imports
- All test files for CLI references  
- All documentation files for CLI command examples

## Open Questions

- [ ] **Build system impact**: Are there any CI/CD or deployment scripts that reference CLI binaries?
- [ ] **Documentation scope**: Should we create a "migration from CLI to MCP" guide for any existing users?
- [ ] **Testing completeness**: Do we need additional tests to verify MCP functionality is unaffected?

## Decision Log

### 2025-07-23: Scope Decision
**Decision**: Complete CLI removal with clean deletion approach  
**Rationale**: User confirmed no need for backward compatibility or migration path  
**Impact**: Simplifies implementation - no need for deprecation warnings or migration guides  

## Work Log

### 2025-07-23: PRD Creation
**Duration**: 30 minutes  
**Tasks Completed**:
- [x] Created GitHub issue #33
- [x] Created comprehensive PRD document
- [x] Identified all CLI-related files requiring removal
- [x] Planned implementation phases focusing on safe, incremental removal

**Next Session Priority**: Begin Phase 1 (Code Removal) starting with CLI source file deletion

### 2025-08-14: CLI Removal Implementation
**Duration**: ~2 hours (based on commit timestamps)
**Commits**: 2 commits (4f3a57c, e92a4db)
**Primary Focus**: Complete CLI interface removal and package cleanup

**Completed PRD Items**:
- [x] All CLI source code removed - Evidence: src/cli.ts, src/interfaces/cli.ts, bin/dot-ai.ts deleted
- [x] Package.json updated - Evidence: commit 4f3a57c removed CLI dependencies (cli-table3, commander)
- [x] CLI binary entries removed - Evidence: only dot-ai-mcp binary remains in package.json  
- [x] CLI scripts removed - Evidence: no build:cli or start:cli scripts in package.json
- [x] Project description updated - Evidence: commit 4f3a57c changed to "MCP interface" only
- [x] CLI test infrastructure removed - Evidence: tests/interfaces/cli.test.ts deleted
- [x] Test suite verification - Evidence: npm test shows 774 tests passed, 35 suites passed
- [x] MCP functionality preserved - Evidence: MCP server builds and runs correctly
- [x] CLAUDE.md script reference updated - Evidence: commit 4f3a57c changed mcp:start to start:mcp
- [x] MCP setup guide updated - Evidence: commit e92a4db fixed npx references

**Quality Verification**:
- ✅ All tests pass (774 passed, 0 failed)
- ✅ Clean compilation with no CLI-related build errors
- ✅ MCP server binary builds and permissions set correctly
- ✅ No broken imports or exports to removed CLI code

**Additional Work Done**:
- Removed CLI dependencies from package.json (cli-table3, commander)
- Updated project description to reflect MCP-only architecture
- Standardized MCP script naming in documentation
- Fixed outdated npx command references in setup guides

**Current Status**: 82% complete - Core implementation finished
**Next Session Priorities**:
- Review docs/ directory for remaining CLI references
- Update README.md to focus on MCP-only interface
- Clean up any remaining CLI references in code comments