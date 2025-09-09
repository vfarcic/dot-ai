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

- **HTTP Transport MCP Server** - Remote access via HTTP/SSE for MCP clients like Cursor
- **Production Kubernetes Deployment** - Scalable deployment with proper resource management
- **Integrated Qdrant Database** - Vector database for capability and pattern management
- **External Access** - Ingress configuration for team collaboration
- **Resource Management** - Proper CPU/memory limits and requests
- **Security** - RBAC and ServiceAccount configuration

## Prerequisites

- Kubernetes cluster (1.19+) with kubectl access
- Helm 3.x installed
- Anthropic API key (required)
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
# Install from GitHub Container Registry OCI artifact
helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.83.0 \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --set ingress.enabled=true \
  --set ingress.host="dot-ai.127.0.0.1.nip.io" \
  --create-namespace \
  --namespace dot-ai \
  --wait
```

**Notes**: 
- This documentation may use an outdated version. Check the [GitHub Releases](https://github.com/vfarcic/dot-ai/releases) for the latest version and replace `0.83.0` with the current version tag.
- Replace `dot-ai.127.0.0.1.nip.io` with your desired hostname for external access.
- For enhanced security, create a secret named `dot-ai-secrets` with keys `anthropic-api-key` and `openai-api-key` instead of using `--set` arguments.
- For all available configuration options, see the [Helm values file](https://github.com/vfarcic/dot-ai/blob/main/charts/values.yaml).

### Step 3: Configure MCP Client

Create an `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "http://dot-ai.127.0.0.1.nip.io",
        "--allow-http"
      ]
    }
  }
}
```

**Save this configuration:**
- **Claude Code**: Save as `.mcp.json` in your project directory
- **Other clients**: See [MCP client configuration](../mcp-setup.md#mcp-client-compatibility) for filename and location

**Notes**:
- Replace the URL with your actual hostname if you changed `ingress.host`.
- For production deployments, configure TLS certificates and use `https://` URLs. Remove the `--allow-http` flag when using HTTPS to ensure secure connections.

### Step 4: Start Your MCP Client

Start your MCP client (e.g., `claude` for Claude Code). The client will automatically connect to your Kubernetes-deployed MCP server.

### Step 5: Verify Everything Works

In your MCP client, ask:
```
Show dot-ai status
```

You should see comprehensive system status including Kubernetes connectivity, vector database, and all available features.