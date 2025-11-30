# PRD: Controller-Based Autonomous Capability Scanning

**Issue**: #216
**Status**: Draft
**Priority**: High
**Created**: 2025-11-11
**Last Updated**: 2025-11-11

## Problem Statement

Capability scanning in DevOps AI Toolkit currently requires manual initiation via MCP server calls. This creates several operational challenges:

1. **Manual Overhead**: Users must explicitly trigger capability scans when cluster resources change
2. **Stale Data**: Capability data can become outdated when CRDs or resource definitions are added/removed
3. **Discovery Lag**: New operators or custom resources aren't automatically discovered
4. **Operational Burden**: DevOps teams must remember to trigger scans after cluster changes

This reactive scanning model doesn't align with Kubernetes' event-driven architecture and creates unnecessary friction in maintaining accurate capability data.

## Solution Overview

Deploy a Kubernetes controller that autonomously manages capability scanning by:

1. **Initial Discovery**: On startup, check if capabilities exist in the database via MCP server; if not, initiate full cluster scan
2. **Event-Driven Updates**: Watch Kubernetes API for CRD and resource definition changes (create/update/delete events)
3. **MCP Coordination**: Send HTTP requests to MCP server's `manageOrgData` tool to scan or remove capabilities
4. **Resilient Operation**: Retry failed operations and expose metrics for observability

**Key Design Principle**: The controller is a coordinator, not a scanner. All actual scanning logic remains in the MCP server - the controller simply triggers it at the right times.

## Architecture

### Repository Structure
- **New Repository**: `dot-ai-controller` (separate codebase)
- **Independent Release**: Separate versioning and release process
- **Optional Integration**: Included as optional component in main `dot-ai` Helm chart

### Controller Design
```
┌─────────────────────────────────────┐
│  Kubernetes Cluster                 │
│                                     │
│  ┌──────────────────────┐          │
│  │  dot-ai-controller   │          │
│  │                      │          │
│  │  1. Watch API Events │          │
│  │  2. HTTP Client      │──────┐   │
│  │  3. Retry Logic      │      │   │
│  └──────────────────────┘      │   │
│           │                    │   │
│           │ watches            │   │
│           ↓                    │   │
│  ┌──────────────────────┐     │   │
│  │  Kubernetes API      │     │   │
│  │  - CRDs              │     │   │
│  │  - Built-in Resources│     │   │
│  └──────────────────────┘     │   │
│                                │   │
│  ┌──────────────────────┐     │   │
│  │  dot-ai MCP Server   │◄────┘   │
│  │  HTTP Endpoints      │         │
│  │  /api/v1/tools/      │         │
│  │    manageOrgData     │         │
│  └──────────────────────┘         │
└─────────────────────────────────────┘
```

## User Experience

### Installation Flow

1. **Deploy MCP Server** (existing):
   ```bash
   helm install dot-ai ./charts/dot-ai
   ```

2. **Enable Controller** (new, optional):
   ```bash
   helm install dot-ai ./charts/dot-ai \
     --set controller.enabled=true \
     --set controller.mcp.endpoint=http://dot-ai-mcp:8080
   ```

3. **Configure Scanning** (via Custom Resource):
   ```yaml
   apiVersion: dot-ai.io/v1alpha1
   kind: CapabilityScanConfig
   metadata:
     name: default-scan-config
   spec:
     mcp:
       endpoint: http://dot-ai-mcp:8080
       collection: capabilities  # Qdrant collection name

     # Resource filters
     includeResources:
       - "deployments.apps"
       - "*.crossplane.io"
       - "applications.argoproj.io"

     excludeResources:
       - "events.v1"
       - "*.internal.example.com"

     # Retry configuration
     retry:
       maxAttempts: 3
       backoffSeconds: 5
   ```

### Operational Workflow

**Day 1 - Initial Setup**:
1. User deploys Helm chart with controller enabled
2. Controller starts and checks MCP server for existing capabilities
3. If no capabilities exist, controller initiates full scan via MCP
4. Controller enters watch mode for future changes

**Day 2+ - Autonomous Operation**:
1. DevOps team installs Crossplane provider (e.g., `provider-aws`)
2. New CRDs are created (e.g., `RDSInstance.database.aws.crossplane.io`)
3. Controller detects CRD creation event
4. Controller sends HTTP POST to MCP server:
   ```json
   POST /api/v1/tools/manageOrgData
   {
     "dataType": "capabilities",
     "operation": "scan",
     "resource": {
       "kind": "RDSInstance",
       "group": "database.aws.crossplane.io",
       "apiVersion": "v1alpha1"
     }
   }
   ```
5. MCP server scans the new resource and stores capability data
6. Users immediately get recommendations for AWS RDS in their next deployment

**Resource Removal**:
1. Team uninstalls operator, CRD is deleted
2. Controller detects deletion event
3. Controller sends HTTP POST to MCP server:
   ```json
   POST /api/v1/tools/manageOrgData
   {
     "dataType": "capabilities",
     "operation": "delete",
     "resource": {
       "kind": "RDSInstance",
       "group": "database.aws.crossplane.io",
       "apiVersion": "v1alpha1"
     }
   }
   ```
4. MCP server removes capability data from database

## Technical Design

### Controller Implementation

**Technology Stack**:
- **Language**: Go (standard for Kubernetes controllers)
- **Framework**: Kubebuilder or Controller Runtime
- **Client**: kubernetes/client-go
- **HTTP Client**: Standard Go net/http with retry logic

**Core Components**:

1. **Startup Reconciler**:
   - Check MCP server health
   - Query existing capabilities via `manageOrgData` list operation
   - If empty, enumerate all API resources and trigger full scan
   - Mark initialization complete

2. **Event Watcher**:
   - Watch all API resource types (CRDs and built-in)
   - Filter events based on `CapabilityScanConfig` include/exclude rules
   - Queue events for processing (rate-limited work queue)

3. **HTTP Client Manager**:
   - HTTP client pool for MCP server communication
   - Exponential backoff retry logic (configurable max attempts)
   - Request timeout handling
   - Error categorization (retryable vs. permanent failures)

4. **Observability**:
   - Prometheus metrics (scans triggered, failures, queue depth)
   - Structured logging (event details, retry attempts, outcomes)
   - Health endpoints for liveness/readiness probes

### MCP Server Integration

**Existing Endpoints** (no changes needed):

```typescript
// Check for existing capabilities
POST /api/v1/tools/manageOrgData
{
  "dataType": "capabilities",
  "operation": "list",
  "collection": "capabilities"
}

// Trigger scan for specific resource
POST /api/v1/tools/manageOrgData
{
  "dataType": "capabilities",
  "operation": "scan",
  "resource": {
    "kind": "Deployment",
    "group": "apps",
    "apiVersion": "v1"
  },
  "collection": "capabilities"
}

// Remove capability
POST /api/v1/tools/manageOrgData
{
  "dataType": "capabilities",
  "operation": "delete",
  "id": "Deployment.apps",
  "collection": "capabilities"
}
```

**Authentication**: Controller uses Kubernetes ServiceAccount with RBAC permissions to read API resources. MCP server endpoints are currently unauthenticated (internal cluster traffic). Future enhancement: add optional authentication via bearer tokens.

### Resource Filtering Logic

**Include/Exclude Processing**:
1. If `includeResources` is specified, only watch those patterns
2. Apply `excludeResources` as blacklist after includes
3. Patterns support wildcards: `*.crossplane.io`, `deployments.*`, `*`

**Example Configuration**:
```yaml
includeResources:
  - "*.crossplane.io"      # All Crossplane resources
  - "applications.*"        # All application CRDs (any group)
  - "deployments.apps"      # Specific built-in resource

excludeResources:
  - "events.*"              # Ignore all events
  - "*.internal.example.com" # Ignore internal CRDs
```

**Default Behavior** (no filters specified):
- Watch all API resources
- Exclude known high-volume resources: `events`, `leases`, `endpoints`

### Error Handling & Retry

**Retry Strategy**:
```go
type RetryConfig struct {
    MaxAttempts     int           // Default: 3
    InitialBackoff  time.Duration // Default: 5s
    MaxBackoff      time.Duration // Default: 5m
    BackoffFactor   float64       // Default: 2.0 (exponential)
}

// Example retry sequence:
// Attempt 1: immediate
// Attempt 2: after 5s
// Attempt 3: after 10s
// Attempt 4: after 20s
// Give up after MaxAttempts
```

**Error Categories**:
- **Retryable**: Network errors, 500/503 from MCP, timeouts
- **Non-Retryable**: 400 Bad Request, 404 Not Found, invalid resource format
- **Permanent Failure**: After max retry attempts, log error and expose metric

**Dead Letter Queue**: Failed events after max retries are logged with structured data for manual investigation/replay.

## Milestones

### Milestone 1: Controller Foundation
**Deliverable**: Working controller that watches API resources and logs events

- [ ] Create new `dot-ai-controller` repository with Go module structure
- [ ] Implement Kubebuilder scaffold with CRD for `CapabilityScanConfig`
- [ ] Build event watcher for all API resources (CRDs + built-in types)
- [ ] Implement include/exclude filtering logic with wildcard support
- [ ] Add structured logging and basic metrics (events watched, filtered)

**Success Criteria**:
- Controller deploys successfully in test cluster
- Logs show detection of CRD create/update/delete events
- Filtering rules correctly include/exclude resources based on config
- No crashes or memory leaks during 24-hour run

### Milestone 2: MCP Server Integration
**Deliverable**: Controller successfully communicates with MCP server

- [ ] Implement HTTP client with retry logic (exponential backoff)
- [ ] Build startup reconciler that checks for existing capabilities
- [ ] Implement scan operation triggering via `manageOrgData` endpoint
- [ ] Implement delete operation for removed resources
- [ ] Add integration tests with mock MCP server

**Success Criteria**:
- Controller successfully queries MCP for existing capabilities on startup
- Controller triggers scans for new CRDs and receives successful responses
- Retry logic recovers from transient MCP server failures
- Delete operations successfully remove capabilities when CRDs are deleted

### Milestone 3: Resilience & Observability
**Deliverable**: Production-ready controller with full observability

- [ ] Implement work queue with rate limiting for event processing
- [ ] Add Prometheus metrics (scans triggered, success/failure rates, queue depth)
- [ ] Implement health endpoints (liveness, readiness) with proper checks
- [ ] Add dead letter queue logging for permanent failures
- [ ] Create runbook documentation for common failure scenarios

**Success Criteria**:
- Controller handles MCP server downtime gracefully (queues events, retries)
- Metrics accurately reflect operation counts and latencies
- Health checks correctly report controller state
- Failed events are logged with sufficient detail for debugging

### Milestone 4: Helm Chart Integration
**Deliverable**: Controller deployable via main dot-ai Helm chart

- [ ] Create controller Helm chart templates (Deployment, RBAC, ServiceAccount)
- [ ] Add optional controller component to main `dot-ai` Helm chart
- [ ] Implement chart values for controller configuration (endpoint, filters, retry)
- [ ] Add default `CapabilityScanConfig` resource to chart
- [ ] Document Helm installation options in main repository docs

**Success Criteria**:
- Users can enable controller via `--set controller.enabled=true`
- Controller configuration is manageable through Helm values
- RBAC permissions are correctly scoped (read API resources, no write permissions)
- Chart upgrades don't disrupt controller operation

### Milestone 5: Documentation & Testing
**Deliverable**: Complete documentation and end-to-end testing

- [ ] Create comprehensive README in controller repository
- [ ] Add architecture diagrams showing controller/MCP interaction
- [ ] Write end-to-end tests (install operator → verify scan → uninstall → verify delete)
- [ ] Create troubleshooting guide with common issues and solutions
- [ ] Add performance testing documentation (resource usage, scaling limits)

**Success Criteria**:
- New users can deploy and configure controller following README alone
- E2E tests validate complete workflow from CRD creation to capability availability
- Troubleshooting guide addresses failure scenarios discovered during testing
- Performance characteristics documented (events/sec, memory usage)

## Success Metrics

**Operational Metrics**:
- **Scan Latency**: Time from CRD creation to capability availability in recommendations
  - Target: < 60 seconds for single resource scan
- **Error Rate**: Percentage of scan operations that fail permanently
  - Target: < 1% failure rate under normal conditions
- **Resource Efficiency**: Controller memory and CPU usage
  - Target: < 50MB memory, < 0.1 CPU cores at steady state

**User Experience Metrics**:
- **Setup Time**: Time to deploy and configure controller
  - Target: < 5 minutes using Helm chart
- **Discovery Accuracy**: Percentage of new CRDs that are automatically scanned
  - Target: 100% for included resources
- **Staleness Elimination**: Reduce manual scan triggers to zero

## Risks & Mitigation

### Risk 1: Event Storm Handling
**Risk**: Large cluster with frequent CRD changes could overwhelm controller/MCP server

**Mitigation**:
- Implement rate-limited work queue (configurable events/sec)
- Add batch scanning option for initial full scan
- Document resource requirements for large clusters
- Consider parallelization in future iteration (relates to PRD #155)

### Risk 2: MCP Server Availability
**Risk**: Controller depends on MCP server; downtime blocks capability updates

**Mitigation**:
- Implement persistent work queue that survives restarts
- Retry with exponential backoff prevents thundering herd
- Expose metrics showing queue depth and failure rates
- Document recovery procedures in runbook

### Risk 3: Partial Scans After Failures
**Risk**: Initial scan partially completes, leaving some resources unscanned

**Mitigation**:
- Track initial scan state in controller status condition
- Resume incomplete initial scan on restart
- Expose metric showing scan completion percentage
- Log detailed progress during initial scan

### Risk 4: Repository/Release Coordination
**Risk**: Separate repository creates version alignment challenges with main project

**Mitigation**:
- Document compatible version matrix (controller ↔ MCP server)
- Use semantic versioning with clear API compatibility rules
- Test controller against multiple MCP server versions in CI
- Include version compatibility check in controller startup

## Dependencies

### Existing Capabilities
- ✅ `manageOrgData` tool with `capabilities` dataType (PRD #132, implemented)
- ✅ HTTP endpoints exposed by MCP server (existing)
- ✅ Qdrant vector database for capability storage (existing)

### Related PRDs
- **PRD #155: Parallel Capability Analysis** - Future: controller could leverage parallel scanning
- **dot-ai-controller PRD #4: Solution CRD for Deployment Tracking** - Synergy: both implemented in dot-ai-controller repo
- **PRD #180: Dynamic Credential Management** - May inform controller authentication design

### External Dependencies
- Kubernetes cluster with API access (minimum version: 1.20+)
- MCP server deployed and accessible via cluster DNS
- RBAC permissions for controller ServiceAccount

## Future Enhancements

**Phase 2 - Advanced Features**:
1. **Scheduled Scanning**: Periodic full scans to detect drift (e.g., manual database changes)
2. **Parallel Processing**: Integrate with PRD #155 for faster initial scans
3. **Multi-Cluster**: Watch multiple clusters from single controller instance
4. **Selective Scanning**: Allow fine-grained control over which resource fields to scan
5. **Webhook Integration**: Use ValidatingWebhook to scan resources before they're created

**Phase 3 - Intelligence**:
1. **Priority Scanning**: Scan frequently-used resources first based on recommendation history
2. **Change Detection**: Only re-scan resources when their schema actually changes
3. **Capability Prediction**: Pre-scan resources likely to be needed based on cluster patterns

## Open Questions

1. **Authentication**: Should controller authenticate to MCP server, or rely on network policies?
   - Current decision: Start without auth (internal cluster traffic), add optional auth in Phase 2

2. **Initial Scan Scope**: Should initial scan exclude built-in Kubernetes resources that are unlikely to be used in recommendations (e.g., Nodes, Events)?
   - Proposed: Add smart defaults that exclude high-volume, low-value resources

3. **Version Compatibility**: How strictly should controller version be tied to MCP server version?
   - Proposed: Document compatibility matrix, test against N and N-1 MCP versions

4. **Multi-Tenancy**: Should single controller handle multiple Qdrant collections?
   - Future consideration: Allow multiple `CapabilityScanConfig` resources with different collections

## References

- [Kubernetes Controller Pattern](https://kubernetes.io/docs/concepts/architecture/controller/)
- [Kubebuilder Book](https://book.kubebuilder.io/)
- [Controller Runtime](https://github.com/kubernetes-sigs/controller-runtime)
- [PRD #132: Cluster Capability Discovery via manageOrgData](https://github.com/vfarcic/dot-ai/issues/132)
- [PRD #155: Parallel Capability Analysis](https://github.com/vfarcic/dot-ai/issues/155)

---

## Progress Log

### 2025-11-11: PRD Created
- Initial PRD draft completed
- Clarified architecture: separate repository, optional Helm integration
- Defined 5 major milestones for implementation
- Identified key risks and mitigation strategies
