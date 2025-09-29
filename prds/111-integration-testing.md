# PRD: Integration Testing Framework for DevOps AI Toolkit

**Issue**: #111  
**Created**: 2025-01-19  
**Status**: Not Started  
**Priority**: Medium  
**Owner**: TBD  

## Executive Summary

Build a comprehensive integration testing framework that validates all dot-ai tools work correctly with real Kubernetes clusters and external dependencies. This framework leverages the REST API gateway to provide simple HTTP-based testing that can run in CI/CD pipelines and local development environments.

**Key Strategy**: Replace all unit tests with integration tests. The end goal is zero unit tests, as dot-ai's value lies entirely in integrating Kubernetes, AI, and databases - testing these in isolation with mocks provides false confidence.

## Problem Statement

### Current Challenges
- Testing relies primarily on unit tests with mocked dependencies
- No validation that tools work correctly with real Kubernetes clusters
- Difficult to test complex scenarios involving multiple tools and dependencies
- Manual testing required for each release to verify functionality
- No automated regression testing for tool integrations
- Integration issues discovered late in development cycle

### User Impact
- **Development Teams**: Risk of shipping bugs that only appear in real environments
- **QA Teams**: Manual testing burden for complex integration scenarios
- **Platform Teams**: Lack of confidence in tool reliability for production use
- **Contributors**: Difficulty testing changes without complex local setup

## Success Criteria

- All dot-ai tools have comprehensive integration tests
- **All unit tests eliminated** (phased removal as integration tests prove coverage)
- Tests run automatically in CI/CD pipeline
- Test suite covers real Kubernetes cluster interactions
- Failed tests provide actionable debugging information
- Test execution time under 15 minutes for full suite
- Easy to add tests for new tools without framework changes
- Tests are self-documenting using BDD-style scenario descriptions
- Integration tests use real AI (Claude Haiku) for realistic validation
- Zero mock maintenance burden

## Scope

### In Scope
- HTTP-based integration tests using REST API gateway
- Real Kubernetes cluster integration (test clusters)
- Test data management and cleanup
- CI/CD pipeline integration
- Test reporting and failure analysis
- Coverage tracking for tool functionality
- Local development testing support

### Out of Scope
- Performance/load testing (separate initiative)
- Security penetration testing (separate security initiative)
- Multi-cluster testing scenarios (single cluster focus)
- Production environment testing (test clusters only)
- Maintaining unit tests (will be eliminated entirely)

## Requirements

### Functional Requirements

1. **Tool Test Coverage**
   - Integration tests for all existing tools (recommend, remediate, deploy, etc.)
   - Tests cover primary use cases and error scenarios
   - Validation of tool outputs and side effects
   - Cross-tool interaction testing where applicable

2. **Kubernetes Integration**
   - Tests run against real Kubernetes clusters
   - Automatic test cluster setup and teardown
   - Test namespace isolation and cleanup
   - Kubernetes resource lifecycle testing

3. **Test Data Management**
   - Reusable test fixtures and scenarios
   - **Namespace-based isolation**: Each test creates unique namespace
   - **Simple cleanup**: Delete namespace cascades to all resources
   - **No resource tracking needed**: Namespace deletion handles everything
   - Test data versioning and consistency
   - Parameterized tests for different configurations

4. **CI/CD Integration**
   - Tests run on every pull request
   - Clear pass/fail reporting
   - Integration with existing GitHub Actions
   - Test results available in PR status checks

5. **Local Development**
   - Easy test execution for developers
   - **Selective test execution** (single file, test suite, or pattern matching)
   - Fast feedback loop for test failures (15-30s for single test)
   - Persistent cluster option for rapid iteration
   - Minimal setup requirements
   - Clear documentation for running tests

### Non-Functional Requirements

- **Performance**: Full test suite completes within 15 minutes (3-5 minutes with parallelism)
- **Individual Test Performance**: Complex workflow tests complete within 10-15 seconds
- **Development Iteration**: Single test execution in 15-30 seconds with persistent cluster
- **Parallel Execution**: Support 10-20 concurrent test workers
- **Reliability**: Tests pass consistently with <1% flake rate
- **Maintainability**: New tools automatically included in test framework
- **Resource Management**: Namespace-based cleanup with async deletion (no waiting)
- **Isolation**: Each test runs in unique namespace, perfect isolation
- **Debuggability**: Clear error messages and logs for test failures
- **Readability**: Tests organized by user scenarios, not technical implementation
- **Simplicity**: No resource tracking, namespace deletion handles all cleanup

## Technical Design

### Architecture Overview

```
GitHub Actions → Test Runner → REST API Gateway → dot-ai Tools → Test Kubernetes Cluster
                      ↓              ↓                ↓                    ↓
                Test Reports ← Result Validation ← Tool Responses ← Cluster State
                                                         ↓
                                                  Claude Haiku API
                                                  (Test AI Model)
```

### Design Decisions

#### AI Strategy for Testing
- **Decision**: Use Claude 3 Haiku for all integration tests
- **Model**: `claude-3-haiku-20240307`
- **Rationale**:
  - 2-3x faster than production Sonnet model (0.8-2.5s vs 2-5s)
  - 12x cheaper ($0.25/$1.25 per 1M tokens vs $3/$15)
  - Same Anthropic SDK - no code changes needed
  - Provides real AI behavior validation
- **Configuration**:
  ```typescript
  const testAI = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY  // Same key for all models
  });
  const response = await testAI.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
    max_tokens: 2048,
    temperature: 0  // Maximum determinism
  });
  ```

#### Model Configuration Implementation
- **Approach**: Environment variable based model switching
- **Implementation**:
  ```typescript
  // src/core/claude.ts - Single line change needed
  const stream = await this.client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    // ... rest of configuration
  });
  ```
- **Test Setup**:
  ```bash
  # .env.test or test setup
  ANTHROPIC_API_KEY=sk-ant-api03-xxxxx  # Same key as production
  CLAUDE_MODEL=claude-3-haiku-20240307   # Override model for tests
  ```

#### Test Organization Strategy
- **Decision**: BDD-style scenario-based test organization
- **Rationale**: Tests serve as living documentation
- **Structure**:
  - Tests grouped by user scenarios (`scenarios/`)
  - User journey tests (`journeys/`)
  - Named by business value, not technical implementation
  - Example: `crashloop-remediation.scenario.test.ts`

#### Infrastructure Approach
- **Decision**: Use real Kubernetes test clusters with pre-built Kind images
- **Implementation**: Custom Kind node images with pre-installed operators
- **Rationale**:
  - Mocking would create unrealistic tests
  - Pre-built images enable fast cluster creation (~10s)
  - Guarantees clean state for each test run
  - No complex cleanup logic needed
- **Real Operations Include**:
  - `kubectl api-resources` (~0.5-2s)
  - `kubectl get crd` (~0.5-1s)
  - Resource discovery and deployment
  - Actual cluster state validation

#### Test Cluster Strategy
- **Hybrid Approach**:
  - **Development**: Persistent cluster with resource cleanup after each test
  - **CI/CD**: Fresh cluster per test run using pre-built images
- **Development Lifecycle**: Create Once → Run Many Tests (with cleanup) → Manual Destroy
- **CI/CD Lifecycle**: Create → Run Tests → Destroy
- **Image Contents**:
  - Base: `kindest/node:v1.29.0`
  - Pre-installed: CloudNativePG operator
  - Pre-pulled: Common container images
- **Cluster Configuration for Parallel Tests**:
  - Increased pod limits (200 pods)
  - Higher connection limits
  - Tuned resource quotas
- **Benefits**:
  - Development: Fast iteration without repeated cluster creation
  - CI/CD: Clean, reproducible environment
  - Both: Guaranteed clean state between tests

### Core Components

1. **Test Framework** (`tests/integration/`)
   - HTTP client for REST API gateway
   - Kubernetes client for cluster validation
   - Test utilities and helpers
   - Assertion and validation libraries

2. **Test Suites**
   - **Scenario Tests** (`tests/integration/scenarios/`)
     - Real-world problem scenarios
     - Example: `crashloop-remediation.scenario.test.ts`
   - **Journey Tests** (`tests/integration/journeys/`)
     - End-to-end user workflows
     - Example: `deploy-application.journey.test.ts`
   - **Tool Tests** (`tests/integration/tools/`)
     - Individual tool validation
     - Error cases and edge conditions

3. **Test Infrastructure** (`tests/integration/infrastructure/`)
   - Pre-built Kind image configuration
   - Cluster creation/destruction scripts
   - Operator pre-installation manifests
   - Test data fixtures
   - Image build automation
   - Namespace management utilities

4. **Test Helpers** (`tests/integration/helpers/`)
   - **IntegrationTest base class**: Handles namespace lifecycle
   - **Common assertions**: `expectPodRunning`, `expectServiceReachable`
   - **Resource builders**: For complex but common resources
   - **Scenario builders**: Reusable test scenarios
   - Balance: Keep test logic visible, extract infrastructure only

5. **CI/CD Integration** (`.github/workflows/`)
   - Integration test workflow with parallel execution
   - Test cluster provisioning with resource tuning
   - Test result reporting and timing metrics
   - Artifact collection and storage
   - Parallel test configuration

### Test Execution Flow

1. **Setup Phase**
   - Create Kind cluster from pre-built image (~10s)
   - Verify pre-installed operators (CNPG)
   - Deploy dot-ai with REST API gateway
   - Cluster ready with all dependencies

2. **Test Execution**
   - **Each test creates unique namespace** (test-{workerId}-{name}-{timestamp})
   - All resources created within test namespace
   - Run tool-specific integration tests
   - Validate responses and cluster state
   - Execute cross-tool scenarios
   - Collect logs and artifacts

3. **Cleanup Phase**
   - **All Modes**:
     - Delete test namespace with `--wait=false` (returns immediately)
     - Deletion happens asynchronously in background
     - No individual resource cleanup needed
     - Next test can start while previous namespace deletes
   - **Development Mode**:
     - Cluster persists for next test run
   - **CI/CD Mode**:
     - Destroy entire Kind cluster after all tests

### Example Test Structure

```typescript
// tests/integration/scenarios/crashloop-remediation.scenario.test.ts
import { IntegrationTest } from '../helpers/test-base';

describe('Scenario: Pod CrashLoopBackOff Remediation', () => {
  const test = new IntegrationTest();

  // No namespace boilerplate - handled by base class
  beforeEach(() => test.setup('crashloop'));
  afterEach(() => test.cleanup()); // Returns immediately, deletion in background

  const scenario = {
    problem: 'Application pod stuck in CrashLoopBackOff due to missing ConfigMap',
    expectedFix: 'Create missing ConfigMap with required configuration',
    verifyFix: 'Pod transitions to Running state'
  };

  test(`
    Problem:      ${scenario.problem}
    Expected Fix: ${scenario.expectedFix}
    Verification: ${scenario.verifyFix}
  `, async () => {
    // GIVEN: A pod with missing ConfigMap dependency
    // Base class handles namespace automatically
    await test.createPodWithMissingConfigMap('test-app');
    await test.waitForCondition('pod/test-app', 'CrashLoopBackOff');

    // WHEN: We request AI-powered remediation (using Claude Haiku)
    const result = await callTool('/api/v1/tools/remediate', {
      issue: 'Pod test-app is in CrashLoopBackOff',
      mode: 'automatic'
    });

    // THEN: The AI identifies and fixes the root cause
    expect(result.rootCause).toContain('missing ConfigMap');
    expect(result.actions).toInclude('Created ConfigMap: test-app-config');

    // AND: The pod recovers to Running state
    await expectPodRunning('test-app', test.namespace);
  });
});

// tests/integration/journeys/deploy-application.journey.test.ts
import { IntegrationTest } from '../helpers/test-base';
import { expectPodsRunning, expectServiceReachable } from '../helpers/assertions';

describe('User Journey: Deploy Complete Application Stack', () => {
  const test = new IntegrationTest();

  beforeEach(() => test.setup('journey'));
  afterEach(() => test.cleanup());

  test('Step-by-step deployment from intent to running pods', async () => {
    // Test logic remains clear and visible
    const journey = await startUserJourney({ namespace: test.namespace });

    await journey.step('1. Express deployment intent', async () => {
      const recommendations = await getRecommendations('deploy nodejs API with postgres');
      expect(recommendations).toHaveMultipleSolutions();
    });

    await journey.step('2. Configure application', async () => {
      await answerQuestions({ appName: 'my-api', replicas: 3 });
    });

    await journey.step('3. Generate and deploy manifests', async () => {
      const manifests = await generateManifests();  // Uses Claude Haiku
      const deployment = await deployManifests(testNamespace);  // Deploy to test namespace
      expect(deployment.status).toBe('success');
    });

    await journey.step('4. Verify application running', async () => {
      // Reusable assertions but clear intent
      await expectPodsRunning('my-api', test.namespace, { count: 3 });
      await expectServiceReachable('my-api', test.namespace);
    });
  });
});
```

## Unit Test Elimination Plan

### Phased Removal Strategy
As integration tests are validated for each component, corresponding unit tests will be deleted:

#### Phase 1: Tool Tests (9 files)
- Write integration tests for all tools (recommend, remediate, etc.)
- Validate: Each tool has 3+ integration tests covering main scenarios
- Delete: All tests/tools/*.test.ts files

#### Phase 2: Core Tests (20+ files)
- Write integration tests for core functionality
- Validate: Real K8s, AI, and vector DB operations tested
- Delete: All tests/core/*.test.ts files

#### Phase 3: Interface Tests (2 files)
- Write REST API and MCP integration tests
- Validate: Real protocol interactions tested
- Delete: All tests/interfaces/*.test.ts files

#### Phase 4: Final Cleanup
- Delete: tests/setup.ts, tests/__mocks__/, unit test configurations
- Update: Remove jest.config.js completely, update package.json to remove unit test references
- **End State**: Zero unit tests, only integration tests remain

### Deletion Criteria
Unit tests can be deleted when integration tests demonstrate:
- Real service interactions work correctly
- Error handling with actual failures
- All critical paths covered
- No unique logic requiring isolation

## Implementation Milestones

### Milestone 1: Test Framework Foundation ✅ (8/12 complete)
**Deliverable**: Basic integration test framework running locally
- [x] Create test framework structure and utilities
- [x] Build pre-configured Kind node image with CNPG
- [x] Implement cluster creation/destruction scripts
- [x] Implement namespace-based test isolation
- [x] **Create IntegrationTest base class for common operations**
- [ ] **Build reusable test helpers and assertions**
- [ ] Configure parallel test execution with Vitest
- [ ] Create selective test execution scripts
- [x] HTTP client for REST API gateway communication
- [x] Kubernetes client setup for cluster validation
- [x] Configure Claude model switching via environment variable
- [x] Basic test runner and reporting
- [ ] Local development documentation

### Milestone 2: Core Tool Test Suites ✅ (2/8 complete)
**Deliverable**: Integration tests for all tools working
- [ ] **Recommend tool integration tests** (covers full workflow: recommend → chooseSolution → answerQuestion → generateManifests → deployManifests)
- [ ] **Remediate tool integration tests**
- [ ] **TestDocs tool integration tests**
- [ ] **ManageOrgData: Patterns integration tests** (pattern dataType operations)
- [ ] **ManageOrgData: Policies integration tests** (policy dataType operations)
- [x] **ManageOrgData: Capabilities integration tests** (capabilities dataType operations) - 16/16 tests passing with comprehensive CRUD, workflow, and error handling
- [x] **Version tool integration tests**
- [ ] **Test data fixtures and utilities**

### Milestone 3: CI/CD Pipeline Integration ⬜
**Deliverable**: Tests running automatically in GitHub Actions
- [ ] GitHub Actions workflow for integration tests
- [ ] Test Kubernetes cluster provisioning
- [ ] Test result reporting and PR status integration
- [ ] Artifact collection and storage
- [ ] Failure notification and debugging support

### Milestone 4: Advanced Testing Scenarios ⬜
**Deliverable**: Comprehensive test coverage with cross-tool scenarios
- [ ] Error case and edge case test coverage
- [ ] Cross-tool integration scenarios
- [ ] Performance baseline testing
- [ ] Test flake detection and resolution
- [ ] Coverage reporting and gap analysis

### Milestone 5: Unit Test Elimination ⬜ (1/5 complete)
**Deliverable**: Complete removal of all unit tests (deleted incrementally as integration tests are completed)
- [ ] Phase 1: Delete tool unit tests (1/9 files complete - deleted immediately as integration tests prove coverage)
- [ ] Phase 2: Delete core unit tests (20+ files - deleted as integration tests validate core functionality)
- [ ] Phase 3: Delete interface unit tests (2 files - deleted when interface integration tests complete)
- [ ] Phase 4: Remove test infrastructure and mocks (jest.config.js, tests/setup.ts, tests/__mocks__/)
- [ ] Update documentation to reflect integration-only testing

### Milestone 6: Production Readiness ⬜
**Deliverable**: Integration testing framework ready for ongoing use
- [ ] Test maintenance documentation
- [ ] Test adding guidelines for new tools
- [ ] Performance optimization for CI/CD
- [ ] Monitoring and alerting for test health
- [ ] Integration with release process

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| Test cluster provisioning complexity | Low | Low | Pre-built Kind images reduce complexity to single command |
| Test flakiness due to timing issues | Medium | High | Robust retry logic, proper wait conditions, isolated test environments |
| CI/CD pipeline performance issues | Medium | Medium | Parallel test execution, test result caching, incremental testing |
| Test maintenance overhead | Medium | Medium | Auto-generated test scaffolding, clear test patterns, good documentation |
| AI response variability | Low | Medium | Use temperature=0 for determinism, validate response structure not exact content |
| API cost overruns | Low | Low | Claude Haiku is 12x cheaper than production model, monitor usage |

## Dependencies

- **REST API Gateway (#110)**: Required for HTTP-based tool testing
- **Kubernetes cluster access**: Test cluster for integration testing
- **CI/CD infrastructure**: GitHub Actions for automated test execution
- **Existing tool functionality**: Tools must work correctly to test them

## Testing Philosophy

### Why Zero Unit Tests?

1. **dot-ai IS integration**: The system's value is orchestrating K8s + AI + Vector DB
2. **Mocks lie**: Mocked Kubernetes/AI behavior doesn't match reality
3. **Maintenance burden**: 300+ mock assertions require constant updates
4. **False confidence**: Unit tests with mocks prove nothing about actual behavior
5. **Better ROI**: One good integration test replaces 10 mock-heavy unit tests

### Namespace-Based Test Isolation

**Core Principle**: Every test creates its own namespace and only creates resources within that namespace.

**Benefits**:
- **Simple cleanup**: `kubectl delete namespace test-xyz --wait=false` (async, no blocking)
- **Perfect isolation**: Tests can run in parallel without conflicts
- **No tracking needed**: Namespace deletion cascades to all resources
- **Foolproof**: Cannot forget to clean resources

**Rules**:
- Never create cluster-scoped resources in tests
- Each test gets unique namespace (test-{workerId}-{name}-{timestamp})
- Cleanup is just namespace deletion
- **CRITICAL**: Always use `--wait=false` for namespace deletion
- Deletion happens asynchronously (30-60s in background)
- Next test starts immediately while previous cleans up

### Test Code Reusability

**Principle**: Balance DRY (Don't Repeat Yourself) with test readability.

**CRITICAL Test Development Rule**: Always inspect actual API responses before writing assertions.

**Comprehensive Response Validation Pattern**: Every integration test should validate the complete API response structure, not just select fields.

**Standard Test Pattern**:
```typescript
test('should return comprehensive response with correct structure', async () => {
  // Define complete expected response structure based on actual API inspection
  const expectedResponse = {
    success: true,
    data: {
      tool: 'toolName',
      executionTime: expect.any(Number),
      result: {
        // Complete structure validation - include ALL fields from actual response
        status: 'success',
        system: {
          // Every field that exists in actual response
          version: { version: packageJson.version, /* ... all version fields */ },
          vectorDB: { /* complete vectorDB structure */ },
          embedding: { /* complete embedding structure */ },
          // ... ALL system fields
        },
        summary: {
          // Every field that exists in actual response
          overall: 'healthy',
          // ... ALL summary fields
        }
      }
    },
    meta: {
      timestamp: expect.stringMatching(/ISO_REGEX/),
      requestId: expect.stringMatching(/REQUEST_ID_REGEX/),
      version: 'v1'
    }
  };

  const response = await httpClient.post('/api/v1/tools/toolName', {});

  // Single comprehensive assertion - validates ENTIRE response structure
  expect(response).toMatchObject(expectedResponse);

  // No additional redundant assertions needed
});
```

**Why This Pattern**:
- **Complete Coverage**: Catches regressions in any part of the response
- **No False Passing**: Can't accidentally miss validation of new fields
- **Clean Code**: Single assertion, no duplication
- **Future-Proof**: New response fields require explicit test updates
- **Self-Documenting**: Test shows exact expected API contract

**Test-First Development Process**:
1. **Inspect API Response**: Call the actual REST API endpoint and examine the response structure
2. **Document Complete Format**: Map every field, nested object, and array in the response
3. **Write Complete Validation**: Create assertions covering the entire response structure
4. **Use Specific Values**: Use actual expected values (not `expect.any()`) where values should be deterministic
5. **Use Patterns**: Use regex patterns for variable values (timestamps, IDs, versions)
6. **Verify Edge Cases**: Test different scenarios (success, error, empty data) to see response variations

**Example Process**:
```bash
# 1. First, manually call the API to see actual response
curl http://localhost:3000/api/v1/tools/version

# 2. Examine the response structure:
{
  "success": true,
  "data": {
    "result": {
      "content": [
        {
          "type": "text",
          "text": "{\"status\":\"success\",\"system\":{...}}"
        }
      ]
    }
  }
}

# 3. Write assertions based on actual structure, not assumptions
expect(response.data.result.content[0].text).toBeDefined();
```

**Why This Matters**:
- **Avoids brittle tests**: Tests fail when assumptions about API structure are wrong
- **Faster development**: No debugging test failures due to incorrect assertions
- **Better test quality**: Tests validate actual behavior, not imagined behavior
- **Documentation value**: Tests serve as accurate API usage examples

**IntegrationTest Base Class**:
```typescript
class IntegrationTest {
  protected namespace: string;

  async setup(name?: string): Promise<void> {
    // Auto-generates unique namespace
    // Handles kubectl create namespace
  }

  async cleanup(): Promise<void> {
    // Fires deletion and returns immediately
    await kubectl(`delete namespace ${this.namespace} --wait=false`);
    // Does NOT wait for deletion to complete
  }

  // Convenience methods that include namespace
  async createPod(name: string, spec: any);
  async waitForCondition(resource: string, condition: string);
}
```

**What to Extract**:
- ✅ Namespace lifecycle (always the same)
- ✅ Common assertions (expectPodRunning, expectServiceReachable)
- ✅ Resource builders for complex but common patterns
- ✅ Wait conditions and retry logic

**What to Keep Visible**:
- ❌ Test-specific business logic
- ❌ Simple kubectl calls (one-liners)
- ❌ Unique test scenarios
- ❌ Test flow and intent

**Result**: Infrastructure is reusable, test logic remains clear and readable.

### Async Namespace Deletion

**Critical Performance Optimization**: Namespace deletion can take 30-60+ seconds but tests don't need to wait.

```typescript
// ALWAYS use --wait=false
afterEach(async () => {
  await kubectl(`delete namespace ${namespace} --wait=false`);
  // Returns immediately, deletion happens in background
  // Next test can start while this namespace is still deleting
});
```

**Benefits**:
- Tests don't block on cleanup (saves 30-60s per test)
- Kubernetes handles deletion in background
- Unique namespaces prevent conflicts even if deletion is slow
- Massive performance improvement for test suite

**Never do this**:
```typescript
// DON'T wait for deletion - blocks unnecessarily
await kubectl(`delete namespace ${namespace}`); // ❌ Can block 30-60s
await kubectl(`delete namespace ${namespace} --wait`); // ❌ Same problem
```

### Parallel Test Execution

**Strategy**: Leverage namespace isolation to run tests in parallel for 10-20x speedup.

**Implementation Levels**:
1. **Conservative** (5 workers): Safe for resource-constrained environments
2. **Standard** (10 workers): Default for most development and CI
3. **Aggressive** (20 workers): For powerful clusters and quick feedback
4. **Maximum** (50% CPU cores): For local development with good hardware

**Resource Considerations**:
- **Cluster**: Configure Kind with increased limits (200 pods, higher connections)
- **API Rate Limits**: Claude Haiku supports ~10 concurrent requests
- **Database**: CNPG may need connection pool tuning
- **Memory**: Each test namespace consumes ~50-100MB

**Configuration**:
```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    maxConcurrency: process.env.CI ? 10 : 5  // More parallelism in CI
  }
});
```

**Benefits**:
- Test suite completes in 3-5 minutes instead of 30-60 minutes
- Faster CI/CD feedback loops
- Proves true test isolation
- Better resource utilization

### Integration-Only Benefits

- **Real behavior validation**: Tests prove the system actually works
- **No mock drift**: No divergence between mocks and reality
- **Clearer value**: Each test demonstrates actual functionality
- **Simpler mental model**: "Does it work?" not "Is it mocked correctly?"
- **Focus**: All effort on tests that matter

## Future Enhancements

1. **Performance Testing**: Load and stress testing for tools
2. **Multi-cluster Testing**: Cross-cluster scenarios and federation
3. **Chaos Testing**: Tool behavior under failure conditions
4. **Security Testing**: Authorization and data validation testing
5. **Visual Testing**: UI testing for dashboard/web components
6. **Contract Testing**: API contract validation between versions

## Resolved Decisions

1. **AI Model Strategy** (2025-01-28)
   - **Decision**: Use Claude 3 Haiku for all integration tests
   - **Rationale**: Balances real AI behavior with speed and cost
   - **Alternative Considered**: Mock AI server (rejected due to lack of realism)

2. **Test Organization** (2025-01-28)
   - **Decision**: BDD-style scenario-based organization
   - **Rationale**: Tests serve as living documentation
   - **Impact**: Tests organized by business value, not technical implementation

3. **Infrastructure Approach** (2025-01-28)
   - **Decision**: Use real Kubernetes clusters with actual kubectl operations
   - **Rationale**: Mocking all operations would create unrealistic tests
   - **Trade-off**: Slower tests (10-15s) but real validation

4. **Model Configuration Method** (2025-01-28)
   - **Decision**: Use environment variable `CLAUDE_MODEL` to switch between models
   - **Rationale**: Minimal code changes (one line), no API breaking changes
   - **Implementation**: `process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022'`

5. **API Key Management** (2025-01-28)
   - **Decision**: Use same Anthropic API key for both production and test models
   - **Rationale**: Anthropic allows all models under one key; simpler configuration
   - **Note**: Optional separate key for billing tracking, but not required

6. **Test Operator Selection** (2025-01-28)
   - **Decision**: Use CloudNativePG (CNPG) as primary test operator
   - **Rationale**: Lightweight, fast, provides database functionality for realistic testing
   - **Future**: Add more operators incrementally as test scenarios require

7. **Cluster Lifecycle Strategy** (2025-01-28)
   - **Decision**: Hybrid approach - persistent cluster for development, fresh for CI/CD
   - **Rationale**: Balances fast iteration with clean test isolation
   - **Implementation**: Pre-built Kind images + resource cleanup utilities
   - **Trade-off**: More complex but optimizes for both use cases

8. **Selective Test Execution** (2025-01-28)
   - **Decision**: Support running individual tests or test groups
   - **Rationale**: Full suite takes 5+ minutes; developers need fast feedback
   - **Implementation**: Vitest patterns, npm scripts for common scenarios
   - **Benefit**: 15-30 second feedback for single test

9. **Resource Cleanup Strategy** (2025-01-28)
   - **Decision**: Namespace-based cleanup - each test creates unique namespace
   - **Rationale**: Namespace deletion cascades to all resources automatically
   - **Implementation**: Create namespace in beforeEach, delete in afterEach
   - **Rule**: Tests only create namespaced resources, never cluster-scoped

10. **Zero Unit Tests Strategy** (2025-01-28)
   - **Decision**: Eliminate all unit tests in favor of integration tests
   - **Rationale**: dot-ai IS an integration layer; mocking removes actual value
   - **Implementation**: Phased removal as integration tests prove coverage
   - **End Goal**: Zero unit tests, zero mock maintenance
   - **Benefit**: All tests prove real system behavior

11. **Parallel Test Execution** (2025-01-28)
   - **Decision**: Run integration tests in parallel with 10-20 workers
   - **Rationale**: Namespace isolation enables safe parallel execution
   - **Implementation**: Vitest maxWorkers configuration, tuned cluster resources
   - **Expected Speedup**: 10-20x (from 30+ min to 3-5 min)
   - **Trade-off**: Higher resource usage for dramatically faster feedback

## Open Questions

1. **Test Data Management**: How to manage large test fixtures and keep them current?
2. **Additional Operators**: Which operators to add beyond CNPG as tests evolve?
3. **Optimal Parallelism**: What's the maximum beneficial parallelism level?

## Progress Log

### 2025-01-19
- Initial PRD created following REST API Gateway PRD completion
- Identified need for comprehensive integration testing beyond current unit tests
- Established dependency on REST API Gateway for HTTP-based testing approach
- Defined scope focusing on single-cluster scenarios with real Kubernetes integration

### 2025-01-28
- **Design Decision**: Selected Claude 3 Haiku as test AI model for balance of realism and speed
- **Design Decision**: Adopted BDD-style scenario-based test organization for readability
- **Design Decision**: Confirmed use of real Kubernetes operations instead of mocks
- **Design Decision**: Environment variable based model switching (CLAUDE_MODEL)
- **Design Decision**: Same API key for all Claude models (production and test)
- **Design Decision**: Use CloudNativePG as primary test operator
- **Design Decision**: Pre-built Kind images for fast, clean cluster provisioning
- **Performance Expectation**: Accepted 10-15 second execution time for complex tests
- **Performance Improvement**: Cluster creation reduced to ~10s with pre-built images
- **Developer Experience**: Selective test execution for 15-30s feedback cycles
- **Testing Philosophy**: Zero unit tests - all value in integration testing
- **Test Execution**: Parallel testing with 10-20x speedup
- **Cost Analysis**: Haiku at $0.25/1M tokens enables affordable real AI testing

### 2025-09-28
- **Milestone 1 Foundation Implementation**: Completed 8 of 12 foundation requirements
- **Integration Test Framework**: Fully operational with Kind + CNPG + Kyverno + Qdrant + Claude Haiku
- **Version Tool Pattern Established**: 4 comprehensive integration tests with complete response validation
- **First Unit Test Elimination**: Deleted `tests/tools/version.test.ts` (869 lines) → replaced with integration tests
- **Infrastructure Achievements**:
  - Kind cluster setup with automatic CNPG and Kyverno installation via Helm
  - Qdrant vector database integration for semantic search testing
  - Claude API integration with model switching (Haiku for tests, Sonnet for production)
  - Complete namespace-based test isolation with async cleanup
  - System status validation achieving "healthy" state across all services
- **Comprehensive Response Validation**: Updated PRD with standard pattern for complete API response structure validation
- **Testing Philosophy Validation**: Proven that 4 integration tests provide superior validation compared to 869 lines of mocked unit tests
- **Next Session Priority**: Apply established pattern to remaining tools (remediate, recommend, deploy)

### 2025-09-29: ManageOrgData Capabilities Integration Testing Complete
**Duration**: ~4 hours (estimated from commit timestamps and conversation length)
**Commits**: Multiple commits focusing on test fixes and API response alignment
**Primary Focus**: Fix failing integration tests and establish robust testing foundation for capabilities module

**Completed PRD Items**:
- [x] **ManageOrgData: Capabilities integration tests** - Evidence: 16/16 tests passing with comprehensive coverage:
  - CRUD operations (Create via scanning, Read/List, Update via workflow, Delete with verification)
  - Complete workflow testing (resource selection, specification, processing modes)
  - Error handling scenarios (invalid operations, missing parameters, not found cases)
  - Manual and automatic processing modes
  - Semantic search functionality with real vector database
  - Progress tracking for long-running operations

**Key Technical Achievements**:
- **Fixed critical race conditions**: Removed `deleteAll` operations causing parallel test failures
- **Resolved timeout limitations**: Extended timeouts from 30s to 20 minutes for long-running capability scans (some taking 8-11 minutes)
- **API response structure alignment**: Fixed all test assertions to match actual API responses instead of assumptions
- **Proper scan completion waiting**: Implemented tests that wait for `step: 'complete'` before expecting data availability
- **Clean database state**: Implemented `beforeEach` cleanup ensuring predictable test isolation
- **Parameter usage corrections**: Fixed `response` vs `resourceList` parameter usage in workflow steps

**Additional Work Done**:
- Established pattern for comprehensive API response validation using actual response inspection
- Implemented proper error handling for Kyverno resource processing issues
- Created robust test foundation that validates real capability scanning with Kubernetes clusters
- Demonstrated successful long-running scans (8-11 minutes) creating and storing capabilities in vector database

**Next Session Priorities**:
- Implement patterns integration tests (organizational patterns CRUD)
- Implement policies integration tests (policy intents CRUD)
- Set up separate Qdrant database for recommendation testing
- Apply same testing patterns to remaining tools (remediate, recommend, testDocs)

---

*This PRD is a living document and will be updated as the implementation progresses.*