# Gateway API Deployment Guide

**Deploy DevOps AI Toolkit MCP server using Kubernetes Gateway API v1 with production-ready reference pattern or development/testing creation pattern.**

## When to Use Gateway API

**Use Gateway API when:**
- Running Kubernetes 1.26+ with Gateway API support (GKE Autopilot, EKS, AKS, etc.)
- Need advanced routing (weighted traffic, header-based routing, mirroring)
- Prefer role-oriented design (platform team manages Gateways, app teams create routes)
- Want standardized configuration across different Gateway implementations

**Use Ingress instead when:**
- Running Kubernetes < 1.26
- Gateway API CRDs not available
- Simpler requirements met by Ingress features

**Learn more:** [Gateway API official documentation](https://gateway-api.sigs.k8s.io/)

## Prerequisites

**All deployments:**
- Kubernetes 1.26+ cluster
- Gateway API CRDs v1.2+ installed
- Gateway controller running (Istio, Envoy Gateway, Kong, etc.)
- Helm 3.x

**Reference pattern (RECOMMENDED):**
- Existing Gateway resource created by platform team
- GatewayClass resource available
- Optional: ReferenceGrant for cross-namespace access

**Creation pattern (development/testing only):**
- GatewayClass resource available

### Install Gateway API CRDs

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml
```

Verify installation:
```bash
kubectl get crd gateways.gateway.networking.k8s.io httproutes.gateway.networking.k8s.io
kubectl get gatewayclass
```

## Reference Pattern (HTTP) - RECOMMENDED

The reference pattern follows Gateway API best practices where platform teams manage shared Gateway infrastructure and application teams create HTTPRoutes.

### Step 1: Platform Team Creates Gateway (ONCE)

Create a shared Gateway in a dedicated namespace:

```yaml
---
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
```

Apply and wait for Gateway to be ready:

```bash
kubectl create namespace gateway-system
kubectl apply -f - <<EOF
[paste YAML above]
EOF
kubectl wait --for=condition=Programmed gateway/cluster-gateway -n gateway-system --timeout=300s
```

### Step 2: Application Team Deploys dot-ai

Create Helm values file (`gateway-http-values.yaml`):

```yaml
# Deployment method
deployment:
  method: standard

# Disable traditional Ingress
ingress:
  enabled: false

# Reference existing Gateway (RECOMMENDED)
gateway:
  name: "cluster-gateway"
  namespace: "gateway-system"
  timeouts:
    request: "3600s"
    backendRequest: "3600s"

# Secrets configuration
secrets:
  name: dot-ai-secrets
  auth:
    token: ""  # SET THIS: openssl rand -base64 32
  anthropic:
    apiKey: ""  # SET THIS: sk-ant-api03-...
  openai:
    apiKey: ""  # SET THIS: sk-proj-...

# AI provider configuration
ai:
  provider: anthropic

# Qdrant vector database
qdrant:
  enabled: true
```

Deploy with Helm:

```bash
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.166.0 \
  --namespace dot-ai \
  --create-namespace \
  -f gateway-http-values.yaml \
  --wait
```

Or using `--set` flags:

```bash
export DOT_AI_AUTH_TOKEN=$(openssl rand -base64 32)

helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.166.0 \
  --namespace dot-ai \
  --create-namespace \
  --set gateway.name=cluster-gateway \
  --set gateway.namespace=gateway-system \
  --set secrets.auth.token="$DOT_AI_AUTH_TOKEN" \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --wait
```

## Reference Pattern (HTTPS) - RECOMMENDED

For production HTTPS deployments with cert-manager and wildcard certificates.

### Step 1: Platform Team Creates Gateway with HTTPS (ONCE)

Create wildcard certificate and Gateway with HTTPS listener:

```yaml
---
# Wildcard certificate managed by platform team
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

---
# Gateway with HTTP and HTTPS listeners
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
```

Apply and wait:

```bash
kubectl apply -f - <<EOF
[paste Certificate YAML]
EOF

kubectl wait --for=condition=Ready certificate/wildcard-tls -n gateway-system --timeout=300s

kubectl apply -f - <<EOF
[paste Gateway YAML]
EOF

kubectl wait --for=condition=Programmed gateway/cluster-gateway -n gateway-system --timeout=300s
```

### Step 2: Application Team Deploys dot-ai

Same as HTTP deployment - the HTTPRoute will work with both HTTP and HTTPS listeners:

```bash
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.166.0 \
  --namespace dot-ai \
  --create-namespace \
  --set gateway.name=cluster-gateway \
  --set gateway.namespace=gateway-system \
  --set secrets.auth.token="$DOT_AI_AUTH_TOKEN" \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --wait
```

## Configuration Reference

### Reference Pattern Values

```yaml
gateway:
  name: "cluster-gateway"           # Name of existing Gateway (required)
  namespace: "gateway-system"       # Gateway namespace (optional, omit if same namespace)
  timeouts:
    request: "3600s"                # SSE streaming timeout
    backendRequest: "3600s"
```

### Creation Pattern Values (Development/Testing Only)

```yaml
gateway:
  create: true                      # Create Gateway (NOT for production)
  className: "istio"                # GatewayClass name (required)
  annotations: {}                   # Gateway annotations
  listeners:
    http:
      enabled: true                 # HTTP listener port 80
      hostname: ""                  # Optional hostname
    https:
      enabled: false                # HTTPS listener port 443
      hostname: ""                  # Optional hostname
      secretName: ""                # TLS secret name
  timeouts:
    request: "3600s"
    backendRequest: "3600s"
```

## Cross-Namespace Gateway Access (ReferenceGrant)

If the Gateway uses `allowedRoutes.namespaces.from: Same`, create a ReferenceGrant to allow cross-namespace access.

**When is ReferenceGrant needed?**

```yaml
# NO ReferenceGrant needed
listeners:
- name: http
  allowedRoutes:
    namespaces:
      from: All  # Allows all namespaces

# ReferenceGrant REQUIRED
listeners:
- name: http
  allowedRoutes:
    namespaces:
      from: Same  # Only same namespace (requires ReferenceGrant for cross-namespace)
```

### ReferenceGrant Example

Platform team creates in Gateway namespace:

```yaml
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
    # Optional: name: cluster-gateway  # Restrict to specific Gateway
```

Apply:

```bash
kubectl apply -f - <<EOF
[paste ReferenceGrant YAML]
EOF
```

**Learn more:** [Gateway API ReferenceGrant documentation](https://gateway-api.sigs.k8s.io/api-types/referencegrant/)

## Development/Testing Pattern (Creation Mode)

⚠️ **WARNING:** This creates a Gateway per application. NOT RECOMMENDED for production.

Use ONLY for:
- Development environments
- Testing Gateway API functionality
- Single-application clusters
- When platform team doesn't provide shared Gateway

### Example: Creation Mode with external-dns

```yaml
# Deployment method
deployment:
  method: standard

# Disable Ingress
ingress:
  enabled: false

# Create Gateway (NOT RECOMMENDED for production)
gateway:
  create: true
  className: "istio"
  
  # external-dns annotations
  annotations:
    external-dns.alpha.kubernetes.io/hostname: "dot-ai.example.com"
  
  listeners:
    http:
      enabled: true
      hostname: "dot-ai.example.com"
    https:
      enabled: false
  
  timeouts:
    request: "3600s"
    backendRequest: "3600s"

# Secrets configuration
secrets:
  name: dot-ai-secrets
  auth:
    token: ""  # SET THIS
  anthropic:
    apiKey: ""  # SET THIS
  openai:
    apiKey: ""  # SET THIS

ai:
  provider: anthropic

qdrant:
  enabled: true
```

Deploy:

```bash
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.166.0 \
  --namespace dot-ai \
  --create-namespace \
  --set gateway.create=true \
  --set gateway.className=istio \
  --set 'gateway.annotations.external-dns\.alpha\.kubernetes\.io/hostname=dot-ai.example.com' \
  --set gateway.listeners.http.hostname=dot-ai.example.com \
  --set secrets.auth.token="$DOT_AI_AUTH_TOKEN" \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --wait
```

**Note:** Created Gateway has `-http` suffix (e.g., `dot-ai-http`) to prevent kGateway Envoy deployment naming conflicts.

## MCP Client Configuration

Configure your MCP client (e.g., Claude Desktop) to connect to the deployed server.

### Get Gateway Address

```bash
# Reference mode
kubectl get gateway cluster-gateway -n gateway-system -o jsonpath='{.status.addresses[0].value}'

# Creation mode
kubectl get gateway -n dot-ai -o jsonpath='{.items[0].status.addresses[0].value}'
```

### Configure DNS

Point your hostname to the Gateway IP address:
- Manual DNS: Create A record pointing to Gateway IP
- With external-dns: DNS records created automatically

### MCP Client Configuration (.mcp.json)

```json
{
  "mcpServers": {
    "dot-ai": {
      "url": "http://dot-ai.example.com",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

For HTTPS:

```json
{
  "mcpServers": {
    "dot-ai": {
      "url": "https://dot-ai.example.com",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

## Verification Steps

### 1. Check Gateway Status

```bash
# Reference mode
kubectl get gateway cluster-gateway -n gateway-system
kubectl describe gateway cluster-gateway -n gateway-system

# Creation mode
kubectl get gateway -n dot-ai
kubectl describe gateway -n dot-ai
```

Look for `Programmed` condition.

### 2. Check HTTPRoute

```bash
kubectl get httproute -n dot-ai
kubectl describe httproute -n dot-ai
```

Verify:
- `Accepted` condition is True
- `parentRefs` matches Gateway name
- For cross-namespace: `namespace` field present

### 3. Check Backend Services

```bash
kubectl get svc,pod -n dot-ai
```

### 4. Test HTTP Endpoint

```bash
# Get Gateway IP
GATEWAY_IP=$(kubectl get gateway cluster-gateway -n gateway-system -o jsonpath='{.status.addresses[0].value}')

# Test with hostname
curl -H "Host: dot-ai.example.com" http://$GATEWAY_IP/

# Or if DNS configured
curl http://dot-ai.example.com/
```

### 5. Test SSE Connection

```bash
curl -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://dot-ai.example.com/sse
```

### 6. Verify HTTPS Certificate

```bash
openssl s_client -connect dot-ai.example.com:443 -servername dot-ai.example.com < /dev/null 2>/dev/null | openssl x509 -text -noout | grep -A 2 "Subject:"
```

## Troubleshooting

### Gateway Not Getting IP Address

```bash
kubectl describe gateway cluster-gateway -n gateway-system
```

**Common issues:**
- GatewayClass not found → Check `kubectl get gatewayclass`
- Gateway controller not running → Check controller pods
- Invalid listener configuration → Review Gateway spec

**Solution:**
```bash
# Verify GatewayClass exists and is accepted
kubectl get gatewayclass -o yaml

# Check Gateway controller logs
kubectl logs -n istio-system -l app=istio-ingressgateway  # Example for Istio
```

### HTTPRoute Not Routing Traffic

```bash
kubectl describe httproute -n dot-ai
```

**Common issues:**
- Gateway name mismatch
- Cross-namespace without ReferenceGrant
- Backend Service doesn't exist

**Solution:**
```bash
# Verify parentRef matches Gateway
kubectl get httproute -n dot-ai -o yaml | grep -A 5 parentRefs

# Check Service exists
kubectl get svc -n dot-ai

# For cross-namespace, verify ReferenceGrant
kubectl get referencegrant -n gateway-system
```

### Cross-Namespace Access Denied

```bash
kubectl get referencegrant -n gateway-system
kubectl describe referencegrant -n gateway-system
```

**Common issues:**
- ReferenceGrant missing
- ReferenceGrant doesn't allow your namespace
- Gateway uses `from: Same` without ReferenceGrant

**Solution:**
Create ReferenceGrant as shown in [Cross-Namespace Gateway Access](#cross-namespace-gateway-access-referencegrant) section.

### Gateway Name Conflict (Creation Mode)

```bash
kubectl get gateway,deploy -n dot-ai
```

**Issue:** Gateway name conflicts with application Deployment name.

**Solution:** The chart automatically adds `-http` suffix to prevent this. Verify:
```bash
kubectl get gateway -n dot-ai
# Expected: dot-ai-http (or <release-name>-http)
```

### DNS Record Not Created (external-dns)

```bash
kubectl logs -n external-dns -l app.kubernetes.io/name=external-dns
```

**Common issues:**
- external-dns not running
- Missing annotations on Gateway
- DNS provider credentials missing

**Solution:**
```bash
# Verify Gateway has external-dns annotation
kubectl get gateway -n dot-ai -o yaml | grep external-dns

# Check DNS resolution
dig +short dot-ai.example.com
```

### Connection Timeout

**Issue:** HTTP requests timeout or SSE connections fail.

**Solution:** Verify timeout configuration:
```bash
kubectl get httproute -n dot-ai -o yaml | grep -A 5 timeouts
```

Expected:
```yaml
timeouts:
  request: 3600s
  backendRequest: 3600s
```

## Cost Comparison

| Mode | Gateway per App | Load Balancer Cost | 10 Apps Total Cost |
|------|----------------|-------------------|-------------------|
| **Reference (RECOMMENDED)** | No (shared) | $18-30/month | $18-30/month |
| **Creation (dev/test)** | Yes | $18-30/month each | $180-300/month |

**Recommendation:** Use reference pattern for production to save costs and follow Gateway API best practices.

## Migration from Ingress

Migrate from traditional Ingress to Gateway API:

### Step 1: Note Current Configuration

```bash
# Get current Ingress hostname
kubectl get ingress -n dot-ai -o yaml | grep host

# Get TLS configuration
kubectl get ingress -n dot-ai -o yaml | grep -A 5 tls
```

### Step 2: Platform Team Creates Gateway

Create Gateway with same hostname as current Ingress:

```bash
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
EOF
```

### Step 3: Deploy with Gateway API

```bash
helm upgrade dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.166.0 \
  --namespace dot-ai \
  --set ingress.enabled=false \
  --set gateway.name=cluster-gateway \
  --set gateway.namespace=gateway-system \
  --reuse-values
```

### Step 4: Verify and Update DNS

```bash
# Get Gateway IP
GATEWAY_IP=$(kubectl get gateway cluster-gateway -n gateway-system -o jsonpath='{.status.addresses[0].value}')

# Update DNS A record to point to Gateway IP
```

### Step 5: Test

```bash
curl http://dot-ai.example.com/
```

## Additional Resources

**Gateway API:**
- [Official Documentation](https://gateway-api.sigs.k8s.io/)
- [Best Practices](https://gateway-api.sigs.k8s.io/guides/best-practices/)
- [API Reference](https://gateway-api.sigs.k8s.io/api-types/gateway/)
- [ReferenceGrant](https://gateway-api.sigs.k8s.io/api-types/referencegrant/)

**Integration:**
- [cert-manager Gateway API Integration](https://cert-manager.io/docs/usage/gateway/)
- [external-dns Gateway API Support](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/gateway-api.md)

**dot-ai Documentation:**
- [Kubernetes Setup Guide](kubernetes-setup.md)
- [ToolHive Deployment](kubernetes-toolhive-setup.md)
- [MCP Setup Guide](mcp-setup.md)
