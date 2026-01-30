# PRD #356: Knowledge Base System

**Status**: Planning
**Created**: 2025-01-30
**GitHub Issue**: [#356](https://github.com/vfarcic/dot-ai/issues/356)
**Priority**: High
**Related**: PRD #357 (Policy Extraction - depends on this)

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

Create a modular knowledge base system with:

1. **Pluggable Source Adapters**: Start with Git markdown, designed for future Slack/Confluence support
2. **Intelligent Chunking**: Use Chonkie for semantic-aware text splitting
3. **Vector Storage**: Store chunks in Qdrant with hybrid search (dense + BM25)
4. **Sync Tracking**: Monitor source changes for incremental updates
5. **MCP Tool**: `manageKnowledge` for source management and semantic search

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SOURCE ADAPTERS                            │
│  (pluggable - add new sources without changing core)            │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  GitMarkdown    │  Slack          │  Confluence                 │
│  Adapter        │  Adapter        │  Adapter                    │
│  (Phase 1)      │  (Future)       │  (Future)                   │
└────────┬────────┴────────┬────────┴────────┬────────────────────┘
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                 NORMALIZED DOCUMENT FORMAT                      │
│  { content, source: { type, uri, metadata }, checksum }         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CORE PIPELINE                              │
├─────────────────────────────────────────────────────────────────┤
│  Chonkie ──────► Semantic chunking (100+ GB/s, 56 languages)    │
│  FastEmbed ────► BM25 sparse vectors                            │
│  Embedding ────► Dense vectors (existing service)               │
│  Qdrant ───────► Storage + hybrid search                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  MCP TOOL: manageKnowledge                                      │
│  • addSource, removeSource, listSources                         │
│  • sync (incremental), resync (full)                            │
│  • search (semantic + keyword hybrid)                           │
│  • listStale, getChunk                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Stories

### Primary User Stories

1. **As a platform engineer**, I want to add a Git repository as a knowledge source so the AI can search our documentation
   - **Acceptance**: Can configure repo URL, branch, and path filters via MCP tool

2. **As a user**, I want to search our knowledge base with natural language so I can find relevant information
   - **Acceptance**: Semantic search returns relevant chunks ranked by relevance

3. **As a platform engineer**, I want the knowledge base to stay in sync with source documents so information is always current
   - **Acceptance**: Incremental sync detects new, changed, and deleted documents

4. **As a developer**, I want to add new source types (Slack, Confluence) without changing the core system
   - **Acceptance**: Source adapter interface is well-defined and documented

### Secondary User Stories

5. **As a user**, I want to see where search results came from so I can verify the information
   - **Acceptance**: Results include source file, path, and link to original

6. **As a platform engineer**, I want to monitor sync status so I know if sources are healthy
   - **Acceptance**: Can list sources with last sync time and status

---

## Technical Approach

### Source Adapter Interface

```typescript
interface SourceAdapter {
  readonly type: string;  // 'git-markdown', 'slack', 'confluence'

  // Fetch documents from source
  fetchDocuments(config: SourceConfig): AsyncIterable<SourceDocument>;

  // Check for updates since last sync (for incremental)
  getChangesSince?(lastSync: string, config: SourceConfig): AsyncIterable<SourceChange>;

  // Validate configuration
  validateConfig(config: SourceConfig): ValidationResult;
}

interface SourceDocument {
  content: string;
  source: {
    type: string;                    // 'git-markdown' | 'slack' | ...
    uri: string;                     // Unique identifier
    metadata: Record<string, any>;   // Source-specific metadata
  };
  checksum: string;                  // For change detection
  fetchedAt: string;
}

interface SourceChange {
  type: 'added' | 'modified' | 'deleted';
  document?: SourceDocument;         // For added/modified
  uri: string;                       // For all types
}
```

### Git Markdown Adapter Configuration

```typescript
interface GitMarkdownConfig {
  type: 'git-markdown';
  repoUrl: string;                   // https://github.com/org/repo
  branch?: string;                   // default: main
  paths?: string[];                  // e.g., ['docs/**/*.md', 'policies/*.md']
  excludePaths?: string[];           // e.g., ['**/node_modules/**']
  auth?: {
    type: 'token' | 'ssh' | 'none';
    token?: string;                  // For private repos
  };
}

interface GitSourceMetadata {
  repo: string;
  branch: string;
  filePath: string;
  commitSha: string;
  lastModified: string;
  frontMatter?: Record<string, any>;  // Parsed YAML front matter
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

### Knowledge Source Schema

```typescript
interface KnowledgeSource {
  id: string;                        // UUID
  type: 'git-markdown' | 'slack' | 'confluence';
  name: string;                      // Human-readable name
  config: SourceConfig;              // Type-specific config

  // Sync tracking
  lastSyncAt?: string;               // When we last synced
  lastSyncCommit?: string;           // For git: commit SHA
  lastSyncCursor?: string;           // For paginated sources

  // Stats
  chunkCount: number;                // Total chunks from this source
  documentCount: number;             // Total documents

  // Status
  status: 'active' | 'paused' | 'error' | 'syncing';
  errorMessage?: string;

  createdAt: string;
  createdBy: string;
}
```

### MCP Tool: manageKnowledge

```typescript
// Operations
type KnowledgeOperation =
  | 'addSource'      // Add a new knowledge source
  | 'removeSource'   // Remove source and its chunks
  | 'listSources'    // List all configured sources
  | 'getSource'      // Get source details
  | 'sync'           // Incremental sync from source
  | 'resync'         // Full re-sync (re-fetch all)
  | 'search'         // Semantic search across knowledge base
  | 'getChunk'       // Get specific chunk by ID
  | 'listStale';     // List chunks needing reprocessing

// Parameters
interface ManageKnowledgeParams {
  operation: KnowledgeOperation;

  // For addSource
  config?: SourceConfig;
  name?: string;

  // For source operations
  sourceId?: string;

  // For search
  query?: string;
  limit?: number;              // Default: 10
  sourceType?: string;         // Filter by source type

  // For getChunk
  chunkId?: string;
}

// Search result
interface KnowledgeSearchResult {
  chunks: Array<{
    id: string;
    content: string;
    score: number;
    matchType: 'semantic' | 'keyword' | 'hybrid';
    source: {
      type: string;
      uri: string;
      metadata: Record<string, any>;
    };
    extractedPolicies?: Array<{
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
| **Git Operations** | simple-git | Lightweight, well-maintained |

---

## Milestones

### Milestone 1: Source Adapter Foundation
**Goal**: Define adapter interface and implement Git Markdown adapter

**Success Criteria**:
- [ ] SourceAdapter interface defined and documented
- [ ] GitMarkdownAdapter fetches markdown files from public repos
- [ ] Support for branch selection and path filtering
- [ ] Private repo authentication (token-based)
- [ ] Front matter parsing for metadata extraction
- [ ] Integration tests for Git adapter

**Validation**:
- Can fetch markdown files from a public GitHub repo
- Path globs correctly filter files
- Private repos work with token auth

---

### Milestone 2: Chunking and Storage Pipeline
**Goal**: Chunk documents and store in Qdrant with embeddings

**Success Criteria**:
- [ ] Chonkie integration for semantic chunking
- [ ] KnowledgeVectorService extending BaseVectorService pattern
- [ ] Qdrant collection "knowledge-base" created
- [ ] Dense embeddings via existing embedding service
- [ ] Sparse BM25 vectors via FastEmbed
- [ ] Chunk metadata stored correctly
- [ ] Integration tests for storage pipeline

**Validation**:
- Documents chunked with semantic boundaries
- Chunks stored with both dense and sparse vectors
- Can retrieve chunks by ID

---

### Milestone 3: Source Registry and Sync Tracking
**Goal**: Track sources and their sync state

**Success Criteria**:
- [ ] KnowledgeSource schema implemented
- [ ] Source CRUD operations (add, remove, list, get)
- [ ] Sync state tracking (lastSyncAt, lastSyncCommit)
- [ ] Checksum-based change detection
- [ ] Incremental sync (only changed documents)
- [ ] Stale chunk detection when source changes
- [ ] Integration tests for sync tracking

**Validation**:
- Can add/remove/list sources
- Incremental sync only processes changed files
- Stale chunks marked when source documents change

---

### Milestone 4: Hybrid Search Implementation
**Goal**: Semantic + keyword search working

**Success Criteria**:
- [ ] Hybrid search combining dense and sparse vectors
- [ ] RRF (Reciprocal Rank Fusion) for result merging
- [ ] Source type filtering
- [ ] Result includes provenance (source URI, metadata)
- [ ] Configurable result limit
- [ ] Integration tests for search

**Validation**:
- Semantic queries return relevant chunks
- Exact keyword matches boosted appropriately
- Results include correct source information

---

### Milestone 5: MCP Tool Integration
**Goal**: manageKnowledge MCP tool fully operational

**Success Criteria**:
- [ ] MCP tool registered and documented
- [ ] All operations implemented (addSource, sync, search, etc.)
- [ ] Error handling with helpful messages
- [ ] Input validation for all parameters
- [ ] Integration tests for MCP tool
- [ ] Documentation for tool usage

**Validation**:
- Can manage sources via MCP tool
- Search returns relevant results
- Error messages guide users to resolution

---

### Milestone 6: Documentation and Production Readiness
**Goal**: System documented and ready for use

**Success Criteria**:
- [ ] User documentation for manageKnowledge tool
- [ ] Source adapter development guide
- [ ] Architecture documentation
- [ ] Troubleshooting guide
- [ ] All integration tests passing
- [ ] Performance benchmarks acceptable

**Validation**:
- New users can configure sources following docs
- Developers can understand adapter interface
- System handles reasonable document volumes

---

## Success Criteria

### Functional Success
- [ ] Can add Git repos as knowledge sources
- [ ] Documents chunked and stored with embeddings
- [ ] Semantic search returns relevant results
- [ ] Incremental sync works correctly
- [ ] Source adapter interface enables future extensions

### Quality Success
- [ ] Search latency < 500ms for typical queries
- [ ] Sync handles repos with 1000+ markdown files
- [ ] Integration test coverage > 80%
- [ ] Clear error messages for common issues

### Architecture Success
- [ ] Adapter pattern allows adding Slack/Confluence without core changes
- [ ] Reuses existing embedding and vector DB infrastructure
- [ ] Clean separation between adapters and core pipeline

---

## Risks and Mitigations

### Risk 1: Large Repository Performance
**Risk**: Syncing large repos with thousands of files is slow

**Mitigation**:
- Incremental sync only processes changes
- Path filtering reduces scope
- Background sync with progress tracking
- Consider shallow clone for initial sync

**Severity**: Medium
**Likelihood**: Medium

---

### Risk 2: Chunking Quality
**Risk**: Semantic chunking doesn't preserve meaning well

**Mitigation**:
- Chonkie has multiple strategies (semantic, recursive)
- Tune chunk size for best results
- Allow per-source chunking configuration
- Test with real documentation

**Severity**: Medium
**Likelihood**: Low

---

### Risk 3: Embedding Cost
**Risk**: Large knowledge bases consume significant embedding API calls

**Mitigation**:
- Only re-embed changed chunks
- Cache embeddings with checksums
- Consider local embedding models for large volumes
- Document cost implications

**Severity**: Low
**Likelihood**: Medium

---

## Dependencies

### External Dependencies
- **Chonkie**: Chunking library (MIT license)
- **FastEmbed**: BM25 sparse vectors (Apache 2.0)
- **simple-git**: Git operations (MIT license)

### Internal Dependencies
- **Qdrant**: Vector storage (already in use)
- **Embedding Service**: Dense embeddings (already implemented)
- **BaseVectorService**: Pattern for vector services

### Blocked By
- None

### Blocks
- PRD #357 (Policy Extraction) - requires knowledge base to extract from

---

## Open Questions

1. **Chunk Size**: What's the optimal chunk size for markdown docs? (Proposal: 512-1024 tokens)

2. **Embedding Model**: Should knowledge base use same embedding model as policies? (Proposal: Yes, for consistency)

3. **Source Limits**: Should we limit number of sources or total chunks? (Proposal: Soft limits with warnings)

4. **Authentication Storage**: How to securely store Git tokens? (Proposal: Require environment variables, don't store in DB)

5. **Concurrent Sync**: Allow multiple sources to sync simultaneously? (Proposal: Yes, with configurable parallelism)

---

## Future Enhancements (Out of Scope)

### Phase 2: Additional Source Adapters
- Slack adapter for channel/thread ingestion
- Confluence adapter for wiki pages
- Notion adapter
- Google Docs adapter

### Phase 3: Advanced Features
- Scheduled automatic sync
- Webhook-triggered sync on push
- Knowledge base analytics (most searched, gaps)
- Multi-tenant knowledge isolation

### Phase 4: AI Enhancements
- Automatic summarization of chunks
- Question-answer pair generation
- Knowledge graph extraction
- Cross-reference detection

---

## References

- **Chonkie**: https://github.com/chonkie-inc/chonkie
- **FastEmbed**: https://github.com/qdrant/fastembed
- **Qdrant Hybrid Search**: https://qdrant.tech/articles/hybrid-search/
- **Existing Vector Services**: `src/core/base-vector-service.ts`, `src/core/policy-vector-service.ts`
- **Existing Embedding Service**: `src/core/embedding-service.ts`

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
