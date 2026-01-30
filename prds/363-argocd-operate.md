# PRD: Argo CD Support for Operate Tool

**Issue**: [#363](https://github.com/vfarcic/dot-ai/issues/363)
**Status**: Draft
**Priority**: High
**Created**: 2026-01-30

---

## Problem Statement

When users run the operate tool on resources managed by Argo CD:

1. **Changes get reverted**: Direct `kubectl apply` changes are overwritten when Argo CD syncs
2. **No GitOps awareness**: Operate doesn't know resources are managed by Argo CD
3. **Wrong workflow**: Users must manually find the source repo, locate manifests, and modify them
4. **Disconnected experience**: Operate works great for non-GitOps users but fails for GitOps users

This PRD enables operate to detect Argo CD-managed resources and modify the source Git repository instead of applying changes directly to the cluster.

---

## Solution Overview

### Two Components

1. **Startup Detection**: Detect if Argo CD is installed in the cluster on MCP server startup
2. **Operate Extension**: When Argo CD is detected, extend operate to find Application CRs, clone source repos, modify manifests, and push changes

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server Startup                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  GitOps Detection (runs once at startup)                 │    │
│  │  - Check if argoproj.io API group exists → argoCD: true │    │
│  │  - Check if fluxcd.io API group exists → flux: true     │    │
│  │  - Store in memory for prompt conditioning               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Operate Tool (Runtime)                       │
│                                                                  │
│  [If Argo CD detected at startup]                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Extended Prompt Instructions:                           │    │
│  │  1. Find Application CR managing the target resource     │    │
│  │  2. Extract: repoURL, path, targetRevision               │    │
│  │  3. Clone repo using git-clone tool                      │    │
│  │  4. Find manifest files in repo                          │    │
│  │  5. Generate diff (dry-run style)                        │    │
│  │  6. If user approves: modify files, git-push             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           kubectl/helm Plugin (Git tools from PRD #362)  │    │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐     │    │
│  │  │ kubectl │ │  helm   │ │git-clone │ │ git-push │     │    │
│  │  └─────────┘ └─────────┘ └──────────┘ └──────────┘     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **No dedicated Argo CD tools**: Use kubectl to query Application CRs - they're just Kubernetes resources
2. **Startup detection**: Check API groups once at startup, not on every operation
3. **Conditional prompts**: Only include Argo CD instructions when Argo CD is detected
4. **Reuse Git tools**: Leverage `git-clone` and `git-push` from PRD #362

---

## User Journey

### Journey: Operate on Argo CD-Managed Resource

```
User: "scale deployment nginx to 5 replicas"

→ Operate identifies: nginx Deployment in namespace default
→ [Argo CD detected at startup - extended prompt active]
→ Operate checks: Is this managed by Argo CD?
   - Query: kubectl get applications.argoproj.io -A -o json
   - Find Application where spec.destination matches namespace
   - Check if nginx is in the Application's managed resources

[If Argo CD Application found]
→ Extract from Application spec:
   - repoURL: https://github.com/org/infra-repo.git
   - path: apps/nginx/
   - targetRevision: main

→ Clone repo using git-clone tool
→ Find manifest file: apps/nginx/deployment.yaml
→ Generate proposed changes:

   "This resource is managed by Argo CD Application 'nginx-app'.
    Source: https://github.com/org/infra-repo.git @ apps/nginx/

    Proposed changes to deployment.yaml:
    ```diff
    spec:
      replicas: 3
    + replicas: 5
    ```

    Options:
    1. Push changes to Git (Argo CD will sync)
    2. Cancel operation"

→ User selects option 1
→ Modify deployment.yaml in cloned repo
→ git-push with commit message "Scale nginx to 5 replicas"
→ "Changes pushed. Argo CD will sync shortly."

[If no Argo CD Application found]
→ Standard operate flow (kubectl apply with dry-run, then apply)
```

---

## Technical Design

### Startup Detection

```typescript
// Run once at MCP server startup
interface GitOpsState {
  argoCD: boolean;    // true if argoproj.io API group exists
  flux: boolean;      // true if fluxcd.io API group exists (for future PRD)
}

async function detectGitOps(): Promise<GitOpsState> {
  const apiGroups = await kubectl.getAPIGroups();
  return {
    argoCD: apiGroups.includes('argoproj.io'),
    flux: apiGroups.includes('fluxcd.io')
  };
}

// Store in memory, accessible to prompt construction
let gitOpsState: GitOpsState;
```

### Conditional Prompt Extension

When constructing operate prompts:

```typescript
function buildOperatePrompt(basePrompt: string, gitOpsState: GitOpsState): string {
  let prompt = basePrompt;

  if (gitOpsState.argoCD) {
    prompt += ARGOCD_DETECTION_INSTRUCTIONS;
  }

  if (gitOpsState.flux) {
    prompt += FLUX_DETECTION_INSTRUCTIONS;  // Future PRD
  }

  return prompt;
}
```

### Argo CD Detection Instructions (Prompt Content)

The extended prompt instructs the AI to:

1. **Check for Argo CD management**:
   ```
   Query: kubectl get applications.argoproj.io -A -o json
   For each Application, check if:
   - spec.destination.namespace matches target resource namespace
   - The resource is tracked by this Application (via labels or resource list)
   ```

2. **Extract source information**:
   ```
   From matching Application spec.source:
   - repoURL: Git repository URL
   - path: Directory within repo containing manifests
   - targetRevision: Branch/tag to use
   ```

3. **Clone and locate manifests**:
   ```
   Use git-clone tool to clone the repo
   Navigate to the path specified in Application
   Find the manifest file(s) for the target resource
   ```

4. **Generate dry-run diff**:
   ```
   Show user the current manifest content
   Show proposed changes as a diff
   Explain this is an Argo CD-managed resource
   ```

5. **Execute if approved**:
   ```
   Modify the manifest file(s) in the cloned repo
   Use git-push tool to commit and push
   Inform user that Argo CD will sync the changes
   ```

### Manifest Location Strategy

Finding the right manifest file in the repo:

1. **By filename pattern**: Look for `deployment.yaml`, `<resource-name>.yaml`
2. **By content matching**: Parse YAML files, match by `kind` and `metadata.name`
3. **Kustomize awareness**: If `kustomization.yaml` exists, understand the structure
4. **Helm awareness**: If `Chart.yaml` exists, modify `values.yaml` instead

---

## Success Criteria

1. **Startup detection works**: Argo CD presence correctly detected on server start
2. **Application correlation**: Correctly identifies which Application manages a resource
3. **Repo cloning**: Successfully clones source repos using Git tools
4. **Manifest location**: Finds correct manifest files in various repo structures
5. **Diff preview**: Shows clear before/after diff to user
6. **Git push works**: Changes committed and pushed successfully
7. **Fallback works**: Non-Argo CD resources still use direct kubectl apply
8. **No regression**: Users without Argo CD see no difference in behavior

---

## Out of Scope

1. **Flux support**: Separate PRD (task to create it included)
2. **Remediate integration**: Separate PRD (task to create it included)
3. **Recommend integration**: Already has Git push via PRD #362
4. **ApplicationSet support**: Complex multi-app patterns
5. **Sync triggering**: Manually trigger Argo CD sync after push
6. **Conflict resolution**: If Git push fails, user resolves manually

---

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| PRD #362 (Git Operations) | Required | Draft - provides git-clone, git-push tools |
| kubectl plugin | Internal | Exists - used for Application CR queries |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Wrong Application matched | High | Verify by checking tracked resources, confirm with user |
| Manifest not found in repo | Medium | Clear error message, show repo structure, ask user for path |
| Complex repo structures (Helm/Kustomize) | Medium | Support common patterns, fallback to asking user |
| Stale startup detection | Low | Simple restart refreshes; add refresh command if needed |
| Multiple Applications for same resource | Low | Ask user to select which Application to use |

---

## Milestones

### Milestone 1: Startup GitOps Detection
- [ ] Implement API group detection for Argo CD (and Flux placeholder)
- [ ] Store GitOps state in memory on server startup
- [ ] Add mechanism to access state from prompt construction
- [ ] Unit tests for detection logic

### Milestone 2: Argo CD Detection Prompts
- [ ] Create Argo CD detection prompt instructions
- [ ] Conditionally include in operate prompts when Argo CD detected
- [ ] Instructions for querying Application CRs
- [ ] Instructions for extracting source repo info

### Milestone 3: Manifest Location and Diff
- [ ] Prompt instructions for cloning repo (using git-clone)
- [ ] Prompt instructions for locating manifest files
- [ ] Support for plain YAML, Kustomize, and Helm structures
- [ ] Generate and display diff to user

### Milestone 4: Git Push Integration
- [ ] Prompt instructions for modifying manifests
- [ ] Integration with git-push tool
- [ ] Commit message generation
- [ ] Success/error handling and user feedback

### Milestone 5: Integration Testing
- [ ] End-to-end test: operate on Argo CD-managed Deployment
- [ ] Test: resource not managed by Argo CD (fallback to kubectl)
- [ ] Test: Application found but manifest not in expected location
- [ ] Test: multiple Applications in cluster

### Milestone 6: Documentation
- [ ] Document Argo CD support in operate tool
- [ ] Document GitOps detection mechanism
- [ ] Troubleshooting guide for common issues

### Milestone 7: Future PRD Tasks
- [ ] **Task**: Create PRD for Flux support in operate (similar pattern to Argo CD)
- [ ] **Task**: Create PRD for Argo CD support in remediate tool
- [ ] **Task**: Create PRD for Flux support in remediate tool

---

## Work Log

### 2026-01-30: PRD Creation
- Created PRD based on discussion about GitOps integration
- Designed startup detection for Argo CD (and Flux placeholder)
- Decided to use kubectl for Application CR queries (no dedicated Argo CD tools)
- Conditional prompt extension based on detected GitOps tools
- Depends on PRD #362 for Git tools
- Included tasks to create follow-up PRDs for Flux and remediate

