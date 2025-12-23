# PRD #291: Cluster Query Tool - Natural Language Cluster Intelligence

**GitHub Issue**: [#291](https://github.com/vfarcic/dot-ai/issues/291)
**Status**: In Progress
**Priority**: High
**Created**: 2025-12-19

---

## Problem Statement

Users lack a natural language interface to query their Kubernetes cluster. Currently they must:
1. Know kubectl commands and flags
2. Understand label conventions and naming patterns
3. Know which resources exist and where to look
4. Manually correlate information across multiple resources

The existing MCP tools cover Create (`recommend`), Update (`operate`), and Fix (`remediate`), but **Read/Query is missing** - completing the CRUD operations.

### Examples of Unsupported Queries Today

- "What databases are running in this cluster?"
- "Show me all production services"
- "Which pods are failing?"
- "What resources are using the most memory?"
- "Is nginx healthy?"

---

## Solution Overview

An MCP tool (`query`) that accepts natural language queries and orchestrates multiple data sources using an LLM with tools. The LLM decides which tools to use based on user intent.

```text
┌────────────────────────────────────────────────────────────────┐
│                      MCP Tool: query                           │
│                                                                │
│  Input: { intent: "show me all databases in production" }     │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                    System Prompt                          │ │
│  │                                                           │ │
│  │  Encodes the "semantic bridge" strategy:                  │ │
│  │  - Use capabilities for semantic meaning                  │ │
│  │  - Use resources for inventory                            │ │
│  │  - Use kubectl for live status                            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                            │                                   │
│                            ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                   LLM + Tool Loop                         │ │
│  │                                                           │ │
│  │  10 Tools:                                                │ │
│  │  ├── search_capabilities    (semantic search)             │ │
│  │  ├── query_capabilities     (filter by provider, etc.)    │ │
│  │  ├── search_resources       (semantic search)             │ │
│  │  ├── query_resources        (filter by kind, namespace)   │ │
│  │  ├── kubectl_api_resources                                │ │
│  │  ├── kubectl_get                                          │ │
│  │  ├── kubectl_describe                                     │ │
│  │  ├── kubectl_logs                                         │ │
│  │  ├── kubectl_events                                       │ │
│  │  └── kubectl_get_crd_schema                               │ │
│  └──────────────────────────────────────────────────────────┘ │
│                            │                                   │
│                            ▼                                   │
│  Output: { findings: [...], summary: "..." }                  │
└────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **LLM as orchestrator** - LLM decides which tools to use based on user intent
2. **Three data sources** - Capabilities (semantic meaning), Resources (inventory), kubectl (live status)
3. **Semantic bridge** - Capabilities provide semantic meaning that resources lack (e.g., "database" → StatefulSet, CNPG, Crossplane RDS)
4. **Read-only** - This tool only queries; write operations redirect to `recommend`, `operate`, or `remediate`
5. **JSON output** - Let client agent handle display formatting

---

## The Semantic Bridge Pattern

Resources in Vector DB have limited semantic information (kind, name, labels). They can't answer "show me databases" unless labeled as such.

Capabilities in Vector DB have rich semantic information (description, use cases, abstractions). They know that StatefulSet, CNPG Cluster, and Crossplane RDS are all "database-related".

**The bridge:**
```text
User: "List all database-related resources"

Step 1: search_capabilities({ query: "database" })
  → Returns kinds: StatefulSet, clusters.postgresql.cnpg.io,
                   compositions.apiextensions.crossplane.io (RDS), etc.

Step 2: query_resources({ filter: { must: [{ key: "kind", match: { any: ["StatefulSet", "Cluster"] } }] } })
  → Returns actual resources of those kinds

  OR kubectl_get({ resource: "statefulsets" })
  → Returns live status from cluster
```

This pattern is encoded in the system prompt so the LLM learns to use it.

---

## Tool Definitions

### Vector DB Tools (New)

| Tool | Purpose | Implementation |
|------|---------|----------------|
| `search_capabilities` | Semantic search for capability meaning | Wrap `CapabilityVectorService.searchCapabilities()` |
| `query_capabilities` | Filter by provider, complexity, group | **New method** on `CapabilityVectorService` |
| `search_resources` | Semantic search on resource metadata | Wrap `ResourceVectorService.searchData()` |
| `query_resources` | Filter by kind, namespace, labels | **New method** on `ResourceVectorService` |

### Kubectl Tools (Existing - Read-Only Subset)

| Tool | Purpose | Status |
|------|---------|--------|
| `kubectl_api_resources` | Discover available resource types | ✅ Exists |
| `kubectl_get` | List/get resources (table format) | ✅ Exists |
| `kubectl_describe` | Detailed resource info | ✅ Exists |
| `kubectl_logs` | Pod logs | ✅ Exists |
| `kubectl_events` | Cluster events | ✅ Exists |
| `kubectl_get_crd_schema` | CRD schemas | ✅ Exists |

**Excluded tools** (write-oriented, used by remediate):
- `kubectl_patch_dryrun`
- `kubectl_apply_dryrun`
- `kubectl_delete_dryrun`

---

## API Contract

### MCP Tool: `query`

**Input:**
```json
{
  "intent": "show me all databases in production"
}
```

**Output (success):**
```json
{
  "success": true,
  "summary": "Found 2 database-related resources in production namespace: 1 CNPG PostgreSQL cluster and 1 Redis StatefulSet.",
  "toolsUsed": ["search_capabilities", "query_resources", "kubectl_get"],
  "iterations": 3
}
```

> **Note (M2):** Current implementation returns `summary`, `toolsUsed`, and `iterations`. The `toolsUsed` is extracted programmatically from `AgenticResult.toolCallsExecuted` for reliability. Structured `findings` array may be added in M3+ if needed.

**Output (no results):**
```json
{
  "success": true,
  "summary": "No database-related resources found in the cluster.",
  "toolsUsed": ["search_capabilities", "query_resources"],
  "iterations": 2
}
```

**Output (error):**
```json
{
  "success": false,
  "error": {
    "code": "QUERY_FAILED",
    "message": "Unable to query cluster: kubectl connection failed"
  }
}
```

---

## Technical Design

### 1. Generic Vector DB Query Method

**Architecture Decision**: Instead of pre-defined filter interfaces, the AI constructs Qdrant filters directly. This provides maximum flexibility and reduces code maintenance.

**VectorDBService - scrollWithFilter():**
```typescript
// Low-level Qdrant filter support
async scrollWithFilter(filter: any, limit: number = 100): Promise<VectorDocument[]>
```

**BaseVectorService - queryWithFilter():**
```typescript
// Typed wrapper inherited by CapabilityVectorService and ResourceVectorService
async queryWithFilter(filter: any, limit: number = 100): Promise<T[]>
```

**How it works:**
1. Tool description tells AI which payload fields are available
2. AI constructs Qdrant filter based on user intent
3. Filter is passed directly to Qdrant - no translation layer
4. If AI makes syntax errors, Qdrant returns error, AI self-corrects

**Available payload fields (Capabilities):**
- `resourceName`, `group`, `apiVersion`, `providers`, `complexity`, `capabilities`, `abstractions`, `description`, `useCase`

**Available payload fields (Resources):**
- `kind`, `namespace`, `name`, `apiVersion`, `apiGroup`, `labels`, `annotations`

### 2. Tool Definitions

Create `src/core/query-tools.ts` with AITool definitions for the 4 Vector DB tools:

```typescript
export const SEARCH_CAPABILITIES_TOOL: AITool = {
  name: 'search_capabilities',
  description: 'Semantic search for cluster capabilities. Use this to find what KINDS of resources relate to a concept (e.g., "database" returns StatefulSet, CNPG Cluster, Crossplane RDS). Returns capability definitions with semantic meaning, not actual resources.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Semantic search query (e.g., "database", "message queue", "web server")'
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10)'
      }
    },
    required: ['query']
  }
};

// ... similar for query_capabilities, search_resources, query_resources
```

### 3. MCP Tool Implementation

Create `src/tools/query.ts`:

```typescript
export async function handleQuery(intent: string): Promise<QueryResult> {
  const systemPrompt = await loadPrompt('query-system.md');

  const tools = [
    // Vector DB tools
    SEARCH_CAPABILITIES_TOOL,
    QUERY_CAPABILITIES_TOOL,
    SEARCH_RESOURCES_TOOL,
    QUERY_RESOURCES_TOOL,
    // Kubectl tools (read-only)
    KUBECTL_API_RESOURCES_TOOL,
    KUBECTL_GET_TOOL,
    KUBECTL_DESCRIBE_TOOL,
    KUBECTL_LOGS_TOOL,
    KUBECTL_EVENTS_TOOL,
    KUBECTL_GET_CRD_SCHEMA_TOOL
  ];

  const result = await toolLoop(systemPrompt, intent, tools, executeQueryTools);

  return parseQueryResult(result);
}
```

### 4. System Prompt Strategy

Create `prompts/query-system.md`:

```markdown
You are a Kubernetes cluster analyst. Given a user query, use the available tools to find the answer.

## Strategy

### For semantic queries ("databases", "message queues", "web servers"):
1. Use `search_capabilities` to find what KINDS of resources relate to the concept
2. Use `query_resources` or `kubectl_get` to find actual instances of those kinds
3. Use `kubectl_describe` or `kubectl_get` for status details if needed

### For specific resource queries ("nginx deployment", "pods in default namespace"):
1. Use `kubectl_get` directly with the resource type and namespace
2. Use `kubectl_describe` for detailed information

### For status/health queries ("is X healthy", "what's failing"):
1. Use `kubectl_get` to check resource status
2. Use `kubectl_describe` for events and conditions
3. Use `kubectl_events` for cluster-wide event history
4. Use `kubectl_logs` for pod-level debugging

### For discovery queries ("what can I deploy", "what operators are installed"):
1. Use `kubectl_api_resources` to see available resource types
2. Use `query_capabilities` or `search_capabilities` for semantic understanding

## Guidelines

- Prefer Vector DB queries over kubectl when checking inventory (reduces API load)
- Use kubectl for live status, logs, and events
- Always verify Vector DB results with kubectl if freshness matters
- Return findings as structured JSON
- Provide a human-readable summary

## Output Format

Return JSON with:
- findings: Array of discovered resources/information
- summary: Human-readable summary of what was found
- toolsUsed: Which tools were used to answer the query
```

---

## Scope

### In Scope

- Natural language query interface
- LLM orchestration with 10 tools
- Vector DB semantic and filter queries
- kubectl read-only operations
- JSON output with structured findings

### Out of Scope

- Write operations (use `recommend`, `operate`, `remediate`)
- Multi-cluster support
- Query history/caching
- Permission/namespace restrictions (future PRD)
- Real-time streaming results

---

## Milestones

- [x] **M1: Vector DB Query Methods**
  - ~~Add `queryCapabilities(filters)` to CapabilityVectorService~~ → Added generic `queryWithFilter(filter)` to BaseVectorService (inherited by all services)
  - ~~Add `queryResources(filters)` to ResourceVectorService~~ → Same generic method works for resources
  - Added `scrollWithFilter(filter)` to VectorDBService (low-level Qdrant support)
  - Note: AI constructs Qdrant filters directly; no pre-defined filter interfaces needed

- [x] **M2: Capability Tools (First)**
  - Created `src/core/capability-tools.ts` with reusable capability tools (can be used by query, recommend, and other tools)
  - Defined `search_capabilities` (semantic) and `query_capabilities` (Qdrant filter)
  - Created tool executor function with `QDRANT_CAPABILITIES_COLLECTION` env var support
  - Created minimal `prompts/query-system.md` (tool descriptions guide AI strategy, not prompt)
  - Created `src/tools/query.ts` MCP tool handler
  - Registered query tool in MCP interface
  - Wrote 2 integration tests in `tests/integration/tools/query.test.ts`:
    - Semantic: "What databases can I deploy?" → validates `search_capabilities` used
    - Filter: "Show me low complexity capabilities" → validates `query_capabilities` used
  - Note: `toolsUsed` extracted from `AgenticResult.toolCallsExecuted` (not AI self-reporting)
  - Note: `findings` field removed - AI summary is sufficient for M2 scope

- [x] **M3: Resource Tools (Second)**
  - Created `src/core/resource-tools.ts` with reusable resource tools (can be used by query and other tools)
  - Defined `search_resources` (semantic search on resource names/labels) and `query_resources` (Qdrant filter)
  - Updated `src/tools/query.ts` to include resource tools alongside capability tools
  - Extended `prompts/query-system.md` with guidance on capabilities vs resources distinction
  - Wrote 2 integration tests validating AI selects correct tools:
    - "Search the resource inventory for anything with postgres in the name" → `search_resources`
    - "Query the resource inventory for resources with label team=platform" → `query_resources`
  - Tests create real K8s resources (CNPG Cluster) and sync to Qdrant, preparing for M4 kubectl tools

- [ ] **M4: Kubectl Tools Integration (Third)**
  - Add read-only kubectl tools to query tool (already exist in kubectl-tools.ts)
  - Extend prompt with kubectl guidance and semantic bridge strategy
  - Write integration test for kubectl queries
  - Verify AI uses kubectl for live status queries

- [ ] **M5: Full Integration & MCP Registration**
  - Create `src/tools/query.ts` with all 10 tools
  - Register tool in MCP interface
  - Add to REST API router
  - Write comprehensive integration test validating semantic bridge flow (capabilities → resources → kubectl)
  - Test error handling

### Integration Test Strategy

Tests use a **hybrid approach** for test data:

1. **Create real K8s resources** in the test cluster (Deployment, StatefulSet, Service, etc.)
2. **POST same resources directly** to `/api/v1/resources/sync` endpoint for immediate Qdrant population
3. **Test the query tool** - both Vector DB search AND kubectl tools work against real resources

```typescript
// Example test setup
// 1. Create real K8s resource (for kubectl tools)
await kubectl('apply -f test-deployment.yaml');

// 2. Sync to Qdrant immediately (bypass controller timing)
await httpClient.post('/api/v1/resources/sync', {
  upserts: [{
    namespace: 'default',
    name: 'test-nginx',
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    labels: { app: 'nginx' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }]
});

// 3. Test query tool - vector search finds resource, kubectl gets live status
const result = await query({ intent: 'describe the nginx deployment' });
```

**Why this approach:**
- Real K8s resources required for `kubectl_get`, `kubectl_describe`, `kubectl_logs`
- Direct sync endpoint avoids controller timing uncertainty
- Tests are fast and deterministic
- Full integration path is validated

---

## Dependencies

### Internal Dependencies
- `src/core/capability-vector-service.ts` - Capabilities Vector DB
- `src/core/resource-vector-service.ts` - Resources Vector DB (PRD #287)
- `src/core/kubectl-tools.ts` - Kubectl tool definitions
- `src/core/ai-provider.interface.ts` - Tool loop infrastructure

### External Dependencies
- Qdrant running with `capabilities` and `resources` collections
- Kubernetes cluster accessible via kubectl
- Embedding provider configured

### Related PRDs
- PRD #287 (Resource Sync Endpoint) - Provides resources Vector DB
- PRD #48 (Resource Capabilities) - Provides capabilities Vector DB
- PRD #143 (Tool-Based Remediation) - Kubectl tools pattern

---

## Success Criteria

1. **Semantic queries work**: "show me databases" returns StatefulSet, CNPG, etc.
2. **Direct queries work**: "pods in default namespace" returns pod list
3. **Status queries work**: "is nginx healthy" returns health status
4. **Discovery works**: "what operators are installed" returns operators
5. **Read-only enforced**: No write operations possible through this tool
6. **JSON output**: Client agents can parse and display results

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| LLM makes wrong tool choices | Detailed system prompt with strategy guidance; test with diverse queries |
| Token costs from verbose kubectl output | Start without limits; add truncation if needed; guide via prompt |
| Stale Vector DB data | Instruct LLM to verify with kubectl for freshness-sensitive queries |
| Slow multi-tool queries | Accept initial latency; optimize hot paths in future PRD |
| Semantic bridge not discovered | Explicitly encode pattern in system prompt |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| **10 tools total** | Balance between capability and complexity; LLM can handle this |
| **Separate search/query for Vector DB** | search = semantic, query = filters; different use cases |
| **Read-only kubectl subset** | Clear separation from remediate tool; no accidental writes |
| **JSON output** | Let client agent handle formatting; maximum flexibility |
| **System prompt strategy** | Encode semantic bridge explicitly; don't rely on LLM discovering it |
| **No permission restrictions initially** | Start simple; add permissions in future PRD if needed |
| **Hybrid integration test approach** | Tests create real K8s resources (for kubectl) AND POST directly to sync endpoint (for Qdrant). Avoids controller timing dependency while validating full query tool flow. |
| **AI-constructed Qdrant filters** | Instead of pre-defined filter interfaces (e.g., `CapabilityQueryFilters`), the AI constructs Qdrant filters directly. Tool descriptions include available payload fields. More flexible, less code, AI adapts to any query. |
| **Incremental tool validation** | Build and test each tool type separately (capabilities → resources → kubectl), verifying AI usage via debug output before combining. Reduces debugging complexity. |
| **Evaluation-driven test strategy** | For each tool type, write 2 tests: (1) semantic query triggering `search_*`, (2) filter query triggering `query_*`. Run with `DEBUG_DOT_AI=true`, manually inspect debug output to verify AI used expected tools. Human-in-the-loop validation before tests become regression tests. |

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-19 | PRD created after brainstorming session |
| 2025-12-23 | Finalized integration test strategy: hybrid approach using real K8s resources + direct sync endpoint POST |
| 2025-12-23 | M1 partial: Added generic `queryWithFilter()` to BaseVectorService and `scrollWithFilter()` to VectorDBService. Architecture decision: AI constructs Qdrant filters directly instead of pre-defined filter interfaces. |
| 2025-12-23 | Updated milestones to capabilities-first approach. Added evaluation-driven test strategy decision. Updated semantic bridge example to use Qdrant filter syntax. |
| 2025-12-23 | M2 complete: Created capability tools (`search_capabilities`, `query_capabilities`) in reusable `capability-tools.ts`. Minimal system prompt relies on tool descriptions. Integration tests validate AI selects correct tools for semantic vs filter queries. |
| 2025-12-23 | M3 complete: Created resource tools (`search_resources`, `query_resources`) in `resource-tools.ts`. Updated query.ts to include both capability and resource tools. Added 2 integration tests with real K8s resources (CNPG Cluster in dedicated namespace). All 4 query tests passing. |

---

## References

- [PRD #287: Resource Sync Endpoint](./287-resource-sync-endpoint.md) - Resources Vector DB
- [PRD #48: Resource Capabilities](./done/48-resource-capabilities-discovery-integration.md) - Capabilities Vector DB
- [PRD #143: Tool-Based Remediation](./done/143-tool-based-remediation.md) - Kubectl tools pattern
- [kubectl-tools.ts](../src/core/kubectl-tools.ts) - Existing kubectl tool definitions
- [capability-vector-service.ts](../src/core/capability-vector-service.ts) - Capabilities service
- [resource-vector-service.ts](../src/core/resource-vector-service.ts) - Resources service
