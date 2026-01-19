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

- **Long-running tests**: `npm run test:integration 2>&1 | tee ./tmp/test-output.log`
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

**Temporary Files**: Always use `./tmp`, never `/tmp`

**Test Clusters**: Store kubeconfig in `./tmp/kubeconfig.yaml`

**Git Commits**: Add `[skip ci]` when user requests to skip CI

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
