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

→ See [other setup methods](mcp-setup.md#setup-methods) for alternatives

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
- AI model API key (default: Anthropic). See [AI Model Configuration](mcp-setup.md#ai-model-configuration) for available model options.
- OpenAI API key (required for vector operations)
- Ingress controller (any standard controller)

## Quick Start (5 Minutes)

### Step 1: Set Environment Variables

Export your API keys and auth token:

```bash
# Required
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export OPENAI_API_KEY="sk-proj-..."
export DOT_AI_AUTH_TOKEN=$(openssl rand -base64 32)
```

### Step 2: Install the Controller (Optional)

Install the dot-ai-controller to enable Solution CR tracking for deployments:

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

**What the controller provides:**
- **Solution CRs**: Track lifecycle and health of deployments created via the `recommend` tool
- **Resource tracking**: Monitor deployed resources and their relationships
- **Automated remediation**: AI-powered issue analysis and remediation (future)

**Note**: You can skip this step if you don't need Solution CR tracking. The MCP server works without the controller.

### Step 3: Install the MCP Server

Install the MCP server using the published Helm chart:

```bash
# Set the version from https://github.com/vfarcic/dot-ai/pkgs/container/dot-ai%2Fcharts%2Fdot-ai
export DOT_AI_VERSION="..."

helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --set secrets.auth.token="$DOT_AI_AUTH_TOKEN" \
  --set ingress.enabled=true \
  --set ingress.host="dot-ai.127.0.0.1.nip.io" \
  --set controller.enabled=true \
  --namespace dot-ai \
  --wait
```

**Notes**:
- Remove `--set controller.enabled=true` if you skipped the controller installation in Step 2.
- Replace `dot-ai.127.0.0.1.nip.io` with your desired hostname for external access.
- For enhanced security, create a secret named `dot-ai-secrets` with keys `anthropic-api-key`, `openai-api-key`, and `auth-token` instead of using `--set` arguments.
- For all available configuration options, see the [Helm values file](https://github.com/vfarcic/dot-ai/blob/main/charts/values.yaml).
- **Custom endpoints** (OpenRouter, self-hosted): See [Custom Endpoint Configuration](mcp-setup.md#custom-endpoint-configuration) for environment variables, then use `--set` or values file with `ai.customEndpoint.enabled=true` and `ai.customEndpoint.baseURL`.
- **Observability/Tracing**: Add tracing environment variables via `extraEnv` in your values file. See [Observability Guide](../guides/observability-guide.md) for complete configuration.

### Step 4: Configure MCP Client

Create an `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "dot-ai": {
      "type": "http",
      "url": "http://dot-ai.127.0.0.1.nip.io",
      "headers": {
        "Authorization": "Bearer <your-auth-token>"
      }
    }
  }
}
```

Replace `<your-auth-token>` with the token from Step 1 (run `echo $DOT_AI_AUTH_TOKEN` to view it).

**Save this configuration:**
- **Claude Code**: Save as `.mcp.json` in your project directory
- **Other clients**: See [MCP client configuration](mcp-setup.md#mcp-client-compatibility) for filename and location

**Notes**:
- Replace the URL with your actual hostname if you changed `ingress.host`.
- For production deployments with TLS, see [TLS Configuration](#tls-configuration) below.

### Step 5: Start Your MCP Client

Start your MCP client (e.g., `claude` for Claude Code). The client will automatically connect to your Kubernetes-deployed MCP server.

### Step 6: Verify Everything Works

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

→ See [Custom Endpoint Configuration](mcp-setup.md#custom-endpoint-configuration) for environment variable alternatives and more details.

## TLS Configuration

To enable HTTPS, add these values (requires [cert-manager](https://cert-manager.io/) with a ClusterIssuer):

```yaml
ingress:
  tls:
    enabled: true
    clusterIssuer: letsencrypt  # Your ClusterIssuer name
```

Then update your `.mcp.json` URL to use `https://`.

## Gateway API (Alternative to Ingress)

For modern Kubernetes environments (K8s 1.26+), you can use **Gateway API v1** instead of traditional Ingress for enhanced traffic management and standardized configuration.

### ✅ RECOMMENDED: Reference Pattern

**Gateway API is designed with separation of concerns:**
- **Platform/Infrastructure Team**: Creates and manages shared Gateway resources
- **Application Team**: Creates HTTPRoutes that reference existing Gateways

This approach:
- ✅ Shares cloud load balancers (cost-effective)
- ✅ Centralizes Gateway configuration and policies
- ✅ Follows Gateway API best practices
- ✅ Avoids per-application infrastructure proliferation

**Alternative:** The chart also supports Gateway creation mode (`gateway.create=true`) for development/testing, but this is **NOT RECOMMENDED** for production as it creates a separate load balancer per application.

### When to Use Gateway API vs Ingress

**Use Gateway API when:**
- Running on GKE Autopilot, EKS with AWS Load Balancer Controller, or other managed Kubernetes with Gateway API support
- Need advanced routing capabilities (weighted traffic, header-based routing, etc.)
- Prefer role-oriented design separating infrastructure from application concerns
- Want CRD-driven extensibility without vendor-specific annotations

**Use Ingress when:**
- Running on Kubernetes < 1.26
- Gateway API CRDs are not available in your cluster
- Simpler requirements met by standard Ingress features

### Prerequisites

**All deployments:**
- Kubernetes 1.26+ cluster
- Gateway API CRDs installed ([installation guide](https://gateway-api.sigs.k8s.io/guides/#installing-gateway-api))
- Gateway controller running (e.g., Istio, Envoy Gateway, Kong, GKE's managed controller)

**Reference pattern (RECOMMENDED):**
- Existing Gateway resource created by platform team
- GatewayClass resource available
- Optional: ReferenceGrant for cross-namespace Gateway access

**Creation pattern (development/testing only):**
- GatewayClass resource available

### Quick Start - Reference Pattern (HTTP Only) ✅ RECOMMENDED

**Step 1:** Platform team creates shared Gateway (ONCE):

```bash
# Create Gateway namespace
kubectl create namespace gateway-system

# Create Gateway
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: cluster-gateway
  namespace: gateway-system
spec:
  gatewayClassName: istio  # Use your GatewayClass name
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All  # Allow routes from all namespaces
EOF

# Wait for Gateway to be ready
kubectl wait --for=condition=Programmed gateway/cluster-gateway -n gateway-system --timeout=300s
```

**Step 2:** Application team deploys dot-ai (references existing Gateway):

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

**Note:** This creates only an HTTPRoute that references the existing Gateway. No per-application load balancer is created.

### Quick Start - Reference Pattern (HTTPS) ✅ RECOMMENDED

**Step 1:** Platform team creates Gateway with HTTPS and wildcard certificate (ONCE):

```bash
# Create wildcard certificate
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-tls
  namespace: gateway-system
spec:
  secretName: wildcard-tls
  issuerRef:
    name: letsencrypt-prod  # Use your ClusterIssuer
    kind: ClusterIssuer
  dnsNames:
    - "*.example.com"  # Your wildcard domain
    - "example.com"
EOF

# Wait for certificate
kubectl wait --for=condition=Ready certificate/wildcard-tls -n gateway-system --timeout=300s

# Create Gateway with HTTPS
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: cluster-gateway
  namespace: gateway-system
spec:
  gatewayClassName: istio
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
      - kind: Secret
        name: wildcard-tls
    allowedRoutes:
      namespaces:
        from: All
EOF
```

**Step 2:** Application team deploys dot-ai:

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

### Quick Start - Creation Pattern (Development/Testing Only) ⚠️

**Use this ONLY for development/testing. NOT RECOMMENDED for production.**

```bash
helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --set secrets.auth.token="$DOT_AI_AUTH_TOKEN" \
  --set ingress.enabled=false \
  --set gateway.create=true \
  --set gateway.className="istio" \
  --set gateway.listeners.http.hostname="dot-ai.example.com" \
  --namespace dot-ai \
  --wait
```

**Note:** This creates a Gateway named `<release-name>-http` (e.g., `dot-ai-mcp-http`) to prevent kGateway Envoy deployment naming conflicts. Each created Gateway provisions a separate cloud load balancer.

### Configuration Reference

Key Gateway API values in `charts/values.yaml`:

#### Reference Pattern (RECOMMENDED)
```yaml
gateway:
  name: "cluster-gateway"           # Name of existing Gateway
  namespace: "gateway-system"       # Gateway namespace (optional, if different from app)
  timeouts:
    request: "3600s"                # SSE streaming timeout
    backendRequest: "3600s"
```

#### Creation Pattern (Development/Testing Only)
```yaml
gateway:
  create: true                      # Create Gateway (NOT RECOMMENDED for production)
  className: "istio"                # GatewayClass name (required when create=true)
  annotations: {}                   # For external-dns integration
  listeners:
    http:
      enabled: true                 # HTTP listener on port 80
      hostname: ""                  # Optional hostname
    https:
      enabled: false                # HTTPS listener on port 443
      hostname: ""                  # Optional hostname
      secretName: ""                # TLS secret name
  timeouts:
    request: "3600s"                # SSE streaming timeout
    backendRequest: "3600s"
```

### Cross-Namespace Gateway Access (ReferenceGrant)

If the Gateway is in a different namespace and uses `allowedRoutes.namespaces.from: Same`, create a ReferenceGrant:

```bash
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-dot-ai-routes
  namespace: gateway-system  # Gateway namespace
spec:
  from:
  - group: gateway.networking.k8s.io
    kind: HTTPRoute
    namespace: dot-ai  # Application namespace
  to:
  - group: gateway.networking.k8s.io
    kind: Gateway
EOF
```

### Detailed Examples & Troubleshooting

See the [`examples/gateway-api/`](../../examples/gateway-api/) directory for:
- **[basic-http.yaml](../../examples/gateway-api/basic-http.yaml)** - Reference pattern (HTTP)
- **[https-cert-manager.yaml](../../examples/gateway-api/https-cert-manager.yaml)** - Reference pattern (HTTPS with cert-manager)
- **[external-dns.yaml](../../examples/gateway-api/external-dns.yaml)** - Creation pattern (development/testing only)
- **[README.md](../../examples/gateway-api/README.md)** - Comprehensive guide, ReferenceGrant docs, and troubleshooting

## Integration with kagent

To connect [kagent](https://kagent.dev) agents to this MCP server, see [kagent Setup Guide](kagent-setup.md).