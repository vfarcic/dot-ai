---
title: "Fetch Open GitHub Issues with PRD Label"
description: "Fetch all open GitHub issues from this project that have the 'PRD' label"
---

# Fetch Open GitHub Issues with PRD Label

Please fetch all open GitHub issues from this project repository that have the label "PRD". 

Use the `gh` command to:
1. Get the current repository information
2. List all open issues with the "PRD" label
3. Display the results in a readable format showing:
   - Issue number
   - Title
   - Created date
   - Author

Commands to run:
```bash
!gh repo view --json owner,name
!gh issue list --label "PRD" --state open --json number,title,createdAt,author
```

Format the output in a clear, readable way for easy review of all open PRD-related issues.