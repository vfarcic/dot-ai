# PRD #287: Resource Sync Endpoint - Receive and Store Cluster Resources

**GitHub Issue**: [#287](https://github.com/vfarcic/dot-ai/issues/287)
**Status**: Complete
**Priority**: High
**Created**: 2025-12-19

---

## Problem Statement

Users lack efficient visibility into resources within a Kubernetes cluster. The dot-ai-controller (PRD #28) has been built to watch cluster resources and send them to MCP, but **there is no MCP endpoint to receive this data**.

Without this endpoint:
1. **No semantic search** - Can't ask "show me all database-related resources" or "find production services"
2. **No resource inventory** - No way to discover what's deployed across namespaces
3. **Controller has nowhere to send data** - Phase 1 complete, blocked on Phase 2

### Related Work

This PRD implements **Phase 2** of [vfarcic/dot-ai-controller#28](https://github.com/vfarcic/dot-ai-controller/issues/28) (Resource Visibility).

**Phase 1 (Controller - COMPLETE)**:
- Watches all cluster resources via dynamic informers
- Detects changes (labels, annotations)
- Debounces and batches changes
- Sends HTTP requests to MCP endpoint (this PRD)

**Phase 2 (MCP - THIS PRD)**:
- Receive resource data from controller
- Generate embeddings for semantic search
- Store in Qdrant `resources` collection
- Enable resource discovery queries

---

## Solution Overview

Implement the MCP-side infrastructure to receive, embed, and store Kubernetes resource data:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Server                                   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              POST /api/v1/resources/sync                      │   │
│  │                                                               │   │
│  │  1. Receive ResourceSyncRequest from controller               │   │
│  │  2. Validate request structure                                │   │
│  │  3. Generate embeddings for each resource                     │   │
│  │  4. Upsert to Qdrant 'resources' collection                  │   │
│  │  5. Handle deletes (idempotent - ignore not found)           │   │
│  │  6. For resync: diff against Qdrant, apply changes           │   │
│  │  7. Return success/failure counts                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                    │                                 │
│                                    ▼                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Qdrant 'resources' Collection              │   │
│  │                                                               │   │
│  │  - Semantic search: "database deployments", "prod services"  │   │
│  │  - Keyword filters: namespace, kind, labels                   │   │
│  │  - Resource inventory and discovery                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Follow capabilities pattern** - Resources collection mirrors capabilities collection architecture
2. **Controller is "dumb"** - sends data; MCP is "smart" - handles embeddings, diffing, Qdrant
3. **Qdrant is search index, not source of truth** - Kubernetes etcd is authoritative
4. **Idempotent operations** - deletes ignore "not found", upserts are safe to retry

---

## API Contract

### Endpoint: `POST /api/v1/resources/sync`

**Request Body** (from controller):
```json
{
  "upserts": [
    {
      "namespace": "default",
      "name": "nginx",
      "kind": "Deployment",
      "apiVersion": "apps/v1",
      "labels": {"app": "nginx", "env": "prod"},
      "annotations": {"description": "Web server"},
      "createdAt": "2025-12-13T10:00:00Z",
      "updatedAt": "2025-12-18T14:30:00Z"
    }
  ],
  "deletes": [
    {
      "namespace": "default",
      "name": "old-nginx",
      "kind": "Deployment",
      "apiVersion": "apps/v1"
    }
  ],
  "isResync": false
}
```

**Note**: Controller sends objects with component fields. MCP constructs IDs internally using format `namespace:apiVersion:kind:name` and hashes to UUIDs for Qdrant storage.

**Response Body** (follows `RestApiResponse` pattern):

Success:
```json
{
  "success": true,
  "data": {
    "upserted": 5,
    "deleted": 2
  },
  "meta": {
    "timestamp": "2025-12-18T14:30:00Z",
    "requestId": "abc-123",
    "version": "1.0.0"
  }
}
```

Error (partial or complete failure):
```json
{
  "success": false,
  "error": {
    "code": "SYNC_FAILED",
    "message": "Failed to process some resources",
    "details": {
      "upserted": 4,
      "deleted": 2,
      "failures": [
        {"id": "default:apps/v1:Deployment:nginx", "error": "embedding failed"}
      ]
    }
  },
  "meta": {
    "timestamp": "2025-12-18T14:30:00Z",
    "requestId": "abc-123",
    "version": "1.0.0"
  }
}
```

### ID Format

`namespace:apiVersion:kind:name`

Examples:
- `default:apps/v1:Deployment:nginx`
- `kube-system:v1:ConfigMap:coredns`
- `_cluster:rbac.authorization.k8s.io/v1:ClusterRole:admin` (cluster-scoped)

The `_cluster` prefix is used for cluster-scoped resources (no namespace).

---

## Technical Design

### 1. Resource Vector Service

Create `src/core/resource-vector-service.ts` following the `capability-vector-service.ts` pattern:

```typescript
interface ClusterResource {
  namespace: string;             // Kubernetes namespace or '_cluster' for cluster-scoped
  name: string;
  kind: string;
  apiVersion: string;
  apiGroup?: string;             // Derived from apiVersion
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}
// Note: ID is constructed by MCP from components (namespace:apiVersion:kind:name)
// and hashed to UUID for Qdrant storage

class ResourceVectorService extends BaseVectorService {
  constructor(config: VectorDBConfig) {
    super({ ...config, collectionName: 'resources' });
  }

  async upsertResource(resource: ClusterResource): Promise<void>;
  async deleteResource(id: string): Promise<void>;
  async listResources(): Promise<ClusterResource[]>;
  async diffAndSync(incoming: ClusterResource[]): Promise<SyncResult>;
}
```

**Note**: Status is intentionally excluded. Kubernetes is the source of truth for live status. This collection is for resource discovery/inventory, not status monitoring. Status queries should use kubectl or Kubernetes API directly.

### 2. Embedding Generation

Generate embeddings from a semantic text representation of the resource:

```typescript
function buildEmbeddingText(resource: ClusterResource): string {
  const parts = [
    `${resource.kind} ${resource.name}`,
    `namespace: ${resource.namespace}`,
    `apiVersion: ${resource.apiVersion}`,
  ];

  // Add meaningful labels (skip standard Kubernetes labels)
  if (resource.labels) {
    const labelText = Object.entries(resource.labels)
      .filter(([k]) => !k.startsWith('app.kubernetes.io/'))
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    if (labelText) parts.push(`labels: ${labelText}`);

    // Include app name from standard labels if present
    const appName = resource.labels['app.kubernetes.io/name'] ||
                    resource.labels['app'];
    if (appName) parts.push(`app: ${appName}`);
  }

  // Add description from annotations if present
  if (resource.annotations?.description) {
    parts.push(`description: ${resource.annotations.description}`);
  }

  return parts.join(' | ');
}
```

### 3. REST Endpoint Handler

Add to `src/interfaces/rest-api.ts`:

```typescript
// In handleRestRequest routing
case 'resources':
  if (method === 'POST' && pathParts[1] === 'sync') {
    return handleResourceSync(requestBody);
  }
  break;

async function handleResourceSync(body: ResourceSyncRequest): Promise<RestApiResponse> {
  const resourceService = new ResourceVectorService(getVectorDBConfig());

  let upserted = 0;
  let deleted = 0;
  const failures: Array<{id: string, error: string}> = [];

  // Handle upserts
  for (const resource of body.upserts ?? []) {
    try {
      const embeddingText = buildEmbeddingText(resource);
      const embedding = await embeddingService.embed(embeddingText);
      await resourceService.upsertResource({ ...resource, embedding });
      upserted++;
    } catch (error) {
      failures.push({ id: resource.id, error: error.message });
    }
  }

  // Handle deletes (idempotent)
  for (const id of body.deletes ?? []) {
    try {
      await resourceService.deleteResource(id);
      deleted++;
    } catch (error) {
      // Ignore not found errors - idempotent delete
      if (!error.message.includes('not found')) {
        failures.push({ id, error: error.message });
      } else {
        deleted++;  // Count as success
      }
    }
  }

  // Handle resync (diff mode)
  if (body.isResync && body.upserts?.length) {
    const diffResult = await resourceService.diffAndSync(body.upserts);
    // diffResult contains: inserted, updated, deleted counts
  }

  if (failures.length > 0) {
    return {
      success: false,
      error: {
        code: 'SYNC_PARTIAL_FAILURE',
        message: `Failed to process ${failures.length} resources`,
        details: { upserted, deleted, failures }
      }
    };
  }

  return {
    success: true,
    data: { upserted, deleted }
  };
}
```

### 4. MCP Tool: search-resources *(Deferred)*

> **Decision**: Standalone MCP tool deferred to future "cluster intelligence" PRD. The `ResourceVectorService` implements full search capabilities (`searchResources()`, `listResources()` with filters) ready for future AI orchestration layer that combines resources, capabilities, and live kubectl queries.

### 5. Resync Diff Logic

For periodic resyncs, the controller sends all resources with `isResync: true`. MCP must diff against Qdrant:

```typescript
async function diffAndSync(incoming: ClusterResource[]): Promise<SyncResult> {
  // Get all existing resources from Qdrant
  const existing = await this.listAllResources();
  const existingMap = new Map(existing.map(r => [r.id, r]));
  const incomingMap = new Map(incoming.map(r => [r.id, r]));

  const toInsert: ClusterResource[] = [];
  const toUpdate: ClusterResource[] = [];
  const toDelete: string[] = [];

  // Find new and changed resources
  for (const resource of incoming) {
    const existing = existingMap.get(resource.id);
    if (!existing) {
      toInsert.push(resource);
    } else if (hasChanged(existing, resource)) {
      toUpdate.push(resource);
    }
  }

  // Find deleted resources
  for (const id of existingMap.keys()) {
    if (!incomingMap.has(id)) {
      toDelete.push(id);
    }
  }

  // Apply changes
  for (const r of [...toInsert, ...toUpdate]) {
    const embedding = await embeddingService.embed(buildEmbeddingText(r));
    await this.upsertResource({ ...r, embedding });
  }

  for (const id of toDelete) {
    await this.deleteResource(id);
  }

  return {
    inserted: toInsert.length,
    updated: toUpdate.length,
    deleted: toDelete.length
  };
}
```

---

## Scope

### In Scope

**M1: Resource Vector Service**
- New `ResourceVectorService` class extending `BaseVectorService`
- Qdrant collection `resources` with appropriate schema
- Upsert, delete, search, list operations
- Embedding text generation from resource data

**M2: REST Sync Endpoint**
- `POST /api/v1/resources/sync` endpoint
- Request validation (Zod schema)
- Upsert and delete handling
- Partial failure reporting
- Idempotent delete (ignore not found)

**M3: Resync Diff Logic**
- Diff algorithm for full resync
- Insert new, update changed, delete missing
- Efficient comparison using resource ID

**M4: MCP Tools** *(Deferred)*
- ~~`search-resources` - semantic search tool~~ → Deferred to future "cluster intelligence" PRD
- Search capabilities built into ResourceVectorService for future orchestration
- Service layer ready for unified AI tool that combines resources, capabilities, and live kubectl

**M5: Testing**
- Integration tests for sync endpoint
- Documentation guide removed (no user-facing functionality - sync endpoint is internal, MCP tool deferred)
- Controller docs (ResourceSyncConfig) tracked separately in dot-ai-controller repo

### Out of Scope

- **Standalone MCP tool** - `search-resources` deferred to future "cluster intelligence" PRD that will unify resources, capabilities, and kubectl
- On-demand resource detail fetching (call Kubernetes API) - Future enhancement
- Resource modification through the interface
- Multi-cluster support (single cluster only)
- Events resource syncing (high volume, low signal)

---

## Milestones

- [x] **M1: Resource Vector Service**
  - Create `src/core/resource-vector-service.ts`
  - Qdrant collection initialization with proper schema
  - Upsert, delete, list operations
  - Embedding text generation (`buildEmbeddingText`) from labels/annotations

- [x] **M2: REST Sync Endpoint**
  - Add `/api/v1/resources/sync` to REST router
  - Manual validation for `ResourceSyncRequest` (Zod replaced due to runtime issues)
  - Handle upserts with embedding generation
  - Handle deletes (idempotent)
  - RestApiResponse formatting with partial failure support

- [x] **M3: Resync Diff Logic**
  - Implement `diffAndSync()` method
  - Compare incoming vs Qdrant state
  - Insert new, update changed, delete missing

- [~] **M4: MCP Tools** *(Deferred)*
  - ~~Add `search-resources` tool definition~~ → Deferred
  - Search capabilities deferred to future "cluster intelligence" PRD
  - Future unified tool will combine resources, capabilities, and kubectl

- [x] **M5: Testing**
  - [x] Integration tests for sync endpoint (6 tests passing)
  - Unit tests skipped - integration tests provide sufficient coverage
  - Documentation guide removed - no user-facing functionality (sync endpoint is internal, MCP tool deferred)
  - Controller docs (ResourceSyncConfig) tracked separately in dot-ai-controller repo

- [ ] **M6: Cluster Intelligence PRD** *(Placeholder)*
  - Create new PRD for unified "Cluster Intelligence" tool
  - Natural language interface: "which databases?", "show failing workloads", etc.
  - AI orchestrates multiple data sources: resources (this PRD), capabilities, live kubectl
  - Discuss scope, approach, and priorities when M1-M5 are complete
  - **Note**: This is a placeholder for future discussion, not implementation work

---

## Dependencies

### Internal Dependencies
- `src/core/base-vector-service.ts` - Base class for vector operations
- `src/core/embedding-service.ts` - Embedding generation
- `src/core/vector-db-service.ts` - Qdrant client
- `src/interfaces/rest-api.ts` - REST endpoint router

### External Dependencies
- Qdrant running and accessible
- Embedding provider configured (OpenAI, Google, or Bedrock)
- dot-ai-controller v0.x.x sending sync requests

### Cross-Repository Dependencies
- **vfarcic/dot-ai-controller#28** (Phase 1 complete) - Controller sending data
- **Follow-up**: Update dot-ai-controller docs to uncomment ResourceSyncConfig references (tracked in controller repo)

---

## Success Criteria

1. **Endpoint receives data**: Controller successfully sends resources to `/api/v1/resources/sync`
2. **Resources stored**: Resources appear in Qdrant `resources` collection with embeddings
3. **Semantic search works**: Query "database deployments" or "production services" returns relevant results based on labels/annotations
4. **Resync works**: Hourly resync correctly identifies and removes deleted resources
5. **Idempotent deletes**: Deleting non-existent resources doesn't cause errors
6. **Partial failures handled**: API returns success=false with details on which resources failed

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| High embedding API costs | Batch embedding requests; only re-embed on actual changes |
| Qdrant overload | Batch writes; use controller-side debouncing (already implemented) |
| Stale data after restart | Periodic resync (hourly) catches missed changes |
| Embedding provider failures | Retry with backoff; fail gracefully with error response |
| Large clusters | Pagination in listAllResources; incremental sync for resync |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| **Separate collection from capabilities** | Resources are what IS running; capabilities are what CAN be deployed. Different purposes, different queries. |
| **Follow capabilities pattern** | Consistent architecture; reuse existing base classes and patterns. |
| **Idempotent deletes** | Controller may send duplicate delete requests; simplifies retry logic. |
| **Partial failure response** | Don't fail entire batch for one resource; report what succeeded. |
| **Embedding text from labels+annotations** | Enables semantic search on "production", "database", app names, etc. |
| **Exclude status from storage** | Status changes frequently and Kubernetes is the source of truth. This collection is for resource discovery/inventory, not status monitoring. Status queries should use kubectl directly. |
| **Defer standalone MCP tool** | A standalone `search-resources` MCP tool provides low value since users will interact via a unified "cluster intelligence" AI that orchestrates multiple data sources (resources, capabilities, kubectl). The service layer implements full search capabilities for future orchestration, but premature tool exposure forces users/AI to know implementation details. |
| **Controller sends components, not IDs** | Controller sends objects with `namespace`, `apiVersion`, `kind`, `name`. MCP constructs IDs internally (`namespace:apiVersion:kind:name`) and hashes to UUIDs for Qdrant (which requires UUIDs or integers). This keeps the controller simple and ensures ID format consistency. |
| **Manual validation over Zod** | Zod schema parsing threw runtime exceptions in the container environment. Manual validation provides clearer error messages and avoids dependency issues. |
| **Global collection initialization flag** | Collection is initialized once on first request, with conflict handling for race conditions. Avoids expensive re-initialization on every request while handling MCP restarts gracefully. |

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-19 | PRD created |
| 2025-12-19 | Decision: Defer M4 (MCP tool) - standalone `search-resources` tool provides low value; service layer will have search capabilities ready for future unified "cluster intelligence" tool |
| 2025-12-19 | Added M6 placeholder for future "Cluster Intelligence" PRD - unified natural language interface for cluster queries |
| 2025-12-19 | **M1 Complete**: Created `ResourceVectorService` with full CRUD operations, `buildEmbeddingText()`, `diffAndSync()` |
| 2025-12-19 | **M3 Complete**: Implemented resync diff logic with `hasResourceChanged()` comparison |
| 2025-12-19 | **Design Decision**: Excluded `status` from storage - Kubernetes is source of truth for live status; collection is for resource discovery/inventory only. Controller updated to not send status. |
| 2025-12-19 | **Simplification**: Removed `searchResources()`, `ResourceSearchOptions`, `ResourceFilters` - YAGNI, will add when cluster intelligence PRD is implemented |
| 2025-12-19 | **M2 Complete**: REST sync endpoint implemented with manual validation (Zod replaced due to runtime issues). Controller sends objects with component fields; MCP constructs IDs and hashes to UUIDs for Qdrant. Integration tests passing (6 tests). |
| 2025-12-19 | **API Contract Update**: Removed `id` field from request - controller sends only component fields (`namespace`, `apiVersion`, `kind`, `name`). MCP constructs deterministic IDs internally. Deletes array now accepts objects instead of ID strings. |
| 2025-12-19 | **M5 Complete**: Integration tests (6 passing) provide sufficient coverage. Documentation guide removed - sync endpoint is internal infrastructure with no user-facing functionality. Controller docs tracked separately in dot-ai-controller repo. |
| 2025-12-19 | **PRD Complete**: M1-M3, M5 complete. M4 deferred. M6 is a placeholder for future work. |

---

## References

- [dot-ai-controller PRD #28](https://github.com/vfarcic/dot-ai-controller/blob/main/prds/28-resource-visibility.md) - Controller-side implementation (Phase 1)
- [PRD #48: Resource Capabilities](./done/48-resource-capabilities-discovery-integration.md) - Pattern to follow
- [PRD #110: REST API Gateway](./done/110-rest-api-gateway.md) - REST endpoint patterns
- [capability-vector-service.ts](../src/core/capability-vector-service.ts) - Template for ResourceVectorService
- [rest-api.ts](../src/interfaces/rest-api.ts) - REST router to extend
