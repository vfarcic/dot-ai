# PRD: MCP Server Integration for Extended Tool Capabilities

**Created**: 2026-01-30
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2026-01-30
**GitHub Issue**: [#358](https://github.com/vfarcic/dot-ai/issues/358)
**Priority**: Medium
**Complexity**: High
**Supersedes**: [PRD #150](https://github.com/vfarcic/dot-ai/blob/main/prds/done/150-remediation-observability-integration.md)

---

## Executive Summary

Add MCP client capability to dot-ai, enabling connection to MCP servers running in the cluster. This allows dot-ai tools (remediate, operate, query) to leverage tools from external MCP servers without building custom integrations for each platform.

Two integration patterns are supported:
- **Bundled MCP servers** (`mcpServers`): We deploy and configure, users just enable
- **Custom MCP servers** (`customMcpServers`): Users deploy their own, provide endpoint

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

# Bundled MCP servers - we deploy, users just enable and configure backing service
mcpServers:
  prometheus:
    enabled: true
    prometheusUrl: "http://prometheus.monitoring.svc:9090"
    attachTo:
      - remediate
      - query

# Custom MCP servers - users deploy, provide endpoint
customMcpServers:
  jaeger:
    endpoint: "http://jaeger-mcp.tracing.svc:3000"
    attachTo:
      - remediate
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **`mcpServers`** | MCP servers we bundle and deploy via Helm chart |
| **`customMcpServers`** | User-deployed MCP servers, just provide endpoint |
| **`attachTo`** | List of dot-ai tools that can use this MCP server's tools |
| **MCP Client** | New capability in dot-ai to connect to MCP servers |

### How It Works

1. User enables `mcpServers.prometheus` or adds entry to `customMcpServers`
2. Helm chart deploys bundled MCP servers (if enabled)
3. dot-ai connects to configured MCP servers as MCP client
4. dot-ai discovers available tools from each MCP server
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
- [ ] dot-ai can connect to MCP servers running in the cluster
- [ ] Tool discovery works for connected MCP servers
- [ ] `attachTo` correctly routes tools to specified dot-ai tools
- [ ] Bundled MCP servers deploy correctly via Helm
- [ ] Custom MCP servers integrate via endpoint configuration
- [ ] Remediation uses MCP server tools alongside kubectl tools

### Quality Requirements
- [ ] MCP connection failures don't break core functionality
- [ ] Graceful degradation when MCP servers are unavailable
- [ ] Clear error messages for configuration issues
- [ ] Integration tests validate both bundled and custom patterns

### User Experience
- [ ] Configuration is intuitive (`mcpServers` vs `customMcpServers`)
- [ ] Documentation explains both integration patterns
- [ ] Example configurations provided for common setups

---

## Milestones

### Milestone 1: MCP Client + Helm Config + Prometheus + Remediate

**Goal**: Validate entire architecture end-to-end with Prometheus + remediate

**Tasks**:
- [ ] Implement MCP client capability in dot-ai
- [ ] Add Helm configuration for `mcpServers` and `customMcpServers`
- [ ] Implement `attachTo` mechanism for tool routing
- [ ] Research and select Prometheus MCP server to bundle
- [ ] Bundle Prometheus MCP server in Helm chart
- [ ] Update remediation to use tools from attached MCP servers
- [ ] Integration tests for Prometheus + remediate flow

**Success Criteria**:
- Prometheus MCP server deploys via Helm when enabled
- Remediation uses Prometheus tools for metrics-based analysis
- AI correlates kubectl data with Prometheus metrics
- End-to-end test passes

### Milestone 2: Operate Tool Integration

**Goal**: Extend MCP server integration to operate tool

**Tasks**:
- [ ] Discussion: Which MCP server is a good candidate for operate?
- [ ] Add selected MCP server as bundled or test-only (customMcpServers)
- [ ] Update operate tool to use attached MCP server tools
- [ ] Integration tests for operate + MCP server

**Success Criteria**:
- Operate tool can use tools from attached MCP servers
- Integration test validates the flow

### Milestone 3: Query Tool Integration

**Goal**: Extend MCP server integration to query tool

**Tasks**:
- [ ] Discussion: Which MCP server is a good candidate for query?
- [ ] Add selected MCP server as bundled or test-only (customMcpServers)
- [ ] Update query tool to use attached MCP server tools
- [ ] Integration tests for query + MCP server

**Success Criteria**:
- Query tool can use tools from attached MCP servers
- Integration test validates the flow

### Milestone 4: Documentation

**Goal**: Complete user documentation for MCP server integration

**Tasks**:
- [ ] Setup guide for bundled MCP servers
- [ ] Setup guide for custom MCP servers
- [ ] Configuration reference for `mcpServers` and `customMcpServers`
- [ ] Troubleshooting guide
- [ ] "Request new bundled MCP server" process in docs

**Success Criteria**:
- Users can set up both bundled and custom MCP servers from docs
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
// Pseudocode for tool collection
function getToolsForOperation(operation: 'remediate' | 'operate' | 'query') {
  const tools = [];

  // Add plugin tools (kubectl, helm, etc.)
  tools.push(...pluginManager.getDiscoveredTools());

  // Add MCP server tools where attachTo includes this operation
  for (const mcpServer of connectedMcpServers) {
    if (mcpServer.attachTo.includes(operation)) {
      tools.push(...mcpServer.tools);
    }
  }

  return tools;
}
```

### Helm Chart Changes

New templates needed:
- MCP server Deployment + Service for each bundled server
- ConfigMap for MCP server configuration
- Update dot-ai ConfigMap with MCP server connection info

### Failure Handling

- MCP server unavailable at startup: Log warning, continue without those tools
- MCP server becomes unavailable: Graceful degradation, tools marked unavailable
- Tool execution fails: Return error to AI, let it try alternative approach

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
