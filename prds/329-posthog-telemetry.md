# PRD #329: Add PostHog Telemetry for Usage Analytics

**GitHub Issue**: [#329](https://github.com/vfarcic/dot-ai/issues/329)
**Status**: Draft
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
| `tool_executed` | tool name, success, duration_ms, ai_provider | Feature usage |
| `tool_error` | tool name, error_type (not message) | Pain points |
| `server_started` | k8s_version, dot_ai_version, ai_provider | Environment context |
| `server_stopped` | uptime_seconds | Session duration |

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

1. **REST API router** (`src/interfaces/rest-api.ts`): Capture tool executions
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

- [ ] **M1: PostHog integration foundation** - Create telemetry module with PostHog SDK, instance ID generation, and opt-out support
- [ ] **M2: Tool execution tracking** - Instrument REST API router to capture tool invocations with success/error status
- [ ] **M3: Server lifecycle events** - Track server start/stop with environment context (k8s version, ai provider)
- [ ] **M4: Helm chart configuration** - Add telemetry configuration to Helm values with sensible defaults
- [ ] **M5: Documentation and transparency** - Document what's collected, add privacy notice to README, update CHANGELOG
- [ ] **M6: Integration tests** - Verify telemetry events are sent correctly and opt-out works
- [ ] **M7: PostHog dashboard setup** - Create dashboard with key metrics (tool usage, errors, providers)
- [ ] **M8: Extend to other dot-ai projects** - Create reusable telemetry package, integrate into dot-ai-controller, dot-ai-ui

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

## Progress Log

| Date | Update |
|------|--------|
| 2026-01-11 | PRD created |

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
    "dot_ai_version": "0.190.0"
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
    "dot_ai_version": "0.190.0"
  }
}
```
