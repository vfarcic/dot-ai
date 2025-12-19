# PRD #287: Resource Sync Endpoint - Receive and Store Cluster Resources

**GitHub Issue**: [#287](https://github.com/vfarcic/dot-ai/issues/287)
**Status**: Not Started
**Priority**: High
**Created**: 2025-12-19

---

## Problem Statement

Users lack efficient visibility into resources and their statuses within a Kubernetes cluster. The dot-ai-controller (PRD #28) has been built to watch cluster resources and send them to MCP, but **there is no MCP endpoint to receive this data**.

Without this endpoint:
1. **No semantic search** - Can't ask "show me all database-related resources" or "what's failing?"
2. **No unified view** - Resource status scattered across different kubectl commands
3. **Controller has nowhere to send data** - Phase 1 complete, blocked on Phase 2

### Related Work

This PRD implements **Phase 2** of [vfarcic/dot-ai-controller#28](https://github.com/vfarcic/dot-ai-controller/issues/28) (Resource Visibility and Status Tracking).

**Phase 1 (Controller - COMPLETE)**:
- Watches all cluster resources via dynamic informers
- Detects changes (status, labels)
- Debounces and batches changes
- Sends HTTP requests to MCP endpoint (this PRD)

**Phase 2 (MCP - THIS PRD)**:
- Receive resource data from controller
- Generate embeddings for semantic search
- Store in Qdrant `resources` collection
- Provide query tools

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
│  │  - Semantic search: "failing databases", "prod deployments"  │   │
│  │  - Keyword filters: namespace, kind, labels                   │   │
│  │  - Status queries: "resources changed in last hour"           │   │
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
      "id": "default:apps/v1:Deployment:nginx",
      "namespace": "default",
      "name": "nginx",
      "kind": "Deployment",
      "apiVersion": "apps/v1",
      "labels": {"app": "nginx", "env": "prod"},
      "annotations": {"description": "Web server"},
      "status": {
        "availableReplicas": 3,
        "readyReplicas": 3,
        "conditions": [
          {
            "type": "Available",
            "status": "True",
            "lastTransitionTime": "2025-12-18T10:00:00Z",
            "reason": "MinimumReplicasAvailable",
            "message": "Deployment has minimum availability."
          }
        ]
      },
      "createdAt": "2025-12-13T10:00:00Z",
      "updatedAt": "2025-12-18T14:30:00Z"
    }
  ],
  "deletes": ["default:apps/v1:Deployment:old-nginx"],
  "isResync": false
}
```

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
  id: string;                    // namespace:apiVersion:kind:name
  namespace: string;
  name: string;
  kind: string;
  apiVersion: string;
  apiGroup?: string;             // Derived from apiVersion
  labels: Record<string, string>;
  annotations?: Record<string, string>;
  status: Record<string, any>;   // Complete status object
  createdAt: string;
  updatedAt: string;
  embedding?: number[];
}

class ResourceVectorService extends BaseVectorService {
  constructor(config: VectorDBConfig) {
    super({ ...config, collectionName: 'resources' });
  }

  async upsertResource(resource: ClusterResource): Promise<void>;
  async deleteResource(id: string): Promise<void>;
  async searchResources(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  async listResources(filters?: ResourceFilters): Promise<ClusterResource[]>;
  async diffAndSync(incoming: ClusterResource[]): Promise<SyncResult>;
}
```

### 2. Embedding Generation

Generate embeddings from a semantic text representation of the resource:

```typescript
function buildEmbeddingText(resource: ClusterResource): string {
  const parts = [
    `${resource.kind} ${resource.name}`,
    `namespace: ${resource.namespace}`,
    `apiVersion: ${resource.apiVersion}`,
  ];

  // Add meaningful labels
  if (resource.labels) {
    const labelText = Object.entries(resource.labels)
      .filter(([k]) => !k.startsWith('app.kubernetes.io/'))  // Skip standard labels
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    if (labelText) parts.push(`labels: ${labelText}`);
  }

  // Add status summary
  if (resource.status) {
    const statusSummary = extractStatusSummary(resource.status);
    if (statusSummary) parts.push(`status: ${statusSummary}`);
  }

  return parts.join(' | ');
}

function extractStatusSummary(status: Record<string, any>): string {
  // Extract key status indicators
  const summaries: string[] = [];

  // Check conditions
  if (status.conditions) {
    const conditions = status.conditions as Array<{type: string, status: string}>;
    const falseConditions = conditions.filter(c => c.status === 'False');
    if (falseConditions.length > 0) {
      summaries.push(`failing: ${falseConditions.map(c => c.type).join(', ')}`);
    }
  }

  // Check phase
  if (status.phase) {
    summaries.push(`phase: ${status.phase}`);
  }

  // Check replicas
  if (status.replicas !== undefined) {
    const ready = status.readyReplicas ?? 0;
    summaries.push(`replicas: ${ready}/${status.replicas}`);
  }

  return summaries.join(', ');
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

### 4. MCP Tool: search-resources

Add to `src/tools/organizational-data.ts` or create new `src/tools/cluster-resources.ts`:

```typescript
// Tool definition
{
  name: 'search-resources',
  description: 'Semantic search across cluster resources. Use for questions like "show me failing deployments", "what databases are running?", "pods in production namespace".',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query describing what resources to find'
      },
      namespace: {
        type: 'string',
        description: 'Optional: filter by namespace'
      },
      kind: {
        type: 'string',
        description: 'Optional: filter by resource kind (Deployment, Pod, etc.)'
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10)'
      }
    },
    required: ['query']
  }
}

// Handler
async function handleSearchResources(args: SearchResourcesArgs): Promise<MCP.TextContent[]> {
  const resourceService = new ResourceVectorService(getVectorDBConfig());

  const results = await resourceService.searchResources(args.query, {
    namespace: args.namespace,
    kind: args.kind,
    limit: args.limit ?? 10
  });

  return [{
    type: 'text',
    text: JSON.stringify({
      success: true,
      data: {
        count: results.length,
        resources: results.map(r => ({
          id: r.id,
          kind: r.payload.kind,
          name: r.payload.name,
          namespace: r.payload.namespace,
          status: extractStatusSummary(r.payload.status),
          score: r.score
        }))
      }
    })
  }];
}
```

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

**M4: MCP Tools**
- `search-resources` - semantic search tool
- Integration with existing manageOrgData tool pattern
- Response formatting for AI consumption

**M5: Testing and Documentation**
- Unit tests for ResourceVectorService
- Integration tests with Qdrant
- API endpoint tests
- Update docs/guides/ with resource search guide
- Uncomment ResourceSyncConfig docs in dot-ai-controller (3 TODO items)

### Out of Scope

- On-demand resource detail fetching (call Kubernetes API) - Future enhancement
- Resource modification through the interface
- Multi-cluster support (single cluster only)
- Events resource syncing (high volume, low signal)

---

## Milestones

- [ ] **M1: Resource Vector Service**
  - Create `src/core/resource-vector-service.ts`
  - Qdrant collection initialization with proper schema
  - Upsert, delete, list operations
  - Embedding text generation (`buildEmbeddingText`)
  - Status summary extraction for semantic search

- [ ] **M2: REST Sync Endpoint**
  - Add `/api/v1/resources/sync` to REST router
  - Zod schema for `ResourceSyncRequest`
  - Handle upserts with embedding generation
  - Handle deletes (idempotent)
  - RestApiResponse formatting with partial failure support

- [ ] **M3: Resync Diff Logic**
  - Implement `diffAndSync()` method
  - Compare incoming vs Qdrant state
  - Insert new, update changed, delete missing
  - Efficient bulk operations

- [ ] **M4: MCP Tools**
  - Add `search-resources` tool definition
  - Handler with semantic search + filters
  - Response formatting for AI consumption
  - Register in tool discovery

- [ ] **M5: Testing and Documentation**
  - Unit tests for ResourceVectorService
  - Integration tests for sync endpoint
  - E2E test with mock controller requests
  - Create `docs/guides/resource-search-guide.md`
  - Uncomment ResourceSyncConfig docs in dot-ai-controller

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
- After M5: Update dot-ai-controller docs to uncomment ResourceSyncConfig references

---

## Success Criteria

1. **Endpoint receives data**: Controller successfully sends resources to `/api/v1/resources/sync`
2. **Resources stored**: Resources appear in Qdrant `resources` collection with embeddings
3. **Semantic search works**: Query "failing deployments" returns relevant results
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
| **Embedding text from metadata+status** | Enables semantic search on "failing", "production", "database" etc. |
| **Status summary in embedding** | Full status too verbose; extract key indicators (conditions, phase, replicas). |

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-19 | PRD created |

---

## References

- [dot-ai-controller PRD #28](https://github.com/vfarcic/dot-ai-controller/blob/main/prds/28-resource-visibility.md) - Controller-side implementation (Phase 1)
- [PRD #48: Resource Capabilities](./done/48-resource-capabilities-discovery-integration.md) - Pattern to follow
- [PRD #110: REST API Gateway](./done/110-rest-api-gateway.md) - REST endpoint patterns
- [capability-vector-service.ts](../src/core/capability-vector-service.ts) - Template for ResourceVectorService
- [rest-api.ts](../src/interfaces/rest-api.ts) - REST router to extend
