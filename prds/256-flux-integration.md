# PRD: Flux Integration for GitOps Deployments

**Issue**: [#256](https://github.com/vfarcic/dot-ai/issues/256)
**Status**: Draft
**Priority**: High
**Created**: 2025-12-06

---

## Problem Statement

Users running Flux for GitOps have no way to integrate `recommend` tool output with their Flux workflows:

1. **Third-Party Helm Charts**: When installing apps via Helm mode, users must manually create HelmRepository and HelmRelease resources
2. **Packaged Helm Charts**: When packaging recommendations as Helm charts (#248), no Flux integration exists
3. **Kustomize Overlays**: When packaging as Kustomize (#248), users must manually create Flux Kustomization resources

This creates a gap where AI-powered recommendations don't integrate with Flux GitOps practices.

---

## Solution Overview

Extend the `recommend` tool to support Flux GitOps integration across all output types:

### Scenario 1: Third-Party Helm Charts
When using Helm mode (third-party apps), offer to generate:
- `HelmRepository` CR pointing to external chart repo
- `HelmRelease` CR with user-provided values

### Scenario 2: Packaged Helm Charts
When packaging recommendations as Helm charts (#248), offer to generate:
- `GitRepository` CR pointing to user's Git repo
- `HelmRelease` CR referencing the chart in Git

### Scenario 3: Kustomize Overlays
When packaging recommendations as Kustomize (#248), offer to generate:
- `GitRepository` CR pointing to user's Git repo
- `Kustomization` CR referencing the overlay path

---

## User Journeys

### Journey 1: Third-Party Helm → Flux

```
User: "Install nginx ingress controller"

→ recommend tool finds chart, asks questions
→ "How would you like to deploy?"
   Option 1: Direct helm install
   Option 2: Argo CD Application (#254)
   Option 3: Flux HelmRelease (NEW)
→ User selects Flux
→ Additional questions:
   - Namespace for Flux resources? (default: flux-system)
   - HelmRelease namespace? (target namespace)
   - Reconciliation interval? (default: 5m)
→ System generates:
   - HelmRepository CR (if not already exists for this repo)
   - HelmRelease CR with all user-provided values
→ User gets ready-to-apply YAML
```

### Journey 2: Packaged Helm → Flux

```
User: "Deploy a web application"

→ recommend tool generates solution
→ User selects output format: Helm Chart (#248)
→ "Would you like to deploy via GitOps?"
   - No
   - Argo CD Application (#255)
   - Flux HelmRelease (NEW)
→ User selects Flux
→ Additional questions:
   - Git repository URL?
   - Path to chart?
   - Git branch? (default: main)
→ System generates:
   - Helm chart files
   - GitRepository CR
   - HelmRelease CR referencing GitRepository
```

### Journey 3: Kustomize → Flux

```
User: "Deploy a microservice"

→ recommend tool generates solution
→ User selects output format: Kustomize (#248)
→ "Would you like to deploy via GitOps?"
   - No
   - Argo CD Application (#255)
   - Flux Kustomization (NEW)
→ User selects Flux
→ Additional questions:
   - Git repository URL?
   - Path to kustomization.yaml?
→ System generates:
   - Kustomize files
   - GitRepository CR
   - Kustomization CR referencing GitRepository
```

---

## Technical Design

### Deployment Method Question Updates

Update the deployment method question to include Flux options:

**For Third-Party Helm (Helm mode):**
```typescript
{
  id: 'deploymentMethod',
  question: 'How would you like to deploy this application?',
  options: [
    { value: 'helm-install', label: 'Direct Helm Install' },
    { value: 'argocd', label: 'Argo CD Application' },      // #254
    { value: 'flux', label: 'Flux HelmRelease' }            // NEW
  ]
}
```

**For Packaged Output (after #248 packaging):**
```typescript
{
  id: 'gitopsDeployment',
  question: 'Would you like to deploy via GitOps?',
  options: [
    { value: 'none', label: 'No' },
    { value: 'argocd', label: 'Argo CD Application' },      // #255
    { value: 'flux', label: 'Flux GitOps' }                 // NEW
  ],
  condition: 'outputFormat !== "raw"'
}
```

### Flux-Specific Questions

```typescript
// Common Flux questions
{
  id: 'fluxNamespace',
  question: 'Namespace for Flux resources?',
  type: 'text',
  default: 'flux-system'
},
{
  id: 'reconcileInterval',
  question: 'Reconciliation interval?',
  type: 'text',
  default: '5m'
}

// For Git-based sources (packaged Helm/Kustomize)
{
  id: 'gitRepoUrl',
  question: 'Git repository URL?',
  type: 'text'
},
{
  id: 'gitBranch',
  question: 'Git branch?',
  type: 'text',
  default: 'main'
},
{
  id: 'gitPath',
  question: 'Path within repository?',
  type: 'text'
}
```

### Flux Resource Generation

#### Scenario 1: Third-Party Helm (HelmRepository + HelmRelease)

```yaml
---
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: ingress-nginx
  namespace: flux-system
spec:
  interval: 1h
  url: https://kubernetes.github.io/ingress-nginx
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: nginx-ingress
  namespace: flux-system
spec:
  interval: 5m
  chart:
    spec:
      chart: ingress-nginx
      version: "4.8.3"
      sourceRef:
        kind: HelmRepository
        name: ingress-nginx
  targetNamespace: ingress-nginx
  values:
    controller:
      replicaCount: 2
      resources:
        limits:
          cpu: 500m
          memory: 512Mi
```

#### Scenario 2: Packaged Helm (GitRepository + HelmRelease)

```yaml
---
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: my-app-repo
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/org/gitops-repo.git
  ref:
    branch: main
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: my-application
  namespace: flux-system
spec:
  interval: 5m
  chart:
    spec:
      chart: ./apps/my-application    # Path to Chart.yaml
      sourceRef:
        kind: GitRepository
        name: my-app-repo
  targetNamespace: my-application
  values:
    # Values from user answers
```

#### Scenario 3: Kustomize (GitRepository + Kustomization)

```yaml
---
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: my-app-repo
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/org/gitops-repo.git
  ref:
    branch: main
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: my-application
  namespace: flux-system
spec:
  interval: 5m
  sourceRef:
    kind: GitRepository
    name: my-app-repo
  path: ./apps/my-application         # Path to kustomization.yaml
  targetNamespace: my-application
  prune: true
```

### File Structure

```
src/
├── core/
│   ├── argocd-generator.ts    # From #254/#255
│   └── flux-generator.ts      # NEW: Flux resource generation
├── tools/
│   └── recommend/
│       ├── helm-workflow.ts   # Update: Add Flux option
│       └── packaging.ts       # Update: Add Flux option
```

### Output Structure

**Third-Party Helm + Flux:**
```
<outputPath>/
├── helmrepository.yaml
└── helmrelease.yaml
```

**Packaged Helm + Flux:**
```
<outputPath>/
├── Chart.yaml
├── values.yaml
├── templates/
│   └── ...
├── gitrepository.yaml
└── helmrelease.yaml
```

**Kustomize + Flux:**
```
<outputPath>/
├── kustomization.yaml
├── base/
│   └── ...
├── gitrepository.yaml
└── flux-kustomization.yaml
```

---

## Success Criteria

1. **All Three Scenarios**: Flux integration works for third-party Helm, packaged Helm, and Kustomize
2. **Valid Resources**: Generated Flux CRs pass validation
3. **Correct API Versions**: Use current Flux v2 API versions
4. **Values Preserved**: All user-provided values embedded in HelmRelease
5. **GitRepository Reuse**: Detect if GitRepository already exists (future)
6. **Consistent UX**: Similar question flow as Argo CD integration

---

## Out of Scope

1. **Git Push**: Actually pushing to Git repository
2. **Flux Installation**: Installing or configuring Flux
3. **Multi-Tenancy**: Flux multi-tenant configurations
4. **SOPS/Sealed Secrets**: Encrypted values
5. **Dependency Management**: Flux Kustomization dependencies
6. **Health Checks**: Custom health assessments
7. **Private Git Repos**: Credential configuration

---

## Dependencies

| PRD | Relationship |
|-----|--------------|
| **#248** | Required for packaged Helm/Kustomize scenarios |
| **#250** | Required for third-party Helm infrastructure |
| **#254** | Parallel - Argo CD third-party Helm equivalent |
| **#255** | Parallel - Argo CD packaged equivalent |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flux API version changes | Generated resources incompatible | Target stable v1/v2 APIs |
| GitRepository naming conflicts | Resource already exists | Use consistent naming, add suffix if needed |
| HelmRepository duplication | Multiple repos for same URL | Check existing HelmRepositories (future) |
| Path format differences | Resources can't find source | Validate path format, provide examples |

---

## Milestones

- [ ] **M1**: Flux option added to third-party Helm deployment choices
- [ ] **M2**: HelmRepository + HelmRelease generation for third-party Helm
- [ ] **M3**: Flux option added to packaging workflow (#248 integration)
- [ ] **M4**: GitRepository + HelmRelease generation for packaged Helm
- [ ] **M5**: GitRepository + Kustomization generation for Kustomize
- [ ] **M6**: Integration tests for all three scenarios
- [ ] **M7**: Documentation with Flux-specific examples

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-06 | PRD created covering all Flux integration scenarios |
| 2025-12-06 | Consolidated third-party Helm, packaged Helm, and Kustomize into single PRD |
