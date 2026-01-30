# PRD #359: Qdrant Operations Plugin Migration

**GitHub Issue**: [#359](https://github.com/vfarcic/dot-ai/issues/359)
**Parent PRD**: [#342 - Modular Plugin Architecture](./342-modular-plugin-architecture.md)
**Status**: Draft
**Priority**: High
**Created**: 2026-01-30

---

## Problem Statement

Qdrant operations are tightly coupled to the MCP server:
- ~2,500 lines of Qdrant-specific code across 18 files
- Scattered instantiation of `*VectorService` classes throughout the codebase
- 4 Qdrant-specific environment variables configured in MCP server
- Adding new Qdrant features increases migration debt

This coupling:
1. Makes it harder to extend vector storage features cleanly
2. Increases the complexity of eventual plugin extraction
3. Violates PRD #342's vision of dot-ai as a "dumb orchestrator"

---

## Solution

Extract Qdrant operations into the **existing agentic-tools plugin** while keeping embedding generation in the MCP server.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DOT-AI MCP SERVER                        │
│  - Embedding generation (OpenAI/Google/Bedrock)            │
│  - Computes vectors, passes to plugin                      │
│  - No Qdrant dependencies                                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ POST /execute {
                          │   hook: "invoke",
                          │   payload: {
                          │     tool: "vector_store",
                          │     args: { collection, id, vector, metadata }
                          │   }
                          │ }
                          ▼
              ┌───────────────────────────────────────┐
              │         agentic-tools plugin          │
              │                                       │
              │  Existing:                            │
              │  - kubectl_*, helm_*, shell_exec      │
              │                                       │
              │  NEW (Qdrant operations):             │
              │  - vector_store                       │
              │  - vector_search                      │
              │  - vector_delete                      │
              │  - vector_query_filter                │
              │  - collection_initialize              │
              │  - collection_stats                   │
              └───────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Add to agentic-tools (not separate plugin) | Follows #342's "single agentic-tools package" principle; simpler deployment |
| Embeddings stay in MCP server | MCP already configured for LLM communication; avoids API key duplication |
| Plugin receives pre-computed vectors | Clean interface; plugin is pure storage layer |
| Move all QDRANT_* env vars to plugin | MCP becomes Qdrant-agnostic |

---

## Plugin Interface

### Architecture: Domain-Specific Tools with Shared Implementation

The plugin exposes **domain-specific tools** (capabilities, patterns, policies, resources) rather than generic vector operations. This enables:
1. **AI-friendly descriptions** - Tools describe what data they access, not storage mechanics
2. **MCP flexibility** - Same tools can be called by MCP code or exposed to internal AI via toolLoop
3. **Clean separation** - Plugin handles all Qdrant operations, MCP handles embeddings and orchestration

Internally, domain tools call shared functions to avoid code duplication.

```
Plugin Structure:
├── Internal shared functions (not exposed as tools):
│   ├── search(collection, embedding, options)
│   ├── query(collection, filter, options)
│   ├── store(collection, id, embedding, payload)
│   ├── get(collection, id)
│   ├── delete(collection, id)
│   └── list(collection, options)
│
└── Exposed tools (domain-specific):
    ├── Capabilities (6 tools)
    ├── Patterns (6 tools)
    ├── Policies (6 tools)
    ├── Resources (6 tools)
    └── Collection management (2 tools)
```

### Capabilities Tools

```typescript
// Semantic search for cluster capabilities
search_capabilities: {
  query: string;           // semantic query (e.g., "database", "message queue")
  embedding: number[];     // pre-computed embedding from MCP
  limit?: number;          // default: 10
}

// Filter-based query for capabilities
query_capabilities: {
  filter: Record<string, unknown>;  // Qdrant filter (provider, complexity, etc.)
  limit?: number;          // default: 100
}

// Store a capability
store_capability: {
  id: string;
  embedding: number[];
  payload: {
    resourceName: string;
    group: string;
    apiVersion: string;
    complexity: string;
    providers: string[];
    capabilities: string[];
    description: string;
    useCase: string;
    searchText: string;
  };
}

// Get capability by ID
get_capability: { id: string; }

// Delete capability by ID
delete_capability: { id: string; }

// List all capabilities
list_capabilities: { limit?: number; }
```

### Patterns Tools

```typescript
search_patterns: { query: string; embedding: number[]; limit?: number; }
query_patterns: { filter: Record<string, unknown>; limit?: number; }
store_pattern: { id: string; embedding: number[]; payload: PatternPayload; }
get_pattern: { id: string; }
delete_pattern: { id: string; }
list_patterns: { limit?: number; }
```

### Policies Tools

```typescript
search_policies: { query: string; embedding: number[]; limit?: number; }
query_policies: { filter: Record<string, unknown>; limit?: number; }
store_policy: { id: string; embedding: number[]; payload: PolicyPayload; }
get_policy: { id: string; }
delete_policy: { id: string; }
list_policies: { limit?: number; }
```

### Resources Tools

```typescript
search_resources: { query: string; embedding: number[]; limit?: number; filter?: Record<string, unknown>; }
query_resources: { filter: Record<string, unknown>; limit?: number; }
store_resource: { id: string; embedding: number[]; payload: ResourcePayload; }
get_resource: { id: string; }
delete_resource: { id: string; }
list_resources: { limit?: number; filter?: Record<string, unknown>; }
```

### Collection Management Tools

```typescript
// Initialize/ensure collection exists
collection_initialize: {
  collection: string;
  vectorSize: number;
  createTextIndex?: boolean;
}

// Get collection stats
collection_stats: {
  collection: string;
}

---

## Configuration Migration

### Move to agentic-tools Plugin

| Variable | Default | Purpose |
|----------|---------|---------|
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server connection (auto-set by Helm chart) |
| `QDRANT_API_KEY` | (none) | Authentication (optional, only for external Qdrant) |

**Note:** Collection name overrides (`QDRANT_CAPABILITIES_COLLECTION`, `QDRANT_RESOURCES_COLLECTION`) stay in MCP server. The MCP server resolves the collection name and passes it to the plugin via tool args (e.g., `{collection: "capabilities"}`). The plugin just stores to whatever collection name it receives - no env var logic needed.

### Stays in MCP Server

- All embedding-related config (`EMBEDDINGS_MODEL`, `OPENAI_API_KEY`, etc.)
- Collection name override env vars (`QDRANT_CAPABILITIES_COLLECTION`, `QDRANT_RESOURCES_COLLECTION`)
- No direct Qdrant client code remains

### Helm Chart Updates Required

The Helm chart currently:
- Passes `QDRANT_URL` to MCP server (will move to plugin)
- Has `qdrant.external.apiKey` in values.yaml but **never propagates it** (dead config)

Required changes:
1. Add `QDRANT_URL` to agentic-tools plugin env vars (same auto-generation logic)
2. Wire `QDRANT_API_KEY` to plugin if external Qdrant auth is needed
3. Remove `QDRANT_URL` from MCP server deployment

---

## Files to Modify

### MCP Server (refactor to use plugin)

| File | Change |
|------|--------|
| `src/core/vector-db-service.ts` | Replace Qdrant client calls with plugin invocations |
| `src/core/base-vector-service.ts` | Update to call plugin for storage/search |
| `src/core/pattern-vector-service.ts` | Remove direct Qdrant dependency |
| `src/core/policy-vector-service.ts` | Remove direct Qdrant dependency |
| `src/core/capability-vector-service.ts` | Remove direct Qdrant dependency |
| `src/core/resource-vector-service.ts` | Remove direct Qdrant dependency |
| `src/interfaces/resource-sync-handler.ts` | Use plugin for resource sync |
| `src/tools/organizational-data.ts` | Use plugin for pattern/policy ops |
| `src/tools/operate.ts` | Use plugin for reading org data |
| `src/tools/version.ts` | Use plugin for collection stats |
| `src/core/schema.ts` | Use plugin for collection initialization |

### agentic-tools Plugin (add Qdrant operations)

| File | Change |
|------|--------|
| `packages/agentic-tools/src/tools/` | Add vector_* tool implementations |
| `packages/agentic-tools/src/index.ts` | Register new tools in describe hook |
| `packages/agentic-tools/package.json` | Add `@qdrant/js-client-rest` dependency |
| `packages/agentic-tools/Dockerfile` | No change needed (npm install handles deps) |

---

## Migration Strategy

### Phase 1: Add Plugin Tools (non-breaking)

Add vector operations to agentic-tools without changing MCP server. This allows testing the plugin interface independently.

### Phase 2: Refactor VectorDBService

Update `VectorDBService` to call plugin instead of Qdrant directly. All `*VectorService` classes use `VectorDBService`, so this cascades automatically.

### Phase 3: Remove Qdrant Dependencies from MCP

- Remove `@qdrant/js-client-rest` from MCP server's package.json
- Remove Qdrant env vars from MCP deployment configs
- Update Helm chart to pass Qdrant config only to agentic-tools

### Phase 4: Validation

- All existing tests pass
- Integration tests verify end-to-end flow
- Version tool reports healthy Qdrant connection via plugin

---

## Success Criteria

1. **MCP server has zero Qdrant dependencies** - no imports, no env vars, no client code
2. **All existing integration tests pass unchanged** - this is pure refactoring, no behavioral changes
3. **Clean separation** - embeddings computed in MCP, storage handled by plugin
4. **Performance maintained** - no significant latency increase from plugin hop

---

## Milestones

### Phase 1: Add Domain Tools to Plugin
- [x] Add shared internal functions (search, query, store, get, delete, list)
- [ ] Add capabilities tools (search_capabilities, query_capabilities, store_capability, get_capability, delete_capability, list_capabilities)
- [ ] Add patterns tools (search_patterns, query_patterns, store_pattern, get_pattern, delete_pattern, list_patterns)
- [ ] Add policies tools (search_policies, query_policies, store_policy, get_policy, delete_policy, list_policies)
- [ ] Add resources tools (search_resources, query_resources, store_resource, get_resource, delete_resource, list_resources)
- [ ] Add collection management tools (collection_initialize, collection_stats)
- [ ] Unit tests for all plugin tools

### Phase 2: Migrate MCP to Use Plugin
- [ ] Update CapabilityVectorService to call plugin tools
- [ ] Update PatternVectorService to call plugin tools
- [ ] Update PolicyVectorService to call plugin tools
- [ ] Update ResourceVectorService to call plugin tools
- [ ] Update capability-tools.ts to use plugin (search_capabilities, query_capabilities)
- [ ] Update resource-tools.ts to use plugin (search_resources, query_resources)
- [ ] Update MCP tools (organize-data, operate, version) to use plugin

### Phase 3: Cleanup
- [ ] Remove Qdrant dependencies from MCP server package.json
- [ ] Update Helm chart to pass Qdrant config only to agentic-tools
- [ ] All existing integration tests pass (pure refactoring - no behavioral changes)
- [ ] Update umbrella PRD #342 (migration tracking, lessons learned, child PRDs)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Latency increase from plugin HTTP hop | Benchmark before/after; plugin runs as sidecar with minimal network latency |
| Breaking changes during migration | Phase 2 maintains backward compatibility; can rollback to direct Qdrant calls |
| Complex error handling across boundary | Plugin returns structured errors; MCP server translates to user-friendly messages |

---

## Out of Scope

- Changing embedding service architecture (stays in MCP)
- Adding new vector operations beyond current functionality
- Multi-tenancy or collection isolation changes
- Qdrant cluster/scaling configuration

---

## Decision Log

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2026-01-30 | Collection name overrides stay in MCP server, not plugin | MCP passes resolved collection name via tool args. Plugin is a pure storage layer with no business logic about which collection to use. Simplifies plugin interface. | Plugin only needs `QDRANT_URL` (required) and `QDRANT_API_KEY` (optional). Collection name override logic remains in MCP. |
| 2026-01-30 | Fix dead `qdrant.external.apiKey` Helm config | Currently defined in values.yaml but never propagated. If external Qdrant auth is needed, must wire to plugin. | Helm chart milestone includes fixing this dead config. |
| 2026-01-30 | Domain-specific tools instead of generic vector_* tools | Plugin tools are called by both MCP code AND internal AI agent via toolLoop. AI needs domain-aware descriptions ("search capabilities by concept") not storage mechanics ("vector similarity search"). Plugin doesn't distinguish callers - MCP decides which tools to expose where. | ~26 domain tools (capabilities, patterns, policies, resources) instead of 6 generic tools. Internal shared functions avoid code duplication. |
| 2026-01-30 | Embeddings passed to plugin, not generated there | MCP already has AI provider configuration. Avoids API key duplication in plugin. Clean interface: MCP generates embedding, passes to plugin tool. | All search/store tools accept pre-computed `embedding` parameter from MCP. |

---

## References

- [PRD #342 - Modular Plugin Architecture](./342-modular-plugin-architecture.md)
- [PRD #343 - kubectl Plugin Migration](./done/343-kubectl-plugin-migration.md) (pattern to follow)
- [Qdrant JS Client](https://github.com/qdrant/qdrant-js)
