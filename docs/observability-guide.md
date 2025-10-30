# DevOps AI Toolkit Observability Guide

**Complete guide for distributed tracing and observability in the DevOps AI Toolkit MCP server.**

## Overview

**What it does**: Provides OpenTelemetry-based distributed tracing for debugging complex workflows, measuring AI provider performance, and understanding Kubernetes operation latency.

**Use when**: You need to understand where time is spent in multi-step workflows, debug performance issues, or monitor AI/Kubernetes operations in production.

**📖 Full Guide**: This document covers tracing setup, configuration, backend integration, and trace interpretation specific to the DevOps AI Toolkit.

### What is Distributed Tracing?

Learn about distributed tracing concepts and OpenTelemetry:
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OpenTelemetry Tracing Concepts](https://opentelemetry.io/docs/concepts/observability-primer/#distributed-tracing)

This guide focuses on DevOps AI Toolkit-specific tracing implementation, configuration, and usage patterns.

## Prerequisites

- DevOps AI Toolkit MCP server configured (see [MCP Setup](mcp-setup.md))
- Basic understanding of distributed tracing concepts (optional but helpful)
- Backend for viewing traces (Jaeger, Grafana Tempo, vendor service) or use console output

## Quick Start

### Environment Variables

Add tracing environment variables to your MCP client configuration (see [MCP Setup](mcp-setup.md) for how to configure environment variables).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OTEL_TRACING_ENABLED` | **Yes** | `false` | Enable/disable tracing |
| `OTEL_SERVICE_NAME` | No | `dot-ai-mcp` | Service name in traces |
| `OTEL_EXPORTER_TYPE` | No | `console` | Exporter type: `console`, `otlp`, `jaeger`, `zipkin` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Required for OTLP | - | OTLP endpoint URL (e.g., `http://localhost:4318/v1/traces`) |
| `OTEL_SAMPLING_PROBABILITY` | No | `1.0` | Sampling rate: `0.0` to `1.0` (1.0 = 100%, 0.1 = 10%) |
| `OTEL_DEBUG` | No | `false` | Enable debug logging for tracing |

### Verify Tracing Status

After configuring and restarting your MCP client, verify tracing status:

```md
User: Show me the system status

Agent: The system is healthy and all components are operational:

...

Tracing: Enabled
- Exporter: console
- Service Name: dot-ai-mcp
- Status: initialized
```

The agent will report tracing configuration as part of the system status.

## What Gets Traced

The DevOps AI Toolkit automatically traces all operations without requiring code changes:

### MCP Tool Execution
- All MCP tools (recommendations, remediation, capability management, etc.)
- Tool parameters and execution duration
- Success/failure status
- Session IDs for workflow correlation

### AI Provider Operations
- **Chat completions**: Claude, OpenAI, Google, xAI, Mistral, DeepSeek, and custom endpoints
- **Tool loop iterations**: Multi-step AI workflows with per-iteration visibility
- **Embeddings generation**: Vector embeddings for semantic search
- **Token usage**: Input tokens, output tokens, cache metrics
- **Model information**: Provider names and specific model versions

### Kubernetes Operations
- **API client calls**: All Kubernetes API operations through the client library
- **kubectl commands**: CLI command execution with operation details
- **Resource information**: Resource types, namespaces, and operation latency

### Vector Database Operations
- **Search queries**: Semantic and keyword searches with result counts
- **Document operations**: Upserts, deletions, and retrievals
- **Collection management**: Collection operations and health checks
- **Performance metrics**: Query latency and result quality scores

## Backend Integration

### Jaeger

Jaeger is an open-source distributed tracing platform. Run Jaeger locally with Docker:

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

Configure the MCP server to send traces to Jaeger:

```bash
OTEL_TRACING_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

Access the Jaeger UI at http://localhost:16686 to view traces.

### Other Backends

Any tracing backend that supports OpenTelemetry OTLP protocol should work with the same configuration pattern:

```
OTEL_TRACING_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=<your-backend-otlp-endpoint>
```

Refer to your backend's documentation for the specific OTLP endpoint URL.

## Viewing Traces

### Jaeger UI

Open Jaeger UI at http://localhost:16686 (if using local Jaeger setup).

**Finding Traces:**
1. Select `dot-ai-mcp` from the Service dropdown
2. Click "Find Traces" button
3. View list of recent traces with duration and span count

**Trace Details:**
- Click on a trace to see the complete request flow
- Spans are displayed in a waterfall timeline showing parent-child relationships
- Each span shows operation name, duration, and timing relative to the trace start
- Click on individual spans to see detailed attributes

### Understanding Trace Information

**Tool Execution Span:**
- Operation name: `execute_tool <tool-name>`
- Shows total time for tool execution
- Contains session ID and tool parameters

**AI Provider Spans:**
- Operation names: `chat <model>`, `tool_loop <model>`, `embeddings <model>`
- Token usage: `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
- Cache metrics: `gen_ai.usage.cache_read_tokens`, `gen_ai.usage.cache_creation_tokens`
- Model details: `gen_ai.request.model`, `gen_ai.provider.name`

**Kubernetes Operation Spans:**
- Operation names: API method names or `kubectl <command>`
- Attributes: `k8s.api`, `k8s.method`, `k8s.operation`, `k8s.resource`
- Shows latency for Kubernetes API calls

**Vector Database Spans:**
- Operation names: `search`, `upsert`, `delete`, `list`, etc.
- Attributes: `db.operation.name`, `db.collection.name`
- Result metrics: `db.query.result_count`, `db.vector.top_score`

### Trace Hierarchy

All spans from a single tool invocation share the same trace ID and follow this hierarchy:

```
execute_tool <tool-name>                    (root span)
├── chat <model>                           (AI operation)
│   └── POST https://api.anthropic.com     (HTTP call)
├── search                                 (vector DB query)
│   └── POST http://localhost:6333         (HTTP call)
└── k8s.listNamespacedDeployment          (Kubernetes API)
    └── GET https://kubernetes/apis/apps   (HTTP call)
```

This hierarchy helps identify which operations are taking the most time and where bottlenecks occur.
