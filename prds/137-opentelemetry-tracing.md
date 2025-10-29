# PRD: OpenTelemetry Tracing for MCP Server

**Created**: 2025-10-03
**Status**: Draft
**Owner**: Viktor Farcic
**GitHub Issue**: [#137](https://github.com/vfarcic/dot-ai/issues/137)
**Last Updated**: 2025-10-29

## Executive Summary
Add OpenTelemetry distributed tracing to the MCP server to provide vendor-neutral observability for debugging complex multi-step workflows, measuring AI provider performance, and understanding Kubernetes operation latency. This enables production-ready monitoring without infrastructure lock-in.

## Problem Statement

The DevOps AI Toolkit MCP server handles complex operations including:
- Multi-step workflows (buildPlatform: list → submitAnswers → execute)
- AI provider calls (Claude, OpenAI) with variable latency
- Kubernetes cluster operations (discovery, deployment, remediation)
- Session-based stateful interactions across tool calls
- HTTP/SSE and STDIO transport protocols

**Current Gap**: No distributed tracing capability to understand:
- Where time is spent in multi-tool workflows
- Which AI provider calls are slow or failing
- How Kubernetes API latency impacts user experience
- How errors correlate across complex request chains

**Impact**: Difficult to debug performance issues, optimize AI costs, and troubleshoot production incidents.

## Documentation Changes

### Files Created/Updated
- **`docs/observability-guide.md`** - New File - Complete guide for OpenTelemetry tracing, configuration, and usage
- **`docs/deployment-guide.md`** - Updated - Add tracing configuration for production deployments
- **`docs/development-guide.md`** - New File - Developer guide for adding instrumentation to new tools
- **`README.md`** - Project Overview - Add observability to core capabilities
- **`src/core/tracing/`** - Technical Implementation - OpenTelemetry instrumentation modules

### Content Location Map
- **Feature Overview**: See `docs/observability-guide.md` (Section: "What is Distributed Tracing")
- **Configuration**: See `docs/observability-guide.md` (Section: "Setup and Configuration")
- **Tool Instrumentation**: See `docs/development-guide.md` (Section: "Adding Tracing to Tools")
- **Production Deployment**: See `docs/deployment-guide.md` (Section: "Observability Configuration")
- **Trace Analysis**: See `docs/observability-guide.md` (Section: "Understanding Traces")
- **Integration Examples**: See `docs/observability-guide.md` (Section: "Backend Integration")

### User Journey Validation
- [ ] **Primary workflow** documented end-to-end: Enable tracing → Deploy MCP → View traces → Debug issues
- [ ] **Developer workflow** complete: Add instrumentation → Test locally → Verify traces → Deploy
- [ ] **Operations workflow** complete: Configure collector → Deploy server → Monitor traces → Troubleshoot
- [ ] **Cross-references** between development docs and observability docs work correctly

## Solution Overview

**Standard Server-Side OpenTelemetry Implementation with Official GenAI Semantic Conventions**

Implement OpenTelemetry instrumentation following industry best practices and official GenAI semantic conventions:
1. **Auto-instrumentation**: HTTP, Express middleware tracing (SERVER spans)
2. **Generic wrapper instrumentation**: Tool execution, AI calls via reusable wrappers
3. **Official GenAI conventions**: Use `gen_ai.*` attributes for AI/LLM operations
4. **Hierarchical span structure**: SERVER → INTERNAL → CLIENT span relationships
5. **Direct export**: Server exports traces to OTel collector (not through MCP protocol)
6. **Trace context propagation**: Correlate multi-step workflows and sessions
7. **Integration**: Extend existing Logger and AIProvider interfaces

**NOT implementing**: The controversial "send traces through MCP" approach from modelcontextprotocol/discussions/269.

### Generic Instrumentation Strategy (Decision: 2025-10-29)

**Principle**: Instrument at architectural boundaries using generic wrappers, not manual spans scattered throughout the codebase.

**Four Strategic Instrumentation Points:**

1. **HTTP Entry Points** (Auto-instrumented)
   - Uses `@opentelemetry/instrumentation-express`
   - Zero code changes required
   - Creates SERVER spans with `http.*` attributes
   - Example: `POST /mcp/tools`

2. **MCP Tool Execution** (Generic wrapper: `withToolTracing()`)
   - Single wrapper function instruments all 5 MCP tools automatically
   - Creates INTERNAL spans with `gen_ai.tool.*` attributes
   - Example: `execute_tool recommend`
   - Implementation: `src/core/tracing/tool-tracing.ts`

3. **AI Provider Calls** (Interface-level tracing: `TracedAIProvider`)
   - Base class implements tracing for all AI providers
   - Creates CLIENT spans with official `gen_ai.*` attributes
   - Example: `chat claude-3-5-sonnet`
   - All providers (Anthropic, Vercel, NoOp) inherit tracing behavior

4. **Kubernetes API Calls** (Optional proxy: `createTracedK8sClient()`)
   - Generic proxy wrapper for transparent instrumentation
   - Creates CLIENT spans with `k8s.*` and `http.*` attributes
   - Example: `k8s.listAPIGroups`
   - Implementation: `src/core/tracing/k8s-tracing.ts`

**Benefits:**
- ✅ ~100-150 lines of instrumentation code covers entire system
- ✅ New tools/providers automatically traced
- ✅ No manual span management in business logic
- ✅ Standards-compliant with official OpenTelemetry GenAI conventions
- ✅ Maintainable: change tracing logic in one place

## Implementation Requirements

### Core Functionality
- [ ] **HTTP/MCP request tracing**: Automatic span creation for all incoming requests - Documented in `docs/observability-guide.md` (Section: "Request Tracing")
- [ ] **Tool execution spans**: Each of 5 active MCP tools traced (recommend, version, manageOrgData, remediate, projectSetup) - Documented in `docs/development-guide.md` (Section: "Tool Spans")
- [ ] **Error tracking**: Integration with existing error-handling system - Documented in `docs/observability-guide.md` (Section: "Error Correlation")
- [ ] **Trace context propagation**: Session-based workflow correlation - Documented in `docs/development-guide.md` (Section: "Context Propagation")

### Deep Instrumentation
- [ ] **AI provider tracing**: Claude/OpenAI API call spans with latency/tokens - Documented in `docs/observability-guide.md` (Section: "AI Provider Metrics")
- [ ] **Kubernetes operations**: Cluster API calls, discovery, deployments - Documented in `docs/observability-guide.md` (Section: "Kubernetes Operations")
- [ ] **Multi-step workflows**: Trace buildPlatform intent mapping → script discovery → execution - Documented in `docs/development-guide.md` (Section: "Complex Workflows")
- [ ] **Session lifecycle**: Track session creation, continuity, and completion - Documented in `docs/observability-guide.md` (Section: "Session Tracking")

### Configuration & Deployment
- [ ] **Environment-based config**: OTEL_EXPORTER_OTLP_ENDPOINT, service name, sampling - Documented in `docs/deployment-guide.md` (Section: "Environment Variables")
- [ ] **Multiple exporters**: Console (dev), OTLP (production), Jaeger, Zipkin - Documented in `docs/observability-guide.md` (Section: "Exporter Configuration")
- [ ] **Sampling strategies**: Always-on (dev), probability-based (production) - Documented in `docs/deployment-guide.md` (Section: "Sampling Configuration")
- [ ] **Zero-config default**: Works out-of-box with console exporter for local development - Documented in `docs/development-guide.md` (Section: "Getting Started")

### Documentation Quality Requirements
- [ ] **All examples work**: Configuration examples validated in integration tests
- [ ] **Complete user journeys**: End-to-end workflows from setup to trace analysis documented
- [ ] **Consistent terminology**: OpenTelemetry terms used correctly across all documentation
- [ ] **Working cross-references**: All links between observability docs and core docs resolve correctly

### Success Criteria
- [ ] **Minimal overhead**: <2ms latency added per request with tracing enabled
- [ ] **Complete visibility**: All tool executions, AI calls, and K8s operations traced
- [ ] **Developer experience**: Simple API for adding spans to new tools
- [ ] **Production ready**: Configurable sampling, multiple backends, robust error handling
- [ ] **Zero infrastructure requirement**: Works with any OTel-compatible backend

## Implementation Progress

### Phase 1: Core Tracing Foundation [Status: 🔄 IN PROGRESS - 70%]
**Target**: Basic distributed tracing working for HTTP requests and tool execution

**Documentation Changes:**
- [ ] **`docs/observability-guide.md`**: Create comprehensive user guide with tracing concepts, setup, and usage
- [ ] **`docs/deployment-guide.md`**: Add tracing configuration section for production deployments
- [ ] **`README.md`**: Update capabilities section to mention observability and distributed tracing

**Implementation Tasks:**
- [x] Add OpenTelemetry dependencies (`@opentelemetry/sdk-node`, `@opentelemetry/api`, `@opentelemetry/auto-instrumentations-node`)
- [x] Create `src/core/tracing/tracer.ts` with initialization and configuration logic
- [x] Create `src/core/tracing/config.ts` with environment-based configuration
- [x] Create `src/core/tracing/types.ts` with TypeScript type definitions
- [ ] Implement HTTP middleware tracing for both STDIO and HTTP/SSE transports (partially working - CLIENT spans only)
- [ ] Add tool execution span wrapper for all 6 MCP tools
- [x] Integrate tracer with MCP server startup and graceful shutdown
- [x] Configure console exporter for local development
- [x] Add environment variable configuration (OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_TRACING_ENABLED, OTEL_DEBUG)

### Phase 2: Deep Instrumentation [Status: ⏳ PENDING]
**Target**: AI provider calls and Kubernetes operations fully traced

**Documentation Changes:**
- [ ] **`docs/development-guide.md`**: Create developer guide for adding instrumentation to new tools and operations
- [ ] **`docs/observability-guide.md`**: Add "AI Provider Metrics" and "Kubernetes Operations" sections
- [ ] **`docs/observability-guide.md`**: Document trace analysis workflows for common debugging scenarios

**Implementation Tasks:**
- [ ] Instrument Claude/OpenAI API calls in `src/core/claude.ts` with latency, token count, model attributes
- [ ] Add Kubernetes client instrumentation in `src/core/cluster-utils.ts` for API calls
- [ ] Trace cluster discovery operations in `src/core/discovery.ts` with resource counts
- [ ] Instrument deployment operations in `src/tools/deploy-manifests.ts`
- [ ] Add session lifecycle tracing with session ID propagation
- [ ] Implement trace context propagation across multi-step workflows (buildPlatform, remediate)
- [ ] Add custom span attributes for tool parameters and results

### Phase 3: Advanced Features & Production Readiness [Status: ⏳ PENDING]
**Target**: Production-grade observability with metrics, sampling, and multiple backends

**Documentation Changes:**
- [ ] **`docs/observability-guide.md`**: Add "Advanced Configuration", "Metrics", and "Production Best Practices" sections
- [ ] **`docs/deployment-guide.md`**: Document production sampling strategies and backend integration
- [ ] **Cross-file validation**: Ensure observability integrates seamlessly with deployment and development workflows

**Implementation Tasks:**
- [ ] Add OTLP, Jaeger, and Zipkin exporter support with auto-detection
- [ ] Implement configurable sampling strategies (always-on, probability-based, rate-limiting)
- [ ] Add OpenTelemetry Metrics API for request counts, durations, error rates
- [ ] Create custom metrics for AI token usage, K8s API call counts, tool execution frequency
- [ ] Implement trace baggage for user context propagation
- [ ] Add integration tests for tracing with mock OTel collector
- [ ] Performance benchmarking to validate <2ms overhead target

## Technical Implementation Checklist

### Architecture & Design
- [ ] Design tracer initialization with lazy loading to minimize startup overhead (src/core/tracing/tracer.ts)
- [ ] Create span factory with consistent attribute naming conventions (src/core/tracing/span-factory.ts)
- [ ] Design Logger integration for automatic trace context injection (src/core/tracing/logger-integration.ts)
- [ ] Plan exporter selection strategy based on environment variables (src/core/tracing/exporters.ts)
- [ ] Design sampling configuration with environment-based overrides (src/core/tracing/sampling.ts)
- [ ] Document tracing architecture and span hierarchy

### Development Tasks
- [ ] Implement `TracingService` class with start/stop lifecycle management
- [ ] Create `withSpan` utility for wrapping async operations with tracing
- [ ] Add `instrumentTool` decorator for automatic tool span creation
- [ ] Implement trace context extraction from MCP session IDs
- [ ] Build error tracking integration with existing `ErrorHandler` class
- [ ] Create span attribute helpers for consistent metadata

### Documentation Validation
- [ ] **Automated testing**: Configuration examples execute successfully in integration tests
- [ ] **Cross-file consistency**: Tracing terminology aligned across all documentation
- [ ] **User journey testing**: Complete setup-to-analysis workflows can be followed end-to-end
- [ ] **Link validation**: All references between observability docs and core documentation resolve correctly

### Quality Assurance
- [ ] Unit tests for tracer initialization and span creation (>90% coverage)
- [ ] Unit tests for exporter configuration and selection logic (>90% coverage)
- [ ] Integration tests with mock OpenTelemetry collector
- [ ] Performance tests validating <2ms overhead per request
- [ ] Load testing with tracing enabled on large-scale operations
- [ ] Trace data validation ensuring correct span relationships and attributes

## Dependencies & Blockers

### External Dependencies
- [ ] OpenTelemetry SDK and API packages (npm packages) - ✅ Available
- [ ] OpenTelemetry collector or compatible backend (optional for dev) - ✅ Console exporter works out-of-box
- [ ] Backend for production (Jaeger, Zipkin, Grafana Tempo, vendor services) - User choice

### Internal Dependencies
- [ ] Existing Logger interface for trace context integration - ✅ Available
- [ ] Error handling system for error span tracking - ✅ Available (src/core/error-handling.ts)
- [ ] MCP server with 6 tools for instrumentation - ✅ Available
- [ ] HTTP/SSE transport for request tracing - ✅ Available

### Current Blockers
- [ ] None currently identified - all dependencies are satisfied

## Risk Management

### Identified Risks
- [ ] **Risk**: Performance overhead impacting request latency | **Mitigation**: Benchmark early, implement sampling, use async exports | **Owner**: Developer
- [ ] **Risk**: Additional complexity in error handling and logging | **Mitigation**: Extend existing patterns, comprehensive testing | **Owner**: Developer
- [ ] **Risk**: Configuration complexity for users | **Mitigation**: Zero-config defaults, clear documentation, environment variable standards | **Owner**: Developer
- [ ] **Risk**: Vendor lock-in with specific backends | **Mitigation**: OpenTelemetry standard ensures portability, support multiple exporters | **Owner**: Developer

### Mitigation Actions
- [ ] Performance benchmarking in Phase 1 to validate overhead targets
- [ ] Developer guide with clear examples for adding instrumentation
- [ ] Default to console exporter for zero-config local development
- [ ] Support standard OTEL environment variables for backend-agnostic configuration

## Decision Log

### Open Questions
- [ ] What default sampling rate for production (1%, 10%, 100%)?
- [ ] Should we include trace IDs in all log messages automatically?

### Resolved Decisions

**Initial Architecture (2025-10-03):**
- [x] **Standard server-side OTel implementation** - **Decided**: 2025-10-03 | **Rationale**: Industry best practice, avoids MCP protocol controversy, mature ecosystem
- [x] **Direct trace export to collector** - **Decided**: 2025-10-03 | **Rationale**: Standard approach, avoids security concerns, better separation of concerns
- [x] **Extend existing Logger interface** - **Decided**: 2025-10-03 | **Rationale**: Minimal disruption, automatic trace context in logs, familiar developer experience
- [x] **Tracing disabled by default (opt-in)** - **Decided**: 2025-10-29 | **Rationale**: Avoid console noise for users not interested in observability. Set OTEL_TRACING_ENABLED=true to enable. Console exporter outputs to stderr when enabled.

**Semantic Conventions & Architecture (2025-10-29):**
- [x] **Use official OpenTelemetry GenAI semantic conventions** - **Decided**: 2025-10-29 | **Rationale**: OpenTelemetry has comprehensive AI/LLM/Agent support with `gen_ai.*` attributes that are already in development status. Ensures interoperability with AI observability tools, future compatibility, and community alignment. Replaces custom conventions (`mcp.tool.name`, `ai.provider`) with official ones (`gen_ai.tool.name`, `gen_ai.provider.name`). | **Impact**: All attribute names change to official conventions. Code examples need updating. Documentation must reference official OpenTelemetry GenAI specifications. | **Resources**: [GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/), [GenAI Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/), [AI Agent Observability Blog](https://opentelemetry.io/blog/2025/ai-agent-observability/)

- [x] **Combine multiple span types in hierarchical structure** - **Decided**: 2025-10-29 | **Rationale**: Standard OpenTelemetry pattern for multi-layer architectures. HTTP requests create SERVER spans, business logic creates INTERNAL spans, external calls create CLIENT spans. Natural parent-child relationships reflect actual execution flow. | **Impact**: Traces show complete end-to-end visibility: HTTP request → MCP tool → AI provider → K8s API all properly nested with appropriate span kinds.

- [x] **Generic instrumentation via wrappers, not manual spans** - **Decided**: 2025-10-29 | **Rationale**: Instrument at architectural boundaries (HTTP layer, tool execution, AI providers, K8s client) using generic wrappers. Avoids littering codebase with manual span creation. Automatic coverage as new tools/providers are added. | **Impact**: ~100-150 lines of wrapper code instruments entire system. New tools automatically traced when registered. Changes to tracing logic happen in one place. | **Code Changes**: Create `withToolTracing()` wrapper (src/core/tracing/tool-tracing.ts), `TracedAIProvider` base class (src/core/providers/base-traced-provider.ts), optional `createTracedK8sClient()` proxy (src/core/tracing/k8s-tracing.ts).

- [x] **Four-layer instrumentation architecture** - **Decided**: 2025-10-29 | **Rationale**: Clear separation of concerns with instrumentation at each architectural layer: (1) HTTP entry points via auto-instrumentation, (2) MCP tool execution via generic wrapper, (3) AI provider calls via base class, (4) Kubernetes API via optional proxy. | **Impact**: Phase 1 focuses on layers 1-3 (HTTP, tools, AI). Layer 4 (K8s) is optional for Phase 2. Each layer uses appropriate span kind (SERVER, INTERNAL, CLIENT) and semantic conventions (http.*, gen_ai.*, k8s.*).

**Proposed Agentic System Conventions (Future):**
- [~] **Use `gen_ai.task.*` and `gen_ai.action.*` attributes when standardized** - **Status**: Monitoring GitHub Issue [#2664](https://github.com/open-telemetry/semantic-conventions/issues/2664) | **Rationale**: OpenTelemetry is developing comprehensive semantic conventions for AI agentic systems including tasks, actions, agents, teams, artifacts, and memory. These conventions will standardize telemetry for multi-step AI workflows. | **Impact**: When finalized, we can add task-level and action-level spans for complex workflows like `recommend` (which has multiple stages: intent analysis → capability scan → AI recommendation → manifest generation). | **Timeline**: Monitor for stability; likely Phase 3 implementation.

## Scope Management

### In Scope (Current Version)
- [ ] HTTP request and tool execution tracing
- [ ] AI provider call instrumentation (Claude, OpenAI)
- [ ] Kubernetes operation tracing
- [ ] Session lifecycle and context propagation
- [ ] Console, OTLP, Jaeger, Zipkin exporters
- [ ] Configurable sampling strategies
- [ ] Integration with existing error handling and logging
- [ ] Developer utilities for adding instrumentation

### Out of Scope (Future Versions)
- [~] Custom trace visualization UI
- [~] Automatic anomaly detection in traces
- [~] Cost analysis and optimization recommendations
- [~] Trace-based alerting and notifications
- [~] Historical trace analysis and trend identification
- [~] Multi-tenant trace isolation

### Deferred Items
- [~] Custom visualization - **Reason**: Use existing OTel-compatible tools (Jaeger, Grafana) **Target**: Not planned
- [~] Anomaly detection - **Reason**: Focus on instrumentation first, analysis tools exist **Target**: Future enhancement
- [~] Cost optimization - **Reason**: Requires trace correlation with billing data **Target**: v2.0
- [~] Alerting - **Reason**: Use existing observability platform alerting **Target**: Not planned (external tool responsibility)

## Testing & Validation

### Test Coverage Requirements
- [ ] Unit tests for tracer initialization and configuration (>90% coverage)
- [ ] Unit tests for span factory and instrumentation utilities (>90% coverage)
- [ ] Integration tests with mock OpenTelemetry collector
- [ ] Performance tests validating <2ms overhead target
- [ ] Load tests with high-volume trace generation
- [ ] Trace data validation tests ensuring correct span relationships

### User Acceptance Testing
- [ ] Verify traces appear in console exporter during local development
- [ ] Test OTLP export to Jaeger/Zipkin backends
- [ ] Confirm AI provider spans include token counts and model information
- [ ] Validate Kubernetes operation spans include resource types and namespaces
- [ ] Verify error spans correctly capture exception details
- [ ] Test multi-step workflow trace correlation (buildPlatform, remediate)

## Documentation & Communication

### Documentation Completion Status
- [ ] **`docs/observability-guide.md`**: Complete - User guide with tracing concepts, setup, configuration, usage
- [ ] **`docs/development-guide.md`**: Complete - Developer guide for adding instrumentation to tools
- [ ] **`docs/deployment-guide.md`**: Updated - Added tracing configuration for production deployments
- [ ] **`README.md`**: Updated - Added observability to core capabilities
- [ ] **Cross-file consistency**: Complete - OpenTelemetry terminology and patterns aligned

### Communication & Training
- [ ] Team announcement of observability capabilities
- [ ] Create demo showing trace collection and analysis workflow
- [ ] Prepare documentation for interpreting traces and debugging with distributed tracing
- [ ] Establish guidelines for adding instrumentation to new tools and features

## Launch Checklist

### Pre-Launch
- [ ] All Phase 1 implementation tasks completed
- [ ] Performance overhead validated (<2ms per request)
- [ ] Console exporter working for local development
- [ ] Documentation and configuration examples completed
- [ ] Developer guide tested with new tool instrumentation

### Launch
- [ ] Deploy tracing-enabled MCP server to staging environment
- [ ] Monitor performance metrics and overhead
- [ ] Validate trace data quality and completeness
- [ ] Collect team feedback on developer experience

### Post-Launch
- [ ] Analyze trace data to identify performance bottlenecks
- [ ] Monitor overhead and optimize if needed
- [ ] Iterate on instrumentation based on usage insights
- [ ] Plan Phase 2 enhancements (AI/K8s deep instrumentation)

## Work Log

### 2025-10-03: Initial PRD Creation
**Duration**: ~45 minutes
**Primary Focus**: Research OpenTelemetry integration and create comprehensive PRD

**Completed Work**:
- Researched OpenTelemetry MCP integration patterns and community discussions
- Analyzed existing MCP server architecture and logging infrastructure
- Created GitHub issue #137 for OpenTelemetry tracing feature
- Developed comprehensive PRD following documentation-first approach
- Structured implementation as 3 major phases with clear milestones

**Key Decisions**:
- **Standard server-side implementation**: Avoiding controversial MCP protocol trace forwarding
- **Extend existing patterns**: Building on current Logger and ErrorHandler infrastructure
- **Zero-config defaults**: Console exporter for immediate local development value
- **Vendor-neutral**: OpenTelemetry standard ensures backend portability

**Next Steps**: Ready for implementation of Phase 1 - Core Tracing Foundation

### 2025-10-29: Architecture Refinement - GenAI Conventions & Generic Instrumentation
**Duration**: ~90 minutes
**Primary Focus**: Research OpenTelemetry GenAI semantic conventions and design generic instrumentation strategy

**Completed Work**:
- Researched official OpenTelemetry GenAI semantic conventions (gen_ai.* attributes)
- Analyzed OpenTelemetry AI agent observability standards and best practices
- Investigated span hierarchy patterns for multi-layer architectures (SERVER → INTERNAL → CLIENT)
- Designed generic instrumentation strategy using wrappers instead of manual spans
- Identified four strategic instrumentation points for minimal code changes

**Key Decisions**:
- **Use official GenAI conventions**: Replace custom attributes with `gen_ai.*` standards
- **Hierarchical span structure**: Combine SERVER, INTERNAL, CLIENT spans naturally
- **Generic wrappers**: Instrument at architectural boundaries (HTTP, tools, AI, K8s)
- **Four-layer architecture**: Auto-instrumentation + three generic wrappers

**PRD Updates**:
- Updated Decision Log with four major architectural decisions (2025-10-29)
- Replaced custom semantic conventions with official GenAI attributes
- Added comprehensive span hierarchy documentation with examples
- Updated example trace output to use correct attribute names
- Added generic instrumentation strategy to Solution Overview

**Impact on Implementation**:
- Phase 1 implementation simplified: ~100-150 lines of wrapper code
- New tools/providers automatically traced when added
- All attribute names changed to official conventions
- Documentation must reference OpenTelemetry GenAI specifications

**Resources Added**:
- [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [GenAI Spans Specification](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [AI Agent Observability Blog](https://opentelemetry.io/blog/2025/ai-agent-observability/)
- [Agentic Systems Proposal (Issue #2664)](https://github.com/open-telemetry/semantic-conventions/issues/2664)

**Next Steps**: Implement Phase 1 with generic wrappers and official GenAI conventions

### 2025-10-29: Phase 1 Core Tracing Foundation Implementation
**Duration**: ~3 hours
**Primary Focus**: Core OpenTelemetry infrastructure and auto-instrumentation

**Completed PRD Items**:
- [x] Installed OpenTelemetry SDK dependencies (sdk-node, api, auto-instrumentations-node)
- [x] Created core tracing infrastructure (types.ts, config.ts, tracer.ts, index.ts)
- [x] Implemented lazy initialization with console exporter
- [x] Integrated tracer with MCP server startup and graceful shutdown
- [x] Configured environment variable support (OTEL_TRACING_ENABLED, OTEL_SERVICE_NAME, OTEL_DEBUG)
- [x] Tested auto-instrumentation with manual requests (Qdrant, OpenAI, Anthropic CLIENT spans working)
- [x] Changed default session directory to `./tmp/sessions`

**Key Decisions**:
- **Tracing disabled by default**: Set OTEL_TRACING_ENABLED=true to opt-in (avoids console noise)
- **Resource import fix**: Used resourceFromAttributes() instead of new Resource() for TypeScript compatibility

**What's Working**:
- ✅ Auto-instrumentation captures outbound HTTP calls (undici instrumentation)
- ✅ Qdrant vector DB queries traced (GET /collections, POST /points/scroll)
- ✅ OpenAI embeddings API calls traced (1049ms duration observed)
- ✅ Anthropic API calls traced (showing 401 errors correctly)
- ✅ Console exporter outputs JSON spans to stderr
- ✅ Service identification (dot-ai-mcp v0.125.0) with full resource attributes

**Known Limitations**:
- ❌ HTTP SERVER spans not appearing (REST API requests not traced at entry point)
- ❌ MCP tool execution spans not implemented (Layer 2 INTERNAL spans pending)
- ❌ No span hierarchy (all spans are roots with parentSpanContext: undefined)
- ❌ Documentation not written yet

**Files Created**:
- `src/core/tracing/types.ts` - TypeScript type definitions and interfaces
- `src/core/tracing/config.ts` - Environment-based configuration with loadTracingConfig()
- `src/core/tracing/tracer.ts` - Core OpenTelemetry SDK integration with NodeSDK
- `src/core/tracing/index.ts` - Public API exports

**Files Modified**:
- `src/mcp/server.ts` - Added getTracer() initialization and shutdownTracer() cleanup
- `package.json` - Added OpenTelemetry dependencies

**Next Session Priorities**:
- Implement Layer 2: MCP tool execution wrappers (INTERNAL spans with gen_ai.tool.* attributes)
- Add HTTP SERVER span creation for REST API endpoints
- Write `docs/observability-guide.md` comprehensive user guide
- Update `README.md` to mention observability capabilities

---

## Appendix

### Supporting Materials
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/) - Official OTel documentation
- [OpenTelemetry JavaScript SDK](https://opentelemetry.io/docs/languages/js/) - Node.js implementation guide
- [MCP OpenTelemetry Discussion #269](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/269) - Community discussion on tracing
- [Existing Error Handling System](./src/core/error-handling.ts) - Current logging and error infrastructure

### Research Findings
- OpenTelemetry is becoming standard for AI agent observability (2025 trend)
- Standard server-side implementation preferred over MCP protocol forwarding
- Minimal overhead (<2ms) achievable with proper async export configuration
- Strong ecosystem support with multiple backend options (Jaeger, Grafana Tempo, vendors)
- Natural integration with existing Logger interface patterns

### Example Trace Output with Official GenAI Conventions

#### Example 1: Complete Request Trace Hierarchy

```json
// Root span: HTTP SERVER
{
  "traceId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "spanId": "1111111111111111",
  "parentSpanId": null,
  "name": "POST /mcp/tools",
  "kind": "SERVER",
  "timestamp": "2025-10-29T10:15:30.123Z",
  "duration": 10500,
  "attributes": {
    "http.request.method": "POST",
    "http.route": "/mcp/tools",
    "url.path": "/mcp/tools",
    "url.scheme": "https",
    "server.address": "mcp.example.com",
    "server.port": 443,
    "http.response.status_code": 200
  },
  "status": { "code": "OK" }
}

// Child span: MCP Tool Execution (INTERNAL)
{
  "traceId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "spanId": "2222222222222222",
  "parentSpanId": "1111111111111111",
  "name": "execute_tool recommend",
  "kind": "INTERNAL",
  "timestamp": "2025-10-29T10:15:30.150Z",
  "duration": 10400,
  "attributes": {
    "gen_ai.operation.name": "execute_tool",
    "gen_ai.tool.name": "recommend",
    "gen_ai.tool.type": "function",
    "gen_ai.tool.description": "Get AI recommendations for Kubernetes deployments",
    "gen_ai.agent.id": "dot-ai-mcp",
    "gen_ai.agent.name": "DevOps AI Assistant",
    "mcp.session.id": "session_abc123",
    "mcp.tool.stage": "recommend"
  },
  "status": { "code": "OK" }
}

// Grandchild span: AI Provider Call (CLIENT)
{
  "traceId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "spanId": "3333333333333333",
  "parentSpanId": "2222222222222222",
  "name": "chat claude-3-5-sonnet",
  "kind": "CLIENT",
  "timestamp": "2025-10-29T10:15:31.200Z",
  "duration": 2000,
  "attributes": {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "anthropic",
    "gen_ai.request.model": "claude-3-5-sonnet",
    "gen_ai.response.model": "claude-3-5-sonnet-20241022",
    "gen_ai.usage.input_tokens": 1500,
    "gen_ai.usage.output_tokens": 800,
    "gen_ai.request.temperature": 0.7,
    "gen_ai.request.max_tokens": 4096,
    "gen_ai.response.finish_reasons": ["stop"],
    "gen_ai.conversation.id": "session_abc123"
  },
  "status": { "code": "OK" }
}

// Sibling span: Kubernetes API Call (CLIENT)
{
  "traceId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "spanId": "4444444444444444",
  "parentSpanId": "2222222222222222",
  "name": "GET /apis",
  "kind": "CLIENT",
  "timestamp": "2025-10-29T10:15:33.300Z",
  "duration": 150,
  "attributes": {
    "http.request.method": "GET",
    "server.address": "kubernetes.default.svc",
    "server.port": 443,
    "k8s.operation": "list_api_groups",
    "k8s.client": "kubernetes-client",
    "http.response.status_code": 200
  },
  "status": { "code": "OK" }
}
```

#### Example 2: Error Trace with Exception

```json
{
  "traceId": "error1234567890abcdef",
  "spanId": "err111111111111",
  "parentSpanId": "parent222222222",
  "name": "chat gpt-4o",
  "kind": "CLIENT",
  "timestamp": "2025-10-29T10:20:15.000Z",
  "duration": 500,
  "attributes": {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "openai",
    "gen_ai.request.model": "gpt-4o",
    "error.type": "timeout"
  },
  "events": [
    {
      "name": "exception",
      "timestamp": "2025-10-29T10:20:15.500Z",
      "attributes": {
        "exception.type": "TimeoutError",
        "exception.message": "Request timed out after 30s",
        "exception.stacktrace": "..."
      }
    }
  ],
  "status": {
    "code": "ERROR",
    "message": "Request timed out after 30s"
  }
}
```

### Implementation References
- `@opentelemetry/sdk-node` - Core SDK for Node.js
- `@opentelemetry/api` - OpenTelemetry API
- `@opentelemetry/auto-instrumentations-node` - Automatic HTTP/Express instrumentation
- `@opentelemetry/exporter-trace-otlp-http` - OTLP exporter for production
- `@opentelemetry/exporter-jaeger` - Jaeger exporter
- `@opentelemetry/exporter-zipkin` - Zipkin exporter

### Official OpenTelemetry Semantic Conventions for MCP Operations

**Note**: Using official OpenTelemetry GenAI semantic conventions (development status) as defined in [OpenTelemetry GenAI Specifications](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

#### General Service Attributes
- `service.name`: "dot-ai-mcp"
- `OTEL_SEMCONV_STABILITY_OPT_IN`: "gen_ai_latest_experimental" (environment variable)

#### GenAI Tool Execution Spans (INTERNAL)
Span name: `execute_tool {gen_ai.tool.name}`

**Required attributes:**
- `gen_ai.operation.name`: "execute_tool"

**Recommended attributes:**
- `gen_ai.tool.name`: Tool being executed (e.g., "recommend", "remediate", "manageOrgData")
- `gen_ai.tool.description`: Tool functionality description
- `gen_ai.tool.type`: "function" (MCP tools are function-type tools)
- `gen_ai.tool.call.id`: Optional unique tool call identifier
- `gen_ai.agent.id`: "dot-ai-mcp" (identifies the MCP server agent)
- `gen_ai.agent.name`: "DevOps AI Assistant"
- `gen_ai.agent.description`: "Kubernetes deployment recommendation agent"

**Custom MCP attributes (namespaced):**
- `mcp.session.id`: Session identifier for stateful interactions
- `mcp.transport`: "stdio" | "http"
- `mcp.tool.stage`: Workflow stage (e.g., "recommend", "chooseSolution")

#### GenAI LLM Inference Spans (CLIENT)
Span name: `{gen_ai.operation.name} {gen_ai.request.model}`
Example: `chat claude-3-5-sonnet`

**Required attributes:**
- `gen_ai.operation.name`: "chat" | "text_completion" | "generate_content"
- `gen_ai.provider.name`: "anthropic" | "openai" | "google" | "xai" | etc.

**Conditionally required attributes:**
- `gen_ai.request.model`: Model identifier (e.g., "claude-3-5-sonnet", "gpt-4o")
- `gen_ai.conversation.id`: Conversation/session identifier (when session-based)

**Recommended attributes:**
- `gen_ai.response.model`: Actual model that generated response (may differ from request)
- `gen_ai.usage.input_tokens`: Prompt token count
- `gen_ai.usage.output_tokens`: Completion token count
- `gen_ai.request.temperature`: Temperature parameter
- `gen_ai.request.max_tokens`: Maximum output tokens
- `gen_ai.request.top_p`: Top-p sampling parameter
- `gen_ai.request.frequency_penalty`: Frequency penalty setting
- `gen_ai.request.stop_sequences`: Stop sequences array
- `gen_ai.response.finish_reasons`: Array of finish reasons (e.g., ["stop"], ["length"])
- `gen_ai.response.id`: Unique completion identifier

**Opt-in attributes (contain sensitive data):**
- `gen_ai.input.messages`: Full chat history (JSON array)
- `gen_ai.output.messages`: Model response messages (JSON array)
- `gen_ai.system_instructions`: System prompt/instructions

#### GenAI Embeddings Spans (CLIENT)
Span name: `embeddings {gen_ai.request.model}`

**Required attributes:**
- `gen_ai.operation.name`: "embeddings"

**Recommended attributes:**
- `gen_ai.request.model`: Embedding model name (e.g., "text-embedding-3-small")
- `gen_ai.usage.input_tokens`: Input token count
- `gen_ai.request.encoding_formats`: Requested encoding formats (e.g., ["base64"])

#### Kubernetes API Spans (CLIENT)
Span name: `{http.request.method} {http.route}` or `k8s.{operation}`

**HTTP attributes:**
- `http.request.method`: "GET" | "POST" | "PUT" | "DELETE"
- `server.address`: Kubernetes API server address
- `server.port`: API server port (typically 443)
- `http.response.status_code`: HTTP status code

**Custom K8s attributes:**
- `k8s.operation`: Kubernetes operation type (e.g., "list_api_groups", "get_pod", "create_deployment")
- `k8s.resource.kind`: Resource kind (e.g., "Pod", "Deployment", "Service")
- `k8s.namespace`: Namespace (when applicable)
- `k8s.client`: "kubernetes-client"

#### HTTP Server Spans (SERVER)
Span name: `{http.request.method} {http.route}`

**Required attributes:**
- `http.request.method`: HTTP method (e.g., "POST", "GET")
- `url.path`: URL path (e.g., "/mcp/tools")
- `url.scheme`: "http" | "https"

**Recommended attributes:**
- `http.route`: Route template (e.g., "/mcp/tools")
- `server.address`: Server address
- `server.port`: Server port
- `client.address`: Client IP address
- `user_agent.original`: User agent string
- `http.response.status_code`: HTTP response status code

#### Span Kind Guidelines
- **SERVER**: HTTP/SSE entry points (incoming requests)
- **INTERNAL**: MCP tool execution, business logic, workflows
- **CLIENT**: AI provider calls, K8s API calls, vector DB queries

#### Future: Agentic System Conventions (Proposed)
When [Issue #2664](https://github.com/open-telemetry/semantic-conventions/issues/2664) is finalized:
- `gen_ai.task.*`: Task-level spans for multi-step workflows
- `gen_ai.action.*`: Action-level spans for execution steps
- `gen_ai.artifact.*`: Input/output artifacts
- `gen_ai.memory.*`: Persistent context storage
