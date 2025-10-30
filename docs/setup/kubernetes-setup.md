# Kubernetes Setup Guide

**Deploy DevOps AI Toolkit MCP Server to Kubernetes using standard resources via Helm chart - production-ready deployment with HTTP transport.**

## When to Use This Method

✅ **Perfect for:**
- Production Kubernetes deployments
- Team-shared MCP servers accessible by multiple developers
- Cloud-native environments requiring scalability
- Environments where local Docker isn't suitable
- Remote MCP server access via HTTP transport

❌ **Consider alternatives for:**
- Single developer local usage (use [Docker setup](docker-setup.md) instead)
- Quick trials or testing (use [NPX setup](npx-setup.md) instead)

→ See [other setup methods](../mcp-setup.md#setup-methods) for alternatives

## What You Get

- **HTTP Transport MCP Server** - Direct HTTP/SSE access for MCP clients
- **Production Kubernetes Deployment** - Scalable deployment with proper resource management
- **Integrated Qdrant Database** - Vector database for capability and pattern management
- **External Access** - Ingress configuration for team collaboration
- **Resource Management** - Proper CPU/memory limits and requests
- **Security** - RBAC and ServiceAccount configuration

## Prerequisites

- Kubernetes cluster (1.19+) with kubectl access
- Helm 3.x installed
- AI model API key (default: Anthropic). See [AI Model Configuration](../mcp-setup.md#ai-model-configuration) for available model options.
- OpenAI API key (required for vector operations)
- Ingress controller (any standard controller)

## Quick Start (5 Minutes)

### Step 1: Set Environment Variables

Export your API keys:

```bash
# Required: Set your API keys
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export OPENAI_API_KEY="sk-proj-..."
```

### Step 2: Install the Helm Chart

Install the MCP server using the published Helm chart:

```bash
# Set the version from https://github.com/vfarcic/dot-ai/pkgs/container/dot-ai%2Fcharts%2Fdot-ai
export DOT_AI_VERSION="..."

helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --set ingress.enabled=true \
  --set ingress.host="dot-ai.127.0.0.1.nip.io" \
  --create-namespace \
  --namespace dot-ai \
  --wait
```

**Notes**:
- Replace `dot-ai.127.0.0.1.nip.io` with your desired hostname for external access.
- For enhanced security, create a secret named `dot-ai-secrets` with keys `anthropic-api-key` and `openai-api-key` instead of using `--set` arguments.
- For all available configuration options, see the [Helm values file](https://github.com/vfarcic/dot-ai/blob/main/charts/values.yaml).
- **Custom endpoints** (OpenRouter, self-hosted): See [Custom Endpoint Configuration](../mcp-setup.md#custom-endpoint-configuration) for environment variables, then use `--set` or values file with `ai.customEndpoint.enabled=true` and `ai.customEndpoint.baseURL`.
- **Observability/Tracing**: Add tracing environment variables via `extraEnv` in your values file. See [Observability Guide](../observability-guide.md) for complete configuration.

### Step 3: Configure MCP Client

Create an `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "dot-ai": {
      "type": "http",
      "url": "http://dot-ai.127.0.0.1.nip.io"
    }
  }
}
```

**Save this configuration:**
- **Claude Code**: Save as `.mcp.json` in your project directory
- **Other clients**: See [MCP client configuration](../mcp-setup.md#mcp-client-compatibility) for filename and location

**Notes**:
- Replace the URL with your actual hostname if you changed `ingress.host`.
- For production deployments, configure TLS certificates and use `https://` URLs for secure connections.

### Step 4: Start Your MCP Client

Start your MCP client (e.g., `claude` for Claude Code). The client will automatically connect to your Kubernetes-deployed MCP server.

### Step 5: Verify Everything Works

In your MCP client, ask:
```
Show dot-ai status
```

You should see comprehensive system status including Kubernetes connectivity, vector database, and all available features.