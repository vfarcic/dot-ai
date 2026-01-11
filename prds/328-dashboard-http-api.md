# PRD #328: Dashboard HTTP API Endpoints

## Overview

| Field | Value |
|-------|-------|
| **PRD ID** | 328 |
| **Feature Name** | Dashboard HTTP API Endpoints |
| **Status** | In Progress |
| **Priority** | Medium |
| **Created** | 2026-01-08 |
| **GitHub Issue** | [#328](https://github.com/vfarcic/dot-ai/issues/328) |

## Problem Statement

Building a Kubernetes dashboard UI requires structured, filterable queries against the Qdrant resource inventory. The existing `query` MCP tool only accepts natural language (`intent` field) and returns AI-synthesized summaries, which isn't suitable for programmatic table rendering.

**Current limitations:**
- No way to list all unique resource kinds with counts
- No structured filtering by kind, namespace, apiGroup
- No pagination support (limit/offset)
- Response format is AI-generated text, not structured data

## Solution

Add HTTP-only REST API endpoints that return structured JSON suitable for dashboard UIs:

1. **`GET /api/v1/resources/kinds`** - List all unique resource kinds with counts
2. **`GET /api/v1/resources`** - List resources with filtering and pagination
3. **`GET /api/v1/namespaces`** - List all namespaces
4. **`GET /api/v1/resource`** - Get single resource with full details
5. **`GET /api/v1/events`** - Get Kubernetes events for a specific resource

Additionally, extend the existing `manageOrgData` capabilities `get` operation to support retrieving resource schema information (including printer columns) for dynamic table column generation.

These endpoints provide structured query operations on the resource inventory, complementing the existing natural language `query` tool. Initially exposed via HTTP for dashboard use cases, but the underlying query functions are designed to be interface-agnostic and could be exposed via MCP in the future if needed.

## User Stories

1. **As a dashboard developer**, I want to list all resource kinds in the cluster so I can populate a sidebar navigation.

2. **As a dashboard developer**, I want to filter resources by kind and namespace so I can display them in a table.

3. **As a dashboard developer**, I want to paginate through resources so I can handle large clusters efficiently.

4. **As a dashboard developer**, I want to list all namespaces so I can provide a namespace filter dropdown.

5. **As a dashboard developer**, I want to get printer columns for a resource type so I can dynamically generate table columns that match `kubectl get` output.

6. **As a dashboard developer**, I want to fetch Kubernetes events for a specific resource so I can display scheduling decisions, image pulls, failures, and restarts in the Events tab.

7. **As a dashboard developer**, I want to fetch container logs for a Pod so I can display application output in the Logs tab for troubleshooting.

8. **As a dashboard developer**, I want the `[visualization]` mode query to return a sessionId so I can cache/bookmark dashboard URLs and avoid re-running expensive AI queries on page refresh.

## Technical Design

### Endpoint Specifications

#### 1. GET /api/v1/resources/kinds

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | string | No | Filter kinds by namespace (omit for all namespaces) |

**Response:**
```json
{
  "success": true,
  "data": {
    "kinds": [
      { "kind": "Deployment", "apiGroup": "apps", "apiVersion": "apps/v1", "count": 15 },
      { "kind": "Pod", "apiGroup": "", "apiVersion": "v1", "count": 42 },
      { "kind": "SQLClaim", "apiGroup": "devopstoolkit.live", "apiVersion": "devopstoolkit.live/v1alpha1", "count": 3 }
    ]
  },
  "meta": {
    "timestamp": "2026-01-08T12:00:00Z",
    "requestId": "req_123"
  }
}
```

**Implementation:**
- Fetch all resources from Qdrant using `getAllData()`
- Group by `kind + apiGroup + apiVersion`
- Count each group
- Sort by count descending

#### 2. GET /api/v1/resources

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | Yes | Resource kind (e.g., "Deployment") |
| `apiVersion` | string | Yes | Full API version (e.g., "apps/v1", "v1") |
| `namespace` | string | No | Namespace filter (omit for all namespaces) |
| `includeStatus` | boolean | No | When true, fetch live status from K8s API (default: false) |
| `limit` | number | No | Max results (default: 100, max: 1000) |
| `offset` | number | No | Skip N results for pagination (default: 0) |

**Response:**
```json
{
  "success": true,
  "data": {
    "resources": [
      {
        "name": "nginx",
        "namespace": "default",
        "kind": "Deployment",
        "apiVersion": "apps/v1",
        "labels": { "app": "nginx" },
        "createdAt": "2025-01-01T00:00:00Z",
        "status": { "readyReplicas": 3, "replicas": 3 }
      }
    ],
    "total": 15,
    "limit": 100,
    "offset": 0
  },
  "meta": {
    "timestamp": "2026-01-08T12:00:00Z",
    "requestId": "req_123"
  }
}
```

**Implementation:**
- Build Qdrant filter from query parameters
- Use `queryWithFilter()` for filtered queries
- For pagination: fetch `limit + offset` items, slice, and count total separately
- Note: Qdrant doesn't have native offset, so we fetch all matching and slice in-memory
- When `includeStatus=true`, fetch each resource from K8s API and include raw `.status` field

#### 3. GET /api/v1/namespaces

**Parameters:** None

**Response:**
```json
{
  "success": true,
  "data": {
    "namespaces": ["default", "kube-system", "production", "staging"]
  },
  "meta": {
    "timestamp": "2026-01-08T12:00:00Z",
    "requestId": "req_123"
  }
}
```

**Implementation:**
- Fetch all resources from Qdrant
- Extract unique `namespace` values

#### 4. GET /api/v1/resource (Single Resource)

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | Yes | Resource kind (e.g., "Deployment") |
| `apiVersion` | string | Yes | Full API version (e.g., "apps/v1", "v1") |
| `name` | string | Yes | Resource name |
| `namespace` | string | No | Namespace (omit for cluster-scoped resources) |

**Response:**
```json
{
  "success": true,
  "data": {
    "resource": {
      "apiVersion": "apps/v1",
      "kind": "Deployment",
      "metadata": {
        "name": "nginx",
        "namespace": "default",
        "labels": { "app": "nginx" },
        "annotations": {},
        "ownerReferences": [],
        "uid": "abc-123",
        "creationTimestamp": "2025-01-01T00:00:00Z"
      },
      "spec": {
        "replicas": 3,
        "selector": { "matchLabels": { "app": "nginx" } },
        "template": { ... }
      },
      "status": {
        "readyReplicas": 3,
        "replicas": 3,
        "conditions": [ ... ]
      }
    }
  },
  "meta": {
    "timestamp": "2026-01-08T12:00:00Z",
    "requestId": "req_123"
  }
}
```

**Implementation:**
- Fetch resource directly from Kubernetes API via kubectl
- Returns complete resource including metadata, spec, and status
- Returns 404 if resource not found

#### 5. GET /api/v1/events (Resource Events)

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Resource name |
| `kind` | string | Yes | Resource kind (e.g., "Pod", "Deployment") |
| `namespace` | string | No | Namespace (omit for cluster-scoped resources) |
| `uid` | string | No | Resource UID for precise filtering |

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "reason": "Scheduled",
        "message": "Successfully assigned default/my-pod to node-1",
        "type": "Normal",
        "count": 1,
        "firstTimestamp": "2026-01-10T10:00:00Z",
        "lastTimestamp": "2026-01-10T10:00:00Z",
        "source": {
          "component": "default-scheduler",
          "host": "control-plane"
        },
        "involvedObject": {
          "kind": "Pod",
          "name": "my-pod",
          "namespace": "default",
          "uid": "abc-123"
        }
      }
    ],
    "count": 1
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00Z",
    "requestId": "req_123"
  }
}
```

**Implementation:**
- Fetch events from Kubernetes API via kubectl with field-selector on involvedObject
- Filter by `involvedObject.name`, `involvedObject.kind`, and optionally `involvedObject.uid`
- Returns events sorted by lastTimestamp descending (most recent first)
- Returns empty array if no events found

#### 6. GET /api/v1/logs (Pod Logs)

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Pod name |
| `namespace` | string | Yes | Kubernetes namespace |
| `container` | string | No | Container name (required for multi-container pods) |
| `tailLines` | number | No | Number of lines to return (default: 100) |

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": "2026-01-10T10:00:00Z INFO Starting server...\n2026-01-10T10:00:01Z INFO Ready",
    "container": "server",
    "containerCount": 2
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00Z",
    "requestId": "req_123"
  }
}
```

**Multi-Container Error Response (when container not specified):**
```json
{
  "success": false,
  "error": {
    "code": "CONTAINER_REQUIRED",
    "message": "Pod has multiple containers. Please specify a container.",
    "details": {
      "containers": ["server", "sidecar", "init"]
    }
  }
}
```

**Implementation:**
- Fetch pod spec first to determine container count
- If single container, use it automatically
- If multiple containers and none specified, return CONTAINER_REQUIRED error with container list
- Execute `kubectl logs` with `--tail` flag for line limiting
- Returns raw log string and container metadata

#### 7. Capability Schema with Printer Columns (via existing manageOrgData)

**Request:** `POST /api/v1/tools/manageOrgData`
```json
{
  "dataType": "capabilities",
  "operation": "get",
  "id": "{\"kind\":\"Deployment\",\"apiVersion\":\"apps/v1\"}"
}
```

**Note:** The `id` parameter supports two formats:
- **Hashed ID** (existing): `"a1b2c3d4e5"` - lookup by capability hash
- **JSON format** (new): `'{"kind":"X","apiVersion":"Y"}'` - lookup by kind/apiVersion

Detection: if `id` starts with `{`, parse as JSON and lookup by kind+apiVersion.

**Response:**
```json
{
  "success": true,
  "data": {
    "result": {
      "success": true,
      "operation": "get",
      "dataType": "capabilities",
      "data": {
        "resourceName": "Deployment.apps",
        "apiVersion": "apps/v1",
        "capabilities": ["container-orchestration", "rolling-updates", "scaling"],
        "description": "Manages replicated application deployments...",
        "useCase": "Running stateless applications with rolling updates...",
        "complexity": "medium",
        "confidence": 0.95,
        "printerColumns": [
          { "name": "Ready", "type": "string" },
          { "name": "Up-to-date", "type": "integer" },
          { "name": "Available", "type": "integer" },
          { "name": "Age", "type": "date" }
        ]
      }
    }
  }
}
```

**Implementation:**
- Extend `ResourceCapability` interface to include `printerColumns` field
- During capability scan, fetch printer columns via Kubernetes Table API
- Store printer columns in Qdrant alongside other capability data
- Extend `get` operation to support JSON-formatted `id` for kind/apiVersion lookup

### Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/core/resource-tools.ts` | Modified | Added `getResourceKinds()`, `listResources()`, `getNamespaces()`, `getResourceEvents()`, `getPodLogs()` query functions |
| `src/interfaces/rest-api.ts` | Modified | Registered HTTP routes and handlers for all endpoints |
| `tests/integration/tools/query.test.ts` | Modified | Added integration tests (following "organize by function" principle) |
| `src/core/capabilities.ts` | Modified | Add `printerColumns` field to `ResourceCapability` interface |
| `src/core/capability-vector-service.ts` | Modified | Include `printerColumns` in payload storage/retrieval |
| `src/core/capability-scan-workflow.ts` | Modified | Fetch printer columns via Table API during scan |
| `src/core/capability-operations.ts` | Modified | Support JSON-formatted `id` for kind/apiVersion lookup |

### Printer Columns Architecture

**Data Flow:**
```
Controller triggers scan → MCP scans resource → kubectl explain (AI) + Table API (columns) → Store in Qdrant
                                                                                                    ↓
UI requests capability → manageOrgData get → Qdrant lookup → Return capability + printerColumns
```

**Key Points:**
- Controller watches CRD events and triggers targeted scans for new/updated resources
- MCP does all the work: fetches definitions, runs AI inference, fetches printer columns
- Printer columns come from Kubernetes Table API (works for CRDs AND core resources)
- AI inference continues to use `kubectl explain` (unchanged)
- No live K8s API calls when UI requests capability data - everything is pre-stored

**Table API Request:**
```
GET /apis/{group}/{version}/{resource}?limit=1
Accept: application/json;as=Table;g=meta.k8s.io;v=v1
```

Response includes `columnDefinitions` with `name`, `type`, `description`, and `priority` for each column.

### Data Available (from Qdrant resources collection)

These fields are available for filtering/display:
- `namespace`, `name`, `kind`, `apiVersion`, `apiGroup`
- `labels` (object), `annotations` (object)
- `createdAt`, `updatedAt` (ISO timestamps)

**Not available:** Status fields (pod phase, replica counts, conditions). The dashboard should fetch these directly from Kubernetes API if needed.

## Success Criteria

1. All four endpoints return correct structured JSON
2. Filtering by kind, apiGroup, namespace works correctly
3. Pagination (limit/offset) works correctly
4. Empty results return empty arrays (not errors)
5. Single resource endpoint returns complete metadata, spec, and status
6. Performance: < 500ms response time for clusters with 1000 resources
7. Integration tests pass

## Milestones

### Phase 1: Resource Listing Endpoints (Complete)
- [x] Query functions added to `src/core/resource-tools.ts`
- [x] HTTP routes registered in `src/interfaces/rest-api.ts`
- [x] Integration tests passing for all three endpoints
- [x] Edge cases handled (empty cluster, invalid parameters, large result sets)
- [x] Extended `listResources` function with `apiVersion` and `includeStatus` support
- [x] Update HTTP endpoint to use new `apiVersion` and `includeStatus` parameters
- [x] Update integration tests for new `apiVersion` and `includeStatus` parameters
- [x] Build and deploy image to cluster for manual UI testing

### Phase 2: Printer Columns Support (Complete)
- [x] Add `printerColumns` field to `ResourceCapability` interface
- [x] Update `CapabilityVectorService` to store/retrieve `printerColumns`
- [x] Modify capability scan workflow to fetch printer columns via Kubernetes Table API
- [x] Extend `handleCapabilityGet` to support JSON-formatted `id` for kind/apiVersion lookup
- [x] Add integration tests for printer columns functionality
- [x] Update existing capabilities in cluster (requires re-scan to populate printer columns)

### Phase 3: Single Resource Endpoint (Complete)
- [x] Add `kubectl_get_resource_json` AI tool to `kubectl-tools.ts` for structured JSON access
- [x] Refactor `fetchResourceStatus` to `fetchResource` with optional `field` parameter
- [x] Add `GET /api/v1/resource` HTTP endpoint for single resource retrieval
- [x] Add integration tests for single resource endpoint
- [x] Build and deploy image to cluster for manual UI testing

### Phase 4: Events Endpoint (Complete)
- [x] Add `getResourceEvents()` function to `resource-tools.ts` using `executeKubectl` with field-selectors
- [x] Add `GET /api/v1/events` HTTP endpoint with name, kind, namespace, uid parameters
- [x] Add integration tests for events endpoint
- [x] Build and deploy image to cluster for manual UI testing

### Phase 5: Logs Endpoint (Complete)
- [x] Add `GetPodLogsOptions`, `GetPodLogsResult` interfaces and `getPodLogs()` function to `resource-tools.ts`
- [x] Add `GET /api/v1/logs` HTTP endpoint with name, namespace, container, tailLines parameters
- [x] Handle multi-container pods with `ContainerRequiredError` that returns available container list
- [x] Add integration tests for logs endpoint
- [x] Build and deploy image to cluster for manual UI testing

### Phase 6: Visualization Mode Session Support (Complete)
- [x] Update `handleQueryTool` visualization mode to create session with `cachedVisualization`
- [x] Include `sessionId` in visualization mode response (alongside title, visualizations, insights, toolsUsed)
- [x] Update integration test to expect `sessionId` in visualization response
- [x] Build and deploy image to cluster for manual UI testing

### Phase 7: Finalization
- [ ] Confirm with UI team that all dashboard API requirements are complete
- [ ] Review PRD completeness: verify all requirements implemented and no remaining work
- [ ] Run full integration test suite (final step after all requirements complete)

**Note:** During active UI development, update tests but don't run them - the cluster is used for manual testing through the UI. Build image and apply to cluster instead. Additional requirements may come from the UI team during development. Run full test suite only as the final step once all requirements are confirmed complete.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large clusters cause slow aggregation | Medium | Add caching for kinds/namespaces lists |
| Pagination without native offset is inefficient | Low | Acceptable for MVP; can optimize later with scroll_id |
| Qdrant unavailable | High | Return proper error response with retry guidance |

## Out of Scope

- Authentication/authorization (follow existing patterns)
- Caching (can be added later if needed)

## Design Decisions

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2026-01-08 | Organize by function, not consumer | Query functions should live alongside existing resource operations in `resource-tools.ts` rather than in a separate `dashboard-api.ts`. This avoids organizing code by who uses it (dashboard vs AI) and instead organizes by what it does (query operations). The interface (HTTP vs MCP) is a transport concern, not a code organization concern. | Changed file structure: no new `dashboard-api.ts`, instead extend `resource-tools.ts`. Query functions are interface-agnostic and could be exposed via MCP later. |
| 2026-01-09 | Use Kubernetes Table API for printer columns | Table API (`Accept: application/json;as=Table;g=meta.k8s.io;v=v1`) provides printer columns for ALL resources (CRDs and core resources like Pod, Deployment). This is simpler than using `kubectl get crd -o json` for CRDs + separate logic for core resources. Keep existing `kubectl explain` for AI inference. | Uniform approach: single code path for all resource types. Two data sources during scan: `kubectl explain` for AI understanding, Table API for display columns. |
| 2026-01-09 | Store printer columns in capabilities collection | Printer columns are captured during capability scan and stored in Qdrant alongside AI-enhanced fields. This allows the UI to get everything in one request without live K8s API calls. | Extended `ResourceCapability` schema with `printerColumns` field. Existing capabilities need re-scan to populate. Controller triggers targeted scans for new/updated CRDs, so staleness is minimal. |
| 2026-01-09 | JSON format for kind/apiVersion lookup in `id` parameter | Instead of adding new parameters to the `get` operation, overload the `id` field: if it starts with `{`, parse as JSON `{"kind":"X","apiVersion":"Y"}` and lookup by those fields; otherwise treat as hashed capability ID. | No new parameters needed. Simple detection logic. UI can use either format. Maintains backward compatibility with existing ID-based lookups. |
| 2026-01-09 | No new endpoint - extend existing manageOrgData | UI needs printer columns + AI-enhanced capability data. Instead of creating a new `/api/v1/resources/schema` endpoint, extend the existing `manageOrgData` capabilities `get` operation. Returns full capability record including new `printerColumns` field. | Reuse existing infrastructure. Single source of truth for capability data. Consistent API patterns. |

## Manual Testing (Kind Cluster)

**Prerequisites:**
- Kind cluster named `dot-test` running
- Image built and loaded: `npm run build && npm pack && docker build -t dot-ai:test . && kind load docker-image dot-ai:test --name dot-test`
- Deployment restarted: `KUBECONFIG=./kubeconfig-test.yaml kubectl rollout restart deployment/dot-ai -n dot-ai`

**Get auth token:**
```bash
# Get token (using existing kubeconfig)
TOKEN=$(KUBECONFIG=./kubeconfig-test.yaml kubectl get secret dot-ai-secrets -n dot-ai -o jsonpath='{.data.auth-token}' | base64 -d)
```

**Test endpoints (port 8180 for kind cluster):**
```bash
# List resource kinds
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://dot-ai.127.0.0.1.nip.io:8180/api/v1/resources/kinds" | jq .

# List resources with status
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://dot-ai.127.0.0.1.nip.io:8180/api/v1/resources?kind=Deployment&apiVersion=apps/v1&includeStatus=true" | jq .

# List resources in specific namespace
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://dot-ai.127.0.0.1.nip.io:8180/api/v1/resources?kind=Deployment&apiVersion=apps/v1&namespace=dot-ai&includeStatus=true" | jq .

# List namespaces
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://dot-ai.127.0.0.1.nip.io:8180/api/v1/namespaces" | jq .

# Test validation (missing apiVersion should return 400)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://dot-ai.127.0.0.1.nip.io:8180/api/v1/resources?kind=Deployment" | jq .

# Get events for a resource
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://dot-ai.127.0.0.1.nip.io:8180/api/v1/events?name=dot-ai&kind=Deployment&namespace=dot-ai" | jq .

# Get pod logs
POD_NAME=$(KUBECONFIG=./kubeconfig-test.yaml kubectl get pods -n dot-ai -l app=dot-ai -o jsonpath='{.items[0].metadata.name}')
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://dot-ai.127.0.0.1.nip.io:8180/api/v1/logs?name=$POD_NAME&namespace=dot-ai&tailLines=50" | jq .
```

## Dependencies

- Qdrant `resources` collection must be populated via `dot-ai-controller`
- Existing `ResourceVectorService` for querying

## Progress Log

| Date | Update |
|------|--------|
| 2026-01-08 | PRD created |
| 2026-01-08 | Architecture decision: organize by function not consumer; use `resource-tools.ts` instead of separate `dashboard-api.ts` |
| 2026-01-08 | Implementation complete: all 3 endpoints implemented, 7 integration tests passing |
| 2026-01-08 | Added namespace filter to `/api/v1/resources/kinds` endpoint (feature request from UI team) |
| 2026-01-08 | PRD reopened for completeness review |
| 2026-01-08 | Extended: Added `apiVersion` (required) and `includeStatus` parameters to `/api/v1/resources` endpoint per UI team request |
| 2026-01-09 | New requirement: UI needs printer columns for dynamic table generation. Decided to store printer columns in capabilities collection (fetched via Table API during scan) and extend existing `get` operation with JSON-formatted `id` for kind/apiVersion lookup |
| 2026-01-09 | Implemented printer columns: Added `PrinterColumn` interface, `getPrinterColumns()` method using Table API, integrated into scan workflow. Verified working for Pod (core) and CNPG Cluster (CRD). JSON-formatted `id` lookup still pending. |
| 2026-01-09 | Added `getCapabilityByKindApiVersion` method and JSON-formatted `id` support in `handleCapabilityGet`. Fixed `jsonPath` being empty for CRDs by fetching from CRD's `additionalPrinterColumns` instead of Table API. Major refactor: consolidated three separate metadata-building code paths into single `scanSingleResource()` function - both full scan and targeted scan now use the same code path for processing each resource. Tested via controller: deleted CapabilityScanConfig CR, cleared DB, reapplied CR, verified scan triggered successfully with correct `jsonPath` values for CRDs. |
| 2026-01-09 | New requirement from UI team: ResourceDetailPage needs single resource endpoint. Added `GET /api/v1/resource` endpoint with kind, apiVersion, name, namespace parameters. Also added `kubectl_get_resource_json` AI tool to `KUBECTL_INVESTIGATION_TOOLS` for AI workflows. Refactored `fetchResourceStatus` to `fetchResource` with optional `field` parameter for code reuse. |
| 2026-01-10 | New requirement from UI team: Events tab in ResourceDetailPage needs events endpoint. Added `GET /api/v1/events` endpoint with name, kind, namespace, uid parameters. Reuses `executeKubectl` with field-selectors (same foundation as AI's `kubectl_events` tool). Returns structured JSON with events sorted by lastTimestamp descending. |
| 2026-01-10 | New requirement from UI team: Logs tab in ResourceDetailPage needs logs endpoint. Added `GET /api/v1/logs` endpoint with name, namespace, container, tailLines parameters. Reuses `executeKubectl` infrastructure (same as AI's `kubectl_logs` tool). Multi-container pods return CONTAINER_REQUIRED error with available container list. |
| 2026-01-10 | New requirement from UI team: `[visualization]` mode needs to return `sessionId` for URL caching/bookmarking. Currently visualization mode skips session creation entirely. Fix: create session with `cachedVisualization` and include `sessionId` in response. |
| 2026-01-11 | New requirement from UI team: Add `bar-chart` visualization type for metrics data. Added `BarChartDataItem` and `BarChartVisualizationContent` interfaces to `rest-api.ts`, updated validation in `visualization.ts`, refactored `query.ts` to use shared `CachedVisualization` type, and documented in AI prompt. Deployed and verified working. |
