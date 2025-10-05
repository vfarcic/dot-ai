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
**CRITICAL**: This is a complete architectural replacement, not incremental changes. The SDK's `toolLoop()` replaces the entire 400+ line manual investigation loop:
- **SDK manages conversation history** (replaces `{previousIterations}` injection)
- **SDK manages iterations** (replaces manual while loop in `conductInvestigation()`)
- **SDK handles tool execution** (replaces JSON parsing of `dataRequests`)
- **SDK determines completion** (replaces `investigationComplete` boolean field)

Implementation:
- Implement kubectl tools: `kubectl_get`, `kubectl_describe`, `kubectl_logs`, `kubectl_events`, `kubectl_top`
- Use `AIProvider.toolLoop()` method (already implemented in PRD #136 for Anthropic)
- Remove manual JSON parsing and loop management (~400 lines)
- Remove JSON response format from investigation prompt
- Focus on Anthropic provider first, Vercel support later
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

**Current Flow (JSON-Based - ~400 lines)**:
```typescript
// Manual iteration loop in conductInvestigation()
while (currentIteration <= maxIterations && !session.investigationComplete) {
  // Inject cumulative previousIterations (grows with each iteration)
  const previousIterationsJson = JSON.stringify(
    session.iterations.map(iter => ({
      step: iter.step,
      analysis: iter.aiAnalysis,
      dataRequests: iter.dataRequests,
      gatheredData: iter.gatheredData
    })), null, 2
  );

  // Inject clusterApiResources (415+ resources)
  const clusterApiResources = await executeKubectl(['api-resources']);

  // Replace template variables
  const investigationPrompt = promptTemplate
    .replace('{previousIterations}', previousIterationsJson)
    .replace('{clusterApiResources}', clusterApiResources)
    .replace('{currentIteration}', currentIteration.toString());

  // AI responds with JSON specifying what data it needs
  const aiResponse = await aiProvider.sendMessage(investigationPrompt);
  const parsedResponse = JSON.parse(aiResponse.content);

  // Manually execute each data request
  for (const request of parsedResponse.dataRequests) {
    const output = await executeKubectl([request.type, request.resource]);
    gatheredData.push(output);
  }

  // Check if AI set investigationComplete flag
  if (parsedResponse.investigationComplete) {
    session.investigationComplete = true;
    break;
  }

  currentIteration++;
}
```

**New Flow (Tool-Based - ~50 lines)**:
```typescript
// Define tools once
const tools = [
  {
    name: "kubectl_get",
    description: "Get Kubernetes resources",
    inputSchema: {
      type: "object",
      properties: {
        resource: { type: "string", description: "Resource type (pods, services, etc)" },
        namespace: { type: "string", description: "Namespace" }
      }
    }
  },
  {
    name: "get_cluster_resources",
    description: "Get list of all available Kubernetes API resources in cluster",
    inputSchema: { type: "object", properties: {} }
  }
];

// SDK handles EVERYTHING - iterations, history, completion
const result = await aiProvider.toolLoop({
  systemPrompt: investigationPrompt, // No {previousIterations} or {currentIteration} needed!
  tools: tools,
  toolImplementations: {
    kubectl_get: async (args) => await executeKubectl(['get', args.resource, '-n', args.namespace]),
    get_cluster_resources: async () => await executeKubectl(['api-resources'])
  },
  maxIterations: 20
});

// result.finalMessage contains the analysis
// result.allToolCalls contains complete history
```

**Key Simplifications**:
- No manual loop management
- No `{previousIterations}` injection (SDK maintains conversation history)
- No JSON parsing of AI responses
- No `investigationComplete` flag (SDK stops when AI stops calling tools)
- No cumulative data structure management
- Prompt simplified by ~40 lines (remove JSON schema documentation)

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

### Milestone 1: Validate Anthropic toolLoop() & Design kubectl Tools (Phase 1 Start)
**Goal**: Verify AnthropicProvider toolLoop() works and design kubectl tool architecture

**Infrastructure Validation (Anthropic Only)**:
- [ ] Verify `AIProvider.toolLoop()` interface exists (from PRD #136) ✅
- [ ] Verify AnthropicProvider implements toolLoop() correctly ✅ (verified in src/core/providers/anthropic-provider.ts:134-256)
- [ ] Test AnthropicProvider with simple tool to confirm functionality
- [ ] Document any limitations discovered during testing

**Note**: VercelProvider toolLoop() is NOT implemented (intentionally - see vercel-provider.ts:157-163). Vercel support will be added later in Phase 1.

**Tool Design**:
- [ ] Design kubectl tool schema (granularity, parameters, error handling)
- [ ] Create tool definition format matching Anthropic.Tool interface
- [ ] Design tool registration system for remediation
- [ ] Plan tool implementation architecture

**First Implementation**:
- [ ] Implement `get_cluster_resources` tool (replaces `{clusterApiResources}` injection)
- [ ] Test with existing remediation integration tests
- [ ] Confirm tool architecture is sound before building all kubectl tools

### Milestone 2: Complete kubectl Tool Migration (Phase 1 - Anthropic)
**Goal**: Replace entire manual investigation loop with toolLoop()
- [ ] All kubectl tools implemented: `kubectl_get`, `kubectl_describe`, `kubectl_logs`, `kubectl_events`, `kubectl_top`, `kubectl_explain`
- [ ] `get_cluster_resources` tool implemented (replaces `{clusterApiResources}`)
- [ ] Replace `conductInvestigation()` with single `toolLoop()` call
- [ ] Update `prompts/remediate-investigation.md`:
  - Remove `{previousIterations}` template variable
  - Remove `{currentIteration}` template variable
  - Remove JSON response format (lines 36-55)
  - Remove "Investigation Workflow Example" JSON schemas (lines 138-179)
  - Simplify to tool-calling instructions only
- [ ] Remove old JSON-based loop code (~400 lines in remediate.ts)
- [ ] All integration tests passing
- [ ] Performance equivalent or better than JSON-based approach

### Milestone 2.5: Add Vercel Provider Support (Phase 1 Complete)
**Goal**: Implement toolLoop() for VercelProvider
- [ ] Implement `VercelProvider.toolLoop()` using Vercel AI SDK tool APIs
- [ ] Implement `VercelProvider.sendMessageWithTools()`
- [ ] Test all kubectl tools work with Vercel provider
- [ ] Update integration tests to validate both providers
- [ ] Document any provider-specific differences

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
- [x] `toolLoop()` interface defined in AIProvider (PRD #136)
- [x] AnthropicProvider toolLoop() implementation (PRD #136) ✅ Verified in src/core/providers/anthropic-provider.ts:134-256
- [ ] VercelProvider toolLoop() implementation ❌ NOT implemented yet (see vercel-provider.ts:157-163) - deferred to Milestone 2.5
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

1. ~~**Tool Granularity**: Should we have one `kubectl` tool with operation parameter, or separate tools per operation?~~ **RESOLVED (2025-10-06)**: Separate tools per operation for better AI understanding and targeted descriptions.

2. **Error Handling**: How should AI handle tool failures (unreachable Prometheus, invalid queries)?

3. **Query Limits**: Should we limit PromQL query complexity or time ranges?

4. **Auto-Detection**: Should server auto-detect Prometheus/DataDog and enable tools automatically?

5. ~~**Tool Selection**: How does AI decide when to use metrics vs. just kubectl? Update investigation prompt?~~ **RESOLVED (2025-10-06)**: AI naturally selects tools based on descriptions. No special prompt logic needed - just provide tools and let SDK handle selection.

6. ~~**Backward Compatibility**: Do we need to support JSON-based approach during migration?~~ **RESOLVED (2025-10-06)**: No backward compatibility needed. Complete replacement is cleaner and simpler. Use feature flag if rollback needed.

7. ~~**Provider Parity**: Do we need identical tool behavior across Anthropic and Vercel, or can they differ?~~ **RESOLVED (2025-10-06)**: Focus Anthropic first (Milestone 1-2), add Vercel support after core migration validated (Milestone 2.5). Tool behavior should be identical, but implementation timing differs.

---

## Out of Scope

### Deferred to Future PRDs
- [ ] Additional observability platforms (Grafana, New Relic, Splunk)
- [ ] Custom metrics endpoints beyond Prometheus/DataDog
- [ ] Alerting integration (create alerts based on remediation findings)
- [ ] Cost optimization metrics (AWS Cost Explorer, GCP Billing)
- [ ] APM integration (distributed tracing, span analysis)

---

## Decision Log

### Decision 1: toolLoop() is Complete Replacement, Not Incremental Migration
**Date**: 2025-10-06
**Decision**: The SDK's `toolLoop()` replaces the ENTIRE 400+ line manual investigation loop, not just individual data injections.

**Context**: Initially considered migrating data injections (`{previousIterations}`, `{clusterApiResources}`) one at a time while keeping manual loop. During design discussion, realized SDK manages all aspects of the loop.

**What SDK Replaces**:
- **Conversation history management** → Replaces `{previousIterations}` injection and cumulative data structures
- **Iteration management** → Replaces manual while loop in `conductInvestigation()`
- **Tool execution** → Replaces JSON parsing of `dataRequests` array
- **Completion detection** → Replaces `investigationComplete` boolean field

**Impact**:
- Much larger code simplification (~400 lines removed vs. ~50 lines added)
- Prompt simplification (~40 lines of JSON schema documentation removed)
- Entire investigation becomes single `toolLoop()` call
- No need for incremental migration - complete architectural shift

**Alternatives Considered**:
- Incremental migration: Keep manual loop, replace data injections with tools → Rejected as it adds complexity without full benefits
- Hybrid approach: Use toolLoop() for some operations, JSON for others → Rejected as inconsistent and harder to maintain

**Files Affected**:
- `src/tools/remediate.ts` - Replace `conductInvestigation()` entirely
- `prompts/remediate-investigation.md` - Remove JSON response format, template variables

---

### Decision 2: Focus on Anthropic Provider First, Vercel Later
**Date**: 2025-10-06
**Decision**: Implement and validate with AnthropicProvider only in Phase 1 Milestones 1-2. Add VercelProvider support in Milestone 2.5 after core architecture validated.

**Context**: Initial PRD assumed both providers would be implemented simultaneously. During design discussion, identified that VercelProvider toolLoop() is not yet implemented.

**Rationale**:
- Reduce complexity and risk during architectural migration
- Validate tool-based approach works before multi-provider support
- AnthropicProvider toolLoop() already fully implemented (verified in code review)
- VercelProvider requires new implementation work
- Existing remediation tests can validate Anthropic-only approach first

**Impact**:
- Milestone 1 simplified - only validate Anthropic
- Milestone 2 focuses on core migration with one provider
- New Milestone 2.5 added for Vercel support
- Phase 1 timeline extended slightly but risk reduced

**Alternatives Considered**:
- Implement both simultaneously → Rejected as higher risk, more complex debugging
- Skip Vercel entirely → Rejected as violates multi-provider architecture goals
- Implement Vercel first → Rejected as Anthropic already has working implementation

**Files Affected**:
- PRD Milestone 1: Updated to Anthropic-only validation
- PRD Milestone 2.5: New milestone for Vercel implementation
- `src/core/providers/vercel-provider.ts` - Will need toolLoop() implementation

---

### Decision 3: Remove JSON Response Format Entirely from Investigation Prompt
**Date**: 2025-10-06
**Decision**: Eliminate all JSON response format requirements from `prompts/remediate-investigation.md` including `dataRequests` array and `investigationComplete` field.

**Context**: Current prompt (lines 36-55) specifies AI must return JSON with `dataRequests` array and `investigationComplete` boolean. With toolLoop(), SDK handles this natively.

**Rationale**:
- SDK's tool calling replaces JSON `dataRequests` pattern
- SDK determines completion automatically (AI stops calling tools)
- Prompt can focus on investigation guidance, not response format
- Reduces prompt complexity and token usage
- Eliminates potential for JSON parsing errors

**What Gets Removed**:
- Lines 36-55: JSON response format specification
- Lines 138-179: "Investigation Workflow Example" JSON schemas
- Field definitions for `dataRequests`, `investigationComplete`, etc.

**What Remains**:
- Investigation approach guidance
- Data request precision guidelines
- Root cause analysis criteria
- Tool usage instructions (added)

**Impact**:
- Prompt simplified by ~40 lines
- Clearer focus on investigation strategy vs. technical format
- Better token efficiency
- More maintainable prompt

**Alternatives Considered**:
- Keep JSON format as "backup" → Rejected as confusing and contradictory
- Gradual migration of prompt → Rejected as incomplete migration adds complexity

**Files Affected**:
- `prompts/remediate-investigation.md` - Major simplification

---

### Decision 4: Separate Tools Per Operation (Not Single kubectl Tool)
**Date**: 2025-10-06
**Decision**: Implement separate tools for each kubectl operation (`kubectl_get`, `kubectl_describe`, etc.) rather than one `kubectl` tool with operation parameter.

**Rationale**:
- **Better AI understanding**: Each tool has focused, specific description
- **Targeted documentation**: Tool descriptions can explain exactly what data each provides
- **Easier debugging**: Clear separation of tool calls in logs
- **Better error handling**: Operation-specific error messages and validation
- **SDK best practices**: AI SDKs work better with granular, focused tools

**Example**:
```typescript
// ✅ GOOD - Separate tools
{ name: "kubectl_get", description: "List Kubernetes resources with status" }
{ name: "kubectl_describe", description: "Get detailed resource configuration and events" }
{ name: "kubectl_logs", description: "Fetch container logs for debugging" }

// ❌ BAD - Single tool with operation parameter
{
  name: "kubectl",
  description: "Execute kubectl commands",
  parameters: { operation: "get|describe|logs|...", ... }
}
```

**Impact**:
- More tool definitions (5-7 tools vs. 1)
- Clearer tool purposes and better AI selection
- Easier to add operation-specific validation

**Alternatives Considered**:
- Single kubectl tool → Rejected as too generic, harder for AI to understand when to use
- Group by resource type → Rejected as kubectl operations are more natural grouping

**Files Affected**:
- `src/tools/remediate.ts` - Tool definitions

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

---

### 2025-10-06: Architectural Design Decisions (PRD Updated)
**Duration**: Design discussion and PRD refinement
**Status**: Ready for Implementation (Milestone 1)

**Major Decisions Documented** (see Decision Log):
1. toolLoop() is complete replacement - not incremental migration (~400 lines removed)
2. Focus Anthropic first, Vercel support in Milestone 2.5
3. Remove JSON response format entirely from investigation prompt
4. Separate tools per kubectl operation (not single kubectl tool)

**PRD Updates**:
- Solution Overview: Added clarity on complete architectural replacement
- Technical Approach: Expanded code examples showing before/after (~400 lines → ~50 lines)
- Milestone 1: Updated to Anthropic-only validation, verified existing implementation
- Milestone 2: Clarified scope - replace entire loop, update prompts
- Milestone 2.5: New milestone for Vercel provider support
- Open Questions: Resolved 4 of 7 questions
- Dependencies: Corrected VercelProvider status (not yet implemented)
- Decision Log: Added comprehensive documentation of 4 major decisions with rationale

**Key Insights from Design Discussion**:
- SDK's toolLoop() manages conversation history → no need for `{previousIterations}` injection
- SDK manages iterations → no need for manual while loop or `{currentIteration}`
- SDK handles tool execution → no need for JSON parsing of `dataRequests`
- SDK determines completion → no need for `investigationComplete` boolean
- Result: Much simpler architecture than originally planned

**Verification Completed**:
- AnthropicProvider toolLoop() implementation confirmed (src/core/providers/anthropic-provider.ts:134-256)
- VercelProvider toolLoop() NOT implemented (vercel-provider.ts:157-163) - documented as blocker
- Existing remediation workflow analyzed (remediate.ts) - 400+ lines to be replaced
- Investigation prompt analyzed (remediate-investigation.md) - ~40 lines to be removed

**Next Steps**: Begin Milestone 1 implementation - Test AnthropicProvider toolLoop() with simple tool, design kubectl tool architecture
