# PRD #376: Retire Legacy Collection Migration

**Status**: Planning
**Created**: 2026-02-16
**GitHub Issue**: [#376](https://github.com/vfarcic/dot-ai/issues/376)
**Priority**: Low
**Owner**: TBD
**Last Updated**: 2026-02-16
**Depends On**: PRD #375 (Unified Knowledge Base)

---

## Problem Statement

PRD #375 (Unified Knowledge Base) adds auto-migration code at server init that detects legacy `policies` and `patterns` Qdrant collections and migrates their content into the unified `knowledge-base` collection. This migration code runs on every startup (as a no-op once migration is complete) and should be removed after sufficient time has passed for all users to upgrade.

---

## Solution

Remove the migration check and related code from server initialization. This is a simple cleanup task.

**Target**: ~6 months after PRD #375 is released to production.

---

## Milestones

### Milestone 1: Remove Migration Code
**Goal**: Clean up server init by removing legacy migration

- [ ] Remove migration check for `policies` and `patterns` collections from server init
- [ ] Remove any migration utility functions
- [ ] Update integration tests that cover migration
- [ ] Update PRD #375 work log to note migration retirement

**Success Criteria**: Server init no longer references legacy collections; all tests pass

---

## Work Log

### 2026-02-16: PRD Creation
**Status**: Planning

**Completed Work**:
- Created PRD as a follow-up to PRD #375

**Next Steps**:
- Wait for PRD #375 to be implemented and released
- Schedule this work ~6 months after PRD #375 release
