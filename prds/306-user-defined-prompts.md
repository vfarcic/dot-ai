# PRD 306: User-Defined Prompts (Phase 1: Git-Based Prompt Serving)

## Status: Draft
## Priority: Medium
## GitHub Issue: #306
## Related Issues: #164 (Original feature request by @vtmocanu)

---

## Problem Statement

Teams using the dot-ai MCP server are limited to built-in prompts from the `shared-prompts/` directory. They cannot:
- Define organization-specific prompts for their workflows
- Share custom prompts across projects without contributing to the core project
- Customize prompt behavior for their specific needs

This forces teams to either work without custom prompts or fork the project to add their own.

## Solution Overview

Enable users to serve custom prompts from a **Git repository** (any git provider - GitHub, GitLab, Gitea, Forgejo, Bitbucket, etc.).

**This PRD covers Phase 1: Read-only prompt serving from Git.**

Users can:
1. Create a git repository with their custom prompts (using standard git workflows)
2. Configure dot-ai to read prompts from that repository
3. Access their custom prompts alongside built-in prompts via MCP

**Phase 2 (Future PRD):** Create, update, and delete prompts through MCP tools, which would commit and push changes to the git repository. This will be addressed in a separate PRD after Phase 1 is complete and released.

### Why Git?

Based on community feedback (issue #164), version control for prompts is a hard requirement. Users want:
- Full git history for prompt changes
- Ability to use any git provider (not just GitHub)
- "Prompts as code" philosophy with standard git workflows
- Natural collaboration via PRs in their chosen git platform

## User Stories (Phase 1)

1. **As a team lead**, I want to point dot-ai to a git repository containing our team prompts so that everyone can access consistent workflows.

2. **As a developer**, I want to use custom prompts from my team's git repository alongside built-in prompts without any manual syncing.

3. **As an MCP user**, I want my custom prompts to work identically whether MCP runs locally, in Docker, or in Kubernetes.

4. **As a prompt author**, I want to create parameterized prompts (with arguments) so that users can customize prompt behavior at runtime.

5. **As a user of self-hosted git** (Forgejo, Gitea, GitLab), I want to use my own git server for prompts without being locked into GitHub.

## Technical Requirements

### Prompt Format

User prompts must follow the same format as built-in prompts, with added support for MCP `arguments`:

```yaml
---
name: deploy-app
description: Deploy an application to the specified environment
category: deployment
arguments:
  - name: environment
    description: Target environment (dev, staging, prod)
    required: true
  - name: version
    description: Version to deploy
    required: false
---

# Deploy Application Prompt

Deploy the application to {{environment}}...
```

### Git Repository Configuration

The implementation uses generic git operations (clone, pull) to work with any git provider. Always uses the `main` branch.

**Prompt-Specific Configuration:**
```bash
# Repository URL (HTTPS) - works with any git provider
DOT_AI_USER_PROMPTS_REPO=https://github.com/org/team-prompts      # GitHub
DOT_AI_USER_PROMPTS_REPO=https://gitlab.com/org/team-prompts      # GitLab
DOT_AI_USER_PROMPTS_REPO=https://git.example.com/org/team-prompts # Self-hosted (Gitea, Forgejo, etc.)

# Path within the repo where prompts are located (optional, defaults to root)
DOT_AI_USER_PROMPTS_PATH=prompts
```

**Generic Git Authentication (shared across MCP tools):**
```bash
# For private repositories - these credentials are reusable by other MCP tools
DOT_AI_GIT_USERNAME=myuser           # Git username
DOT_AI_GIT_TOKEN=token_xxxx          # Personal access token
```

**Configuration Summary:**
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOT_AI_USER_PROMPTS_REPO` | Yes | - | Git repository URL (HTTPS) |
| `DOT_AI_USER_PROMPTS_PATH` | No | `.` (root) | Directory within repo containing prompts |
| `DOT_AI_GIT_USERNAME` | No* | - | Git username for private repos |
| `DOT_AI_GIT_TOKEN` | No* | - | Personal access token for private repos |

*Required for private repositories

### Phase 1 Operations (Read-Only)

| Operation | Implementation |
|-----------|----------------|
| List | Read all `.md` files from configured path in local clone |
| Get | Read specific prompt file from local clone |

**Sync Behavior:**
- On MCP server startup: If `DOT_AI_USER_PROMPTS_REPO` is set, automatically refresh (clone if not present, pull if already cloned). If not set, feature is disabled and only built-in prompts are served.
- On `prompts/list` or `prompts/get`: Use cached local clone (no network call)
- Manual refresh: MCP tool `refreshUserPrompts` triggers the same clone/pull logic on demand

### Repository Structure

Users organize their prompts repository with `.md` files:

```
team-prompts/
├── deployment/
│   ├── deploy-app.md
│   └── rollback.md
├── troubleshooting/
│   ├── debug-pod.md
│   └── analyze-logs.md
└── workflows/
    └── release-checklist.md
```

All `.md` files with valid frontmatter are discovered recursively.

### Prompt Merging and Collision Handling

When serving prompts via `prompts/list` and `prompts/get`:

1. **Priority order**: Built-in prompts take precedence
2. **Collision behavior**: If user prompt name matches built-in, return error/warning
3. **Merge strategy**: Combine built-in + user prompts in list response

### MCP Arguments Support

Add support for parameterized prompts per MCP specification:

```typescript
interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

interface Prompt {
  name: string;
  description: string;
  arguments?: PromptArgument[];
  content: string;
}
```

When `prompts/get` is called with arguments:
- Parse argument values from request
- Substitute `{{argumentName}}` placeholders in content
- Validate required arguments are provided

## Success Criteria (Phase 1)

1. Users can configure a git repository URL and access custom prompts from it
2. Custom prompts appear in `prompts/list` alongside built-in prompts
3. Custom prompts work identically in local, Docker, and Kubernetes deployments
4. Parameterized prompts with arguments function correctly
5. Name collisions with built-in prompts are detected and reported
6. `refreshUserPrompts` tool allows manual sync without MCP restart
7. Works with any git provider (GitHub, GitLab, Gitea, Forgejo, Bitbucket, etc.)
8. Integration tests cover read operations and edge cases

## Out of Scope (Phase 1)

- **Create/Update/Delete via MCP** - Will be addressed in Phase 2 (separate PRD)
- Multiple user prompt sources (future enhancement)
- SSH key authentication (PAT only for now)
- Prompt sharing/marketplace (future)

## Phase 2 (Future PRD)

After Phase 1 is complete and released, a separate PRD will address:
- Create prompts via MCP tool (commit + push to repo)
- Update prompts via MCP tool (commit + push to repo)
- Delete prompts via MCP tool (commit + push to repo)
- Conflict handling for concurrent edits
- Contribution encouragement messaging

## Dependencies

- Existing MCP prompts infrastructure (`src/tools/prompts.ts`)
- Git CLI or isomorphic-git library for clone/pull operations

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Network failures on startup | Log warning and continue with built-in prompts only; retry on `refreshUserPrompts` |
| Invalid prompt format in repo | Skip invalid files with warning, serve valid prompts |
| Large repositories | Only read from configured path, ignore other files |
| Authentication failures | Clear error message indicating credential issue |

---

## Milestones

- [ ] **Milestone 1**: Implement git clone/pull service (generic, reusable)
- [ ] **Milestone 2**: Implement MCP `arguments` support for existing prompts
- [ ] **Milestone 3**: Integrate user prompts into `prompts/list` and `prompts/get`
- [ ] **Milestone 4**: Add `refreshUserPrompts` MCP tool
- [ ] **Milestone 5**: Add prompt merging and collision detection
- [ ] **Milestone 6**: Integration tests
- [ ] **Milestone 7**: Documentation

---

## Progress Log

| Date | Update |
|------|--------|
| 2024-12-26 | PRD created |
| 2025-12-26 | Updated to Phase 1 (read-only) based on community feedback; chose Git over Qdrant; made git-vendor-agnostic per issue #164 feedback |

---

## Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Git-based storage (not Qdrant) | 2025-12-26 | Community feedback (issue #164): version control is a hard requirement |
| Generic git (not GitHub-specific) | 2025-12-26 | Users have self-hosted git (Forgejo, Gitea, etc.) - must be vendor-agnostic |
| Phase 1 read-only | 2025-12-26 | Ship value faster; users can manage prompts via normal git workflows |
| PAT authentication only | 2024-12-26 | Start simple, add SSH later if needed |
| Error on name collision | 2024-12-26 | Prevent accidental override of built-in prompts |
| Add MCP arguments support | 2024-12-26 | Align with MCP spec, enable parameterized prompts |
| Always use main branch | 2025-12-26 | Simplify configuration; users can merge to main when ready |
| Generic git auth env vars | 2025-12-26 | `DOT_AI_GIT_USERNAME`/`DOT_AI_GIT_TOKEN` can be reused by other MCP tools |
