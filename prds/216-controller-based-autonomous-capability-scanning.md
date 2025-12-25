# PRD: Controller-Based Autonomous Capability Scanning

**Issue**: #216
**Status**: Phase 2 Complete
**Priority**: High
**Created**: 2025-11-11
**Last Updated**: 2025-12-25
**Phase 2 PRD**: [dot-ai-controller #34](https://github.com/vfarcic/dot-ai-controller/issues/34)

## Scope Clarification

This PRD covers **two phases**:

1. **Phase 1 (This Repository)**: MCP API changes to support controller integration - adding a simplified fire-and-forget scan API
2. **Phase 2 (dot-ai-controller Repository)**: After Phase 1 is complete, a new PRD will be created in the `dot-ai-controller` repository for the actual controller implementation

This document focuses primarily on Phase 1 requirements and provides context for Phase 2.

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
4. Controller sends fire-and-forget HTTP POST to MCP server:
   ```json
   POST /api/v1/tools/manageOrgData
   {
     "dataType": "capabilities",
     "operation": "scan",
     "resourceList": "RDSInstance.database.aws.crossplane.io"
   }
   ```
5. MCP server scans the new resource asynchronously and stores capability data
6. Users get recommendations for AWS RDS in their next deployment

**Resource Removal**:
1. Team uninstalls operator, CRD is deleted
2. Controller detects deletion event
3. Controller sends HTTP POST to MCP server:
   ```json
   POST /api/v1/tools/manageOrgData
   {
     "dataType": "capabilities",
     "operation": "delete",
     "id": "RDSInstance.database.aws.crossplane.io"
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

**Current State**: The existing `manageOrgData` scan operation uses an interactive multi-step workflow designed for human users. This requires multiple API calls and session management, which is unsuitable for automated controller use.

**Required Changes (Phase 1)**: Add a simplified "fire-and-forget" API mode for controller integration.

#### Existing Endpoints (No Changes Needed)

```json
// Check for existing capabilities
POST /api/v1/tools/manageOrgData
{
  "dataType": "capabilities",
  "operation": "list",
  "limit": 10,
  "collection": "capabilities"
}
// Response: { "success": true, "data": { "capabilities": [...], "totalCount": N } }

// Get specific capability by ID
POST /api/v1/tools/manageOrgData
{
  "dataType": "capabilities",
  "operation": "get",
  "id": "Service",
  "collection": "capabilities"
}

// Delete capability by ID (capability ID = resource name)
POST /api/v1/tools/manageOrgData
{
  "dataType": "capabilities",
  "operation": "delete",
  "id": "Service",
  "collection": "capabilities"
}
```

**Note**: Capability IDs are the resource name (e.g., `"Service"`, `"Deployment"`, `"sqls.devopstoolkit.live"`).

#### New Endpoints Required (Phase 1 Deliverable)

```json
// Fire-and-forget: Trigger full cluster scan
// Controller calls this on startup if no capabilities exist
POST /api/v1/tools/manageOrgData
{
  "dataType": "capabilities",
  "operation": "scan",
  "mode": "full",
  "collection": "capabilities"
}
// Response: { "success": true, "status": "started", "message": "Full scan initiated" }
// Scan runs in background - no polling required

// Fire-and-forget: Trigger resource scan
// Controller calls this when CRD create/update event detected
// resourceList is a comma-separated string of Kind.group format
POST /api/v1/tools/manageOrgData
{
  "dataType": "capabilities",
  "operation": "scan",
  "resourceList": "RDSInstance.database.aws.crossplane.io,Bucket.s3.aws.crossplane.io",
  "collection": "capabilities"
}
// Response: { "success": true, "status": "started", "message": "Scan initiated for 2 resources" }
// Scan runs in background - no polling required
```

**Key Design Decisions**:
- `resourceList` is a comma-separated string: `"Kind.group"` for grouped resources, `"Kind"` for core resources (e.g., `"Service"`)
- Fire-and-forget: Controller does not poll for completion - MCP handles scanning asynchronously
- Existing interactive workflow remains unchanged for human users

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

### Phase 1: MCP API Changes (This Repository)

#### Milestone 1.1: Fire-and-Forget Scan API ✅
**Deliverable**: Simplified scan API that bypasses interactive workflow for controller use

- [x] Add `mode: "full"` parameter support to trigger full cluster scan without workflow
- [x] Add direct `resourceList` parameter support to scan specific resources without workflow
- [x] Return immediate `{ "status": "started" }` response for fire-and-forget operations
- [x] Ensure background scanning works correctly without session management
- [x] Write integration tests for new fire-and-forget endpoints

**Success Criteria**:
- `POST { operation: "scan", mode: "full" }` triggers full scan and returns immediately ✅
- `POST { operation: "scan", resourceList: "Kind.group" }` triggers resource scan and returns immediately ✅
- Existing interactive workflow continues to work unchanged for human users ✅
- Integration tests pass for both fire-and-forget and interactive modes ✅

#### Milestone 1.2: Create Controller PRD ✅
**Deliverable**: New PRD in `dot-ai-controller` repository for Phase 2 work

- [x] Write comprehensive PRD in `dot-ai-controller` repository based on Phase 2 context below
- [x] Include accurate API documentation from Phase 1 implementation
- [x] Reference this PRD for architectural context

**Success Criteria**:
- Controller PRD contains all information needed for implementation ✅
- API examples match actual MCP implementation ✅
- No dependencies on dot-ai repository for controller development ✅

**Deliverable**: [dot-ai-controller PRD #34](https://github.com/vfarcic/dot-ai-controller/blob/main/prds/done/34-autonomous-capability-scanning.md)

---

### Phase 2: Controller Implementation (dot-ai-controller Repository) ✅

**Status**: Complete

See [dot-ai-controller PRD #34](https://github.com/vfarcic/dot-ai-controller/blob/main/prds/done/34-autonomous-capability-scanning.md) for implementation details.

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

### Phase 1 Prerequisites (MCP API Changes)
- ✅ `manageOrgData` tool with `capabilities` dataType (PRD #132, implemented)
- ✅ HTTP endpoints exposed by MCP server (existing)
- ✅ Qdrant vector database for capability storage (existing)
- ✅ Fire-and-forget scan API (this PRD, Phase 1 - Milestone 1.1)

### Phase 2 Prerequisites (Controller Implementation)
- ✅ **Phase 1 complete** - Fire-and-forget API implemented and tested
- ✅ New PRD created in `dot-ai-controller` repository ([PRD #34](https://github.com/vfarcic/dot-ai-controller/issues/34))

### Related PRDs
- **PRD #155: Parallel Capability Analysis** - Future: controller could leverage parallel scanning
- **PRD #180: Dynamic Credential Management** - May inform controller authentication design

### External Dependencies
- Kubernetes cluster with API access (minimum version: 1.20+)
- MCP server deployed and accessible via cluster DNS
- RBAC permissions for controller ServiceAccount

## Phase 3: Documentation Updates (This Repository)

After Phase 2 (controller implementation) is complete, update dot-ai documentation:

### Milestone 3.1: Update Kubernetes Setup Guide ✅
- [x] Update `docs/setup/kubernetes-setup.md` to explain capability scanning controller installation
- [x] Add context: Many tools depend on capability data (recommend, patterns, policies, resources)
- [x] Explain that without capability scanning, these features may not work
- [x] Document the controller as the recommended approach for keeping capabilities up-to-date

### Milestone 3.2: Update Capability Documentation
- [ ] Document when to use controller vs manual scanning (based on MCP accessibility)
- [ ] Explain controller is recommended when MCP is accessible from cluster
- [ ] Explain manual scanning is required when MCP is not accessible (local development, Docker Desktop, etc.)
- [ ] Update any guides that reference capability scanning to include both approaches

### Milestone 3.3: Consolidate Documentation Links
- [ ] Find all links pointing directly to the controller repo (github.com/vfarcic/dot-ai-controller)
- [ ] Update links to point to the unified documentation site covering both MCP and controller
- [ ] Ensure cross-references point to specific pages, not just repo/site root (e.g., remediation guide here should link to controller's remediation-guide.md, not the repo root)
- [ ] Ensure consistent cross-referencing between MCP and controller documentation

---

## Design Decisions

### 2025-12-25: Manual Scanning Retained (Not Deprecated)

**Decision**: Manual capability scanning via MCP will NOT be deprecated. Both controller-based and manual scanning remain fully supported.

**Rationale**: The controller runs inside Kubernetes and can only reach MCP endpoints that are network-accessible from the cluster. When MCP runs in locations not accessible from the cluster (e.g., developer laptop, Docker Desktop, behind NAT), manual scanning is the only option.

**Guidance**:
| MCP Accessibility from Cluster | Scanning Method |
|-------------------------------|-----------------|
| Accessible | Controller (recommended) or Manual |
| Not accessible | Manual only |

Use the controller for automatic scanning when MCP is accessible from the Kubernetes cluster. Use manual scanning when MCP is not accessible (e.g., running locally on your laptop).

**Impact**:
- Removed planned deprecation of interactive scan workflow
- Removed planned removal of scan operation
- Phase 3 documentation will explain when to use each approach instead of deprecation notices

---

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

### 2025-12-25: Quick-Start Documentation Improvements
**Focus**: Validate and improve quick-start guide for better onboarding experience

**Documentation Changes**:
- [x] Moved Kubernetes setup to top as recommended method (over Docker) since controller requires it
- [x] Added Step 0: Kind cluster creation with ingress support for users without a cluster
- [x] Added INGRESS_CLASS_NAME environment variable with comment explaining customization
- [x] Fixed step numbering consistency (### Step X format throughout)
- [x] Fixed MCP config token expansion (removed 'EOF' quotes so $DOT_AI_AUTH_TOKEN expands)
- [x] Simplified Step 5 conversational workflows from ~110 lines to compact table (~15 lines)
- [x] Added "Operate resources" feature to examples
- [x] Reordered features table with capabilities at top (since others depend on it)

**Validation Performed**:
- Created Kind cluster with ingress port mappings
- Installed nginx ingress controller for Kind
- Installed dot-ai-controller via helm
- Installed dot-ai MCP server via helm (using local chart)
- Verified "Show dot-ai status" returns healthy status
- Tested MCP client configuration with `--mcp-config` and `--strict-mcp-config` flags

**Files Updated**:
- `docs/quick-start.md` - Major restructuring
- `docs/setup/kubernetes-setup.md` - Added INGRESS_CLASS_NAME
- `docs/setup/mcp-setup.md` - Reordered setup methods (Kubernetes first)
- `docs/index.md` - Reordered deployment options

**Next Steps**: Continue to Milestone 3.2 - Update capability management guide

---

### 2025-12-25: Milestone 3.1 Complete - Kubernetes Setup Guide Updated
**Focus**: Documentation updates for capability scanning

**Completed PRD Items**:
- [x] Updated controller section to reference controller docs (avoiding feature list drift)
- [x] Added "Capability Scanning for AI Recommendations" section
- [x] Documented tools that depend on capabilities (recommend, patterns, policies)
- [x] Added scanning methods table (controller vs manual based on MCP accessibility)
- [x] Linked to controller docs and capability management guide

**Next Steps**: Milestone 3.2 - Update Capability Documentation

---

### 2025-12-25: Phase 2 Complete - Controller Implementation Done
**Focus**: Controller implementation in dot-ai-controller repository

**Status**: Phase 2 fully implemented in separate repository
- Controller watches Kubernetes API for CRD changes
- Triggers fire-and-forget scans via MCP server
- Includes Helm chart, metrics, and documentation

**Next Steps**: Phase 3 - Documentation updates in this repository

---

### 2025-12-25: Design Decision - Manual Scanning Not Deprecated
**Focus**: Revised deprecation strategy based on deployment topology analysis

**Decision**: Manual capability scanning will NOT be deprecated. Both controller-based and manual scanning remain fully supported.

**Rationale**: The controller runs inside Kubernetes and can only reach MCP endpoints that are network-accessible from the cluster. When MCP runs in locations not accessible from the cluster (e.g., developer laptop, Docker Desktop, behind NAT), manual scanning is the only option.

**Changes Made**:
- Removed "Deprecate Interactive Scan Workflow" from Future Tasks
- Removed "Remove Scan Operation" from Future Tasks
- Updated Milestone 3.2 to document when to use each approach instead of deprecation notices
- Added Design Decisions section with accessibility-based guidance

**Next Steps**: Continue with Phase 3 documentation updates using the revised approach

---

### 2025-12-24: Phase 1 Complete - Milestone 1.2 Controller PRD Created
**Focus**: Create comprehensive PRD in dot-ai-controller repository

**Completed PRD Items**:
- [x] Written comprehensive PRD in `dot-ai-controller` repository
- [x] Included accurate API documentation from Phase 1 implementation
- [x] Referenced this PRD for architectural context

**Deliverables**:
- GitHub Issue: [dot-ai-controller #34](https://github.com/vfarcic/dot-ai-controller/issues/34)
- PRD File: [prds/34-autonomous-capability-scanning.md](https://github.com/vfarcic/dot-ai-controller/blob/main/prds/34-autonomous-capability-scanning.md)

**Phase 1 Status**: Complete - All MCP API changes delivered
**Next Steps**: Phase 2 implementation begins in dot-ai-controller repository

---

### 2025-12-24: Milestone 1.1 Complete - Fire-and-Forget API Implemented
**Duration**: Multiple sessions
**Focus**: Fire-and-forget scan API and bug fixes

**Completed PRD Items**:
- [x] `mode: "full"` parameter triggers full cluster scan without workflow
- [x] `resourceList` parameter scans specific resources without workflow
- [x] Immediate `{ "status": "started" }` response for fire-and-forget operations
- [x] Background scanning works correctly without session management
- [x] Integration tests written and passing (9 tests in `manage-org-data-capabilities.test.ts`)

**Bug Fixes**:
- Fixed `discovery.ts` parser bug where resources without shortnames were skipped (4-column vs 5-column format)
- Added field validation assertions to verify stored capabilities have correct `apiVersion`, `version`, and `group` values

**Test Coverage**:
- Full cluster scan with `mode=full` validates ~90 capabilities stored with correct field values
- Targeted scan with `resourceList` validates specific resources (Deployment, Service, SQL CRD)
- Field validation for core resources (Pod, Service, ConfigMap), apps resources (Deployment, StatefulSet), and CRDs (CNPG Cluster)

**Next Session**: Create Controller PRD in `dot-ai-controller` repository (Milestone 1.2)

### 2025-12-24: PRD Restructured into Two Phases
- **Decision**: Split PRD into Phase 1 (MCP API changes) and Phase 2 (controller implementation)
- **Rationale**: The existing scan API uses an interactive multi-step workflow unsuitable for automated controller use. MCP must expose a simplified fire-and-forget API before controller work can begin.
- **Key Changes**:
  - Added Phase 1 milestones for MCP API changes in this repository
  - Phase 2 milestones will move to a new PRD in `dot-ai-controller` repository
  - Corrected API documentation to match actual implementation
  - Changed from `resource` object to `resourceList` comma-separated string format
  - Controller uses fire-and-forget pattern (no polling required)
  - Full scan on startup if empty, single-resource scans for CRD events

### 2025-11-11: PRD Created
- Initial PRD draft completed
- Clarified architecture: separate repository, optional Helm integration
- Defined 5 major milestones for implementation
- Identified key risks and mitigation strategies
