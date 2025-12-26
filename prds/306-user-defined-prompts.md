# PRD 306: User-Defined Prompts

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

Enable users to define custom prompts stored in one of two backends:
1. **GitHub Repository** - Git-based storage with full CRUD operations via MCP
2. **Qdrant** - Vector database already deployed for patterns/policies

The first milestone is to evaluate and choose between these options based on team discussion.

## User Stories

1. **As a team lead**, I want to define standard prompts for my team so that everyone follows consistent workflows across projects.

2. **As a developer**, I want to create/edit/delete prompts while working on a project so that I don't need to context-switch to manage a separate repository.

3. **As an MCP user**, I want my custom prompts to work identically whether MCP runs locally, in Docker, or in Kubernetes.

4. **As a prompt author**, I want to create parameterized prompts (with arguments) so that users can customize prompt behavior at runtime.

## Technical Requirements

### Prompt Format (Enhanced)

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

### Storage Option A: GitHub Repository

**Configuration:**
```bash
DOT_AI_USER_PROMPTS_REPO=https://github.com/org/team-prompts
DOT_AI_USER_PROMPTS_TOKEN=ghp_xxxx  # PAT for private repos
DOT_AI_USER_PROMPTS_BRANCH=main     # Optional, defaults to main
```

**Operations:**
| Operation | Implementation |
|-----------|----------------|
| List | Clone/pull repo, read all `.md` files |
| Get | Read specific file from local clone |
| Create | Create file, commit, push |
| Update | Modify file, commit, push |
| Delete | Delete file, commit, push |

**Pros:**
- Version controlled with full git history
- Natural collaboration via PRs (in the source repo)
- "Prompts as code" philosophy
- Teams already know git workflows

**Cons:**
- Network dependency (GitHub availability)
- Authentication complexity (PAT management)
- More complex implementation (~800+ lines)
- Need to handle git conflicts

### Storage Option B: Qdrant

**Configuration:**
```bash
# Uses existing Qdrant connection from MCP
# No additional configuration needed
```

**Operations:**
| Operation | Implementation |
|-----------|----------------|
| List | Query Qdrant collection |
| Get | Fetch by ID from Qdrant |
| Create | Insert into Qdrant |
| Update | Update document in Qdrant |
| Delete | Remove from Qdrant |

**Pros:**
- Already deployed infrastructure
- Consistent with patterns/policies architecture
- No network dependency beyond existing Qdrant
- Simpler implementation (~300 lines)
- Works identically in all environments

**Cons:**
- Not version controlled by default
- No natural PR/review workflow
- Requires Qdrant to be running

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

### Contribution Encouragement

After successful prompt creation, display message:
```
Prompt created successfully!

Consider contributing this prompt to the dot-ai project:
https://github.com/vfarcic/dot-ai/blob/main/docs/guides/contributing-prompts.md
```

## Success Criteria

1. Users can create, read, update, and delete custom prompts via MCP tools
2. Custom prompts appear in `prompts/list` alongside built-in prompts
3. Custom prompts work identically in local, Docker, and Kubernetes deployments
4. Parameterized prompts with arguments function correctly
5. Name collisions with built-in prompts are detected and reported
6. Integration tests cover all CRUD operations and edge cases

## Out of Scope

- Multiple user prompt sources (future enhancement)
- GitHub App or SSH key authentication (future - PAT only for now)
- Prompt versioning/rollback within Qdrant (future)
- Prompt sharing/marketplace (future)

## Dependencies

- Existing MCP prompts infrastructure (`src/tools/prompts.ts`)
- Qdrant integration (if Option B chosen)
- GitHub API / git operations (if Option A chosen)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| GitHub rate limiting | Implement caching, respect rate limits |
| Git conflicts on concurrent edits | Lock mechanism or last-write-wins with warning |
| Invalid prompt format | Validate on create/update, reject malformed prompts |
| Network failures (GitHub) | Cache prompts locally, graceful degradation |

---

## Milestones

- [ ] **Milestone 1**: Evaluate storage options (GitHub vs Qdrant) and make decision
- [ ] **Milestone 2**: Implement MCP `arguments` support for existing prompts
- [ ] **Milestone 3**: Implement chosen storage backend with full CRUD operations
- [ ] **Milestone 4**: Add prompt merging and collision detection
- [ ] **Milestone 5**: Integration tests for all operations
- [ ] **Milestone 6**: Documentation and contribution guide

---

## Progress Log

| Date | Update |
|------|--------|
| 2024-12-26 | PRD created, awaiting storage option decision |

---

## Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| Full CRUD (not read-only) | 2024-12-26 | Users should manage prompts without leaving their project context |
| PAT authentication only | 2024-12-26 | Start simple, add GitHub App/SSH later if needed |
| Error on name collision | 2024-12-26 | Prevent accidental override of built-in prompts |
| Add MCP arguments support | 2024-12-26 | Align with MCP spec, enable parameterized prompts |

---

## Open Questions

1. **Storage choice**: GitHub or Qdrant? (To be decided in Milestone 1)
2. **Caching strategy**: How long to cache GitHub prompts locally?
3. **Conflict resolution**: For GitHub option, how to handle concurrent edits?
