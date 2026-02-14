---
name: dot-ai-worktree-prd
description: Create a git worktree for PRD work with a descriptive branch name. Infers PRD from context or asks user.
user-invocable: true
---

# Create Git Worktree for PRD

Create a git worktree with a descriptive branch name based on the PRD title. This ensures feature branches have human-readable names that describe what the work is about.

## Workflow

### Step 1: Identify the PRD

Try to infer the PRD number from the current conversation. Look for PRD references like "PRD 353", "PRD #353", or "prd-353".

If not found in context, ask the user: "Which PRD should I create a worktree for? (e.g., 353)"

### Step 2: Get the PRD Title

If the PRD content is already in the conversation context, extract the title from there.

Otherwise, read the PRD file. PRD files are in the `prds/` directory with naming pattern `[number]-[slug].md`:
```bash
ls prds/ | grep "^[PRD_NUMBER]-"
```

The title is on the first line in format: `# PRD #[number]: [Title]`

### Step 3: Generate Descriptive Branch Name

Convert the PRD title to a branch-friendly name:
1. Start with `prd-[number]-`
2. Extract the title after the colon (e.g., "Update to Kimi K2.5 Model Support")
3. Convert to lowercase
4. Replace spaces with hyphens
5. Remove special characters except hyphens and dots
6. Keep it concise (truncate if very long)

**Examples:**
- "PRD #353: Update to Kimi K2.5 Model Support" → `prd-353-kimi-k2.5-support`
- "PRD #290: Skills Distribution System" → `prd-290-skills-distribution`
- "PRD #264: GitOps Tool ArgoCD Integration" → `prd-264-gitops-argocd-integration`

### Step 4: Create the Worktree

Run the following commands directly. Replace `[branch-name]` with the name generated in Step 3.

1. **Get the repo name and compute the worktree path:**
```bash
repo_name=$(basename "$(git rev-parse --show-toplevel)")
worktree_path="../${repo_name}-[branch-name]"
```

2. **Validate** — check that the branch, worktree path, and worktree registration don't already exist:
```bash
git show-ref --verify --quiet "refs/heads/[branch-name]" && echo "ERROR: Branch already exists"
test -d "${worktree_path}" && echo "ERROR: Worktree path already exists"
git worktree list | grep -q "[branch-name]" && echo "ERROR: Worktree already registered"
```
If any check fails, inform the user and ask how to proceed.

3. **Create the worktree** branching from `main`:
```bash
git worktree add "${worktree_path}" -b [branch-name] main
```

4. **Initialize submodules** in the new worktree:
```bash
cd "${worktree_path}" && git submodule update --init --recursive
```

5. **Report** the result to the user:
   - Worktree path: `${worktree_path}`
   - Branch: `[branch-name]`
   - Next step: `cd ${worktree_path}`

## Guidelines

- **Descriptive names**: Branch names should describe the feature, not just the PRD number
- **Consistent format**: Always prefix worktree directory with the repository name
- **Base on main**: Always branch from `main` for new feature work
- **Clean names**: Keep branch names concise but descriptive

