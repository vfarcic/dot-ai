# PRD Done - Cleanup and Close Issue

This command provides instructions for completing a PRD (Product Requirements Document) implementation by cleaning up tasks and closing the associated GitHub issue.

## Instructions

### 1. Remove Taskmaster Tasks

I'll use MCP tools to clean up completed tasks from the current PRD:

**Option A: Remove all completed tasks (recommended)**
```
Use mcp__taskmaster__get_tasks with status="done" to list completed tasks, then use mcp__taskmaster__remove_task for each completed task ID.
```

**Option B: Remove all tasks if project is complete**
```
Use mcp__taskmaster__get_tasks to list all tasks, then use mcp__taskmaster__remove_task to remove each task ID.
```

**Option C: Remove specific tasks**
```
Use mcp__taskmaster__remove_task with specific task IDs that are no longer needed.
```

### 2. Close Associated GitHub Issue

Use the GitHub CLI to close the issue where the PRD originated:

```bash
# Close the issue with a completion comment
gh issue close <issue-number> --comment "✅ PRD implementation completed successfully.

**Completed Features:**
- [Brief summary of implemented features]

**Deliverables:**
- [List key deliverables like packages, workflows, etc.]

**Status:** Ready for production use.

🤖 Generated with [Claude Code](https://claude.ai/code)"
```

### 3. Optional: Create Summary Comment

Before closing, optionally add a detailed summary:

```bash
gh issue comment <issue-number> --body "## PRD Implementation Summary

### ✅ Completed Tasks
- Task 1: [Description]
- Task 2: [Description]
- Task N: [Description]

### 📦 Deliverables
- [Package/Feature 1]: Available at [link/version]
- [Package/Feature 2]: [Description]

### 🔗 Related Resources
- Documentation: [link]
- Repository: [link]
- CI/CD Pipeline: [link]

### 🚀 Next Steps
- [Any follow-up items or related PRDs]

Implementation completed successfully! 🎉"
```

## Example Workflow

For PRD issue #11 (npm package distribution):

1. **Clean up taskmaster tasks using MCP tools**
2. **Add completion summary to GitHub issue**
3. **Close the GitHub issue**

```bash
gh issue comment 11 --body "## ✅ NPM Package Distribution - Implementation Complete

### Deliverables
- **Package**: @vfarcic/dot-ai@0.3.0 published to npm
- **Global Install**: \`npm install -g @vfarcic/dot-ai\`
- **npx Support**: \`npx @vfarcic/dot-ai --version\`
- **CI/CD**: Automated minor version increments and publishing
- **Security**: CodeQL analysis and dependency audits

### Testing Verified
- ✅ 385 tests passing (75 skipped integration tests)
- ✅ npm package distribution working
- ✅ MCP server compatibility maintained
- ✅ CLI functionality preserved

Ready for production use! 🚀"

gh issue close 11 --comment "PRD #11 implementation completed and deployed successfully. Package available at https://www.npmjs.com/package/@vfarcic/dot-ai"
```

## Tips

- **Always verify completion** before closing issues
- **Use MCP tools** for task management instead of CLI commands
- **Document deliverables** clearly for future reference  
- **Link to deployed resources** (packages, docs, etc.)
- **Mention any follow-up work** or related PRDs
- **Use consistent formatting** for professional appearance

## Related Commands

- `/prd-start` - Start working on a PRD issue
- Use MCP `mcp__taskmaster__get_tasks` - View current taskmaster tasks
- `gh issue list` - List open issues
- `gh issue view <number>` - View specific issue details