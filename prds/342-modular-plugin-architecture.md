# PRD #342: Modular Plugin Architecture (Umbrella)

**GitHub Issue**: [#342](https://github.com/vfarcic/dot-ai/issues/342)
**Status**: In Progress
**Priority**: High
**Created**: 2025-01-25

---

## Vision

Transform dot-ai from a monolithic MCP server into a "dumb" orchestrator that:
1. Loads plugins (containers with standard HTTP interface)
2. Registers MCP tools based on plugin configuration
3. Dispatches tool invocations to appropriate plugins
4. Manages session state centrally
5. Runs agentic loops with tools provided by plugins

This enables:
- **User extensibility**: Users can add custom tools by providing container images
- **Clear separation**: Each plugin is self-contained with its own code and config
- **Maintainability**: dot-ai core stays focused on orchestration

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    DOT-AI CORE                              │
│  - MCP protocol handler                                     │
│  - Plugin discovery (calls /execute on containers)          │
│  - Agentic loop engine                                      │
│  - Session/state management                                 │
│  - Hook dispatcher                                          │
└─────────────────────────────────────────────────────────────┘
        │
        │ POST /execute {hook, sessionId, payload}
        ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ agentic-tools │ │ future:       │ │ user-provided │
│ plugin        │ │ mcp-tools     │ │ plugin        │
└───────────────┘ └───────────────┘ └───────────────┘
```

**Plugin Interface**:
- `POST /execute` with `{hook: "describe"}` → Returns tool definitions
- `POST /execute` with `{hook: "invoke", payload: {tool, args, state}}` → Executes tool

**State Management**:
- Every request/response includes `sessionId`
- dot-ai manages session files
- Plugin responses merged into session state (new value overwrites)

---

## Migration Tracking

### Agentic Tools Package (`agentic-tools`)

Single package/container for all tools called by LLM during agentic loops.

| Tool | Status | PRD |
|------|--------|-----|
| kubectl_get | Not Started | #343 |
| kubectl_apply | Not Started | #343 |
| kubectl_describe | Not Started | #343 |
| kubectl_logs | Not Started | #343 |
| kubectl_events | Not Started | #343 |
| kubectl_api_resources | Not Started | #343 |
| kubectl_get_crd_schema | Not Started | #343 |
| search_capabilities | Pending | TBD |
| search_resources | Pending | TBD |
| query_capabilities | Pending | TBD |
| query_resources | Pending | TBD |
| validate_mermaid | Pending | TBD |

### MCP Tools (Future)

Tools registered with MCP, called by users via MCP protocol.

| Tool | Status | PRD |
|------|--------|-----|
| query | Pending | TBD |
| remediate | Pending | TBD |
| operate | Pending | TBD |
| recommend | Pending | TBD |
| manageOrgData | Pending | TBD |
| projectSetup | Pending | TBD |
| version | Pending | TBD |

---

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Kubernetes-only deployment** | dot-ai is useless without Kubernetes; simplifies deployment model |
| **Containers with HTTP interface** | Language-agnostic, standard interface, easy to test |
| **Config inside containers** | Single source of truth; dot-ai discovers via `describe` hook |
| **Two hooks to start** | `describe` and `invoke` - minimal surface, expand when needed |
| **State managed by dot-ai** | Centralized, consistent, plugins stateless |
| **Monorepo initially** | Can split to separate repos later when interface stabilizes |
| **Single agentic-tools package** | All agentic tools in one container; simpler deployment |

---

## Lessons Learned

*(Updated as child PRDs progress)*

### From #343 (kubectl Plugin Migration)
- TBD

### From MCP Tool Plugins (future)
- TBD

---

## Child PRDs

- [ ] **#343** - kubectl Plugin Migration (agentic-tools package + kubectl_* tools)
- [ ] **TBD** - search/query tools migration (add to agentic-tools)
- [ ] **TBD** - mermaid tools migration (add to agentic-tools)
- [ ] **TBD** - MCP tools as plugins

---

## Related

- **#345** - Kubernetes-Only Deployment (separate cleanup, not part of plugin architecture)

---

## References

- [MCP Protocol](https://modelcontextprotocol.io/)
- Internal discussion: Plugin architecture design session (2025-01-25)
