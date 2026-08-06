---
sidebar_position: 9
---

# Shared Prompt Library

<!-- PRD-29 -->

![Shared Prompt Library Infographic](../img/prompts.jpeg)

## What are Shared Prompts

Shared Prompts provide a centralized way to share and discover prompts across projects and team members. Instead of manually copying prompt files between projects, prompts are served directly through the DevOps AI Toolkit and automatically appear as native slash commands in AI coding agents.

**Key Benefits:**
- **Zero setup**: Connect to the server and prompts are immediately available
- **Native integration**: Prompts appear as slash commands in your coding agent's command menu
- **Cross-project sharing**: Same prompts available across all projects without file management
- **Instant updates**: New prompts added to server are immediately available to all users
- **Team consistency**: Everyone uses the same proven prompts

## Prerequisites

Before using Shared Prompts, you need:
- **DevOps AI Toolkit deployed** — see [Deployment Guide](../setup/deployment.md)
- **Access via** [MCP client](/docs/mcp) or [CLI](https://devopstoolkit.ai/docs/cli)

**Note**: The Anthropic API key is only required for AI-powered tools (like deployment recommendations), not for using the shared prompts library.

## How It Works

The DevOps AI Toolkit implements the standard MCP Prompts specification, exposing two key endpoints:

- **`prompts/list`**: Returns all available prompts with metadata
- **`prompts/get`**: Returns specific prompt content by ID

When you connect to the server, your coding agent automatically discovers available prompts and makes them accessible through agent-specific interfaces. The access method varies by agent - some use slash commands, others integrate prompts as available tools.

## See Shared Prompts in Action

[![Using PRD Prompts with DevOps AI Toolkit](https://img.youtube.com/vi/LUFJuj1yIik/maxresdefault.jpg)](https://youtu.be/LUFJuj1yIik)

This video demonstrates how to use the PRD (Product Requirements Document) prompts served by the DevOps AI Toolkit. Watch how to create, manage, and work through complete PRD workflows using the shared prompts library with conversational AI agents.

## Using Shared Prompts

### Discovering Available Prompts

1. Ensure you're connected to the DevOps AI Toolkit (see [MCP client setup](/docs/mcp))
2. Access prompts using your agent's interface:
   - **Claude Code**: Type `/` and look for `/dot-ai:prompt-name` commands
   - **VS Code + GitHub Copilot**: Type `/` and look for `/mcp.dot-ai.prompt-name` commands
   - **Other agents**: Check your agent's command menu or ask the agent to use specific prompts by name
3. Browse available prompts through your agent's discovery interface

### Executing Shared Prompts

**Claude Code:**
```bash
# Create a new PRD
/dot-ai:prd-create

# Get current PRD status
/dot-ai:prds-get
```

**VS Code + GitHub Copilot:**
```bash
# Create a new PRD
/mcp.dot-ai.prd-create

# Get current PRD status
/mcp.dot-ai.prds-get
```

**Other Agents:**
- May use slash commands with different formats
- Or ask the agent to use the prompt by name (e.g., "Use the prd-create prompt")

The prompt content executes exactly as if it were a local command file, but without any file management on your part.

## Available Prompts

### Project Management Prompts

**`prd-create`**
- **Purpose**: Create a comprehensive Product Requirements Document following documentation-first approach
- **Use when**: Starting a new feature that requires detailed planning, tracking, and documentation
- **Example**: Beginning work on a new feature or major enhancement

**`prds-get`**
- **Purpose**: Fetch all open GitHub issues with 'PRD' label from the current project repository
- **Use when**: Want to see all active Product Requirements Documents and their status
- **Example**: Getting overview of current project priorities and PRD status

**`prd-next`**
- **Purpose**: Analyze existing PRD to identify and recommend the single highest-priority task to work on next
- **Use when**: Need guidance on what to work on next within a PRD, uses smart auto-detection of target PRD
- **Example**: Continuing work on a PRD and need to prioritize remaining tasks

**`prd-start`**
- **Purpose**: Start working on a PRD implementation
- **Use when**: Beginning work on a specific PRD
- **Example**: Moving from planning phase to implementation phase

**`prd-update-progress`**
- **Purpose**: Update PRD progress based on git commits and code changes, enhanced by conversation context
- **Use when**: Implementation work has been completed and need to mark PRD items as done based on actual code changes
- **Example**: After completing development tasks, update PRD to reflect current status

**`prd-update-decisions`**
- **Purpose**: Update PRD based on design decisions and strategic changes made during conversations
- **Use when**: Architecture, workflow, or requirement decisions were made in conversation that need to be captured in the PRD
- **Example**: After making architectural decisions that affect the original PRD scope

**`prd-done`**
- **Purpose**: Complete PRD implementation workflow - create branch, push changes, create PR, merge, and close issue
- **Enhanced PR Creation**: Automatically detects and uses project PR templates (e.g., `.github/PULL_REQUEST_TEMPLATE.md`), analyzes git changes to auto-fill PR content, and prompts for information requiring human judgment
- **Template Integration**: Works seamlessly with PR templates generated by the [Project Setup](project-setup.md) tool
- **Use when**: Finished implementing a PRD and ready to deploy and close out the work
- **Example**: All PRD tasks completed and ready for final deployment and closure

**`prd-close`**
- **Purpose**: Close a PRD that is already implemented or no longer needed without creating a PR
- **Use when**: PRD functionality already exists (implemented elsewhere), PRD is superseded, or requirements changed
- **Example**: Closing a PRD whose features were already implemented in a separate project

### Development Prompts

**`generate-dockerfile`**
- **Purpose**: Generate production-ready, secure, multi-stage Dockerfile and .dockerignore for any project
- **Use when**: Containerizing an application for production deployment, or improving an existing Dockerfile
- **Example**: Setting up Docker for a new project, or fixing security issues in an existing Dockerfile

**`generate-cicd`**
- **Purpose**: Generate intelligent CI/CD workflows through interactive conversation by analyzing repository structure and user preferences
- **Use when**: Setting up CI/CD pipelines that understand your project's existing automation (Makefile, npm scripts, etc.)
- **Example**: Adding GitHub Actions workflows that use your project's build system rather than raw commands

## Example Workflows

### Workflow 1: Complete PRD Lifecycle

- **Start new feature**: Use `prd-create` prompt to create comprehensive requirements document
  1. GitHub issue created with PRD label
  2. PRD file generated with proper naming
  3. Complete documentation content written across multiple files with traceability

- **Check priorities**: Use `prds-get` prompt to see all active PRDs and priorities
  1. Open PRD issues fetched from GitHub
  2. Issues formatted with status analysis
  3. Next steps recommendations provided

- **Begin implementation**: Use `prd-start` prompt to begin working on specific PRD
  1. Target PRD auto-detected from context
  2. PRD readiness validated
  3. Feature branch created
  4. First implementation task identified with detailed plan

- **Get next task**: Use `prd-next` prompt to identify highest-priority remaining work
  1. Current PRD state analyzed
  2. Single highest-value next task identified
  3. Implementation design guidance provided

- **Update decisions**: Use `prd-update-decisions` prompt when design decisions are made during implementation
  1. Conversation context analyzed for design decisions
  2. Decision impact assessed across requirements and scope
  3. PRD sections updated with new decisions and rationale

- **Update progress**: Use `prd-update-progress` prompt after completing implementation tasks
  1. Git commits and code changes analyzed
  2. Changes mapped to PRD requirements
  3. PRD checkboxes updated with work log entry

- **Finalize**: Use `prd-done` prompt to deploy, merge, and close out completed work
  1. Pre-completion validation performed
  2. Pull request created and merged
  3. GitHub issue closed with final validation

### Workflow 2: Containerization

#### Video: Production Dockerfile Generation

[![My Production Dockerfile Rules: How I Build Docker Images](https://img.youtube.com/vi/ueTe-VQaD7c/maxresdefault.jpg)](https://youtu.be/ueTe-VQaD7c)

This video demonstrates how to use the `generate-dockerfile` prompt to create production-ready, secure, multi-stage Dockerfiles. Watch how the prompt analyzes your project structure and generates optimized Docker configurations following best practices.

- **Containerize project**: Use `generate-dockerfile` prompt to create production-ready Docker configuration
  1. Project structure analyzed (language, framework, dependencies)
  2. Multi-stage Dockerfile generated with security best practices
  3. Minimal .dockerignore created based on Dockerfile's COPY commands
  4. Image built and validated automatically
  5. Container tested to ensure application runs correctly

- **Improve existing Dockerfile**: Use same prompt when Dockerfile already exists
  1. Existing Dockerfile analyzed against best practices
  2. Security issues identified (running as root, :latest tags, etc.)
  3. Optimizations applied while preserving intentional customizations
  4. Changes explained with rationale

### Workflow 3: CI/CD Generation

- **Generate CI/CD workflows**: Use `generate-cicd` prompt to create intelligent workflows
  1. CI platform confirmed (GitHub Actions supported, feature request offered for others)
  2. Repository analyzed (language, automation, existing CI, deployment mechanism)
  3. Findings presented for user confirmation
  4. Workflow choices presented (PR workflow, release triggers, deployment strategy)
  5. Workflows generated using project automation (npm test, make build, etc.)
  6. Required secrets and permissions documented
  7. Workflows committed and validated

## Cross-Agent Compatibility

### Supported Coding Agents

**Agents with Full Slash Command Support**: ✅
- **Claude Code**: Prompts appear as `/dot-ai:prompt-name`
- **VS Code + GitHub Copilot**: Prompts appear as `/mcp.dot-ai.prompt-name`
- Both support native slash command integration and prompt discovery
- Tools appear in agent configuration menus
- Full metadata support with descriptions

**Other MCP-Compatible Agents**: 🤔 Expected to work (not validated)
- Other MCP-compatible clients like Cursor should work since they follow MCP specifications
- Different agents may use different slash command formats (e.g., `/mcp.dot-ai.prompt-name` vs `/dot-ai:prompt-name`)
- **Help us validate**: Try these prompts in your agent and [report your experience via GitHub issues](https://github.com/vfarcic/dot-ai/issues)

## Contributing Prompts

Have a useful prompt to share? Contribute it to the shared library:

1. **Fork the repository** and create a feature branch
2. **Add your prompt** to the `shared-prompts/` directory following existing naming conventions
3. **Update the documentation** by adding your prompt to the "Available Prompts" section above
4. **Submit a pull request** with a clear description of what the prompt does and when to use it

### Prompt Metadata Format

Each prompt file must include YAML frontmatter that defines how it appears in coding agents:

```yaml
---
name: your-prompt-name
description: Brief description of what this prompt does
category: project-management
---

# Your Prompt Content

Your prompt instructions go here...
```

**Metadata Fields:**
- **`name`**: Becomes the slash command name (e.g., `name: prd-create` → `/dot-ai:prd-create`)
- **`description`**: Shows up in coding agent command menus and help text
- **`category`**: Used for organizing prompts in documentation (must be one of: `project-management`, `development`)

**How It Works:**
1. **Prompt Discovery**: Your coding agent automatically discovers all available prompts and their metadata
2. **Slash Commands**: Each prompt appears as a slash command — the `name` becomes the command, `description` appears in menus
3. **Organization**: The `category` field groups prompts in documentation for easy browsing

**Contribution Guidelines:**
- Use descriptive, kebab-case names (e.g., `database-optimization`, `api-security-review`)
- Include clear purpose and usage examples in your PR description
- Test your prompt across different scenarios before contributing
- Follow the established prompt format and documentation patterns

## User-Defined Prompts

Serve custom prompts from your own git repository. Your prompts appear alongside built-in prompts.

### Why User-Defined Prompts?

- **Agent-agnostic**: Prompts work with any compatible coding agent (Claude Code, Cursor, VS Code, etc.) without maintaining separate prompt directories for each tool
- **Team consistency**: Share standard prompts across all projects without contributing to the core project
- **Organization-specific workflows**: Create prompts tailored to your team's processes
- **Version control**: Manage prompts through standard git workflows (commit, push, PR)
- **Works everywhere**: Prompts work across all Kubernetes deployments

### Configuration

Configure user prompts via environment variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `DOT_AI_USER_PROMPTS_REPO` | Git repository URL (HTTPS) | None (feature disabled) |
| `DOT_AI_USER_PROMPTS_BRANCH` | Branch to use | `main` |
| `DOT_AI_USER_PROMPTS_PATH` | Subdirectory within repo | Root directory |
| `DOT_AI_GIT_TOKEN` | Authentication token for private repos | None |
| `DOT_AI_USER_PROMPTS_CACHE_TTL` | Cache duration in seconds | `86400` (24 hours) |

**Supported Git Providers:**
- GitHub (github.com)
- GitLab (gitlab.com or self-hosted)
- Gitea / Forgejo (self-hosted)
- Bitbucket (bitbucket.org)
- Any git server supporting HTTPS clone

### Repository Setup

Create a git repository with prompt files as markdown (`.md`) files:

```
my-team-prompts/
├── deploy-app.md
├── review-pr.md
└── team-standup.md
```

Or use a subdirectory within an existing repository:

```
my-project/
├── src/
├── docs/
└── prompts/          # Set DOT_AI_USER_PROMPTS_PATH=prompts
    ├── deploy-app.md
    └── review-pr.md
```

### Prompt File Format

User prompts follow the same format as built-in prompts, with optional MCP arguments support:

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

# Deploy Application

Deploy the application to {{environment}}.

{{#if version}}
Deploying version: {{version}}
{{/if}}

## Steps

1. Verify the deployment configuration
2. Run pre-deployment checks
3. Execute deployment to {{environment}}
4. Validate deployment success
```

**Metadata Fields:**
- **`name`**: Becomes the slash command (e.g., `name: deploy-app` → `/dot-ai:deploy-app`)
- **`description`**: Shows in coding agent command menus
- **`category`**: Organizes prompts in documentation
- **`arguments`**: Optional parameters substituted via `{{argumentName}}` placeholders

### Deployment Configuration

#### Kubernetes (Helm)

Add environment variables via `extraEnv` in your Helm values:

```bash
helm upgrade --install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --namespace dot-ai --create-namespace \
  --set secrets.anthropic.apiKey="${ANTHROPIC_API_KEY}" \
  --set localEmbeddings.enabled=true \
  --set-json 'extraEnv=[
    {"name":"DOT_AI_USER_PROMPTS_REPO","value":"https://github.com/your-org/team-prompts.git"},
    {"name":"DOT_AI_USER_PROMPTS_PATH","value":"prompts"},
    {"name":"DOT_AI_GIT_TOKEN","value":"'"${DOT_AI_GIT_TOKEN}"'"}
  ]'
```

### How It Works

1. **First access**: Repository is cloned to a local cache directory
2. **Subsequent access**: Repository is pulled if cache TTL has expired
3. **Merging**: User prompts are merged with built-in prompts
4. **Precedence**: Built-in prompts take precedence over user prompts with the same name

### Error Handling

The feature is designed for graceful degradation:

| Scenario | Behavior |
|----------|----------|
| Repository not configured | Built-in prompts only (no error) |
| Clone fails (auth, network) | Built-in prompts only, error logged |
| Pull fails | Cached version used, warning logged |
| Invalid prompt format | Prompt skipped, warning logged |
| Name collision with built-in | User prompt skipped, warning logged |

### Troubleshooting User Prompts

**User prompts don't appear**
- **Cause**: Repository not configured or clone failed
- **Solution**: Verify `DOT_AI_USER_PROMPTS_REPO` is set and accessible
- **Check**: Run "Show dot-ai status" to verify prompt loading and connectivity

**Private repository auth fails**
- **Cause**: Missing or invalid `DOT_AI_GIT_TOKEN`
- **Solution**: Set a valid personal access token (PAT) with repo read access
- **Note**: Tokens are never logged; URLs are sanitized in log output

**Changes not appearing**
- **Cause**: Cache hasn't expired yet
- **Solution**: Force-refresh the cache via [`dot-ai prompts refresh`](https://devopstoolkit.ai/docs/cli) (CLI), wait for TTL to expire, or set `DOT_AI_USER_PROMPTS_CACHE_TTL=0` for testing. If you're building a custom HTTP client rather than using the CLI, see the [REST API reference](../api/rest-api.md#prompts-endpoints) for the refresh endpoint.

**Prompt has same name as built-in**
- **Cause**: Name collision with built-in prompt
- **Solution**: Rename your prompt to a unique name
- **Note**: Built-in prompts always take precedence

**My private prompts repo returns not-found, or keeps serving stale content**

Applies to a repo supplied **per request** (`?repo=` / `--repo`), not to `DOT_AI_USER_PROMPTS_REPO`, which is never gated.

- **Cause**: the repo's host is not on the `gitops.allowedRepoHosts` allowlist, so the server withheld its own credential and cloned unauthenticated — and an unauthenticated request for a private repo looks exactly like a repo that does not exist.
- **A failed clone says so itself** — no log digging needed. Git's own failure is followed by this explanation, in the error the caller receives (`502 PROMPTS_SOURCE_ERROR`) as well as in the server log:

  ```text
  The server's git credential was NOT used for this clone because repository host
  "gitlab.example.com" is not on the "gitops.allowedRepoHosts" allowlist (currently
  allowed: github.com), so the repository was cloned unauthenticated. If it is
  private, send the credential with the request in the X-Dot-AI-Git-Token header,
  or add the host to the "gitops.allowedRepoHosts" Helm value.
  ```

- **A stale refresh does not fail**, so the log is the only signal. Search it for `Withholding the server git credential` — the `pull` variant means the repository kept serving its cached copy instead of refreshing:

  ```text
  WARN [<component>] Withholding the server git credential from this pull {"url":"https://gitlab.example.com/team/prompts.git","host":"gitlab.example.com","allowedHosts":["github.com"],"reason":"the repository URL came from the request and its host is not on the \"gitops.allowedRepoHosts\" allowlist","consequence":"pulling unauthenticated; a private repository keeps serving the cached copy instead of refreshing, unless the request supplies its own credential in the X-Dot-AI-Git-Token header"}
  ```

- **Solution**: send the repo's own credential in the `X-Dot-AI-Git-Token` header (the [per-request credential](#the-server-credential-and-the-host-allowlist)), or have an operator add the host to `gitops.allowedRepoHosts`.
- **The other cause of the same symptom**: an `http://` override URL, whatever host it names. `https:` is the only scheme the server's credential travels over, so it is withheld exactly the same way — and no allowlist entry changes that. Re-issue the request naming the same repository with its `https://` URL; the credential header is not the fix here, since it would travel in cleartext. (A scheme that is neither `http` nor `https` never gets this far: it fails validation with `400`, not `502`.)

  This case says so in its own words rather than borrowing the host wording — it names the scheme, offers the one fix that works, and explicitly rules the allowlist out, so nobody edits a Helm value that was already correct. For `http://github.com/x.git` on the default allowlist:

  ```text
  The server's git credential was NOT used for this clone because the repository URL
  scheme "http://" cannot carry it — "https://" is the only scheme that may, since
  http:// would send it in cleartext, so the repository was cloned unauthenticated. If
  it is private, send the request again naming the same repository with an https://
  URL. This is not an allowlist decision — the "gitops.allowedRepoHosts" Helm value
  has no bearing on a URL that is not https://.
  ```

  The log line splits the same way — the `reason` field points at the scheme, not the allowlist:

  ```text
  WARN [<component>] Withholding the server git credential from this clone {"url":"http://github.com/x.git","host":"github.com","allowedHosts":["github.com"],"reason":"the repository URL came from the request and its scheme is not \"https://\", the only scheme that may carry the server credential — the \"gitops.allowedRepoHosts\" allowlist is not what refused it","consequence":"cloning unauthenticated; a private repository will fail unless the request names the repository with an https:// URL"}
  ```
- **Not the cause**: a public repo on a non-allowlisted host is unaffected — it needs no credential. If a *public* source is missing, look at the other entries in this section instead.

### Multi-source skills via the per-request repo override

When a single `DOT_AI_USER_PROMPTS_REPO` isn't enough — for example, you want org-wide public skills from one repository plus per-team private skills from another — run `dot-ai skills generate --repo <url>` (see the [CLI docs](https://devopstoolkit.ai/docs/cli) for the canonical reference) to fetch prompts from a specified repository for that invocation only, overriding the env-var default. Run the command multiple times — typically wired up as separate agent hooks, one per source — and the CLI tags each set of generated skills with its source so subsequent runs only wipe their own slice.

The override carries more than just the repo URL. A secondary source can live wherever it actually is, via three **optional, additive** qualifiers:

| Qualifier | What it does | Default when omitted |
|-----------|--------------|----------------------|
| `path` (subdirectory) | Load prompts from a `skills/`-style subdirectory instead of the repo root — the same layout an env-var repo selects with `DOT_AI_USER_PROMPTS_PATH`. | Repo root |
| `branch` | Pull the source from a non-default branch. | `main` |
| Per-request credential | Authenticate the override clone with a request-supplied git token (the `X-Dot-AI-Git-Token` header), so a second repo in a **different auth realm** (another Forgejo, a private GitHub or GitLab) can be reached without sharing one server-wide token. | Server's `DOT_AI_GIT_TOKEN` |

**Token precedence**: when a request supplies the credential header, it authenticates that override clone and takes precedence over the server's `DOT_AI_GIT_TOKEN` — but only for that request. Absent the header, the override clone falls back to `DOT_AI_GIT_TOKEN` for an `https://` URL naming a host on the [repository host allowlist](#the-server-credential-and-the-host-allowlist), and clones unauthenticated otherwise. The token always travels as a request header — never in a URL or body — and never appears in logs, error messages, or the `source` tag.

#### The server credential and the host allowlist

The override URL comes from the caller, so the server does not hand **its own** credential to any host a request happens to name. The `gitops.allowedRepoHosts` Helm value — the same value that gates [GitOps pushes](../setup/deployment.md#gitops-repository-host-allowlist), default `["github.com"]` — decides:

| Override repo URL | What happens |
|-------------------|--------------|
| `https://`, host on the allowlist | Unchanged: the clone uses the server's `DOT_AI_GIT_TOKEN` exactly as before |
| `https://`, host **not** on the allowlist | The clone still happens, **unauthenticated** — the server's credential is withheld |
| `http://`, **any** host — allowlisted or not | Withheld the same way: `https:` is the only scheme that may carry the server's credential ([matching rules](../setup/deployment.md#matching-rules)). An allowlist entry does not buy back the credential for an `http://` URL. |
| Any other scheme — `ssh://`, `git://`, `file://` | **Rejected outright**, before the credential decision is ever reached: `HTTP 400` with `Invalid override repoUrl scheme: ssh: (only http and https are allowed) for …`. The override has always accepted `http` and `https` and nothing else — see [validation rules](../api/rest-api.md#validation-rules-for-repo-path-and-branch). |
| Either scheme, host is a **non-public IP literal** — `127.0.0.1`, `169.254.169.254`, `10.x`, `[::1]` … | **Rejected outright** too, before anything is fetched: `HTTP 400` with `Invalid override repoUrl host: 169.254.169.254 is a link-local address, not a public destination this server may fetch prompts from, for …`. New in this release — a request-supplied `X-Dot-AI-Git-Token` does not soften it, because this decides whether the fetch happens at all rather than whose credential travels. See [what the override fetch exposes](#what-the-override-fetch-exposes) for the full list of ranges. |

The **allowlist decision** is degrade-only — it never turns a clone into a failure. (The last two rows are a different control: input validation that rejects the request before any credential decision is made. The scheme rule predates the allowlist; the non-public-host rule is new in this release.) Degrading keeps the blast radius narrow:

- **Public repositories on any host are unaffected.** They need no credential, so nothing changes for them.
- Only a **private** repository the credential is withheld from is affected, and which remedy applies depends on which half withheld it:
  - **A non-allowlisted host** (on `https://`): the remedy is already part of this feature — send the credential with the request in the `X-Dot-AI-Git-Token` header. A request that brings its own token is never gated **by the allowlist**, for any host (it is still subject to the two input-validation rejections above). Alternatively, an operator adds the host to `gitops.allowedRepoHosts` and the server's credential keeps being used for it.
  - **An `http://` URL** (any host, allowlisted or not): name the same repository with its `https://` URL. No allowlist entry restores the server's credential here — and while the request header does bypass the gate, sending your own token over `http://` puts it on a cleartext request, so it is not the way out of this one.
- **What this costs depends on what `DOT_AI_GIT_TOKEN` holds.** If it is a GitHub credential, nothing that worked is removed — `github.com` is the default allowlist entry. But the variable is not GitHub-only: the server sends it as the HTTP basic-auth **password** (under the username `x-access-token`), which is also how GitLab and Gitea/Forgejo accept a personal access token. So a GitLab or Gitea token in `DOT_AI_GIT_TOKEN` did authenticate to those hosts before this release, and if you reach one through `?repo=` for a **private** repository, that stops on upgrade until you apply either remedy above.

> **`DOT_AI_USER_PROMPTS_REPO` is not gated.** The allowlist applies only to a repository URL that arrived in a *request*. The env-var-configured repository is the operator's own choice of source, so pointing it at a private GitLab, Gitea, or Forgejo works exactly as before and needs no allowlist entry. Everything in [Configuration](#configuration) above, including the list of supported Git providers, is unchanged.

The withheld credential is announced in the server log, and — because the two cases fail differently — that log line matters more for a refresh than for a first clone:

| Path | Symptom | Log line |
|------|---------|----------|
| Clone (first fetch of that repo) | The request fails, and the error itself explains the withheld credential and how to supply one | `Withholding the server git credential from this clone` |
| Pull (refresh after the cache TTL) | **Nothing fails.** The cached copy keeps being served, so the content silently goes stale | `Withholding the server git credential from this pull` |

Both lines carry the parsed host, the allowlist as it currently reads, and the way out. See [my private prompts repo returns not-found or serves stale content](#troubleshooting-user-prompts).

The stale-refresh case needs a warm cache to begin with, so it only arises when an earlier unauthenticated fetch of that repo succeeded within the same pod's lifetime — typically a source that was public when first cloned and is not any more. The cache is not persisted across restarts, so a repo that has always been private fails at the clone instead, where the error explains itself.

Put together, a second source like *"the platform team's private skills, kept under `skills/` on the `team-skills` branch of a self-hosted Forgejo"* is reachable as a single override — a subdirectory, on a non-default branch, in a separate auth realm — alongside your org-wide public source. The CLI tags each source by its repo URL (the `source` value), which is **not** affected by `path`, `branch`, or the credential, so the per-source skill slices stay stable across runs.

Under the hood, each invocation talks to the server once and the server still serves exactly one repository per request; composition lives in the CLI, not the server. The exact wire placement of each qualifier — `path`/`branch` as query params or JSON body fields, the credential as the `X-Dot-AI-Git-Token` header — is in the [REST API reference](../api/rest-api.md#per-request-path-branch-and-credential).

> **Unchanged by default.** The `path`, `branch`, and credential qualifiers are all opt-in per request. A request that supplies none of them keeps the same clone target (repo root on `main`) and the same response shape, and still authenticates with `DOT_AI_GIT_TOKEN` for any `https://` repo on an [allowlisted host](#the-server-credential-and-the-host-allowlist) — the server's credential is withheld only for a caller-named URL that is not both. And when the override itself is not used, behavior is unchanged: the server falls back to `DOT_AI_USER_PROMPTS_REPO` (never gated), or to the built-in prompts when no env-var repo is configured.

**Server-side caveats** for this release (the contract is additive, so these can be lifted later without breaking changes):

| Caveat | Impact |
|--------|--------|
| Single-slot loader cache | Sequential invocations against different repos re-clone each time. Clones are `--depth 1`, so the cost is small per call, but it's noticeable when alternating between repos within the TTL window. Token-bearing override requests are additionally isolated from the shared cache slot, so a private authenticated clone is never served to another caller. |
| The override URL is still fetched for any host it **names** | Two separate controls, neither of which is a full SSRF gate. A host that is a non-public **IP literal** (loopback, private, link-local, and so on) is now refused with `HTTP 400` before anything is fetched. Every other host is fetched: the allowlist governs the **credential**, not the fetch, so a URL on a non-allowlisted host is cloned unauthenticated rather than rejected — and hostnames are never resolved, so a *name* that resolves to an internal address still reaches the clone. Don't expose this surface to untrusted callers without an upstream gate. What the allowlist does close is credential exposure: the server's `DOT_AI_GIT_TOKEN` is never handed to a host a caller named (see [The server credential and the host allowlist](#the-server-credential-and-the-host-allowlist)). See [what the override fetch exposes](#what-the-override-fetch-exposes) below for the refused ranges and for what a caller still learns from a host that passes. |

**When NOT to use the override**:

- Inside a long-running agent loop that alternates between repos (every alternation causes a re-clone — pin to one repo for the loop and switch outside it).
- As a substitute for `DOT_AI_USER_PROMPTS_REPO` when you only have a single source. The env var is simpler and benefits from the cache TTL.
- From untrusted clients. The server's credential is safe (it is withheld from any host not on the allowlist, and from any `http://` URL), and a non-public IP literal is refused before the fetch — but the fetch is still not fully guarded, because a hostname that resolves to an internal address is not: see [what the override fetch exposes](#what-the-override-fetch-exposes).

See the [REST API reference](../api/rest-api.md#prompts-endpoints) for the full wire contract, the `source` field semantics, validation rules, and response envelopes returned by each endpoint — useful if you're building a custom MCP/HTTP client rather than using the CLI.

#### What the override fetch exposes

The override makes the server fetch a URL the caller chose, so the destination is checked before anything is cloned. This release narrows what a caller may name — it does not reduce the surface to nothing. Know both halves.

**A non-public IP literal is refused, before anything is fetched.** The host is read after URL normalization and rejected with `HTTP 400 VALIDATION_ERROR` when it falls in a range that is never a public prompts source. This is a **refusal**, not the credential gate's degradation, and a request-supplied `X-Dot-AI-Git-Token` does not soften it — whose credential travels is a different question from whether the fetch happens:

| Family | Refused ranges |
|--------|----------------|
| IPv4 | `127.0.0.0/8` (loopback), `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (private), `169.254.0.0/16` (link-local, including the cloud metadata endpoint `169.254.169.254`), `0.0.0.0/8` (unspecified), `255.255.255.255` (broadcast) |
| IPv6 | `::1` (loopback), `::` (unspecified), `fe80::/10` (link-local), `fc00::/7` (unique-local), plus IPv4-mapped `::ffff:a.b.c.d` and IPv4-compatible `::a.b.c.d`, which are normalized to their IPv4 destination and then get the IPv4 rules |

The refusal names the offending host and which class refused it, so a caller can tell "typo" from "that destination is not permitted":

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid override repoUrl host: 169.254.169.254 is a link-local address, not a public destination this server may fetch prompts from, for http://169.254.169.254/latest/meta-data/"
  }
}
```

Alternate spellings do not get past it — the check reads the host the URL parser produced, not the text that was sent, so decimal (`http://2130706433/`), hex (`http://0x7f000001/`), octal (`http://0177.0.0.1/`), two-part shorthand (`http://127.1/`), a bare `http://0/`, a trailing dot, a bracketed IPv6 literal, and an explicit port all resolve to the same refusal. The echoed host is the **normalized** one, and a public-looking userinfo cannot smuggle an internal host past the check (nor does the userinfo itself come back — the URL in the message is scrubbed):

```text
GET /api/v1/prompts?repo=http://2130706433/x.git
  → Invalid override repoUrl host: 127.0.0.1 is a loopback address, not a public
    destination this server may fetch prompts from, for http://127.0.0.1/x.git

GET /api/v1/prompts?repo=https://github.com:s3cr3t-token@169.254.169.254/x.git
  → Invalid override repoUrl host: 169.254.169.254 is a link-local address, not a
    public destination this server may fetch prompts from, for https://***@169.254.169.254/x.git
```

This applies to the **caller-supplied** URL only. `DOT_AI_USER_PROMPTS_REPO` is untouched — an operator who points prompts at an in-cluster git server chose that destination, so `DOT_AI_USER_PROMPTS_REPO=http://127.0.0.1/prompts.git` still clones exactly as before.

> **A hostname is still not resolved.** The check classifies IP **literals**; no DNS lookup happens. So `http://localhost/x.git`, `http://kubernetes.default.svc/x.git`, and `http://metadata.google.internal/x.git` all still reach the clone, and everything below still describes what a caller learns from them. Closing that needs resolve-then-pin, which brings its own window between the check and git's own connect, and is deliberately out of scope for this release. **The narrowed surface is still a surface: don't expose the override to untrusted clients without an upstream gate.**

For an override URL the server has not cloned before — any host that passes the check above — git issues `GET <url>/info/refs?service=git-upload-pack` against whatever host was named.

**The probed endpoint's HTTP status comes back to the caller**, which makes the endpoint a reachability and status-code scanner:

| What the probed endpoint answers | What the caller gets |
|----------------------------------|----------------------|
| `200` with a body git cannot read as refs | `200` with **zero prompts**. Git's dumb-HTTP fallback reports `warning: You appear to have cloned an empty repository.` and exits 0, so the request succeeds. (A body whose first line looks like a malformed ref instead fails with `fatal: <url>/info/refs not valid: is this a git repository?`, surfacing as a `502` — either way a live `200` is distinguishable from the cases below.) |
| Any error status | `502 PROMPTS_SOURCE_ERROR` carrying git's message and the status code — `fatal: repository '<url>' not found` for a `404`, `The requested URL returned error: 403`, and so on |
| Nothing listening | `502 PROMPTS_SOURCE_ERROR` with `fatal: unable to access '<url>': Failed to connect to <host> port <port> ...` |

**Response bodies are mostly not returned, with one exception.** On a successful (`200`) probe git discards the body, so its content is not exfiltrated. On an **error** status, a body served as `text/plain` *is* echoed verbatim — git prefixes each line with `remote:` and those lines reach the caller inside the `502` message. An error body sent as `text/html`, `application/json`, or with no `Content-Type` is discarded. So for any destination a caller can still name — which, after the refusal above, means a public host or an internal one reachable by **name** — a plaintext error page is readable, but not the service's normal `200` output.

### CLI-uploaded skill sources (for sources the server can't reach)

The per-request override above still has the **server** fetch the source. That covers any repository a server-side clone can authenticate to — but not everything. Two cases remain where the developer's laptop (running the CLI) can fetch while the server cannot:

- **Sources the server can't authenticate or route to** — VPNs gated by SSO / OIDC / device attestation (no static token to hand the server), and managed/hardened clusters with no egress path the operator can open.
- **On-disk directories** — work-in-progress skills on your filesystem, with no git remote at all (the local dev loop).

For these, the CLI fetches the source **locally** and uploads it to the server, which caches it and renders it through the **same** server-side renderer — so a CLI-fetched skill renders identically to one cloned from a repo, with full argument substitution. There is still one renderer, server-side; only how the source reached it changes.

**What you run** — point `dot-ai skills generate` at the source the CLI should fetch:

- `dot-ai skills generate --repo-fetch <git-url>` — for a repository the server can't reach; the source is keyed by the git URL verbatim.
- `dot-ai skills generate --repo-dir <path> --source-label <label>` — for an on-disk directory with no git remote; the source is keyed by `local:<label>`.

Typically each source is wired up as its own agent hook, so the CLI re-fetches and re-uploads on every hook fire (content-hash-gated, so an unchanged source is a no-op). See the [CLI docs](https://devopstoolkit.ai/docs/cli) for the canonical flags, and the [REST API reference](../api/rest-api.md#prompts-endpoints) for the wire contract — the upload and `?source=` render calls, with real captured request/response output.

**Identifier conventions and a known limitation:**

- The server stores the identifier exactly as sent — it does not auto-prefix or namespace per caller in this release. To avoid collisions between hosts, use a convention like `local:<user>-<label>` or `local:<host>-<label>` for `--source-label`.
- Ingested identifiers are **global server state**: any authenticated caller can overwrite any identifier by uploading to the same one. There is no per-principal namespacing in this iteration — treat the endpoint as trusted-caller-only.

**Safety:** uploads are size/count-capped (max 512 KiB raw request body → `413`; max 100 files and max 256 KiB total decoded payload → `400`) and reject path traversal and null-byte paths; credential-bearing git-URL identifiers are scrubbed in every echo, error, and log. See the [REST API reference](../api/rest-api.md#ingested-cli-uploaded-skill-sources) for the full wire format, limits, and error envelopes.

## Troubleshooting

### Common Issues

**Prompts don't appear in command menu**
- **Cause**: Server not connected or prompts capability not enabled
- **Solution**: Check connection status and server configuration
- **See**: [Deployment Guide](../setup/deployment.md) for server troubleshooting, [MCP client setup](/docs/mcp) for connection issues

**Prompt execution fails with "not found" error**
- **Cause**: Prompt ID mismatch or server synchronization issue
- **Solution**: Refresh the connection or restart your coding agent
- **Workaround**: Disconnect and reconnect to the server

**Prompts work in one agent but not another**
- **Cause**: Agent-specific MCP implementation differences
- **Solution**: Check agent-specific compatibility notes above
- **Alternative**: Use a fully compatible agent for prompt-heavy workflows

## See Also

- **[Deployment Guide](../setup/deployment.md)** - Server deployment and configuration
- **[Tools and Features Overview](overview.md)** - Browse all available tools and features
