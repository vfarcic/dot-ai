# PRD #348: Reduce Excessive Logging

**Status:** Complete

## Implementation Notes

Initial implementation in PR #350 was abandoned due to file overlap with PRD #343. Final implementation completed with all requirements met:

### What Was Implemented

1. **Circuit breaker log suppression** (`src/core/circuit-breaker.ts`):
   - Added `lastCircuitOpenLogTime` tracking
   - Logs "circuit open" only once per open period, not per request

2. **Resource sync handler batching** (`src/interfaces/resource-sync-handler.ts`):
   - Added `circuitBreakerSkipped` counter and `circuitBreakerLoggedOnce` flag
   - Catches `CircuitOpenError`, logs once, counts skipped resources
   - Logs summary at end with total skipped count

3. **Removed per-resource progress logs** (`src/core/capability-scan-workflow.ts`)

4. **Command executor verbosity reduced** (`src/core/command-executor.ts`):
   - Changed per-command logs from INFO to DEBUG

### Unit Tests Written

Tests were created in:
- `tests/unit/core/circuit-breaker.test.ts` - Log suppression behavior
- `tests/unit/core/command-executor.test.ts` - Summary logging

### CodeRabbit Feedback to Address

**Important:** When circuit breaker skips resources, surface this in the response so the caller knows to retry:

```typescript
if (circuitBreakerSkipped > 0) {
  logger.warn('Resource sync skipped resources due to circuit breaker', {
    requestId,
    skippedCount: circuitBreakerSkipped,
    totalUpserts: upserts.length,
    totalDeletes: deletes.length
  });
  // ADD THIS: Surface to caller so they know to retry
  failures.push({
    id: 'circuit-breaker',
    error: `Skipped ${circuitBreakerSkipped} resource(s) due to circuit breaker open`
  });
}
```

### Changelog Fragment

Ready to use in `changelog.d/348.bugfix.md`:

```markdown
## Reduced Excessive Logging During Circuit Breaker Events

Fixed excessive log spam that occurred when the embedding API circuit breaker was open, which previously generated 130MB+ of logs within minutes from a single container. This caused log storage to fill rapidly, overwhelmed log aggregation systems (triggering Loki rate limiting), and made it difficult to find important logs.

The circuit breaker now logs "circuit open" warnings only once per open period instead of for every blocked request. Resource sync operations batch circuit breaker failures and log a summary count rather than individual warnings per resource. Per-resource progress logs during capability scans have been removed since progress is available via the dedicated progress endpoint. Command executor logging has been reduced to summary-level output.

These changes reduce log volume by 99%+ during circuit breaker scenarios while preserving all operationally important information.
```

---

## Problem Statement

When the embedding API circuit breaker is open, the MCP server logs warnings for **every single resource** it tries to sync, creating massive log spam (130MB+ in minutes). Additionally, an audit revealed other excessive logging patterns throughout the codebase.

**Impact:**
- Fill up log storage (130MB+ in minutes from single container)
- Overwhelm log aggregation systems (Loki rate limiting)
- Make it hard to find important logs
- Had to exclude container from log collection as workaround

**Related Issue:** #346

## Root Causes Identified

### Primary Issue: Circuit Breaker Log Spam

**Two sources of spam when circuit is open:**

1. **circuit-breaker.ts:117-119** - Logs "Circuit is open, blocking request" for EVERY blocked request
2. **resource-sync-handler.ts:386-390** - Logs "Failed to upsert resource" for EVERY failed upsert

With 353+ watched resource types and many resources per type, this creates thousands of identical log entries.

### Secondary Issues: Other Excessive Logging

| File | Lines | Severity | Issue |
|------|-------|----------|-------|
| resource-sync-handler.ts | 376-381, 400-403 | HIGH | Per-item success debug logs in upsert/delete loops |
| capability-scan-workflow.ts | 675-680, 703-709 | HIGH | Per-resource progress INFO logs (2x per resource) |
| command-executor.ts | 61-65, 81-84 | MEDIUM | Per-command execution INFO logs |

## Solution Overview

1. **Circuit Breaker**: Suppress repeated "circuit open" logs - only log once per open period
2. **Resource Sync Handler**: Batch circuit breaker failures and log summary instead of per-resource
3. **Remove Per-Item Success Logs**: Remove debug logs for individual resource upserts/deletes
4. **Remove Per-Resource Progress Logs**: Remove INFO logs from capability scan (progress endpoint exists)
5. **Command Executor**: Change per-command logs to DEBUG, add summary log

## Technical Design

### 1. Circuit Breaker: Suppress Repeated Logs

**File:** `src/core/circuit-breaker.ts`

Add tracking for when we last logged "circuit open" and only log once per open period:

```typescript
// Add to CircuitBreaker class
private lastCircuitOpenLogTime?: Date;

// In execute() method, replace lines 117-120:
if (!this.canExecute()) {
  const remainingCooldown = this.getRemainingCooldown();

  // Only log once per circuit open period
  if (!this.lastCircuitOpenLogTime ||
      this.lastCircuitOpenLogTime < this.openedAt!) {
    this.logger.warn(`Circuit '${this.name}' is open, blocking requests`, {
      remainingCooldownMs: remainingCooldown,
      willRetryAt: new Date(Date.now() + remainingCooldown).toISOString()
    });
    this.lastCircuitOpenLogTime = new Date();
  }

  throw new CircuitOpenError(this.name, remainingCooldown);
}
```

### 2. Resource Sync Handler: Batch Circuit Breaker Failures

**File:** `src/interfaces/resource-sync-handler.ts`

Detect circuit breaker errors, count them, and log a summary:

```typescript
// Add tracking variables after line 310
let circuitBreakerFailures = 0;
let circuitBreakerErrorLogged = false;

// In the upsert loop catch block, detect and batch circuit breaker errors
// Log once about circuit being open, count subsequent failures
// After loop, log summary of skipped resources
```

### 3. Remove Per-Item Success Debug Logs

**File:** `src/interfaces/resource-sync-handler.ts`

Remove debug logs at lines 376-381 and 400-403. Summary logs at start and end are sufficient.

### 4. Remove Per-Resource Progress Logs

**File:** `src/core/capability-scan-workflow.ts`

Remove INFO logs at lines 675-680 and 703-709. Progress is tracked via `progress` endpoint.

### 5. Reduce Command Executor Verbosity

**File:** `src/core/command-executor.ts`

- Change per-command logs (lines 61-65, 81-84) from INFO to DEBUG
- Add summary log at end: "Executed X commands: Y succeeded, Z failed"

## Files to Modify

1. `src/core/circuit-breaker.ts` - Add log suppression for repeated "circuit open" warnings
2. `src/interfaces/resource-sync-handler.ts` - Batch circuit breaker failures, remove per-item success logs
3. `src/core/capability-scan-workflow.ts` - Remove per-resource progress logs
4. `src/core/command-executor.ts` - Reduce to summary logging

## Milestones

- [x] Circuit breaker log suppression implemented and tested
- [x] Resource sync handler batches circuit breaker failures with summary logging
- [x] Per-item success debug logs removed from resource sync
- [x] Per-resource progress logs removed from capability scan
- [x] Command executor uses summary logging instead of per-command
- [x] All existing tests pass
- [x] New unit tests added for log suppression behavior

## Testing

### Unit Tests
- `tests/unit/core/circuit-breaker.test.ts` - Add test for log suppression behavior

### Integration Tests
- `tests/integration/tools/resource-sync.test.ts` - Verify sync still works correctly

### Verification Steps
1. Run `npm run test:unit` - all tests pass
2. Run `npm run test:integration` - all tests pass
3. Manual verification:
   - Start MCP server with embedding API unavailable
   - Trigger resource sync with multiple resources
   - Verify logs show single "circuit breaker open" message, not per-resource spam
   - Verify summary shows count of skipped resources

## Success Criteria

- Circuit breaker "open" warning logged only once per open period (not per request)
- Resource sync logs summary of skipped resources, not individual warnings
- Log volume reduced by 99%+ during circuit breaker open scenarios
- All existing tests pass
- New tests added for log suppression behavior

## Out of Scope

- Logger class refactoring (no rate limiting in Logger itself)
- Log aggregation configuration changes
- Other circuit breaker implementations
