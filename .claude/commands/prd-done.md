# PRD Done - Complete Implementation Workflow

This command provides instructions for completing a PRD (Product Requirements Document) implementation by creating a branch, pushing changes, creating a PR, and merging.

## Instructions

### 1. Create Branch (if needed)

If you haven't already created a feature branch for this PRD:

```bash
# Create and switch to a new branch
git checkout -b feature/prd-[issue-number]-[brief-description]

# Example:
git checkout -b feature/prd-23-metadata-storage
```

### 2. Update Documentation

Ensure all documentation is current before committing:

```bash
# Check README.md and all linked documentation files
# Update CLAUDE.md if needed for new workflows or patterns
# Update any relevant documentation in docs/ directory
# Ensure inline code comments are comprehensive
# Verify all examples and command references are accurate
```

### 3. Push Changes to Branch

Commit and push your implementation to the branch:

```bash
# Add all changes
git add .

# Commit with descriptive message
git commit -m "feat: implement [PRD feature description]

Implements PRD #[issue-number]: [brief description]

- [Key change 1]
- [Key change 2]
- [Key change 3]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to remote
git push -u origin feature/prd-[issue-number]-[brief-description]
```

### 4. Create Pull Request

Create a PR that references the PRD/issue:

```bash
gh pr create --title "feat: implement [PRD feature description]" --body "$(cat <<'EOF'
## Summary
Implements PRD #[issue-number]: [brief description]

## Changes Made
- [Key change 1]
- [Key change 2]
- [Key change 3]

## Testing
- ✅ All [X] tests passing
- ✅ [Specific test coverage added]
- ✅ [Manual testing completed]

## Documentation
- [Updated documentation files]
- [Added inline code comments]

## Related
- Closes #[issue-number]

🤖 Generated with [Claude Code](https://claude.ai/code)
EOF
)"
```

### 5. Merge Pull Request

After review and approval, merge the PR:

```bash
# If auto-merge is enabled and checks pass, it will merge automatically
# Otherwise, manually merge:
gh pr merge --squash --delete-branch

# Or merge via web interface if preferred
```

### 6. Close PRD/Issue

Close the related issue with completion summary:

```bash
gh issue close [issue-number] --comment "✅ PRD implementation completed successfully.

**Completed in PR:** #[pr-number]

**Key Features Implemented:**
- [Feature 1]
- [Feature 2]
- [Feature 3]

**Testing Status:** All tests passing ([X] total)

**Status:** Ready for production use.

🤖 Generated with [Claude Code](https://claude.ai/code)"
```

## Example Workflow

**Note:** This example shows PRD #23 specifically. Replace the ConfigMap-related details with your actual PRD implementation details.

For PRD issue #23 (Application Metadata Storage System):

```bash
# 1. Create branch
git checkout -b feature/prd-23-metadata-storage

# 2. Update documentation
# (Review README.md, docs/, CLAUDE.md, inline comments, etc.)

# 3. Push changes
git add .
git commit -m "feat: implement application metadata storage system

Implements PRD #23: ConfigMap-based metadata persistence

- Add ConfigMap generation in manifest creation
- Implement user answer extraction utilities
- Add dot-ai labels for resource discovery
- Include comprehensive test coverage

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push -u origin feature/prd-23-metadata-storage

# 4. Create PR
gh pr create --title "feat: implement application metadata storage system" --body "$(cat <<'EOF'
## Summary
Implements PRD #23: ConfigMap-based metadata persistence system

## Changes Made
- ConfigMap generation in manifest creation flow
- User answer extraction utilities
- Dot-ai labels for resource discovery
- Comprehensive test coverage

## Testing
- ✅ All 509 tests passing
- ✅ Added ConfigMap generation tests
- ✅ Validated error handling for missing app names

## Documentation
- Updated solution utilities documentation
- Added inline code comments for metadata functions

## Related
- Closes #23

🤖 Generated with [Claude Code](https://claude.ai/code)
EOF
)"

# 5. Merge PR (after approval)
gh pr merge --squash --delete-branch

# 6. Close issue
gh issue close 23 --comment "✅ PRD implementation completed successfully.

**Completed in PR:** #[pr-number]

**Key Features Implemented:**
- ConfigMap-based metadata persistence
- User answer extraction utilities  
- Dot-ai resource labeling system
- Comprehensive test coverage

**Testing Status:** All tests passing (509 total)

**Status:** Ready for production use.

🤖 Generated with [Claude Code](https://claude.ai/code)"
```

## Tips

- **Use descriptive branch names** that include the PRD/issue number
- **Write clear commit messages** that explain the implementation
- **Reference the PRD/issue** in PR descriptions for traceability
- **Include testing status** in all communications
- **Use consistent formatting** for professional appearance
- **Delete feature branches** after merging to keep repo clean

## Related Commands

- `/prd-start` - Start working on a PRD implementation
- `git status` - Check current branch and changes
- `gh pr list` - View open pull requests
- `gh issue list` - List open issues