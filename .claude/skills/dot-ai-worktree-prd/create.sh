#!/usr/bin/env bash
set -euo pipefail

# Create a git worktree for PRD work with a descriptive branch name.
# Usage: create.sh <prd-number> [prd-title]
#
# If prd-title is not provided, the script reads it from prds/<number>-*.md.
# This script validates everything and creates the worktree, or reports errors.

if [ $# -lt 1 ]; then
  echo "ERROR=true"
  echo "MESSAGE=Usage: create.sh <prd-number> [prd-title]"
  exit 0
fi

prd_number="$1"
prd_title="${2:-}"

# --- Resolve PRD title if not provided ---

if [ -z "$prd_title" ]; then
  prd_file=$(find prds/ -maxdepth 1 -name "${prd_number}-*.md" -print -quit 2>/dev/null || true)
  if [ -z "$prd_file" ]; then
    echo "ERROR=true"
    echo "MESSAGE=No PRD file found matching prds/${prd_number}-*.md"
    exit 0
  fi
  # Extract title from first heading line.
  # Handles: "# PRD #123: Title", "## PRD #123 - Title", "# Title"
  first_line=$(head -1 "$prd_file")
  prd_title=$(echo "$first_line" | sed -E 's/^#+ *(PRD *#?[0-9]* *[:\-] *)?//')
fi

# --- Generate branch name ---

slug=$(echo "$prd_title" \
  | tr '[:upper:]' '[:lower:]' \
  | tr ' ' '-' \
  | sed 's/[^a-z0-9.\-]//g' \
  | sed 's/--*/-/g' \
  | sed 's/^-//;s/-$//' \
  | cut -c1-50)

branch_name="prd-${prd_number}-${slug}"

# --- Compute worktree path ---

if ! repo_root=$(git rev-parse --show-toplevel 2>&1); then
  echo "ERROR=true"
  echo "MESSAGE=Not in a git repository: ${repo_root}"
  exit 0
fi
repo_name=$(basename "$repo_root")
worktree_path="../${repo_name}-${branch_name}"

# --- Validate ---

errors=()

if git show-ref --verify --quiet "refs/heads/${branch_name}" 2>/dev/null; then
  errors+=("Branch '${branch_name}' already exists")
fi

if [ -d "$worktree_path" ]; then
  errors+=("Worktree path '${worktree_path}' already exists")
fi

if git worktree list --porcelain 2>/dev/null | grep -q "^branch refs/heads/${branch_name}$"; then
  errors+=("Worktree for '${branch_name}' is already registered")
fi

if [ ${#errors[@]} -gt 0 ]; then
  echo "ERROR=true"
  echo "BRANCH_NAME=${branch_name}"
  echo "WORKTREE_PATH=${worktree_path}"
  echo "ERRORS:"
  for err in "${errors[@]}"; do
    echo "  ${err}"
  done
  exit 0
fi

# --- Create worktree ---

default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

if ! output=$(git worktree add "${worktree_path}" -b "${branch_name}" "${default_branch}" 2>&1); then
  echo "ERROR=true"
  echo "BRANCH_NAME=${branch_name}"
  echo "WORKTREE_PATH=${worktree_path}"
  echo "ERRORS:"
  echo "  ${output}"
  exit 0
fi

echo "SUCCESS=true"
echo "BRANCH_NAME=${branch_name}"
echo "WORKTREE_PATH=${worktree_path}"
echo "PRD_TITLE=${prd_title}"
echo "GIT_OUTPUT=${output}"
