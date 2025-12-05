# PRD: Helm Day-2 Operations

**Issue**: [#251](https://github.com/vfarcic/dot-ai/issues/251)
**Status**: Draft
**Priority**: High
**Created**: 2025-12-05

---

## Problem Statement

After installing third-party applications via the `recommend` tool's Helm support (PRD #250), users have no way to manage those releases through MCP. Currently, they must:

1. Manually run `helm list` to find releases
2. Use `helm upgrade` with manually constructed values
3. Run `helm rollback` when upgrades fail
4. Use `helm uninstall` for cleanup
5. Manually diagnose Helm-specific issues (stuck releases, failed hooks, pending-upgrade states)

This creates a gap where installation is intelligent and guided, but ongoing management reverts to manual CLI work.

## Solution Overview

Extend the `operate` and `remediate` tools to detect and handle Helm releases:

### Operate Tool Enhancements
When users express intent to modify existing applications (e.g., "upgrade Prometheus", "scale Argo CD", "uninstall Crossplane"), the system will:

1. Detect if the target is a Helm release (vs. raw Kubernetes resources)
2. Query Helm release state (`helm status`, `helm get values`)
3. For upgrades: search ArtifactHub for new versions, generate value change questions
4. Validate changes via `helm upgrade --dry-run`
5. Execute Helm commands upon user confirmation

### Remediate Tool Enhancements
When users report issues with Helm-installed applications, the system will:

1. Detect Helm release involvement in the investigation
2. Query Helm-specific diagnostic data (`helm status`, `helm history`)
3. Identify Helm-specific root causes (stuck pending-upgrade, failed hooks, revision conflicts)
4. Recommend Helm-specific remediation (rollback, force-upgrade, hook cleanup)

## User Journeys

### Journey 1: Upgrade a Helm Release

**Current State (Manual)**
```
User: "I need to upgrade Prometheus to the latest version"
→ User runs: helm repo update
→ User checks: helm search repo prometheus-community/prometheus --versions
→ User reviews current values: helm get values prometheus
→ User researches release notes for breaking changes
→ User runs: helm upgrade prometheus prometheus-community/prometheus --version X.Y.Z
→ User hopes it works
```

**Target State (With This Feature)**
```
User: "Upgrade Prometheus to the latest version"
→ operate tool detects "upgrade" + "Prometheus" → checks if Helm release exists
→ System finds: helm release "prometheus" in namespace "monitoring"
→ System queries ArtifactHub for available versions
→ AI analyzes version differences, generates questions:
  - Target version? (suggests latest stable)
  - Any specific value changes?
  - Want to preserve all current custom values?
→ System runs helm upgrade --dry-run for validation
→ User confirms, system executes helm upgrade
```

### Journey 2: Rollback a Failed Upgrade

**Current State (Manual)**
```
User: "My Argo CD upgrade broke something"
→ User runs: helm history argocd -n argocd
→ User identifies last working revision
→ User runs: helm rollback argocd <revision> -n argocd
→ User verifies pods are running
```

**Target State (With This Feature)**
```
User: "Argo CD isn't working after the upgrade"
→ remediate tool investigates, detects Helm release
→ System runs: helm status argocd, helm history argocd
→ AI identifies: "Release upgraded 2 hours ago, pods in CrashLoopBackOff"
→ Remediation suggests: "Rollback to revision 5 (last healthy)"
→ User confirms, system executes helm rollback
→ Post-remediation validation confirms pods healthy
```

### Journey 3: Uninstall a Helm Release

**Current State (Manual)**
```
User: "Remove Crossplane from the cluster"
→ User must know it's a Helm release
→ User runs: helm uninstall crossplane -n crossplane-system
→ User manually cleans up CRDs if needed
```

**Target State (With This Feature)**
```
User: "Remove Crossplane"
→ operate tool detects "remove/uninstall" + "Crossplane"
→ System finds: helm release "crossplane" in namespace "crossplane-system"
→ AI warns: "This will remove all Crossplane CRDs and managed resources"
→ Questions: Delete CRDs? (default: no, requires explicit confirmation)
→ User confirms, system executes helm uninstall
```

### Journey 4: Diagnose Stuck Helm Release

**Current State (Manual)**
```
User: "Cert-manager won't deploy properly"
→ User runs various kubectl commands
→ User eventually checks: helm status cert-manager
→ User sees: STATUS: pending-upgrade
→ User must know to run: helm rollback cert-manager
```

**Target State (With This Feature)**
```
User: "Cert-manager deployment is stuck"
→ remediate tool investigates
→ System detects: helm release "cert-manager" with STATUS: pending-upgrade
→ AI identifies: "Helm release stuck in pending-upgrade state, likely from interrupted upgrade"
→ Remediation suggests: "Rollback to last successful revision"
→ User confirms, system executes helm rollback
```

## Technical Design

### Helm Release Detection

Both tools need a shared foundation for detecting Helm releases:

```typescript
interface HelmReleaseInfo {
  name: string;
  namespace: string;
  chart: string;
  chartVersion: string;
  appVersion: string;
  status: 'deployed' | 'failed' | 'pending-install' | 'pending-upgrade' | 'pending-rollback' | 'uninstalling' | 'superseded' | 'uninstalled';
  revision: number;
  updated: string;
}

interface HelmReleaseDetails extends HelmReleaseInfo {
  values: Record<string, any>;      // Current custom values
  history: HelmRevision[];          // Release history
  notes: string;                    // Post-install notes
}

interface HelmRevision {
  revision: number;
  status: string;
  chart: string;
  appVersion: string;
  description: string;
  updated: string;
}
```

**Detection Logic:**
1. Parse intent for application/release names
2. Run `helm list -A -o json` to get all releases
3. Match release name or chart name against intent
4. If match found, load full release details

### Operate Tool: Helm Branch

Extend the operate analysis workflow to handle Helm releases:

**New Session Data:**
```typescript
interface OperateHelmSessionData extends OperateSessionData {
  helmRelease: HelmReleaseDetails;
  operation: 'upgrade' | 'rollback' | 'uninstall' | 'modify-values';
  targetVersion?: string;           // For upgrades
  targetRevision?: number;          // For rollbacks
  valueChanges?: Record<string, any>;
  helmCommand: string;
}
```

**Workflow Stages:**
| Stage | Description |
|-------|-------------|
| analyze | Detect Helm release, determine operation type, gather current state |
| configure | For upgrades: version selection, value changes. For rollback: revision selection |
| validate | Run `helm upgrade/rollback --dry-run` |
| execute | Run actual Helm command |

**Helm Operations:**

1. **Upgrade**
   - Query ArtifactHub for available versions (reuse PRD #250 infrastructure)
   - Compare current vs target version
   - AI generates questions for significant value changes
   - Preserve existing custom values by default
   - Command: `helm upgrade <release> <chart> --version <version> --reuse-values -f <new-values.yaml>`

2. **Rollback**
   - Show release history with status for each revision
   - AI suggests best rollback target (last 'deployed' revision)
   - Command: `helm rollback <release> <revision>`

3. **Uninstall**
   - Warn about CRD implications
   - Check for dependent resources
   - Command: `helm uninstall <release> -n <namespace>`

4. **Modify Values**
   - Show current values
   - AI generates questions based on value schema (if available)
   - Command: `helm upgrade <release> <chart> --reuse-values --set <key>=<value>`

### Remediate Tool: Helm Awareness

Enhance the investigation and remediation logic:

**Helm-Specific Investigation:**
Add to kubectl investigation tools:
- `helm_list`: List all Helm releases
- `helm_status`: Get detailed status of a release
- `helm_history`: Get revision history
- `helm_get_values`: Get current custom values

**Helm-Specific Root Causes:**
Train AI to identify:
- `pending-upgrade`: Interrupted upgrade, needs rollback
- `pending-install`: Failed initial install
- `failed`: Upgrade failed, pods may be unhealthy
- Hook failures: Pre/post hooks didn't complete
- Resource conflicts: Helm-managed resources modified externally

**Helm-Specific Remediation Actions:**
```typescript
interface HelmRemediationAction extends RemediationAction {
  helmOperation?: 'rollback' | 'upgrade' | 'uninstall';
  targetRevision?: number;
  forceUpgrade?: boolean;
}
```

### Shared Utilities

Create `src/core/helm-operations.ts` with shared functions:

```typescript
// List all Helm releases
async function listHelmReleases(): Promise<HelmReleaseInfo[]>

// Get detailed release info
async function getHelmReleaseDetails(name: string, namespace?: string): Promise<HelmReleaseDetails>

// Find release matching intent
async function findHelmRelease(intent: string): Promise<HelmReleaseInfo | null>

// Get release history
async function getHelmHistory(name: string, namespace: string): Promise<HelmRevision[]>

// Execute Helm commands with dry-run support
async function executeHelmCommand(command: string, dryRun: boolean): Promise<{ success: boolean; output: string }>
```

### Prompt Updates

**New Prompts:**
- `prompts/operate-helm-analysis.md`: Analyze intent for Helm operations
- `prompts/operate-helm-questions.md`: Generate questions for Helm operations

**Updated Prompts:**
- `prompts/remediate-system.md`: Add Helm investigation tools and root cause patterns

## Success Criteria

1. **Seamless Detection**: System automatically detects when an operation targets a Helm release
2. **Full Lifecycle**: Support upgrade, rollback, uninstall, and value modifications
3. **Version Awareness**: For upgrades, show available versions and handle version selection
4. **Safe Defaults**: Preserve existing values by default, require explicit confirmation for destructive operations
5. **Helm-Aware Remediation**: Diagnose and fix Helm-specific issues (stuck states, failed hooks)
6. **Unified Experience**: Same intent → questions → validate → execute flow as other operations

## Out of Scope

- **Private Helm repositories**: Only public repos (matching PRD #250 constraints)
- **Helm secrets management**: Encrypted values files (helm-secrets plugin)
- **Multi-release operations**: Operating on multiple releases at once
- **Helm chart development**: Creating or modifying charts
- **OCI registry support**: Only HTTP/HTTPS Helm repos initially

## Dependencies

- PRD #250 (Third-Party Application Installation) - Helm discovery and ArtifactHub integration
- Helm CLI available in execution environment
- Existing `operate` and `remediate` tool infrastructure

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Release name ambiguity | AI confirms match with user; show namespace + chart info |
| Upgrade breaks application | Dry-run validation; easy rollback path; warn about major version changes |
| Uninstall removes needed resources | Explicit CRD warnings; dependent resource check; require confirmation |
| Stuck release after failed operation | Remediate tool can diagnose and suggest recovery |
| Helm release modified externally | Detect drift via `helm diff` (future enhancement); warn user |

---

## Design Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-05 | **Combined PRD for operate + remediate**: Single PRD covers Helm support for both tools | Shared foundation (detection, state querying), natural workflow (diagnose → fix), manageable scope |

---

## Milestones

### Phase 1: Foundation
- [ ] Shared Helm utilities: Create `src/core/helm-operations.ts` with release listing, detection, and state querying
- [ ] Helm investigation tools: Add `helm_list`, `helm_status`, `helm_history` to remediate tool's investigation toolkit
- [ ] Integration tests for Helm detection and state querying

### Phase 2: Remediate Tool Enhancements
- [ ] Helm-aware investigation: Update remediate system prompt to use Helm tools when appropriate
- [ ] Helm root cause patterns: Train AI to identify Helm-specific issues (stuck states, hook failures)
- [ ] Helm remediation actions: Support `helm rollback` as remediation action
- [ ] Integration tests for Helm remediation scenarios

### Phase 3: Operate Tool Enhancements
- [ ] Helm release detection in operate: Detect when intent targets a Helm release
- [ ] Upgrade workflow: Version selection, value preservation, ArtifactHub integration
- [ ] Rollback workflow: History display, revision selection
- [ ] Uninstall workflow: CRD warnings, confirmation flow
- [ ] Value modification workflow: Current values display, targeted changes
- [ ] Integration tests for each operate workflow

### Phase 4: Polish
- [ ] Documentation updates: Update MCP guides with Helm Day-2 operations
- [ ] Error handling: Graceful handling of Helm CLI failures
- [ ] Edge cases: Handle missing releases, permission errors, namespace issues

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-05 | PRD created |
