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
Add as plugin tools in `packages/agentic-tools/src/tools/` (alongside existing kubectl tools):
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

#### Plugin Investigation Tools: `packages/agentic-tools/src/tools/helm-list.ts`, `helm-status.ts`, `helm-history.ts`, `helm-get-values.ts`

Following the existing plugin tool pattern (one file per tool, each exporting a `KubectlTool` object), create Helm investigation tools as plugin tools. These are registered alongside existing kubectl and helm tools in `packages/agentic-tools/src/tools/index.ts`.

```typescript
// Example: packages/agentic-tools/src/tools/helm-list.ts
import { KubectlTool, executeHelm, successResult, errorResult, withValidation } from './base';

export const helmList: KubectlTool = {
  definition: {
    name: 'helm_list',
    type: 'agentic',
    description: 'List all Helm releases in the cluster',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Namespace to list releases from. Omit for all namespaces.' }
      }
    }
  },
  handler: withValidation(async (args) => {
    const namespace = args.namespace as string | undefined;
    const flags = namespace ? `-n ${namespace} -o json` : '-A -o json';
    return executeHelm(`list ${flags}`);
  })
};

// Similarly: helm-status.ts, helm-history.ts, helm-get-values.ts
```

Each tool is added to the `ALL_KUBECTL_HELM_TOOLS` array in `packages/agentic-tools/src/tools/index.ts` for automatic registration via the describe/invoke hooks.

#### Plugin Operations Tools: `packages/agentic-tools/src/tools/helm-upgrade.ts`, `helm-rollback.ts`

Higher-level operation tools for the operate workflow, building on existing `executeHelm()` and `buildHelmCommand()` utilities in `packages/agentic-tools/src/tools/base.ts`:

```typescript
// Example: packages/agentic-tools/src/tools/helm-upgrade.ts
export const helmUpgrade: KubectlTool = {
  definition: {
    name: 'helm_upgrade',
    type: 'agentic',
    description: 'Upgrade a Helm release to a new version or with new values',
    inputSchema: { ... }
  },
  handler: withValidation(async (args) => {
    // Build helm upgrade command with --reuse-values, --version, --dry-run support
  })
};

// Similarly: helm-rollback.ts
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
| 2025-12-05 | **Helm tools as AI-callable investigation tools**: Follow `kubectl-tools.ts` pattern with `executeHelmTools()` function | Consistent with existing architecture; AI decides when to query Helm state during investigation |
| 2025-12-05 | **Direct testing for all investigation tools**: Test each tool independently, not just through AI workflows | AI adaptability masks broken tools - if one tool fails, AI uses alternatives and integration tests still pass. Direct tests catch individual tool failures immediately. |
| 2025-12-05 | **Include kubectl tool tests in scope**: Add direct tests for existing kubectl investigation tools alongside new Helm tools | Same rationale - existing kubectl tools have no direct tests and failures could go undetected |
| 2026-02-17 | **Helm tools in plugin layer, not MCP**: All new Helm tools go in `packages/agentic-tools/src/tools/` following the existing per-file `KubectlTool` pattern, not in `src/core/` | Aligns with architectural direction: MCP is a thin orchestration layer, all tool logic lives in plugins. Helm tools execute against an external system (Helm CLI) which is plugin responsibility. Existing helm tools (`helm-install.ts`, `helm-uninstall.ts`, `helm-template.ts`, `helm-repo-add.ts`) and shared utilities (`executeHelm`, `buildHelmCommand` in `base.ts`) already live in the plugin. |
| 2026-02-18 | **Reuse `helm_install` for upgrades, no separate `helm_upgrade` tool**: Existing `helm_install` already runs `helm upgrade --install` which handles both install and upgrade | Avoids tool duplication. Added `--reuse-values` (always on) for safe Day-2 upgrades and created `helm_install_dryrun` with shared `buildAndExecuteHelmInstall()` for safe analysis-phase validation. |
| 2026-02-18 | **No operate system prompt changes for Helm detection**: Helm tool descriptions are sufficient for AI to discover and use them during operate analysis | Tool descriptions already explain when/how to use each Helm tool. Avoids over-engineering prompt instructions that may become stale. Can add targeted guidance later if testing shows gaps. |

---

## Milestones

### Phase 1: Foundation
- [x] Helm investigation tools in plugin: Create `packages/agentic-tools/src/tools/helm-list.ts`, `helm-status.ts`, `helm-history.ts`, `helm-get-values.ts` following per-file `KubectlTool` pattern
- [x] Register new tools in `packages/agentic-tools/src/tools/index.ts` (`ALL_KUBECTL_HELM_TOOLS` array)
- [~] Direct investigation tool tests: Deferred — direct tool invocation tests are unit test scope; existing integration tests through operate/remediate/query provide coverage
  - [~] Test all existing kubectl tools directly (`kubectl_get`, `kubectl_describe`, `kubectl_logs`, `kubectl_api_resources`)
  - [~] Test all new Helm tools directly (`helm_list`, `helm_status`, `helm_history`, `helm_get_values`)
  - [~] Validate each tool returns correct data structure and handles errors properly

### Phase 2: Remediate Tool Enhancements
- [x] Helm-aware investigation: Update remediate system prompt to use Helm tools when appropriate
- [x] Helm root cause patterns: Train AI to identify Helm-specific issues (stuck states, hook failures)
- [x] Helm remediation actions: Support `helm rollback` as remediation action
- [x] Integration tests for Helm remediation scenarios

### Phase 3: Operate Tool Enhancements
- [x] Helm release detection in operate: Added Helm investigation tools (`helm_list`, `helm_status`, `helm_history`, `helm_get_values`) and `helm_install_dryrun` to operate analysis tool filter
- [x] Upgrade workflow: Refactored `helm-install.ts` with shared `buildAndExecuteHelmInstall()`, always uses `--reuse-values`, `helm_install_dryrun` for safe validation
- [x] Rollback workflow: Created `helm-rollback.ts` plugin tool with revision selection
- [x] Uninstall workflow: `helm_uninstall` already existed, now available to operate AI via tool filter
- [x] Value modification workflow: Covered by `helm_install` with `values` YAML param + `--reuse-values` preserves existing config
- [x] Integration tests for Helm operate workflow

### Phase 4: Polish
- [ ] Documentation updates: Update MCP guides with Helm Day-2 operations
- [ ] Error handling: Graceful handling of Helm CLI failures
- [ ] Edge cases: Handle missing releases, permission errors, namespace issues

