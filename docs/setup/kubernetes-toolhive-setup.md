# ToolHive Kubernetes Setup Guide

**Deploy DevOps AI Toolkit MCP Server to Kubernetes using ToolHive operator - simplified enterprise deployment with built-in security and multi-tenancy.**

## When to Use This Method

✅ **Perfect for:**
- Enterprise environments requiring built-in security
- Multi-team deployments with isolation requirements
- Organizations wanting simplified Kubernetes management
- Teams preferring operator-managed deployments
- Environments requiring automatic RBAC and security policies

❌ **Consider alternatives for:**
- Single developer local usage (use [Docker setup](docker-setup.md) instead)
- Teams wanting full control over Kubernetes resources (use [Traditional Kubernetes](kubernetes-setup.md) instead)
- Environments without operator installation permissions

→ See [other setup methods](../mcp-setup.md#setup-methods) for alternatives

→ **Learn more about ToolHive**: See [ToolHive documentation](https://docs.stacklok.com/toolhive) for operator details and advanced configuration

## What You Get

- **HTTP Transport MCP Server** - Direct HTTP/SSE access for MCP clients 
- **ToolHive Operator Management** - Simplified deployment via MCPServer custom resource
- **Built-in Security** - Automatic RBAC, security policies, and container isolation
- **Multi-tenancy Support** - Built-in isolation between different MCP server instances
- **Integrated Qdrant Database** - Vector database for capability and pattern management
- **Native HTTP Support** - Direct MCP-over-HTTP without proxy translation

## Prerequisites

- Kubernetes cluster (1.19+) with kubectl access
- Helm 3.x installed
- Cluster admin permissions (required for ToolHive operator installation)
- AI model API key (default: Anthropic API key, see [AI Model Configuration](../mcp-setup.md#ai-model-configuration) for 9 model options)
- OpenAI API key (required for vector operations)

## Quick Start (10 Minutes)

### Step 1: Install ToolHive Operator

Install the ToolHive operator CRDs and operator:

```bash
# Install ToolHive operator CRDs
helm upgrade --install toolhive-operator-crds \
  oci://ghcr.io/stacklok/toolhive/toolhive-operator-crds \
  --wait

# Install ToolHive operator
helm upgrade --install toolhive-operator \
  oci://ghcr.io/stacklok/toolhive/toolhive-operator \
  --namespace toolhive-system \
  --create-namespace \
  --wait
```

### Step 2: Set Environment Variables

Export your API keys:

```bash
# Required: Set your API keys
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export OPENAI_API_KEY="sk-proj-..."
```

### Step 3: Install the Helm Chart with ToolHive Method

Install the MCP server using ToolHive deployment method:

```bash
# Install using ToolHive deployment method
helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.83.0 \
  --set deployment.method=toolhive \
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

### Step 4: Configure MCP Client

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

### Step 5: Start Your MCP Client

Start your MCP client (e.g., `claude` for Claude Code). The client will automatically connect to your ToolHive-deployed MCP server.

### Step 6: Verify Everything Works

In your MCP client, ask:
```
Show dot-ai status
```

You should see comprehensive system status including Kubernetes connectivity, vector database, and all available features.