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
| kubectl_get | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_apply | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_describe | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_logs | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_events | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_api_resources | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_get_crd_schema | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_version | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_get_resource_json | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_get_printer_columns | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_apply_dryrun | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_delete | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_delete_dryrun | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_patch | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_patch_dryrun | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| kubectl_exec | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| helm_install | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| helm_uninstall | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| helm_template | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| helm_repo_add | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
| shell_exec | ✅ Complete | [#343](./done/343-kubectl-plugin-migration.md) |
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
- **Separate Deployments > Sidecars**: Independent scaling/lifecycle, plugin updates don't restart MCP server, cleaner separation
- **Plugin config via ConfigMap file**: Cleaner than env var, K8s-native approach at `/etc/dot-ai/plugins.json`
- **RBAC removal from MCP server validates migration**: If something breaks, you know code was missed
- **Two invocation paths needed**: Agentic (LLM-driven via toolLoop) and Direct (code-driven via `PluginManager.invokeTool()`)
- **Incremental migration reduces risk**: Prove direct invocation (version tool) before agentic (query tool)
- **Parallel CI jobs**: `build-dot-ai` and `build-agentic-tools` run concurrently, cutting release time
- **Plugin timeout matters**: Helm operations need 5min timeout vs 30s default

### From MCP Tool Plugins (future)
- TBD

---

## Child PRDs

- [x] **#343** - kubectl Plugin Migration (agentic-tools package + kubectl_* tools) - ✅ Complete
- [ ] **TBD** - search/query tools migration (add to agentic-tools)
- [ ] **TBD** - mermaid tools migration (add to agentic-tools)
- [ ] **TBD** - MCP tools as plugins
- [ ] **TBD** - Plugin scaffolding tool (MCP tool to help users create their own plugins)

---

## Related

- **#345** - Kubernetes-Only Deployment (separate cleanup, not part of plugin architecture)

---

## References

- [MCP Protocol](https://modelcontextprotocol.io/)
- Internal discussion: Plugin architecture design session (2025-01-25)
