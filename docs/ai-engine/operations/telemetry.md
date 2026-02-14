# Telemetry Guide

**Anonymous usage analytics to help improve DevOps AI Toolkit.**

---

## Overview

### What it does

Collects anonymous telemetry to understand product usage patterns.

### Use when

- You want to help improve DevOps AI Toolkit through anonymous usage data
- You need to configure telemetry settings for your organization
- You want to route telemetry to a self-hosted PostHog instance

### Why we collect telemetry

This data helps us:

- Identify which tools are most valuable
- Discover errors users encounter in the wild
- Understand which AI providers to prioritize
- Make data-driven product decisions

Telemetry is **enabled by default** but can be disabled with a single environment variable.

## What We Collect

We collect minimal, anonymous data about tool usage and server lifecycle.

| Event | Properties |
|-------|------------|
| `tool_executed` | Tool name, success/failure, duration, MCP client name |
| `tool_error` | Tool name, error type (class name only, not message) |
| `server_started` | Kubernetes version, deployment method |
| `server_stopped` | Uptime duration |
| `client_connected` | MCP client name and version, transport type |

All events include: dot-ai version, AI provider, and whether this is a CI/test environment.

## What We Do NOT Collect

- User queries or intents
- Cluster names, namespaces, or resource data
- API keys or credentials
- IP addresses or geographic location
- Error messages (only error type/class names)
- Any personally identifiable information (PII)

## Instance Identity

Each installation is identified by an anonymous instance ID generated from a SHA-256 hash of the Kubernetes cluster's `kube-system` namespace UID. This hash cannot be reversed to identify the cluster.

## Opting Out

To disable telemetry, set the `DOT_AI_TELEMETRY` environment variable to `false`:

```yaml
# Helm values.yaml
extraEnv:
  - name: DOT_AI_TELEMETRY
    value: "false"
```


## Self-Hosted PostHog

For organizations who want to route telemetry to their own PostHog instance:

```yaml
# Helm values.yaml
extraEnv:
  - name: DOT_AI_POSTHOG_HOST
    value: "https://posthog.your-company.com"
```

## Questions?

If you have questions about telemetry or privacy, please [open an issue](https://github.com/vfarcic/dot-ai/issues) or start a [discussion](https://github.com/vfarcic/dot-ai/discussions).
