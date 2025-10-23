# PRD: OpenTelemetry Tracing for MCP Server

**Created**: 2025-10-03
**Status**: Draft
**Owner**: Viktor Farcic
**GitHub Issue**: [#137](https://github.com/vfarcic/dot-ai/issues/137)
**Last Updated**: 2025-10-03

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

**Standard Server-Side OpenTelemetry Implementation**

Implement OpenTelemetry instrumentation following industry best practices:
1. **Auto-instrumentation**: HTTP, Express middleware tracing
2. **Manual instrumentation**: Tool execution, AI calls, Kubernetes operations
3. **Direct export**: Server exports traces to OTel collector (not through MCP protocol)
4. **Trace context propagation**: Correlate multi-step workflows and sessions
5. **Integration**: Extend existing Logger interface for trace context

**NOT implementing**: The controversial "send traces through MCP" approach from modelcontextprotocol/discussions/269.

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

### Phase 1: Core Tracing Foundation [Status: ⏳ PENDING]
**Target**: Basic distributed tracing working for HTTP requests and tool execution

**Documentation Changes:**
- [ ] **`docs/observability-guide.md`**: Create comprehensive user guide with tracing concepts, setup, and usage
- [ ] **`docs/deployment-guide.md`**: Add tracing configuration section for production deployments
- [ ] **`README.md`**: Update capabilities section to mention observability and distributed tracing

**Implementation Tasks:**
- [ ] Add OpenTelemetry dependencies (`@opentelemetry/sdk-node`, `@opentelemetry/api`, `@opentelemetry/auto-instrumentations-node`)
- [ ] Create `src/core/tracing/tracer.ts` with initialization and configuration logic
- [ ] Implement HTTP middleware tracing for both STDIO and HTTP/SSE transports
- [ ] Add tool execution span wrapper for all 6 MCP tools
- [ ] Integrate with existing Logger interface for trace context injection
- [ ] Configure console exporter for local development
- [ ] Add environment variable configuration (OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT)

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
- [ ] Should we enable tracing by default or opt-in via environment variable?
- [ ] What default sampling rate for production (1%, 10%, 100%)?
- [ ] Should we include trace IDs in all log messages automatically?
- [ ] Which OpenTelemetry semantic conventions apply to MCP operations?

### Resolved Decisions
- [x] Standard server-side OTel implementation - **Decided**: 2025-10-03 **Rationale**: Industry best practice, avoids MCP protocol controversy, mature ecosystem
- [x] Direct trace export to collector - **Decided**: 2025-10-03 **Rationale**: Standard approach, avoids security concerns, better separation of concerns
- [x] Extend existing Logger interface - **Decided**: 2025-10-03 **Rationale**: Minimal disruption, automatic trace context in logs, familiar developer experience
- [x] Zero-config with console exporter default - **Decided**: 2025-10-03 **Rationale**: Excellent developer experience, no barrier to adoption, see traces immediately

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

### Example Trace Output
```bash
# Console exporter output during local development
{
  "traceId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "spanId": "b1c2d3e4f5g6h7i8",
  "name": "recommend",
  "kind": "INTERNAL",
  "timestamp": "2025-10-03T10:15:30.123Z",
  "duration": 2456,
  "attributes": {
    "tool.name": "recommend",
    "tool.stage": "recommend",
    "intent": "deploy PostgreSQL database"
  },
  "status": { "code": "OK" }
}
```

### Implementation References
- `@opentelemetry/sdk-node` - Core SDK for Node.js
- `@opentelemetry/api` - OpenTelemetry API
- `@opentelemetry/auto-instrumentations-node` - Automatic HTTP/Express instrumentation
- `@opentelemetry/exporter-trace-otlp-http` - OTLP exporter for production
- `@opentelemetry/exporter-jaeger` - Jaeger exporter
- `@opentelemetry/exporter-zipkin` - Zipkin exporter

### Semantic Conventions for MCP Operations
- `service.name`: "dot-ai-mcp"
- `mcp.tool.name`: Tool being executed
- `mcp.session.id`: Session identifier for stateful interactions
- `mcp.transport`: "stdio" | "http"
- `ai.provider`: "anthropic" | "openai"
- `ai.model`: Model identifier (e.g., "claude-3-5-sonnet")
- `ai.tokens.prompt`: Prompt token count
- `ai.tokens.completion`: Completion token count
- `k8s.operation`: Kubernetes operation type
- `k8s.resource.kind`: Resource kind being operated on
