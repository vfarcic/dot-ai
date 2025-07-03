# Tests Reminder

Remind Claude about testing requirements when making code changes.

## Reminder for Claude

**🔴 BEFORE MARKING ANY TASK/SUBTASK AS COMPLETE:**

□ **Tests Written**: Have you written tests for new functionality?
□ **All Tests Pass**: Have you run `npm test` to ensure all 562+ tests pass?
□ **No Test Failures**: Are there any failing tests that need to be fixed?

**❌ TASK IS NOT COMPLETE IF:**
- Any tests are failing
- New code lacks test coverage  
- You haven't run `npm test` to verify

## Required Actions

1. **Write/Update Tests**: For any new functionality or code changes
2. **Run All Tests**: Execute `npm test` to verify everything passes
3. **Fix Failures**: Address any test failures before proceeding
4. **Update CLAUDE.md**: Check if documentation needs updates

## Testing Commands

```bash
npm test                    # Run all tests (562+ tests across 21 suites)
npm run build              # Build project
```

**Remember**: Changes are only considered successful when validated by passing tests!