# PRD: Git Operations for Recommend Tool

**Issue**: [#362](https://github.com/vfarcic/dot-ai/issues/362)
**Status**: Draft
**Priority**: High
**Created**: 2026-01-30

---

## Problem Statement

Users running GitOps workflows (Argo CD, Flux) need manifests pushed to Git repositories rather than applied directly to the cluster. Currently:

1. **Manual Git workflow**: Users must manually clone repos, copy manifests, commit, and push
2. **Disconnected from recommend**: The recommend tool generates manifests but has no way to put them in Git
3. **GitOps users can't use direct apply**: For GitOps users, `kubectl apply` is wrong - changes get reverted by the GitOps controller

This PRD adds Git capabilities to enable the recommend tool to push generated manifests directly to Git repositories.

---

## Solution Overview

### Two Components

1. **Git Tools in Plugin**: Add `git-clone` and `git-push` tools to the existing kubectl/helm plugin
2. **Recommend Integration**: Extend recommend workflow to optionally push manifests to Git

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Recommend Tool                          │   │
│  │  - Generates manifests                               │   │
│  │  - Asks: "Push to Git repo?"                        │   │
│  │  - Invokes Git tools if yes                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           kubectl/helm Plugin                        │   │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ │   │
│  │  │ kubectl │ │  helm   │ │git-clone │ │ git-push │ │   │
│  │  └─────────┘ └─────────┘ └──────────┘ └──────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Authentication

- **Initial approach**: PAT (Personal Access Token) provided to MCP server via configuration
- **Token propagation**: MCP server passes token to plugin tools
- **Future enhancement**: Per-user settings (see PRD #360/#361 for auth infrastructure)

---

## User Journey

### Journey: Recommend with Git Push

```
User: "deploy postgresql database"

→ Recommend generates manifests (Deployment, Service, PVC, etc.)
→ "Would you like to push these manifests to a Git repository?"
   - Yes, push to Git
   - No, just show me the manifests

[If user selects "Yes"]
→ "Git repository URL?" (e.g., https://github.com/org/infra-repo.git)
→ "Path within repository?" (e.g., apps/postgresql/)
→ "Branch?" (default: main)
→ "Commit message?" (default: "Add postgresql deployment")

→ Tool clones repo, adds manifests, commits, pushes
→ "Manifests pushed to https://github.com/org/infra-repo.git at apps/postgresql/"
→ "Your GitOps controller (Argo CD/Flux) will sync these changes."
```

---

## Technical Design

### Git Tools in Plugin

#### Tool: `git-clone`

```typescript
interface GitCloneParams {
  repoUrl: string;           // Repository URL (HTTPS)
  branch?: string;           // Branch to clone (default: default branch)
  targetDir: string;         // Local directory to clone into
  token?: string;            // PAT for authentication (from MCP config)
}

interface GitCloneResult {
  success: boolean;
  localPath: string;         // Full path to cloned repo
  branch: string;            // Branch that was checked out
  error?: string;
}
```

#### Tool: `git-push`

```typescript
interface GitPushParams {
  repoPath: string;          // Local repo path
  files: Array<{
    path: string;            // Relative path within repo
    content: string;         // File content
  }>;
  commitMessage: string;     // Commit message
  branch?: string;           // Branch to push to (default: current branch)
  token?: string;            // PAT for authentication
}

interface GitPushResult {
  success: boolean;
  commitSha?: string;        // SHA of the created commit
  branch: string;            // Branch pushed to
  filesAdded: string[];      // List of files added/modified
  error?: string;
}
```

### Token Configuration

Token provided via MCP server configuration:

```json
{
  "git": {
    "token": "${GIT_TOKEN}"
  }
}
```

MCP server propagates token to plugin tools when invoking them.

### Recommend Workflow Extension

Add new stage after `generateManifests`:

```
[existing stages]
  intent → chooseSolution → answerQuestions → generateManifests
                                                      ↓
                                            [NEW: pushToGit stage - optional]
                                                      ↓
                                            Collect Git info (repo, path, branch)
                                                      ↓
                                            Clone → Add files → Commit → Push
```

### Session Extension

```typescript
interface RecommendSession {
  // ... existing fields ...

  // Git push options (populated in pushToGit stage)
  gitConfig?: {
    repoUrl: string;
    path: string;
    branch: string;
    commitMessage: string;
  };
}
```

---

## Success Criteria

1. **Git tools functional**: `git-clone` and `git-push` work with PAT authentication
2. **Recommend integration**: Users can push manifests to Git from recommend workflow
3. **Error handling**: Clear error messages for auth failures, network issues, conflicts
4. **GitOps agnostic**: Works with any GitOps tool (Argo CD, Flux, or manual sync)
5. **Clean workflow**: Non-GitOps users unaffected - Git push is optional

---

## Out of Scope

1. **PR workflow**: Creating pull requests instead of direct push (future enhancement)
2. **SSH authentication**: Only HTTPS with PAT initially
3. **Conflict resolution**: If push fails due to conflicts, user must resolve manually
4. **Argo CD/Flux integration**: This PRD doesn't detect or create Application CRs (see Argo CD PRD)
5. **Per-user tokens**: Initial implementation uses server-wide token (per-user comes with PRD #360/#361)

---

## Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| kubectl/helm plugin | Internal | Git tools added to existing plugin |
| PRD #360/#361 | Future | Per-user authentication (not blocking) |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token exposure | High | Token passed securely, not logged, environment variable |
| Push conflicts | Medium | Clear error message, user resolves manually |
| Wrong branch/path | Medium | Confirm details before push, show preview |
| Large repos slow to clone | Low | Shallow clone option, clone to temp directory |

---

## Milestones

### Milestone 1: Git Tools in Plugin
- [ ] Implement `git-clone` tool with PAT authentication
- [ ] Implement `git-push` tool (add files, commit, push)
- [ ] Token configuration and propagation from MCP server
- [ ] Error handling for common failures (auth, network, conflicts)
- [ ] Unit tests for Git tools

### Milestone 2: Recommend Integration
- [ ] Add `pushToGit` stage to recommend workflow
- [ ] Collect Git configuration (repo URL, path, branch, message)
- [ ] Invoke Git tools to clone, add manifests, push
- [ ] Session management for Git config
- [ ] Integration tests for recommend → Git flow

### Milestone 3: User Experience Polish
- [ ] Clear confirmation before push (show what will be pushed where)
- [ ] Success message with repo URL and path
- [ ] Helpful error messages with remediation steps
- [ ] Documentation for Git push feature

### Milestone 4: Future Enhancements (Separate PRDs)
- [ ] **Task**: Create PRD for PR workflow (create PR instead of direct push)
- [ ] **Task**: Update PRD #360/#361 to include Git token in per-user settings

---

## Work Log

### 2026-01-30: PRD Creation
- Created PRD based on discussion about GitOps integration
- Decided on plugin-based Git tools (`git-clone`, `git-push`)
- Scoped to PAT authentication and direct push initially
- PR workflow and per-user tokens deferred to future PRDs

