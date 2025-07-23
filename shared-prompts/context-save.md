---
name: context-save
description: Save current context to tmp/context.md for session continuity
category: session-management
---

# Save Context

Save current context to tmp/context.md for session continuity.

Steps:
1. Clear existing context: Delete or empty tmp/context.md if it exists to ensure fresh state
2. Analyze the current state of work, tasks completed, and next steps
3. Create a comprehensive context summary including:
   - Current status and what was accomplished
   - Technical implementation details
   - Test data and file locations
   - Manual testing instructions
   - Expected results and next steps
   - Design decisions and architecture notes
4. Save the fresh context to `tmp/context.md`
5. Confirm the context has been saved successfully

This ensures each context save represents only the current session state, preventing confusion from stale information and keeping context files manageable.