# AI Engine Deployment

**Deploy the DevOps AI Toolkit Engine to Kubernetes using Helm chart — production-ready deployment.**

> **For the easiest setup**, we recommend installing the complete dot-ai stack which includes all components pre-configured. See the [Stack Installation Guide](https://devopstoolkit.ai/docs/stack).
>
> Continue below if you want to install components individually (for granular control over configuration).

## Overview

The DevOps AI Toolkit Engine provides:

1. **Kubernetes Deployment Recommendations** — AI-powered application deployment assistance with enhanced semantic understanding
2. **Cluster Query** — Natural language interface for querying cluster resources, status, and health
3. **Capability Management** — Discover and store semantic resource capabilities for intelligent recommendation matching
4. **Pattern Management** — Organizational deployment patterns that enhance AI recommendations
5. **Policy Management** — Governance policies that guide users toward compliant configurations with optional Kyverno enforcement
6. **Kubernetes Issue Remediation** — AI-powered root cause analysis and automated remediation
7. **Shared Prompts Library** — Centralized prompt sharing via native slash commands
8. **REST API Gateway** — HTTP endpoints for all toolkit capabilities

Access these tools through [MCP clients](../../mcp/index.md) or the [CLI](https://devopstoolkit.ai/docs/cli).

## What You Get

- **Production Kubernetes Deployment** — Scalable deployment with proper resource management
- **Integrated Qdrant Database** — Vector database for capability and pattern management
- **External Access** — Ingress configuration for team collaboration
- **Resource Management** — Proper CPU/memory limits and requests
- **Security** — RBAC and ServiceAccount configuration

## Prerequisites

- Kubernetes cluster (1.19+) with kubectl access
- Helm 3.x installed
- AI model API key (default: Anthropic). See [AI Model Configuration](#ai-model-configuration) for available model options.
- OpenAI API key (required for vector embeddings)
- Ingress controller (any standard controller)

## Quick Start (5 Minutes)

### Step 1: Set Environment Variables

Export your API keys and auth token:

```bash
# Required
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export OPENAI_API_KEY="sk-proj-..."
export DOT_AI_AUTH_TOKEN=$(openssl rand -base64 32)

# Ingress class - change to match your ingress controller (traefik, haproxy, etc.)
export INGRESS_CLASS_NAME="nginx"
```

### Step 2: Install the Controller

Install the dot-ai-controller to enable autonomous cluster operations:

```bash
# Set the controller version from https://github.com/vfarcic/dot-ai-controller/pkgs/container/dot-ai-controller%2Fcharts%2Fdot-ai-controller
export DOT_AI_CONTROLLER_VERSION="..."

# Install controller (includes CRDs for Solution and RemediationPolicy)
helm install dot-ai-controller \
  oci://ghcr.io/vfarcic/dot-ai-controller/charts/dot-ai-controller:$DOT_AI_CONTROLLER_VERSION \
  --namespace dot-ai \
  --create-namespace \
  --wait
```

The controller provides CRDs for autonomous cluster operations. Create Custom Resources like CapabilityScanConfig, Solution, RemediationPolicy, or ResourceSyncConfig to enable features such as capability scanning, solution tracking, and more. See the [Controller Setup Guide](https://devopstoolkit.ai/docs/controller/setup-guide) for complete details.

### Step 3: Install the Server

Install the server using the published Helm chart:

```bash
# Set the version from https://github.com/vfarcic/dot-ai/pkgs/container/dot-ai%2Fcharts%2Fdot-ai
export DOT_AI_VERSION="..."

helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --set secrets.auth.token="$DOT_AI_AUTH_TOKEN" \
  --set ingress.enabled=true \
  --set ingress.className="$INGRESS_CLASS_NAME" \
  --set ingress.host="dot-ai.127.0.0.1.nip.io" \
  --set controller.enabled=true \
  --namespace dot-ai \
  --wait
```

**Notes**:
- Replace `dot-ai.127.0.0.1.nip.io` with your desired hostname for external access.
- For enhanced security, create a secret named `dot-ai-secrets` with keys `anthropic-api-key`, `openai-api-key`, and `auth-token` instead of using `--set` arguments.
- For all available configuration options, see the [Helm values file](https://github.com/vfarcic/dot-ai/blob/main/charts/values.yaml).
- **Global annotations**: Add annotations to all Kubernetes resources using `annotations` in your values file (e.g., for [Reloader](https://github.com/stakater/Reloader) integration: `reloader.stakater.com/auto: "true"`).
- **Custom endpoints** (OpenRouter, self-hosted): See [Custom Endpoint Configuration](#custom-endpoint-configuration) for environment variables, then use `--set` or values file with `ai.customEndpoint.enabled=true` and `ai.customEndpoint.baseURL`.
- **Observability/Tracing**: Add tracing environment variables via `extraEnv` in your values file. See [Observability Guide](../operations/observability.md) for complete configuration.
- **User-Defined Prompts**: Load custom prompts from your git repository via `extraEnv`. See [User-Defined Prompts](../tools/prompts.md#user-defined-prompts) for configuration.

### Step 4: Connect a Client

With the server running, connect using your preferred access method:

- **[MCP Client Setup](../../mcp/index.md)** — Connect via MCP protocol from Claude Code, Cursor, or other MCP clients
- **[CLI](https://devopstoolkit.ai/docs/cli)** — Use the command-line interface for terminal and CI/CD pipelines

## Capability Scanning for AI Recommendations

Many MCP tools depend on **capability data** to function:

- **recommend**: Uses capabilities to find resources matching your deployment intent
- **manageOrgData** (patterns): References capabilities when applying organizational patterns
- **manageOrgData** (policies): Validates resources against stored capability metadata

Without capability data, these tools may not work or will produce poor results.

### Enabling Capability Scanning

Create a `CapabilityScanConfig` CR to enable autonomous capability discovery. The controller watches for CRD changes and automatically scans new resources. See the [Capability Scan Guide](https://devopstoolkit.ai/docs/controller/capability-scan-guide) for setup instructions.

## AI Model Configuration

The DevOps AI Toolkit supports multiple AI models. Choose your model by setting the `AI_PROVIDER` environment variable.

### Model Requirements

All AI models must meet these minimum requirements:
- **Context window**: 200K+ tokens (some tools like capability scanning use large context)
- **Output tokens**: 8K+ tokens (for YAML generation and policy creation)
- **Function calling**: Required for MCP tool interactions

### Available Models

| Provider | Model | AI_PROVIDER | API Key Required | Recommended |
|----------|-------|-------------|------------------|-------------|
| **Anthropic** | Claude Haiku 4.5 | `anthropic_haiku` | `ANTHROPIC_API_KEY` | Yes |
| **Anthropic** | Claude Opus 4.6 | `anthropic_opus` | `ANTHROPIC_API_KEY` | Yes |
| **Anthropic** | Claude Sonnet 4.5 | `anthropic` | `ANTHROPIC_API_KEY` | Yes |
| **AWS** | Amazon Bedrock | `amazon_bedrock` | AWS credentials ([see setup](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)) | Yes |
| **Google** | Gemini 3 Pro | `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | Yes (might be slow) |
| **Google** | Gemini 3 Flash | `google_flash` | `GOOGLE_GENERATIVE_AI_API_KEY` | Yes (preview) |
| **Host** | Host Environment LLM | `host` | None (uses host's AI) | Yes (if supported) |
| **Moonshot AI** | Kimi K2 | `kimi` | `MOONSHOT_API_KEY` | Yes |
| **Moonshot AI** | Kimi K2 Thinking | `kimi_thinking` | `MOONSHOT_API_KEY` | Yes (might be slow) |
| **OpenAI** | GPT-5.1 Codex | `openai` | `OPENAI_API_KEY` | No * |
| **xAI** | Grok-4 | `xai` | `XAI_API_KEY` | No * |

\* **Note**: These models may not perform as well as other providers for complex DevOps reasoning tasks.

### Models Not Supported

| Provider | Model | Reason |
|----------|-------|--------|
| **DeepSeek** | DeepSeek V3.2 (`deepseek-chat`) | 128K context limit insufficient for heavy workflows |
| **DeepSeek** | DeepSeek R1 (`deepseek-reasoner`) | 64K context limit insufficient for most workflows |

**Why DeepSeek is not supported**: Integration testing revealed that DeepSeek's context window limitations (128K for V3.2, 64K for R1) cause failures in context-heavy operations like Kyverno policy generation, which can exceed 130K tokens. The toolkit requires 200K+ context for reliable operation across all features.

### Helm Configuration

Set AI provider in your Helm values:

```yaml
ai:
  provider: anthropic_haiku  # or anthropic, anthropic_opus, google, etc.

secrets:
  anthropic:
    apiKey: "your-api-key"
```

Or via `--set`:

```bash
helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --set ai.provider=anthropic_haiku \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  # ... other settings
```

**AI Keys Are Optional**: The MCP server starts successfully without AI API keys. Tools like **Shared Prompts Library** and **REST API Gateway** work without AI. AI-powered tools (deployment recommendations, remediation, pattern/policy management, capability scanning) require AI keys (unless using the `host` provider) and will show helpful error messages when accessed without configuration.

## Embedding Provider Configuration

The DevOps AI Toolkit supports multiple embedding providers for semantic search capabilities in pattern management, capability discovery, and policy matching.

### Available Embedding Providers

| Provider | EMBEDDINGS_PROVIDER | Model | Dimensions | API Key Required |
|----------|-------------------|-------|------------|------------------|
| **Amazon Bedrock** | `amazon_bedrock` | `amazon.titan-embed-text-v2:0` | 1024 | AWS credentials |
| **Google** | `google` | `text-embedding-004` (deprecated) | 768 | `GOOGLE_API_KEY` |
| **Google** | `google` | `gemini-embedding-001` | 768 | `GOOGLE_API_KEY` |
| **OpenAI** | `openai` (default) | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` |

### Helm Configuration

Set embedding provider via `extraEnv` in your values file:

```yaml
extraEnv:
  - name: EMBEDDINGS_PROVIDER
    value: "google"
  - name: GOOGLE_API_KEY
    valueFrom:
      secretKeyRef:
        name: dot-ai-secrets
        key: google-api-key
```

**Notes:**
- **Same Provider**: If using the same provider for both AI models and embeddings (e.g., `AI_PROVIDER=google` and `EMBEDDINGS_PROVIDER=google`), you only need to set one API key
- **Mixed Providers**: You can use different providers for AI models and embeddings (e.g., `AI_PROVIDER=anthropic` with `EMBEDDINGS_PROVIDER=google`)
- **Embedding Support**: Not all AI model providers support embeddings. Anthropic does not provide embeddings; use OpenAI, Google, or Amazon Bedrock for embeddings
- **Google Deprecation**: `text-embedding-004` will be discontinued on January 14, 2026. Use `gemini-embedding-001` for new deployments. When switching models, you must delete and recreate all embeddings (patterns, capabilities, policies) as vectors from different models are not compatible

## Custom Endpoint Configuration

You can configure custom OpenAI-compatible endpoints for AI models. This enables using alternative providers like OpenRouter, self-hosted models, or air-gapped deployments.

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

### OpenRouter Example

OpenRouter provides access to 100+ LLM models from multiple providers:

```yaml
ai:
  provider: openai
  model: "anthropic/claude-3.5-sonnet"
  customEndpoint:
    enabled: true
    baseURL: "https://openrouter.ai/api/v1"

secrets:
  customLlm:
    apiKey: "sk-or-v1-your-key-here"
  openai:
    apiKey: "your-openai-key"  # Still needed for embeddings
```

**Note**: OpenRouter does not support embedding models. Use OpenAI, Google, or Amazon Bedrock for embeddings.

Get your OpenRouter API key at [https://openrouter.ai/](https://openrouter.ai/)

### Important Notes

- **Context window**: 200K+ tokens recommended
- **Output tokens**: 8K+ tokens minimum
- **Function calling**: Must support OpenAI-compatible function calling

**Testing Status:**
- Validated with OpenRouter (alternative SaaS provider)
- Not yet tested with self-hosted Ollama, vLLM, or LocalAI
- We need your help testing! Report results in [issue #193](https://github.com/vfarcic/dot-ai/issues/193)

**Notes:**
- OpenAI API key is still required for vector embeddings (Qdrant operations)
- If model requirements are too high for your setup, please open an issue
- Configuration examples are based on common patterns but not yet validated

## TLS Configuration

To enable HTTPS, add these values (requires [cert-manager](https://cert-manager.io/) with a ClusterIssuer):

```yaml
ingress:
  tls:
    enabled: true
    clusterIssuer: letsencrypt  # Your ClusterIssuer name
```

Then update your `.mcp.json` URL to use `https://`.

## Web UI Visualization

Enable rich visualizations of query results by connecting to a [DevOps AI Web UI](https://github.com/vfarcic/dot-ai-ui) instance.

When configured, the query tool includes a `visualizationUrl` field in responses that opens interactive visualizations (resource topology, relationships, health status) in your browser.

### Configuration

Add the Web UI base URL to your Helm values:

```yaml
webUI:
  baseUrl: "https://dot-ai-ui.example.com"  # Your Web UI instance URL
```

Or via `--set`:

```bash
helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --set webUI.baseUrl="https://dot-ai-ui.example.com" \
  # ... other settings
```

### Feature Toggle Behavior

- **Not configured** (default): Query responses contain only text summaries. No `visualizationUrl` field is included.
- **Configured**: Query responses include a `visualizationUrl` field (format: `{baseUrl}/v/{sessionId}`) that opens the visualization in the Web UI.

### Example Query Response

When `webUI.baseUrl` is configured, query responses include:

```text
**View visualization**: https://dot-ai-ui.example.com/v/abc123-session-id
```

This URL opens an interactive visualization of the query results in the Web UI.

## Gateway API (Alternative to Ingress)

For Kubernetes 1.26+, you can use **Gateway API v1** for advanced traffic management with role-oriented design (platform teams manage Gateways, app teams create routes).

### When to Use

**Use Gateway API when:**
- Running Kubernetes 1.26+ with Gateway API support
- Need advanced routing (weighted traffic, header-based routing)
- Prefer separation of infrastructure and application concerns

**Use Ingress when:**
- Running Kubernetes < 1.26
- Simpler requirements met by Ingress features

### Prerequisites

- Kubernetes 1.26+ cluster
- Gateway API CRDs installed: `kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml`
- Gateway controller running (Istio, Envoy Gateway, Kong, etc.)
- Existing Gateway resource created by platform team (reference pattern)

### Quick Start (Reference Pattern - RECOMMENDED)

Reference an existing platform-managed Gateway:

```bash
helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --set secrets.auth.token="$DOT_AI_AUTH_TOKEN" \
  --set ingress.enabled=false \
  --set gateway.name="cluster-gateway" \
  --set gateway.namespace="gateway-system" \
  --namespace dot-ai \
  --wait
```

### Configuration Reference

```yaml
# Reference pattern (RECOMMENDED)
gateway:
  name: "cluster-gateway"           # Existing Gateway name
  namespace: "gateway-system"       # Gateway namespace (optional)
  timeouts:
    request: "3600s"                # SSE streaming timeout
    backendRequest: "3600s"

# Creation pattern (development/testing only)
gateway:
  create: true                      # Create Gateway (NOT for production)
  className: "istio"                # GatewayClass name
```

### Complete Guide

See **[Gateway API Deployment Guide](gateway-api.md)** for:
- Platform team Gateway setup (HTTP and HTTPS)
- Application team deployment steps
- Cross-namespace access (ReferenceGrant)
- Development/testing creation pattern
- Troubleshooting and verification
- Migration from Ingress

## Next Steps

Once the server is running:

### 1. Explore Tools
- **[Tools Overview](../tools/overview.md)** — Complete guide to all available tools, how they work together, and recommended usage flow

### 2. Enable Observability (Optional)
- **[Observability Guide](../operations/observability.md)** — Distributed tracing with OpenTelemetry for debugging workflows, measuring AI performance, and monitoring Kubernetes operations

### 3. Production Considerations
- Consider backup strategies for vector database content (organizational patterns and capabilities)
- Review [TLS Configuration](#tls-configuration) for HTTPS

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/vfarcic/dot-ai/issues)
