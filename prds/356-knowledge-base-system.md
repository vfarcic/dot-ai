# PRD #356: Knowledge Base System

**Status**: In Progress
**Created**: 2025-01-30
**GitHub Issue**: [#356](https://github.com/vfarcic/dot-ai/issues/356)
**Priority**: High
**Related**:
- PRD #359 (Qdrant Plugin Migration - ✅ **completed**)
- PRD #357 (Policy Extraction - depends on this)
- Controller PRD (to be created - handles CRD, Git operations, scheduling)

---

## Problem Statement

Organizations have valuable knowledge scattered across Git repositories (markdown docs), Slack, Confluence, and other sources. This knowledge isn't accessible to AI systems for semantic search and retrieval, limiting the AI's ability to provide contextual, organization-specific guidance.

### Current Challenges

- **Fragmented Knowledge**: Documentation spread across multiple systems with no unified access
- **No Semantic Search**: Can't find relevant information based on meaning, only exact keywords
- **Manual Discovery**: Users must know where to look and search each system separately
- **AI Context Gap**: AI assistants can't leverage organizational knowledge for recommendations
- **Stale Information**: No mechanism to track when source documents change

### User Impact

- **Platform Teams**: Can't provide AI with organizational context for better recommendations
- **Developers**: Spend time searching multiple systems for relevant documentation
- **AI System**: Makes generic recommendations without organizational knowledge
- **Organizations**: Accumulated knowledge isn't leveraged for AI-assisted workflows

---

## Solution Overview

Create a knowledge base ingestion and search system in the MCP server that:

1. **Receives Documents**: Accept documents from external sources (controller, direct API/MCP calls)
2. **Intelligent Chunking**: Use semantic-aware text splitting
3. **Vector Storage**: Store chunks in Qdrant with hybrid search (dense + BM25)
4. **Semantic Search**: Enable natural language search across ingested knowledge
5. **Unified Access**: Single MCP tool (`manageKnowledge`) automatically exposed as HTTP API

**Note**: Source orchestration (Git operations, CRDs, scheduling) is handled by the controller (separate PRD).

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  KUBERNETES CONTROLLER (separate PRD)                           │
│  • KnowledgeSource CRD (repo, branch, paths, frequency)         │
│  • Git operations (clone, pull, diff)                           │
│  • CronJob scheduling based on frequency                        │
│  • Sends documents one at a time to MCP server                  │
└─────────────────────────────────────────────────────────────────┘
                              │
            POST /api/v1/tools/manageKnowledge
            { operation: "ingest", content: "...", ... }
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  MCP SERVER (this PRD)                                          │
├─────────────────────────────────────────────────────────────────┤
│                      INGESTION PIPELINE                         │
│  Document ───► Chunking ───► Embedding ───► Qdrant Storage      │
├─────────────────────────────────────────────────────────────────┤
│                      SEARCH PIPELINE                            │
│  Query ───► Embedding ───► Hybrid Search ───► Ranked Results    │
├─────────────────────────────────────────────────────────────────┤
│  UNIFIED ACCESS (MCP Tool = HTTP API)                           │
│  • MCP Tool: manageKnowledge (ingest, search, deleteByUri)       │
│  • HTTP: POST /api/v1/tools/manageKnowledge (auto-generated)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  QDRANT: knowledge-base collection                              │
│  • Dense vectors (semantic similarity)                          │
│  • Sparse vectors (BM25 keyword matching)                       │
│  • Payload: content, uri, metadata, chunkIndex                  │
└─────────────────────────────────────────────────────────────────┘
```

### Qdrant Collection

| Collection | Purpose | Vectors |
|------------|---------|---------|
| `knowledge-base` | Document chunks with embeddings | Dense + Sparse (BM25) |

Each chunk references its `uri` for efficient deletion when a document is updated or removed.

---

## User Stories

### Primary User Stories

1. **As a controller**, I want to send documents to the MCP server for ingestion so they become searchable
   - **Acceptance**: HTTP API accepts document content + metadata, chunks and stores in Qdrant

2. **As a user**, I want to search the knowledge base with natural language so I can find relevant information
   - **Acceptance**: Semantic search returns relevant chunks ranked by relevance

3. **As a user**, I want to directly ingest a document via MCP so I can add ad-hoc content
   - **Acceptance**: MCP tool accepts document content and ingests it without needing the controller

4. **As a controller**, I want to delete all chunks for a URI so I can clean up or prepare for re-ingestion
   - **Acceptance**: deleteByUri removes all chunks with matching URI

### Secondary User Stories

5. **As a user**, I want to see where search results came from so I can verify the information
   - **Acceptance**: Results include source URI and metadata

6. **As a developer**, I want a mock server to test against so I can develop the controller in parallel
   - **Acceptance**: Mock server responds to all API endpoints with realistic responses

---

## Technical Approach

### Unified API: MCP Tool as HTTP Endpoint

All MCP tools are automatically exposed via HTTP at `POST /api/v1/tools/:toolName`. This means:
- Creating the `manageKnowledge` MCP tool automatically provides HTTP access
- No separate HTTP endpoint implementation needed
- Controller calls `POST /api/v1/tools/manageKnowledge` with operation parameters
- Users interact via MCP protocol with the same tool

**HTTP Access Pattern:**
```bash
# Ingest a document
curl -X POST http://localhost:3456/api/v1/tools/manageKnowledge \
  -H "Content-Type: application/json" \
  -d '{"operation": "ingest", "uri": "https://github.com/acme/platform/blob/main/docs/guide.md", "content": "..."}'

# Search the knowledge base
curl -X POST http://localhost:3456/api/v1/tools/manageKnowledge \
  -H "Content-Type: application/json" \
  -d '{"operation": "search", "query": "how to deploy", "limit": 10}'

# Delete all chunks for a URI (for updates: delete then re-ingest)
curl -X POST http://localhost:3456/api/v1/tools/manageKnowledge \
  -H "Content-Type: application/json" \
  -d '{"operation": "deleteByUri", "uri": "https://github.com/acme/platform/blob/main/docs/guide.md"}'
```

### MCP Tool: manageKnowledge

```typescript
type KnowledgeOperation =
  | 'ingest'         // Ingest a document
  | 'search'         // Semantic search
  | 'deleteByUri';   // Delete all chunks for a URI

interface ManageKnowledgeParams {
  operation: KnowledgeOperation;

  // For ingest
  content?: string;
  uri?: string;                    // Required for ingest, deleteByUri - full URL
  metadata?: Record<string, any>;  // Optional additional metadata

  // For search
  query?: string;
  limit?: number;
  scoreThreshold?: number;         // Min similarity score (0-1, default: 0.3)
}
```

### Knowledge Chunk Schema

```typescript
interface KnowledgeChunk {
  id: string;                        // Deterministic UUID v5 from uri#chunkIndex
  content: string;                   // Chunk text
  uri: string;                       // Full URL (e.g., 'https://github.com/org/repo/blob/main/docs/guide.md')
  metadata: Record<string, any>;     // Optional source-specific metadata

  // Change tracking
  checksum: string;                  // SHA-256 hash of content
  ingestedAt: string;                // When chunked/embedded

  // Chunking info
  chunkIndex: number;
  totalChunks: number;

  // Links to extracted items (populated by PRD #357)
  extractedPolicyIds?: string[];

  // Vectors (stored in Qdrant)
  // Dense embedding from embedding service
}
```

**Chunk ID Generation**: Deterministic UUID v5 from `${uri}#${chunkIndex}` enables:
- **Upsert behavior**: Re-ingesting same content updates in place (no duplicates)
- **Direct lookup**: Can compute ID from URI without querying
- **Idempotent ingestion**: Same request = same result

### Search Result Schema

```typescript
interface KnowledgeSearchResult {
  chunks: Array<{
    id: string;
    content: string;
    score: number;
    matchType: 'semantic' | 'keyword' | 'hybrid';
    uri: string;
    metadata: Record<string, any>;
    chunkIndex: number;
    totalChunks: number;
    extractedPolicies?: Array<{   // Populated by PRD #357
      id: string;
      description: string;
    }>;
  }>;
  totalMatches: number;
}
```

### Libraries to Use

| Component | Library | Why |
|-----------|---------|-----|
| **Chunking** | Chonkie | Semantic chunking, 100+ GB/s, Qdrant integration |
| **BM25 Sparse Vectors** | FastEmbed | Qdrant's own library, native integration |
| **Dense Embeddings** | Existing embedding service | Already implemented, multi-provider |
| **Vector Storage** | Qdrant | Already in use, hybrid search support |

**Note**: Git operations and front matter parsing moved to controller PRD.

---

## Milestones

### Milestone 1: Ingest Operation - Contract & Implementation
**Goal**: Define and implement the `ingest` operation with chunking and embedding storage

**Success Criteria**:
- [x] Create `src/tools/manage-knowledge.ts` with Zod schema for `ingest` operation only
- [x] Register tool with MCP server
- [x] Chunking implementation (semantic-aware splitting)
- [x] KnowledgeVectorService extending BaseVectorService pattern (via plugin delegation)
- [x] Qdrant collection "knowledge-base" created
- [x] Dense embeddings via existing embedding service
- [ ] Sparse BM25 vectors via FastEmbed (if feasible) - **Deferred**: FastEmbed not available for Node.js
- [x] Chunk metadata stored correctly (uri, chunkIndex, checksum, etc.)
- [x] Integration tests for ingestion pipeline
- [x] HTTP endpoint auto-available at `POST /api/v1/tools/manageKnowledge`

**Validation**:
- Tool appears in `/api/v1/tools` discovery endpoint
- Documents can be ingested via MCP tool or HTTP API
- Documents chunked with appropriate boundaries
- Chunks stored with embeddings and correct metadata

---

### Milestone 2: Ingest Mock Server Fixture
**Goal**: Create mock server fixture for ingest operation to enable parallel controller development

**Success Criteria**:
- [x] Mock server fixture for `ingest` operation
- [x] Fixture matches Zod response schema from Milestone 1
- [x] Controller team can develop against mock server

**Validation**:
- `POST /api/v1/tools/manageKnowledge` with `operation: "ingest"` returns appropriate mock response
- Mock response matches real API contract

---

### Milestone 3: Search Operation
**Goal**: Add semantic + keyword search operation

**Success Criteria**:
- [x] Add `search` operation to Zod schema
- [~] Hybrid search combining dense and sparse vectors - **Deferred**: BM25/FastEmbed not available for Node.js
- [~] RRF (Reciprocal Rank Fusion) for result merging - **Deferred**: Single vector type (dense only)
- [x] Source filtering by uri (uriFilter parameter)
- [x] Result includes provenance (uri, metadata, chunkIndex)
- [x] Configurable result limit
- [x] Configurable score threshold (scoreThreshold parameter, default 0.3)
- [x] Integration tests for search (5 tests passing)
- [x] Mock server fixture for search operation

**Validation**:
- Semantic queries return relevant chunks
- ~~Exact keyword matches boosted appropriately~~ (deferred - no BM25)
- Results include correct source information

---

### Milestone 4: DeleteByUri Operation
**Goal**: Add operation to delete all chunks for a URI (enables document updates)

**Success Criteria**:
- [x] Add `deleteByUri` operation to Zod schema
- [x] Delete all chunks matching URI from Qdrant
- [x] Integration tests for deleteByUri
- [x] Mock server fixture for deleteByUri operation

**Validation**:
- All chunks for a URI can be deleted
- Deletion is atomic and complete
- Re-ingesting after delete works correctly (update flow)

---

### Milestone 5: Controller PRD Creation
**Goal**: Create PRD for controller-side knowledge base orchestration

**Success Criteria**:
- [ ] Use `/request-dot-ai-feature` to send API contract to controller
- [ ] Controller PRD created with: KnowledgeSource CRD, Git adapter, CronJob scheduling
- [ ] Clear interface contract between controller and MCP server

**Validation**:
- Controller team has clear PRD to implement
- API contract is well-defined and tested via mock server

---

### Milestone 6: Documentation
**Goal**: Create user-facing documentation after controller integration is validated

**Success Criteria**:
- [ ] User guide for knowledge base ingestion and search
- [ ] API reference with examples for all operations (ingest, search, deleteByUri)
- [ ] Architecture overview showing MCP server + controller interaction
- [ ] Troubleshooting guide for common issues

**Validation**:
- Documentation tested against working end-to-end system
- Examples verified to work with real API

**Note**: This milestone intentionally follows controller integration to ensure documentation reflects validated, working functionality.

---

### Milestone 7: Web UI PRD Creation
**Goal**: Create PRD for knowledge base UI in the dot-ai-ui project

**Success Criteria**:
- [ ] Use `/request-dot-ai-feature` to send API contract to dot-ai-ui project
- [ ] Web UI PRD created with: search interface, result display, source browsing
- [ ] Clear interface contract between UI and MCP server API

**Validation**:
- UI team has clear PRD to implement
- API contract covers all UI requirements (search, pagination, filtering)

**Note**: UI PRD should be created after MCP server API is stable and controller integration is validated.

---

---

## Success Criteria

### Functional Success
- [ ] Documents can be ingested via MCP tool / HTTP API (same endpoint)
- [ ] Documents chunked and stored with embeddings
- [ ] Semantic search returns relevant results
- [ ] Chunks can be deleted by URI (deleteByUri)

### Quality Success
- [ ] Search latency < 500ms for typical queries
- [ ] Ingestion handles documents up to 1MB
- [ ] Integration test coverage > 80%
- [ ] Clear error messages for common issues

### Architecture Success
- [ ] Clean separation: MCP server handles AI/vectors, controller handles orchestration
- [ ] Reuses existing embedding and vector DB infrastructure
- [ ] Mock server enables parallel controller development
- [ ] Single unified access layer (MCP tool = HTTP API via `/api/v1/tools/manageKnowledge`)

---

## Risks and Mitigations

### Risk 1: Chunking Quality
**Risk**: Chunking doesn't preserve meaning well

**Mitigation**:
- Test multiple chunking strategies
- Tune chunk size for best results
- Test with real documentation

**Severity**: Medium
**Likelihood**: Low

---

### Risk 2: Embedding Cost
**Risk**: Large knowledge bases consume significant embedding API calls

**Mitigation**:
- Checksum-based change detection (don't re-embed unchanged content)
- Document cost implications
- Consider local embedding models for large volumes

**Severity**: Low
**Likelihood**: Medium

---

### Risk 3: Controller Integration
**Risk**: API design doesn't meet controller needs

**Mitigation**:
- Mock server enables early validation
- Use `/request-dot-ai-feature` for formal contract communication
- Iterate on API based on controller feedback before full implementation

**Severity**: Medium
**Likelihood**: Low

---

## Dependencies

### External Dependencies
- **Chunking library**: TBD (evaluate Chonkie, LangChain text splitters, or custom)
- **FastEmbed**: BM25 sparse vectors (Apache 2.0) - if feasible in Node.js

### Internal Dependencies
- **Qdrant**: Vector storage (already in use)
- **Embedding Service**: Dense embeddings (already implemented)
- **BaseVectorService**: Pattern for vector services
- **REST API infrastructure**: Route registry from PRD #355
- **Mock Server**: For controller parallel development

### Blocked By
- **PRD #359** (Qdrant Plugin Migration) - Knowledge Base should be implemented in the plugin, not MCP core

### Blocks
- PRD #357 (Policy Extraction) - requires knowledge base to extract from
- Controller PRD (Knowledge Source CRD) - requires our API to be defined

---

## Open Questions

1. **Chunking Library**: Which library to use for chunking in Node.js? (Options: Chonkie, LangChain splitters, custom recursive splitter)

2. **BM25 in Node.js**: Is FastEmbed available for Node.js or do we need an alternative for sparse vectors?

## Resolved Questions

5. **Architecture Split**: Should source orchestration be in MCP server or controller?
   - **Decision**: Controller handles Git operations, CRDs, scheduling; MCP server handles ingest/chunk/embed/search
   - **Rationale**: Kubernetes-native orchestration belongs in controller; MCP server stays focused on AI operations
   - **Date**: 2025-01-30

6. **Bulk vs Single Document Ingestion**: Should controller send documents in batches or one at a time?
   - **Decision**: One document at a time
   - **Rationale**: Simpler error handling, retry logic, and progress tracking; no real benefit to batching for periodic sync
   - **Date**: 2025-01-30

7. **Source Config Storage**: Where to store source configurations?
   - **Decision**: Kubernetes CRs (in controller), not Qdrant
   - **Rationale**: GitOps-friendly, native K8s observability, declarative configuration
   - **Date**: 2025-01-30

8. **HTTP API vs MCP Tool**: Should we have separate HTTP endpoints or use MCP tool?
   - **Decision**: Single MCP tool (`manageKnowledge`) which is automatically exposed as HTTP API via `POST /api/v1/tools/manageKnowledge`
   - **Rationale**: All MCP tools are already exposed via the generic `/api/v1/tools/:toolName` endpoint. Creating separate HTTP endpoints would be redundant and inconsistent with how other tools (like `manageOrgData`) work. This simplifies implementation and maintains consistency.
   - **Impact**: Removed Milestone 4 (separate HTTP API), simplified architecture diagram, updated Technical Approach section
   - **Date**: 2025-01-30

9. **Contract-First Development**: Should we create mock fixtures before or after MCP tool implementation?
   - **Decision**: Contract-first approach - define MCP tool with Zod schemas first (stub implementation), then create mock fixtures that match the contract
   - **Rationale**: The Zod schema IS the contract. MCP tool registration auto-generates HTTP endpoint and OpenAPI spec. Mock fixtures should match the real contract, not define it. This prevents contract drift between mock and real implementation.
   - **Impact**: Reordered milestones - M1 is now contract definition (MCP tool registration with stub), M2 is mock fixtures, M3-5 are implementation, M6 is controller PRD
   - **Date**: 2025-01-30

10. **Incremental Operation Implementation**: Should all operations be defined upfront or added incrementally?
    - **Decision**: Implement operations one at a time, starting with `ingest`, then `search`, `deleteBySource`, and `getChunk` as separate milestones
    - **Rationale**: Allows faster iteration, earlier validation of each operation, and ability to adjust schema/approach based on learnings from previous operations. Each operation can be fully implemented and tested before moving to the next.
    - **Impact**: Restructured milestones - M1 is now ingest (contract + implementation), M2 is ingest mock fixture, M3-5 add search/deleteBySource/getChunk operations individually, M6 is controller PRD
    - **Date**: 2025-01-30

11. **Implementation Location**: Should Knowledge Base be implemented in MCP core or in the Qdrant plugin?
    - **Decision**: Implement in the Qdrant plugin (after PRD #359 completes)
    - **Rationale**: PRD #359 is migrating all Qdrant/vector operations to a plugin. Implementing Knowledge Base in MCP core now would require migration later. Better to wait for plugin infrastructure and implement there from the start.
    - **Impact**: PRD #356 is now blocked by PRD #359. Status changed to "Blocked". Implementation approach will need to be updated once plugin architecture is finalized.
    - **Date**: 2025-01-30

12. **Chunk Size and Overlap**: What chunk size and overlap to use?
    - **Decision**: 1000 characters max chunk size with 200 character overlap (20%)
    - **Rationale**: Industry standard for semantic search. 20% overlap ensures context continuity across chunk boundaries.
    - **Date**: 2025-02-02

13. **Empty Content Handling**: How to handle empty or whitespace-only documents?
    - **Decision**: Return success with `chunksCreated: 0` and descriptive message
    - **Rationale**: Allows batch workflows to continue without breaking on empty files. Caller can see nothing was stored (not a silent failure).
    - **Date**: 2025-02-02

14. **Document Size Limit**: What's the maximum document size for ingestion?
    - **Decision**: 1MB maximum input document size
    - **Rationale**: ~1000 chunks max per document, reasonable for embedding API costs and processing time. Larger documents should be split by the caller.
    - **Date**: 2025-02-02

15. **Document Update Strategy**: How to handle document updates?
    - **Decision**: Delete and re-ingest pattern (not partial updates)
    - **Rationale**: Simple, consistent, handles chunk boundary shifts correctly. Embedding costs are minimal. Controller detects change → calls deleteByUri → calls ingest with new content.
    - **Date**: 2025-02-02

16. **Source Identifier Design**: Should we have separate sourceId and uri fields?
    - **Decision**: Single `uri` field serves as both identifier and provenance
    - **Rationale**: Eliminates redundancy. URI uniquely identifies the source document. No need for separate grouping key when URI already serves that purpose.
    - **Impact**: Renamed `deleteBySource` to `deleteByUri`. Removed `sourceId` from schema.
    - **Date**: 2025-02-02

17. **URI Format**: Should URIs be short paths or full URLs?
    - **Decision**: Full clickable URLs required (e.g., `https://github.com/org/repo/blob/main/docs/guide.md`)
    - **Rationale**: Globally unique, self-describing, directly clickable in search results. Controller constructs complete URL including host and branch.
    - **Examples**: `https://github.com/acme/platform/blob/main/docs/guide.md`, `https://slack.com/archives/C123/p456`, `https://confluence.acme.com/wiki/spaces/PLAT/pages/123`
    - **Date**: 2025-02-02

18. **Chunk ID Generation**: How to generate chunk IDs?
    - **Decision**: Deterministic UUID v5 from `${uri}#${chunkIndex}` using a fixed namespace
    - **Rationale**: Enables upsert behavior (re-ingesting updates in place), direct lookup by computed ID, and idempotent ingestion. Same URI + chunk index always produces same ID.
    - **Impact**: Qdrant point IDs are deterministic, not random UUIDs. Simplifies update flow.
    - **Date**: 2025-02-02

19. **Embedding Model**: Should knowledge base use same embedding model as policies?
    - **Decision**: Yes, use existing embedding service
    - **Rationale**: Consistency across the system, reuse existing infrastructure, no additional configuration needed.
    - **Date**: 2025-02-02

20. **GetChunk Operation**: Is a `getChunk` operation needed to retrieve individual chunks by ID?
    - **Decision**: No, removed from scope
    - **Rationale**: The `search` operation returns chunk content and metadata in results. No clear use case for fetching a single chunk by ID.
    - **Impact**: Removed Milestone 5 (GetChunk), renumbered subsequent milestones. Simplified API surface.
    - **Date**: 2025-02-03

21. **GetByUri Operation**: Is a `getByUri` operation needed to retrieve all chunks for a document?
    - **Decision**: No, removed from scope
    - **Rationale**: Was implemented for testing/debugging during development. Not part of core workflow - controller knows what it ingested, users find content via search, delete works directly by URI.
    - **Impact**: Removed `getByUri` operation. API now has 3 operations: ingest, search, deleteByUri.
    - **Date**: 2025-02-03

---

## Future Enhancements (Out of Scope for this PRD)

### Controller PRD Scope (separate PRD)
- KnowledgeSource CRD definition
- Git adapter (clone, pull, diff)
- CronJob scheduling based on sync frequency
- Additional source adapters (Slack, Confluence, Notion)

### Future MCP Server Enhancements
- Knowledge base analytics (most searched, gaps)
- Multi-tenant knowledge isolation
- Automatic summarization of chunks
- Question-answer pair generation
- Knowledge graph extraction
- Cross-reference detection

---

## References

- **Qdrant Hybrid Search**: https://qdrant.tech/articles/hybrid-search/
- **Existing Vector Services**: `src/core/base-vector-service.ts`, `src/core/policy-vector-service.ts`
- **Existing Embedding Service**: `src/core/embedding-service.ts`
- **REST API Infrastructure**: PRD #355, `src/api/`
- **Mock Server**: `mock-server/`
- **Cross-project Skills**: `/request-dot-ai-feature`, `/process-feature-request`

---

## Work Log

### 2025-01-30: PRD Creation
**Status**: Planning

**Completed Work**:
- Comprehensive research on existing solutions
- Architecture design with modular adapter pattern
- Library selection (Chonkie, FastEmbed)
- Schema design for chunks and sources
- MCP tool interface design
- Milestone breakdown

**Key Decisions**:
- Use Chonkie for chunking (not full LlamaIndex/LangChain)
- Hybrid search with Qdrant native BM25 + dense
- Modular adapter pattern for future source types
- Separate from policy extraction (PRD #357)

**Next Steps**:
- Begin Milestone 1: Source adapter interface
- Implement Git Markdown adapter

---

### 2025-01-30: Major Architecture Revision - Controller Split
**Status**: Planning (scope revised)

**Key Architectural Decision**: Split responsibility between MCP server and Kubernetes controller

**What moved to Controller (separate PRD)**:
- Git operations (clone, pull, diff)
- Source configuration storage (CRD/CRs instead of Qdrant)
- Scheduling (CronJobs based on sync frequency)
- Source adapters (Git, Slack, Confluence)

**What stays in MCP Server (this PRD)**:
- Document ingestion (receive content, chunk, embed, store)
- Semantic search
- Delete by source
- HTTP API + MCP tool dual access

**Design Decisions Made**:

1. **Controller-based orchestration**
   - Users create KnowledgeSource CRs in Kubernetes
   - Controller manages CronJobs, Git operations
   - Controller calls MCP server HTTP API to ingest documents
   - Rationale: Kubernetes-native, GitOps-friendly, proper separation of concerns

2. **Single document ingestion (not bulk)**
   - Controller sends one document at a time
   - Rationale: Simpler error handling, retry logic; no real benefit to batching

3. **API-first with mock server**
   - Define OpenAPI spec first (Milestone 1)
   - Update mock server for controller to develop against
   - Enables parallel development
   - Rationale: Unblocks controller team, validates API design early

4. **Deferred controller PRD creation**
   - Create controller PRD after API + mock server complete (Milestone 6)
   - Use `/request-dot-ai-feature` skill for formal handoff
   - Rationale: Controller PRD should be based on finalized, tested API contract

5. **Single Qdrant collection**
   - Only `knowledge-base` collection needed (chunks with embeddings)
   - No `knowledge-sources` collection (configs live in K8s CRs)
   - Each chunk has `sourceId` for efficient deletion

**Scope Changes**:
- Removed: Source adapter interface, GitMarkdownAdapter, source registry, sync tracking
- Added: HTTP API endpoints, mock server updates, controller PRD creation milestone
- Simplified: MCP tool operations (ingest, search, deleteBySource, getChunk)

**Next Steps**:
- Milestone 1: Define OpenAPI spec for HTTP API
- Milestone 1: Update mock server with knowledge base endpoints
- Then proceed with chunking/embedding implementation

---

### 2025-01-30: Unified API Decision - MCP Tool = HTTP API
**Status**: Planning (simplified)

**Key Decision**: Eliminate separate HTTP endpoints in favor of unified MCP tool access

**Analysis**:
- Reviewed existing codebase architecture (`src/interfaces/rest-api.ts`)
- Found that all MCP tools are automatically exposed via `POST /api/v1/tools/:toolName`
- Existing tools like `manageOrgData` follow this pattern - no separate HTTP endpoints
- Creating separate `/api/knowledge/*` endpoints would be inconsistent and redundant

**Changes Made**:
1. **Architecture Diagram**: Updated to show unified access layer
2. **Technical Approach**: Replaced separate HTTP endpoints with HTTP access pattern examples
3. **Milestones**:
   - Milestone 1: Simplified to just mock server fixture
   - Milestone 4 (HTTP API): Removed entirely - merged into MCP tool milestone
   - Milestone 5 → Milestone 4: MCP tool now includes HTTP API validation
   - Milestone 6 → Milestone 5: Controller PRD creation
4. **Success Criteria**: Updated to reflect unified access
5. **Resolved Questions**: Added decision #8 documenting this choice

**Benefits**:
- Simpler implementation (one less milestone)
- Consistent with existing patterns (`manageOrgData`, etc.)
- No code duplication between HTTP handlers and MCP tool
- Automatic OpenAPI documentation via existing infrastructure

**Next Steps**:
- Create mock server fixture for `manageKnowledge` tool
- Proceed with chunking/embedding implementation (Milestone 2)

---

### 2025-01-30: Contract-First Development Approach
**Status**: Planning (milestone reordering)

**Key Decision**: Define API contract via MCP tool registration before creating mock fixtures

**Analysis**:
- MCP tools use Zod schemas for input validation
- Tool registration automatically exposes HTTP endpoint at `/api/v1/tools/:toolName`
- OpenAPI spec is auto-generated from Zod schemas via `zod-to-json-schema`
- Mock fixtures are manually created JSON files that should match the real contract

**Insight**: The Zod schema IS the contract. Creating mock fixtures first risks contract drift - the mock might not match what the real implementation will return. By registering the MCP tool first (even with a stub implementation), we:
1. Define the authoritative contract via Zod schemas
2. Get automatic HTTP endpoint exposure
3. Get automatic OpenAPI generation
4. Create mock fixtures that match the real contract

**Milestone Reordering**:
- **M1**: Define contract (MCP tool registration with Zod schemas, stub handler)
- **M2**: Create mock fixtures matching the contract
- **M3**: Chunking and storage pipeline
- **M4**: Hybrid search implementation
- **M5**: Full MCP tool implementation (replace stub with real logic)
- **M6**: Controller PRD creation

**Benefits**:
- Single source of truth for API contract (Zod schemas)
- Mock fixtures guaranteed to match real responses
- OpenAPI spec available immediately for documentation
- Controller team can develop against mock with confidence in contract stability

**Next Steps**:
- Explore existing tool patterns (`manageOrgData`)
- Create `src/tools/manage-knowledge.ts` with Zod schemas
- Register tool with stub handler

---

### 2025-01-30: Incremental Operation Implementation Decision
**Status**: Planning (milestone restructuring)

**Key Decision**: Implement operations one at a time rather than defining all operations upfront

**Analysis**:
- Original approach defined all 4 operations (ingest, search, deleteBySource, getChunk) in Milestone 1 as stubs
- New approach implements each operation fully before moving to the next
- Starts with `ingest` which is the foundational operation

**Milestone Restructuring**:
- **M1**: Ingest operation - full contract + implementation (chunking, embedding, storage)
- **M2**: Ingest mock fixture for controller parallel development
- **M3**: Search operation (add to schema, implement hybrid search, add mock)
- **M4**: DeleteBySource operation (add to schema, implement, add mock)
- **M5**: GetChunk operation (add to schema, implement, add mock)
- **M6**: Controller PRD creation

**Benefits**:
- Faster time to first working operation
- Earlier validation of architecture decisions
- Ability to adjust schema based on learnings
- Each milestone delivers complete, testable functionality
- Clearer scope for each milestone

**Next Steps**:
- Begin Milestone 1: Implement `ingest` operation
- Create `src/tools/manage-knowledge.ts` with ingest-only Zod schema
- Implement chunking and storage pipeline

---

### 2025-01-30: Blocked by Qdrant Plugin Migration
**Status**: ✅ Resolved - PRD #359 completed

**Key Decision**: Wait for PRD #359 (Qdrant Plugin Migration) before implementing Knowledge Base

**Analysis**:
- PRD #342 (Modular Plugin Architecture) has pending items for migrating Qdrant-related operations to plugins
- PRD #359 was created to address this migration
- Implementing Knowledge Base in MCP core now would require migration later
- Better architectural approach: implement Knowledge Base in the plugin from the start

**Impact**:
- PRD #356 status changed from "Planning" to "Blocked"
- Added PRD #359 as blocking dependency
- Implementation will use plugin infrastructure instead of MCP core patterns
- Milestones may need adjustment once plugin architecture is finalized

**Next Steps**:
- Complete PRD #359 (Qdrant Plugin Migration)
- Revisit PRD #356 milestones to align with plugin architecture
- Then proceed with Knowledge Base implementation in plugin

---

### 2025-02-02: PRD Unblocked - Starting Implementation
**Status**: In Progress

**Context**:
- PRD #359 (Qdrant Plugin Migration) has been completed
- Qdrant operations are now available via the agentic-tools plugin
- Knowledge Base can now be implemented using the plugin infrastructure

**Next Steps**:
- Begin Milestone 1: Ingest Operation - Contract & Implementation
- Create `manageKnowledge` MCP tool with Zod schema for `ingest` operation
- Implement chunking and embedding pipeline using plugin infrastructure

---

### 2025-02-02: API Design Decisions
**Status**: In Progress (design finalized)

**Key Design Decisions Made**:

1. **Simplified Identifier Model**
   - Single `uri` field replaces separate `sourceId` + `uri`
   - URI is the unique identifier for source documents
   - Full clickable URLs required (e.g., `https://github.com/org/repo/blob/main/docs/guide.md`)
   - Renamed `deleteBySource` → `deleteByUri`

2. **Deterministic Chunk IDs**
   - UUID v5 generated from `${uri}#${chunkIndex}`
   - Enables upsert behavior (re-ingest updates in place)
   - Same input always produces same chunk IDs
   - Idempotent ingestion

3. **Document Update Strategy**
   - Delete and re-ingest pattern (not partial updates)
   - Simple and handles chunk boundary shifts correctly
   - Flow: detect change → deleteByUri → ingest new content

4. **Chunking Configuration**
   - 1000 characters max chunk size
   - 200 character overlap (20%)
   - Empty content returns success with 0 chunks

5. **Input Limits**
   - 1MB maximum document size
   - Larger documents should be split by caller

**Schema Changes**:
- Removed: `sourceId` field, `source.type`, `source.uri` nested structure
- Added: flat `uri` field at top level
- Renamed: `deleteBySource` → `deleteByUri`
- Simplified: `KnowledgeChunk` schema

**Code Examples Updated**:
- HTTP access patterns
- MCP tool interface
- Knowledge chunk schema
- Search result schema

**Next Steps**:
- Implement Milestone 1 with finalized design
- Create type definitions, chunking utility, vector service, MCP tool

---

### 2025-02-02: Milestone 2 Implementation Complete
**Status**: In Progress (Milestone 2 done)

**Completed Work**:

1. **Mock Server Fixture** (`mock-server/fixtures/tools/manageKnowledge-ingest-success.json`)
   - Created fixture matching `IngestResponse` schema
   - Fields: success, operation, chunksCreated, chunkIds, uri, message
   - Sample data with 3 chunks for realistic testing

2. **Route Registration** (`mock-server/routes.ts`)
   - Added specific route for `/api/v1/tools/manageKnowledge`
   - Route placed before generic `:toolName` route for priority matching
   - Fixture properly linked and verified

**Verification**:
- Mock server builds successfully
- Route appears in `/routes` endpoint with `hasFixture: true`
- `POST /api/v1/tools/manageKnowledge` returns correct `IngestResponse` schema

**Next Steps**:
- Milestone 3: Implement `search` operation

---

### 2025-02-02: Milestone 1 Implementation Complete
**Status**: In Progress (Milestone 1 done)

**Completed Work**:

1. **Plugin Tool** (`packages/agentic-tools/src/tools/knowledge.ts`)
   - `knowledge_chunk` tool using `@langchain/textsplitters` (RecursiveCharacterTextSplitter)
   - Chunk size: 1000 chars, overlap: 200 chars
   - Deterministic UUID v5 chunk IDs from `${uri}#${chunkIndex}`
   - SHA-256 checksums for content verification

2. **MCP Core Types** (`src/core/knowledge-types.ts`)
   - `KnowledgeChunk`, `PluginChunkResult`, `IngestResponse`, `GetByUriResponse` interfaces

3. **MCP Tool** (`src/tools/manage-knowledge.ts`)
   - `manageKnowledge` tool with `ingest` and `getByUri` operations
   - Architecture: MCP server coordinates, plugin handles chunking and Qdrant operations
   - Embeddings generated in MCP core via `EmbeddingService`
   - Edge cases handled: empty content (returns 0 chunks), non-existent URI (returns empty array)

4. **Integration Tests** (`tests/integration/tools/manage-knowledge.test.ts`)
   - 7 tests all passing:
     - Single-chunk ingest and retrieve with exact value verification
     - Multi-chunk ingest and retrieve (real Kubernetes documentation content)
     - Empty content handling (whitespace-only returns 0 chunks)
     - Non-existent URI returns empty chunks array
     - Error handling for missing content, uri parameters
   - Uses deterministic chunk ID calculation for precise assertions

**Architecture Decision**:
- Implemented using plugin delegation pattern (not KnowledgeVectorService in MCP core)
- Chunking → `knowledge_chunk` plugin tool
- Embeddings → MCP core `EmbeddingService`
- Qdrant operations → `collection_initialize`, `vector_store`, `vector_query` plugin tools

**Deferred**:
- BM25 sparse vectors (FastEmbed not available for Node.js)
- Will rely on dense vector search; can add BM25 later if needed

**Next Steps**:
- Milestone 5: Implement `getChunk` operation
- Milestone 6: Controller PRD creation

---

### 2025-02-03: Milestone 3 Implementation Complete
**Status**: In Progress (Milestone 3 done)

**Completed Work**:

1. **Search Operation** (`src/tools/manage-knowledge.ts`)
   - Added `search` operation to Zod schema with `query`, `limit`, `uriFilter` parameters
   - `handleSearchOperation` generates query embedding and calls `vector_search` plugin
   - Configurable score threshold (default 0.3) filters low-relevance results
   - Returns `KnowledgeSearchResponse` with chunks, scores, and provenance

2. **URL Format Update**
   - Changed from `git://org/repo/path` to real clickable URLs
   - Example: `https://github.com/org/repo/blob/main/docs/guide.md`
   - Updated PRD, code, tests, and mock fixtures

3. **Integration Tests** (5 new tests, 12 total passing)
   - Search returns only matching chunk from multiple ingested docs
   - Multi-chunk document returns correct specific chunk by semantic match
   - Limit parameter respected
   - Empty results for non-matching queries
   - Error handling for missing query parameter

4. **Mock Server Fixture** (`manageKnowledge-search-success.json`)
   - Sample response with 3 chunks, scores, and provenance

**Deferred**:
- Hybrid search (BM25 + dense) - FastEmbed not available for Node.js
- RRF result merging - Only one vector type currently

**Next Steps**:
- Milestone 5: Controller PRD Creation

---

### 2025-02-03: Milestone 4 Implementation Complete
**Status**: In Progress (Milestone 4 done)

**Completed Work**:

1. **DeleteByUri Operation** (`src/tools/manage-knowledge.ts`)
   - Added `deleteByUri` operation to Zod schema
   - `handleDeleteByUriOperation` queries chunks by URI, then deletes each
   - Handles edge cases: collection not found (returns 0 deleted), no chunks found
   - Returns `DeleteByUriResponse` with `chunksDeleted` count

2. **Configurable Score Threshold**
   - Added `scoreThreshold` parameter to search operation (default: 0.3)
   - Users can control precision vs recall based on their needs
   - Lower values (0.2-0.3) return more results, higher values (0.5+) stricter

3. **Integration Tests** (7 tests all passing)
   - Comprehensive workflow test: Ingest → Search → Re-ingest (upsert) → Delete → Verify via search
   - Edge cases: empty content, unrelated search query
   - Error handling for missing parameters

4. **Mock Server Fixture** (`manageKnowledge-deleteByUri-success.json`)
   - Sample response with 3 chunks deleted

**Architecture**:
- DeleteByUri uses `vector_query` to find chunks, then `vector_delete` for each
- Consistent with plugin delegation pattern established in Milestone 1

**Next Steps**:
- Milestone 5: Controller PRD Creation

---

### 2025-02-03: API Simplification - Remove getByUri and getChunk
**Status**: In Progress (Implementation phase complete)

**Decisions Made**:

1. **Removed `getChunk` operation** (Resolved Question #20)
   - `search` returns chunk content and metadata in results
   - No clear use case for single chunk retrieval by ID

2. **Removed `getByUri` operation** (Resolved Question #21)
   - Was only used for testing/debugging during development
   - `search` with `uriFilter` achieves same result (find chunks for specific URI)
   - Not part of core workflow: controller knows what it ingested, users find content via search

**Final API** (3 operations):
- `ingest` - Add documents to knowledge base
- `search` - Semantic search (with optional `uriFilter` to target specific URI)
- `deleteByUri` - Remove all chunks for a URI

**Code Cleanup**:
- Removed `handleGetByUriOperation` function
- Removed `GetByUriResponse` and `GetChunkResponse` interfaces
- Updated error messages and schema descriptions
- Updated tests to verify deletion via search with uriFilter

**Next Steps**:
- Milestone 5: Controller PRD Creation
