# Task Done - Complete Task Validation and Submission

Validate that the current Taskmaster task is complete and ready for submission using Taskmaster MCP tools.

## Steps:

1. **Get Current Task**: 
   - Use `mcp__taskmaster-ai__next_task` to identify the current task being worked on
   - If no task in progress, ask user which task they want to mark as done

2. **Validate Task Completion**:
   - Review the task requirements and implementation details
   - Verify all acceptance criteria are met
   - Check that implementation matches the task description

3. **Ensure Test Coverage**:
   - Identify all code files that were modified for this task
   - Verify that tests exist for all new/modified functionality
   - Check test file organization matches source code structure
   - If tests are missing, write them before proceeding

4. **Run Full Test Suite**:
   - Execute `npm test` (unit tests) - ALL tests must pass
   - Execute `npm run test:integration` (integration tests) - ALL tests must pass
   - If any tests fail, fix them before proceeding

5. **Mark Task Complete**:
   - Use `mcp__taskmaster-ai__set_task_status` to mark task as complete
   - Update any subtasks that are also complete

6. **Commit and Push Changes**:
   - Run `git status` to see all changes
   - Run `git diff` to review changes
   - Create a descriptive commit message referencing the task
   - Commit all changes with proper message format
   - Push changes to GitHub

7. **Summary Report**:
   - Provide summary of what was completed
   - List files modified and tests added
   - Confirm task is marked as done in Taskmaster
   - Confirm changes are pushed to GitHub

## Validation Criteria:

- ✅ Task requirements fully implemented
- ✅ All new/modified code has test coverage
- ✅ All unit tests pass (npm test)
- ✅ All integration tests pass (npm run test:integration)
- ✅ Task marked as done in Taskmaster
- ✅ Changes committed and pushed to GitHub

## Exit Conditions:

- If task is not actually complete, provide specific feedback on what needs to be finished
- If tests are failing, fix the failures before marking task as done
- If critical functionality is missing tests, write tests before proceeding
- Never mark a task as done if any validation criteria are not met

## Notes:

- This command ensures comprehensive task completion following CLAUDE.md guidelines
- Maintains the high quality standards established in the project
- Follows the test-driven development approach required by the project
- Ensures proper task tracking and version control practices