---
name: dot-ai-worktree-prd
description: Create a git worktree for PRD work with a descriptive branch name. Infers PRD from context or asks user.
user-invocable: true
---

# Create Git Worktree for PRD

Create a git worktree with a descriptive branch name based on the PRD title.

## Workflow

### Step 1: Identify the PRD

Infer the PRD number from the current conversation. Look for references like "PRD 353", "PRD #353", or "prd-353".

If not found, ask the user: "Which PRD should I create a worktree for? (e.g., 353)"

### Step 2: Create the Worktree

If the PRD title is already known from conversation context, pass both number and title:
```bash
bash .claude/skills/dot-ai-worktree-prd/create.sh [number] "[title]"
```

Otherwise let the script look it up from `prds/`:
```bash
bash .claude/skills/dot-ai-worktree-prd/create.sh [number]
```

### Step 3: Handle Result

- If `SUCCESS=true`: report the branch name, worktree path, and suggest `cd [worktree_path]`
- If `ERROR=true`: show the errors to the user and ask how to proceed

## Guidelines

- **Descriptive names**: Branch names describe the feature, not just the PRD number
- **Base on main**: Always branches from `main` for new feature work
- **Clean names**: The script keeps branch names concise and URL-safe

