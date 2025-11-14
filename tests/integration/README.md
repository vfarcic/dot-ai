# Integration Tests

Comprehensive integration tests for the DevOps AI Toolkit that validate real system behavior against actual Kubernetes clusters and AI services.

## Philosophy: Integration-Only Testing

This framework follows the **Zero Unit Tests** philosophy outlined in PRD 111. All tests validate real system behavior using:

- **Real Kubernetes clusters** (Kind test clusters)
- **Real AI models** (Claude Haiku for speed)
- **Real HTTP REST API calls**
- **Real namespace lifecycle management**

**Why no unit tests?** The dot-ai toolkit's value lies entirely in integrating Kubernetes, AI, and databases. Testing these in isolation with mocks provides false confidence and doesn't validate actual behavior.

## Quick Start

### 1. Setup Test Cluster

```bash
# Create dedicated test cluster with CNPG operator
npm run test:integration:setup

# Verify cluster is ready
KUBECONFIG=./kubeconfig-test.yaml kubectl get nodes
```

### 2. Start Test Server

```bash
# Start REST API server with test configuration
npm run test:integration:server
# Server runs on http://localhost:3456 with test cluster
```

### 3. Run Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run tests in watch mode
npm run test:integration:watch

# Run specific test
npm run test:integration -- --testNamePattern="Version Tool"
```

### 4. Cleanup

```bash
# Destroy test cluster when done
npm run test:integration:teardown
```

## Test Environment Configuration

### Automatic Environment Setup

Tests automatically configure the environment for isolation:

```typescript
// tests/integration/setup.ts
process.env.KUBECONFIG = './kubeconfig-test.yaml';  // Test cluster only
process.env.MODEL = 'claude-haiku-4-5-20251001';    // Fast AI model (Haiku 4.5)
process.env.DEBUG_DOT_AI = 'true';                 // Detailed logging
```

### Test Cluster Details

- **Cluster Name**: `dot-test` (Kind cluster)
- **Kubeconfig**: `./kubeconfig-test.yaml`
- **Context**: `kind-dot-test`
- **Operators**: CloudNativePG, Kyverno (optional)
- **Port Forwarding**: 3456 → REST API server

### Optional: Skip Operators for Faster Setup

For faster test setup (especially useful on slow networks like airport WiFi), you can skip installing operators that aren't needed for your tests:

```bash
# Skip CloudNativePG operator (not needed for most tests)
SKIP_CNPG=true npm run test:integration operate

# Skip Kyverno Policy Engine (not needed for most tests)
SKIP_KYVERNO=true npm run test:integration operate

# Skip both for fastest setup
SKIP_CNPG=true SKIP_KYVERNO=true npm run test:integration operate
```

**Note**: Only skip operators if your tests don't require them. For example:
- `operate` tool tests: Can skip both (only needs Kubernetes + Qdrant)
- `recommend` tool tests: Can skip both
- `remediate` tool tests: Can skip both
- Tests using PostgreSQL: Need CNPG
- Tests using policy validation: Need Kyverno

## Writing Integration Tests

### Test Development Best Practice

**CRITICAL**: Always inspect actual API responses before writing assertions.

```bash
# 1. Start test server
npm run test:integration:server

# 2. Inspect actual API response
curl -X POST -H "Content-Type: application/json" -d '{}' \
  http://localhost:3456/api/v1/tools/version

# 3. Write assertions based on ACTUAL structure, not assumptions
expect(response.data.result.system.kubernetes.connected).toBe(true);
```

### Base Test Pattern

```typescript
import { IntegrationTest } from '../helpers/test-base';

describe('Your Tool Integration', () => {
  const test = new IntegrationTest();

  beforeEach(async () => {
    await test.setup('your-test'); // Creates unique namespace
  });

  afterEach(async () => {
    await test.cleanup(); // Deletes namespace (async, non-blocking)
  });

  test('should validate actual behavior', async () => {
    // Use POST for tool calls (all tools require POST)
    const response = await test.httpClient.post('/api/v1/tools/your-tool', {
      param1: 'value1'
    });

    // Focus on behavioral validation, not just structural
    expect(response.success).toBe(true);
    expect(response.data.result).toBeDefined();

    // Test logical consistency
    if (response.data.result.connected) {
      expect(response.data.result.clusterInfo).toBeDefined();
    }
  });
});
```

### Behavioral vs Structural Testing

**✅ Behavioral Testing (Preferred)**
```typescript
// Test actual behavior and logical consistency
expect(system.version.version).toMatch(/^\d+\.\d+\.\d+$/);  // Valid semver
expect(system.kubernetes.connected).toBe(true);            // Should be connected
expect(result.summary.kubernetesAccess).toBe('connected'); // Consistency
```

**❌ Structural Testing (Only when necessary)**
```typescript
// Only for dynamic/AI-generated content where behavior can't be predicted
expect(response.meta.requestId).toBeDefined();  // Structure only
expect(system.ai.response).toContain('kubernetes'); // AI content varies
```

### Namespace Isolation

Each test runs in a unique namespace for perfect isolation:

```typescript
// Automatic namespace creation: test-{workerId}-{testName}-{timestamp}
await test.setup('crashloop');  // Creates: test-1-crashloop-1679123456789

// All resources created within test namespace
await test.createPod('test-pod', podSpec);

// Cleanup is automatic and non-blocking
await test.cleanup(); // Fires namespace deletion, returns immediately
```

## Available Test Utilities

### IntegrationTest Base Class

```typescript
class IntegrationTest {
  // Namespace lifecycle (automatic)
  async setup(testName?: string): Promise<void>
  async cleanup(): Promise<void>

  // HTTP client (configured for test server)
  httpClient: HttpRestApiClient

  // Kubernetes utilities
  async createPod(name: string, spec: V1PodSpec): Promise<V1Pod>
  async waitForPodCondition(name: string, condition: string): Promise<V1Pod>
  async getPods(): Promise<V1Pod[]>

  // Test scenario builders
  async createPodWithMissingConfigMap(name: string): Promise<V1Pod>
}
```

### HTTP Client

```typescript
// Configured for test server (localhost:3456)
await test.httpClient.post('/api/v1/tools/version', {});
await test.httpClient.get('/api/v1/health');  // Non-tool endpoints
```

## Performance & Parallelization

### Parallel Execution

Tests run in parallel with perfect isolation:

```javascript
// jest.integration.config.js
maxWorkers: process.env.CI ? 10 : 5  // Parallel test execution
```

### Fast Feedback

- **Single test**: 15-30 seconds with persistent cluster
- **Full suite**: 3-5 minutes with parallelization
- **Cluster setup**: ~2 minutes (one-time)

### Resource Management

- **Namespace deletion**: Async, non-blocking (`--wait=false`)
- **Cluster persistence**: Reuse cluster across test runs
- **Memory efficient**: ~50-100MB per test namespace

## Test Categories

### Tool Tests (`tests/integration/tools/`)
Test individual tools via REST API:
- Input validation
- Output format verification
- Error handling
- Performance baselines

### Scenario Tests (`tests/integration/scenarios/`)
Real-world problem scenarios:
- `crashloop-remediation.scenario.test.ts`
- `missing-configmap.scenario.test.ts`
- Named by business problem, not technical implementation

### Journey Tests (`tests/integration/journeys/`)
End-to-end user workflows:
- `deploy-application.journey.test.ts`
- Complete user stories from intent to running pods

## Troubleshooting

### Common Issues

**Test cluster not accessible:**
```bash
# Check cluster status
kind get clusters
KUBECONFIG=./kubeconfig-test.yaml kubectl get nodes

# Recreate if needed
npm run test:integration:teardown
npm run test:integration:setup
```

**Server not responding:**
```bash
# Check if server is running
curl http://localhost:3456/api/v1/health

# Check server logs for errors
npm run test:integration:server
```

**Tests failing due to timing:**
- Tests include proper wait conditions
- Namespace cleanup is async (don't wait for it)
- Use `test.waitForPodCondition()` for pod readiness

### Debug Mode

```bash
# Enable detailed logging
DEBUG_DOT_AI=true npm run test:integration
```

Debug logs are saved to `tmp/debug-ai/` when enabled.

## CI/CD Integration

Tests run automatically in GitHub Actions:

```yaml
# .github/workflows/integration-tests.yml
- name: Setup test cluster
  run: npm run test:integration:setup

- name: Run integration tests
  run: npm run test:integration
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Cleanup
  run: npm run test:integration:teardown
```

## Architecture

```
GitHub Actions → Jest → IntegrationTest → HTTP Client → REST API → dot-ai Tools → Test Cluster
                                                            ↓
                                                      Claude Sonnet
                                                   (High Quality AI)
```

### Key Design Decisions

1. **Real Kubernetes**: No mocking, actual kubectl operations
2. **Claude Sonnet**: High-quality model matching production performance
3. **Namespace isolation**: Perfect test isolation with simple cleanup
4. **HTTP REST API**: Standardized tool interface, easy to test
5. **Behavioral validation**: Test actual system behavior, not just structure

## Future Enhancements

- **Performance testing**: Load and stress testing for tools
- **Multi-cluster scenarios**: Cross-cluster testing
- **Chaos testing**: Tool behavior under failure conditions
- **Security testing**: Authorization and data validation

---

**Remember**: These tests prove the system actually works. Every passing test demonstrates real functionality that would work in production.