# PRD: MCP Server Integration for Extended Tool Capabilities

**Created**: 2026-01-30
**Status**: In Progress
**Owner**: Viktor Farcic
**Last Updated**: 2026-03-18
**GitHub Issue**: [#358](https://github.com/vfarcic/dot-ai/issues/358)
**Priority**: Medium
**Complexity**: High
**Supersedes**: [PRD #150](https://github.com/vfarcic/dot-ai/blob/main/prds/done/150-remediation-observability-integration.md)

---

## Executive Summary

Add MCP client capability to dot-ai, enabling connection to MCP servers running in the cluster. This allows dot-ai tools (remediate, operate, query) to leverage tools from external MCP servers without building custom integrations for each platform.

All MCP servers are configured via a single `mcpServers` section — dot-ai does not deploy MCP servers, it connects to servers already running in the cluster.

The `attachTo` mechanism configures which MCP servers provide tools to which dot-ai tools.

---

## Problem Statement

### Current Limitations

The remediation tool (and other dot-ai tools) rely solely on kubectl-based investigation, limiting diagnostic capabilities for issues requiring:
- **Historical metrics** (CPU/memory trends over time)
- **Performance data** (latency, throughput, error rates)
- **Distributed traces** (cross-service correlation)
- **Observability alerts** (active incidents, alert history)

### Why Not Build Custom Integrations?

The original approach (PRD #150) proposed building custom observability tools following the kubectl-tools pattern. This was rejected because:
- Requires building and maintaining N integrations (Prometheus, Datadog, Jaeger, etc.)
- Duplicates work already done in the MCP ecosystem
- Limits users to only the tools we implement
- High maintenance burden as APIs evolve

### MCP Ecosystem Opportunity

The MCP ecosystem already has servers for many observability platforms. By adding MCP client capability, we can:
- Leverage existing, maintained MCP servers
- Allow users to use any MCP server, not just ones we implement
- Maintain single integration point (MCP client) vs. N custom integrations
- Benefit automatically from community MCP improvements

---

## Solution Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Cluster                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     MCP Protocol      ┌─────────────────┐ │
│  │   dot-ai    │◄───────────────────►  │  Prometheus MCP │ │
│  │ (MCP Client)│                       │    (bundled)    │ │
│  │             │                       └─────────────────┘ │
│  │  remediate  │     MCP Protocol      ┌─────────────────┐ │
│  │   operate   │◄───────────────────►  │   Jaeger MCP    │ │
│  │    query    │                       │    (custom)     │ │
│  └─────────────┘                       └─────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Configuration Model

```yaml
# values.yaml

# MCP servers - already running in cluster, dot-ai connects as client
mcpServers:
  prometheus:
    enabled: true
    endpoint: "http://prometheus-mcp.monitoring.svc:3000/mcp"
    attachTo:
      - remediate
      - query
  jaeger:
    enabled: true
    endpoint: "http://jaeger-mcp.tracing.svc:3000/mcp"
    attachTo:
      - remediate
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **`mcpServers`** | MCP servers running in-cluster that dot-ai connects to |
| **`attachTo`** | List of dot-ai tools that can use this MCP server's tools |
| **MCP Client** | New capability in dot-ai to connect to MCP servers |
| **Tool namespacing** | MCP tools are prefixed as `{server}__{tool}` to avoid collisions |

### How It Works

1. User adds MCP server entries to `mcpServers` in Helm values
2. Helm generates ConfigMap at `/etc/dot-ai-mcp/mcp-servers.json`
3. dot-ai connects to configured MCP servers as MCP client at startup
4. dot-ai discovers available tools from each MCP server via `client.listTools()`
5. When `remediate` runs, it gets tools from MCP servers where `attachTo` includes "remediate"
6. AI uses both kubectl tools (from agentic-tools plugin) and MCP server tools

---

## User Journey

### Before (kubectl-only)

```
1. User: "My pods keep restarting"
2. AI calls kubectl tools → sees OOMKilled events
3. AI: "Pods restarting due to OOMKilled - increase memory limit"
4. User manually checks Prometheus for actual memory usage
5. User discovers memory spikes to 450Mi, limit is 512Mi
6. User implements fix based on combined data
```

### After (with MCP integration)

```
1. User: "My pods keep restarting"
2. AI calls kubectl_describe → sees OOMKilled events
3. AI calls prometheus_query → sees memory peaks at 450Mi consistently
4. AI calls prometheus_query → sees memory request set to 128Mi
5. AI: "Memory peaks at 450Mi, limit is 512Mi, but requests too low.
        Set memory request=256Mi, limit=512Mi based on actual usage"
6. User applies fix with complete confidence
```

---

## Existing MCP Servers

During implementation, evaluate these existing MCP servers for suitability:

### Observability & Monitoring
| MCP Server | Purpose | Potential Use |
|------------|---------|---------------|
| Prometheus MCP | Metrics queries, alerts | remediate, query |
| Grafana MCP | Dashboard data, alerts | remediate, query |
| Datadog MCP | APM, metrics, logs | remediate, query |
| New Relic MCP | APM, metrics | remediate, query |

### Tracing & Debugging
| MCP Server | Purpose | Potential Use |
|------------|---------|---------------|
| Jaeger MCP | Distributed traces | remediate |
| Tempo MCP | Trace queries | remediate |
| OpenTelemetry MCP | Traces, metrics | remediate, query |

### Logging
| MCP Server | Purpose | Potential Use |
|------------|---------|---------------|
| Loki MCP | Log queries | remediate |
| Elasticsearch MCP | Log search | remediate |

### Selection Criteria

When selecting MCP servers to bundle or recommend:
- **Maturity**: Is it actively maintained?
- **Popularity**: Is the backing service commonly used?
- **Testing ease**: Can we test it in CI without complex setup?
- **API stability**: Is the MCP server API stable?
- **License**: Compatible with our project?

---

## Success Criteria

### Functional Requirements
- [x] dot-ai can connect to MCP servers running in the cluster
- [x] Tool discovery works for connected MCP servers
- [x] `attachTo` correctly routes tools to specified dot-ai tools
- [~] Bundled MCP servers deploy correctly via Helm (N/A — dot-ai connects to already-running MCP servers, does not deploy them)
- [x] MCP servers integrate via endpoint configuration
- [x] Remediation uses MCP server tools alongside kubectl tools

### Quality Requirements
- [x] Startup fails fast with clear error when configured MCP servers are unreachable
- [x] Clear error messages for configuration issues
- [x] Integration tests validate MCP server integration

### User Experience
- [x] Configuration is intuitive (single `mcpServers` section)
- [x] Documentation explains integration pattern
- [x] Example configurations provided in values.yaml comments

---

## Milestones

### Milestone 1: MCP Client + Helm Config + Prometheus + Remediate

**Goal**: Validate entire architecture end-to-end with Prometheus + remediate

**Tasks**:
- [x] Implement MCP client capability in dot-ai
- [x] Add Helm configuration for `mcpServers`
- [x] Implement `attachTo` mechanism for tool routing
- [x] Research and select Prometheus MCP server to bundle
- [~] Bundle Prometheus MCP server in Helm chart (N/A — dot-ai connects to already-running MCP servers)
- [x] Update remediation to use tools from attached MCP servers
- [x] Integration tests for Prometheus + remediate flow

**Success Criteria**:
- Prometheus MCP server deploys via Helm when enabled
- Remediation uses Prometheus tools for metrics-based analysis
- AI correlates kubectl data with Prometheus metrics
- End-to-end test passes

### Milestone 2: Operate Tool Integration

**Goal**: Extend MCP server integration to operate tool

**Tasks**:
- [ ] Discussion: Which MCP server is a good candidate for operate?
- [ ] Add selected MCP server as bundled or test-only
- [x] Update operate tool to use attached MCP server tools
- [~] Integration tests for operate + MCP server (covered by remediate MCP test — identical integration pattern)

**Success Criteria**:
- Operate tool can use tools from attached MCP servers
- Integration test validates the flow

### Milestone 3: Query Tool Integration

**Goal**: Extend MCP server integration to query tool

**Tasks**:
- [ ] Discussion: Which MCP server is a good candidate for query?
- [ ] Add selected MCP server as bundled or test-only
- [x] Update query tool to use attached MCP server tools
- [~] Integration tests for query + MCP server (covered by remediate MCP test — identical integration pattern)

**Success Criteria**:
- Query tool can use tools from attached MCP servers
- Integration test validates the flow

### Milestone 4: Documentation

**Goal**: Complete user documentation for MCP server integration

**Tasks**:
- [x] Setup guide for MCP servers
- [x] Configuration reference for `mcpServers`
- [~] Troubleshooting guide (covered inline in deployment docs startup behavior section)
- [~] "Request new MCP server support" process in docs (deferred — not needed until community adoption grows)

**Success Criteria**:
- Users can set up MCP servers from docs
- Documentation follows existing patterns

---

## Technical Considerations

### MCP Client Implementation

dot-ai needs to act as an MCP client to connect to MCP servers. Key considerations:
- Support SSE and/or streamable-http transport
- Handle tool discovery from multiple MCP servers
- Merge tools from MCP servers with plugin tools
- Route tool execution to correct MCP server

### Tool Routing with `attachTo`

```typescript
// Actual implementation pattern (e.g., in remediate.ts)
const kubectlTools = pluginManager.getDiscoveredTools()
  .filter(t => KUBECTL_INVESTIGATION_TOOL_NAMES.includes(t.name));

const mcpTools = isMcpClientInitialized()
  ? getMcpClientManager()!.getToolsForOperation('remediate')
  : [];

const allTools = [...kubectlTools, ...mcpTools];

// Chain executors: MCP → Plugin → fallback
const pluginExecutor = pluginManager.createToolExecutor();
const toolExecutor = isMcpClientInitialized()
  ? getMcpClientManager()!.createToolExecutor(pluginExecutor)
  : pluginExecutor;
```

### Helm Chart Changes

New templates created:
- `mcp-servers-configmap.yaml` — ConfigMap with MCP server connection config
- `_helpers.tpl` — `dot-ai.mcpServersConfig` helper generates JSON array
- `deployment.yaml` — Mounts ConfigMap at `/etc/dot-ai-mcp/`

### Failure Handling

- MCP server unreachable at startup: **Fail fast** with clear error (configured servers must be reachable)
- Tool execution fails: Return error to AI, let it try alternative approach
- No MCP servers configured: dot-ai starts normally, tools work with kubectl only

---

## Dependencies

### External Dependencies
- MCP server implementations (Prometheus MCP, etc.)
- MCP protocol libraries for client implementation

### Internal Dependencies
- Plugin system (tools from plugins + MCP servers need to coexist)
- Remediate, operate, query tools (need updates to use MCP server tools)
- Helm chart (needs new templates)

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Suitable MCP servers don't exist | High | Low | Fall back to building minimal custom integration |
| MCP server API instability | Medium | Medium | Pin versions, test upgrades |
| Performance overhead | Medium | Low | Connection pooling, async discovery |
| Complex user configuration | Medium | Medium | Good defaults, clear docs, validation |

---

## Out of Scope

- Building custom observability integrations (superseded approach)
- Running MCP servers outside the cluster (network complexity)
- Authentication between dot-ai and MCP servers (assume in-cluster trust)
- MCP server development (we use existing servers)

---

## Open Questions

1. **Q**: Which Prometheus MCP server should we bundle?
   **A**: TBD - evaluate during Milestone 1

2. **Q**: Should we support MCP servers outside the cluster?
   **A**: No - adds network/auth complexity, can revisit later if needed

3. **Q**: How do we handle MCP servers that require configuration?
   **A**: Use `env` field in Helm values, similar to plugins

---

## Work Log

### 2026-01-30: PRD Creation
**Status**: Draft
**Context**: Supersedes PRD #150

**Key Decisions**:
- Use MCP client approach instead of custom tool integrations
- Two configuration patterns: `mcpServers` (bundled) and `customMcpServers` (user-deployed)
- `attachTo` mechanism for explicit tool-to-operation routing
- Prometheus + remediate as first integration to validate architecture
- Separate milestones per dot-ai tool (operate, query) with discussion phase for MCP server selection

**Next Steps**: Begin Milestone 1 - MCP Client + Prometheus + Remediate

### 2026-03-18: Core MCP Client Infrastructure
**Status**: In Progress
**Context**: Milestone 1 core implementation complete, Prometheus integration remaining

**Key Decisions**:
- Merged `mcpServers` and `customMcpServers` into single `mcpServers` — dot-ai does not deploy MCP servers, so the distinction was meaningless
- Removed `required` field and background retry — MCP servers are already running, fail fast at startup if unreachable
- Added tool namespacing `{server}__{tool}` to avoid name collisions across MCP servers and with plugin tools
- Separate config path `/etc/dot-ai-mcp/mcp-servers.json` to avoid conflicts with plugin ConfigMap at `/etc/dot-ai/`
- Added MCP server status to version tool diagnostics (server names, endpoints, attachTo, tools)

**Files Created**:
- `src/core/mcp-client-types.ts` — Type definitions
- `src/core/mcp-client-manager.ts` — Core MCP client (connection, discovery, routing)
- `src/core/mcp-client-registry.ts` — Global singleton access
- `charts/templates/mcp-servers-configmap.yaml` — Helm ConfigMap template

**Files Modified**:
- `charts/values.yaml` — Added `mcpServers` configuration section
- `charts/templates/_helpers.tpl` — Added `dot-ai.mcpServersConfig` helper
- `charts/templates/deployment.yaml` — Added MCP config volume mount
- `src/mcp/server.ts` — MCP client initialization at startup
- `src/tools/remediate.ts` — MCP tool integration
- `src/tools/operate-analysis.ts` — MCP tool integration
- `src/tools/query.ts` — MCP tool integration
- `src/tools/version.ts` — MCP server status in diagnostics

**Next Steps**: Research Prometheus MCP server, write integration tests

### 2026-03-18: Prometheus MCP Server Selection & Test Infrastructure
**Status**: In Progress
**Context**: Selected Prometheus MCP server and added to test cluster

**Key Decisions**:
- Selected `pab1it0/prometheus-mcp-server` (TypeScript, `ghcr.io/pab1it0/prometheus-mcp-server:latest`)
  - 6 tools: `execute_query`, `execute_range_query`, `list_metrics`, `get_metric_metadata`, `get_targets`, `health_check`
  - HTTP transport (StreamableHTTP compatible with McpClientManager)
  - Published Docker image, actively maintained
- Prometheus deployed via Helm chart (`prometheus-community/prometheus`) in test cluster
  - Release name `dot-ai-prometheus` to avoid ClusterRole collision with recommend test
- Prometheus MCP server deployed as Deployment + Service (no Helm chart available for it)

**Files Modified**:
- `tests/integration/infrastructure/run-integration-tests.sh` — Added Prometheus Helm install, MCP server Deployment+Service, wait blocks, mcpServers Helm values for dot-ai
- `tests/integration/tools/version.test.ts` — Added mcpServers assertion (serverCount, toolCount, tool names, attachTo)
- `src/core/mcp-client-manager.ts` — Fixed pre-existing lint errors (added `{ cause: err }`) and TypeScript errors (cast `result.content` array)

**Next Steps**: Write integration tests for remediate + Prometheus flow, bundle Prometheus MCP in production Helm chart

### 2026-03-19: Prometheus + Remediate Integration Test
**Status**: In Progress
**Context**: Milestone 1 integration test complete, validating full MCP architecture end-to-end

**Key Decisions**:
- Wrote integration test proving AI uses Prometheus MCP tools (`prometheus__*`) alongside kubectl tools during remediation
- Used lightweight OOM scenario (80M stress / 48Mi limit / 24Mi request) to avoid overburdening KinD cluster
- Issue description explicitly mentions Prometheus metrics to encourage AI tool usage
- Decided operate/query MCP integration tests are redundant — all three tools use identical `getToolsForOperation()` + `createToolExecutor()` pattern; remediate test validates the shared plumbing

**Files Modified**:
- `tests/integration/tools/remediate.test.ts` — Added "MCP Server Integration - Prometheus" test block (142 lines)

**Test Results**: All 4 remediate tests pass (Manual Mode 111s, Helm Release 117s, Automatic Mode 146s, MCP Prometheus 156s)

**Next Steps**: Bundle Prometheus MCP in Helm chart (or mark N/A since PRD states dot-ai connects to already-running servers), documentation (Milestone 4)
