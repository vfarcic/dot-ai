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

### New Tools to Add to agentic-tools

```typescript
// Store a vector with metadata
vector_store: {
  collection: string;      // e.g., "patterns", "capabilities"
  id: string;              // document ID
  vector: number[];        // pre-computed embedding from MCP
  payload: Record<string, unknown>;  // metadata (searchText, etc.)
}

// Semantic search with pre-computed query vector
vector_search: {
  collection: string;
  vector: number[];        // query embedding from MCP
  limit: number;
  filter?: Record<string, unknown>;  // optional Qdrant filter
  scoreThreshold?: number;
}

// Delete by ID
vector_delete: {
  collection: string;
  id: string;
}

// Filter-only query (no embedding needed)
vector_query_filter: {
  collection: string;
  filter: Record<string, unknown>;
  limit: number;
  offset?: number;
}

// Initialize/ensure collection exists
collection_initialize: {
  collection: string;
  vectorSize: number;      // embedding dimensions
  createTextIndex?: boolean;
}

// Get collection stats (for version/health reporting)
collection_stats: {
  collection: string;
}
```

---

## Configuration Migration

### Move to agentic-tools Plugin

| Variable | Default | Purpose |
|----------|---------|---------|
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server connection |
| `QDRANT_API_KEY` | (none) | Authentication |
| `QDRANT_CAPABILITIES_COLLECTION` | `capabilities` | Collection name override |
| `QDRANT_RESOURCES_COLLECTION` | `resources` | Collection name override |

### Stays in MCP Server

- All embedding-related config (`EMBEDDINGS_MODEL`, `OPENAI_API_KEY`, etc.)
- No Qdrant-specific configuration remains

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

- [ ] Add vector operation tools to agentic-tools plugin
- [ ] Create plugin-based VectorDBService adapter in MCP server
- [ ] Migrate all *VectorService classes to use plugin adapter
- [ ] Update resource-sync-handler to use plugin
- [ ] Update MCP tools (organize-data, operate, version) to use plugin
- [ ] Remove Qdrant dependencies from MCP server package.json
- [ ] Update Helm chart to pass Qdrant config only to agentic-tools
- [ ] Unit tests for new vector operation tools in agentic-tools plugin
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

## References

- [PRD #342 - Modular Plugin Architecture](./342-modular-plugin-architecture.md)
- [PRD #343 - kubectl Plugin Migration](./done/343-kubectl-plugin-migration.md) (pattern to follow)
- [Qdrant JS Client](https://github.com/qdrant/qdrant-js)
