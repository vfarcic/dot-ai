# PRD: Remediation Observability Integration

**Created**: 2025-10-06
**Status**: Superseded
**Owner**: Viktor Farcic
**Last Updated**: 2026-01-30
**Closed**: 2026-01-30
**GitHub Issue**: [#150](https://github.com/vfarcic/dot-ai/issues/150)
**Priority**: Medium
**Complexity**: High
**Related PRDs**: [#143 - Tool-Based Remediation (Phase 1)](https://github.com/vfarcic/dot-ai/blob/main/prds/143-tool-based-remediation-observability.md)

---

## Executive Summary

Extend the remediation tool with observability data source tools (metrics, traces, alerts) to enable comprehensive issue analysis beyond kubectl-based investigation. This builds on the tool-based architecture established in PRD #143 Phase 1.

---

## Problem Statement

### Current Limitations

The remediation tool successfully uses kubectl-based tools for cluster state investigation but lacks access to:
- **Historical metrics** (CPU/memory trends over time)
- **Performance data** (latency, throughput, error rates)
- **Observability platforms** (monitoring alerts, trace data)
- **Custom metrics** (application-specific measurements)

### Real-World Impact

**Example Scenario**: Pod crashes with OOMKilled
- **Current behavior**: AI sees "OOMKilled" event, recommends increasing memory limit
- **Missing context**:
  - Actual memory usage patterns over last hour
  - Whether memory was growing steadily or spiked suddenly
  - Memory utilization across all replicas
  - Any correlated alerts or incidents

**Result**: User must manually:
- Check Prometheus/DataDog/Grafana after AI analysis
- Correlate metrics with Kubernetes events
- Make remediation decisions without complete picture
- Run multiple tools to get full understanding

---

## Solution Overview

Extend remediation investigation with observability tools following the architecture pattern established for kubectl tools in PRD #143.

### Design Principles

1. **Reuse existing architecture**: Follow the pattern from `src/core/kubectl-tools.ts`:
   - Tool definitions using `AITool` interface
   - Tool executor function with switch statement
   - Tool collection array for passing to `toolLoop()`

2. **User-configurable**: Let users choose which observability tools to enable via server configuration

3. **AI-driven selection**: AI autonomously decides when to use observability vs kubectl based on issue type

4. **Provider-agnostic**: Works with both Anthropic and Vercel AI SDK providers

### Tools to Be Determined

During implementation, we'll research and select which observability tools to integrate. Candidates include:
- **Metrics platforms**: Prometheus, DataDog, Grafana, New Relic
- **Tracing systems**: Jaeger, Tempo, OpenTelemetry
- **Log aggregation**: Loki, Elasticsearch, Splunk
- **Alert systems**: Alertmanager, PagerDuty

The specific tools and their priority will be decided based on:
- User demand and common use cases
- Integration complexity
- API availability and stability
- Maintenance burden

---

## User Journey

### Before (Kubectl-Only)
```
1. User: "My pods keep restarting"
2. AI calls kubectl tools → sees OOMKilled events
3. AI: "Pods restarting due to OOMKilled - increase memory limit"
4. User manually checks Prometheus for actual memory usage
5. User discovers memory spikes to 450Mi, limit is 512Mi
6. User implements fix based on combined data
```

### After (With Observability Integration)
```
1. User: "My pods keep restarting"
2. AI calls kubectl_describe → sees OOMKilled events
3. AI calls observability tool → sees memory peaks at 450Mi consistently
4. AI calls observability tool → sees memory request set to 128Mi
5. AI analyzes: "Memory peaks at 450Mi, limit is 512Mi, but requests too low"
6. AI: "Set memory request=256Mi, limit=512Mi based on actual usage"
7. User applies fix with complete confidence

(Complete analysis without manual correlation)
```

---

## Technical Approach

### Architecture Pattern (Already Established)

From PRD #143, we have this proven pattern:

**Tool Definition**:
```typescript
// src/core/kubectl-tools.ts
export const KUBECTL_GET_TOOL: AITool = {
  name: 'kubectl_get',
  description: 'Get Kubernetes resources...',
  inputSchema: {
    type: 'object',
    properties: { ... },
    required: ['resource']
  }
};
```

**Tool Executor**:
```typescript
export async function executeKubectlTools(toolName: string, input: any) {
  switch (toolName) {
    case 'kubectl_get':
      // Execute and return result
      return { success: true, data: output };
    default:
      return { success: false, error: 'Unknown tool' };
  }
}
```

**Tool Collection**:
```typescript
export const KUBECTL_INVESTIGATION_TOOLS: AITool[] = [
  KUBECTL_GET_TOOL,
  KUBECTL_DESCRIBE_TOOL,
  // ... more tools
];
```

**Integration with Remediation**:
```typescript
// src/tools/remediate.ts
import { KUBECTL_INVESTIGATION_TOOLS, executeKubectlTools } from '../core/kubectl-tools';

// Use in toolLoop()
const result = await aiProvider.toolLoop({
  systemPrompt,
  tools: KUBECTL_INVESTIGATION_TOOLS,
  executeFunction: executeKubectlTools
});
```

### Observability Tools (To Be Designed)

Following the same pattern, we'll create:

```typescript
// src/core/observability-tools.ts (to be created)

export const OBSERVABILITY_TOOL_1: AITool = {
  name: 'tool_name_tbd',
  description: 'Query observability data...',
  inputSchema: { /* TBD during implementation */ }
};

export async function executeObservabilityTools(toolName: string, input: any) {
  switch (toolName) {
    case 'tool_name_tbd':
      // Implementation TBD
      return { success: true, data: result };
    default:
      return { success: false, error: 'Unknown tool' };
  }
}

export const OBSERVABILITY_INVESTIGATION_TOOLS: AITool[] = [
  // Tools TBD during implementation
];
```

### Configuration System

Server-level configuration for enabling/disabling observability tools:

```typescript
// Environment variables (example pattern)
OBSERVABILITY_ENABLED=true
OBSERVABILITY_PROVIDER_1_ENABLED=true
OBSERVABILITY_PROVIDER_1_URL=https://...
OBSERVABILITY_PROVIDER_1_API_KEY=xxx

// Runtime tool selection
const investigationTools = [
  ...KUBECTL_INVESTIGATION_TOOLS,
  ...(config.observabilityEnabled ? OBSERVABILITY_INVESTIGATION_TOOLS : [])
];
```

---

## Success Criteria

### Functional Requirements
- [ ] At least one observability tool integrated and functional
- [ ] AI successfully correlates Kubernetes events with observability data
- [ ] Remediation recommendations include metrics-based justification
- [ ] Users can enable/disable observability tools via server configuration
- [ ] Works with both Anthropic and Vercel AI SDK providers

### Quality Requirements
- [ ] Investigation quality improved (metrics-driven recommendations)
- [ ] At least 80% of performance issues include observability analysis
- [ ] Tool execution errors handled gracefully
- [ ] Integration tests validate observability tool functionality

### User Experience
- [ ] Configuration clear and well-documented
- [ ] Error messages helpful when observability endpoints unavailable
- [ ] No degradation when observability tools disabled
- [ ] AI explanations include observability evidence when used

---

## Milestones

### Milestone 1: Tool Selection and Design ⏳
**Goal**: Decide which observability tools to integrate and how

**Tasks**:
- [ ] Research common observability platforms used with Kubernetes
- [ ] Survey user needs and use cases
- [ ] Design tool definitions (name, description, input schema)
- [ ] Define priority order for implementation
- [ ] Document tool selection rationale

**Success Criteria**:
- Clear list of tools to implement with priority order
- Tool interface designs reviewed and approved
- Integration complexity assessed for each tool

### Milestone 2: Configuration System ⏳
**Goal**: Server-level configuration for enabling observability tools

**Tasks**:
- [ ] Design configuration schema for observability providers
- [ ] Implement configuration validation and loading
- [ ] Add runtime tool enablement based on config
- [ ] Health check for configured observability endpoints
- [ ] Environment variable documentation

**Success Criteria**:
- Users can configure observability endpoints via env vars
- Server validates configuration on startup
- Health checks report observability connectivity
- Clear error messages for misconfiguration

### Milestone 3: First Observability Tool Implementation ⏳
**Goal**: Integrate highest-priority observability tool

**Tasks**:
- [ ] Create observability tool definitions file
- [ ] Implement tool executor function
- [ ] Add client library integration
- [ ] Error handling for unreachable endpoints
- [ ] Integration tests with real/mock endpoint
- [ ] Validate works with Anthropic provider
- [ ] Validate works with Vercel provider

**Success Criteria**:
- Tool functional and returning correct data
- Integration tests passing
- AI successfully uses tool in investigations
- Documentation complete

### Milestone 4: AI Correlation Enhancement ⏳
**Goal**: AI intelligently combines kubectl + observability data

**Tasks**:
- [ ] Update investigation prompt for multi-source analysis
- [ ] Test AI tool selection logic (when to use observability)
- [ ] Validate recommendations include observability evidence
- [ ] Measure improvement in root cause accuracy
- [ ] Document AI behavior patterns

**Success Criteria**:
- AI autonomously selects appropriate tools for issue type
- Recommendations reference both kubectl and observability data
- Root cause analysis quality measurably improved
- Performance issues include metrics analysis

### Milestone 5: Additional Tools (If Applicable) ⏳
**Goal**: Add more observability tools based on Milestone 1 priority

**Tasks**:
- [ ] Implement additional tools following established pattern
- [ ] Integration tests for each new tool
- [ ] Documentation updates
- [ ] Configuration examples

**Success Criteria**:
- Each tool follows same architecture pattern
- All integration tests passing
- Users can enable any combination of tools

---

## Dependencies

### External Dependencies
- ✅ `toolLoop()` architecture from PRD #143 Phase 1
- ✅ kubectl tools pattern established and proven
- ⏳ Access to observability endpoints for testing
- ⏳ API keys for observability platforms

### Internal Dependencies
- ✅ AIProvider interface with tool support
- ✅ Remediation investigation framework
- ⏳ Server configuration system for observability settings

### Potential Blockers
- Observability API rate limits
- Authentication complexity for certain platforms
- Network access restrictions to external services
- Cost of observability API calls

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Observability API rate limits | High | Medium | Implement caching, request throttling |
| Unreliable external APIs | Medium | Medium | Graceful fallbacks, timeout handling |
| Increased complexity | Medium | High | Follow established pattern, good docs |
| Authentication challenges | Medium | Medium | Support multiple auth methods |
| Integration maintenance | High | Medium | Start with most stable/popular platforms |

---

## Out of Scope

- **NOT building observability platforms**: We integrate with existing platforms, don't replace them
- **NOT creating custom metrics**: We query existing metrics only
- **NOT modifying observability configurations**: Read-only access to observability data
- **NOT including all possible platforms**: Focus on most common/requested tools

---

## Open Questions

1. **Q**: Which observability tools should we prioritize first?
   **A**: TBD - will research during Milestone 1

2. **Q**: Should configuration be per-MCP-call or server-level?
   **A**: Server-level (decided in PRD #143) - users configure once, applies to all investigations

3. **Q**: How do we handle observability API costs?
   **A**: TBD - may need usage monitoring and rate limiting

4. **Q**: Should we support on-premise vs cloud observability?
   **A**: TBD - depends on selected tools and user requirements

---

## Work Log

### 2025-10-06: PRD Creation (Extracted from PRD #143)
**Status**: Draft
**Context**: PRD #143 Phase 1 complete - tool-based architecture validated

**PRD Scope**:
- Extracted Phase 2 (Observability Integration) from PRD #143 into separate PRD
- Kept tool selection flexible - to be determined during implementation
- Focused on extending proven kubectl tools architecture pattern
- Emphasized user-configurable tool enablement
- Milestones designed for incremental delivery

**Design Decisions**:
- Follow established architecture pattern from `src/core/kubectl-tools.ts`
- Server-level configuration (not per-call)
- AI-driven tool selection (not prescriptive rules)
- Provider-agnostic implementation (Anthropic + Vercel)

**Next Session**: Begin Milestone 1 (Tool Selection and Design)
