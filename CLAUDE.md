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
5. **Never Hardcode AI Prompts**: All prompts go in `prompts/` directory, loaded dynamically (see existing code for pattern)

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

**AI Prompts**: Store in `prompts/` (internal) or `shared-prompts/` (user-facing). Never hardcode.

**Temporary Files**: Always use `./tmp` for any temporary files, never `/tmp`

**Test Clusters**: Integration tests create `./kubeconfig-test.yaml` in project root

**Git Commits**: Add `[skip ci]` when user requests to skip CI

## Git Worktrees for Feature Work

Use git worktrees when starting work on any feature branch to maintain isolated agent context:

**Starting feature work:**
```bash
git worktree add ../dot-ai-[branch-name] -b [branch-name] main
# Or for existing branch:
git worktree add ../dot-ai-[branch-name] [branch-name]
```
Then start a new Claude Code session in the worktree directory.

**Finishing feature work:**
After merging, clean up from the main directory:
```bash
git worktree remove ../dot-ai-[branch-name]
```

**Why:** Keeps main directory on `main` branch, enables parallel work on multiple features, and ensures each agent session has consistent context for its branch.

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
