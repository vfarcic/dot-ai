# PRD #317: Query Tool Visualization Endpoint for Web UI

## Overview

| Field | Value |
|-------|-------|
| **PRD ID** | 317 |
| **Feature Name** | Query Tool Visualization Endpoint |
| **Priority** | High |
| **Status** | Draft |
| **Created** | 2025-12-31 |
| **Last Updated** | 2025-12-31 |

## Problem Statement

The Web UI needs to display rich visualizations of Kubernetes resources that go beyond what text responses can convey. When users query their cluster through Claude Code/Cursor, they see text lists of resources. However, understanding cluster architecture, resource relationships, and dependencies is much easier with visual representations.

**Key insight**: The value isn't "same data but prettier" - it's showing what text *cannot* effectively convey:
- Resource relationships (Pod → ReplicaSet → Deployment)
- Traffic flow (Ingress → Service → Pods)
- Dependencies inferred from env vars (frontend depends on api-svc via `API_URL`)
- Application groupings based on naming patterns and labels

Non-AI tools can show explicit Kubernetes relationships (ownerReferences), but AI can infer *implicit* relationships that aren't defined in the object model.

## Solution

A visualization endpoint that:
1. Stores query tool responses in sessions
2. When user opens visualization URL, uses AI to analyze resources and generate visualizations
3. Returns structured data (Mermaid, cards, code, tables) for Web UI to render
4. Supports multiple visualization types for different data

## Architecture

### Workflow

```
1. User in Claude Code: "show me resources in production namespace"
2. Claude Code calls: POST /api/v1/tools/query
3. Query tool:
   - Executes query, gets resources
   - Stores response in session (new behavior)
   - Returns text response + visualizationUrl (if WEB_UI_BASE_URL is set)
4. User opens visualizationUrl in browser
5. Web UI extracts sessionId, calls: GET /api/v1/visualize/{sessionId}
6. Visualization endpoint:
   - Loads session data (the resources)
   - Loads visualization prompt template
   - Calls AI to generate visualizations
   - Returns structured visualization data
7. Web UI renders visualizations (tabs for multiple views)
```

### Architecture Decision

| Client | Purpose | Endpoints |
|--------|---------|-----------|
| Claude Code / Cursor | Chat + text interaction | /api/v1/tools/* (existing) |
| Web UI | Visualization only | /api/v1/visualize/* (new) |

**Key principle**: MCP tool responses include a `visualizationUrl` that users can open to see rich visualizations. This keeps Web UI as a companion to existing MCP clients, not a replacement.

## API Design

### Tool Response Addition

When `WEB_UI_BASE_URL` environment variable is set, tool responses include:

```json
{
  "message": "Found 15 resources in production namespace...",
  "visualizationUrl": "https://dot-ai-ui.example.com/v/{sessionId}"
}
```

If `WEB_UI_BASE_URL` is not set, responses remain unchanged (feature toggle).

### Visualization Endpoint

`GET /api/v1/visualize/{sessionId}`

**Response:**

```json
{
  "title": "Resources in production namespace",
  "visualizations": [
    {
      "id": "topology",
      "label": "Topology",
      "type": "mermaid",
      "content": "graph TD\n  A[Frontend Deploy] --> B[frontend-svc]\n  B --> C[API Deploy]..."
    },
    {
      "id": "resources",
      "label": "Resources",
      "type": "table",
      "content": {
        "headers": ["Kind", "Name", "Namespace", "Status"],
        "rows": [
          ["Deployment", "frontend", "production", "Ready"],
          ["Service", "frontend-svc", "production", "Active"]
        ]
      }
    },
    {
      "id": "health",
      "label": "Health",
      "type": "cards",
      "content": [
        { "id": "frontend", "title": "frontend", "description": "3/3 replicas ready", "tags": ["healthy"] },
        { "id": "api", "title": "api", "description": "2/3 replicas ready", "tags": ["degraded"] }
      ]
    }
  ],
  "insights": [
    "Frontend depends on api-svc (inferred from API_URL env var)",
    "API deployment has 1 unavailable replica",
    "All services using ClusterIP - external access via Ingress only"
  ]
}
```

### Visualization Types

| Type | Use Case | Content Structure |
|------|----------|-------------------|
| `mermaid` | Topology, relationships, flowcharts | String (Mermaid syntax) |
| `cards` | Options, items, resources | Array of `{ id, title, description?, tags? }` |
| `code` | YAML manifests, bash commands | `{ language: string, code: string }` |
| `table` | Lists, comparisons | `{ headers: string[], rows: string[][] }` |

**Future types** (not in scope for this PRD):
- `diff` - Before/after comparisons
- `markdown` - Formatted text explanations

## AI-Inferred Relationships

The key differentiator is AI inferring relationships that non-AI tools cannot:

| Relationship Type | How AI Infers It |
|-------------------|------------------|
| Service → Deployment | Match Service selector to Deployment pod template labels |
| App dependencies | Parse env vars: `DATABASE_URL=postgres-svc.default.svc` |
| Traffic flow | Ingress rules → Service → selector → Pods |
| Application grouping | Naming patterns: "payment-api, payment-worker, payment-db" |
| Config dependencies | Which Deployments reference which ConfigMaps/Secrets |
| Cross-namespace communication | Service references in env vars, NetworkPolicies |

## Session Storage

Query tool needs to store response data for later visualization:

- **When**: After query executes, before returning response
- **What**: The resources returned by the query
- **Where**: Same session storage mechanism used by other tools
- **Key**: Generated sessionId included in visualizationUrl
- **Expiry**: Session expires after reasonable time (e.g., 1 hour)
- **Error handling**: If session expired/not found, return clear error message

## Configuration

| Environment Variable | Purpose | Default |
|---------------------|---------|---------|
| `WEB_UI_BASE_URL` | Base URL for visualization links | (not set = feature disabled) |

Example: `WEB_UI_BASE_URL=https://dot-ai-ui.example.com`

Generated URL format: `{WEB_UI_BASE_URL}/v/{sessionId}`

## Success Criteria

1. Query tool stores responses in sessions when `WEB_UI_BASE_URL` is set
2. Tool responses include `visualizationUrl` when configured
3. Visualization endpoint returns structured data with multiple visualization types
4. AI successfully infers implicit relationships beyond Kubernetes explicit references
5. Web UI can render all visualization types (mermaid, cards, code, table)
6. Session expiry handled gracefully with clear error messages
7. Integration tests pass for visualization endpoint

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI generates invalid Mermaid syntax | Visualization fails to render | Syntax validation before return; Web UI handles gracefully |
| Session expires before user opens URL | User sees error | Clear error message; suggest re-running query |
| AI latency on visualization request | Slow page load | Accept as tradeoff; could add loading indicator in UI |
| Large resource sets overwhelm visualization | Cluttered graph | AI should summarize/group; limit detail level |

## Out of Scope

- Other tools (recommend, remediate, operate) - separate PRDs
- Visual validation of AI-generated diagrams
- Server-side Mermaid → SVG conversion (UI renders Mermaid)
- Interactive graph manipulation (clicking nodes, etc.)
- Real-time updates / WebSocket streaming

## Milestones

### Milestone 1: Session Storage for Query Tool
- [ ] Query tool generates sessionId for each query
- [ ] Query tool stores response data (resources) in session
- [ ] Session expiry mechanism implemented
- [ ] Existing query functionality unchanged

### Milestone 2: Visualization URL in Tool Response
- [ ] `WEB_UI_BASE_URL` environment variable support
- [ ] Query tool includes `visualizationUrl` in response when configured
- [ ] Feature disabled when env var not set (no behavioral change)

### Milestone 3: Visualization Endpoint
- [ ] `GET /api/v1/visualize/{sessionId}` endpoint implemented
- [ ] Endpoint loads session data by sessionId
- [ ] Returns structured response matching API design
- [ ] Handles session not found / expired errors

### Milestone 4: AI Visualization Generation
- [ ] Visualization prompt template created (`prompts/visualize-query.md`)
- [ ] AI analyzes resources and infers relationships
- [ ] AI generates appropriate visualization types (mermaid, cards, table)
- [ ] AI generates insights array
- [ ] Multiple visualizations returned (topology, table, health views)

### Milestone 5: Integration Tests
- [ ] Test session storage and retrieval
- [ ] Test visualization URL generation
- [ ] Test visualization endpoint responses
- [ ] Test session expiry handling
- [ ] Test with various query types (pods, deployments, mixed resources)

### Milestone 6: Documentation & Follow-up
- [ ] API documentation for visualization endpoint
- [ ] Document environment variable configuration
- [ ] Create follow-up PRDs for other tools (recommend, remediate, operate)

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-31 | PRD created |

## Dependencies

- Query tool (`src/tools/query.ts`)
- Session storage mechanism (existing or new)
- Claude AI integration (`src/core/claude.ts`)
- REST server infrastructure (`src/interfaces/rest.ts`)
- Web UI (separate repo - dot-ai-ui)

## Related PRDs

- PRD #316: Unified Chat Endpoint for Web UI (potential future enhancement if Web UI becomes standalone chat interface)

## Technical Notes

- Visualization endpoint is HTTP-only, not exposed as MCP tool
- Uses file-based prompt templates following project patterns
- Mermaid rendering happens client-side in Web UI (no server dependency)
- Session storage should use same patterns as existing workflow sessions
- Consider caching AI-generated visualizations within session to avoid re-generation on refresh
