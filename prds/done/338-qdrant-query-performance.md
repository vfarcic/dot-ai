# PRD #338: Qdrant Query Performance Optimizations

## Status: COMPLETED

## Problem Statement

Users experienced intermittent slowness in the Web UI when performing searches. Investigation revealed that the `searchByKeywords` function was fetching up to 1000 documents from Qdrant and filtering them client-side in JavaScript, which is inefficient and doesn't scale well as collections grow.

### Root Causes Identified

1. **Client-side filtering**: Keyword search fetched 1000 documents and filtered in JavaScript instead of using Qdrant's native filtering capabilities
2. **Low connection pool**: No HTTP connection pooling configured, leading to connection recreation overhead
3. **Conservative concurrency limit**: Semaphore limited to 20 concurrent operations, which is unnecessarily restrictive for Qdrant

## Solution Overview

Implement native Qdrant text indexing with server-side filtering, configure connection pooling, and increase concurrent operation limits for better throughput.

### Key Changes

1. **Native Qdrant text filtering**: Use Qdrant's text index feature for server-side keyword matching
2. **Transparent upgrade path**: Automatically add text index to existing collections without data loss
3. **Connection pooling**: Configure `maxConnections: 100` for HTTP keep-alive connection reuse
4. **Increased concurrency**: Raise semaphore limit from 20 to 100 concurrent operations

## Success Criteria

- [x] All 131 integration tests pass
- [x] Keyword searches use server-side Qdrant filtering instead of client-side JavaScript
- [x] Text index is created automatically for new collections
- [x] Existing collections get text index added transparently on upgrade
- [x] No breaking changes to existing functionality

## Technical Design

### Text Index Creation

Added `ensureTextIndex()` method that:
1. Checks if text index already exists on `searchText` field
2. Creates text index if missing using `createPayloadIndex()`
3. Is idempotent - safe to call multiple times
4. Fails gracefully with logging if index creation fails

### Collection Initialization Flow

**New collections:**
- `createCollection()` → `ensureTextIndex()` (index created immediately)

**Existing collections (transparent upgrade):**
- `initializeCollection()` → detects existing collection → `ensureTextIndex()` (index added if missing)

### searchByKeywords Optimization

**Before:**
```typescript
// Fetch 1000 documents, filter in JavaScript
const scrollResult = await this.client.scroll(collectionName, {
  limit: 1000,
  with_payload: true,
  with_vector: false,
});
// ... JavaScript filtering and scoring
```

**After:**
```typescript
// Build Qdrant native filter
const filter = {
  should: [
    { key: 'searchText', match: { text: keyword } },
    { key: 'triggers', match: { any: [keyword, keyword.toLowerCase()] } }
  ]
};

// Qdrant does the filtering server-side
const scrollResult = await this.client.scroll(collectionName, {
  limit: limit * 10,  // Much smaller, only matching candidates
  with_payload: true,
  with_vector: false,
  filter
});
// Scoring still done client-side on much smaller result set
```

### Connection Configuration

```typescript
this.client = new QdrantClient({
  url: this.config.url!,
  apiKey: this.config.apiKey,
  maxConnections: 100,  // HTTP keep-alive pool for connection reuse
});
```

## Milestones

- [x] **Milestone 1**: Implement text index creation and transparent upgrade mechanism
- [x] **Milestone 2**: Rewrite `searchByKeywords` to use native Qdrant text filtering
- [x] **Milestone 3**: Configure connection pooling with `maxConnections: 100`
- [x] **Milestone 4**: Increase semaphore limit from 20 to 100 concurrent operations
- [x] **Milestone 5**: Verify all 131 integration tests pass

## Files Modified

| File | Changes |
|------|---------|
| `src/core/vector-db-service.ts` | Added `ensureTextIndex()`, updated `createCollection()`, `initializeCollection()`, `searchByKeywords()`, QdrantClient config |

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Text index might not exist on first query | Graceful fallback - scoring logic handles unmatched results |
| Index creation fails | Logged but doesn't block operations |
| Breaking existing collections | Transparent upgrade adds index without data loss |

## Testing

All 131 integration tests pass, including:
- Pattern search tests
- Policy search tests
- Capability search tests
- Resource search tests (`/api/v1/resources/search`)

## Progress Log

| Date | Update |
|------|--------|
| 2026-01-23 | PRD created retroactively after implementation completed |
| 2026-01-23 | All changes implemented and tested - 131/131 tests passing |
