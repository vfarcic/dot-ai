# PRD: Argo CD Integration for Third-Party Helm Charts

**Issue**: [#254](https://github.com/vfarcic/dot-ai/issues/254)
**Status**: Draft
**Priority**: High
**Created**: 2025-12-06

---

## Problem Statement

When using the `recommend` tool in Helm mode to install third-party applications (PRD #250), users currently get direct `helm install` execution. While this works, it doesn't integrate with GitOps workflows where:

1. **All deployments should be declarative**: Stored in Git, not executed imperatively
2. **Argo CD manages application lifecycle**: Syncing, health checks, rollback capabilities
3. **Audit trail is required**: Git history provides deployment audit trail
4. **Environment promotion is needed**: Same Application definition can be promoted across environments

Users who want GitOps-managed third-party applications must manually create Argo CD Application manifests after running `recommend`, defeating the purpose of automated deployment assistance.

---

## Solution Overview

Extend the `recommend` tool's Helm mode to offer **Argo CD Application generation** as a deployment option:

1. **New Deployment Option**: After generating Helm configuration, ask: "How would you like to deploy?"
   - Direct `helm install` (current behavior)
   - Generate Argo CD Application CR

2. **Application CR Generation**: Create a complete Argo CD Application that:
   - References the external Helm chart repository
   - Includes all user-provided values
   - Configures appropriate sync policies

3. **Output Options**:
   - Display the Application YAML
   - Save to specified file path
   - (Future: Push to Git repository)

---

## User Journey

### Current State (Manual GitOps Setup)

```
User: "Install nginx ingress controller"

→ recommend tool finds chart, asks questions, runs helm install
→ User wants GitOps management
→ User manually creates Argo CD Application YAML
→ User commits to Git repo
→ User waits for Argo CD to sync
```

### Target State (Integrated GitOps)

```
User: "Install nginx ingress controller"

→ recommend tool finds chart, asks questions
→ New question: "How would you like to deploy?"
   Option 1: Direct helm install
   Option 2: Generate Argo CD Application
→ User selects Argo CD
→ Additional questions:
   - Target namespace for the Application CR? (default: argocd)
   - Sync policy? (Manual / Automatic / Automatic with pruning)
   - Where to save the Application YAML?
→ System generates Application CR with all Helm values embedded
→ User gets ready-to-apply YAML (or saves to file)
```

---

## Technical Design

### Workflow Integration

Add new stage after Helm configuration in recommend workflow:

```
[Intent] → [Solution Selection] → [Helm Chart Discovery] → [Questions]
→ [NEW: Deployment Method] → [Generate Output] → [Deploy/Save]
```

### Deployment Method Question

```typescript
{
  id: 'deploymentMethod',
  question: 'How would you like to deploy this application?',
  options: [
    {
      value: 'helm-install',
      label: 'Direct Helm Install',
      description: 'Run helm install now (current behavior)'
    },
    {
      value: 'argocd-application',
      label: 'Argo CD Application',
      description: 'Generate Application CR for GitOps deployment'
    }
  ],
  default: 'helm-install'
}
```

### Argo CD-Specific Questions

When `argocd-application` is selected:

```typescript
{
  id: 'argocdNamespace',
  question: 'Which namespace should the Argo CD Application be created in?',
  type: 'text',
  default: 'argocd'
},
{
  id: 'syncPolicy',
  question: 'What sync policy should be used?',
  options: [
    { value: 'manual', label: 'Manual', description: 'Sync only when triggered' },
    { value: 'auto', label: 'Automatic', description: 'Sync automatically on changes' },
    { value: 'auto-prune', label: 'Automatic with Pruning', description: 'Auto-sync and remove orphaned resources' }
  ],
  default: 'manual'
},
{
  id: 'outputPath',
  question: 'Where should the Application YAML be saved? (leave empty to display only)',
  type: 'text',
  placeholder: './argocd-apps/nginx-ingress.yaml'
}
```

### Application CR Generation

Generate Argo CD Application CR from Helm configuration:

```typescript
interface ArgoApplicationConfig {
  name: string;                    // From chart/release name
  namespace: string;               // Where Application CR lives (default: argocd)
  project: string;                 // Argo CD project (default: default)
  destination: {
    server: string;                // https://kubernetes.default.svc
    namespace: string;             // Target namespace for Helm release
  };
  source: {
    repoURL: string;               // Helm repo URL
    chart: string;                 // Chart name
    targetRevision: string;        // Chart version
    helm: {
      values: string;              // YAML string of all user-provided values
    };
  };
  syncPolicy?: {
    automated?: {
      prune: boolean;
      selfHeal: boolean;
    };
  };
}
```

**Example Output:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: nginx-ingress
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://kubernetes.github.io/ingress-nginx
    chart: ingress-nginx
    targetRevision: 4.8.3
    helm:
      values: |
        controller:
          replicaCount: 2
          resources:
            limits:
              cpu: 500m
              memory: 512Mi
        defaultBackend:
          enabled: true
  destination:
    server: https://kubernetes.default.svc
    namespace: ingress-nginx
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

### File Structure Changes

```
src/
├── core/
│   ├── argocd-generator.ts       # NEW: Application CR generation
│   └── ...
├── tools/
│   └── recommend/
│       ├── helm-workflow.ts      # Update: Add deployment method stage
│       └── ...
prompts/
├── recommend-argocd-questions.md # NEW: Questions for Argo CD options
```

---

## Success Criteria

1. **Deployment Choice**: Users can choose between direct Helm install and Argo CD Application generation
2. **Complete Application CR**: Generated Application includes all Helm values from user answers
3. **Valid Output**: Generated YAML passes `kubectl apply --dry-run` validation
4. **Sync Policy Options**: Users can configure manual, auto, or auto-prune sync policies
5. **File Output**: Users can save Application YAML to specified path
6. **Backward Compatible**: Default behavior (helm install) unchanged for existing users

---

## Out of Scope

1. **Git Push**: Pushing Application CR to Git repository (future PRD)
2. **Argo CD Detection**: Auto-detecting if Argo CD is installed in cluster
3. **ApplicationSet**: Generating ApplicationSets for multi-environment
4. **App of Apps**: Nested Application patterns
5. **Argo CD Project Creation**: Creating new Argo CD projects
6. **Private Helm Repos**: Credential configuration for private repositories
7. **Kustomize Sources**: Only Helm chart sources in this PRD

---

## Dependencies

- **PRD #250** (Third-Party Helm Install): Helm chart discovery and value collection infrastructure
- Argo CD CRD knowledge (Application schema)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Argo CD not installed | Application CR cannot be applied | Warn user; still generate valid YAML for later use |
| Invalid Application generated | Deployment fails | Validate against Argo CD schema; dry-run test |
| Values formatting issues | Helm values not parsed correctly | Use proper YAML serialization; test with complex values |
| Version mismatch | Application CR incompatible with Argo CD version | Target stable v1alpha1 API; document version requirements |

---

## Relationship to Other PRDs

This PRD is part of a larger GitOps integration effort:

| PRD | Scope | Dependency |
|-----|-------|------------|
| **#248** | Helm packaging for capability mode | Independent |
| **#254** (this) | Argo CD + third-party Helm | Needs #250 |
| Future | Argo CD + packaged Helm (from #248) | Needs #248 |
| Future | Argo CD + Kustomize | Needs Kustomize packaging PRD |
| Future | Flux equivalents | Independent track |
| **#202** | May be superseded or narrowed | Review after above PRDs |

---

## Milestones

- [ ] **M1**: Deployment method question integrated into Helm workflow
- [ ] **M2**: Argo CD-specific questions (namespace, sync policy, output path) working
- [ ] **M3**: Application CR generation with embedded Helm values
- [ ] **M4**: File output option functional
- [ ] **M5**: Integration tests covering all deployment paths
- [ ] **M6**: Documentation updated with Argo CD workflow examples

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-06 | PRD created as part of GitOps integration planning |
| 2025-12-06 | Scoped to third-party Helm charts only; other combinations tracked separately |
