# PRD: Git Push Recommend Integration

**Issue**: [#395](https://github.com/vfarcic/dot-ai/issues/395)
**Status**: Complete
**Priority**: High
**Created**: 2026-03-05
**Depends On**: PRD #362 (Milestone 1 - Complete)

---

## Problem Statement

Users running GitOps workflows (Argo CD, Flux) need manifests pushed to Git repositories rather than applied directly to clusters. Milestone 1 (PRD #362) delivered git utilities (`cloneRepo`, `pullRepo`, `pushRepo`) in the MCP server layer, but these are not yet integrated into the recommend workflow.

Currently, users must:

1. Run recommend tool to generate manifests
2. Manually copy manifest output
3. Clone their GitOps repository manually
4. Paste manifests and commit/push

This breaks the flow for GitOps users and creates friction in their workflow.

---

## Solution Overview

Add a `pushToGit` stage to the recommend workflow that allows users to push generated manifests directly to a Git repository from within the recommend tool.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Recommend Tool                          │   │
│  │  Stages: recommend → chooseSolution →                │   │
│  │          answerQuestion → generateManifests          │   │
│  │          → [NEW: pushToGit] → deployManifests        │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Git Utilities (src/core/git-utils.ts)        │   │
│  │  - cloneRepo() - Clone with auth                     │   │
│  │  - pushRepo() - Add, commit, push with auth          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### User Journey

```
User: "deploy postgresql database"

→ Recommend: solutions presented
→ User: chooses solution
→ answerQuestion: collects configuration
→ generateManifests: creates YAML/Helm values

→ [NEW STAGE]
→ "Would you like to push these manifests to a Git repository?"
   - Yes, push to Git
   - No, skip Git push

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

### Stage: `pushToGit`

Add to recommend tool stage routing in `src/tools/recommend.ts`:

```typescript
if (stage === 'pushToGit') {
  return await handlePushToGitTool(args, dotAI, logger, requestId);
}
```

### Tool Parameters

```typescript
interface PushToGitParams {
  solutionId: string; // Solution to push
  repoUrl: string; // Git repository URL
  path: string; // Path within repo (e.g., "apps/postgresql/")
  branch?: string; // Branch (default: main)
  commitMessage?: string; // Commit message (default: "Add {resource}")
  author?: {
    name: string;
    email: string;
  };
}
```

### Implementation Files

1. **New file**: `src/tools/push-to-git.ts`
   - `handlePushToGitTool()` function
   - Load solution session
   - Get auth config from environment
   - Clone repo using `cloneRepo()`
   - Write manifests to target path
   - Push using `pushRepo()`
   - Return success with Git URL

2. **Modified file**: `src/tools/recommend.ts`
   - Add `pushToGit` stage routing
   - Add `PushToGitParams` to `RecommendToolArgs` interface

3. **Modified file**: `src/tools/recommend.ts` (SolutionData interface)
   - Add `gitPush` field to track Git push state

### Session State

Extend `SolutionData` interface:

```typescript
interface SolutionData {
  // ... existing fields

  gitPush?: {
    repoUrl: string;
    path: string;
    branch: string;
    commitSha?: string;
    pushedAt?: string;
  };
}
```

### Recommend Flow Integration

Modify `generate-manifests.ts` response to prompt for Git push:

```typescript
{
  success: true,
  manifests: [...],
  nextAction: "Ask user if they want to push to Git repository",
  options: [
    "Push to Git repository",
    "Apply directly to cluster (not recommended for GitOps)",
    "Just show me the manifests"
  ]
}
```

---

## Success Criteria

1. **Stage integration**: `pushToGit` stage works in recommend workflow
2. **Manifests pushed**: Generated YAML/Helm values land in Git repo
3. **GitOps compatible**: Works with Argo CD, Flux, or manual sync
4. **Error handling**: Clear messages for auth failures, conflicts, network issues
5. **Optional flow**: Non-GitOps users can skip Git push
6. **Session tracking**: Git push state stored in session for recovery

---

## Out of Scope

1. **PR workflow**: Creating pull requests instead of direct push (future PRD)
2. **Multi-file conflict resolution**: User handles conflicts manually
3. **Existing file detection**: Will overwrite if path exists
4. **Per-user tokens**: Uses server-wide token (per-user comes with PRD #360/#361)
5. **SSH authentication**: Only HTTPS with PAT/GitHub App initially

---

## Dependencies

| Dependency       | Type        | Status       | Notes                         |
| ---------------- | ----------- | ------------ | ----------------------------- |
| PRD #362         | Milestone 1 | ✅ Complete  | Git utilities in server layer |
| simple-git       | External    | ✅ Installed | Git operations wrapper        |
| jsonwebtoken     | External    | ✅ Installed | GitHub App JWT generation     |
| DOT_AI_GIT_TOKEN | Env var     | ✅ Available | PAT token from environment    |

---

## Risks and Mitigations

| Risk                 | Impact   | Mitigation                                | Status       |
| -------------------- | -------- | ----------------------------------------- | ------------ |
| Token not configured | High     | Check env at startup, clear error message | Pending      |
| Push conflicts       | Medium   | Pull before push, clear error if conflict | Pending      |
| Large repos slow     | Low      | Shallow clone option, temp directory      | ✅ Mitigated |
| Wrong branch         | Medium   | Show confirmation before push             | Pending      |
| Path traversal       | Critical | Validate paths in pushRepo()              | ✅ Mitigated |

---

## Milestones

### Milestone 1: Core Implementation

- [x] Create `src/tools/push-to-git.ts` with `handlePushToGitTool`
- [x] Add `pushToGit` stage routing in `recommend.ts`
- [x] Update `SolutionData` interface with `gitPush` field
- [x] Add Zod schema validation for `pushToGit` parameters
- [x] Wire auth config from environment (`getGitAuthConfigFromEnv`)

### Milestone 2: User Experience

- [x] Add confirmation prompt before push (via MCP agent)
- [x] Show preview of files that will be pushed
- [x] Success message with Git URL and commit SHA
- [x] Helpful error messages with remediation steps

### Milestone 3: Testing

- [x] Unit tests for `handlePushToGitTool` function (14 tests)
- [x] Integration tests for recommend → pushToGit flow
- [x] Test with real Git repo (test organization)
- [x] Test error scenarios (auth failures, conflicts, network issues)

### Milestone 4: Documentation

- [x] Update recommend tool documentation with Git push flow
- [x] Add GitOps setup guide (Argo CD, Flux integration)
- [x] Document token configuration in Helm values

---

## Work Log

### 2026-03-05: PRD Creation

- Created GitHub issue #395 for PRD
- Created PRD file following prd-create.md workflow
- Defined architecture and technical design
- Documented 4 major milestones
- Ready for implementation

### 2026-03-10: Milestone 1 & 2 Implementation

- Created `src/tools/push-to-git.ts` with `handlePushToGitTool` function
- Added `pushToGit` stage routing in `recommend.ts`
- Extended `SolutionData` interface with `gitPush` field
- Added Zod schema validation for `pushToGit` parameters
- Wired auth config from environment
- Added success message with Git URL and commit SHA
- Added helpful error messages with remediation steps
- Updated `generate-manifests.ts` with `nextActions` for pushToGit option
- Created unit tests in `tests/unit/tools/push-to-git.test.ts`
- Created GitOps documentation for the recommend workflow
- Build passing, unit tests passing (212 tests)
- Committed: feat(recommend): add pushToGit stage for GitOps workflows (PRD #395 Milestone 1)

### 2026-03-10: Milestone 3 & 4 Implementation

- Fixed unit test syntax errors and session management
- Added `filesPreview` to response with size and line count
- Created comprehensive unit tests (14 tests covering all scenarios)
- Added GitOps section to recommend.md documentation
- Documented DOT_AI_GIT_TOKEN configuration in Helm values.yaml
- All milestones 1-4 completed (integration tests pending)
- Build passing, unit tests passing (14 push-to-git tests)
- Ready for PR creation

### 2026-03-10: PR Review Follow-up

- Added stricter `targetPath` validation for `/`, `~`, `\\`, and `..`
- Switched Git file path generation to `path.posix.join()` for cross-platform consistency
- Added `finally` cleanup for temporary cloned repositories
- Expanded unit coverage for invalid target paths and POSIX path generation
- Added integration coverage for `recommend -> generateManifests -> pushToGit` using a real GitHub repository
- Removed standalone `docs/gitops-push-to-git.md` and consolidated guidance into `docs/ai-engine/tools/recommend.md`
- Updated Helm values examples to recommend `secretKeyRef` for PAT usage

---

## Cross References

- **PRD #362**: Git Operations - Milestone 1 (git utilities in server layer)
- **Issue #389**: GitOps workflow discussion
- **PR #393**: Milestone 1 implementation (ready for merge)
- **Issue #395**: This PRD's tracking issue
