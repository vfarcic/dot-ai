# Stage-Based Question Flow API Design

## Overview
Replace the current `done` parameter and multi-group responses with explicit stage-based workflow validation.

## API Contract

### Request Format
```typescript
{
  "solutionId": "sol_2025-07-02T134102_b665a82ca41d",
  "stage": "required" | "basic" | "advanced" | "open",
  "answers": {
    "questionId": "value",
    // ... more answers for this stage only
  }
}
```

### Response Format
```typescript
{
  "status": "stage_questions" | "ready_for_manifest_generation" | "stage_error",
  "solutionId": "sol_xxx",
  "currentStage": "required" | "basic" | "advanced" | "open",
  "questions": [...], // Only questions for current stage
  "nextStage": "basic" | "advanced" | "open" | null,
  "message": "Stage-specific message",
  "timestamp": "..."
}
```

## Stage Progression Rules

### Valid Transitions
- `required` → `basic`, `open`
- `basic` → `advanced`, `open`  
- `advanced` → `open`
- `open` → (triggers manifest generation)

### Stage Skip Logic
- **Required**: Cannot skip (must have at least one answer)
- **Basic**: Can skip (send `{"stage": "basic", "answers": {}}`)
- **Advanced**: Can skip (send `{"stage": "advanced", "answers": {}}`)
- **Open**: Complete with "N/A" (send `{"stage": "open", "answers": {"open": "N/A"}}`)

### Completion Logic
- Completing the `open` stage triggers manifest generation
- No more `done` parameter or separate `complete` stage needed

## Error Handling

### Stage Mismatch
```typescript
{
  "status": "stage_error",
  "error": "stage_mismatch",
  "expected": "basic",
  "received": "advanced", 
  "message": "You're in 'basic' stage but provided 'advanced'. Complete basic questions first or skip them explicitly."
}
```

### Invalid Transition
```typescript
{
  "status": "stage_error", 
  "error": "invalid_transition",
  "from": "required",
  "to": "advanced",
  "message": "Cannot jump from 'required' to 'advanced'. Must complete 'basic' stage first or skip to 'open'."
}
```

## Implementation Benefits

1. **Code-Only Validation**: No AI needed for workflow logic
2. **Explicit Intent**: Clear distinction between skip vs incomplete
3. **Single Question Group**: Always return one stage at a time
4. **Predictable Flow**: State machine with clear transitions
5. **Better Error Messages**: Specific stage-related feedback

## Breaking Changes

- Remove `done` parameter from answerQuestion
- Add required `stage` parameter (enum: required, basic, advanced, open)
- Remove `complete` stage - completion handled by `open` stage
- Single-group question responses only
- New error response formats

## Migration Path

1. Update answerQuestion tool input schema
2. Implement stage validation logic
3. Replace multi-group responses with single-stage
4. Update all tests
5. Test end-to-end workflow