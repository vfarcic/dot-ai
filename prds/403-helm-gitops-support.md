# PRD: Helm GitOps Support

**Issue**: [#403](https://github.com/vfarcic/dot-ai/issues/403)
**Status**: Proposed
**Priority**: Medium
**Created**: 2026-03-12
**Depends On**: PRD #395 (Git Push Recommend Integration - Complete)

---

## Problem Statement

The `pushToGit` stage (PRD #395) pushes generated manifests to Git repositories for GitOps workflows. However, for **Helm chart solutions**, it only pushes `values.yaml` — which is not usable on its own. GitOps controllers need an Application CR (Argo CD) or HelmRelease CR (Flux) that references the chart and includes the values.

Currently:
1. Users with Helm solutions can only use `deployManifests` (direct install)
2. No GitOps option for Helm charts
3. Manual CR creation required for Helm GitOps workflows
4. Inconsistent UX between raw/Kustomize (GitOps-ready) and Helm (not GitOps-ready)

---

## Solution Overview

Extend `pushToGit` to generate and push GitOps-specific CRs for Helm solutions:

| Controller | CR Type | What Gets Pushed |
|------------|---------|------------------|
| Argo CD | `Application` | `Application` CR with embedded values |
| Flux | `HelmRelease` | `HelmRelease` CR + `HelmRepository` (if needed) |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Recommend Tool                          │   │
│  │  Stages: recommend → chooseSolution →                │   │
│  │          answerQuestion → generateManifests          │   │
│  │          → pushToGit (Helm support)                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         GitOps CR Generator (NEW)                    │   │
│  │  - Detect GitOps controller (Argo CD / Flux)         │   │
│  │  - Generate Application or HelmRelease CR            │   │
│  │  - Embed values or reference ConfigMap               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### User Journey

```
User: Install Prometheus (Helm chart selected)
→ generateManifests: creates values.yaml
→ pushToGit stage:
   → "Which GitOps controller?" 
     - Auto-detect (Argo CD detected)
     - Argo CD
     - Flux
   → Generates Application CR with embedded values
   → Pushes CR to Git repository
   → "Argo CD will sync and install Prometheus"
```

---

## Technical Design

### Phase 1: Controller Detection

1. **Auto-detect from cluster**: Check for Argo CD CRDs (`argoproj.io/v1alpha1`) or Flux CRDs (`helm.toolkit.fluxcd.io/v2`)
2. **Fallback**: Ask user to specify controller type
3. **Configuration**: Allow explicit setting via environment variable or Helm values

### Phase 2: CR Generation

**Argo CD Application:**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: prometheus
  namespace: argocd
  labels:
    dot-ai.io/solution-id: sol-xxx
spec:
  project: default
  source:
    repoURL: https://prometheus-community.github.io/helm-charts
    chart: prometheus
    targetRevision: "27.49.0"
    helm:
      values: |
        # ... values.yaml content embedded
  destination:
    server: https://kubernetes.default.svc
    namespace: monitoring
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**Flux HelmRelease:**
```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: prometheus
  namespace: flux-system
  labels:
    dot-ai.io/solution-id: sol-xxx
spec:
  interval: 5m
  chart:
    spec:
      chart: prometheus
      version: "27.49.0"
      sourceRef:
        kind: HelmRepository
        name: prometheus-community
  values:
    # ... values.yaml content
```

**Flux HelmRepository (auto-created if needed):**
```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: prometheus-community
  namespace: flux-system
spec:
  interval: 5m
  url: https://prometheus-community.github.io/helm-charts
```

### Phase 3: Repository Structure

**Option A: Single-file (embedded values)**
```
apps/
├── prometheus/
│   └── application.yaml     # Application CR with embedded values
```

**Option B: Multi-file (ConfigMap for values)**
```
apps/
├── prometheus/
│   ├── application.yaml     # Application CR
│   └── values.yaml          # ConfigMap with values
```

### Implementation Files

1. **New file**: `src/core/gitops-generator.ts`
   - `detectGitOpsController()`: Check cluster for Argo CD/Flux
   - `generateArgoCDApplication()`: Build Application CR
   - `generateFluxHelmRelease()`: Build HelmRelease CR
   - `generateFluxHelmRepository()`: Build HelmRepository CR (if needed)

2. **Modified file**: `src/tools/push-to-git.ts`
   - Remove Helm rejection validation
   - Add GitOps CR generation for Helm type
   - Handle controller detection

3. **Modified file**: `src/tools/generate-manifests.ts`
   - Re-enable `pushToGit` in `nextActions` for Helm solutions

---

## Success Criteria

1. **Helm GitOps works**: Users can push Helm solutions to Git for GitOps
2. **Controller detection**: Auto-detect Argo CD or Flux from cluster
3. **Argo CD support**: Generate valid `Application` CR
4. **Flux support**: Generate valid `HelmRelease` + `HelmRepository` CRs
5. **Consistent UX**: Same workflow as raw/Kustomize manifests
6. **Error handling**: Clear messages for missing CRDs, auth failures

---

## Out of Scope

1. **Pull Request workflow**: Creating PRs instead of direct push (future PRD)
2. **Values encryption**: SOPS, sealed-secrets integration
3. **Multi-source Application**: Argo CD multi-source apps
4. **Per-user tokens**: Still uses server-wide token
5. **Custom namespace**: Controller-specific namespace handling

---

## Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| PRD #395 | PRD | Complete | Git Push Recommend Integration |
| PRD #362 | PRD | Complete | Git Operations (git utilities) |
| Argo CD CRDs | Cluster | Optional | Auto-detect if present |
| Flux CRDs | Cluster | Optional | Auto-detect if present |

---

## Risks and Mitigations

| Risk | Impact | Mitigation | Status |
|------|--------|------------|--------|
| CRDs not installed | Medium | Ask user to specify controller type | Pending |
| Large values.yaml | Low | Use ConfigMap for values >10KB | Pending |
| Controller version compatibility | Medium | Test with recent versions | Pending |
| Multi-cluster scenarios | Low | Document single-cluster limitation | Pending |

---

## Milestones

### Milestone 1: Argo CD Support

- [ ] Implement `detectGitOpsController()` function
- [ ] Implement `generateArgoCDApplication()` function
- [ ] Update `push-to-git.ts` to handle Helm type
- [ ] Re-enable `pushToGit` in `nextActions` for Helm
- [ ] Unit tests for Argo CD CR generation
- [ ] Integration test with Argo CD cluster

### Milestone 2: Flux Support

- [ ] Implement `generateFluxHelmRelease()` function
- [ ] Implement `generateFluxHelmRepository()` function
- [ ] Handle HelmRepository creation if not exists
- [ ] Unit tests for Flux CR generation
- [ ] Integration test with Flux cluster

### Milestone 3: Documentation

- [ ] Update `recommend.md` with Helm GitOps examples
- [ ] Document controller detection behavior
- [ ] Add troubleshooting guide for GitOps Helm issues

---

## Work Log

### 2026-03-12: PRD Creation

- Created GitHub issue #403 for PRD
- Created PRD file following prd-create.md workflow
- Defined 3 major milestones
- Documented problem, solution, and success criteria
- Ready for implementation

---

## Cross References

- **PRD #395**: Git Push Recommend Integration (foundation)
- **PRD #362**: Git Operations (git utilities)
- **Issue #403**: This PRD's tracking issue
