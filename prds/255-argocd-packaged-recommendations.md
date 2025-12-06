# PRD: Argo CD Integration for Packaged Recommendations

**Issue**: [#255](https://github.com/vfarcic/dot-ai/issues/255)
**Status**: Draft
**Priority**: High
**Created**: 2025-12-06

---

## Problem Statement

When using the `recommend` tool in capability mode, users can package their AI-generated manifests as Helm charts or Kustomize overlays (PRD #248). However, there's no integration with Argo CD for GitOps deployment:

1. **Manual Application Creation**: Users must manually write Argo CD Application CRs
2. **No Git Integration**: Packaged output isn't automatically pushed to Git repositories
3. **Disconnected Workflow**: The recommend → package → GitOps flow requires manual steps

Users following GitOps practices with Argo CD need a seamless path from AI recommendations to GitOps-managed deployments.

**Note**: Third-party Helm chart integration with Argo CD is handled separately in PRD #254.

---

## Solution Overview

Extend the `recommend` tool's packaging workflow to offer **Argo CD Application generation** after packaging:

1. **Post-Packaging Question**: After generating Helm chart or Kustomize overlay, ask: "Deploy via GitOps?"
   - No (current behavior - just save packaged output)
   - Yes, generate Argo CD Application

2. **Git Repository Configuration**: Collect Git repository details for storing packaged output

3. **Application CR Generation**: Create Argo CD Application that references:
   - For Helm: The Git repo path containing the generated chart
   - For Kustomize: The Git repo path containing the Kustomize overlay

4. **Output Options**:
   - Save Application CR alongside packaged output
   - (Future: Push to Git repository)

---

## User Journeys

### Journey 1: Helm Package → Argo CD

```
User: "Deploy a web application with nginx"

→ recommend tool generates solution, asks configuration questions
→ User selects output format: Helm Chart (#248)
→ System generates Helm chart structure
→ NEW: "Would you like to deploy via GitOps?"
→ User selects: Argo CD Application
→ Additional questions:
   - Git repository URL for storing the chart?
   - Path within the repository?
   - Argo CD Application namespace? (default: argocd)
   - Sync policy? (Manual / Automatic)
→ System generates:
   - Helm chart at specified path
   - Argo CD Application CR pointing to that path
→ User gets both outputs ready for Git commit
```

### Journey 2: Kustomize → Argo CD

```
User: "Deploy a microservice with PostgreSQL"

→ recommend tool generates solution
→ User selects output format: Kustomize (#248)
→ System generates Kustomize overlay structure
→ NEW: "Would you like to deploy via GitOps?"
→ User selects: Argo CD Application
→ Additional questions:
   - Git repository URL?
   - Path to kustomization.yaml?
   - Sync policy?
→ System generates:
   - Kustomize files at specified path
   - Argo CD Application CR with Kustomize source type
→ User gets both outputs
```

---

## Technical Design

### Workflow Integration

Extend the packaging workflow from #248:

```
[Recommend] → [Package as Helm/Kustomize] → [NEW: GitOps Option] → [Generate Application] → [Save Output]
```

### GitOps Question (Post-Packaging)

```typescript
{
  id: 'gitopsDeployment',
  question: 'Would you like to deploy via GitOps?',
  options: [
    {
      value: 'none',
      label: 'No',
      description: 'Just save the packaged output (current behavior)'
    },
    {
      value: 'argocd',
      label: 'Argo CD Application',
      description: 'Generate Application CR for Argo CD deployment'
    }
  ],
  default: 'none',
  condition: 'outputFormat !== "raw"'  // Only show for Helm/Kustomize
}
```

### Argo CD Configuration Questions

```typescript
// Git repository details
{
  id: 'gitRepoUrl',
  question: 'Git repository URL where packaged output will be stored?',
  type: 'text',
  placeholder: 'https://github.com/org/gitops-repo.git'
},
{
  id: 'gitRepoPath',
  question: 'Path within the repository?',
  type: 'text',
  placeholder: 'apps/my-application',
  default: computed from app name
},
{
  id: 'argocdNamespace',
  question: 'Argo CD Application namespace?',
  type: 'text',
  default: 'argocd'
},
{
  id: 'argocdProject',
  question: 'Argo CD project?',
  type: 'text',
  default: 'default'
},
{
  id: 'syncPolicy',
  question: 'Sync policy?',
  options: [
    { value: 'manual', label: 'Manual' },
    { value: 'auto', label: 'Automatic' },
    { value: 'auto-prune', label: 'Automatic with Pruning' }
  ],
  default: 'manual'
}
```

### Application CR Generation

#### For Helm Chart Source

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-application
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/gitops-repo.git
    path: apps/my-application          # Path to Chart.yaml
    targetRevision: HEAD
    helm:
      valueFiles:
        - values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: my-application
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

#### For Kustomize Source

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-application
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/gitops-repo.git
    path: apps/my-application          # Path to kustomization.yaml
    targetRevision: HEAD
  destination:
    server: https://kubernetes.default.svc
    namespace: my-application
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

### Output Structure

When Argo CD is selected, output directory contains:

**For Helm:**
```
<outputPath>/
├── Chart.yaml
├── values.yaml
├── templates/
│   └── ...
└── argocd-application.yaml    # NEW: Application CR
```

**For Kustomize:**
```
<outputPath>/
├── kustomization.yaml
├── base/
│   └── ...
└── argocd-application.yaml    # NEW: Application CR
```

### Code Reuse from #254

The Application CR generation logic should be shared with PRD #254:

```typescript
// src/core/argocd-generator.ts (from #254)
interface ArgoApplicationConfig {
  name: string;
  namespace: string;
  project: string;
  destination: { server: string; namespace: string };
  source: HelmSource | KustomizeSource | HelmRepoSource;
  syncPolicy?: SyncPolicy;
}

// Reuse for both:
// - #254: HelmRepoSource (external chart repo)
// - #255: HelmSource (Git path) or KustomizeSource (Git path)
```

---

## Success Criteria

1. **Seamless Flow**: Users can go from recommend → package → Argo CD Application in one workflow
2. **Both Package Types**: Works with both Helm and Kustomize output formats
3. **Valid Applications**: Generated Application CRs pass validation
4. **Correct Source Types**: Helm uses helm source config, Kustomize uses directory source
5. **Shared Code**: Application generation logic shared with #254
6. **Backward Compatible**: Users can still skip GitOps integration

---

## Out of Scope

1. **Git Push**: Actually pushing to Git repository (future enhancement)
2. **Third-Party Helm**: Covered by PRD #254
3. **Flux Integration**: Covered by PRD #256
4. **ApplicationSet**: Multi-environment patterns
5. **App of Apps**: Nested Application structures
6. **Private Git Repos**: Credential configuration

---

## Dependencies

| PRD | Relationship |
|-----|--------------|
| **#248** | Required - provides Helm/Kustomize packaging |
| **#254** | Related - shares Application generation code |
| **#256** | Parallel - Flux equivalent of this PRD |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Git URL format variations | Application may not sync | Validate URL format, support common patterns |
| Path assumptions incorrect | Application points to wrong location | Let user specify exact path |
| Sync policy confusion | Unexpected auto-sync behavior | Default to manual, explain options |

---

## Milestones

- [ ] **M1**: GitOps deployment question integrated into packaging workflow
- [ ] **M2**: Git repository configuration questions working
- [ ] **M3**: Application CR generation for Helm chart source
- [ ] **M4**: Application CR generation for Kustomize source
- [ ] **M5**: Shared code with #254 for Application generation
- [ ] **M6**: Integration tests for both Helm and Kustomize paths
- [ ] **M7**: Documentation with examples

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-06 | PRD created as part of GitOps integration restructuring |
| 2025-12-06 | Scoped to packaged output only; third-party Helm in #254 |
