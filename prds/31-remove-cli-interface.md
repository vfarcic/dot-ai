# PRD: Remove CLI Interface - MCP-Only Architecture

**GitHub Issue**: [#31](https://github.com/vfarcic/dot-ai/issues/31)  
**Status**: Draft  
**Priority**: Medium  
**Start Date**: 2025-07-22  
**Target Completion**: TBD  

## Overview

Simplify the DevOps AI Toolkit architecture by removing the CLI interface entirely, maintaining only the MCP (Model Context Protocol) interface. This eliminates code duplication, reduces maintenance overhead, and focuses the project on its core strength as an AI development tool integration.

## Problem Statement

The current architecture maintains two parallel interfaces (CLI and MCP) that provide identical functionality, creating:

- **Code Duplication**: Both interfaces wrap the same core functionality, creating redundant code paths
- **Maintenance Overhead**: Bug fixes, feature updates, and testing require work in two places
- **User Confusion**: Having two interfaces with identical capabilities creates unnecessary decision paralysis
- **Documentation Burden**: All features need documentation for both CLI and MCP usage patterns

**Key Insight**: The MCP interface is the primary differentiator and strategic advantage. With the project being pre-general-availability, we can make clean architectural decisions without user impact.

## Success Criteria

**Primary Goals:**
- Single interface (MCP-only) with zero functionality loss
- Simplified codebase with reduced maintenance overhead
- Focused documentation and user experience
- Improved development velocity through elimination of dual-interface synchronization

**Quality Gates:**
- All current capabilities remain available through MCP interface
- Test coverage maintained while reducing test complexity
- Documentation clarity improved through single interface focus

## Implementation Milestones

### Phase 1: Analysis & Planning
- [ ] **Audit CLI vs MCP functionality mapping** - Ensure MCP interface provides 100% feature parity
- [ ] **Identify shared core functions** - Catalog which functions in `src/core/` are used by both interfaces and must be preserved

### Phase 2: Safe CLI Removal  
- [ ] **Remove CLI interface files** - Delete `src/interfaces/cli.ts`, CLI tests, and CLI documentation while preserving all shared core functions
- [ ] **Update package configuration** - Remove CLI binary from package.json and build scripts

### Phase 3: Documentation & Validation
- [ ] **Update documentation to MCP-only** - Rewrite all user documentation focusing exclusively on MCP workflows
- [ ] **Comprehensive functionality validation** - Test that all capabilities remain accessible via MCP interface

## Technical Approach

**Core Strategy:**
- Remove CLI interface layer while carefully preserving shared core functions
- MCP interface continues using existing `src/core/` business logic
- Convert all CLI documentation to equivalent MCP workflows
- Maintain or improve test coverage while reducing test complexity

**Key Preservation:**
- All functions in `src/core/` directory (shared business logic)
- MCP interface functionality (primary interface going forward)
- Core capabilities: Kubernetes deployment, documentation testing, shared prompts

## Risk Assessment

### Technical Risks
- **🟡 Medium: Undiscovered CLI-specific functionality** - Some functionality might exist only in CLI
  - *Mitigation*: Comprehensive audit of CLI vs MCP capabilities before removal
  - *Detection*: Systematic testing of all use cases through MCP interface

- **🟢 Low: Core function disruption** - Risk of accidentally removing shared functions
  - *Mitigation*: Careful analysis of `src/core/` dependencies before deletion
  - *Recovery*: Git history allows restoration of any accidentally removed shared code

### Business Risks
- **🟢 Low: User impact** - Project is pre-GA, minimal existing CLI user base
- **🟢 Low: Functionality loss** - MCP interface already provides equivalent capabilities

## Dependencies

### Internal Dependencies
- **MCP interface completeness** - Must provide all functionality currently available via CLI
- **Core business logic preservation** - Shared functions in `src/core/` must remain intact
- **Test infrastructure** - Must validate functionality without CLI-specific tests

### External Dependencies
- **None identified** - This is internal architectural simplification

## Content Location Map

This PRD focuses on code removal rather than documentation creation:

### Files to Delete
- `src/interfaces/cli.ts` - CLI interface implementation
- `bin/dot-ai.ts` - CLI binary entry point  
- `tests/interfaces/cli.test.ts` - CLI-specific tests
- CLI-related documentation files

### Files to Update
- `package.json` - Remove CLI binary entries and scripts
- `src/index.ts` - Remove CLI exports
- `README.md` - Update to reflect MCP-only architecture
- Documentation files - Convert CLI examples to MCP workflows

### Files to Preserve
- All `src/core/` files - Shared business logic used by MCP interface
- MCP interface files - Primary interface going forward
- Core functionality tests - Business logic validation

## Decision Log

### 2025-07-22: Architectural Direction Decision
**Decision**: Remove CLI interface completely rather than deprecation approach  
**Rationale**: Pre-GA status allows clean architectural decisions without user impact  
**Impact**: Simplifies maintenance and focuses development on strategic MCP interface  

## Work Log

### 2025-07-22: PRD Creation and Initial Analysis
**Duration**: 30 minutes  
**Tasks Completed**:
- [x] Created GitHub issue #31
- [x] Created milestone-focused PRD document
- [x] Identified core architectural approach
- [x] Planned implementation phases focusing on safe removal with functionality preservation

**Next Session Priority**: Begin Phase 1 analysis to map CLI functionality against MCP capabilities