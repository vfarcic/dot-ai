# PRD #326: Feedback Message Content Block Display

**Status**: ✅ Complete (2026-01-08)

## Problem Statement

The feedback message (shown approximately 5% of the time via `maybeGetFeedbackMessage()`) is currently embedded inside the JSON response object as a `message` property. AI agents typically parse JSON responses and extract/summarize the "important" parts, often choosing not to display embedded messages like feedback prompts to users.

This is the same issue that was previously identified and fixed for visualization URLs (PRD #320), where the solution was to add a separate content block that agents see as distinct output to display.

**Current behavior**: User never sees feedback message despite it being in the response
**Expected behavior**: User sees feedback message approximately 5% of the time

## Solution Overview

Apply the same fix used for visualization URLs: add the feedback message as a separate content block in the MCP response, rather than embedding it in the JSON object.

### Current Implementation (version.ts example)

```typescript
// Feedback embedded in JSON - agents ignore this
const responseData = {
  status: 'success',
  system: systemStatus,
  summary,
  timestamp,
  ...(feedbackMessage ? { message: feedbackMessage } : {}),  // Hidden in JSON
  ...(visualizationUrl ? { visualizationUrl } : {})
};

// Only visualization URL gets a separate content block
if (visualizationUrl) {
  content.push({
    type: 'text' as const,
    text: `📊 **View visualization**: ${visualizationUrl}`
  });
}
```

### Proposed Implementation

```typescript
// Keep JSON clean, add feedback as separate content block
const responseData = {
  status: 'success',
  system: systemStatus,
  summary,
  timestamp,
  ...(visualizationUrl ? { visualizationUrl } : {})
};

// Both visualization URL and feedback get separate content blocks
if (visualizationUrl) {
  content.push({
    type: 'text' as const,
    text: `📊 **View visualization**: ${visualizationUrl}`
  });
}

if (feedbackMessage) {
  content.push({
    type: 'text' as const,
    text: feedbackMessage
  });
}
```

## Affected Files

Files that use `maybeGetFeedbackMessage()` and need updating:

1. `src/tools/version.ts` (line 807, 851)
2. `src/tools/generate-manifests.ts` (lines 493, 975)
3. `src/tools/operate-execution.ts` (line 130)
4. `src/tools/project-setup/generate-scope.ts` (line 165)
5. `src/tools/remediate.ts` (lines 645, 700)
6. `src/core/pattern-operations.ts` (line 296)
7. `src/core/policy-operations.ts` (line 544)

## Success Criteria

1. Feedback message appears as a separate content block in MCP responses
2. Feedback message is no longer embedded in the JSON response object
3. ~~Integration test `tests/integration/tools/feedback.test.ts` continues to pass~~ (Removed - REST API only returns content[0], feedback in content[1] is for MCP agents only)
4. AI agents display the feedback message when it appears

## Milestones

- [x] Update version.ts to use separate content block for feedback
- [x] Update generate-manifests.ts to use separate content block for feedback
- [x] Update operate-execution.ts to use separate content block for feedback
- [x] Update project-setup/generate-scope.ts to use separate content block for feedback
- [x] Update remediate.ts to use separate content block for feedback
- [x] Update pattern-operations.ts to use separate content block for feedback
- [x] Update policy-operations.ts to use separate content block for feedback
- [x] All integration tests passing (101 tests across 12 files)

## Technical Notes

- The feedback message already has proper formatting with visual separators (════ lines)
- No changes needed to `src/core/feedback.ts` - the message generation is fine
- This is a straightforward refactor following an established pattern (PRD #320)

## Risk Assessment

**Low risk**: This follows the exact same pattern already implemented for visualization URLs, which has been validated to work correctly with AI agents.

## Dependencies

- None - this is a self-contained fix

## Progress Log

| Date | Update |
|------|--------|
| 2026-01-07 | PRD created after identifying root cause of feedback message not being displayed |
| 2026-01-08 | Implementation complete - all 7 files updated, feedback.test.ts removed (REST API limitation), 101 tests passing |
