# PRD #375: Unified Knowledge Base

**Status**: Planning
**Created**: 2026-02-16
**GitHub Issue**: [#375](https://github.com/vfarcic/dot-ai/issues/375)
**Priority**: High
**Owner**: TBD
**Last Updated**: 2026-02-16
**Supersedes**: PRD #357 (Policy Extraction from Knowledge Base)

---

## Problem Statement

### Current Architecture

Policies, patterns, and knowledge base content are stored in **three separate Qdrant collections** with different schemas, tools, and workflows:

| Collection | Tool | Service | Types |
|------------|------|---------|-------|
| `knowledge-base` | `manageKnowledge` | Direct (no service class) | `KnowledgeChunk` |
| `patterns` | `manageOrgData` | `PatternVectorService` | `OrganizationalPattern` |
| `policies` | `manageOrgData` | `PolicyVectorService` | `PolicyIntent` |

### Challenges

- **Manual policy/pattern creation**: Each policy or pattern must be created step-by-step via `manageOrgData`, even when the content already exists in documentation
- **No automatic discovery**: Ingesting a document into the knowledge base does not surface policies or patterns it contains
- **Duplicated infrastructure**: Three separate vector services, operations handlers, and type systems for what is fundamentally organizational knowledge with different classifications
- **Fragmented search**: Consumers (recommend, operate, remediate) must search multiple collections independently and merge results
- **Schema overhead**: Structured fields like `triggers`, `suggestedResources`, and `rationale` add complexity but are not used for search — search is purely embedding-based

### User Impact

- **Platform teams** spend time manually creating policies/patterns from existing documentation
- **AI system** misses policies/patterns buried in ingested documents
- **Developers** must understand multiple tools and schemas for related operations

---

## Solution Overview

Consolidate into a **single `knowledge-base` collection** with a `tags` metadata field on each chunk. Add **AI classification during ingestion** to automatically identify policy/pattern content and tag chunks accordingly. Retire separate collections and the pattern/policy parts of `manageOrgData`.

### Key Design Decisions

1. **Inline AI classification during ingestion** — not a separate step
2. **AI classifies the full document** (before chunking) for better context, returns a set of tags
3. **No rewriting** — original document content is preserved as-is; AI only provides classification tags
4. **Document-level tags applied to all chunks** — all chunks from a document receive the same tags, avoiding complexity of per-chunk classification
5. **Multiple tags per chunk** — a document can be both a policy and a pattern (e.g., `["policy", "pattern"]`); absence of tags (`[]`) means general content
6. **No candidate staging** — chunks are created directly; users manage them post-creation via existing `manageKnowledge` operations (search, deleteByUri)
7. **No new user-facing operations** — existing `manageKnowledge` operations (ingest, search, deleteByUri) are sufficient
8. **Tags included in search results** — consumers and the AI reasoning layer can see tags to interpret what type of content each result represents
9. **Auto-migration at server init** — existing policies and patterns are transparently migrated to the knowledge base on first startup

### Architecture After

```
Document Ingestion (manageKnowledge ingest)
    │
    ├─ Step 1: AI Classification (full document)
    │   └─ Returns tags: e.g., ["policy", "pattern"] or ["policy"] or []
    │
    ├─ Step 2: Chunk document (unchanged)
    │
    ├─ Step 3: Embed all chunks (unchanged)
    │
    └─ Step 4: Store in knowledge-base collection
        └─ All chunks get the same tags from Step 1

Search (recommend, operate, remediate)
    │
    └─ Semantic search across knowledge-base collection
       Results include tags — AI interprets what's a policy, pattern, or general content

Management (manageKnowledge — unchanged interface)
    │
    ├─ ingest (enhanced with AI classification)
    ├─ search (unchanged — tags included in result payload)
    └─ deleteByUri (unchanged)
```

---

## Scope of Changes

### What Changes

| Component | Current | After |
|-----------|---------|-------|
| **Collections** | 3 (`knowledge-base`, `patterns`, `policies`) | 1 (`knowledge-base` with `tags` metadata) |
| **Ingestion** | Mechanical chunking only | AI classification + chunking |
| **Search results** | No type info | `tags` field included in results |
| **`manageOrgData`** | Patterns + Policies + Capabilities | Capabilities only |
| **Consumers** | Search 3 collections separately | Search 1 collection semantically |
| **Type system** | `OrganizationalPattern`, `PolicyIntent`, `KnowledgeChunk` | `KnowledgeChunk` with `tags` field |

### What Gets Retired

- `PatternVectorService` (`src/core/pattern-vector-service.ts`)
- `PolicyVectorService` (`src/core/policy-vector-service.ts`)
- `pattern-operations.ts` (`src/core/pattern-operations.ts`)
- `policy-operations.ts` (`src/core/policy-operations.ts`)
- Pattern/policy operations in `organizational-data.ts`
- `OrganizationalPattern` and `PolicyIntent` type interfaces
- `BaseOrganizationalEntity` base type
- Separate `patterns` and `policies` Qdrant collections

### What Stays Unchanged

- **Capabilities** remain in `manageOrgData` with their own collection — they represent cluster state (what's available), not organizational knowledge
- **`manageKnowledge` user-facing operations** — ingest, search, deleteByUri remain the same interface
- **Knowledge base chunking** mechanism (LangChain `RecursiveCharacterTextSplitter`)
- **Embedding service** (OpenAI/Google/Bedrock)
- **Qdrant infrastructure** (same database, fewer collections)

---

## Ingestion Pipeline Design

### AI Classification

During ingestion, before chunking, the full document is sent to the AI. The AI returns a list of tags that apply to the document as a whole. These tags are then applied to every chunk produced from that document.

- Document about deployment requirements → `["policy"]`
- Document describing reusable architectures → `["pattern"]`
- Document that is both prescriptive and templated → `["policy", "pattern"]`
- General documentation, tutorials, guides → `[]`

### Prompt Template

Store in `prompts/knowledge-classification.md`:

```markdown
Classify this document by determining whether it contains policy content,
pattern content, both, or neither.

A **policy** is a rule, requirement, constraint, or guideline that should be enforced
during infrastructure/application deployments. Examples:
- "All databases must use PostgreSQL"
- "Container images must come from approved registries"
- "Services must have health checks defined"

A **pattern** is a reusable deployment template or architectural approach. Examples:
- "Public web applications use Deployment + Service + Ingress"
- "Stateful workloads use StatefulSet + PVC + headless Service"
- "Event-driven services use Knative Serving with autoscaling"

Return ONLY a JSON array of applicable tags. Possible values: "policy", "pattern".
- If the document contains policy content, include "policy"
- If the document contains pattern content, include "pattern"
- If it contains both, include both: ["policy", "pattern"]
- If it contains neither, return an empty array: []

Document:
{documentContent}
```

### Chunk Tags Metadata

Extend the existing chunk payload stored in Qdrant:

```typescript
interface KnowledgeChunkPayload {
  // ... existing fields (content, uri, metadata, checksum, ingestedAt, chunkIndex, totalChunks)
  tags: string[];  // NEW — e.g., ["policy", "pattern"] or []
}
```

### Search Result Tags

Tags are included in search results returned to consumers:

```typescript
interface KnowledgeSearchResultItem {
  // ... existing fields (content, uri, score, etc.)
  tags: string[];  // Included so AI reasoning layer can interpret result type
}
```

---

## Consumer Updates

### Current (search 3 collections)

```typescript
// operate.ts embedContext()
const patternResults = await patternService.searchPatterns(intent, { limit: 5 });
const policyResults = await policyService.searchPolicyIntents(intent, { limit: 5 });
const knowledgeResults = await searchKnowledgeBase({ query: intent });
```

### After (search 1 collection)

```typescript
// operate.ts embedContext()
const knowledgeResults = await searchKnowledgeBase({ query: intent, limit: 20 });
// Results include tags — AI sees which results are policies, patterns, or general
```

The AI reasoning layer already interprets search results semantically. With tags in the result payload, it can distinguish policies from patterns from general knowledge without needing separate queries.

---

## Migration

### Auto-Migration at Server Init

On startup, check if legacy `policies` or `patterns` collections exist in Qdrant. If found:

1. Read all entries from `policies` collection
2. For each policy, store as a chunk in `knowledge-base` with `tags: ["policy"]`
   - Content: combine description, triggers, rationale into readable text
   - Preserve original metadata
   - Generate new embedding
3. Repeat for `patterns` collection with `tags: ["pattern"]`
4. Verify migrated counts match source counts
5. Delete legacy `policies` and `patterns` collections
6. Log: "Migrated X policies and Y patterns to unified knowledge base"

### Migration Properties

- **Idempotent**: If legacy collections don't exist, skip (no-op on every subsequent startup)
- **One-time cost**: Slightly slower first startup, then instant skip
- **Transparent**: No user action required
- **Safe**: Verify counts before deleting old collections

### Future: Retire Migration

Create a separate PRD (~6 months after release) to remove the migration code once all users have upgraded.

---

## Milestones

### Milestone 1: Add Tags to Knowledge Base
**Goal**: Knowledge base chunks support classification tags

- [ ] Add `tags` field to knowledge base chunk payload (default: `[]` for backwards compatibility)
- [ ] Include `tags` in search result payload
- [ ] Existing ingestion stores chunks with `tags: []`
- [ ] Integration tests for tagged chunk storage and retrieval

**Success Criteria**: Chunks stored with tags metadata; tags visible in search results; existing functionality unaffected

---

### Milestone 2: AI Classification During Ingestion
**Goal**: Automatically classify documents and tag chunks during ingestion

- [ ] Create classification prompt template (`prompts/knowledge-classification.md`)
- [ ] Add AI classification step to ingestion pipeline (full document, before chunking)
- [ ] Apply document-level tags to all chunks from that document
- [ ] Handle edge cases (empty document, AI returns unexpected format)
- [ ] Integration tests for classification and tagged ingestion

**Success Criteria**: Ingesting a document containing policies produces chunks with `tags: ["policy"]`; general documents produce chunks with `tags: []`

---

### Milestone 3: Update Consumers
**Goal**: Recommend, operate, and remediate tools search unified knowledge base

- [ ] Update `operate.ts` `embedContext()` to search single collection
- [ ] Update `recommend.ts` to search single collection
- [ ] Update `remediate.ts` to search single collection
- [ ] Remove pattern/policy search code from consumers
- [ ] Integration tests for consumer search behavior

**Success Criteria**: All consumer tools work correctly with unified knowledge base search and can see tags in results

---

### Milestone 4: Retire Pattern/Policy Infrastructure
**Goal**: Remove separate collections, services, and operations

- [ ] Remove `PatternVectorService` and `PolicyVectorService`
- [ ] Remove `pattern-operations.ts` and `policy-operations.ts`
- [ ] Remove pattern/policy operations from `manageOrgData` (keep capabilities only)
- [ ] Remove `OrganizationalPattern`, `PolicyIntent`, `BaseOrganizationalEntity` types
- [ ] Update `manageOrgData` tool description and schema to capabilities-only
- [ ] Clean up imports and references across codebase
- [ ] Integration tests confirming old code paths are removed

**Success Criteria**: No code references separate pattern/policy collections; `manageOrgData` is capabilities-only

---

### Milestone 5: Auto-Migration
**Goal**: Transparently migrate existing users' data on server startup

- [ ] Implement migration check at server init (detect legacy collections)
- [ ] Migrate policies: read from legacy collection, store as tagged chunks, verify, delete collection
- [ ] Migrate patterns: same flow
- [ ] Make migration idempotent (skip if legacy collections don't exist)
- [ ] Log migration activity
- [ ] Integration tests for migration flow

**Success Criteria**: Existing users' policies and patterns are available in the unified knowledge base after first startup

---

### Milestone 6: End-to-End Validation
**Goal**: Full system validation

- [ ] Full workflow test: ingest document with mixed content → verify tags applied → search returns results with tags → consumers use results correctly
- [ ] Migration test: create legacy data → restart → verify migration → verify search works
- [ ] Edge cases: empty documents, policy-only documents, pattern-only documents, mixed, general-only
- [ ] Performance validation: ingestion time acceptable with AI classification step

**Success Criteria**: All integration tests pass, no regressions in existing functionality

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| AI classification quality — misclassifies content | Medium | Medium | Tune prompt with real documents; users can re-ingest or delete via deleteByUri |
| Ingestion slowdown from AI call | Low | High | Expected and acceptable — ingestion is not latency-sensitive |
| Migration data loss | High | Low | Verify counts before deleting old collections; log all migration activity |
| Search quality change from mixed collection | Medium | Low | Semantic search naturally returns relevant results; tags help AI interpret context |
| Breaking existing manageOrgData users | High | Medium | Clear migration path; capabilities operations unchanged |

---

## Dependencies

### Internal

- Existing `manageKnowledge` tool and ingestion pipeline
- Existing embedding service (OpenAI/Google/Bedrock)
- AI provider (Anthropic/OpenAI) for classification during ingestion
- Qdrant vector database

### External

- None — all infrastructure already in place

---

## Related PRDs

- **#357** (Policy Extraction from Knowledge Base) — **superseded and closed** by this PRD
- **#218** (Pattern & Policy Learning System) — needs revision; its design assumes structured objects in separate collections
- **Future PRD**: Retire migration mechanism (~6 months after release)

---

## Open Questions

1. **Classification model**: Which AI model to use for classification? Fast/cheap model (e.g., Haiku) or same as the configured provider?
2. **Capabilities consolidation**: Should capabilities eventually move into the knowledge base too, or stay separate?
3. **Kyverno cleanup**: Current policy deletion triggers Kyverno policy cleanup via kubectl. How should this work after consolidation — drop the feature, or handle differently?

---

## Work Log

### 2026-02-16: PRD Creation
**Status**: Planning

**Completed Work**:
- Created PRD based on architectural discussion
- Closed superseded PRD #357
- Defined unified collection approach with tags metadata
- Designed inline AI classification during ingestion
- Planned auto-migration for existing users

**Key Decisions**:
- Single collection with tags vs separate collections
- Inline classification during ingestion vs separate extraction step
- AI classifies full document, tags applied to all chunks vs per-chunk classification
- No rewriting — original content preserved, only tags added
- Multiple tags per chunk (array) vs single type
- Absence of tags (`[]`) means general content vs explicit "general" tag
- No candidate staging — direct creation with post-creation management
- No new user-facing operations — existing manageKnowledge operations are sufficient
- Tags included in search results for AI reasoning layer
- Search is purely semantic — no type filter exposed
- Auto-migration at server init vs manual migration tool

**Next Steps**:
- Begin Milestone 1: Add tags to knowledge base
