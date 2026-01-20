# PRD #329: Add PostHog Telemetry for Usage Analytics

**GitHub Issue**: [#329](https://github.com/vfarcic/dot-ai/issues/329)
**Status**: Complete
**Priority**: Medium
**Created**: 2026-01-11

---

## Problem Statement

The dot-ai MCP server has approximately 3,000 container image pulls, but we have zero visibility into actual usage patterns. We don't know:

- Which MCP tools are most/least used
- What errors users encounter
- Which AI providers are popular
- What Kubernetes versions users run
- Whether features we build are actually adopted

This lack of insight means we're making product decisions without data, potentially investing in features nobody uses while ignoring pain points we don't know exist.

## Solution Overview

Implement opt-out PostHog telemetry that collects anonymous usage metrics from running dot-ai instances. The telemetry will:

1. Track tool invocations (names only, no content/queries)
2. Record success/error rates per tool
3. Capture AI provider and Kubernetes version
4. Respect user privacy (no PII, no cluster data, no API keys)
5. Honor `DOT_AI_TELEMETRY=false` to disable

After successful implementation in dot-ai MCP, extend the same telemetry pattern to all other dot-ai projects (controller, UI, future projects).

## User Impact

### For End Users
- **Minimal**: Telemetry runs silently in background
- **Transparent**: Clear documentation about what's collected
- **Controllable**: Single environment variable to disable
- **No performance impact**: Async, non-blocking calls

### For Maintainers (Us)
- **Data-driven decisions**: Know which tools to improve
- **Error visibility**: See what's failing in the wild
- **Adoption tracking**: Understand feature uptake
- **Provider insights**: Know which AI providers to prioritize

## Technical Scope

### What We'll Track

| Event | Properties | Purpose |
|-------|------------|---------|
| `tool_executed` | tool name, success, duration_ms, ai_provider, mcp_client | Feature usage |
| `tool_error` | tool name, error_type (not message), mcp_client | Pain points |
| `server_started` | k8s_version, dot_ai_version, ai_provider, deployment_method | Environment context |
| `server_stopped` | uptime_seconds | Session duration |
| `client_connected` | mcp_client, mcp_client_version, transport | Agent tracking |

### What We Will NOT Track

- User queries or intents
- Cluster names, namespaces, or resource data
- API keys or credentials
- IP addresses or geographic location
- Any personally identifiable information

### Instance Identity

Generate a stable anonymous instance ID using a hash of:
- Kubernetes cluster UID (from `kube-system` namespace)
- This provides instance uniqueness without identifying the cluster

### Integration Points

1. **Tool tracing wrapper** (`src/core/tracing/tool-tracing.ts`): Capture tool executions for both MCP and HTTP
2. **MCP server startup** (`src/mcp/server.ts`): Server lifecycle events
3. **Error handling** (`src/core/error-handling.ts`): Error type tracking
4. **New telemetry module** (`src/core/telemetry/`): Centralized telemetry logic

### Configuration

```yaml
# Helm values.yaml addition
telemetry:
  enabled: true                    # Can be disabled via DOT_AI_TELEMETRY=false
  posthogKey: "phc_xxx"           # PostHog project API key (public, safe to expose)
  posthogHost: "https://app.posthog.com"  # Or self-hosted instance
```

## Success Criteria

1. **Data flowing**: PostHog dashboard shows tool usage events within 24 hours of deployment
2. **Privacy validated**: Security review confirms no PII in event payloads
3. **Opt-out works**: Setting `DOT_AI_TELEMETRY=false` stops all telemetry
4. **No performance regression**: Tool execution latency unchanged (telemetry is async)
5. **Documentation complete**: Users know what's collected and how to disable

## Implementation Milestones

- [x] **M1: PostHog integration foundation** - Create telemetry module with PostHog SDK, instance ID generation, and opt-out support
- [x] **M2: Tool execution tracking** - Instrument tool tracing wrapper to capture tool invocations with success/error status for both MCP and HTTP
- [x] **M3: Server lifecycle events** - Track server start/stop with environment context (k8s version, ai provider)
- [x] **M4: Helm chart configuration** - Add telemetry configuration to Helm values with sensible defaults
- [x] **M5: Documentation and transparency** - Document what's collected, add privacy notice to README, update CHANGELOG
- [x] **M6: PostHog dashboard setup** - Create dashboard with key metrics (tool usage, errors, providers)
- [~] **M7: Extend to other dot-ai projects** - Not needed: controller and UI are clients of MCP/HTTP server, their usage is already captured
- [x] **M8: Website telemetry visualization PRD** - Create PRD in dot-ai-website repo to visualize PostHog data publicly on the project website

## Dependencies

- **PostHog account**: Need to create project and get API key
- **posthog-node SDK**: npm package for Node.js integration

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users disable telemetry | Low data volume | Make value proposition clear, keep it lightweight |
| Privacy concerns | Reputation damage | Strict no-PII policy, transparent documentation |
| PostHog rate limits | Missing data | Batch events, implement retry logic |
| Performance impact | User experience | Async calls, fire-and-forget pattern |

## Alternatives Considered

1. **Self-Hosted Metrics (SHM)**: Requires hosting PostgreSQL server - too much infrastructure overhead
2. **Scarf**: Only tracks downloads, not runtime usage - doesn't answer "what to improve"
3. **Custom beacon**: Full control but requires building dashboard from scratch
4. **OpenTelemetry metrics**: Already have tracing, but no hosted backend for metrics

PostHog chosen for: generous free tier, no infrastructure to manage, privacy features built-in, good SDK.

## Design Decisions

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2026-01-20 | No integration tests for PostHog telemetry | Telemetry is fire-and-forget analytics with no business logic dependencies. Unit tests with mocked PostHog SDK are sufficient to verify correct payloads and opt-out behavior. Integration tests would add complexity (mock PostHog server, subprocess management) with minimal additional confidence. | Removed M6 (integration tests milestone). Unit tests in `tests/unit/core/telemetry/` provide coverage for configuration, opt-out, and event payload structure. |
| 2026-01-20 | Use extraEnv for Helm telemetry config | Telemetry has sensible defaults baked in (enabled=true, PostHog key/host). Adding a dedicated `telemetry` section to values.yaml adds complexity without benefit. Users can customize via existing `extraEnv` mechanism which is well-understood. | Simpler values.yaml. No template changes needed. Documented env vars (`DOT_AI_TELEMETRY`, `DOT_AI_POSTHOG_HOST`) in extraEnv comments. |
| 2026-01-20 | Skip extending telemetry to other dot-ai projects | dot-ai-controller and dot-ai-ui are clients of the MCP/HTTP server. Their tool usage is already captured by MCP server telemetry (`mcp_client: "http"` for REST calls). Adding separate telemetry to these projects would only capture internal behavior (reconciliation loops, page views) which isn't needed for product decisions. | M7 marked as not needed. Reduces complexity and maintenance burden across projects. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-01-11 | PRD created |
| 2026-01-20 | M1 complete: Created telemetry module with PostHog SDK, instance ID generation from cluster UID, opt-out support. Added M9 for website visualization. Disabled telemetry in test cluster. |
| 2026-01-20 | M2 complete: Added telemetry to `withToolTracing` wrapper (`src/core/tracing/tool-tracing.ts`) - covers both MCP and HTTP transports. Unit tests added (19 tests). Verified events appearing in PostHog Activity. |
| 2026-01-20 | M3 complete: Added server lifecycle events (`server_started`, `server_stopped`) with k8s_version, deployment_method, uptime tracking. Added bonus `client_connected` event to track MCP agent (Claude Code, Cursor, etc.). Enhanced `tool_executed`/`tool_error` with `mcp_client` attribution. 26 unit tests passing. |
| 2026-01-20 | M3 enhancements: Added `is_internal` flag (detects CI/test environments for PostHog filtering). Made telemetry configurable in integration tests (`DOT_AI_TELEMETRY` env var). REST API calls now show `mcp_client: "http"` to distinguish from MCP clients. Verified with integration tests. |
| 2026-01-20 | M4 complete: Helm chart telemetry configuration via `extraEnv` mechanism. Added documented examples for `DOT_AI_TELEMETRY` and `DOT_AI_POSTHOG_HOST` in values.yaml comments. Verified with `helm template`. |
| 2026-01-20 | M5 complete: Added Telemetry section to README with link to docs site. Created `docs/guides/telemetry-guide.md` with full transparency (what's collected, what's NOT, opt-out, self-hosted option). Created changelog fragment. Requested dot-ai-website to publish the guide. |
| 2026-01-20 | M6 complete: Created PostHog dashboard "dot-ai MCP Usage Analytics" with insights: Tool Usage Distribution (bar chart), Tool Error Rate (table), AI Provider Distribution (pie), MCP Client Distribution (pie), Kubernetes Versions (table), Daily Active Instances (line), Tool Execution Duration (line), Session Duration (bar), Events Over Time (stacked area). Configured `is_internal` filter to exclude CI/test traffic. |
| 2026-01-20 | M7 deferred: Controller and UI are clients of MCP/HTTP server - their usage is already captured by existing telemetry. No need for separate telemetry packages. |
| 2026-01-20 | M8 complete: Created PRD #5 in dot-ai-website repo for public telemetry dashboard visualization. PRD defines 6 milestones for displaying aggregated usage metrics on the project website. |

---

## Appendix: Example Telemetry Events

### Tool Executed Event
```json
{
  "event": "tool_executed",
  "distinctId": "sha256:abc123...",
  "properties": {
    "tool": "recommend",
    "success": true,
    "duration_ms": 1250,
    "ai_provider": "anthropic",
    "dot_ai_version": "0.190.0",
    "mcp_client": "claude-code",
    "mcp_client_version": "1.0.0"
  }
}
```

### Server Started Event
```json
{
  "event": "server_started",
  "distinctId": "sha256:abc123...",
  "properties": {
    "dot_ai_version": "0.190.0",
    "k8s_version": "1.29.0",
    "ai_provider": "anthropic",
    "deployment_method": "helm"
  }
}
```

### Tool Error Event
```json
{
  "event": "tool_error",
  "distinctId": "sha256:abc123...",
  "properties": {
    "tool": "deploy-manifests",
    "error_type": "KubernetesAPIError",
    "dot_ai_version": "0.190.0",
    "mcp_client": "cursor",
    "mcp_client_version": "0.45.0"
  }
}
```

### Client Connected Event
```json
{
  "event": "client_connected",
  "distinctId": "sha256:abc123...",
  "properties": {
    "mcp_client": "claude-code",
    "mcp_client_version": "1.0.0",
    "transport": "stdio",
    "ai_provider": "anthropic",
    "dot_ai_version": "0.190.0"
  }
}
```
