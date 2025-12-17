# Gateway API Setup Guide

**Deploy DevOps AI Toolkit MCP Server to Kubernetes using Gateway API v1 - next-generation traffic management for production deployments.**

## When to Use Gateway API

✅ **Perfect for:**
- Modern Kubernetes environments (GKE Autopilot, EKS with AWS Load Balancer Controller)
- Enhanced traffic management with role-oriented design
- Cloud-native infrastructure requiring standardized ingress approach
- Environments where Gateway API is preferred or required by platform policy
- Teams leveraging Gateway controllers (Istio, Envoy Gateway, Kong, Traefik)

❌ **Use traditional Ingress instead for:**
- Clusters without Gateway API CRDs installed
- Kubernetes versions older than 1.26
- Environments where Gateway API support is unavailable

→ See [Kubernetes Setup Guide](kubernetes-setup.md) for traditional Ingress-based deployment

## Gateway API vs Traditional Ingress

| Feature | Gateway API | Traditional Ingress |
|---------|------------|---------------------|
| **API Maturity** | v1 stable (GA since K8s 1.26) | v1 stable |
| **Flexibility** | Role-oriented design (infrastructure vs application) | Single-level configuration |
| **Traffic Management** | Advanced routing, timeouts, retries | Basic routing |
| **Multi-tenancy** | Built-in with ReferenceGrant | Limited |
| **Extensibility** | CRD-driven, vendor-neutral | Annotation-driven, vendor-specific |

**Bottom Line**: Gateway API is the future of Kubernetes traffic management. Use it if your cluster supports it.

## What You Get

- **HTTP/HTTPS Gateway** - Flexible listener configuration for HTTP (port 80) and HTTPS (port 443)
- **HTTPRoute Resource** - Application-level routing to MCP server Service
- **SSE Streaming Support** - 3600s timeout configuration for Server-Sent Events
- **TLS Termination** - Native support with cert-manager integration
- **DNS Integration** - external-dns support via Gateway annotations
- **Production Ready** - Standards-based deployment following Gateway API best practices

## Prerequisites

- **Kubernetes cluster** (1.26+) with kubectl access
- **Gateway API CRDs** v1.2+ installed in cluster ([installation guide](https://gateway-api.sigs.k8s.io/guides/#installing-gateway-api))
- **GatewayClass** resource created by infrastructure/platform team
- **Gateway controller** running (e.g., Istio, Envoy Gateway, Kong, Traefik, cloud provider)
- **Helm** 3.x installed
- **AI model API key** (default: Anthropic). See [AI Model Configuration](mcp-setup.md#ai-model-configuration)
- **OpenAI API key** (required for vector operations)

**Optional:**
- **cert-manager** for HTTPS with automated certificate provisioning
- **external-dns** for automated DNS record management

## Verify Prerequisites

Before deploying, verify Gateway API is available:

```bash
# Check Gateway API CRDs are installed
kubectl get crd gateways.gateway.networking.k8s.io
kubectl get crd httproutes.gateway.networking.k8s.io

# List available GatewayClasses
kubectl get gatewayclass

# Example output:
# NAME                                  CONTROLLER                    ACCEPTED   AGE
# istio                                 istio.io/gateway-controller   True       10d
# gke-l7-global-external-managed        networking.gke.io/gateway     True       10d
```

If CRDs are missing, install them:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml
```

## Quick Start (HTTP Only)

### Step 1: Set Environment Variables

Export your API keys and auth token:

```bash
# Required
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export OPENAI_API_KEY="sk-proj-..."
export DOT_AI_AUTH_TOKEN=$(openssl rand -base64 32)

# Gateway configuration
export GATEWAY_CLASS="istio"  # Use your GatewayClass name
export HOSTNAME="dot-ai.example.com"  # Your hostname
```

### Step 2: Install the MCP Server

Install using the published Helm chart with Gateway API enabled:

```bash
# Set the version from https://github.com/vfarcic/dot-ai/pkgs/container/dot-ai%2Fcharts%2Fdot-ai
export DOT_AI_VERSION="0.163.0"

# Install with Gateway API
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --namespace dot-ai \
  --create-namespace \
  --set ingress.enabled=false \
  --set gateway.enabled=true \
  --set gateway.className=$GATEWAY_CLASS \
  --set gateway.listeners.http.hostname=$HOSTNAME \
  --set secrets.auth.token=$DOT_AI_AUTH_TOKEN \
  --set secrets.anthropic.apiKey=$ANTHROPIC_API_KEY \
  --set secrets.openai.apiKey=$OPENAI_API_KEY \
  --wait
```

### Step 3: Verify Deployment

Check that Gateway and HTTPRoute resources are created:

```bash
# Verify Gateway status
kubectl get gateway -n dot-ai

# Verify HTTPRoute status
kubectl get httproute -n dot-ai

# Check Gateway details and assigned IP/hostname
kubectl describe gateway dot-ai -n dot-ai

# Example output:
# Status:
#   Addresses:
#     Type:   IPAddress
#     Value:  203.0.113.42
#   Conditions:
#     Type:   Programmed
#     Status: True
```

### Step 4: Configure DNS

Point your hostname to the Gateway's external IP:

```bash
# Get the Gateway's assigned IP
GATEWAY_IP=$(kubectl get gateway dot-ai -n dot-ai -o jsonpath='{.status.addresses[0].value}')

# Create DNS A record (using your DNS provider)
# Example: dot-ai.example.com -> $GATEWAY_IP
```

### Step 5: Test the MCP Server

```bash
# Test HTTP endpoint
curl http://$HOSTNAME/

# Test SSE connection (should return MCP server info)
curl -N -H "Accept: text/event-stream" http://$HOSTNAME/sse
```

## HTTPS with cert-manager

### Prerequisites

- cert-manager installed in cluster
- ClusterIssuer or Issuer configured (e.g., Let's Encrypt)

### Installation

```bash
# Install with HTTPS and cert-manager
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --namespace dot-ai \
  --create-namespace \
  --set ingress.enabled=false \
  --set gateway.enabled=true \
  --set gateway.className=$GATEWAY_CLASS \
  --set gateway.listeners.http.enabled=true \
  --set gateway.listeners.https.enabled=true \
  --set gateway.listeners.https.hostname=$HOSTNAME \
  --set secrets.auth.token=$DOT_AI_AUTH_TOKEN \
  --set secrets.anthropic.apiKey=$ANTHROPIC_API_KEY \
  --set secrets.openai.apiKey=$OPENAI_API_KEY \
  --wait
```

### Create Certificate Resource

Create a cert-manager Certificate that Gateway will reference:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: dot-ai-tls
  namespace: dot-ai
spec:
  secretName: dot-ai-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - dot-ai.example.com
```

Apply the Certificate:

```bash
kubectl apply -f certificate.yaml

# Wait for certificate to be ready
kubectl wait --for=condition=Ready certificate/dot-ai-tls -n dot-ai --timeout=300s
```

### Update Gateway to Use Certificate

```bash
# Upgrade Helm release to use the certificate
helm upgrade dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --namespace dot-ai \
  --reuse-values \
  --set gateway.listeners.https.secretName=dot-ai-tls
```

### Test HTTPS

```bash
# Test HTTPS endpoint
curl https://$HOSTNAME/

# Test SSE over HTTPS
curl -N -H "Accept: text/event-stream" https://$HOSTNAME/sse
```

## external-dns Integration

### Prerequisites

- external-dns installed in cluster
- external-dns configured for your DNS provider

### Installation with external-dns

```bash
# Install with external-dns annotations
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --namespace dot-ai \
  --create-namespace \
  --set ingress.enabled=false \
  --set gateway.enabled=true \
  --set gateway.className=$GATEWAY_CLASS \
  --set gateway.listeners.http.hostname=$HOSTNAME \
  --set gateway.annotations."external-dns\.alpha\.kubernetes\.io/hostname"=$HOSTNAME \
  --set secrets.auth.token=$DOT_AI_AUTH_TOKEN \
  --set secrets.anthropic.apiKey=$ANTHROPIC_API_KEY \
  --set secrets.openai.apiKey=$OPENAI_API_KEY \
  --wait
```

external-dns will automatically create DNS records for the Gateway based on the annotation.

### Verify DNS Record Creation

```bash
# Check external-dns logs
kubectl logs -n external-dns -l app.kubernetes.io/name=external-dns

# Verify DNS record (after propagation)
dig +short $HOSTNAME
```

## Advanced Configuration

### Custom Timeouts

Override default 3600s SSE timeout:

```yaml
gateway:
  enabled: true
  className: istio
  timeouts:
    request: "7200s"        # 2 hours
    backendRequest: "7200s"
```

### Multiple Hostnames

Configure different hostnames for HTTP and HTTPS:

```yaml
gateway:
  enabled: true
  className: istio
  listeners:
    http:
      enabled: true
      hostname: "http.dot-ai.example.com"
    https:
      enabled: true
      hostname: "https.dot-ai.example.com"
```

### Cross-Namespace Certificate References

Use certificateRefs for advanced TLS configuration:

```yaml
gateway:
  enabled: true
  className: istio
  listeners:
    https:
      enabled: true
      certificateRefs:
        - kind: Secret
          name: wildcard-cert
          namespace: cert-manager
          # Requires ReferenceGrant in cert-manager namespace
```

Create ReferenceGrant to allow cross-namespace Secret access:

```yaml
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-dot-ai-cert-access
  namespace: cert-manager
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: Gateway
      namespace: dot-ai
  to:
    - group: ""
      kind: Secret
```

## Deployment Method Awareness

Gateway API templates automatically detect deployment method:

- **Standard deployment** (`deployment.method=standard`): Routes to `dot-ai` Service
- **Toolhive deployment** (`deployment.method=toolhive`): Routes to `mcp-dot-ai-proxy` Service

No additional configuration needed - works automatically.

## Troubleshooting

### Gateway Not Getting IP Address

**Problem**: Gateway remains in Pending state without IP assignment

**Solution**:
```bash
# Check Gateway status
kubectl describe gateway dot-ai -n dot-ai

# Look for conditions
# Common issues:
# - GatewayClass not found
# - Gateway controller not running
# - Invalid listener configuration

# Verify GatewayClass exists and is Accepted
kubectl get gatewayclass $GATEWAY_CLASS -o yaml

# Check Gateway controller pods
kubectl get pods -A -l control-plane=gateway-controller
```

### HTTPRoute Not Routing Traffic

**Problem**: Traffic not reaching MCP server Service

**Solution**:
```bash
# Check HTTPRoute status
kubectl describe httproute dot-ai -n dot-ai

# Verify parentRef matches Gateway name
# Verify backend Service exists
kubectl get svc dot-ai -n dot-ai

# Check HTTPRoute conditions
kubectl get httproute dot-ai -n dot-ai -o yaml
```

### cert-manager Certificate Not Ready

**Problem**: Certificate remains in Pending state

**Solution**:
```bash
# Check Certificate status
kubectl describe certificate dot-ai-tls -n dot-ai

# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager

# Verify Issuer/ClusterIssuer exists and is ready
kubectl get clusterissuer letsencrypt-prod -o yaml

# Check CertificateRequest
kubectl get certificaterequest -n dot-ai
```

### SSE Streaming Timeouts

**Problem**: SSE connections timeout before expected

**Solution**:

1. Verify timeout configuration in HTTPRoute:
```bash
kubectl get httproute dot-ai -n dot-ai -o yaml | grep -A 5 timeouts
```

2. Check Gateway controller specific timeout settings (varies by implementation)

3. For Istio, check VirtualService timeout:
```bash
kubectl get virtualservice -n dot-ai
```

### Mutual Exclusivity Error

**Problem**: `Cannot enable both ingress.enabled and gateway.enabled` error

**Solution**:
```bash
# Choose one ingress method:

# Option 1: Use Gateway API
helm upgrade dot-ai ... \
  --set ingress.enabled=false \
  --set gateway.enabled=true

# Option 2: Use traditional Ingress
helm upgrade dot-ai ... \
  --set ingress.enabled=true \
  --set gateway.enabled=false
```

## Gateway Controller Specific Notes

### Istio

```bash
# Install Istio with Gateway API support
istioctl install --set profile=default -y

# Verify GatewayClass
kubectl get gatewayclass istio
```

### Envoy Gateway

```bash
# Install Envoy Gateway
helm install eg oci://docker.io/envoyproxy/gateway-helm --version v1.2.0 -n envoy-gateway-system --create-namespace

# Verify GatewayClass
kubectl get gatewayclass envoy-gateway
```

### GKE (Google Kubernetes Engine)

GKE Autopilot includes Gateway API support out-of-the-box:

```bash
# Use GKE's managed GatewayClass
--set gateway.className=gke-l7-global-external-managed
```

### EKS (Amazon Elastic Kubernetes Service)

```bash
# Install AWS Load Balancer Controller
# See: https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html

# Use AWS GatewayClass
--set gateway.className=amazon-vpc-lattice
```

## Migration from Ingress to Gateway API

### Step 1: Verify Current Ingress

```bash
# Get current Ingress configuration
helm get values dot-ai -n dot-ai > current-values.yaml

# Note hostname and TLS settings
grep -A 5 ingress current-values.yaml
```

### Step 2: Prepare Gateway API Configuration

Create `gateway-values.yaml`:

```yaml
ingress:
  enabled: false

gateway:
  enabled: true
  className: "istio"  # Your GatewayClass
  listeners:
    http:
      enabled: true
      hostname: "dot-ai.example.com"  # From current Ingress
    https:
      enabled: true
      hostname: "dot-ai.example.com"
      secretName: "dot-ai-tls"  # Existing TLS secret
```

### Step 3: Upgrade to Gateway API

```bash
# Upgrade Helm release
helm upgrade dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --namespace dot-ai \
  --reuse-values \
  -f gateway-values.yaml \
  --wait

# Verify Gateway is programmed
kubectl get gateway dot-ai -n dot-ai

# Verify HTTPRoute is accepted
kubectl get httproute dot-ai -n dot-ai
```

### Step 4: Update DNS

```bash
# Get new Gateway IP
GATEWAY_IP=$(kubectl get gateway dot-ai -n dot-ai -o jsonpath='{.status.addresses[0].value}')

# Update DNS A record to point to new Gateway IP
# (or use external-dns annotation for automatic update)
```

### Step 5: Test and Cleanup

```bash
# Test new Gateway endpoint
curl https://dot-ai.example.com/

# If successful, old Ingress is automatically deleted by Helm
# (because ingress.enabled=false)
```

## Examples

See the [examples/gateway-api](../../examples/gateway-api) directory for complete deployment examples:

- **[basic-http.yaml](../../examples/gateway-api/basic-http.yaml)** - HTTP-only deployment
- **[https-cert-manager.yaml](../../examples/gateway-api/https-cert-manager.yaml)** - HTTPS with cert-manager
- **[external-dns.yaml](../../examples/gateway-api/external-dns.yaml)** - external-dns integration

## Related Documentation

- [Kubernetes Setup Guide](kubernetes-setup.md) - Traditional Ingress-based deployment
- [Gateway API Official Documentation](https://gateway-api.sigs.k8s.io/)
- [Gateway API v1.2 Release Notes](https://github.com/kubernetes-sigs/gateway-api/blob/main/CHANGELOG/1.2-CHANGELOG.md)
- [HTTPRoute Timeouts (GEP-1742)](https://gateway-api.sigs.k8s.io/geps/gep-1742/)
- [cert-manager Gateway API Integration](https://cert-manager.io/docs/usage/gateway/)
- [external-dns Gateway API Support](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/gateway-api.md)
