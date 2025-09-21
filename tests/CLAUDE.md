# Test Directory - Claude Code Instructions

## Testing Standards & Framework

### Test Framework: Jest + TypeScript
- **Framework**: Jest with TypeScript support
- **Setup file**: `tests/setup.ts` - Global test configuration and environment isolation
- **Test timeout**: 30 seconds for integration tests
- **Coverage**: `npm run test:coverage` for coverage reports
- **Watch mode**: `npm run test:watch` for development

### Test Organization Requirements

#### File Structure (STRICTLY FOLLOW)
```
tests/
├── setup.ts                           # Global test setup
├── __mocks__/                         # Module mocks
│   └── @kubernetes/client-node.ts     # Kubernetes client mock
├── core/                              # Core functionality tests
│   ├── schema.test.ts                 # Mirror src/core/schema.ts
│   ├── discovery.test.ts              # Mirror src/core/discovery.ts
│   └── ...
├── tools/                             # Tool handler tests
│   ├── recommend.test.ts              # Mirror src/tools/recommend.ts
│   ├── remediate.test.ts              # Mirror src/tools/remediate.ts
│   └── ...
└── interfaces/                        # Interface tests
    ├── mcp.test.ts                    # Mirror src/interfaces/mcp.ts
    └── rest-api.test.ts               # Mirror src/interfaces/rest-api.ts
```

**CRITICAL**: Test file paths MUST mirror source code structure exactly:
- `src/core/schema.ts` → `tests/core/schema.test.ts`
- `src/tools/recommend.ts` → `tests/tools/recommend.test.ts`
- `src/interfaces/mcp.ts` → `tests/interfaces/mcp.test.ts`

#### Test File Naming
- Use `.test.ts` suffix for all test files
- Use kebab-case for multi-word files: `rest-api.test.ts`, `doc-testing-session.test.ts`
- Match source file names exactly (except for `.test.ts` suffix)

### Test Implementation Standards

#### Environment Isolation (MANDATORY)
```typescript
// Environment variables are isolated in tests/setup.ts
// Tests NEVER use real external services:
// - No real Anthropic API calls
// - No real Kubernetes cluster connections  
// - No real Qdrant vector database
// - No real file system operations (unless specifically testing FS)
```

#### Mocking Strategy
```typescript
// 1. Mock external dependencies at module level
jest.mock('../../src/core/vector-db-service', () => ({
  VectorDBService: jest.fn().mockImplementation(() => ({
    initializeCollection: jest.fn().mockResolvedValue(undefined),
    searchSimilar: jest.fn().mockResolvedValue([]),
    // ... other methods
  }))
}));

// 2. Mock Kubernetes client
jest.mock('@kubernetes/client-node');

// 3. Mock AI services (Claude, OpenAI)
jest.mock('../../src/core/claude');
```

#### Test Structure Pattern
```typescript
/**
 * Tests for [ComponentName] 
 * 
 * [Brief description of what component does]
 */

import { ... } from '../../src/...';

// Mocks first
jest.mock('../../src/core/dependency');

describe('[ComponentName]', () => {
  describe('[Feature Group 1]', () => {
    test('should [specific behavior]', () => {
      // Test implementation
    });
  });
  
  describe('[Feature Group 2]', () => {
    // More tests
  });
});
```

### Test Quality Requirements

#### Coverage Expectations
- **New code**: 100% line coverage required
- **Modified code**: Must not decrease existing coverage
- **Critical paths**: Error handling and edge cases must be tested
- **Integration points**: All external service interactions must be mocked and tested

#### Test Categories
1. **Unit Tests**: Individual functions and classes in isolation
2. **Integration Tests**: Component interactions with mocked external services
3. **Contract Tests**: Tool schema validation and MCP protocol compliance
4. **Error Handling Tests**: All error paths and edge cases

#### Testing Best Practices
- **Descriptive test names**: `should return deployment recommendations when valid intent provided`
- **AAA Pattern**: Arrange, Act, Assert structure
- **One assertion per test**: Focus on single behavior per test
- **Test data**: Use realistic data that matches production patterns
- **Mock verification**: Verify mocks are called with expected parameters

### Test Execution Workflow

#### Development Workflow (MANDATORY)
```bash
# 1. Write/modify code
# 2. Write/update corresponding tests
npm run test:watch                    # Run tests in watch mode during development
npm test                             # Run full test suite before completion
npm run test:coverage                # Check coverage levels
```

#### Pre-commit Checklist
- [ ] All tests passing (`npm test` exits with 0)
- [ ] Coverage maintained or improved 
- [ ] No test files missing for new source files
- [ ] Mocks properly configured for external dependencies
- [ ] Test descriptions are clear and specific

### Common Testing Patterns

#### Tool Testing Pattern
```typescript
describe('[ToolName] Tool', () => {
  describe('Tool Metadata', () => {
    test('should have essential properties only', () => {
      expect(TOOL_NAME).toBe('expected-name');
      expect(TOOL_DESCRIPTION).toBeDefined();
      expect(TOOL_INPUT_SCHEMA).toBeDefined();
    });
  });

  describe('Tool Handler', () => {
    test('should handle valid input correctly', async () => {
      // Arrange
      const input = { validParam: 'value' };
      
      // Act  
      const result = await handleTool(input);
      
      // Assert
      expect(result).toBeDefined();
    });
  });
});
```

#### Service Testing Pattern
```typescript
describe('[ServiceName]', () => {
  let service: ServiceClass;
  
  beforeEach(() => {
    service = new ServiceClass();
  });

  describe('initialization', () => {
    test('should initialize correctly', () => {
      expect(service).toBeDefined();
    });
  });

  describe('[method]', () => {
    test('should [expected behavior]', async () => {
      // Test implementation
    });
  });
});
```

### Test Data Management

#### Test Fixtures
- Store complex test data in separate files when needed
- Use realistic data that mirrors production scenarios
- Keep test data focused and minimal
- Avoid hardcoded strings - use constants for reusable values

#### Mock Data Standards
- **Kubernetes resources**: Use valid resource structures
- **AI responses**: Use realistic response formats
- **Error scenarios**: Test with realistic error conditions
- **Edge cases**: Include boundary conditions and null/undefined handling

### Debugging Failed Tests

#### Common Issues
1. **External service calls**: Check that all external dependencies are mocked
2. **Environment variables**: Verify isolation in tests/setup.ts
3. **File system access**: Ensure tests don't depend on specific file system state
4. **Async operations**: Properly await async operations and handle promises
5. **Mock configuration**: Verify mocks return expected data structures

#### Debugging Commands
```bash
npm run test:verbose                  # Run with detailed output
npm run test:coverage                 # Check coverage gaps  
npm run test -- --detectOpenHandles  # Find async operations not closed
npm run test -- --runInBand          # Run tests sequentially (for debugging)
```

### Integration with CI/CD

#### GitHub Actions Integration
- Tests run automatically on all pull requests
- All tests must pass before merge
- Coverage reports generated and tracked
- No external service dependencies in CI environment

#### Performance Considerations
- Keep test execution under 5 minutes total
- Mock expensive operations (AI API calls, large file operations)
- Use parallel test execution (Jest default)
- Avoid real network calls in tests

Remember: Tests are the safety net for the entire codebase. Comprehensive, reliable tests enable confident refactoring and rapid development.