# PRD 306: User-Defined Prompts

## Status: Ready for Implementation
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

Enable users to serve custom prompts from their own git repository. The MCP server will:
1. Clone/pull a user-configured git repository containing prompt files
2. Merge user prompts with built-in prompts in `prompts/list` and `prompts/get`
3. Support parameterized prompts with MCP `arguments`

**Phase 1 (this PRD)**: Read-only access - users manage prompts via standard git workflows (commit, push, PR).
**Phase 2 (future PRD)**: Write operations via MCP (create/update/delete prompts directly).

## User Stories

1. **As a team lead**, I want to define standard prompts in our team's git repository so that everyone follows consistent workflows across projects.

2. **As an MCP user**, I want my custom prompts to appear alongside built-in prompts so that I have a unified prompt experience.

3. **As an MCP user**, I want my custom prompts to work identically whether MCP runs locally, in Docker, or in Kubernetes.

4. **As a prompt author**, I want to create parameterized prompts (with arguments) so that users can customize prompt behavior at runtime.

5. **As a Forgejo/GitLab/Gitea user**, I want to use my self-hosted git server to store prompts, not just GitHub.

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

### Git-Based Storage (Vendor-Agnostic)

**Configuration:**
```bash
# Required: Git repository URL (any git provider)
DOT_AI_USER_PROMPTS_REPO=https://git.example.com/org/team-prompts.git

# Optional: Authentication for private repos
DOT_AI_USER_PROMPTS_TOKEN=token_xxxx  # PAT, deploy token, or app token

# Optional: Branch to use (defaults to main)
DOT_AI_USER_PROMPTS_BRANCH=main

# Optional: Subdirectory within repo (defaults to root)
DOT_AI_USER_PROMPTS_PATH=prompts/
```

**Supported Git Providers:**
- GitHub (github.com)
- GitLab (gitlab.com or self-hosted)
- Gitea / Forgejo (self-hosted)
- Bitbucket (bitbucket.org)
- Any git server supporting HTTPS clone with optional token auth

**Operations (Phase 1 - Read-Only):**
| Operation | Implementation |
|-----------|----------------|
| List | Clone/pull repo, read all `.md` files, return metadata |
| Get | Read specific file from local clone, substitute arguments |

**Implementation Notes:**
- Use generic `git clone` and `git pull` commands, not provider-specific APIs
- Clone to a cache directory (e.g., `/tmp/dot-ai-user-prompts/`)
- Pull on each `prompts/list` call (with reasonable caching)
- Token authentication via URL embedding: `https://token@git.example.com/...`

### Prompt Merging and Collision Handling

When serving prompts via `prompts/list` and `prompts/get`:

1. **Priority order**: Built-in prompts take precedence over user prompts
2. **Collision behavior**: If user prompt name matches built-in, log warning and skip user prompt
3. **Merge strategy**: Combine built-in + user prompts in list response
4. **Source identification**: Include `source: "built-in" | "user"` in prompt metadata

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
  source: 'built-in' | 'user';
}
```

When `prompts/get` is called with arguments:
- Parse argument values from request
- Substitute `{{argumentName}}` placeholders in content
- Validate required arguments are provided
- Return error if required argument is missing

### Caching Strategy

- **Clone once**: On first access, clone repository to cache directory
- **Pull on access**: On subsequent `prompts/list` calls, run `git pull`
- **Cache TTL**: Optional env var `DOT_AI_USER_PROMPTS_CACHE_TTL` (default: 300 seconds)
- **Force refresh**: Support `?refresh=true` query param to force pull

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Repository not configured | Return only built-in prompts (no error) |
| Clone fails (auth, network) | Log error, return only built-in prompts |
| Pull fails | Use cached version, log warning |
| Invalid prompt format | Skip prompt, log warning, continue with others |
| Missing required argument | Return error with list of missing arguments |

## Success Criteria

1. Users can configure a git repository URL to serve custom prompts
2. Custom prompts appear in `prompts/list` alongside built-in prompts
3. Custom prompts work identically in local, Docker, and Kubernetes deployments
4. Parameterized prompts with arguments function correctly
5. Name collisions with built-in prompts are detected and logged
6. Works with any git provider (GitHub, GitLab, Gitea, Forgejo, Bitbucket, etc.)
7. Integration tests cover list, get, argument substitution, and error cases

## Out of Scope (Phase 1)

- **Write operations via MCP** (create/update/delete) - deferred to Phase 2/future PRD
- Multiple user prompt sources (future enhancement)
- SSH key authentication (PAT/token only for now)
- Prompt sharing/marketplace (future)

## Dependencies

- Existing MCP prompts infrastructure (`src/tools/prompts.ts`)
- Git CLI available in runtime environment (Docker images, Kubernetes pods)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Network failures during clone/pull | Cache prompts locally, serve cached version on failure |
| Invalid prompt format in user repo | Validate format, skip invalid prompts, log warnings |
| Large repositories slow to clone | Document recommendation to keep prompt repos small |
| Token exposure in logs | Sanitize URLs in log output, never log tokens |

---

## Milestones

- [x] **Milestone 1**: Storage decision - Git-based, vendor-agnostic (completed via issue discussion)
- [x] **Milestone 2**: Implement MCP `arguments` infrastructure (parsing, substitution, validation, REST endpoints)
- [ ] **Milestone 3**: Implement git-based user prompt loading (clone, pull, cache)
- [ ] **Milestone 4**: Add prompt merging and collision detection
- [ ] **Milestone 5**: Integration tests for all operations
- [ ] **Milestone 6**: Documentation for configuring user prompts

---

## Progress Log

| Date | Update |
|------|--------|
| 2024-12-26 | PRD created, awaiting storage option decision |
| 2024-12-30 | Storage decision made: Git-based, vendor-agnostic, Phase 1 read-only (based on @vtmocanu feedback in #164) |

---

## Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Git-based storage (not Qdrant) | 2024-12-30 | Version control is a hard requirement per @vtmocanu feedback; prompts-as-code philosophy |
| Vendor-agnostic git support | 2024-12-30 | Users may use self-hosted git (Forgejo, Gitea, GitLab) not just GitHub |
| Phase 1: Read-only | 2024-12-30 | Simplify initial implementation; users manage prompts via standard git workflows |
| Phase 2 (future PRD): Write operations | 2024-12-30 | Create/update/delete via MCP deferred to keep Phase 1 focused |
| PAT/token authentication only | 2024-12-26 | Start simple, add SSH key support later if needed |
| Warning on name collision (not error) | 2024-12-30 | Don't fail entirely if one prompt collides; skip and continue |
| Add MCP arguments support | 2024-12-26 | Align with MCP spec, enable parameterized prompts |

---

## Open Questions

1. ~~**Storage choice**: GitHub or Qdrant?~~ **Resolved**: Git-based, vendor-agnostic
2. **Cache directory location**: Use `/tmp` or configurable path?
3. **Shallow clone**: Should we use `--depth 1` for faster clones?
