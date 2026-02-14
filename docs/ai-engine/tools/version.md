# System Status Guide

**Quick diagnostics and health check for your DevOps AI Toolkit installation.**

## Prerequisites

Before using this guide, complete the [Deployment Guide](../setup/deployment.md).

## Overview

**What it does**: Provides comprehensive system diagnostics including version info, component health, connection status, and capability summary.

**Use when**: Troubleshooting setup issues, verifying installation, or checking what features are available.

## Usage Example

```md
User: Show dot-ai status
```

```md
Agent: [Uses mcp__dot-ai__version]

**System Health: ✅ Healthy**

| Component   | Status                          |
|-------------|---------------------------------|
| Version     | 0.179.0                         |
| Kubernetes  | Connected (v1.34.0, in-cluster) |
| AI Provider | Anthropic (claude-haiku-4-5)    |
| Vector DB   | Connected                       |
| Embedding   | OpenAI text-embedding-3-small   |
| Kyverno     | v1.16.1 (ready)                 |
| Tracing     | OTLP → Jaeger                   |

**Collections**

| Collection   | Status   | Documents |
|--------------|----------|-----------|
| capabilities | ✅ Ready | 523       |
| patterns     | ✅ Ready | 12        |
| policies     | ✅ Ready | 8         |

**Active Capabilities**

- Policy intent management
- Capability scanning
- Semantic search
- AI recommendations
- Kubernetes integration
- Kyverno policy generation

📊 **View visualization**: http://localhost:3000/v/ver-...
```

**What happened behind the scenes:**
- System checked connectivity to all components (Kubernetes, Vector DB, AI provider)
- Retrieved collection statistics from Qdrant
- Verified Kyverno installation and readiness
- Checked tracing configuration
- Visualization URL generated for exploring system status in Web UI

### Visualization (Optional)

The visualization URL opens an interactive dashboard showing system health, component status, and configuration details:

![Version Visualization Example](../img/version-example.png)

> **Note**: Visualization URLs require additional setup:
> - Configure `webUI.baseUrl` in your Helm values (see [Deployment Guide - Web UI Visualization](../setup/deployment.md#web-ui-visualization))
> - Install the Web UI (see [Web UI Documentation](https://devopstoolkit.ai/docs/ui))

## Troubleshooting Common Issues

### Kubernetes Not Connected

```text
| Kubernetes | ❌ Not connected |
```

**Causes:**
- `KUBECONFIG` environment variable not set
- Kubeconfig file doesn't exist or is invalid
- Cluster is unreachable

**Solutions:**
1. Verify kubeconfig exists: `ls $KUBECONFIG`
2. Test connectivity: `kubectl cluster-info`
3. Check the server has access to kubeconfig file

### Vector DB Not Connected

```text
| Vector DB | ❌ Not connected |
```

**Causes:**
- Qdrant service not running
- Wrong `QDRANT_URL` configuration
- Network connectivity issues

**Solutions:**
1. Verify Qdrant is running: `kubectl get pods -n dot-ai | grep qdrant`
2. Check `QDRANT_URL` environment variable
3. Test connectivity: `curl $QDRANT_URL/collections`

### Collections Not Created

```text
| capabilities | ⚠️ Not created |
```

**Causes:**
- Capability scan hasn't been run yet
- Vector DB connectivity issues

**Solutions:**
1. Run capability scan: See [Capability Management Guide](capability-management.md)
2. For patterns: See [Pattern Management Guide](../organizational-data/patterns.md)
3. For policies: See [Policy Management Guide](../organizational-data/policies.md)

### AI Provider Issues

```text
| AI Provider | ❌ Not configured |
```

**Causes:**
- Missing API key (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)
- Invalid API key
- Provider service unavailable

**Solutions:**
1. Verify API key is set in environment or Helm values
2. Test API key validity with provider's API
3. Check [AI Model Configuration](../setup/deployment.md#ai-model-configuration)

## See Also

- **[Deployment Guide](../setup/deployment.md)** - Server deployment and configuration
- **[Capability Management Guide](capability-management.md)** - Scan cluster capabilities
- **[Tools and Features Overview](overview.md)** - Browse all available tools
