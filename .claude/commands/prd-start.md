---
title: "Start Working on a PRD"
description: "Interactive workflow to start working on a Product Requirements Document (PRD) issue using Taskmaster MCP for task management"
---

# Start Working on a PRD

Interactive workflow to start working on a Product Requirements Document (PRD) issue with structured design discussion, GitHub issue management, and Taskmaster MCP task breakdown.

## Workflow Steps:

### 1. PRD Selection
- Ask user which PRD issue they want to work on (provide issue number)
- Fetch the selected PRD issue details using: `gh issue view <issue_number> --json title,body,number,url`
- Display the PRD content for review

### 2. Design Discussion
- Engage in detailed design discussion about the PRD
- Explore technical approaches, architecture decisions, and implementation strategies
- Discuss trade-offs, dependencies, and potential challenges
- Clarify requirements and acceptance criteria
- Document key design decisions

### 3. GitHub Issue Update
- Update the GitHub issue body with design decisions and approach
- Replace or enhance the original PRD content with current decisions
- Keep PRDs up-to-date with architectural changes and design decisions
- Use: `gh issue edit <issue_number> --body "Updated PRD content with design decisions"`
- Rationale: Issue body should be single source of truth, not scattered in comments

### 4. Task Breakdown Decision
- Ask user: "Should we break this PRD into smaller tasks or work on it directly?"
- If tasks are needed: proceed to Taskmaster task creation workflow
- If working directly: skip to implementation phase

### 5. Taskmaster Task Creation (if chosen)
- Create a Taskmaster project for the PRD: `PRD-{issue_number}: {title}`
- Collaborate with user to identify specific tasks/subtasks
- For each task, discuss:
  - Task description and scope
  - Acceptance criteria
  - Dependencies on other tasks
  - Estimated complexity
- Create tasks in Taskmaster with proper hierarchy and dependencies
- Link tasks to the parent PRD GitHub issue in task descriptions

### 6. Implementation Planning
- If no tasks: plan direct implementation approach
- If tasks exist: discuss which task to start with first using Taskmaster task management
- Set up todo list for tracking progress
- Establish success criteria and testing approach

### 7. Begin Work
- Start implementation (either on full PRD or first Taskmaster task)
- Use Taskmaster to track task progress and dependencies
- Use TodoWrite to track implementation progress within tasks
- Follow test-driven development principles
- Regular check-ins on progress using Taskmaster status updates

## Implementation Guidelines:

- **Always follow CLAUDE.md instructions** for testing and validation
- **Write tests first** before implementation
- **Update documentation** as features are developed
- **Use Taskmaster** to track task progress and dependencies
- **Use TodoWrite** to track implementation progress within tasks
- **Mark Taskmaster tasks as done** when completed
- **Update GitHub PRD issue** with final implementation status
- **Commit frequently** with descriptive messages

## Exit Conditions:

- PRD is fully implemented and tested
- All Taskmaster tasks (if any) are completed and closed
- GitHub PRD issue is updated with final status
- Documentation is updated
- All tests pass
- Code is committed and pushed

## Notes:

- This workflow ensures structured approach to PRD development
- Maintains clear communication through GitHub issue tracking for PRDs
- Uses Taskmaster MCP for hierarchical task management and dependencies
- Supports both direct implementation and task-based breakdown
- Follows project quality standards and testing requirements
- Separates concerns: GitHub for PRD management, Taskmaster for task execution