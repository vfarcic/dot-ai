# PRD: GitOps Discovery for Remediate Tool

**Issue**: [#407](https://github.com/vfarcic/dot-ai/issues/407)
**Status**: In Progress
**Priority**: High
**Created**: 2026-03-16

---

## Problem Statement

dot-ai tools have no visibility into GitOps management. When remediate analyzes a failing Deployment, it:

1. **Doesn't know it's GitOps-managed**: No awareness of Argo CD Applications or Flux Kustomizations/HelmReleases managing the resource
2. **Suggests kubectl commands that get reverted**: Remediation actions like `kubectl patch` are overwritten by the GitOps controller on next sync
3. **Can't point to the source**: Users don't see which repo, path, or file contains the manifest that needs changing
4. **Forces manual investigation**: Users must separately query Argo CD/Flux, clone repos, and find the right files

---

## Solution Overview

Enrich the remediate tool's analysis phase with GitOps awareness by adding **prompt instructions** and **internal agentic-loop tools** (git and filesystem) to the existing AI investigation loop. No new plugin tools or MCP tools are needed — the AI uses existing `kubectl_*` plugin tools for GitOps detection and new internal tools for repo exploration.

### Tool Layers Clarification

The system has three distinct tool layers:

1. **MCP tools** — exposed to client agents (Claude Code, Cursor, etc.). Examples: `remediate`, `query`, `operate`. Client agents call these.
2. **Plugin tools** — run in the plugin container, available to the AI inside agentic loops. Examples: `kubectl_get`, `helm_list`. The AI inside our server calls these during investigation.
3. **Internal agentic-loop tools** (NEW) — run locally in the MCP server, available to the AI inside agentic loops alongside plugin tools. NOT exposed to client agents. Examples: `git_clone`, `fs_list`, `fs_read`. The AI inside our server calls these during investigation.

This PRD adds tools in layer 3 only. Client agents still just call `remediate(issue: "...")` and get back enriched analysis.

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
│  │  AI Investigation Loop (aiProvider.toolLoop)             │    │
│  │                                                          │    │
│  │  Tools available to the AI:                              │    │
│  │                                                          │    │
│  │  Plugin tools (routed to plugin container):              │    │
│  │  - kubectl_get, kubectl_describe, kubectl_logs, ...      │    │
│  │  - helm_list, helm_status, ...                           │    │
│  │                                                          │    │
│  │  Internal tools (handled locally in MCP server):  [NEW]  │    │
│  │  - git_clone    → calls src/core/git-utils.ts            │    │
│  │  - fs_list      → lists files, scoped to ./tmp/          │    │
│  │  - fs_read      → reads files, scoped to ./tmp/          │    │
│  │                                                          │    │
│  │  Combined executor routes each tool to the right place   │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │                                                        │
│         ▼                                                        │
│  Returns enriched analysis to client agent                       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **No new plugin tools**: AI uses existing `kubectl_get` to query Application/Kustomization CRs — they're just Kubernetes resources
2. **No new MCP tools**: Client agents are not exposed to git/fs operations; they just call `remediate`
3. **Internal agentic-loop tools**: `git_clone`, `fs_list`, `fs_read` run locally in MCP server, available only to the AI during investigation
4. **Combined executor**: Routes `kubectl_*`/`helm_*` to plugin container, `git_*`/`fs_*` to local handlers
5. **Path scoping**: AI only sees relative paths (e.g., `{sessionId}/infra-repo/apps/`). Handlers prepend `./tmp/` — AI cannot escape the tmp directory
6. **TTL cleanup**: On each new session start, scan `./tmp/` and delete session dirs older than TTL. No background process needed
7. **Reusable by design**: The internal tools and combined executor pattern can be reused when wiring GitOps awareness into operate, query, and recommend in future PRDs

---

## User Journey

### Journey: Remediate a GitOps-Managed Resource

```
User (via client agent): remediate("pods in namespace production are crashlooping")

→ AI investigates: kubectl_get pods, kubectl_describe, kubectl_logs
→ Identifies: Deployment "api-server" has wrong image tag

→ AI checks GitOps management (prompted to do so):
  kubectl_get("applications.argoproj.io", namespace: all)
→ Finds Application "api-server" managing this namespace
→ Extracts: repoURL, path, branch from Application spec

→ AI clones the source repo:
  git_clone("https://github.com/org/infra-repo.git")
→ Returns relative path: "{sessionId}/infra-repo/"

→ AI explores the repo:
  fs_list("{sessionId}/infra-repo/apps/production/")
→ Returns: ["deployment.yaml", "service.yaml", "configmap.yaml"]

→ AI reads the manifest:
  fs_read("{sessionId}/infra-repo/apps/production/deployment.yaml")
→ Sees the image tag that needs changing

→ Remediate returns to client agent:
  "Root cause: Deployment api-server has invalid image tag 'v2.broken'.

   This resource is managed by Argo CD Application 'api-server'.
   Source: https://github.com/org/infra-repo.git

   Remediation:
   - In apps/production/deployment.yaml, change image tag from
     'v2.broken' to 'v2.1.0' (latest stable)
   - Push changes to Git — Argo CD will sync automatically

   Note: Direct kubectl changes will be reverted by Argo CD."
```

### Journey: Remediate a Non-GitOps Resource

```
User: remediate("redis pod is OOMKilled")

→ AI investigates as normal
→ AI checks GitOps management (prompted to do so):
  kubectl_get("applications.argoproj.io", namespace: all)
→ Error: CRD not found (no Argo CD installed)
  kubectl_get("kustomizations.kustomize.toolkit.fluxcd.io", namespace: all)
→ Error: CRD not found (no Flux installed)

→ Standard remediation — no change from current behavior:
  "Remediation:
   kubectl patch deployment redis -n cache --type=json -p='[...]'"
```

---

## Technical Design

### Internal Agentic-Loop Tool Definitions

Three new tool definitions available only to the AI inside `aiProvider.toolLoop()`. These are NOT MCP tools and NOT plugin tools.

**`git_clone`**:
```typescript
{
  name: 'git_clone',
  type: 'agentic',
  description: 'Clone a Git repository for inspection. Returns a relative path to the cloned repo that can be used with fs_list and fs_read.',
  inputSchema: {
    properties: {
      repoUrl: { type: 'string', description: 'Repository URL (HTTPS)' }
    },
    required: ['repoUrl']
  }
}
// Handler: calls cloneRepo() from src/core/git-utils.ts
// Clones to ./tmp/{sessionId}/{repo-name}/
// Returns relative path: "{sessionId}/{repo-name}/"
```

**`fs_list`**:
```typescript
{
  name: 'fs_list',
  type: 'agentic',
  description: 'List files and directories at a path within a cloned repository.',
  inputSchema: {
    properties: {
      path: { type: 'string', description: 'Relative path to list (as returned by git_clone)' }
    },
    required: ['path']
  }
}
// Handler: prepends ./tmp/ to path, validates it stays within ./tmp/
// Returns array of file/directory names
```

**`fs_read`**:
```typescript
{
  name: 'fs_read',
  type: 'agentic',
  description: 'Read file contents at a path within a cloned repository.',
  inputSchema: {
    properties: {
      path: { type: 'string', description: 'Relative path to file (as returned by git_clone or fs_list)' }
    },
    required: ['path']
  }
}
// Handler: prepends ./tmp/ to path, validates it stays within ./tmp/
// Returns file contents as string
```

### Combined Tool Executor

Wraps the existing plugin executor to also handle internal tools:

```typescript
// In remediate tool setup
const pluginExecutor = pluginManager.createToolExecutor();
const localHandlers = {
  git_clone: (args) => handleGitClone(args, sessionId),
  fs_list: (args) => handleFsList(args),
  fs_read: (args) => handleFsRead(args),
};

const combinedExecutor = async (toolName: string, args: Record<string, unknown>) => {
  if (localHandlers[toolName]) {
    return localHandlers[toolName](args);
  }
  return pluginExecutor(toolName, args);
};

// Pass combined tools and executor to toolLoop
const allTools = [...pluginTools, ...internalToolDefinitions];
await aiProvider.toolLoop({
  tools: allTools,
  toolExecutor: combinedExecutor,
  // ...
});
```

### Path Security

All `fs_list` and `fs_read` handlers:
1. Prepend `./tmp/` to the AI-provided relative path
2. Resolve the full path and verify it starts with the absolute `./tmp/` prefix
3. Reject any path that escapes (e.g., `../../etc/passwd`)

### TTL Cleanup

On each new remediate session start:
```typescript
// Scan ./tmp/ for session dirs older than TTL (e.g., 1 hour)
const entries = fs.readdirSync('./tmp/');
for (const entry of entries) {
  const stat = fs.statSync(`./tmp/${entry}`);
  if (Date.now() - stat.mtimeMs > TTL_MS) {
    fs.rmSync(`./tmp/${entry}`, { recursive: true });
  }
}
```

### Prompt Extension

Add to `prompts/remediate-system.md`:

- **When to check for GitOps**: After identifying the problematic resource, query for Argo CD Applications and Flux Kustomizations/HelmReleases
- **How to detect**: Use `kubectl_get` on `applications.argoproj.io`, `kustomizations.kustomize.toolkit.fluxcd.io`, `helmreleases.helm.toolkit.fluxcd.io` (if CRD not found, skip — not installed)
- **How to match**: Check `spec.destination.namespace` (Argo CD) or `spec.targetNamespace` (Flux) against the resource's namespace; verify via tracking labels/annotations
- **When GitOps found**: Clone the source repo with `git_clone`, use `fs_list`/`fs_read` to find and inspect the manifest file, then suggest Git-based remediation with specific file/line references
- **When GitOps not found**: Proceed with standard kubectl-based suggestions (current behavior)
- **Output format**: When GitOps-managed, include `gitSource` in remediation actions

### Output Extension

Extend `RemediationAction` in `src/tools/remediate.ts`:
```typescript
export interface RemediationAction {
  description: string;
  command?: string;          // kubectl command (non-GitOps path)
  risk: 'low' | 'medium' | 'high';
  rationale: string;
  gitSource?: {              // NEW: Git-based action (GitOps path)
    repoURL: string;
    branch: string;
    files: Array<{
      path: string;          // Path relative to repo root
      content: string;       // Full corrected file content
      description: string;   // What was changed and why
    }>;
  };
}
```

---

## Success Criteria

1. **Argo CD detection works**: AI correctly identifies resources managed by Argo CD Applications
2. **Flux detection works**: AI correctly identifies resources managed by Flux Kustomizations/HelmReleases
3. **Repo exploration works**: AI clones source repos, lists files, reads manifests to give specific file-level remediation
4. **Git-aware suggestions**: Remediation output includes repo/path/file info instead of kubectl commands when GitOps-managed
5. **Graceful when absent**: Non-GitOps clusters see no errors and no behavior change
6. **Path security**: AI cannot read files outside `./tmp/`
7. **Cleanup works**: Old session dirs are cleaned up on new session start

---

## Out of Scope

1. **PR creation**: Automating changes into PRs — that's Layer 2 (separate PRD)
2. **Other tool integration**: Wiring into operate/query/recommend — future per-tool PRDs
3. **ApplicationSet support**: Complex multi-app Argo CD patterns
4. **Write operations**: AI can only read cloned repos, not modify them (Layer 2 handles that)
5. **SSH git auth**: HTTPS only initially (existing git-utils limitation)

---

## Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| `git-utils.ts` (cloneRepo, getAuthToken) | Internal | Exists | `src/core/git-utils.ts` |
| Plugin tool executor | Internal | Exists | `pluginManager.createToolExecutor()` |
| Remediate toolLoop | Internal | Exists | `src/tools/remediate.ts` |
| Argo CD CRDs | Cluster | Optional | Auto-detected via kubectl |
| Flux CRDs | Cluster | Optional | Auto-detected via kubectl |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large repos slow to clone | Medium | Shallow clone (depth=1); only clone when GitOps detected |
| Path traversal via AI-provided paths | High | Resolve and validate all paths stay within `./tmp/` |
| Git auth not configured | Medium | Clear error message; graceful fallback to kubectl suggestions without repo details |
| Multiple Argo CD apps for same namespace | Medium | Prompt instructs AI to match by resource tracking labels, not just namespace |
| AI doesn't call GitOps detection | Low | Explicit prompt instructions; can be enforced in future iterations |

---

## Milestones

### Milestone 1: Internal Agentic-Loop Tools, Executor, and Remediate Integration
- [x] Implement `git_clone` tool definition and handler (using existing `cloneRepo()`)
- [x] Implement `fs_list` tool definition and handler (scoped to `./tmp/`)
- [x] Implement `fs_read` tool definition and handler (scoped to `./tmp/`)
- [x] Path security: reuse `sanitizeRelativePath()` from `git-utils.ts`, validate all paths resolve within `./tmp/gitops-clones/`
- [x] Repo name sanitization: reuse `sanitizeIntentForLabel()` from `solution-utils.ts`
- [x] Credential scrubbing: reuse `scrubCredentials()` from `git-utils.ts`
- [x] Unique session dirs: `./tmp/gitops-clones/{sessionId}/{repo-name}/`
- [x] Combined executor that routes plugin tools to plugin, internal tools to local handlers (uses existing `fallbackExecutor` pattern in `pluginManager.createToolExecutor()`)
- [x] Wire into remediate's `conductInvestigation()` — add internal tools to the tools array and pass combined executor
- [x] TTL cleanup: on new session start, scan `./tmp/gitops-clones/` and delete dirs older than TTL
- [x] Extend `remediate-system.md` with GitOps detection instructions
- [x] Add `gitSource` field to `RemediationAction` interface
- [ ] AI suggests Git-based remediation when GitOps management detected
- [ ] AI falls back to kubectl suggestions when no GitOps management

### Milestone 2: Integration Tests
Test against a real cluster with Argo CD and Flux installed. Use a GitHub repo with known-broken manifests. Each GitOps controller syncs into a separate namespace.

- [ ] Test infrastructure: install Argo CD and Flux in test cluster, create GitHub repo with broken manifests
- [ ] Test: remediate on Argo CD-managed resource returns Git-aware suggestions with correct repo, directory, file, and change description
- [ ] Test: remediate on Flux-managed resource returns Git-aware suggestions with correct repo, directory, file, and change description
- [ ] Test: remediate on non-GitOps resource behaves as before (no regression, suggests kubectl commands)
- [ ] Test: path traversal attempts are rejected

### Milestone 3: Documentation
- [ ] Document GitOps-aware remediation behavior
- [ ] Document the internal agentic-loop tools (git_clone, fs_list, fs_read) for reuse by future PRDs
- [ ] Update remediate tool documentation with GitOps examples

---

## Cross References

- **Supersedes (discovery portions)**: [#363](https://github.com/vfarcic/dot-ai/issues/363) — Argo CD Support for Operate Tool
- **Builds on**: [#362](https://github.com/vfarcic/dot-ai/issues/362) — Git Operations (complete), [#395](https://github.com/vfarcic/dot-ai/issues/395) — Git Push Recommend (complete)
- **Companion PRD**: GitOps Operations (Layer 2) — creates PRs with remediation changes
- **Future integration PRDs**: Operate, Query, Recommend will reuse the internal tools and combined executor pattern

---

## Work Log

### 2026-03-16: PRD Creation
- Created PRD based on discussion about reorganizing GitOps support into horizontal capability layers
- Layer 1 (this PRD): GitOps Discovery — enrich remediate analysis with GitOps awareness
- Key design: no new plugin or MCP tools; internal agentic-loop tools (git_clone, fs_list, fs_read) added to toolLoop with combined executor
- Path security via `./tmp/` scoping; TTL cleanup on session start
- Supersedes discovery portions of #363; companion to Layer 2 PRD

### 2026-03-16: Milestone Consolidation and Testing Strategy
- Consolidated Milestones 1-4 into a single Milestone 1: tools, executor, wiring, prompt, and interface are one cohesive unit
- Dropped unit tests in favor of integration tests: handlers are thin wrappers around existing tested functions (`cloneRepo`, `sanitizeRelativePath`, `sanitizeIntentForLabel`, `scrubCredentials`), so mocking them adds little value
- Integration test strategy: install Argo CD + Flux in test cluster, create known-broken manifests in a GitHub repo, sync via both controllers into separate namespaces, run remediate, validate output includes correct repo/dir/file/change
- Tool descriptions simplified to be generic (not GitOps-specific) since tools will be reused by future PRDs
- Reuse decisions: `sanitizeRelativePath` extracted to `git-utils.ts` as shared utility (was private in `push-to-git.ts`), `sanitizeIntentForLabel` from `solution-utils.ts` for repo name sanitization, `scrubCredentials` from `git-utils.ts` for error messages
