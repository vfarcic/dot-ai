# PRD: Agentic Documentation Validation & Remediation System

**GitHub Issue**: [#388](https://github.com/vfarcic/dot-ai/issues/388)
**Status**: Draft
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

1. **Spins up a Kubernetes Pod** with git, language runtimes, and AI access
2. **Clones a docs repo**, discovers pages, and validates them (readability, syntax, execution)
3. **Fixes issues automatically** using AI-generated and direct fixes
4. **Creates a PR** with all fixes
5. **Accepts reviewer feedback** via MCP, CLI, or REST to iteratively refine fixes
6. **Manages Pod lifecycle** with explicit finish and inactivity-based TTL cleanup

Sessions are recorded as JSON (same pattern as other dot-ai tools), persisting beyond Pod lifetime to enable the feedback loop.

## User Journey

### Primary Flow

1. **User initiates validation**:
   ```
   User: "Validate and fix docs at https://github.com/org/docs-repo"
   ```

2. **System creates Pod and clones repo**:
   ```
   Creating validation environment...
   Cloned https://github.com/org/docs-repo
   Session ID: docs-val-abc123

   Found 47 documentation pages:

   1. Getting Started (getting-started.md)
   2. Installation (installation.md)
   3. Quick Start (quickstart.md)
   4. Configuration (configuration.md)
   ...

   Which pages would you like to validate?
   - Enter page numbers (e.g., "1,3,5" or "1-10")
   - Enter "all" for all pages
   ```

3. **User selects pages**:
   ```
   User: "1-5, 12"
   ```

4. **System validates, fixes, and creates PR**:
   ```
   Validating 6 pages...

   /quickstart.md:
     Fixed: Line 45 - sentence was 78 words, split into 3 sentences
     Fixed: Lines 67-72 - JavaScript syntax error (missing comma)
     Fixed: Line 112 - passive voice replaced with direct instruction

   /configuration.md:
     Fixed: Lines 23-30 - Python code block had IndentationError
     No readability issues found

   ...

   Created branch: docs-validation-abc123
   Created PR: https://github.com/org/docs-repo/pull/42

   Summary: 6 pages validated, 8 issues found and fixed
   ```

5. **Reviewer reviews PR and sends feedback**:
   ```
   Reviewer: "The fix on line 45 of quickstart.md is wrong —
              the original wording was correct because the command
              really does need sudo. Also, the Python fix on
              configuration.md changed the logic, not just formatting."
   ```

6. **System loads session, applies corrections**:
   ```
   Loading session docs-val-abc123...
   Reverting fix on quickstart.md:45 (restoring original wording)
   Reverting fix on configuration.md:23-30 (restoring original logic,
     fixing only the IndentationError)
   Pushed corrections to PR #42
   ```

7. **User finishes**:
   ```
   User: "Finish docs validation session docs-val-abc123"

   Session finished.
   Pod deleted. Session record retained.
   PR #42 remains open for final review/merge.
   ```

### Alternative Flow: URL-based Docs Site

```
User: "Validate and fix docs at https://docs.example.com"
```

System crawls the site (sitemap.xml first, falls back to link following), discovers pages, then follows the same flow — but writes fixes to a cloned source repo rather than the rendered site.

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP/CLI/REST Interface                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐ │
│  │   Session     │    │  Pod         │    │  Feedback          │ │
│  │   Manager     │    │  Lifecycle   │    │  Handler           │ │
│  │  (JSON store) │    │  Manager     │    │  (load session,    │ │
│  │              │    │  (create,    │    │   apply changes)   │ │
│  │              │    │   TTL, kill) │    │                    │ │
│  └──────┬───────┘    └──────┬───────┘    └────────┬───────────┘ │
│         │                   │                      │             │
│         └───────────┬───────┘──────────────────────┘             │
│                     │                                            │
│                     ▼                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 Validation Pod                            │   │
│  │                                                           │   │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌─────────┐ │   │
│  │  │   Git    │  │ Readability│  │  Syntax  │  │  Code   │ │   │
│  │  │  Clone   │  │  Analyzer │  │ Validator │  │ Executor│ │   │
│  │  │  Branch  │  │   (AI)    │  │(per-lang) │  │(run it) │ │   │
│  │  │  Commit  │  │           │  │           │  │         │ │   │
│  │  │  Push/PR │  │           │  │           │  │         │ │   │
│  │  └──────────┘  └───────────┘  └──────────┘  └─────────┘ │   │
│  │                                                           │   │
│  │  Default: shell + pkg manager + git (installs runtimes)   │   │
│  │  Tools: git, gh CLI, language parsers                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
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
  - `pagesValidated`: list of pages with validation results
  - `issuesFound`: all issues detected with locations and severity
  - `fixesApplied`: fixes made with reasoning for each
  - `feedbackHistory`: reviewer feedback and resulting actions
  - `status`: active | finished
  - `createdAt`, `lastActivityAt`: timestamps for TTL tracking

#### 2. Pod Lifecycle Manager
- **Create**: Spins up a Pod with the validation container image when a session starts or resumes after timeout
- **TTL**: Monitors `lastActivityAt` — deletes Pod after configurable inactivity period (default 24h). Timer resets on every interaction.
- **Finish**: Explicit cleanup triggered by user command. Deletes Pod, session record persists.
- **Recreate**: When feedback arrives for a session whose Pod has been cleaned up, creates a new Pod, clones the repo, checks out the branch, and resumes work.
- Pod spec includes: ServiceAccount with Pod create/delete permissions, Git credentials (Secret mount), AI API key (Secret mount)

#### 3. Documentation Crawler / Discovery
- **Git repo mode**: Clone repo, glob for `.md` / `.mdx` files
- **URL mode**: Fetch sitemap.xml first, fall back to link crawling. Identify source repo from docs site metadata for writing fixes.
- **Output**: Ordered list of pages with paths and titles for user selection

#### 4. Readability Analyzer
- AI-powered analysis for:
  - Sentence complexity and length
  - Passive voice in instructions
  - Ambiguous pronouns ("it", "this" without clear reference)
  - Missing context or assumed knowledge
  - Inconsistent terminology
- Generates specific fix suggestions with before/after text

#### 5. Code Block Validator
- Extracts code blocks with language identifiers
- **Syntax validation** using language runtimes in the Pod:
  - JavaScript/TypeScript: `node --check` / `tsc --noEmit`
  - Python: `python -c "import ast; ast.parse(...)"`
  - Go: `go vet`
  - YAML: yaml parser
  - JSON: `json.tool`
  - Bash: `bash -n`
- **Execution validation**: Actually runs code blocks where safe, checks for runtime errors

#### 6. Fix Applier
- For syntax errors: applies direct fix (add missing comma, fix indentation, etc.)
- For readability issues: generates AI-powered rewrite of the problematic text
- Preserves original meaning — conservative fixes over aggressive rewrites
- Each fix is recorded in the session with reasoning

#### 7. Git / PR Manager
- Creates branch from default branch
- Commits fixes with descriptive messages
- Creates PR with summary of all changes
- Pushes additional commits when feedback is applied
- Uses `gh` CLI or GitHub API for PR creation

#### 8. Feedback Handler
- Receives reviewer feedback via MCP, CLI, or REST
- Loads session context to understand what was done and why
- Applies corrections: reverts bad fixes, modifies fixes, applies new fixes
- Updates session record with feedback and actions taken
- Avoids repeating approaches the reviewer has already rejected

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

Some documentation includes instructions that require a Kubernetes cluster (e.g., deploying apps, running kubectl commands, installing operators). To validate these docs, the system creates a virtual cluster (vcluster) inside the existing cluster.

- **How**: Uses [vcluster](https://www.vcluster.com/) to spin up a lightweight virtual cluster as regular Pods — no privileged access or Docker-in-Docker required.
- **When**: The AI detects Kubernetes-related commands in code blocks (kubectl, helm, etc.) and provisions a vcluster at session start.
- **Lifecycle**: The vcluster is tied to the session — created on demand, torn down at finish/TTL alongside the validation Pod.
- **Isolation**: Docs commands run against the vcluster, not the host cluster. Destructive operations are safe.

This is optional — sessions that don't involve Kubernetes commands skip vcluster creation entirely.

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
- [ ] Spin up a validation Pod (default image or user-specified)
- [ ] Clone git repos and discover documentation pages
- [ ] Crawl URL-based docs sites and discover pages
- [ ] Support page selection (individual, ranges, all)
- [ ] Analyze readability with AI and provide specific fixes
- [ ] Validate syntax for: JavaScript, TypeScript, Python, Go, YAML, JSON, Bash
- [ ] Execute code blocks and detect runtime errors
- [ ] Provision vcluster for docs that require Kubernetes commands
- [ ] Apply fixes automatically (AI-generated and direct)
- [ ] Create PR with all fixes and descriptive summary
- [ ] Accept reviewer feedback and apply corrections
- [ ] Store sessions as JSON following existing dot-ai patterns
- [ ] Clean up Pods on explicit finish
- [ ] Auto-delete Pods after inactivity TTL (default 24h, resets on interaction)
- [ ] Recreate Pods on demand when session resumes after timeout

### Non-Functional Requirements
- [ ] Complete validation of 10 pages in under 3 minutes (after Pod is running)
- [ ] Pod startup time under 60 seconds (with cached image)
- [ ] No false positives on valid syntax
- [ ] Conservative fixes that preserve original meaning
- [ ] Session records persist beyond Pod lifetime

## Milestones

### Milestone 1: Pod Lifecycle Management
- [ ] Minimal default container image (shell, package manager, git, gh CLI)
- [ ] Support for user-specified container images
- [ ] Pod creation with ServiceAccount, secrets, and resource limits
- [ ] TTL-based auto-cleanup with inactivity tracking
- [ ] Explicit finish/cleanup command
- [ ] Pod recreation for resumed sessions

### Milestone 2: Documentation Discovery & Selection
- [ ] Git repo cloning and markdown file discovery
- [ ] URL-based crawling (sitemap + link following)
- [ ] Interactive page selection via MCP/CLI/REST
- [ ] Prerequisite detection and dependency ordering

### Milestone 3: Validation Engine
- [ ] Code block extraction with language identification
- [ ] Syntax validation for all supported languages
- [ ] Code execution validation
- [ ] Provision vcluster when Kubernetes commands are detected in docs
- [ ] AI-powered readability analysis
- [ ] Issue cataloging with locations and severity

### Milestone 4: Fix Application & PR Creation
- [ ] Direct syntax fixes
- [ ] AI-generated readability fixes
- [ ] Git branch creation, commit, and push
- [ ] PR creation with change summary
- [ ] Session recording of all fixes with reasoning

### Milestone 5: Feedback Loop
- [ ] Feedback ingestion via MCP, CLI, and REST
- [ ] Session context loading and understanding
- [ ] Selective fix reversion and correction
- [ ] Feedback history tracking to avoid rejected approaches
- [ ] Additional commits pushed to existing PR

### Milestone 6: Session Management
- [ ] JSON session storage following existing dot-ai patterns
- [ ] Session listing, retrieval, and status queries
- [ ] Session persistence beyond Pod lifetime
- [ ] Session cleanup policies

### Milestone 7: Integration Testing & Documentation
- [ ] Integration tests covering full validation-fix-PR-feedback cycle
- [ ] Tests for Pod lifecycle (create, TTL, recreate)
- [ ] Tests for session persistence and resumption
- [ ] User-facing documentation for the feature

## Open Questions

1. **Source repo discovery from URL**: When validating a URL-based docs site, how do we find the source repo to write fixes to? Require the user to provide it, or detect from site metadata?
2. **Code execution safety**: Which code blocks are safe to execute? Should we have an allow-list of safe patterns or let the user decide?
3. **Concurrent sessions**: Should a user be able to run multiple validation sessions simultaneously?
4. **Fix granularity**: Should the system create one commit per page, one per issue, or one bulk commit?

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

*This PRD replaces #262 (Documentation Validation System - Phase 1). The phased approach from #262 is no longer needed — the Pod-based architecture handles syntax validation, code execution, and remediation in a single implementation.*
