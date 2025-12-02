---
name: prds-get
description: Fetch all open GitHub issues from this project that have the 'PRD' label
category: project-management
---

# Get All PRDs

Fetch all open GitHub issues from this project that have the 'PRD' label.

**Note**: If any `gh` command fails with "command not found", inform the user that GitHub CLI is required and provide the installation link: https://cli.github.com/

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

3. **Meaningful Categorization**: Group PRDs by their actual purpose and impact, not generic labels:
   - **Architecture & Infrastructure**: Core system changes, API designs, major refactors
   - **User Experience**: Features that directly impact how users interact with the system
   - **Developer Experience**: Tools, workflows, testing, documentation that help developers
   - **AI & Intelligence**: Machine learning, AI-powered features, recommendation engines
   - **Operations & Monitoring**: Deployment, scaling, observability, performance
   - **Integration & Extensibility**: Third-party integrations, plugin systems, APIs
   
   Each category should briefly explain what the PRDs in that group will accomplish for users or the system.

4. **Priority Analysis**: If multiple PRDs exist, help identify:
   - Which PRDs are most recently updated or have active discussion
   - Which PRDs have dependencies on other PRDs
   - Which PRDs are foundational vs. incremental improvements
   - Which PRDs might be blocked or need clarification

5. **Next Steps Suggestion**: Based on the PRD list, suggest logical next actions:
   - Which PRD to work on next based on dependencies and impact
   - PRDs that need attention, updates, or clarification
   - Opportunities for parallel work on independent PRDs

This provides a complete view of all active product requirements and helps with project planning and prioritization.