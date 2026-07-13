#!/usr/bin/env bash
set -euo pipefail

# Detect worktrees and local/remote branches whose work has already been merged,
# so the release skill can prune them after tagging.
#
# This script is detection-only: it never removes a worktree or deletes a branch.
# It does run `git fetch --prune` to refresh remote-tracking refs, which only
# updates local bookkeeping and never modifies the remote.

# --- Determine the default branch ---
default_branch="main"
if ref=$(git symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null); then
  default_branch="${ref#refs/remotes/origin/}"
fi

# --- Refresh remote-tracking refs (drops refs for branches deleted upstream) ---
git fetch --prune --quiet origin 2>/dev/null || true

current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
current_worktree=$(git rev-parse --show-toplevel 2>/dev/null || echo "")

# --- Build the set of merged branch names ---
declare -A merged=()

# Source 1: branches reachable from origin/<default> (real-merge / fast-forward).
while IFS= read -r b; do
  [ -z "$b" ] && continue
  [ "$b" = "$default_branch" ] && continue
  merged["$b"]=1
done < <(git branch --merged "origin/${default_branch}" --format='%(refname:short)' 2>/dev/null || true)

# Source 2: head branches of merged GitHub PRs. Covers squash & rebase merges,
# where the branch's commits never land verbatim on the default branch and so
# are invisible to `git branch --merged`.
if command -v gh >/dev/null 2>&1; then
  while IFS= read -r b; do
    [ -z "$b" ] && continue
    [ "$b" = "$default_branch" ] && continue
    merged["$b"]=1
  done < <(gh pr list --state merged --limit 200 --json headRefName --jq '.[].headRefName' 2>/dev/null || true)
fi

# --- Worktrees on merged branches (never the current worktree) ---
worktrees_out=()
wt_path=""
while IFS= read -r line; do
  case "$line" in
    "worktree "*) wt_path="${line#worktree }" ;;
    "branch refs/heads/"*)
      br="${line#branch refs/heads/}"
      if [ -n "${merged[$br]:-}" ] && [ "$wt_path" != "$current_worktree" ]; then
        worktrees_out+=("${wt_path}|${br}")
      fi
      ;;
    "") wt_path="" ;;
  esac
done < <(git worktree list --porcelain 2>/dev/null || true)

# --- Local branches that are merged (never current / default) ---
# A branch checked out in another worktree is still listed here; it is only
# deletable once its worktree is removed, hence the worktree-first ordering in
# the skill's cleanup step.
local_out=()
while IFS= read -r b; do
  [ -z "$b" ] && continue
  [ "$b" = "$default_branch" ] && continue
  [ "$b" = "$current_branch" ] && continue
  [ -n "${merged[$b]:-}" ] && local_out+=("$b")
done < <(git branch --format='%(refname:short)' 2>/dev/null || true)

# --- Remote branches that are merged (never default) ---
remote_out=()
while IFS= read -r b; do
  b="${b#origin/}"
  [ -z "$b" ] && continue
  [ "$b" = "HEAD" ] && continue
  [ "$b" = "$default_branch" ] && continue
  [ -n "${merged[$b]:-}" ] && remote_out+=("$b")
done < <(git branch -r --format='%(refname:short)' 2>/dev/null | grep '^origin/' || true)

# --- Output structured summary ---
echo "DEFAULT_BRANCH=${default_branch}"

total=$(( ${#worktrees_out[@]} + ${#local_out[@]} + ${#remote_out[@]} ))
if [ "$total" -eq 0 ]; then
  echo "NOTHING_TO_CLEAN=true"
  exit 0
fi
echo "NOTHING_TO_CLEAN=false"

echo "WORKTREES:"
for w in "${worktrees_out[@]:-}"; do [ -n "$w" ] && echo "  ${w}"; done

echo "LOCAL_BRANCHES:"
for b in "${local_out[@]:-}"; do [ -n "$b" ] && echo "  ${b}"; done

echo "REMOTE_BRANCHES:"
for b in "${remote_out[@]:-}"; do [ -n "$b" ] && echo "  ${b}"; done

exit 0
