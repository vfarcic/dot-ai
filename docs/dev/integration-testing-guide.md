# Integration Testing Guide

## Prerequisites

### System Requirements

**Docker Desktop** must be installed and running on your system:
- macOS: [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
- Linux: [Docker Engine](https://docs.docker.com/engine/install/)
- Windows: [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/)

**Node.js** >= 18.0.0 must be installed on your system

### Development Environment

Install [Devbox](https://www.jetify.com/devbox) if you haven't already, then enter the Devbox shell to get all required tools:

```bash
devbox shell
```

This provides:
- **kind** - Kubernetes in Docker
- **kubectl** - Kubernetes CLI
- **helm** - Kubernetes package manager
- **git**

### Required Environment Variables

Set these before running tests (see [MCP Setup Guide](../setup/mcp-setup.md) for all supported models):

```bash
# Example with Claude (default) + OpenAI embeddings
export ANTHROPIC_API_KEY="your-api-key"
export OPENAI_API_KEY="your-api-key"
```

## Quick Start

### 1. Setup Test Cluster

```bash
npm run test:integration:setup
```

**What it does:**
- Creates a Kind cluster named `dot-test`
- Installs CloudNativePG operator (PostgreSQL)
- Installs Kyverno policy engine
- Starts Qdrant vector database in Docker
- Generates `kubeconfig-test.yaml` in project root

**Expected output:**
```
🚀 Setting up integration test cluster...
📋 Creating Kind cluster...
✅ Kind cluster created successfully
⏳ Waiting for cluster to be ready...
📦 Installing CloudNativePG operator...
📦 Installing Kyverno Policy Engine...
📦 Starting Qdrant Vector Database (Docker)...
✅ Integration test cluster setup complete!
```

**Time:** ~2-3 minutes

---

### 2. Start REST API Server

```bash
npm run test:integration:server &
```

**What it does:**
- Builds the project (if needed)
- Starts the REST API server on port 3456
- Uses `kubeconfig-test.yaml` for cluster access
- Runs in background

**Expected output:**
```
> @vfarcic/dot-ai@0.101.0 test:integration:server
> KUBECONFIG=./kubeconfig-test.yaml PORT=3456 ... node dist/mcp/server.js

REST API server listening on port 3456
```

**Important:** Keep this running in the background while tests execute

---

### 3. Run All Integration Tests

```bash
npm run test:integration
```

**What it does:**
- Runs all integration tests in `tests/integration/`
- Uses Vitest with parallel execution (20 workers, 5 concurrent per file)
- 20-minute timeout per test
- Connects to REST API server on port 3456

**Expected output:**
```
RUN  v3.2.4 /Users/viktorfarcic/code/dot-ai

✓ tests/integration/tools/version.test.ts (4 tests) 2.44s
✓ tests/integration/tools/manage-org-data-capabilities.test.ts (16 tests) ...
✓ tests/integration/tools/manage-org-data-patterns.test.ts (9 tests) ...
✓ tests/integration/tools/manage-org-data-policies.test.ts (10 tests) ...
✓ tests/integration/tools/recommend.test.ts (1 test) ...
✓ tests/integration/tools/remediate.test.ts (2 tests) ...

Test Files  6 passed (6)
     Tests  38 passed (38)
  Start at  [timestamp]
  Duration  ~375s
```

**Time:** ~6-8 minutes with parallelization

---

## Selective Test Execution

### Run a Single Test File

```bash
npm run test:integration tests/integration/tools/version.test.ts
```

### Run Multiple Test Files by Pattern

```bash
npm run test:integration tests/integration/tools/manage-org-data*.test.ts
```

### Run Tests by Name Pattern

```bash
npm run test:integration -- -t "should return comprehensive system status"
```

This runs only tests whose names match the pattern.

---

## Debugging Failed Tests

### Increase Verbosity

Tests already run with verbose output by default. Check the terminal for:
- Test names and status
- Execution times
- Detailed error messages and stack traces

### Check Server Logs

The REST API server running in the background shows request/response logs. Check that terminal/process for:
- API requests being made by tests
- Tool execution details
- Error messages from the server

### Verify Cluster State

```bash
export KUBECONFIG=./kubeconfig-test.yaml
kubectl get nodes
kubectl get pods --all-namespaces
```

### Check Qdrant Database

```bash
curl http://localhost:6333/collections
```

### Common Issues

**Port 3456 already in use:**
```bash
lsof -ti:3456 | xargs kill -9
npm run test:integration:server &
```

**Cluster not responding:**
```bash
export KUBECONFIG=./kubeconfig-test.yaml
kubectl get nodes
# If cluster is dead, teardown and setup again
npm run test:integration:teardown
npm run test:integration:setup
```

**Qdrant not accessible:**
```bash
docker ps | grep qdrant-test
# If not running, restart it
docker start qdrant-test
```

---

## Adding New Integration Tests

### Test File Structure

Create test files in `tests/integration/tools/` following this pattern:

```typescript
import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base';

describe('MyTool Integration', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    // Clean state before tests
    await cleanup();
  });

  test('should complete full workflow', async () => {
    const response = await integrationTest.httpClient.post('/api/v1/tools/mytool', {
      // Test data
    });

    const expectedResponse = {
      success: true,
      data: {
        result: {
          // Expected structure
        }
      }
    };

    expect(response).toMatchObject(expectedResponse);
  }, 300000); // 5-minute timeout for long-running tests
});
```

### Follow Established Patterns

See `tests/integration/CLAUDE.md` for comprehensive integration testing standards:
- Use `toMatchObject` for consistent validation
- Prefer specific values over generic matchers
- One comprehensive workflow test over multiple fragmented tests
- Use `beforeAll` for cleanup to avoid race conditions

### Namespace Management

For tests that deploy resources to the cluster:
```typescript
const integrationTest = new IntegrationTest();

// Namespace lifecycle will be added back when needed
// Currently, most tests use the ManageOrgData API which doesn't require namespaces
```

---

## Performance Tips

### Parallel Execution

Tests run with 20 workers and 5 concurrent tests per file by default. This is configured in `vitest.integration.config.ts`.

### Test Timeouts

- Default: 20 minutes per test
- Adjust for specific tests: `test('name', async () => { ... }, 600000)` (10 minutes)

### Development Iteration

For fast feedback during development:
1. Keep cluster and server running
2. Use selective test execution for specific files

**Fast iteration workflow:**
```bash
# Terminal 1: Setup once
npm run test:integration:setup
npm run test:integration:server

# Terminal 2: Run specific tests repeatedly
npm run test:integration tests/integration/tools/version.test.ts
```

This avoids waiting 6-8 minutes for the full test suite on every change.

---

## Teardown

When finished testing, clean up all resources:

```bash
npm run test:integration:teardown
```

**What it does:**
- Deletes the Kind cluster
- Removes `kubeconfig-test.yaml`
- Stops and removes Qdrant Docker container
- Cleans up any remaining test resources

**Time:** ~10-15 seconds

---

## CI/CD Integration

_(Coming in Milestone 3)_

Integration tests will run automatically on every pull request via GitHub Actions.

---

## Additional Resources

- **Integration Testing Standards**: `tests/integration/CLAUDE.md`
- **PRD**: `prds/111-integration-testing.md`
- **Test Examples**: `tests/integration/tools/*.test.ts`

