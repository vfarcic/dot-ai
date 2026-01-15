---
name: request-dot-ai-feature
description: Generate a feature request prompt for another dot-ai project. Use when you need a feature implemented in a sibling project (MCP server, controller, etc.) to unblock work in the current project.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Request Feature in dot-ai Project

Write a feature request to a file in the target dot-ai project's tmp directory. The user will review and approve the write operation.

## Projects

| Project | Directory | Description |
|---------|-----------|-------------|
| dot-ai | `../dot-ai` | Main MCP server (API endpoints, tools, handlers) |
| dot-ai-ui | `../dot-ai-ui` | Web UI for visualizations and dashboard |
| dot-ai-controller | `../dot-ai-controller` | Kubernetes controller |
| dot-ai-stack | `../dot-ai-stack` | Stack deployment configs |
| dot-ai-website | `../dot-ai-website` | Documentation website |

**Important:** Do NOT use this skill to request features in the project you're currently working in. Just implement them directly.

## Process

1. Determine the target project from the user's request
2. **Delete any existing feature-request.md** in the target project's tmp directory (so the diff only shows new content)
3. Write the feature request to: `../[target-project]/tmp/feature-request.md`
4. Tell the user to open the target project and run `/process-feature-request`

## File Format

Write the feature request file with this content:

```markdown
# Feature Request from [CURRENT_PROJECT]

**Requesting project directory:** ../[current-project]

## What We Need

[DESCRIPTION OF WHAT WE NEED AND WHY]

## Our Suggestion

(You decide the best approach)

- [Suggested approach or implementation idea]

## Context

[What this unblocks in our project]

## Notes

You're the expert on this codebase. Feel free to implement this differently if there's a better approach, or push back if this doesn't make sense.

## Response Instructions

After implementing this feature, write a response file to help the requesting project integrate:

1. Write to: `../[requesting-project]/tmp/feature-response.md`
2. Include: what was implemented, how to use it (API signatures, endpoints, types), and any usage examples
```

## Guidelines

1. Describe what you need and why, not how to implement it
2. Suggestions are just suggestions - the receiving agent decides the approach
3. The receiving agent is the authority on their codebase
4. Keep the request focused on the problem, not the solution
5. The user will review the write operation before it's accepted
