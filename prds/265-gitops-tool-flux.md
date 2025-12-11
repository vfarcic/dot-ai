# PRD: Flux Support for GitOps Tool

**Issue**: [#265](https://github.com/vfarcic/dot-ai/issues/265)
**Status**: Draft
**Priority**: High
**Created**: 2025-12-10

---

## Problem Statement

PRD #264 introduces the `gitops` tool with shared infrastructure (detection, session management, question framework) and Argo CD as the first provider. Users running Flux need equivalent functionality.

This PRD adds Flux as a second provider to the existing `gitops` tool.

---

## Solution Overview

Implement the `FluxGenerator` class that conforms to the `GitOpsGenerator` interface defined in PRD #264.

**What this PRD adds:**
- Flux-specific questions (reconciliation interval, prune settings)
- Flux resource generation (GitRepository, HelmRelease, Kustomization)

**What this PRD reuses from #264:**
- Package detection
- Session management
- Question framework
- Provider selection UI
- Output handling

---

## User Journey

The user journey is identical to #264, with Flux-specific steps:

```
User: [invokes gitops tool]

→ [SHARED] Tool detects package (e.g., ./charts/my-app/)
→ [SHARED] "Is this the package you want to deploy?" → User confirms
→ [SHARED] "Which GitOps tool would you like to use?"
   - Argo CD
   - Flux (user selects)
→ [SHARED] Common questions (Git repo URL, path, branch, target namespace)
→ [FLUX-SPECIFIC] Flux questions:
   - Namespace for Flux resources? (default: flux-system)
   - Reconciliation interval? (default: 5m)
   - Enable pruning? (default: yes)
→ [SHARED] "Where to save the manifest?" → User specifies path
→ Tool generates Flux resources (GitRepository + HelmRelease/Kustomization)
```

---

## Technical Design

### FluxGenerator Implementation

```typescript
// src/tools/gitops/generators/flux.ts

import { GitOpsGenerator, GitOpsConfig, GeneratedOutput, Question } from './types';

export class FluxGenerator implements GitOpsGenerator {
  readonly providerId = 'flux';
  readonly providerName = 'Flux';

  getQuestions(): Question[] {
    return [
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
        default: '5m',
        description: 'How often Flux checks for changes (e.g., 1m, 5m, 1h)'
      },
      {
        id: 'prune',
        question: 'Enable pruning of removed resources?',
        type: 'select',
        options: [
          { value: 'true', label: 'Yes', description: 'Remove resources deleted from Git' },
          { value: 'false', label: 'No', description: 'Keep orphaned resources' }
        ],
        default: 'true'
      }
    ];
  }

  generate(config: GitOpsConfig): GeneratedOutput {
    const { package: pkg, gitRepoUrl, gitRepoPath, targetRevision, destinationNamespace } = config;
    const { fluxNamespace, reconcileInterval, prune } = config.providerConfig;

    const gitRepository = this.generateGitRepository(pkg.name, fluxNamespace, gitRepoUrl, targetRevision);

    let workloadResource: string;
    if (pkg.type === 'helm') {
      workloadResource = this.generateHelmRelease(pkg, fluxNamespace, gitRepoPath, destinationNamespace, reconcileInterval);
    } else {
      // kustomize and raw-manifests both use Kustomization
      workloadResource = this.generateKustomization(pkg, fluxNamespace, gitRepoPath, destinationNamespace, reconcileInterval, prune);
    }

    return {
      manifests: `${gitRepository}---\n${workloadResource}`,
      filename: 'flux-gitops.yaml',
      description: `Flux GitRepository + ${pkg.type === 'helm' ? 'HelmRelease' : 'Kustomization'} for ${pkg.name}`
    };
  }

  // ... private helper methods
}
```

### Flux Resource Templates

#### GitRepository (Used by all package types)

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: <package-name>
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/org/repo.git
  ref:
    branch: main
```

#### HelmRelease (For Helm charts)

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: <package-name>
  namespace: flux-system
spec:
  interval: 5m
  chart:
    spec:
      chart: ./<path-to-chart>
      sourceRef:
        kind: GitRepository
        name: <package-name>
  targetNamespace: <destination-namespace>
  install:
    createNamespace: true
```

#### Kustomization (For Kustomize overlays and raw manifests)

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: <package-name>
  namespace: flux-system
spec:
  interval: 5m
  sourceRef:
    kind: GitRepository
    name: <package-name>
  path: ./<path-to-kustomization>
  targetNamespace: <destination-namespace>
  prune: true
```

### File Structure Addition

Only one new file is added to the structure from #264:

```
src/tools/gitops/generators/
├── index.ts          # Update: register FluxGenerator
├── types.ts          # No change
├── argocd.ts         # No change
└── flux.ts           # NEW: Flux generator

prompts/gitops/
└── flux-questions.md # NEW: Flux-specific prompts (optional)
```

### Registration

```typescript
// src/tools/gitops/generators/index.ts

import { ArgoCDGenerator } from './argocd';
import { FluxGenerator } from './flux';

// Register both providers
registerProvider(new ArgoCDGenerator());
registerProvider(new FluxGenerator());  // NEW
```

---

## Success Criteria

1. **Flux Provider Available**: "Flux" option appears in provider selection
2. **Flux Questions**: Collects Flux-specific configuration (namespace, interval, prune)
3. **GitRepository Generation**: Valid GitRepository CR for all package types
4. **HelmRelease Generation**: Valid HelmRelease CR for Helm charts
5. **Kustomization Generation**: Valid Kustomization CR for Kustomize and raw manifests
6. **Correct API Versions**: Uses Flux v1/v2 stable APIs
7. **Combined Output**: Single file with GitRepository + workload resource

---

## Out of Scope

1. **Recommend Integration**: Covered by PRD #266
2. **HelmRepository**: External Helm repo references (third-party charts)
3. **OCIRepository**: OCI artifact sources
4. **Multi-Tenancy**: Flux multi-tenant configurations
5. **SOPS/Sealed Secrets**: Encrypted values
6. **Dependencies**: Flux Kustomization dependencies
7. **Health Checks**: Custom health assessments
8. **Private Repos**: SSH keys or token configuration

---

## Dependencies

| Dependency | Relationship |
|------------|--------------|
| **PRD #264** | Required - provides gitops tool infrastructure and `GitOpsGenerator` interface |

---

## Supersedes

This PRD, along with #264 and #266, supersedes:
- **#254** (Argo CD Integration for Third-Party Helm Charts)
- **#255** (Argo CD Integration for Packaged Recommendations)
- **#256** (Flux Integration for GitOps Deployments)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flux API version changes | Generated resources incompatible | Target stable v1/v2 APIs |
| Resource naming conflicts | GitRepository name collides | Use package name, add suffix if needed |

---

## Milestones

- [ ] **M1**: FluxGenerator class implementing GitOpsGenerator interface
- [ ] **M2**: Flux-specific questions
- [ ] **M3**: GitRepository generation
- [ ] **M4**: HelmRelease generation for Helm charts
- [ ] **M5**: Kustomization generation for Kustomize/raw manifests
- [ ] **M6**: Integration tests for Flux generation
- [ ] **M7**: Documentation with Flux examples

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-10 | PRD created - minimal scope, references #264 for shared infrastructure |
