# PRD #343: kubectl Plugin Migration

**GitHub Issue**: [#343](https://github.com/vfarcic/dot-ai/issues/343)
**Parent PRD**: [#342 - Modular Plugin Architecture](./342-modular-plugin-architecture.md)
**Status**: Not Started
**Priority**: High
**Created**: 2025-01-25

---

## Problem Statement

kubectl tools (`kubectl_get`, `kubectl_apply`, etc.) are embedded in dot-ai core (`src/core/kubectl-tools.ts`), preventing:
1. Modular extension by users
2. Clear separation of concerns
3. Independent testing and development of tools

---

## Solution Overview

1. Create `agentic-tools` package in monorepo (`packages/agentic-tools/`)
2. Implement kubectl_* tools with standard plugin interface
3. Build as container image with HTTP endpoint
4. Integrate into dot-ai (plugin discovery and invocation)
5. Remove old kubectl-tools code from dot-ai core

**Done when**: kubectl tools work via plugin system and old code is removed.

---

## Technical Design

### Plugin Interface

**Endpoint**: `POST /execute`

**Describe Hook** (returns tool definitions):
```json
// Request
{
  "hook": "describe"
}

// Response
{
  "name": "agentic-tools",
  "version": "1.0.0",
  "tools": [
    {
      "name": "kubectl_get",
      "type": "agentic",
      "description": "Get Kubernetes resources",
      "inputSchema": {
        "type": "object",
        "properties": {
          "kind": { "type": "string", "description": "Resource kind" },
          "namespace": { "type": "string", "description": "Namespace" },
          "name": { "type": "string", "description": "Resource name" },
          "output": { "type": "string", "default": "json" }
        },
        "required": ["kind"]
      }
    }
    // ... other tools
  ]
}
```

**Invoke Hook** (executes tool):
```json
// Request
{
  "hook": "invoke",
  "sessionId": "ses_abc123",
  "payload": {
    "tool": "kubectl_get",
    "args": {
      "kind": "Pod",
      "namespace": "default"
    },
    "state": {}
  }
}

// Response
{
  "sessionId": "ses_abc123",
  "success": true,
  "result": {
    "items": [...]
  },
  "state": {
    "lastQuery": "pods"
  }
}
```

**Error Response**:
```json
{
  "sessionId": "ses_abc123",
  "success": false,
  "error": {
    "code": "KUBECTL_FAILED",
    "message": "Failed to get pods: connection refused",
    "details": {}
  }
}
```

### Package Structure

```
packages/agentic-tools/
├── Dockerfile
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # HTTP server, /execute endpoint
│   ├── hooks/
│   │   ├── describe.ts   # Returns tool definitions
│   │   └── invoke.ts     # Routes to tool handlers
│   ├── tools/
│   │   ├── kubectl-get.ts
│   │   ├── kubectl-apply.ts
│   │   ├── kubectl-describe.ts
│   │   ├── kubectl-logs.ts
│   │   ├── kubectl-events.ts
│   │   ├── kubectl-api-resources.ts
│   │   └── kubectl-get-crd-schema.ts
│   └── utils/
│       └── kubectl-executor.ts
└── tests/
    └── integration/
```

### dot-ai Integration

**Configuration** (Helm values or environment):
```yaml
plugins:
  - image: ghcr.io/vfarcic/dot-ai-agentic-tools:latest
    name: agentic-tools
```

**Discovery Flow**:
1. dot-ai starts, reads plugin configuration
2. Kubernetes spins up plugin containers (sidecars or separate pods)
3. dot-ai waits for plugin readiness
4. dot-ai calls `POST /execute {hook: "describe"}` on each plugin
5. dot-ai registers tools from responses
6. Agentic loops use registered tools

**Invocation Flow**:
1. LLM requests tool (e.g., `kubectl_get`)
2. dot-ai looks up tool → finds it's from `agentic-tools` plugin
3. dot-ai calls `POST /execute {hook: "invoke", ...}` on plugin
4. Plugin executes kubectl command, returns result
5. dot-ai passes result back to LLM

---

## Scope

### In Scope

- Create `packages/agentic-tools/` package structure
- Implement HTTP server with `/execute` endpoint
- Implement `describe` hook returning tool definitions
- Implement `invoke` hook with routing to tools
- Migrate all kubectl_* tools:
  - kubectl_get
  - kubectl_apply
  - kubectl_describe
  - kubectl_logs
  - kubectl_events
  - kubectl_api_resources
  - kubectl_get_crd_schema
- Create Dockerfile for container image
- Integrate plugin discovery into dot-ai
- Integrate plugin invocation into dot-ai agentic loop
- Remove old `src/core/kubectl-tools.ts`
- Update Helm chart for plugin deployment
- Integration tests

### Out of Scope

- Other agentic tools (search_*, mermaid) - future PRDs
- MCP tools as plugins - future PRDs
- User-provided plugin documentation - future PRDs

---

## Milestones

- [ ] **M1: Package structure and HTTP server**
  - Create `packages/agentic-tools/` with basic structure
  - Implement HTTP server with `/execute` endpoint
  - Implement `describe` hook (empty tools list initially)
  - Dockerfile builds and runs

- [ ] **M2: kubectl tools implementation**
  - Migrate all kubectl_* tools to new package
  - Implement `invoke` hook with routing
  - Tools work when called directly via HTTP

- [ ] **M3: dot-ai plugin discovery**
  - dot-ai reads plugin configuration
  - dot-ai calls `describe` on plugins at startup
  - dot-ai registers tools from plugin responses

- [ ] **M4: dot-ai plugin invocation**
  - Agentic loop routes tool calls to plugins
  - Session state passed to/from plugins
  - End-to-end flow works (MCP → dot-ai → plugin → dot-ai → LLM)

- [ ] **M5: Cleanup and integration tests**
  - Remove old `src/core/kubectl-tools.ts`
  - Remove related old code (imports, etc.)
  - Integration tests pass
  - Helm chart updated

---

## Dependencies

### Internal
- dot-ai core (MCP server, agentic loop engine)
- Helm chart

### External
- Kubernetes cluster for testing
- Container registry (ghcr.io)

---

## Success Criteria

1. **Plugin works standalone**: Can call `/execute` directly and get correct responses
2. **Integration works**: MCP tool calls flow through plugin correctly
3. **No regression**: Existing functionality works as before
4. **Old code removed**: `kubectl-tools.ts` deleted, no dead code
5. **Tests pass**: Integration tests cover the new flow
6. **Deployable**: Helm chart deploys plugin alongside dot-ai

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Latency from HTTP calls | Benchmark; optimize if needed; keep containers warm |
| Plugin startup timing | Implement readiness probes and retry logic in dot-ai |
| Breaking existing flows | Comprehensive integration tests before removing old code |
| Kubernetes auth in plugin | Pass kubeconfig via mount or environment |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-25 | Single `agentic-tools` package | All agentic tools in one container; simpler deployment |
| 2025-01-25 | Two hooks: describe + invoke | Minimal surface to start; expand when needed |
| 2025-01-25 | HTTP interface | Language-agnostic, standard, easy to test |
| 2025-01-25 | Monorepo package | Can split later; easier to develop together initially |

---

## On Completion

**When this PRD is complete, update the umbrella PRD [#342](./342-modular-plugin-architecture.md):**

1. **Migration Tracking table**: Mark kubectl_* tools as "Complete" with link to this PRD
2. **Lessons Learned section**: Document what worked, what didn't, and recommendations for future tool migrations
3. **Child PRDs section**: Mark this PRD as complete
