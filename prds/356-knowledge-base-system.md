# PRD #356: Knowledge Base System

**Status**: Blocked
**Created**: 2025-01-30
**GitHub Issue**: [#356](https://github.com/vfarcic/dot-ai/issues/356)
**Priority**: High
**Related**:
- PRD #359 (Qdrant Plugin Migration - **blocks this PRD**)
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
│  • MCP Tool: manageKnowledge (ingest, search, delete, getChunk) │
│  • HTTP: POST /api/v1/tools/manageKnowledge (auto-generated)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  QDRANT: knowledge-base collection                              │
│  • Dense vectors (semantic similarity)                          │
│  • Sparse vectors (BM25 keyword matching)                       │
│  • Payload: content, sourceId, uri, metadata                    │
└─────────────────────────────────────────────────────────────────┘
```

### Qdrant Collection

| Collection | Purpose | Vectors |
|------------|---------|---------|
| `knowledge-base` | Document chunks with embeddings | Dense + Sparse (BM25) |

Each chunk references its `sourceId` for efficient deletion when a source is removed.

---

## User Stories

### Primary User Stories

1. **As a controller**, I want to send documents to the MCP server for ingestion so they become searchable
   - **Acceptance**: HTTP API accepts document content + metadata, chunks and stores in Qdrant

2. **As a user**, I want to search the knowledge base with natural language so I can find relevant information
   - **Acceptance**: Semantic search returns relevant chunks ranked by relevance

3. **As a user**, I want to directly ingest a document via MCP so I can add ad-hoc content
   - **Acceptance**: MCP tool accepts document content and ingests it without needing the controller

4. **As a controller**, I want to delete all chunks for a source so I can clean up when a source is removed
   - **Acceptance**: deleteBySource removes all chunks with matching sourceId

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
  -d '{"operation": "ingest", "sourceId": "docs", "content": "...", "uri": "..."}'

# Search the knowledge base
curl -X POST http://localhost:3456/api/v1/tools/manageKnowledge \
  -H "Content-Type: application/json" \
  -d '{"operation": "search", "query": "how to deploy", "limit": 10}'

# Delete all chunks for a source
curl -X POST http://localhost:3456/api/v1/tools/manageKnowledge \
  -H "Content-Type: application/json" \
  -d '{"operation": "deleteBySource", "sourceId": "docs"}'

# Get a specific chunk
curl -X POST http://localhost:3456/api/v1/tools/manageKnowledge \
  -H "Content-Type: application/json" \
  -d '{"operation": "getChunk", "chunkId": "abc-123"}'
```

### MCP Tool: manageKnowledge

```typescript
type KnowledgeOperation =
  | 'ingest'         // Ingest a document (for direct user input)
  | 'search'         // Semantic search
  | 'deleteBySource' // Delete all chunks for a sourceId
  | 'getChunk';      // Get specific chunk by ID

interface ManageKnowledgeParams {
  operation: KnowledgeOperation;

  // For ingest
  content?: string;
  uri?: string;
  sourceId?: string;             // Default: 'user-provided'
  metadata?: Record<string, any>;

  // For search
  query?: string;
  limit?: number;

  // For deleteBySource
  // sourceId (above)

  // For getChunk
  chunkId?: string;
}
```

### Knowledge Chunk Schema

```typescript
interface KnowledgeChunk {
  id: string;                        // UUID
  content: string;                   // Chunk text

  // Source provenance
  source: {
    type: string;                    // 'git-markdown', 'slack', etc.
    uri: string;                     // e.g., 'git://org/repo/docs/guide.md#chunk-2'
    metadata: Record<string, any>;   // Source-specific metadata
  };

  // Change tracking
  checksum: string;                  // Hash of content
  sourceLastModified: string;        // From source
  fetchedAt: string;                 // When we pulled it
  processedAt?: string;              // When chunked/embedded

  // Chunking info
  chunkIndex: number;
  totalChunks: number;

  // State
  status: 'pending' | 'processed' | 'stale';

  // Links to extracted items (populated by PRD #357)
  extractedPolicyIds?: string[];

  // Vectors (stored in Qdrant)
  // Dense embedding from embedding service
  // Sparse BM25 from FastEmbed
}
```

### Search Result Schema

```typescript
interface KnowledgeSearchResult {
  chunks: Array<{
    id: string;
    content: string;
    score: number;
    matchType: 'semantic' | 'keyword' | 'hybrid';
    sourceId: string;
    uri: string;
    metadata: Record<string, any>;
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
- [ ] Create `src/tools/manage-knowledge.ts` with Zod schema for `ingest` operation only
- [ ] Register tool with MCP server
- [ ] Chunking implementation (semantic-aware splitting)
- [ ] KnowledgeVectorService extending BaseVectorService pattern
- [ ] Qdrant collection "knowledge-base" created
- [ ] Dense embeddings via existing embedding service
- [ ] Sparse BM25 vectors via FastEmbed (if feasible)
- [ ] Chunk metadata stored correctly (sourceId, uri, etc.)
- [ ] Integration tests for ingestion pipeline
- [ ] HTTP endpoint auto-available at `POST /api/v1/tools/manageKnowledge`

**Validation**:
- Tool appears in `/api/v1/tools` discovery endpoint
- Documents can be ingested via MCP tool or HTTP API
- Documents chunked with appropriate boundaries
- Chunks stored with embeddings and correct metadata

---

### Milestone 2: Ingest Mock Server Fixture
**Goal**: Create mock server fixture for ingest operation to enable parallel controller development

**Success Criteria**:
- [ ] Mock server fixture for `ingest` operation
- [ ] Fixture matches Zod response schema from Milestone 1
- [ ] Controller team can develop against mock server

**Validation**:
- `POST /api/v1/tools/manageKnowledge` with `operation: "ingest"` returns appropriate mock response
- Mock response matches real API contract

---

### Milestone 3: Search Operation
**Goal**: Add semantic + keyword search operation

**Success Criteria**:
- [ ] Add `search` operation to Zod schema
- [ ] Hybrid search combining dense and sparse vectors
- [ ] RRF (Reciprocal Rank Fusion) for result merging
- [ ] Source filtering by sourceId
- [ ] Result includes provenance (sourceId, uri, metadata)
- [ ] Configurable result limit
- [ ] Integration tests for search
- [ ] Mock server fixture for search operation

**Validation**:
- Semantic queries return relevant chunks
- Exact keyword matches boosted appropriately
- Results include correct source information

---

### Milestone 4: DeleteBySource Operation
**Goal**: Add operation to delete all chunks for a source

**Success Criteria**:
- [ ] Add `deleteBySource` operation to Zod schema
- [ ] Delete all chunks matching sourceId from Qdrant
- [ ] Integration tests for deleteBySource
- [ ] Mock server fixture for deleteBySource operation

**Validation**:
- All chunks for a sourceId can be deleted
- Deletion is atomic and complete

---

### Milestone 5: GetChunk Operation
**Goal**: Add operation to retrieve a specific chunk by ID

**Success Criteria**:
- [ ] Add `getChunk` operation to Zod schema
- [ ] Retrieve chunk by ID from Qdrant
- [ ] Return full chunk content and metadata
- [ ] Integration tests for getChunk
- [ ] Mock server fixture for getChunk operation

**Validation**:
- Individual chunks can be retrieved by ID
- Returns full content and metadata

---

### Milestone 6: Controller PRD Creation
**Goal**: Create PRD for controller-side knowledge base orchestration

**Success Criteria**:
- [ ] Use `/request-dot-ai-feature` to send API contract to controller
- [ ] Controller PRD created with: KnowledgeSource CRD, Git adapter, CronJob scheduling
- [ ] Clear interface contract between controller and MCP server

**Validation**:
- Controller team has clear PRD to implement
- API contract is well-defined and tested via mock server

---

---

## Success Criteria

### Functional Success
- [ ] Documents can be ingested via MCP tool / HTTP API (same endpoint)
- [ ] Documents chunked and stored with embeddings
- [ ] Semantic search returns relevant results
- [ ] Chunks can be deleted by sourceId
- [ ] Chunks can be retrieved by ID

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

1. **Chunk Size**: What's the optimal chunk size for documents? (Proposal: 512-1024 tokens)

2. **Embedding Model**: Should knowledge base use same embedding model as policies? (Proposal: Yes, for consistency)

3. **Chunking Library**: Which library to use for chunking in Node.js? (Options: Chonkie, LangChain splitters, custom)

4. **BM25 in Node.js**: Is FastEmbed available for Node.js or do we need an alternative for sparse vectors?

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
**Status**: Blocked

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
