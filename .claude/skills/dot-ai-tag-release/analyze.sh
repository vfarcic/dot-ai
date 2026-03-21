#!/usr/bin/env bash
set -euo pipefail

# Analyze changelog fragments and propose a semantic version bump.
# This script is read-only — it never creates commits, tags, or pushes.

CHANGELOG_DIR="changelog.d"

# --- Check for pending fragments ---

if [ ! -d "$CHANGELOG_DIR" ]; then
  echo "NO_FRAGMENTS=true"
  echo "MESSAGE=No changelog.d/ directory found. Nothing to release."
  exit 0
fi

fragments=()
while IFS= read -r -d '' f; do
  fragments+=("$(basename "$f")")
done < <(find "$CHANGELOG_DIR" -maxdepth 1 -name '*.md' -not -name '.gitkeep' -print0 | sort -z)

if [ ${#fragments[@]} -eq 0 ]; then
  echo "NO_FRAGMENTS=true"
  echo "MESSAGE=No changelog fragments found. Nothing to release."
  exit 0
fi

# --- Get current version ---

current_version=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname 2>/dev/null | head -1)
if [ -z "$current_version" ]; then
  current_version="v0.0.0"
fi

# Validate and parse semver with regex
version="${current_version#v}"
if [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  major="${BASH_REMATCH[1]}"
  minor="${BASH_REMATCH[2]}"
  patch="${BASH_REMATCH[3]}"
else
  echo "ERROR=true"
  echo "MESSAGE=Current tag '${current_version}' is not valid semver. Cannot determine version."
  exit 0
fi

# --- Analyze fragment types ---

has_breaking=false
has_feature=false
has_bugfix=false

for frag in "${fragments[@]}"; do
  case "$frag" in
    *.breaking.md) has_breaking=true ;;
    *.feature.md)  has_feature=true ;;
    *.bugfix.md)   has_bugfix=true ;;
  esac
done

# --- Calculate next version ---

if $has_breaking; then
  bump_type="major"
  proposed_version="v$(( major + 1 )).0.0"
elif $has_feature; then
  bump_type="minor"
  proposed_version="v${major}.$(( minor + 1 )).0"
elif $has_bugfix; then
  bump_type="patch"
  proposed_version="v${major}.${minor}.$(( patch + 1 ))"
else
  bump_type="patch"
  proposed_version="v${major}.${minor}.$(( patch + 1 ))"
fi

# --- Check HEAD for skip-ci ---

head_message=$(git log -1 --format="%s" HEAD 2>/dev/null || echo "")
skip_ci=false
if echo "$head_message" | grep -qiE '\[(skip ci|ci skip|no ci)\]'; then
  skip_ci=true
fi

# --- Output structured summary ---

echo "CURRENT_VERSION=${current_version}"
echo "PROPOSED_VERSION=${proposed_version}"
echo "BUMP_TYPE=${bump_type}"
echo "SKIP_CI=${skip_ci}"
echo "FRAGMENTS:"
for frag in "${fragments[@]}"; do
  echo "  ${frag}"
done
