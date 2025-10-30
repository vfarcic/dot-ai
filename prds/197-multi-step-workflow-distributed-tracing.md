# PRD: Multi-Step Workflow Distributed Tracing

**Created**: 2025-10-30
**Status**: Draft
**Owner**: Viktor Farcic
**GitHub Issue**: [#197](https://github.com/vfarcic/dot-ai/issues/197)
**Last Updated**: 2025-10-30

## Executive Summary

Enable distributed tracing across multi-step MCP workflows by storing trace context in session files. This allows complete user journeys (spanning multiple MCP calls) to appear as single traces in observability tools like Jaeger, making it possible to debug complex workflows end-to-end.

## Problem Statement

The DevOps AI Toolkit uses session-based workflows where users interact with tools across multiple MCP calls:

**Example: `recommend` workflow**
1. Call 1: `recommend(intent="deploy postgres")` → returns sessionId
2. Call 2: `recommend(sessionId="xyz", stage="chooseSolution")` → user picks solution
3. Call 3: `recommend(sessionId="xyz", stage="deployManifests")` → deployment happens

**Current Gap**: Each MCP call creates a **separate trace** with no connection between them:
- Trace abc123: Call 1 operations
- Trace def456: Call 2 operations
- Trace ghi789: Call 3 operations

**Impact**:
- Cannot see complete user workflow journey in Jaeger
- No visibility into total workflow duration
- Cannot correlate issues across workflow stages
- Difficult to optimize end-to-end performance
- Session-based debugging requires manual log correlation

## Solution Overview

**Store trace context in session files and restore it across MCP calls**

### How It Works

**First MCP Call** (workflow starts):
```typescript
Agent: recommend(intent="deploy postgres")
Server:
  - Creates trace abc123, span 1111
  - Saves session: { sessionId: "xyz", traceContext: { traceId: "abc123", spanId: "1111" } }
  - Returns: { sessionId: "xyz", ... }
```

**Subsequent MCP Calls** (workflow continues):
```typescript
Agent: recommend(sessionId="xyz", stage="chooseSolution")
Server:
  - Loads session, extracts traceId="abc123", spanId="1111"
  - Uses OpenTelemetry API to restore parent trace context
  - Creates new span as child of span 1111 in trace abc123
  - All operations nest under same trace
```

**Result in Jaeger**: Single trace `abc123` showing entire workflow across all MCP calls with proper span hierarchy.

### Key Benefits

✅ **No protocol changes** - Uses existing session mechanism
✅ **Agent-agnostic** - Works automatically when agent passes sessionId
✅ **Proper distributed tracing** - Creates parent-child span relationships
✅ **Session lifecycle = Trace lifecycle** - Natural alignment
✅ **Works for both transports** - HTTP and STDIO both use sessions
✅ **Zero breaking changes** - New sessions get trace context, old code unaffected

## Implementation Requirements

### Core Functionality
- [ ] **Session interface extension**: Add optional `traceContext` field to session types
- [ ] **Trace context capture**: Store traceId and spanId when creating new sessions
- [ ] **Trace context restoration**: Load and apply trace context when resuming sessions
- [ ] **Graceful degradation**: Handle sessions without trace context (create new trace)
- [ ] **All workflow tools covered**: recommend, remediate, manageOrgData, projectSetup, buildPlatform

### OpenTelemetry Integration
- [ ] **Context extraction**: Capture current trace context from active span
- [ ] **Context injection**: Restore trace context as parent for new spans
- [ ] **Span linking**: Ensure proper parent-child relationships across calls
- [ ] **Trace validation**: Verify single trace spans multiple MCP calls

### Success Criteria
- [ ] **Single trace per workflow**: Complete user journey visible in one Jaeger trace
- [ ] **Proper span hierarchy**: Spans from different calls properly nested
- [ ] **Session continuity**: Trace context persists across session save/load
- [ ] **All tools supported**: All 5 session-based tools propagate trace context
- [ ] **Observable in Jaeger**: Can filter by session ID or trace ID to see workflow

## Implementation Milestones

### Milestone 1: Session Interface & Core Infrastructure [Status: ⏳ PENDING]
**Target**: Session system understands trace context

**Completion Criteria:**
- [ ] Session TypeScript interface extended with optional traceContext field
- [ ] Session save/load functions handle trace context serialization
- [ ] Helper functions created for extracting and restoring trace context
- [ ] Unit tests for trace context handling in session lifecycle

**Success Validation:**
- Session files contain trace context when saved
- Trace context properly deserialized when session loaded
- Functions handle missing trace context gracefully

### Milestone 2: Single Tool Integration & Validation [Status: ⏳ PENDING]
**Target**: One tool demonstrates complete distributed tracing across workflow

**Completion Criteria:**
- [ ] `recommend` tool integrated with trace context capture/restore
- [ ] Tested with complete workflow (3+ MCP calls)
- [ ] Jaeger shows single trace spanning all workflow steps
- [ ] Span hierarchy correctly reflects call sequence

**Success Validation:**
- Execute full recommend workflow in test environment
- Verify single trace ID across all steps in Jaeger
- Confirm proper parent-child span relationships
- Measure workflow end-to-end duration

### Milestone 3: All Tools Integration [Status: ⏳ PENDING]
**Target**: All session-based tools support distributed tracing

**Completion Criteria:**
- [ ] `remediate` tool integrated
- [ ] `manageOrgData` tool integrated (patterns, policies, capabilities workflows)
- [ ] `projectSetup` tool integrated
- [ ] `buildPlatform` tool integrated (if session-based)
- [ ] Consistent trace context handling across all tools

**Success Validation:**
- Each tool tested with multi-step workflow
- All tools create single traces per session
- Consistent span naming and attribute patterns

### Milestone 4: Testing & Documentation [Status: ⏳ PENDING]
**Target**: Feature fully tested and documented

**Completion Criteria:**
- [ ] Integration tests for trace context across MCP calls
- [ ] Documentation updated in `docs/observability-guide.md`
- [ ] Example traces documented with screenshots
- [ ] Troubleshooting guide for trace correlation issues

**Success Validation:**
- Integration tests pass for all workflow tools
- Documentation clearly explains session-trace relationship
- Users can follow guide to debug workflows in Jaeger

### Milestone 5: Production Readiness [Status: ⏳ PENDING]
**Target**: Feature deployed and validated in production

**Completion Criteria:**
- [ ] Performance validated (no measurable overhead)
- [ ] Deployed to staging environment
- [ ] Real workflow traces validated in production observability system
- [ ] Team trained on debugging with distributed traces

**Success Validation:**
- No performance regression detected
- Production traces showing complete user journeys
- Support team can use traces for debugging

## Technical Implementation Details

### Session Interface Extension

```typescript
interface Session {
  sessionId: string;
  // ... existing fields ...

  // NEW: Trace context for distributed tracing
  traceContext?: {
    traceId: string;      // Links all spans in workflow
    spanId: string;       // Parent span for subsequent calls
    traceFlags?: number;  // Optional: sampling decision
  };
}
```

### Trace Context Capture (New Session)

```typescript
import { trace, context as otelContext } from '@opentelemetry/api';

function createSession(data: SessionData): Session {
  const span = trace.getActiveSpan();
  const spanContext = span?.spanContext();

  const session: Session = {
    sessionId: generateId(),
    ...data,
    traceContext: spanContext ? {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags
    } : undefined
  };

  saveSession(session);
  return session;
}
```

### Trace Context Restoration (Resume Session)

```typescript
import { trace, context as otelContext, ROOT_CONTEXT } from '@opentelemetry/api';

function resumeSession(sessionId: string): void {
  const session = loadSession(sessionId);

  if (session.traceContext) {
    // Restore trace context as parent
    const spanContext = {
      traceId: session.traceContext.traceId,
      spanId: session.traceContext.spanId,
      traceFlags: session.traceContext.traceFlags || 0,
      isRemote: true
    };

    const ctx = trace.setSpanContext(ROOT_CONTEXT, spanContext);
    otelContext.with(ctx, () => {
      // All spans created here will be children of the restored context
      executeWorkflowStep(session);
    });
  } else {
    // No trace context - create new trace (backward compatibility)
    executeWorkflowStep(session);
  }
}
```

### Implementation Locations

**Files to Modify:**
- `src/interfaces/session.ts` - Session interface extension
- `src/core/session-manager.ts` - Trace context capture/restore logic
- `src/tools/recommend.ts` - Integrate with recommend workflow
- `src/tools/remediate.ts` - Integrate with remediate workflow
- `src/tools/organizational-data.ts` - Integrate with manageOrgData workflows
- `src/tools/project-setup.ts` - Integrate with projectSetup workflow
- `src/tools/build-platform.ts` - Integrate with buildPlatform workflow (if applicable)

**New Files:**
- `src/core/tracing/session-tracing.ts` - Helper functions for trace context handling
- `tests/integration/tracing/multi-step-workflows.test.ts` - Integration tests

## Dependencies & Blockers

### Internal Dependencies
- [x] OpenTelemetry tracing infrastructure (PRD #137) - ✅ Complete (Phase 1 & 2)
- [x] Session management system - ✅ Available
- [x] OTLP exporter configured - ✅ Working
- [x] Jaeger or compatible observability backend - ✅ Tested

### External Dependencies
- None - uses existing OpenTelemetry and session systems

### Current Blockers
- None identified - all prerequisites satisfied

## Risk Management

### Identified Risks

**Risk: Session file format changes break existing sessions**
- **Likelihood**: Low
- **Impact**: Medium
- **Mitigation**: Use optional field (`traceContext?`), graceful degradation for missing context
- **Owner**: Developer

**Risk: Trace context corruption causes tracing failures**
- **Likelihood**: Low
- **Impact**: Low
- **Mitigation**: Validate trace context structure, fall back to new trace on errors
- **Owner**: Developer

**Risk: Performance overhead from trace context storage**
- **Likelihood**: Very Low
- **Impact**: Very Low
- **Mitigation**: Trace context is ~50 bytes, negligible compared to session data
- **Owner**: Developer

**Risk: Confusion when workflows span long time periods**
- **Likelihood**: Medium
- **Impact**: Low
- **Mitigation**: Document expected behavior, traces show timestamp gaps clearly
- **Owner**: Documentation

### Mitigation Actions
- [ ] Comprehensive error handling for trace context operations
- [ ] Integration tests covering edge cases (corrupted context, missing fields)
- [ ] Documentation explaining trace lifecycle and session relationship
- [ ] Performance validation in testing phase

## Testing & Validation

### Test Coverage Requirements
- [ ] Unit tests for session interface and trace context helpers (>90% coverage)
- [ ] Integration tests for each workflow tool with multi-step traces
- [ ] Error handling tests (missing context, corrupted context, invalid format)
- [ ] Performance tests validating no measurable overhead

### User Acceptance Testing
- [ ] Execute complete recommend workflow, verify single trace in Jaeger
- [ ] Execute remediate workflow with multiple iterations, verify trace continuity
- [ ] Execute manageOrgData workflows, verify session-based operations traced
- [ ] Test workflow interruption and resumption (verify trace continuity)
- [ ] Validate trace filtering by session ID and trace ID

### Validation Scenarios

**Scenario 1: Complete Recommend Workflow**
1. Call `recommend(intent="deploy postgres")`
2. Call `recommend(sessionId="xyz", stage="chooseSolution", solutionId="abc")`
3. Call `recommend(sessionId="xyz", stage="deployManifests", solutionId="abc")`
4. Verify: Single trace in Jaeger with 3 top-level tool spans, all nested under same trace

**Scenario 2: Remediate with Multiple Iterations**
1. Call `remediate(issue="pod crashing")`
2. Call `remediate(sessionId="xyz", executeChoice=1)`
3. Verify: Single trace showing analysis + execution spans

**Scenario 3: ManageOrgData Pattern Creation**
1. Call `manageOrgData(dataType="pattern", operation="create")`
2. Multiple calls for workflow steps (triggers, description, etc.)
3. Verify: Single trace showing complete pattern creation workflow

## Documentation & Communication

### Documentation Updates
- [ ] **`docs/observability-guide.md`**: Add "Multi-Step Workflow Tracing" section
- [ ] **`docs/observability-guide.md`**: Add session-to-trace relationship explanation
- [ ] **`docs/observability-guide.md`**: Add Jaeger filtering examples (by session ID)
- [ ] **`docs/development-guide.md`**: Document trace context in sessions (if guide exists)
- [ ] **Example traces**: Screenshots showing complete workflows in Jaeger

### Communication & Training
- [ ] Team demo showing before/after comparison (separate traces vs single trace)
- [ ] Documentation for support team on using traces for workflow debugging
- [ ] Guidelines for troubleshooting trace correlation issues

## Success Metrics

### Quantitative Metrics
- [ ] **100% workflow coverage**: All session-based tools support trace propagation
- [ ] **Zero performance impact**: No measurable latency increase (<0.1ms)
- [ ] **Trace continuity**: >99% of multi-step workflows create single traces
- [ ] **Test coverage**: >90% coverage for trace context handling

### Qualitative Metrics
- [ ] **Debugging efficiency**: Support team can debug workflows faster using traces
- [ ] **User visibility**: Complete user journeys visible in observability tools
- [ ] **Developer experience**: Simple to add trace context to new workflow tools

## Launch Checklist

### Pre-Launch
- [ ] All 5 milestones completed
- [ ] Integration tests passing for all workflow tools
- [ ] Documentation reviewed and complete
- [ ] Performance validation complete (no overhead)

### Launch
- [ ] Deploy to staging environment
- [ ] Test with real user workflows
- [ ] Validate traces in production observability system
- [ ] Monitor for errors or issues

### Post-Launch
- [ ] Analyze trace data to identify workflow optimization opportunities
- [ ] Collect team feedback on debugging experience
- [ ] Iterate on documentation based on user questions
- [ ] Plan future enhancements (span events, baggage propagation)

## Work Log

### 2025-10-30: Initial PRD Creation
**Duration**: ~45 minutes
**Primary Focus**: Design session-based distributed tracing architecture

**Completed Work**:
- Analyzed existing session management and OpenTelemetry integration
- Designed trace context storage and restoration approach
- Identified all session-based tools requiring integration
- Created comprehensive PRD with 5 major milestones
- Validated technical feasibility with OpenTelemetry APIs

**Key Decisions**:
- **Use existing sessions**: Leverage session files for trace context storage
- **Optional trace context**: Backward compatible with graceful degradation
- **Agent-agnostic**: No MCP protocol changes required
- **Phased rollout**: Start with one tool, expand to all tools

**Next Steps**: Ready for implementation starting with Milestone 1

---

## Appendix

### Supporting Materials
- [OpenTelemetry Context API](https://opentelemetry.io/docs/specs/otel/context/) - Trace context propagation
- [OpenTelemetry Trace API](https://opentelemetry.io/docs/specs/otel/trace/api/) - Span context extraction
- [Distributed Tracing Guide](https://opentelemetry.io/docs/concepts/signals/traces/) - Best practices
- PRD #137: OpenTelemetry Tracing - Foundation infrastructure

### Example Jaeger Trace Output

**Before (Current)**: Three separate traces
```
Trace abc123 (Call 1): POST /mcp/tools → execute_tool recommend → [operations]
Trace def456 (Call 2): POST /mcp/tools → execute_tool recommend → [operations]
Trace ghi789 (Call 3): POST /mcp/tools → execute_tool recommend → [operations]
```

**After (This Feature)**: Single trace spanning all calls
```
Trace abc123 (Complete Workflow):
  ├─ POST /mcp/tools (Call 1)
  │  └─ execute_tool recommend (stage: recommend)
  │     ├─ chat claude-3-5-sonnet
  │     ├─ db.qdrant search capabilities
  │     └─ k8s.listAPIGroups
  ├─ POST /mcp/tools (Call 2) [30 seconds later]
  │  └─ execute_tool recommend (stage: chooseSolution)
  │     └─ chat claude-3-5-sonnet
  └─ POST /mcp/tools (Call 3) [45 seconds later]
     └─ execute_tool recommend (stage: deployManifests)
        ├─ kubectl apply
        └─ k8s.createNamespacedDeployment
```

### Research Findings
- OpenTelemetry supports remote span context injection for distributed tracing
- Trace context is lightweight (~50 bytes: traceId 16 bytes, spanId 8 bytes, flags 1 byte)
- Spans can be created hours apart in same trace (no timeout limitations)
- Jaeger properly visualizes traces with large time gaps between spans
- Session file storage is already persistent, adding trace context has negligible impact
