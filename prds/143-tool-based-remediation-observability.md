# PRD: Tool-Based Remediation with Observability Data Sources

**Created**: 2025-10-06
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2025-10-06
**GitHub Issue**: [#143](https://github.com/vfarcic/dot-ai/issues/143)
**Priority**: High
**Complexity**: High

---

## Executive Summary

Migrate the remediation tool from JSON-based kubectl command patterns to SDK tool-based architecture (`toolLoop()`), then extend it with observability data source tools (Prometheus, DataDog, etc.) to enable comprehensive issue analysis across Kubernetes events, metrics, logs, and custom data sources.

---

## Problem Statement

### Current Limitations

**1. JSON-Based Architecture**
- Remediation uses JSON `dataRequests` pattern that AI returns, then we parse and execute
- Manual loop management (400+ lines of iteration logic)
- Rigid pattern that's hard to extend with new data sources
- Cannot leverage SDK's native tool-calling capabilities

**2. Limited Data Sources**
- Only has access to Kubernetes API data (kubectl commands)
- No access to metrics (CPU, memory, custom metrics)
- No access to observability platforms (Prometheus, DataDog, Grafana)
- Cannot correlate cluster state with performance/resource metrics

**3. Incomplete Root Cause Analysis**
- AI identifies "high memory usage" but cannot see actual metrics
- Detects pod restarts but cannot analyze resource saturation trends
- Recommends scaling but lacks utilization data to validate
- Missing context for performance degradation issues

### Impact

Users must:
- Manually check Prometheus/DataDog after AI analysis
- Correlate metrics with kubernetes events themselves
- Make scaling/remediation decisions without complete picture
- Run multiple tools to get full understanding

---

## Solution Overview

**Two-Phase Approach:**

### Phase 1: Migrate to Tool-Based Architecture
Convert existing remediation from JSON-based loops to SDK tool-based pattern:
- Implement kubectl tools: `kubectl_get`, `kubectl_describe`, `kubectl_logs`, `kubectl_events`, `kubectl_top`
- Use `AIProvider.toolLoop()` method (already implemented in PRD #136 for both Anthropic and Vercel)
- Remove manual JSON parsing and loop management
- Validate tool architecture works for remediation use case

### Phase 2: Add Observability Data Sources
Extend with new tools for metrics and observability:
- Prometheus tools: `prometheus_query`, `prometheus_range_query`, `prometheus_labels`
- DataDog tools: `datadog_metrics`, `datadog_logs`, `datadog_events`
- Configurable at server level (enable/disable per data source)
- AI dynamically selects tools based on issue type

---

## User Journey

### Before (Current State)
```
1. User reports: "My pods keep restarting"
2. AI investigates using kubectl only
3. AI finds: "Pods restarting due to OOMKilled"
4. AI recommends: "Increase memory limit"
5. User manually checks Prometheus to see actual memory usage
6. User correlates data and implements fix
```

### After (Phase 1: Tool-Based)
```
1. User reports: "My pods keep restarting"
2. AI calls kubectl_get, kubectl_describe, kubectl_events tools
3. AI finds: "Pods restarting due to OOMKilled"
4. AI recommends: "Increase memory limit"
5. User manually checks Prometheus to see actual memory usage
6. User correlates data and implements fix

(Same outcome, cleaner architecture)
```

### After (Phase 2: Observability Integration)
```
1. User reports: "My pods keep restarting"
2. AI calls kubectl_describe tool → sees OOMKilled events
3. AI calls prometheus_range_query tool → sees memory usage at 95% consistently
4. AI calls prometheus_query tool → sees memory requests set to 128Mi
5. AI analyzes: "Memory usage peaks at 450Mi, limit is 512Mi, but requests too low causing scheduling issues"
6. AI recommends: "Set memory request=256Mi, limit=512Mi based on actual usage patterns"
7. User applies fix with complete confidence

(Complete analysis with metrics-driven recommendations)
```

---

## Technical Approach

### Phase 1: Tool Migration Architecture

**Current Flow (JSON-Based)**:
```typescript
// AI returns JSON
const response = {
  dataRequests: [
    { type: "get", resource: "pods", namespace: "default" }
  ],
  investigationComplete: false
};

// We parse and execute
for (const request of response.dataRequests) {
  const output = await executeKubectl([request.type, request.resource]);
  gatheredData.push(output);
}
```

**New Flow (Tool-Based)**:
```typescript
// Define tools
const tools = [
  {
    name: "kubectl_get",
    description: "Get Kubernetes resources",
    input_schema: {
      type: "object",
      properties: {
        resource: { type: "string", description: "Resource type (pods, services, etc)" },
        namespace: { type: "string", description: "Namespace" }
      }
    }
  }
];

// AI calls tools directly via SDK
const result = await aiProvider.toolLoop({
  systemPrompt: investigationPrompt,
  tools: tools,
  toolImplementations: {
    kubectl_get: async (args) => await executeKubectl(['get', args.resource, '-n', args.namespace])
  }
});
```

### Phase 2: Observability Tools

**Configuration (Server Level)**:
```typescript
// Server config
{
  "observability": {
    "prometheus": {
      "enabled": true,
      "endpoint": "http://prometheus:9090"
    },
    "datadog": {
      "enabled": false,
      "apiKey": "...",
      "appKey": "..."
    }
  }
}
```

**Tool Definitions**:
```typescript
const observabilityTools = [
  {
    name: "prometheus_query",
    description: "Query Prometheus metrics (instant query)",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "PromQL query" },
        time: { type: "string", description: "Evaluation timestamp (optional)" }
      },
      required: ["query"]
    }
  },
  {
    name: "prometheus_range_query",
    description: "Query Prometheus metrics over time range",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "PromQL query" },
        start: { type: "string", description: "Start time" },
        end: { type: "string", description: "End time" },
        step: { type: "string", description: "Query resolution step" }
      },
      required: ["query", "start", "end"]
    }
  }
];
```

**Tool Implementations**:
```typescript
const toolImplementations = {
  prometheus_query: async (args) => {
    const config = getServerConfig();
    if (!config.observability.prometheus.enabled) {
      return { error: "Prometheus not configured" };
    }

    const url = `${config.observability.prometheus.endpoint}/api/v1/query`;
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ query: args.query, time: args.time })
    });
    return await response.json();
  },

  prometheus_range_query: async (args) => {
    // Similar implementation for range queries
  }
};
```

---

## Success Criteria

### Phase 1: Tool Migration
- [ ] Remediation uses `toolLoop()` instead of JSON-based loops
- [ ] All existing kubectl operations work as tools
- [ ] Investigation quality unchanged or improved
- [ ] Code is simpler (remove 400+ lines of manual loop logic)
- [ ] All integration tests passing

### Phase 2: Observability Integration
- [ ] Prometheus tools functional and returning correct metrics
- [ ] AI successfully correlates Kubernetes events with metrics
- [ ] Remediation recommendations include metrics-based justification
- [ ] User can enable/disable data sources via server config
- [ ] At least 80% of performance issues include metrics analysis

---

## Milestones

### Milestone 1: Validate Tool Infrastructure & Design kubectl Tools (Phase 1 Start)
**Goal**: Verify existing toolLoop() implementation and design kubectl tool architecture

**Infrastructure Validation**:
- [ ] Verify `AIProvider.toolLoop()` exists and is functional (from PRD #136)
- [ ] Verify AnthropicProvider implements toolLoop() correctly
- [ ] Verify VercelProvider implements toolLoop() correctly
- [ ] Test both providers with simple tool to confirm they work
- [ ] Document any limitations or differences between providers

**Tool Design**:
- [ ] Design kubectl tool schema (granularity, parameters, error handling)
- [ ] Create tool definition format/template
- [ ] Design tool registration system for remediation
- [ ] Plan tool implementation architecture

**First Implementation**:
- [ ] Implement first kubectl tool (kubectl_get) with both Anthropic and Vercel
- [ ] Create test to validate tool works with remediate workflow
- [ ] Confirm tool architecture is sound before building all tools

### Milestone 2: Complete kubectl Tool Migration (Phase 1 Complete)
**Goal**: All existing kubectl operations converted to tools
- [ ] All kubectl tools implemented: get, describe, logs, events, top, explain
- [ ] Tool implementations work with both Anthropic and Vercel providers
- [ ] Remediation investigation loop uses toolLoop()
- [ ] Remove old JSON-based loop code
- [ ] All integration tests updated and passing
- [ ] Performance equivalent or better than JSON-based approach

### Milestone 3: Observability Configuration System (Phase 2 Start)
**Goal**: Server-level configuration for data sources
- [ ] Server config schema for observability providers
- [ ] Configuration validation and loading
- [ ] Runtime tool enablement based on config
- [ ] Health check for configured endpoints

### Milestone 4: Prometheus Integration (Phase 2)
**Goal**: AI can query Prometheus metrics
- [ ] Prometheus tool definitions (query, range_query, labels)
- [ ] Prometheus client implementation
- [ ] PromQL query validation
- [ ] Error handling for unreachable Prometheus
- [ ] Integration tests with mock Prometheus
- [ ] Works with both Anthropic and Vercel providers

### Milestone 5: DataDog Integration (Phase 2)
**Goal**: AI can query DataDog metrics and logs
- [ ] DataDog tool definitions
- [ ] DataDog API client integration
- [ ] Authentication handling
- [ ] Rate limiting and error handling
- [ ] Integration tests with mock DataDog API
- [ ] Works with both Anthropic and Vercel providers

### Milestone 6: AI Correlation & Analysis (Phase 2 Complete)
**Goal**: AI intelligently uses multiple data sources
- [ ] Investigation prompt updated for multi-source analysis
- [ ] AI selects appropriate tools based on issue type
- [ ] Remediation recommendations include metrics evidence
- [ ] Validation that metrics improve root cause accuracy
- [ ] Documentation for users on enabling observability sources

---

## Dependencies

### External Dependencies
- [x] `toolLoop()` method already implemented (PRD #136)
- [x] AnthropicProvider toolLoop() implementation (PRD #136)
- [x] VercelProvider toolLoop() implementation (PRD #136)
- [ ] Access to Prometheus endpoint (for testing Phase 2)
- [ ] Access to DataDog API (for testing Phase 2)

### Internal Dependencies
- [x] AIProvider interface with tool support (PRD #136)
- [x] Existing remediation investigation logic (to migrate)
- [ ] Server configuration system for observability settings

### Potential Blockers
- Prometheus/DataDog API rate limits or authentication issues
- Tool performance overhead (monitor token usage)
- Backward compatibility if migration affects existing users
- Provider-specific tool behavior differences

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Tool overhead increases tokens significantly | High | Monitor metrics, use Phase 1 to validate, fallback to JSON if needed |
| Breaking changes to existing remediation behavior | High | Comprehensive integration tests, phased rollout, feature flag |
| Prometheus/DataDog API failures impact remediation | Medium | Graceful degradation - continue with kubectl if observability unavailable |
| PromQL query injection vulnerabilities | High | Query validation, parameter binding, sandboxing |
| Configuration complexity overwhelms users | Medium | Sensible defaults, auto-detection, clear documentation |
| Provider differences in tool handling | Medium | Abstract tool layer, test with both providers, document differences |

---

## Open Questions

1. **Tool Granularity**: Should we have one `kubectl` tool with operation parameter, or separate tools per operation?
2. **Error Handling**: How should AI handle tool failures (unreachable Prometheus, invalid queries)?
3. **Query Limits**: Should we limit PromQL query complexity or time ranges?
4. **Auto-Detection**: Should server auto-detect Prometheus/DataDog and enable tools automatically?
5. **Tool Selection**: How does AI decide when to use metrics vs. just kubectl? Update investigation prompt?
6. **Backward Compatibility**: Do we need to support JSON-based approach during migration?
7. **Provider Parity**: Do we need identical tool behavior across Anthropic and Vercel, or can they differ?

---

## Out of Scope

### Deferred to Future PRDs
- [ ] Additional observability platforms (Grafana, New Relic, Splunk)
- [ ] Custom metrics endpoints beyond Prometheus/DataDog
- [ ] Alerting integration (create alerts based on remediation findings)
- [ ] Cost optimization metrics (AWS Cost Explorer, GCP Billing)
- [ ] APM integration (distributed tracing, span analysis)

---

## Work Log

### 2025-10-06: PRD Creation
**Duration**: Initial planning session
**Status**: Draft

**PRD Scope Defined**:
- Two-phase approach: Tool migration (Phase 1) + Observability integration (Phase 2)
- Configuration at server level (not per-call)
- Focus on Prometheus and DataDog as initial providers
- Built on existing toolLoop() from PRD #136
- Must support both Anthropic and Vercel AI SDK providers

**Next Steps**: Begin Phase 1 implementation - validate existing tool infrastructure and design kubectl tools
