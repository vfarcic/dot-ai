# PRD #328: Dashboard HTTP API Endpoints

## Overview

| Field | Value |
|-------|-------|
| **PRD ID** | 328 |
| **Feature Name** | Dashboard HTTP API Endpoints |
| **Status** | Complete |
| **Priority** | Medium |
| **Created** | 2026-01-08 |
| **GitHub Issue** | [#328](https://github.com/vfarcic/dot-ai/issues/328) |

## Problem Statement

Building a Kubernetes dashboard UI requires structured, filterable queries against the Qdrant resource inventory. The existing `query` MCP tool only accepts natural language (`intent` field) and returns AI-synthesized summaries, which isn't suitable for programmatic table rendering.

**Current limitations:**
- No way to list all unique resource kinds with counts
- No structured filtering by kind, namespace, apiGroup
- No pagination support (limit/offset)
- Response format is AI-generated text, not structured data

## Solution

Add three HTTP-only REST API endpoints that directly query Qdrant's `resources` collection and return structured JSON suitable for dashboard UIs:

1. **`GET /api/v1/resources/kinds`** - List all unique resource kinds with counts
2. **`GET /api/v1/resources`** - List resources with filtering and pagination
3. **`GET /api/v1/namespaces`** - List all namespaces

These endpoints provide structured query operations on the resource inventory, complementing the existing natural language `query` tool. Initially exposed via HTTP for dashboard use cases, but the underlying query functions are designed to be interface-agnostic and could be exposed via MCP in the future if needed.

## User Stories

1. **As a dashboard developer**, I want to list all resource kinds in the cluster so I can populate a sidebar navigation.

2. **As a dashboard developer**, I want to filter resources by kind and namespace so I can display them in a table.

3. **As a dashboard developer**, I want to paginate through resources so I can handle large clusters efficiently.

4. **As a dashboard developer**, I want to list all namespaces so I can provide a namespace filter dropdown.

## Technical Design

### Endpoint Specifications

#### 1. GET /api/v1/resources/kinds

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `namespace` | string | No | Filter kinds by namespace (omit for all namespaces) |

**Response:**
```json
{
  "success": true,
  "data": {
    "kinds": [
      { "kind": "Deployment", "apiGroup": "apps", "apiVersion": "apps/v1", "count": 15 },
      { "kind": "Pod", "apiGroup": "", "apiVersion": "v1", "count": 42 },
      { "kind": "SQLClaim", "apiGroup": "devopstoolkit.live", "apiVersion": "devopstoolkit.live/v1alpha1", "count": 3 }
    ]
  },
  "meta": {
    "timestamp": "2026-01-08T12:00:00Z",
    "requestId": "req_123"
  }
}
```

**Implementation:**
- Fetch all resources from Qdrant using `getAllData()`
- Group by `kind + apiGroup + apiVersion`
- Count each group
- Sort by count descending

#### 2. GET /api/v1/resources

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind` | string | Yes | Resource kind (e.g., "Deployment") |
| `apiGroup` | string | No | API group filter (e.g., "apps") |
| `namespace` | string | No | Namespace filter (omit for all namespaces) |
| `limit` | number | No | Max results (default: 100, max: 1000) |
| `offset` | number | No | Skip N results for pagination (default: 0) |

**Response:**
```json
{
  "success": true,
  "data": {
    "resources": [
      {
        "name": "nginx",
        "namespace": "default",
        "kind": "Deployment",
        "apiGroup": "apps",
        "apiVersion": "apps/v1",
        "labels": { "app": "nginx" },
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-08T00:00:00Z"
      }
    ],
    "total": 15,
    "limit": 100,
    "offset": 0
  },
  "meta": {
    "timestamp": "2026-01-08T12:00:00Z",
    "requestId": "req_123"
  }
}
```

**Implementation:**
- Build Qdrant filter from query parameters
- Use `queryWithFilter()` for filtered queries
- For pagination: fetch `limit + offset` items, slice, and count total separately
- Note: Qdrant doesn't have native offset, so we fetch all matching and slice in-memory

#### 3. GET /api/v1/namespaces

**Parameters:** None

**Response:**
```json
{
  "success": true,
  "data": {
    "namespaces": ["default", "kube-system", "production", "staging"]
  },
  "meta": {
    "timestamp": "2026-01-08T12:00:00Z",
    "requestId": "req_123"
  }
}
```

**Implementation:**
- Fetch all resources from Qdrant
- Extract unique `namespace` values
- Filter out `_cluster` (cluster-scoped marker)
- Sort alphabetically

### Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `src/core/resource-tools.ts` | Modified | Added `getResourceKinds()`, `listResources()`, `getNamespaces()` query functions |
| `src/interfaces/rest-api.ts` | Modified | Registered HTTP routes and handlers for all three endpoints |
| `tests/integration/tools/query.test.ts` | Modified | Added integration tests (following "organize by function" principle) |

### Data Available (from Qdrant resources collection)

These fields are available for filtering/display:
- `namespace`, `name`, `kind`, `apiVersion`, `apiGroup`
- `labels` (object), `annotations` (object)
- `createdAt`, `updatedAt` (ISO timestamps)

**Not available:** Status fields (pod phase, replica counts, conditions). The dashboard should fetch these directly from Kubernetes API if needed.

## Success Criteria

1. All three endpoints return correct structured JSON
2. Filtering by kind, apiGroup, namespace works correctly
3. Pagination (limit/offset) works correctly
4. Empty results return empty arrays (not errors)
5. Performance: < 500ms response time for clusters with 1000 resources
6. Integration tests pass

## Milestones

- [x] Query functions added to `src/core/resource-tools.ts`
- [x] HTTP routes registered in `src/interfaces/rest-api.ts`
- [x] Integration tests passing for all three endpoints
- [x] Edge cases handled (empty cluster, invalid parameters, large result sets)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large clusters cause slow aggregation | Medium | Add caching for kinds/namespaces lists |
| Pagination without native offset is inefficient | Low | Acceptable for MVP; can optimize later with scroll_id |
| Qdrant unavailable | High | Return proper error response with retry guidance |

## Out of Scope

- Authentication/authorization (follow existing patterns)
- Status fields from Kubernetes API (dashboard fetches directly)
- Caching (can be added later if needed)

## Design Decisions

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2026-01-08 | Organize by function, not consumer | Query functions should live alongside existing resource operations in `resource-tools.ts` rather than in a separate `dashboard-api.ts`. This avoids organizing code by who uses it (dashboard vs AI) and instead organizes by what it does (query operations). The interface (HTTP vs MCP) is a transport concern, not a code organization concern. | Changed file structure: no new `dashboard-api.ts`, instead extend `resource-tools.ts`. Query functions are interface-agnostic and could be exposed via MCP later. |

## Dependencies

- Qdrant `resources` collection must be populated via `dot-ai-controller`
- Existing `ResourceVectorService` for querying

## Progress Log

| Date | Update |
|------|--------|
| 2026-01-08 | PRD created |
| 2026-01-08 | Architecture decision: organize by function not consumer; use `resource-tools.ts` instead of separate `dashboard-api.ts` |
| 2026-01-08 | Implementation complete: all 3 endpoints implemented, 7 integration tests passing |
| 2026-01-08 | Added namespace filter to `/api/v1/resources/kinds` endpoint (feature request from UI team) |
| 2026-01-08 | PRD marked complete |
