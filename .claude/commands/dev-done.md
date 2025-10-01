---
description: Stop MCP test server and tear down test cluster when development work is complete
---

# Development Cleanup

Stop all running development and testing infrastructure when work is complete.

## Cleanup Steps

### 1. Stop MCP Test Server
- [ ] **Check for running server**: Use BashOutput tool to check if background bash process running `npm run test:integration:server` exists
- [ ] **Stop server if running**: Use KillShell tool to kill the background server process
- [ ] **Verify server stopped**: Confirm no MCP server processes remain

### 2. Tear Down Test Cluster
- [ ] **Run teardown script**: Execute `npm run test:integration:teardown` to remove the test Kubernetes cluster and all resources
- [ ] **Verify cleanup complete**: Script will delete Kind cluster `dot-test`, Qdrant container, and test kubeconfig

## When to Use This

Run this cleanup when:
- ✅ All development work is complete
- ✅ All tests have passed
- ✅ PRs are merged
- ✅ No longer actively developing or testing

## Note

This command is safe to run even if the server or cluster are not running - the teardown script handles missing resources gracefully.
