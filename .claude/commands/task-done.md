# Task Done - Complete Task Validation and Submission

Validate that the current development task is complete and ready for submission.

## Steps:

1. **Get Current Task**: 
   - Identify the current task being worked on from user context
   - If unclear, ask user which task they want to validate as complete

2. **Validate Task Completion**:
   - Review the task requirements and implementation details
   - Verify all acceptance criteria are met
   - Check that implementation matches the task description

3. **Ensure Test Coverage**:
   - Identify all code files that were modified for this task
   - Verify that tests exist for all new/modified functionality
   - Check test file organization matches source code structure
   - If tests are missing, write them before proceeding

4. **Update All Relevant Documentation**:
   - **README.md**: CLI commands, workflow examples, installation steps
   - **docs/API.md**: New interfaces, MCP tools, TypeScript examples
   - **docs/MANUAL_TESTING.md**: Testing procedures for new functionality
   - **docs/STAGE_BASED_API.md**: Workflow changes, API updates
   - **docs/DEVELOPMENT.md**: Architecture updates, new components
   - **Other docs**: Context, design, next steps as applicable
   - Never skip documentation updates for new functionality

5. **Run Full Test Suite**:
   - Execute `npm test` (unit tests) - ALL tests must pass
   - Execute `npm run test:integration` (integration tests) - ALL tests must pass
   - If any tests fail, fix them before proceeding

6. **Mark Task Complete**:
   - Update task status in your project management system
   - Update any subtasks that are also complete

7. **Commit and Push Changes**:
   - Run `git status` to see all changes
   - Run `git diff` to review changes
   - Create a descriptive commit message referencing the task
   - Commit all changes with proper message format
   - Push changes to GitHub

8. **Summary Report**:
   - Provide summary of what was completed
   - List files modified, tests added, and documentation updated
   - Confirm task is marked as done
   - Confirm changes are pushed to GitHub

## Validation Criteria:

- ✅ Task requirements fully implemented
- ✅ All new/modified code has test coverage
- ✅ All relevant documentation updated
- ✅ All unit tests pass (npm test)
- ✅ All integration tests pass (npm run test:integration)
- ✅ Task marked as done
- ✅ Changes committed and pushed to GitHub

## Exit Conditions:

- If task is not actually complete, provide specific feedback on what needs to be finished
- If tests are failing, fix the failures before marking task as done
- If critical functionality is missing tests, write tests before proceeding
- If documentation is outdated or missing for new functionality, update all relevant docs
- Never mark a task as done if any validation criteria are not met

## Notes:

- This command ensures comprehensive task completion following CLAUDE.md guidelines
- Maintains the high quality standards established in the project
- Follows the test-driven development approach required by the project
- Ensures proper task tracking and version control practices