---
name: prds-get
description: Fetch all open GitHub issues from this project that have the 'PRD' label
category: project-management
---

# Get All PRDs

Fetch all open GitHub issues from this project that have the 'PRD' label.

## Process

1. **Fetch Issues**: Use GitHub CLI to get all open issues with PRD label
   ```bash
   gh issue list --label PRD --state open --json number,title,url,labels,assignees,createdAt,updatedAt
   ```

2. **Format Results**: Present the issues in a clear, organized format showing:
   - Issue number and title
   - Creation and last update dates  
   - Current assignees (if any)
   - Direct link to the issue
   - PRD file link (if available in issue description)

3. **Priority Analysis**: If multiple PRDs exist, help identify:
   - Which PRDs are most recently updated
   - Which PRDs have active work in progress
   - Which PRDs might be blocked or stalled

4. **Next Steps Suggestion**: Based on the PRD list, suggest logical next actions:
   - Which PRD to work on next
   - PRDs that need attention or updates
   - Opportunities for parallel work

This provides a complete view of all active product requirements and helps with project planning and prioritization.