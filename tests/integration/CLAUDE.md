# Integration Tests - Claude Code Integration Guide

## ⚠️ CRITICAL INTEGRATION TESTING PRINCIPLES ⚠️

**🔴 BEFORE WRITING ANY INTEGRATION TEST:**

□ **Eliminate Redundancy**: Always check if functionality is already covered by existing tests
□ **One Comprehensive Test**: Prefer one complete workflow test over multiple fragmented tests
□ **Consistent Validation**: Use `toMatchObject` pattern throughout - no mixed assertion styles
□ **Specific Assertions**: Use actual values instead of `expect.any()` wherever possible
□ **Race Condition Safety**: Use `beforeAll` for cleanup, unique test data, avoid parallel data conflicts

**🔴 RUNNING INTEGRATION TESTS IN CLAUDE CODE:**

Integration tests take several minutes to complete. When running via Claude Code Bash tool:
- Use higher timeout: `timeout: 600000` (10 minutes) in Bash tool calls
- Or run tests manually in terminal and report results back

**Commands:**
```bash
# Run all integration tests
npm run test:integration

# Run specific test file (filter by filename pattern)
npm run test:integration build-platform

# Run with debug metrics enabled
DEBUG_DOT_AI=true npm run test:integration build-platform

# Run tests with specific models (generates eval datasets)
npm run test:integration:sonnet    # Claude via Vercel AI SDK
npm run test:integration:gpt       # GPT via Vercel AI SDK

# Run specific tests with model selection
npm run test:integration:sonnet -- -t "Remediate"
npm run test:integration:gpt -- -t "Build Platform"
```

**❌ TEST IS NOT ACCEPTABLE IF:**
- It duplicates functionality already tested elsewhere
- It uses inconsistent validation patterns (mixing `.toBe()` with `toMatchObject`)
- It uses generic assertions when specific values are known
- It has speculative comments like "likely does X or Y"

## PERMANENT INTEGRATION TESTING STANDARDS

### Test Structure Requirements

**MANDATORY: Follow the Comprehensive Workflow Pattern**

```typescript
describe('Tool Integration Tests', () => {
  // Clean state ONCE before all tests to prevent race conditions
  beforeAll(async () => {
    await integrationTest.httpClient.post('/api/v1/tools/toolName', {
      operation: 'deleteAll' // Clean slate for all tests
    });
  });

  test('should complete full interactive workflow with CRUD operations', async () => {
    // 1. CREATE with complete workflow
    // 2. GET to verify creation
    // 3. LIST to verify appears in listings
    // 4. SEARCH to verify searchability (if applicable)
    // 5. DELETE to verify removal
    // 6. GET again to verify deletion

    // This ONE test covers all integration scenarios
  }, 300000); // Long timeout for comprehensive test

  // Only add separate tests for UNIQUE scenarios not covered above
});
```

### Validation Pattern Requirements

**MANDATORY: Consistent toMatchObject Pattern**

```typescript
// ✅ ALWAYS use this pattern
const expectedResponse = {
  success: true,
  data: {
    result: {
      success: true,
      operation: 'create',
      // Use SPECIFIC values when known
      data: {
        id: patternId, // Specific ID we created
        description: expect.stringContaining('Database clustering'), // Known content
        triggers: expect.arrayContaining(['databases', 'SQL databases']), // Actual values
        rationale: 'StatefulSet provides ordered deployment...', // Exact text we provided
        createdBy: 'Integration Test Suite' // Known value
      }
    }
  }
};

expect(response).toMatchObject(expectedResponse);

// ❌ NEVER mix patterns like this
expect(response.success).toBe(true);
expect(response.data.result.success).toBe(true);
```

### Specific vs Generic Assertions

**ALWAYS prefer specific values over generic matchers:**

```typescript
// ✅ GOOD - Use actual known values
triggers: expect.arrayContaining(['databases', 'SQL databases', 'persistent storage']),
rationale: 'StatefulSet provides ordered deployment and persistent identity',
prompt: expect.stringContaining('What deployment capability does this pattern provide'),
error: { message: expect.stringContaining('Pattern ID is required') }

// ❌ BAD - Generic when specific is known
triggers: expect.any(Array),
rationale: expect.any(String),
prompt: expect.any(String),
error: expect.any(Object)
```

### Race Condition Prevention

**CRITICAL: Prevent parallel test conflicts**

```typescript
// ✅ GOOD - Clean once, use unique data
beforeAll(async () => {
  await cleanup(); // Once before ALL tests
});

test('workflow test', async () => {
  const testId = Date.now(); // Unique per execution
  const response = `Database clustering ${testId}`; // Unique data
});

// ❌ BAD - Race conditions with parallel tests
beforeEach(async () => {
  await cleanup(); // Will conflict with parallel tests
});
```

### Test Organization Anti-Patterns

**❌ AVOID THESE COMMON MISTAKES:**

```typescript
// ❌ DON'T create separate tests for operations covered in comprehensive test
test('should create pattern', async () => { /* Already covered */ });
test('should list patterns', async () => { /* Already covered */ });
test('should search patterns', async () => { /* Already covered */ });
test('should delete pattern', async () => { /* Already covered */ });

// ❌ DON'T use speculative comments
// "Should handle gracefully - likely creates new session or returns error"

// ❌ DON'T create empty describe blocks
describe('CRUD Operations', () => {
  // Empty after consolidation
});

// ❌ DON'T use different validation patterns in same file
expect(response.success).toBe(true); // Inconsistent with toMatchObject elsewhere
```

## Integration Test Categories

### 1. Comprehensive Workflow Tests
- **Purpose**: Test complete end-to-end functionality
- **Pattern**: CREATE → READ → LIST → SEARCH → DELETE in one test
- **Timeout**: Long (300000ms) to accommodate full workflow
- **Coverage**: All major operations, session continuity, data persistence

### 2. Error Handling Tests
- **Purpose**: Test specific error conditions
- **Pattern**: Send invalid input, validate specific error response
- **Validation**: Use exact error messages when known
- **Focus**: Edge cases, validation failures, missing parameters

### 3. Parameter Validation Tests
- **Purpose**: Test input parameter requirements
- **Pattern**: Omit required parameters, validate error response
- **Specificity**: Check exact validation messages

## Examples of Well-Structured Integration Tests

### Comprehensive Workflow Test Example

```typescript
test('should complete full interactive pattern creation workflow', async () => {
  const testId = Date.now();

  // Step 1: Start workflow
  const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
    dataType: 'pattern',
    operation: 'create'
  });

  const expectedStartResponse = {
    success: true,
    data: {
      result: {
        success: true,
        workflow: {
          sessionId: expect.stringMatching(/^pattern-\d+-[a-f0-9-]+$/),
          entityType: 'pattern',
          nextStep: 'triggers'
        }
      }
    }
  };

  expect(startResponse).toMatchObject(expectedStartResponse);

  // Continue through ALL workflow steps with specific validation each time...
  // Then test LIST, SEARCH, DELETE operations on the created pattern
}, 300000);
```

### Error Handling Test Example

```typescript
test('should handle missing ID for get operation', async () => {
  const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
    dataType: 'pattern',
    operation: 'get'
    // Missing id parameter
  });

  const expectedErrorResponse = {
    success: true,
    data: {
      result: {
        success: false,
        error: {
          message: expect.stringContaining('Pattern ID is required')
        }
      }
    }
  };

  expect(errorResponse).toMatchObject(expectedErrorResponse);
});
```

## Integration Test Maintenance

### Before Adding New Tests

1. **Search existing tests** - Is this functionality already covered?
2. **Check comprehensive tests** - Can this be added to an existing comprehensive test?
3. **Validate uniqueness** - Does this test something truly new?
4. **Follow patterns** - Use established validation patterns

### When Refactoring Tests

1. **Eliminate redundancy first** - Remove duplicate coverage
2. **Consolidate related tests** - Combine CRUD operations into workflows
3. **Update validation patterns** - Ensure consistency across all tests
4. **Verify race condition safety** - Check cleanup and data isolation

### Quality Checklist

- [ ] No test duplicates functionality of existing tests
- [ ] All tests use consistent `toMatchObject` validation pattern
- [ ] Specific values used instead of generic matchers where possible
- [ ] No speculative comments or unclear expected behaviors
- [ ] Race condition safe with unique test data and proper cleanup
- [ ] Long-running comprehensive tests have appropriate timeouts
- [ ] Error tests validate specific, expected error messages

## Common Integration Test Patterns

### Tool Testing Pattern

```typescript
describe('[ToolName] Integration Tests', () => {
  beforeAll(async () => {
    // Clean state once
  });

  test('should complete full [operation] workflow', async () => {
    // Comprehensive test covering all major operations
  });

  describe('Error Handling', () => {
    // Specific error condition tests
  });
});
```

### API Response Validation Pattern

```typescript
const expectedResponse = {
  success: true,
  data: {
    result: {
      success: true,
      operation: 'operationName',
      dataType: 'resourceType',
      data: expect.objectContaining({
        // Specific known values
      })
    },
    tool: 'toolName',
    executionTime: expect.any(Number)
  },
  meta: expect.objectContaining({
    version: 'v1'
  })
};
```

Remember: **Integration tests should validate real system behavior with real data flows, not just check that APIs return something.**