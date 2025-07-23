---
name: tests-reminder
description: Remind about testing requirements when making code changes
category: development
---

# Testing Requirements Reminder

⚠️ **MANDATORY TESTING CHECKLIST** ⚠️

Before marking any task or implementation as complete, you MUST:

## 1. Write Tests
- [ ] Unit tests for new functions/methods
- [ ] Integration tests for new features
- [ ] End-to-end tests for user workflows
- [ ] Error handling tests for edge cases

## 2. Run All Tests
```bash
npm test
```
**ALL tests must pass** - no exceptions.

## 3. Test Coverage
- [ ] New code has appropriate test coverage
- [ ] Tests validate the actual functionality
- [ ] Tests cover both success and failure scenarios

## 4. Update CLAUDE.md
- [ ] Update project instructions if new patterns/standards introduced
- [ ] Document any new testing approaches or requirements

## ❌ TASK IS NOT COMPLETE IF:
- Any tests are failing
- New code lacks test coverage
- You haven't run `npm test` to verify
- Tests don't actually validate the intended functionality

**Remember: Code without tests is not production-ready code.**