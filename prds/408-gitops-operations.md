# PRD: GitOps Operations for Remediate Tool

**Issue**: [#408](https://github.com/vfarcic/dot-ai/issues/408)
**Status**: In Progress
**Priority**: High
**Created**: 2026-03-16
**Depends On**: [#407](https://github.com/vfarcic/dot-ai/issues/407) (GitOps Discovery — Layer 1)

---

## Problem Statement

After Layer 1 (#407) enriches remediate's analysis with GitOps context — identifying the source repo, path, and file that needs changing — the user still has to manually:

1. **Clone the repo** and find the file
2. **Make the changes** suggested by the analysis
3. **Create a branch, commit, and push**
4. **Open a PR** for review

This manual workflow is error-prone and slow, especially when the analysis already knows exactly what needs to change.

---

## Solution Overview

Add an internal agentic-loop tool (`git_create_pr`) that creates PRs with fixes for GitOps-managed resources. When the user confirms execution, the system automatically creates a PR instead of running kubectl commands — no additional choice needed. The AI determined during investigation that the resource is GitOps-managed, so PR creation is the correct execution path.

The AI constructs the modified file content during investigation (it already read the file via `fs_read` in Layer 1 and knows what to change), then passes the complete new content to `git_create_pr` which handles branching, committing, pushing, and PR creation.

### How It Fits Into Existing Flow

The existing remediate execution choices ("Execute via MCP" / "Execute via agent") remain unchanged. The difference is purely behind the scenes:

- **Non-GitOps resource**: Execution runs kubectl commands (existing behavior)
- **GitOps-managed resource**: Execution creates a PR with the manifest changes (new behavior)

The user doesn't choose between PR and kubectl — the context determines the execution path.

### Tool Layers (same as Layer 1)

This PRD adds one more internal agentic-loop tool — NOT an MCP tool, NOT a plugin tool. Client agents still just call `remediate` and get back results including a PR URL.

### Architecture

```
Client Agent (Claude Code, Cursor)
         │
         │ calls remediate MCP tool
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MCP Server                                   │
│                                                                  │
│  remediate handler                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  AI Investigation Loop (from Layer 1, #407)              │    │
│  │  - kubectl_* tools (plugin) for cluster investigation    │    │
│  │  - git_clone, fs_list, fs_read (internal) for repo       │    │
│  │  → Produces analysis with gitSource remediation actions  │    │
│  │  → AI constructs modified file content from fs_read      │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Remediation Execution (user confirms "fix it")          │    │
│  │                                                          │    │
│  │  Has gitSource actions?                                  │    │
│  │  ├─ YES → git_create_pr: write modified files to cloned  │    │
│  │  │        repo, create branch, push, open PR via         │    │
│  │  │        GitHub API → return PR URL to client agent     │    │
│  │  │                                                       │    │
│  │  └─ NO  → Execute kubectl commands (existing behavior)   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **No new execution choice**: The AI already knows whether the resource is GitOps-managed. User confirms execution; the system picks the right path automatically
2. **No fs_write tool**: The AI constructs modified file content in context (from `fs_read` output + its fix), then passes complete content to `git_create_pr`. Avoids building a file editor inside the server
3. **Full PR creation via GitHub API**: Creates the PR automatically, not just a branch push. GitHub-only initially; GitLab/Bitbucket support in future PRDs
4. **Internal agentic-loop tool**: `git_create_pr` runs locally in MCP server, not exposed to client agents
5. **Reuses cloned repo from Layer 1**: The repo cloned during investigation (in `./tmp/{sessionId}/`) is reused — no need to clone again
6. **Reusable by design**: The `git_create_pr` tool can be reused by operate and recommend in future PRDs

---

## User Journey

### Journey: Full Remediation Flow (Layer 1 + Layer 2)

```
User: remediate("pods in namespace production are crashlooping")

── Layer 1 (Investigation) ──

→ AI investigates, detects Argo CD management, clones repo, reads manifests
→ Returns analysis:
  "Root cause: Deployment api-server has invalid image tag 'v2.broken'.
   Managed by Argo CD Application 'api-server'.
   Source: https://github.com/org/infra-repo.git @ apps/production/

   Remediation:
   - In apps/production/deployment.yaml, change image from 'v2.broken' to 'v2.1.0'

   Execution choices:
   1. Execute via MCP
   2. Execute via agent"

── Layer 2 (Execution — user picks either choice) ──

User: remediate(executeChoice: 1, sessionId: "...")

→ System detects gitSource actions in the analysis
→ Instead of kubectl, calls git_create_pr:
  - Repo already cloned at ./tmp/{sessionId}/infra-repo/
  - Writes modified deployment.yaml (image tag fix) to cloned repo
  - Creates branch: remediate/api-server-image-fix
  - Commits: "fix: update api-server image tag from v2.broken to v2.1.0"
  - Pushes branch and creates PR via GitHub API

→ Returns to client agent:
  "PR created: https://github.com/org/infra-repo/pull/42
   Branch: remediate/api-server-image-fix
   Changes: apps/production/deployment.yaml — image tag v2.broken → v2.1.0

   Once merged, Argo CD will sync the fix automatically."
```

### Journey: Non-GitOps Resource (Unchanged)

```
User: remediate("redis pod is OOMKilled")

→ Investigation finds no GitOps management
→ Analysis includes standard kubectl commands
→ User confirms execution
→ kubectl commands run as before (no change)
```

---

## Technical Design

### Internal Agentic-Loop Tool: `git_create_pr`

```typescript
{
  name: 'git_create_pr',
  type: 'agentic',
  description: 'Create a pull request with file changes in a previously cloned repository. Writes files, creates a branch, commits, pushes, and opens a PR via GitHub API.',
  inputSchema: {
    properties: {
      repoPath: {
        type: 'string',
        description: 'Relative path to the cloned repo (as returned by git_clone)'
      },
      files: {
        type: 'array',
        description: 'Files to create or modify — provide complete new file content',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to repo root' },
            content: { type: 'string', description: 'Complete new file content' }
          },
          required: ['path', 'content']
        }
      },
      title: { type: 'string', description: 'PR title' },
      body: { type: 'string', description: 'PR description with context' },
      branchName: { type: 'string', description: 'Branch name for the PR' },
      baseBranch: { type: 'string', description: 'Branch to target (default: main)' }
    },
    required: ['repoPath', 'files', 'title', 'branchName']
  }
}
// Returns: { success: boolean, prUrl?: string, prNumber?: number, branch?: string, error?: string }
```

### Handler Implementation

The `git_create_pr` handler:
1. Resolves `repoPath` to `./tmp/{repoPath}` (same security scoping as fs_list/fs_read from Layer 1)
2. Creates a new branch from `baseBranch` (default: main)
3. Writes modified files to the cloned repo
4. Commits with the provided title as commit message
5. Pushes the branch using existing `pushRepo()` from `src/core/git-utils.ts`
6. Creates a PR via GitHub API using the existing auth token
7. Returns the PR URL and metadata

### GitHub API for PR Creation

Uses the existing git auth token (PAT or GitHub App) from `src/core/git-utils.ts`:

```typescript
// After pushing the branch, create PR via GitHub API
const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
  method: 'POST',
  headers: {
    Authorization: `token ${authToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title,
    body,
    head: branchName,
    base: baseBranch,
  }),
});
```

### Execution Path Routing

In the execution handler, check for `gitSource` actions:

```typescript
// In execution handler
for (const action of analysis.remediation.actions) {
  if (action.gitSource) {
    // GitOps path: create PR with modified file content
    const prResult = await handleGitCreatePr({
      repoPath: action.gitSource.repoPath,
      files: [{ path: action.gitSource.fileToModify, content: action.gitSource.newContent }],
      title: `fix: ${analysis.remediation.summary}`,
      body: formatPrBody(analysis),
      branchName: `remediate/${generateBranchSlug(analysis)}`,
      baseBranch: action.gitSource.branch,
    });
    results.push({ ...prResult, type: 'pr' });
  } else {
    // Non-GitOps path: kubectl (existing behavior)
    const cmdResult = await executeKubectlCommand(action.command);
    results.push({ ...cmdResult, type: 'kubectl' });
  }
}
```

### Output Extension

Extend `RemediateOutput` in `src/tools/remediate.ts`:

```typescript
export interface RemediateOutput {
  // ... existing fields ...
  pullRequest?: {              // NEW: present when PR was created
    url: string;
    number: number;
    branch: string;
    baseBranch: string;
    filesChanged: string[];
  };
}
```

---

## Success Criteria

1. **Automatic path selection**: GitOps-managed resources get PRs, non-GitOps get kubectl — no user choice needed
2. **PR creation works**: Successfully creates PRs on GitHub with the correct file changes
3. **Reuses cloned repo**: No redundant clone — uses the repo from Layer 1 investigation
4. **Correct branch/commit**: Descriptive branch name and commit message based on the remediation
5. **PR body has context**: Includes root cause, confidence, and what was changed
6. **Non-GitOps unchanged**: kubectl execution works exactly as before
7. **Auth reuse**: Uses existing git auth (PAT/GitHub App) from git-utils

---

## Out of Scope

1. **GitLab/Bitbucket support**: GitHub-only initially; other providers in future PRDs
2. **PR review/merge automation**: Just creates the PR — review and merge are manual
3. **Other tool integration**: Wiring into operate/recommend — future per-tool PRDs
4. **Conflict resolution**: If PR has conflicts, user resolves manually
5. **Draft PRs**: All PRs are regular (non-draft) initially

---

## Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| #407 (GitOps Discovery) | PRD | Pending | Provides investigation with gitSource data and cloned repo |
| `git-utils.ts` (pushRepo, getAuthToken) | Internal | Exists | `src/core/git-utils.ts` |
| GitHub API | External | Available | For PR creation |
| Remediate execution flow | Internal | Exists | `src/tools/remediate.ts` |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Git auth token lacks PR creation permissions | High | Validate token scopes; clear error with fallback to showing manual Git instructions |
| PR conflicts with existing changes | Medium | Clear error message; user resolves manually |
| Wrong file content generated by AI | High | Layer 1 investigation reads and validates file; manifest files are typically small and structured |
| GitHub API rate limits | Low | Single PR per remediation; unlikely to hit limits |
| Cloned repo expired (TTL cleanup between calls) | Medium | Check repo exists before PR creation; re-clone if needed |

---

## Milestones

### Milestone 1: `git_create_pr` Internal Tool
- [x] Implement `git_create_pr` tool definition and handler
- [x] Write files to cloned repo
- [x] Branch creation and push (using existing `pushRepo()`)
- [x] PR creation via GitHub API
- [x] Path security: validate repo path within `./tmp/`
- [x] Unit tests for PR creation flow

### Milestone 2: Remediate Execution Path
- [x] Route execution to PR creation when `gitSource` actions are present
- [x] Add `pullRequest` field to `RemediateOutput`
- [ ] Handle re-clone if repo was cleaned up between investigation and execution
- [x] Format PR body with root cause, confidence, and change description
- [x] Unit tests for routing logic

### Milestone 3: Integration Tests
- [ ] Test: full flow — investigate GitOps resource → confirm execution → PR created
- [ ] Test: non-GitOps resource — existing kubectl execution unchanged
- [ ] Test: git auth not configured — graceful error with manual instructions fallback
- [ ] Test: mixed actions (some GitOps, some not) — each routed correctly

### Milestone 4: Documentation
- [ ] Document GitOps PR creation in remediate tool docs
- [ ] Document `git_create_pr` internal tool for reuse by future PRDs
- [ ] Document required GitHub token permissions for PR creation

### Milestone 5: Create Follow-Up PRDs for Other Tools
After both Layer 1 and Layer 2 are shipped and validated on remediate, create PRDs to wire the same patterns (both layers, where applicable) into other tools:
- [ ] **Operate PRD**: Layer 1 (GitOps discovery during analysis) + Layer 2 (PR creation instead of kubectl apply)
- [ ] **Query PRD**: Layer 1 (surface GitOps metadata — which app manages a resource, source repo, sync status)
- [ ] **Recommend PRD**: Layer 1 (auto-detect repo/path from existing GitOps apps) + Layer 2 (enhance existing pushToGit with Helm GitOps CR generation from #403)

---

## Cross References

- **Supersedes (operations portions)**: [#363](https://github.com/vfarcic/dot-ai/issues/363) — Argo CD Support for Operate Tool, [#403](https://github.com/vfarcic/dot-ai/issues/403) — Helm GitOps Support
- **Depends on**: [#407](https://github.com/vfarcic/dot-ai/issues/407) — GitOps Discovery (Layer 1)
- **Builds on**: [#362](https://github.com/vfarcic/dot-ai/issues/362) — Git Operations (complete), [#395](https://github.com/vfarcic/dot-ai/issues/395) — Git Push Recommend (complete)
- **Future integration PRDs**: Operate and Recommend will reuse `git_create_pr` for their GitOps execution paths

---

## Work Log

### 2026-03-24: Implementation Complete - Awaiting Review
- Implemented `git_create_pr` internal tool in `src/core/internal-tools.ts`
- Added `repoPath` field to `RemediationAction.gitSource` interface
- Added `pullRequest` field to `RemediateOutput` interface
- Route gitSource actions to PR creation in `executeRemediationCommands()`
- Updated `prompts/remediate-system.md` with `repoPath` in schema and GitOps example
- Fixed broken JSON schema and syntax errors from previous commits
- Unit tests passing (29 tests in internal-tools.test.ts)
- **PR #413**: https://github.com/vfarcic/dot-ai/pull/413 (awaiting merge by @vfarcic)
- CodeRabbit review addressed (fixed branch naming, pullRequest in all responses, removed executedCommandCount for PRs)

### 2026-03-16: PRD Creation
- Created PRD as Layer 2 companion to #407 (GitOps Discovery)
- Key design: no new user-facing choice — system automatically routes to PR creation when GitOps detected
- AI constructs modified file content (no fs_write tool needed), passes to git_create_pr
- Internal `git_create_pr` tool, GitHub API for PR creation, reuses cloned repo from Layer 1
- Supersedes operations portions of #363 and #403
