# PRD: Git Operations for Recommend Tool

**Issue**: [#362](https://github.com/vfarcic/dot-ai/issues/362)
**Status**: In Progress (Milestone 1 Complete)
**Priority**: High
**Created**: 2026-01-30
**Updated**: 2026-03-10

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

1. **Git Tools in MCP Server**: `git-clone` and `git-push` tools registered directly in MCP server
2. **Recommend Integration**: Extend recommend workflow to optionally push manifests to Git (pending)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Recommend Tool                          │   │
│  │  - Generates manifests                               │   │
│  │  - Asks: "Push to Git repo?" (pending)              │   │
│  │  - Invokes Git tools if yes                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Built-in MCP Tools                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐  │   │
│  │  │recommend │ │  query   │ │git-clone│ │git-push│  │   │
│  │  └──────────┘ └──────────┘ └─────────┘ └────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Authentication

- **Implemented**: PAT (Personal Access Token) and GitHub App authentication
- **Token propagation**: Environment variables from Helm chart
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
→ "Git repository URL?" (required — accepts full URL or "user/repo" shorthand for GitHub)
→ AI suggests defaults for all other fields, user can override:
   - Path: repo root (/)
   - Branch: main
   - Commit message: AI-generated based on manifests (e.g., "Add postgresql deployment")
   - File name: AI-suggested based on resource type (e.g., "postgresql.yaml")

→ Tool clones repo, adds manifests, commits, pushes
→ "Manifests pushed to https://github.com/org/infra-repo.git at postgresql.yaml"
→ "Your GitOps controller (Argo CD/Flux) will sync these changes."
```

**Design Decision**: Only the repo URL is mandatory. The server runs remotely so it cannot
detect the user's local Git context. The client agent may suggest a repo URL, but the user
must confirm it. All other parameters (path, branch, commit message, file name) have sensible
defaults provided by the AI, keeping the interaction minimal while still allowing full control.

---

## Technical Design

### Git Tools in MCP Server

#### Tool: `git-clone`

```typescript
interface GitCloneParams {
  repoUrl: string; // Repository URL (HTTPS)
  branch?: string; // Branch to clone (default: default branch)
  targetDir?: string; // Local directory to clone into (default: ./tmp)
  depth?: number; // Shallow clone depth
}

interface GitCloneResult {
  success: boolean;
  localPath: string; // Full path to cloned repo
  branch: string; // Branch that was checked out
  error?: string;
}
```

#### Tool: `git-push`

```typescript
interface GitPushParams {
  repoPath: string; // Local repo path
  files: Array<{
    path: string; // Relative path within repo
    content: string; // File content
  }>;
  commitMessage: string; // Commit message
  branch?: string; // Branch to push to (default: current branch)
  author?: {
    name: string;
    email: string;
  };
}

interface GitPushResult {
  success: boolean;
  commitSha?: string; // SHA of the created commit
  branch: string; // Branch pushed to
  filesAdded: string[]; // List of files added/modified
  error?: string;
}
```

### Token Configuration

Token provided via Helm values:

```yaml
secrets:
  git:
    token: '' # PAT token
  githubApp:
    enabled: false
    appId: ''
    privateKey: ''
    installationId: ''
```

Environment variables:

- `GIT_TOKEN` - PAT token
- `GITHUB_APP_ENABLED` - Enable GitHub App auth
- `GITHUB_APP_ID` - GitHub App ID
- `GITHUB_APP_PRIVATE_KEY` - GitHub App private key (PEM format)
- `GITHUB_APP_INSTALLATION_ID` - Installation ID (optional)

### Security Features

- **Path traversal protection**: Prevents malicious file paths from writing outside repository directory
- **GitHub API timeout**: 30s timeout to prevent indefinite hangs
- **Helm validation**: Fails at deploy-time if GitHub App enabled but missing required fields

### Recommend Workflow Extension

Add new stage after `generateManifests`:

```
[existing stages]
  intent → chooseSolution → answerQuestions → generateManifests
                                                      ↓
                                            [NEW: pushToGit stage - optional]
                                                      ↓
                                            Ask for repo URL (only mandatory input)
                                                      ↓
                                            AI suggests: path (/), branch (main),
                                            commit message, file name — user can override
                                                      ↓
                                            Clone → Add files → Commit → Push
```

#### Repo URL Input

The repo URL is the only required input. It accepts:
- Full HTTPS URL: `https://github.com/org/infra-repo.git`
- GitHub shorthand: `org/infra-repo` or `user/repo` (expanded to `https://github.com/{value}.git`)

#### AI-Suggested Defaults

All other parameters are AI-suggested with sensible defaults:

| Parameter | Default | AI Suggestion |
|-----------|---------|---------------|
| Path | Repo root (`/`) | User can specify subdirectory (e.g., `apps/postgresql/`) |
| Branch | `main` | User can specify any branch |
| Commit message | — | Generated based on manifest content (e.g., "Add postgresql deployment") |
| File name | — | Generated based on resource type (e.g., `postgresql.yaml`) |

---

## Success Criteria

1. **Git tools functional**: `git-clone` and `git-push` work with PAT authentication ✅
2. **Recommend integration**: Users can push manifests to Git from recommend workflow (Pending)
3. **Error handling**: Clear error messages for auth failures, network issues, conflicts ✅
4. **GitOps agnostic**: Works with any GitOps tool (Argo CD, Flux, or manual sync) ✅
5. **Clean workflow**: Non-GitOps users unaffected - Git push is optional ✅

---

## Out of Scope

1. **PR workflow**: Creating pull requests instead of direct push (future enhancement)
2. **SSH authentication**: Only HTTPS with PAT/GitHub App initially
3. **Conflict resolution**: If push fails due to conflicts, user must resolve manually
4. **Argo CD/Flux integration**: This PRD doesn't detect or create Application CRs (see Argo CD PRD)
5. **Per-user tokens**: Initial implementation uses server-wide token (per-user comes with PRD #360/#361)

---

## Dependencies

| Dependency    | Type     | Notes                                  |
| ------------- | -------- | -------------------------------------- |
| simple-git    | External | Git operations wrapper                 |
| jsonwebtoken  | External | JWT generation for GitHub App auth     |
| PRD #360/#361 | Future   | Per-user authentication (not blocking) |

---

## Risks and Mitigations

| Risk                      | Impact   | Mitigation                                              | Status       |
| ------------------------- | -------- | ------------------------------------------------------- | ------------ |
| Token exposure            | High     | Token passed securely, not logged, environment variable | ✅ Mitigated |
| Push conflicts            | Medium   | Clear error message, user resolves manually             | ✅ Mitigated |
| Wrong branch/path         | Medium   | Confirm details before push, show preview               | Pending      |
| Large repos slow to clone | Low      | Shallow clone option, clone to temp directory           | ✅ Mitigated |
| Path traversal attacks    | Critical | Validate file paths don't escape repo directory         | ✅ Mitigated |

---

## Milestones

### Milestone 1: Git Tools in MCP Server ✅ COMPLETE

- [x] Implement `git-clone` tool with PAT authentication
- [x] Implement `git-push` tool (add files, commit, push)
- [x] GitHub App authentication (JWT + installation token)
- [x] Token configuration via Helm values
- [x] Error handling for common failures (auth, network, conflicts)
- [x] Unit tests for Git tools (20 tests)
- [x] Integration tests for Git tools (6 tests)
- [x] Path traversal protection
- [x] GitHub API timeout (30s)

**PR**: [#393](https://github.com/vfarcic/dot-ai/pull/393)

### Milestone 2: Recommend Integration (Pending)

- [ ] Add `pushToGit` stage to recommend workflow
- [ ] Repo URL input with GitHub shorthand support (`user/repo` → `https://github.com/user/repo.git`)
- [ ] AI-suggested defaults for path (root), branch (main), commit message, file name
- [ ] Allow user to override any default
- [ ] Invoke Git tools to clone, add manifests, push
- [ ] Integration tests for recommend → Git flow

### Milestone 3: User Experience Polish (Pending)

- [ ] Success message with repo URL, path, and branch
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

### 2026-03-10: Simplified Git Push UX (Design Decision)

- **Decision**: Only repo URL is mandatory; all other inputs have AI-suggested defaults
- **Rationale**: Server runs remotely, cannot detect user's local Git context. Asking for repo, path, branch, commit message, and file name individually is overcomplicated. Sensible defaults minimize friction.
- **Changes**:
  - Repo URL accepts GitHub shorthand (`user/repo`) in addition to full HTTPS URLs
  - Path defaults to repo root
  - Branch defaults to `main`
  - Commit message and file name are AI-suggested based on generated manifests
  - User can override any default but doesn't have to
- **Removed**: Session management for Git config (no longer needed with defaults)
- **Removed**: Separate "confirm before push" step from Milestone 3 (defaults shown inline)

### 2026-03-02: Milestone 1 Implementation

- Implemented `git-clone` tool with PAT and GitHub App authentication
- Implemented `git-push` tool with commit/push functionality
- Added Helm chart configuration for git.token and githubApp.\*
- Added environment variables in deployment.yaml
- Implemented security features:
  - Path traversal protection
  - GitHub API timeout (30s)
  - Helm validation for GitHub App config
- Unit tests: 20 tests, all passing
- Integration tests: 6 tests, all passing
- Dependencies added: simple-git, jsonwebtoken
- PR #393 opened for review
