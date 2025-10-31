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

## Custom LLM Endpoint Configuration

For self-hosted LLMs (Ollama, vLLM), air-gapped environments, or alternative SaaS providers, you can configure custom OpenAI-compatible endpoints.

### In-Cluster Ollama Example

Deploy with a self-hosted Ollama service running in the same Kubernetes cluster:

**Create a `values.yaml` file:**
```yaml
ai:
  provider: openai
  model: "llama3.3:70b"  # Your self-hosted model
  customEndpoint:
    enabled: true
    baseURL: "http://ollama-service.default.svc.cluster.local:11434/v1"

secrets:
  customLlm:
    apiKey: "ollama"  # Ollama doesn't require authentication
  openai:
    apiKey: "your-openai-key"  # Still needed for vector embeddings
```

**Install with custom values:**
```bash
helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --values values.yaml \
  --create-namespace \
  --namespace dot-ai \
  --wait
```

### Other Self-Hosted Options

**vLLM (Self-Hosted):**
```yaml
ai:
  provider: openai
  model: "meta-llama/Llama-3.1-70B-Instruct"
  customEndpoint:
    enabled: true
    baseURL: "http://vllm-service:8000/v1"

secrets:
  customLlm:
    apiKey: "dummy"  # vLLM may not require authentication
  openai:
    apiKey: "your-openai-key"
```

**LocalAI (Self-Hosted):**
```yaml
ai:
  provider: openai
  model: "your-model-name"
  customEndpoint:
    enabled: true
    baseURL: "http://localai-service:8080/v1"

secrets:
  customLlm:
    apiKey: "dummy"
  openai:
    apiKey: "your-openai-key"
```

### Important Notes

⚠️ **Model Requirements (Untested):**
- **Context window**: 200K+ tokens recommended
- **Output tokens**: 8K+ tokens minimum
- **Function calling**: Must support OpenAI-compatible function calling

**Testing Status:**
- ✅ Validated with OpenRouter (alternative SaaS provider)
- ❌ Not yet tested with self-hosted Ollama, vLLM, or LocalAI
- 🙏 We need your help testing! Report results in [issue #193](https://github.com/vfarcic/dot-ai/issues/193)

**Notes:**
- OpenAI API key is still required for vector embeddings (Qdrant operations)
- If model requirements are too high for your setup, please open an issue
- Configuration examples are based on common patterns but not yet validated

→ See [Custom Endpoint Configuration](../mcp-setup.md#custom-endpoint-configuration) for environment variable alternatives and more details.