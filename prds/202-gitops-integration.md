# PRD #202: GitOps Integration for Argo CD and Flux

**Status**: Draft
**Created**: 2025-11-03
**Priority**: Medium
**Dependencies**: Operations Tool PRD (must be completed first)

---

## Problem Statement

Current deployment tools (recommend, remediate, operations) use direct `kubectl apply` to modify cluster state. This approach doesn't align with GitOps workflows where tools like Argo CD and Flux are the source of truth for cluster configuration. When GitOps is in place:

- Direct kubectl changes can be overwritten by GitOps sync
- Changes bypass Git audit trail and review processes
- Teams lose GitOps benefits: version control, rollback, declarative state
- No validation that GitOps tools successfully applied changes

Users running GitOps workflows need the AI tools to work **with** their GitOps setup, not around it.

---

## Solution Overview

Extend the deployment workflow in recommend, remediate, and operations tools to support GitOps patterns:

1. **Configuration**: Enable GitOps mode via config (Argo CD or Flux)
2. **Git Operations**: Push changes to Git repository instead of direct kubectl
3. **Sync Monitoring**: Wait for Argo CD/Flux to detect and sync changes
4. **Verification**: Validate sync completed successfully before marking operation complete

This maintains GitOps principles while providing the same intelligent automation users expect.

---

## User Stories

### As a Platform Engineer
- I want to enable GitOps mode so all AI tool deployments go through Argo CD
- I want changes pushed to my Git repo so they follow our review process
- I want to verify Argo CD synced changes successfully before considering deployment complete

### As an SRE Using Flux
- I want remediation actions pushed to Git so we maintain audit trail
- I want the tool to detect which Flux Kustomization manages affected resources
- I want automatic verification that Flux applied the fix successfully

### As a Developer
- I want deployment recommendations to work with our existing GitOps setup
- I want clear feedback on Git push and sync status
- I want the tool to handle both direct kubectl and GitOps workflows transparently

---

## Success Criteria

### Must Have
- [ ] Configuration to enable GitOps mode (Argo CD or Flux)
- [ ] Recommend tool: Ask user for Git repo location to push manifests
- [ ] Remediate tool: Auto-detect Argo CD Application or Flux Kustomization managing resources
- [ ] Operations tool: Auto-detect GitOps ownership of resources
- [ ] Git push workflow: Commit and push changes to detected/specified repository
- [ ] Sync monitoring: Wait for Argo CD/Flux to detect changes
- [ ] Sync verification: Validate successful sync before completing operation
- [ ] Error handling: Clear feedback if Git push or sync fails

### Nice to Have
- [ ] Support for multiple GitOps tools in same cluster
- [ ] Git branch selection (main, feature branches)
- [ ] Pull request creation instead of direct push
- [ ] Rollback support via Git revert

### Out of Scope
- Argo CD/Flux installation or configuration
- Git repository setup or authentication
- Multi-repository GitOps patterns (app of apps)
- Custom sync strategies or health checks

---

## Technical Approach

### Configuration

Add GitOps configuration to tool settings:

```typescript
interface GitOpsConfig {
  enabled: boolean;
  provider: 'argocd' | 'flux' | 'none';
  defaultRepo?: string;  // Optional default for recommend tool
  syncTimeout?: number;  // TBD during implementation
}
```

### Workflow Changes

#### Recommend Tool
1. Generate manifests (existing behavior)
2. If GitOps enabled:
   - Ask user: "Where should I push these manifests?" (repo URL + path)
   - Commit manifests to specified location
   - Push to Git
   - Detect relevant Argo CD Application or Flux Kustomization
   - Monitor sync status
   - Verify sync success

#### Remediate Tool
1. Analyze issue and generate fix (existing behavior)
2. If GitOps enabled:
   - Identify which resources need modification
   - Query Argo CD Applications or Flux Kustomizations to find which owns these resources
   - Extract Git repo URL and path from Application/Kustomization spec
   - Clone repo, modify files, commit, push
   - Monitor sync status
   - Verify sync success and validate fix worked

#### Operations Tool
1. Determine operation (create/update/delete)
2. If GitOps enabled:
   - Follow same detection logic as remediate tool
   - Perform Git operations
   - Monitor and verify sync

### GitOps Detection

**Argo CD:**
```bash
# Find Application managing a resource
kubectl get applications -A -o json | jq '.items[] | select(.status.resources[] | .name == "my-deployment")'
# Extract .spec.source.repoURL and .spec.source.path
```

**Flux:**
```bash
# Find Kustomization managing a resource
kubectl get kustomizations -A -o json | jq '.items[] | select(.spec.path == "/path/to/manifests")'
# Extract .spec.sourceRef.name, then get GitRepository
kubectl get gitrepository <name> -o json | jq '.spec.url'
```

### Sync Monitoring & Verification

**TBD during implementation** - need to decide:
- Polling interval for sync status
- Maximum wait time (timeout)
- Success criteria (health status, ready conditions)
- Failure detection and error messages

---

## Dependencies

### Must Complete First
- **Operations Tool PRD**: This PRD depends on the operations tool being fully implemented first

### External Dependencies
- Git CLI or library (libgit2, simple-git)
- Argo CD CRDs (if Argo CD mode enabled)
- Flux CRDs (if Flux mode enabled)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Git authentication complexity | High | Document supported auth methods, start with SSH keys |
| Sync timeout too short/long | Medium | Make configurable, provide sensible defaults (TBD) |
| Multiple GitOps tools managing same namespace | Medium | Detect and warn user, ask for clarification |
| Git repo structure varies widely | High | Support common patterns, provide configuration for custom layouts |
| Sync failure leaves inconsistent state | High | Clear error messages, provide rollback guidance |

---

## Implementation Phases

### Phase 1: Configuration & Git Operations (Weeks 1-2)
- [ ] Add GitOps configuration to tool settings
- [ ] Implement Git clone, commit, push operations
- [ ] Create Git operation utilities (reusable across tools)
- [ ] Add configuration validation and error handling

### Phase 2: Argo CD Integration (Weeks 3-4)
- [ ] Implement Argo CD Application detection
- [ ] Extract repository information from Applications
- [ ] Monitor Argo CD sync status
- [ ] Verify sync success criteria (TBD specifics during implementation)

### Phase 3: Flux Integration (Weeks 5-6)
- [ ] Implement Flux Kustomization detection
- [ ] Extract repository from GitRepository resources
- [ ] Monitor Flux sync status
- [ ] Verify sync success criteria (TBD specifics during implementation)

### Phase 4: Tool Integration (Weeks 7-8)
- [ ] Integrate GitOps workflow into recommend tool
- [ ] Integrate GitOps workflow into remediate tool
- [ ] Integrate GitOps workflow into operations tool
- [ ] Update all tool prompts to handle GitOps flow

### Phase 5: Testing & Documentation (Weeks 9-10)
- [ ] Comprehensive integration tests for GitOps workflows
- [ ] Test with both Argo CD and Flux
- [ ] Update documentation with GitOps configuration guide
- [ ] Create examples and best practices guide

---

## Documentation Requirements

### User Documentation
- GitOps configuration guide
- Supported Git authentication methods
- Argo CD setup requirements
- Flux setup requirements
- Troubleshooting guide for common Git/sync issues

### Developer Documentation
- GitOps detection implementation details
- Git operation utilities API
- Sync monitoring patterns
- Testing GitOps workflows locally

---

## Testing Strategy

### Integration Tests
- Test recommend tool with GitOps enabled (Argo CD)
- Test recommend tool with GitOps enabled (Flux)
- Test remediate tool auto-detection (Argo CD)
- Test remediate tool auto-detection (Flux)
- Test operations tool GitOps flow (both providers)
- Test error handling (Git push failures, sync timeouts)
- Test mixed mode (some resources GitOps, some direct)

### Manual Testing
- End-to-end workflow with real Argo CD installation
- End-to-end workflow with real Flux installation
- Verify Git commits have proper metadata
- Verify sync monitoring accuracy
- Test with various Git repository structures

---

## Open Questions

1. **Sync Verification Details** (TBD during implementation):
   - Polling interval for checking sync status?
   - Maximum wait timeout?
   - What defines "sync successful"?
   - How to handle partial sync failures?

2. **Git Workflow**:
   - Direct push to main or create feature branches?
   - Support for pull request creation?
   - Commit message format requirements?

3. **Multi-Tool Scenarios**:
   - What if both Argo CD and Flux are installed?
   - How to handle namespace-level vs cluster-level GitOps?

4. **Authentication**:
   - Which Git authentication methods to support initially?
   - How to securely handle Git credentials?

---

## Milestones

- [ ] **M1**: GitOps configuration and Git operations utilities complete
- [ ] **M2**: Argo CD detection and sync monitoring working
- [ ] **M3**: Flux detection and sync monitoring working
- [ ] **M4**: Recommend tool GitOps integration complete
- [ ] **M5**: Remediate tool GitOps integration complete
- [ ] **M6**: Operations tool GitOps integration complete
- [ ] **M7**: Comprehensive testing and documentation complete
- [ ] **M8**: Feature ready for production use

---

## Progress Log

### 2025-11-03
- PRD created
- GitHub issue #202 opened
- Awaiting operations tool completion before starting implementation
