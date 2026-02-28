# PRD: Agentic Documentation Validation & Remediation System

**GitHub Issue**: [#388](https://github.com/vfarcic/dot-ai/issues/388)
**Status**: In Progress
**Priority**: High
**Created**: 2026-02-27
**Replaces**: [#262](https://github.com/vfarcic/dot-ai/issues/262) (Documentation Validation System - Phase 1)

## Problem Statement

Documentation drifts from code reality over time. Users follow outdated instructions, code examples don't work, and there's no automated way to detect and fix these issues before users encounter them. This leads to:

- Frustrated users who can't complete tutorials
- Support burden from documentation-related questions
- Loss of trust in project quality
- Maintainer time spent on manual doc reviews and fixes

The previous approach (PRD #262) proposed a report-only validation system that would tell you what's wrong but leave fixing to humans. That's half a solution — the real value is in automated remediation with human oversight.

## Solution Overview

An agentic docs maintenance system that:

1. **User specifies a repo and a page path** — single call, no multi-step workflow
2. **System orchestrates everything** — spins up Pod, clones repo, runs AI validation, cleans up Pod
3. **AI autonomously validates and fixes** — reads the doc, runs commands, installs runtimes, checks links, creates clusters if needed, edits files
4. **Returns validation results** — issues found, fixes applied, session ID for future reference
5. **Future extensions** (separate tasks): reviewer feedback, PR creation, multi-page batch validation

The key insight: instead of building separate code block extractors, per-language syntax validators, and readability analyzers, the AI handles all of these in a single agentic loop with two tools:
- **`exec`** — run any command in the Pod (bash, install runtimes, read/write files, curl, kubectl)
- **`create_cluster`** — provision a vcluster when the AI encounters Kubernetes commands

The Pod is the execution environment. The AI decides what to run, interprets results, and fixes issues. The server handles orchestration (Pod lifecycle, repo cloning) and git/PR plumbing.

Sessions are recorded as JSON (same pattern as other dot-ai tools), persisting beyond Pod lifetime to enable future feedback loops and PR creation.

## User Journey

### Primary Flow (Single Page)

1. **User initiates validation** — one call with repo + page path:
   ```
   User: "Validate and fix docs/getting-started.md in https://github.com/org/docs-repo"
   ```

2. **System orchestrates everything and returns results**:
   ```
   Creating validation environment...
   Cloned https://github.com/org/docs-repo
   Validating docs/getting-started.md...

   docs/getting-started.md:
     Fixed: Line 45 - sentence was 78 words, split into 3 sentences
     Fixed: Lines 67-72 - JavaScript syntax error (missing comma)
     Fixed: Line 112 - passive voice replaced with direct instruction

   Session ID: dvl-1709251234567-a1b2c3d4
   Summary: 1 page validated, 3 issues found and fixed
   Pod cleaned up. Session record retained.
   ```

The user provides the page path directly — no discovery or selection step. The system handles pod creation, repo cloning, AI validation, and pod cleanup as a single workflow.

### Future Extensions (Separate Tasks)

These are planned as separate tasks to be added incrementally once single-page validation works well:

- **Multi-page validation**: Discover pages, select by number/range/all, validate in batch
- **Reviewer feedback**: Load session, apply corrections based on feedback
- **PR creation**: Server creates branch, commits fixes, creates PR
- **URL-based docs sites**: Crawl site, identify source repo, validate pages

## Technical Design

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    MCP/CLI/REST Interface                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │   Session     │  │  Pod         │  │  Git / PR               │ │
│  │   Manager     │  │  Lifecycle   │  │  Manager                │ │
│  │  (JSON store) │  │  Manager     │  │  (branch, commit, PR)   │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────────────┘ │
│         │                  │                    │                  │
│         └──────────┬───────┘────────────────────┘                 │
│                    │                                               │
│                    ▼                                               │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    AI Validation Agent                        │  │
│  │                                                               │  │
│  │  System prompt + doc content + tools                          │  │
│  │                                                               │  │
│  │  Tools:                                                       │  │
│  │  ┌─────────────────────┐  ┌──────────────────────────┐       │  │
│  │  │  exec               │  │  create_cluster           │       │  │
│  │  │  (bash in Pod:      │  │  (provision vcluster,     │       │  │
│  │  │   run commands,     │  │   return connection info)  │       │  │
│  │  │   read/write files, │  │                            │       │  │
│  │  │   install runtimes, │  └──────────────────────────┘       │  │
│  │  │   curl, kubectl)    │                                      │  │
│  │  └─────────────────────┘                                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                    │                                               │
│                    ▼                                               │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                 Validation Pod                                │  │
│  │  debian:13-slim + bash + git + gh CLI + curl                  │  │
│  │  (AI installs additional runtimes as needed via exec)         │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Session Manager
- Creates and loads sessions stored as JSON (same pattern as other dot-ai tools)
- Session record contains:
  - `sessionId`: unique identifier
  - `repo`: source repository URL
  - `branch`: working branch name
  - `prUrl`: created PR URL
  - `podName`: current Pod name (null if Pod is terminated)
  - `pagesValidated`: list of pages with validation results per page
  - `status`: active | finished
  - `createdAt`, `lastActivityAt`: timestamps for TTL tracking

#### 2. Pod Lifecycle Manager
- **Create**: Spins up a Pod with the validation container image when a session starts or resumes after timeout
- **TTL**: Monitors `lastActivityAt` — deletes Pod after configurable inactivity period (default 24h). Timer resets on every interaction.
- **Finish**: Explicit cleanup triggered by user command. Deletes Pod, session record persists.
- **Recreate**: When feedback arrives for a session whose Pod has been cleaned up, creates a new Pod, clones the repo, checks out the branch, and resumes work.
- Pod spec includes: ServiceAccount with Pod create/delete permissions, Git credentials (Secret mount), AI API key (Secret mount)

#### 3. Documentation Discovery *(deferred — user provides page path directly)*
- **Current**: User specifies the exact page path (e.g., `docs/getting-started.md`). No discovery step.
- **Future**: Git repo mode (clone + glob for `.md`/`.mdx`), URL mode (sitemap.xml + link crawling), page selection by number/range/all.

#### 4. AI Validation Agent
The core of the system. For a single page, the server:
1. Sends the page file path to an AI agent with a system prompt and tools
2. The AI reads the doc via `exec`, autonomously decides what to validate
3. The AI runs commands (syntax checks, code execution, link validation, etc.) via `exec`
4. If Kubernetes commands are found, the AI calls `create_cluster` to get a vcluster
5. The AI edits the doc to fix issues, re-validates to confirm fixes work
6. The AI returns a summary of issues found and fixes applied

**AI tools:**
- **`exec`** — Run any bash command. Covers: reading files, installing runtimes, running code, curl for URL checks, kubectl/helm for cluster commands. The working directory is the repository root.
- **`patch_file`** — Targeted find-and-replace in a file. Takes `path`, `old_content`, `new_content`. Handles escaping internally via base64. The AI uses this to fix issues in the target document.
- **`create_cluster`** — Provision a vcluster inside the host cluster. Returns kubeconfig path. The AI calls this when it encounters Kubernetes commands in the doc. Cluster lifecycle is tied to the session.


#### 5. Git / PR Manager
- After AI completes all page validations, deterministic code handles git operations
- Creates branch from default branch
- Commits fixes with descriptive messages (using AI summary)
- Creates PR with summary of all changes
- Pushes additional commits when feedback is applied
- Uses `gh` CLI in the Pod for PR creation

#### 6. Feedback Handler
- Receives reviewer feedback via MCP, CLI, or REST
- Loads session context to understand what was done and why
- Sends feedback to AI agent which applies corrections in the Pod
- Updates session record with feedback and actions taken

### Container Image

**Default image**: A minimal dot-ai-maintained image containing only:
- Shell (bash)
- Package manager (apt/apk)
- Git + GitHub CLI

The AI analyzes which languages appear in the docs' code blocks and installs the needed runtimes at session start (e.g., `apt install nodejs python3 golang`). This trades some startup time for a small, maintainable image that works with any language.

**User-specified image**: Users can provide their own pre-baked image with runtimes already installed to skip the installation step. The only requirement is that the image includes `git`. This is useful for repos with many code blocks or uncommon runtimes where installation time would be significant.

Image selection is specified when initiating a session:
```
User: "Validate docs at repo X using image my-registry/docs-validator:latest"
```

If no image is specified, the default image is used.

### Virtual Cluster for Kubernetes-Dependent Docs

Some documentation includes instructions that require a Kubernetes cluster (e.g., deploying apps, running kubectl commands, installing operators). To validate these docs, the AI agent provisions a virtual cluster on demand.

- **How**: Uses [vcluster](https://www.vcluster.com/) to spin up a lightweight virtual cluster as regular Pods — no privileged access or Docker-in-Docker required.
- **When**: The AI reads the doc, encounters kubectl/helm commands, and calls the `create_cluster` tool. The AI decides when it needs a cluster — no server-side detection logic.
- **What it returns**: The `create_cluster` tool provisions the vcluster and returns connection info (kubeconfig path). The AI then uses `exec` to run kubectl/helm against it.
- **Lifecycle**: The vcluster is tied to the session — torn down at finish/TTL alongside the validation Pod.
- **Isolation**: Docs commands run against the vcluster, not the host cluster. Destructive operations are safe.

This is optional — sessions that don't involve Kubernetes commands never trigger `create_cluster`.

### RBAC Requirements

The dot-ai ServiceAccount needs additional permissions:
- `pods: create, get, delete` — to manage validation Pods
- `secrets: get` — to mount Git credentials and AI API keys into the Pod
- vcluster CRDs (if vcluster operator is installed) or permissions to deploy vcluster Helm chart

### Prerequisite Handling

When a page references prerequisites:

1. **Detection**: Parse for patterns like:
   - "Before you begin, complete [X](/path)"
   - "Prerequisites: [Setup Guide](/setup)"
   - "This guide assumes you've completed [Installation](/install)"

2. **User Prompt**: Ask whether to validate prerequisite first, skip it, or skip the page entirely.

3. **Dependency Tracking**: Avoid circular dependencies, track validated pages in session.

## Success Criteria

### Functional Requirements
- [x] Spin up a validation Pod (default image or user-specified)
- [x] Clone git repos and discover documentation pages
- [x] Single-page validation via one user-facing `validate` action (repo + page path)
- [x] Full workflow orchestration in single call (pod → clone → AI → cleanup)
- [x] AI agent validates and fixes text quality issues (readability, missing content, clarity)
- [x] AI agent validates and fixes code blocks (installs runtimes, runs code, fixes syntax/runtime errors)
- [x] AI agent validates links and cross-references (curl for URLs, file checks for internal refs)
- [ ] AI agent validates shell commands from docs (runs them, fixes broken ones)
- [ ] AI agent provisions vcluster via `create_cluster` tool for Kubernetes-dependent docs
- [ ] AI agent follows cross-doc prerequisites and validates dependency chains
- [ ] Create PR with all fixes and descriptive summary (server-side, deterministic)
- [ ] Accept reviewer feedback and apply corrections
- [x] Store sessions as JSON following existing dot-ai patterns
- [x] Clean up Pods on explicit finish
- [x] Auto-delete Pods after inactivity TTL (default 24h, resets on interaction)
- [ ] Recreate Pods on demand when session resumes after timeout
- [ ] Multi-page selection and batch validation *(deferred — separate task)*
- [ ] Page discovery from repo *(deferred — user provides path directly)*
- [ ] Crawl URL-based docs sites and discover pages *(deferred)*

### Non-Functional Requirements
- [ ] Pod startup time under 60 seconds (with cached image)
- [ ] Conservative fixes that preserve original meaning
- [x] Session records persist beyond Pod lifetime

## Milestones

### Milestone 1: Pod Lifecycle & Discovery (done)
- [x] Minimal default container image — `debian:13-slim` with bash, git, gh CLI, curl, python3 (`ghcr.io/vfarcic/dot-ai-docs-validator`)
- [x] Support for user-specified container images
- [x] Pod creation with resource limits
- [x] TTL-based auto-cleanup with inactivity tracking
- [x] Explicit finish/cleanup command
- [x] Git repo cloning and markdown file discovery
- [x] Command execution inside validation pods (`docs_validate_exec` plugin tool)
- [x] Page listing with titles extracted from first heading
- [x] JSON session storage, listing, retrieval, persistence beyond Pod lifetime
- [ ] Pod creation with ServiceAccount and secrets *(deferred — public repos work without credentials)*
- [ ] Pod recreation for resumed sessions

### Milestone 2a: Validate Action Plumbing (done)
Wire up the `validate` action with full workflow orchestration — everything except the AI agent loop.
- [x] `validate` action on `validateDocs` tool (accepts `repo` + `page` + optional `image`)
- [x] Orchestrates full workflow internally: create pod → clone repo → verify page exists → cleanup pod
- [x] Returns structured response with session ID, page path, and workflow status
- [x] Session persists after pod cleanup for future extensions
- [x] Integration test: end-to-end validate call completes full lifecycle (pod created, repo cloned, page verified, pod cleaned up)

### Milestone 2b: AI Agent Loop for Text Quality Validation (done)
Add the AI validation agent into the plumbing from Milestone 2a.
- [x] AI agent agentic loop with system prompt and `exec` tool (follows `remediate.ts` pattern)
- [x] System prompt: `prompts/validate-docs-system.md`
- [x] AI reads doc via `exec`, identifies readability/correctness issues, edits file to fix
- [x] Validation results (issues found, fixes applied) stored in session per page
- [x] Integration test: end-to-end validate call returns AI-generated validation results

### Milestone 3: UC2 — Code Syntax Validation via Execution (done)
AI runs code blocks to check syntax and execution, installs runtimes as needed.
- [ ] AI installs language runtimes via `exec` (e.g., `apt install nodejs`)
- [x] AI extracts code blocks, writes to temp files, runs them, interprets errors
- [x] AI fixes broken code in the doc, re-runs to confirm fix works
- [x] Integration test: fixture doc with broken Python/JSON/YAML/Bash blocks — all fixed

### Milestone 4: UC3 — Link and Cross-Reference Validation
AI checks URLs and internal cross-references.
- [ ] AI uses `curl` via `exec` to check external URLs (HTTP status)
- [ ] AI checks internal cross-references point to existing files
- [ ] AI fixes or flags broken links
- [ ] Integration test: detect stale cross-reference in `integration-testing-guide.md`

### Milestone 5: UC4 — Shell Command Validation
AI runs shell commands from docs, distinguishes doc bugs from environment issues.
- [ ] AI runs shell commands from docs via `exec`
- [ ] AI distinguishes doc errors (wrong flags) from expected env issues (no Docker daemon)
- [ ] Integration test: fixture doc with broken shell commands — AI fixes doc errors

### Milestone 6: UC5 — Kubernetes Command Validation with vcluster
AI provisions a cluster and runs kubectl/helm commands.
- [ ] `create_cluster` tool — provisions vcluster, returns kubeconfig path
- [ ] AI calls `create_cluster` when it encounters kubectl/helm commands
- [ ] AI runs Kubernetes commands against the vcluster via `exec`
- [ ] Cluster lifecycle tied to session (torn down at finish/TTL)
- [ ] Integration test: fixture doc with kubectl commands — AI creates cluster, validates commands

### Milestone 7: UC6 — Cross-Doc Prerequisite Validation
AI follows prerequisite links and validates dependency chains.
- [ ] AI detects prerequisite references in docs
- [ ] AI reads and validates linked docs before the target doc
- [ ] Integration test: fixture doc with prerequisite chain — AI validates in correct order

### Milestone 8: UC7 — Full Flow with PR Creation
End-to-end: validate, fix, create PR.
- [ ] After AI completes, server creates git branch, commits changes, pushes, creates PR
- [ ] PR includes summary of all issues found and fixes applied
- [ ] PR URL stored in session record
- [ ] Integration test: full user journey — start → discover → validate → PR created

## Design Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-27 | **AI-first validation** — No hand-built code block extractors, syntax validators, or readability analyzers. The AI is the validation engine. | Building per-language validators is unnecessary complexity. AI can read a doc, understand code blocks in context, run them, and fix issues — all in one agentic loop. |
| 2026-02-27 | **Two tools only: `exec` + `create_cluster`** — AI gets a single `exec` tool (bash in Pod) and `create_cluster` (vcluster provisioning). | `exec` covers everything: read/write files, install runtimes, run code, curl URLs, kubectl. One general-purpose tool is simpler than many specialized ones. `create_cluster` is separate because it provisions infrastructure outside the Pod. |
| 2026-02-27 | **Server handles git/PR, not AI** — After AI finishes validation, deterministic code creates branch, commits, pushes, and creates PR. | Git/PR operations are mechanical and shouldn't depend on AI judgment. Keeps AI focused on validation and fixing. |
| 2026-02-27 | **AI calls `create_cluster`, not server-side detection** — AI decides when it needs a Kubernetes cluster. | The AI reads the doc and understands context. Server-side detection would require parsing docs for kubectl patterns — duplicating what the AI already does. |
| 2026-02-27 | **Progressive use-case-driven milestones** — Each milestone is a testable use case, building on the previous. | Enables incremental delivery and testing. Each use case adds one new capability. Regressions caught by tests from earlier use cases. |
| 2026-02-27 | **Code execution safety delegated to AI in isolated Pod** — No allow-lists for safe code patterns. AI uses judgment, Pod provides isolation. | The Pod is an isolated environment — worst case is the Pod breaks, which is fine. vcluster provides Kubernetes isolation. No risk to host systems. |
| 2026-02-27 | **Single-page validation first** — Start with validating one page per call. Multi-page batch and page discovery deferred to separate tasks. | Avoids context window overflow concerns (reading all pages + all exec output). Proves the core AI validation loop works before adding orchestration complexity. Multi-page can be added incrementally once single-page is solid. |
| 2026-02-27 | **User provides page path directly** — No discovery step. User specifies `repo` + `page` (e.g., `docs/getting-started.md`). | Simplest possible UX for the initial implementation. Discovery (globbing all .md files) raises the question of what counts as "docs" vs READMEs/changelogs/governance files. Explicit path avoids this entirely. Discovery can be added as a separate task later. |
| 2026-02-27 | **Single user-facing action** — `validate` orchestrates the full workflow (pod → clone → AI → cleanup) in one call. `start`/`discover`/`finish` become internal implementation details. | Users shouldn't have to manage pod lifecycle manually. One call in, results out. Sessions still persist internally for future extensions (feedback, PR creation), but the user doesn't manage them explicitly. |
| 2026-02-27 | **Per-page fresh AI context** — Each page gets its own `toolLoop` invocation with fresh context. No cross-page context accumulation. | Prevents context window overflow. Even large pages with many code blocks stay within limits. Cross-page context (e.g., prerequisites) deferred to Milestone 7. |
| 2026-02-27 | **Plumbing before AI** — Split Milestone 2 into 2a (workflow orchestration) and 2b (AI agent loop). Build and test the full lifecycle (pod → clone → verify → cleanup) before wiring in the AI. | Isolates concerns — validates the orchestration works independently before adding non-deterministic AI behavior. Makes debugging easier: if the workflow fails, it's a plumbing issue; if results are wrong, it's an AI/prompt issue. |
| 2026-02-27 | **Single action, no action menu** — Removed `start`/`discover`/`status`/`list`/`finish` actions. Tool exposes only `validate` (default). Tool description is purpose-focused ("validate and fix docs") not action-listing. | AI agents calling the tool don't need implementation details about pod lifecycle. One action, purpose-clear description. Action enum kept with single value for future extensibility. |
| 2026-02-27 | **`patch_file` tool for AI edits** — Added `patch_file` (path, old_content, new_content) alongside `exec`. AI uses `exec` for reading/commands, `patch_file` for targeted file edits. | Shell escaping through kubectl exec layers makes `sed`/`awk` unreliable. `patch_file` uses base64-encoded content + python3, avoiding all quoting issues. |
| 2026-02-27 | **Semver image tagging (`0.x.y`)** — Container image pushed with both `:latest` and version tag (e.g., `:0.1.0`). Code defaults stay on `:latest`. Version sourced from `ARG VERSION` in Dockerfile. | Enables pinning/rollback to specific image versions. `:latest` as default means code automatically picks up new builds. Version bump is a single Dockerfile change. |

## Open Questions

1. **Source repo discovery from URL**: When validating a URL-based docs site, how do we find the source repo to write fixes to? Require the user to provide it, or detect from site metadata? *(deferred — URL mode is a future task)*
2. ~~**Code execution safety**~~: Resolved — AI uses judgment within isolated Pod/vcluster. No allow-lists needed.
3. **Concurrent sessions**: Should a user be able to run multiple validation sessions simultaneously?
4. **Fix granularity**: Should the system create one commit per page, one per issue, or one bulk commit? *(deferred — PR creation is a future task)*
5. ~~**Page discovery scope**~~: Resolved — User provides page path directly. No discovery step for now. Avoids the question of what counts as "docs" vs other markdown files.
6. ~~**Context window limits for multi-page**~~: Resolved — Single page per call with fresh AI context. Multi-page batch deferred to separate task.

## Dependencies

- None (foundational work). Replaces PRD #262.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Pod RBAC too permissive | Medium | High | Scoped ServiceAccount, namespace isolation |
| AI fixes change meaning | Medium | High | Conservative fix strategy, human review via PR |
| Runtime installation slow | Medium | Low | Users provide pre-baked image for faster startup |
| Pod left running (TTL failure) | Low | Medium | Kubernetes CronJob as backup cleanup |
| Reviewer feedback misinterpreted | Medium | Medium | Session history prevents repeat mistakes, ask for clarification |

*This PRD replaces #262 (Documentation Validation System - Phase 1). The AI-first agentic approach replaces the need for hand-built validators — the AI handles text quality, code validation, link checking, and command execution in a single loop with just two tools (`exec` and `create_cluster`).*
