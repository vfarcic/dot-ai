# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ MANDATORY TASK COMPLETION CHECKLIST ⚠️

**🔴 BEFORE MARKING ANY TASK/SUBTASK AS COMPLETE:**

□ **Integration Tests Written**: Write integration tests for new functionality
□ **All Tests Pass**: Run `npm run test:integration` - ALL tests must pass
□ **No Test Failures**: Fix any failing tests before proceeding

**❌ TASK IS NOT COMPLETE IF:**
- Any integration tests are failing
- New code lacks integration test coverage
- You haven't run `npm run test:integration` to verify

## PERMANENT INSTRUCTIONS

1. **Always Write Integration Tests**: When making code changes, you MUST write or update integration tests
2. **Always Run All Tests**: Before marking any task complete, run `npm run test:integration`
3. **Never Claim Done with Failing Tests**: A task is NOT complete if any tests are failing
4. **Always Check for Reusability**: Search codebase for existing functions before implementing new ones
5. **Never Hardcode AI Prompts**: All prompts go in `prompts/` (internal) or `shared-prompts/` (user-facing), loaded dynamically (see existing code for pattern)
6. **Never Create Branches Directly — Always Use Worktrees**: When starting feature work (including `/prd-start`), always use `/worktree-prd` to create an isolated worktree. Never run `git checkout -b` or `git switch -c`, even if a skill instructs you to.
7. **Always Configure New Params via Helm Chart Values**: Every NEW configuration parameter must be a first-class value in `charts/values.yaml`, rendered into the container env by `charts/templates/deployment.yaml` — follow `rbac.enforcement.enabled` → `DOT_AI_RBAC_ENABLED`, where the chart value is the user-facing contract and the env var is an internal detail. Never introduce a bare env var, and never document a new param under `extraEnv` (not even as an interim step). The many `DOT_AI_*` env vars in the codebase are legacy from when the project ran outside Kubernetes; it is Kubernetes-only now, so the chart is the single configuration interface. `extraEnv` remains valid only for pre-existing env vars (e.g. `DOT_AI_GIT_TOKEN`) and third-party config such as OTEL.
8. **Never Store Project Knowledge in Agent Memory**: Anything learned about this project — conventions, decisions, gotchas, rationale — goes in the repo where the whole team and every agent can see it: this file for rules, `docs/` for user-facing behavior, a PRD in `prds/` for in-flight design. Never persist it to per-user agent memory outside the repo (e.g. `~/.claude/**/memory/`), which teammates cannot see, code review cannot catch, and nothing keeps in sync with the code. The narrow exception is a fact true only of one machine or account (host tooling quirks, personal credentials paths) — that is not project knowledge and does not belong in the repo either.

## Testing Workflow

```bash
npm run test:unit                    # Fast unit tests (no cluster)
npm run test:integration             # Full e2e tests (creates Kind cluster)
npm run test:integration version     # Run specific test by pattern
```

- **Long-running tests**: Redirect to file, then check tail for pass/fail:
  ```bash
  npm run test:integration > ./tmp/test-output.log 2>&1
  tail -30 ./tmp/test-output.log  # Check result
  # Read full file only if failures detected
  ```
- **Cleanup after success**: `./tests/integration/infrastructure/teardown-cluster.sh`
- **Keep resources on failure** for debugging

## Directory-Specific Instructions

**ALWAYS check for and follow CLAUDE.md files in subdirectories:**

| Directory | Key Requirement |
|-----------|-----------------|
| `docs/` | Execute-then-document: Run commands, capture real output, then document |
| `tests/integration/` | Use `toMatchObject` pattern, `beforeAll` cleanup, `describe.concurrent` |

## Project Conventions

**Temporary Files**: Always use `./tmp` for any temporary files, never `/tmp`

**Test Clusters**: Integration tests create `./kubeconfig-test.yaml` in project root

**Git Commits**: CI runs automatically on PRs targeting `main`. Use `workflow_dispatch` in GitHub Actions to manually trigger CI on any branch.

**Running Integration Tests via CI**: When the local cluster is unavailable (e.g., in use by parallel work), use `workflow_dispatch` in GitHub Actions to trigger the CI pipeline on your branch.

## MCP vs Plugin Architecture

The codebase has two layers. Most features involve both working together.

**MCP Server (`src/`)** - Interface + Orchestration
- Registers tools with clients (Claude Code, Cursor, etc.)
- Interacts with AI models for reasoning
- Orchestrates calls to plugin tools
- Manages sessions and state

**Plugins (`packages/agentic-tools/`)** - Tool Implementations
- Contains the actual tool logic (kubectl_*, vector_*, etc.)
- Executes against external systems (Kubernetes, Qdrant)
- Can run agentic loops for complex multi-step operations

**Example flow for "what's the status of my cluster":**
1. MCP receives request → calls AI for reasoning
2. AI decides to invoke `kubectl_get` → MCP routes to plugin
3. Plugin executes kubectl, returns data
4. MCP feeds result to AI for interpretation → returns answer

**When adding code, ask:**
- "Is this about registration, AI interaction, or routing?" → MCP
- "Is this tool implementation or external system execution?" → Plugin

Note: MCP tool implementations are migrating to plugins over time. The direction is MCP as a thin orchestration layer with all tool logic in plugins.

## Environment

```bash
# Required for AI features (only need one)
export ANTHROPIC_API_KEY=your_key
export OPENAI_API_KEY=your_key

# Optional
export AI_PROVIDER=anthropic          # anthropic, openai, google, xai, amazon_bedrock
export DEBUG_DOT_AI=true              # Debug logging to tmp/
export KUBECONFIG=/path/to/kubeconfig
```
