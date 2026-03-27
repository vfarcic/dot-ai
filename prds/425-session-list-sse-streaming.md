# PRD: Session List API and SSE Streaming for Remediation Events

**Issue**: [#425](https://github.com/vfarcic/dot-ai/issues/425)
**Status**: Open
**Priority**: High
**Created**: 2026-03-27

---

## Problem Statement

The dot-ai server runs remotely in a Kubernetes cluster. External consumers — a planned TUI dashboard (`dot-ai dashboard`) and potentially the controller — need to:

1. **Discover remediation sessions**: List open sessions (analysis complete but not yet executed) without knowing session IDs upfront
2. **React to new events in real-time**: Get notified when new remediations are analyzed or their status changes

Currently, sessions can only be retrieved by known ID (`GET /api/v1/sessions/:sessionId`). There is no list/query endpoint and no event streaming mechanism. The session data exists on disk but is inaccessible to remote consumers without these APIs.

---

## Solution Overview

Add two new REST API endpoints:

1. **`GET /api/v1/sessions`** — List remediation sessions with status filtering and pagination
2. **`GET /api/v1/events/remediations`** — SSE (Server-Sent Events) stream for real-time session lifecycle events

Plus the supporting infrastructure: a remediation event emitter singleton and instrumentation in `remediate.ts` to emit events at session state transitions.

### Why SSE Over WebSocket

- **Unidirectional**: The dashboard only needs to receive events, not send commands back over the same connection
- **HTTP-native**: Works through standard ingress controllers and proxies without upgrade negotiation
- **Simple**: No connection state management, automatic reconnection built into the `EventSource` browser/client API
- **Sufficient**: For a dashboard polling/streaming remediation status, SSE provides everything needed

### Architecture

```
TUI Dashboard (dot-ai-cli)
         │
         │ GET /api/v1/sessions (list open remediations)
         │ GET /api/v1/events/remediations (SSE stream)
         ▼
┌─────────────────────────────────────────────────────────┐
│                     REST API Server                      │
│                                                          │
│  handleListSessions()                                    │
│    → GenericSessionManager('rem').listSessions()          │
│    → Load each session, extract summary                  │
│    → Filter by status, paginate, return                  │
│                                                          │
│  handleRemediationSSE()                                  │
│    → Subscribe to remediationEvents EventEmitter          │
│    → Forward events as SSE to connected clients           │
│    → Heartbeat every 30s, cleanup on disconnect          │
│                                                          │
│  remediate.ts (existing)                                 │
│    → Emits session-created / session-updated events       │
│    → At 4 existing state transition points               │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Module-level EventEmitter singleton**: `remediate.ts` creates a new `GenericSessionManager` per invocation, so the event emitter must live outside the session manager as a shared singleton
2. **In-memory loading for list**: Sessions are low-volume (tens to hundreds). Loading all session files, filtering, and paginating in-memory is simpler and sufficient
3. **Summary-only responses**: The list endpoint returns only metadata (sessionId, status, issue, mode, timestamps) — not the full `finalAnalysis` — to keep responses lean
4. **No timeout on SSE**: The existing 30-minute `requestTimeout` only applies to `handleToolExecution`, not `dispatchRoute`, so SSE connections are unaffected

---

## User Journey

### Journey: TUI Dashboard Startup

```
1. Dashboard starts, connects to SSE endpoint:
   GET /api/v1/events/remediations
   ← : connected

2. Dashboard fetches current open sessions:
   GET /api/v1/sessions?status=analysis_complete
   ← { sessions: [...], total: 3, limit: 50, offset: 0 }

3. Dashboard renders list of 3 open remediations

4. Controller triggers a new remediation:
   POST /api/v1/tools/remediate { issue: "pod crashlooping" }

5. Dashboard receives SSE event:
   ← event: session-created
   ← data: { sessionId: "rem-...", status: "investigating", issue: "pod crashlooping" }

6. Investigation completes:
   ← event: session-updated
   ← data: { sessionId: "rem-...", status: "analysis_complete", issue: "pod crashlooping" }

7. Dashboard updates to show 4 open remediations
```

### Journey: Filtering by Status

```
# Show only executed remediations
GET /api/v1/sessions?status=executed_successfully
← { sessions: [...], total: 12, limit: 50, offset: 0 }

# Show failed investigations
GET /api/v1/sessions?status=failed
← { sessions: [...], total: 1, limit: 50, offset: 0 }

# Paginate through all sessions
GET /api/v1/sessions?limit=10&offset=0
GET /api/v1/sessions?limit=10&offset=10
```

---

## Technical Design

### Event Emitter Singleton

New file: `src/core/remediation-events.ts`

```typescript
interface RemediationEvent {
  sessionId: string;
  status: string;
  issue: string;
  timestamp: string;
}

// Module-level singleton EventEmitter
// Events: 'session-created', 'session-updated'
// Helper functions: emitSessionCreated(), emitSessionUpdated()
```

### List Sessions Endpoint

`GET /api/v1/sessions`

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | (none) | Filter by session status |
| `limit` | number | 50 | Max results per page |
| `offset` | number | 0 | Pagination offset |

**Response**:
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "rem-1726789200000-a1b2c3d4",
        "status": "analysis_complete",
        "issue": "pods in production are crashlooping",
        "mode": "automatic",
        "createdAt": "2026-03-27T10:00:00.000Z",
        "updatedAt": "2026-03-27T10:02:30.000Z"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  },
  "meta": { "timestamp": "...", "requestId": "...", "version": "..." }
}
```

### SSE Endpoint

`GET /api/v1/events/remediations`

**Headers sent**:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

**Event format**:
```
event: session-created
data: {"sessionId":"rem-...","status":"investigating","issue":"...","timestamp":"..."}

event: session-updated
data: {"sessionId":"rem-...","status":"analysis_complete","issue":"...","timestamp":"..."}

: heartbeat
```

### Instrumentation Points in remediate.ts

| Location | Event | Status |
|----------|-------|--------|
| After `createSession()` (~line 1282) | `session-created` | `investigating` |
| After `updateSession()` (~line 429) | `session-updated` | `analysis_complete` |
| After `updateSession()` (~line 449) | `session-updated` | `failed` |
| After `updateSession()` (~line 1103) | `session-updated` | `executed_successfully` / `executed_with_errors` |

---

## Success Criteria

1. **List endpoint returns sessions**: `GET /api/v1/sessions` returns paginated session summaries
2. **Filtering works**: `?status=analysis_complete` returns only matching sessions
3. **No data leakage**: List responses contain summary fields only, not `finalAnalysis`
4. **SSE connection establishes**: Clients receive `: connected` comment on connect
5. **Real-time events flow**: Triggering a remediation produces SSE events for connected clients
6. **Heartbeat keeps connection alive**: 30-second heartbeat prevents proxy timeouts
7. **Clean disconnect**: Client disconnection properly cleans up event listeners
8. **Existing tests pass**: No regression in current test suite

---

## Out of Scope

1. **Session cleanup/TTL**: No automatic expiration of old sessions (future work)
2. **Multi-tool session listing**: Only remediation sessions (`rem-` prefix) for now
3. **SSE filtering**: All events streamed to all clients; per-client filtering is future work
4. **Authentication on SSE**: Uses same auth as other REST endpoints; no SSE-specific auth
5. **Replay/catch-up**: SSE only streams live events; missed events require polling the list endpoint

---

## Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| `GenericSessionManager.listSessions()` | Internal | Exists | Already implemented in `src/core/generic-session-manager.ts` |
| REST route registry pattern | Internal | Exists | `src/interfaces/routes/index.ts` |
| Handler dispatch pattern | Internal | Exists | `src/interfaces/rest-api.ts` |
| Zod schema pattern | Internal | Exists | `src/interfaces/schemas/sessions.ts` |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Many session files slow down list endpoint | Medium | Low volume expected (tens-hundreds); optimize with parallel reads if needed |
| SSE connections accumulate without cleanup | Low | Cleanup on `req.on('close')`; 30-min natural timeout from proxy/ingress |
| EventEmitter memory leak (listeners not removed) | Medium | Explicit `off()` in disconnect handler; Node.js warns at 11+ listeners |
| Proxy/ingress buffering SSE events | Medium | `Cache-Control: no-cache` + heartbeat; document ingress config if needed |

---

## Milestones

### Milestone 1: Event Emitter Infrastructure
- [ ] Create `src/core/remediation-events.ts` with singleton EventEmitter
- [ ] Define `RemediationEvent` interface and typed emit helpers
- [ ] Instrument `src/tools/remediate.ts` at 4 state transition points

### Milestone 2: List Sessions Endpoint
- [ ] Add Zod schemas for session list query/response in `src/interfaces/schemas/sessions.ts`
- [ ] Register `GET /api/v1/sessions` route in route registry
- [ ] Implement `handleListSessions()` handler with filtering and pagination

### Milestone 3: SSE Streaming Endpoint
- [ ] Register `GET /api/v1/events/remediations` route
- [ ] Implement `handleRemediationSSE()` with subscribe, heartbeat, and cleanup
- [ ] Handle CORS headers for SSE connections

### Milestone 4: Integration Tests
- [ ] List endpoint tests (shape, filtering, pagination, no data leakage)
- [ ] SSE endpoint tests (headers, connection, event receipt)
- [ ] All existing tests still pass

### Milestone 5: Follow-Up
- [ ] Create PRD in `../dot-ai-cli` for TUI dashboard consuming these APIs

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `src/core/remediation-events.ts` | Create — event emitter singleton |
| `src/tools/remediate.ts` | Modify — emit events at 4 sites |
| `src/interfaces/schemas/sessions.ts` | Modify — add list schemas |
| `src/interfaces/schemas/index.ts` | Modify — export new schemas |
| `src/interfaces/routes/index.ts` | Modify — register 2 routes |
| `src/interfaces/rest-api.ts` | Modify — add 2 handlers + dispatch entries |
| `tests/integration/tools/sessions-list.test.ts` | Create — list endpoint tests |
| `tests/integration/tools/sse-remediations.test.ts` | Create — SSE endpoint tests |
