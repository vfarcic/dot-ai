# PRD: Remove --legacy-peer-deps Workaround for Zod Version Conflicts

**Issue**: #121
**Created**: 2025-09-22
**Status**: Complete
**Completed**: 2025-09-28
**Priority**: Low
**Owner**: Claude  

## Executive Summary

Remove the temporary `--legacy-peer-deps` workaround introduced to handle peer dependency conflicts between different zod version requirements in our dependency tree. This workaround was necessary due to incompatible zod version requirements between key dependencies but should be removed once the ecosystem stabilizes.

## Problem Statement

### Current Situation
- Using `--legacy-peer-deps` in both local development and CI/CD pipeline
- This was introduced to resolve conflicts between:
  - `@modelcontextprotocol/sdk` and `openai` requiring zod ^3.23.8
  - `@anthropic-ai/sdk` requiring zod ^4.0.0
- While functional, this approach can lead to:
  - Potential runtime issues if packages expect different zod APIs
  - Increased bundle size from duplicate dependencies
  - TypeScript type conflicts
  - Maintenance complexity

### User Impact
- **Developers**: May encounter confusing type errors or runtime issues
- **CI/CD**: Build process uses non-standard dependency resolution
- **Maintenance**: Additional complexity in dependency management

## Success Criteria

- Remove all `--legacy-peer-deps` flags from package.json scripts and CI workflows
- All dependencies resolve without conflicts using standard npm resolution
- All tests pass with standard dependency installation
- No runtime issues related to zod version mismatches
- Clean, maintainable dependency tree

## Scope

### In Scope
- Monitor upstream dependency updates for zod compatibility
- Remove `--legacy-peer-deps` from CI workflow
- Update local development documentation
- Validate that all functionality works with resolved dependencies
- Clean up package-lock.json to use standard resolution

### Out of Scope
- Forking or modifying upstream dependencies
- Creating custom zod version compatibility layers
- Major refactoring of existing code that uses these dependencies

## Technical Analysis

### Root Cause
The conflict exists because:
1. **Zod v4** introduced breaking changes from v3
2. **@anthropic-ai/sdk 0.63.0+** adopted zod v4
3. **@modelcontextprotocol/sdk** and **openai** still use zod v3
4. npm v7+ enforces strict peer dependency resolution

### Resolution Paths
1. **Wait for upstream alignment** (preferred)
   - MCP SDK updates to support zod v4
   - OR Anthropic SDK provides zod v3 compatibility
2. **Version pinning** 
   - Downgrade @anthropic-ai/sdk to version supporting zod v3
   - Risk: Missing security updates and new features
3. **Package resolutions**
   - Force single zod version via package.json resolutions
   - Risk: Runtime compatibility issues

## Implementation Plan

### Phase 1: Monitoring & Preparation
- [ ] Set up automated monitoring of dependency updates
- [ ] Create test suite to validate zod compatibility
- [ ] Document current dependency versions and constraints

### Phase 2: Dependency Alignment
- [ ] Test compatibility when upstream packages are updated
- [ ] Validate that zod v4 works across all our use cases
- [ ] Ensure no breaking changes in our code

### Phase 3: Workaround Removal
- [ ] Remove `--legacy-peer-deps` from CI workflow
- [ ] Update package-lock.json with clean resolution
- [ ] Update development documentation
- [ ] Validate all tests pass with standard resolution

### Phase 4: Validation & Cleanup
- [ ] Run comprehensive test suite
- [ ] Verify bundle size improvements
- [ ] Update contributor documentation
- [ ] Close out this PRD

## Risks & Mitigation

### Risk: Upstream dependencies don't align
- **Impact**: Medium - Would require alternative approaches
- **Mitigation**: Consider package resolutions or version pinning as alternatives

### Risk: Breaking changes in dependency updates
- **Impact**: Low - Dependencies are well-maintained
- **Mitigation**: Thorough testing before removing workaround

### Risk: Runtime compatibility issues
- **Impact**: High - Could cause production issues
- **Mitigation**: Comprehensive testing and gradual rollout

## Monitoring & Maintenance

### Key Dependencies to Monitor
- `@anthropic-ai/sdk` - Watch for zod v3 compatibility or stable v4 adoption
- `@modelcontextprotocol/sdk` - Watch for zod v4 support
- `openai` - Watch for zod v4 migration

### Success Metrics
- Zero dependency resolution conflicts
- No increase in bundle size compared to resolved state
- All existing functionality preserved
- Clean npm audit results

## Timeline

**Target Completion**: Q1 2025 (dependent on upstream updates)

**Key Milestones**:
- **Month 1**: Monitoring setup and baseline testing
- **Month 2-3**: Wait for upstream alignment (check monthly)
- **Month 4**: Remove workaround once alignment achieved
- **Month 5**: Validate and close out

## Notes

This PRD tracks a technical debt item that should be resolved once the JavaScript/TypeScript ecosystem stabilizes around zod v4. The timing is entirely dependent on upstream maintainers rather than our development capacity.

**Context**: This workaround was introduced during the removal of unused context parameter from remediate tool when dependency conflicts emerged from automatic updates.