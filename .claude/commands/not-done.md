# Test Completion Reminder

⚠️ **MANDATORY TASK COMPLETION CHECKLIST** ⚠️

**🔴 A FEATURE OR TASK IS NOT DONE UNTIL:**

□ **Tests Written**: Write tests for new functionality (can be after implementation)
□ **All Tests Pass**: Run `npm test` - ALL tests must pass  
□ **No Test Failures**: Fix any failing tests before proceeding
□ **CLAUDE.md Updated**: Update CLAUDE.md if new features/commands/structure added

**❌ TASK IS NOT COMPLETE IF:**
- Any tests are failing
- New code lacks test coverage  
- You haven't run `npm test` to verify

**🛑 CURRENT STATUS CHECK:**
Run these commands to verify completion:

```bash
npm run build    # Must compile without errors
npm test         # Must show ALL tests passing
```

**📋 TEST ORGANIZATION:**
- Follow mirrored structure: `src/core/index.ts` → `tests/core.test.ts` 
- Keep integration tests in `tests/integration/`
- Current standard: 360+ tests across 11 suites

**🎯 REMEMBER:**
- Implementation → Tests → `npm test` → Mark complete
- Never claim "done" with failing tests
- Testing validates that changes actually work

**Based on permanent instructions in CLAUDE.md**