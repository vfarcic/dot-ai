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
# Otherwise, manually merge (this deletes the remote branch):
gh pr merge --squash --delete-branch

# Switch to main branch and pull merged changes
git checkout main
git pull origin main

# Delete local branch (if it still exists)
git branch -d feature/prd-[issue-number]-[brief-description]

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