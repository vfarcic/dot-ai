# Gateway API Examples

This directory contains complete deployment examples for using DevOps AI Toolkit with Kubernetes Gateway API v1.

## Prerequisites

All examples require:
- Kubernetes 1.26+ cluster
- Gateway API CRDs v1.2+ installed
- GatewayClass resource available
- Gateway controller running (Istio, Envoy Gateway, Kong, etc.)
- Helm 3.x

Install Gateway API CRDs:
```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml
```

Verify GatewayClass:
```bash
kubectl get gatewayclass
```

## Examples

### [basic-http.yaml](basic-http.yaml)
**HTTP-only deployment with Gateway API**

Simple HTTP deployment without TLS. Perfect for:
- Internal/private networks
- Development environments
- Testing Gateway API functionality
- Environments where TLS termination happens upstream

Key features:
- HTTP listener on port 80
- No TLS/certificate management
- SSE streaming timeout: 3600s
- Standard Kubernetes deployment

**Quick start:**
```bash
# Download and edit the example
curl -O https://raw.githubusercontent.com/vfarcic/dot-ai/main/examples/gateway-api/basic-http.yaml

# Edit configuration (hostname, GatewayClass, secrets)
vim basic-http.yaml

# Apply the configuration
kubectl apply -f basic-http.yaml  # (Secret part)

# Install with Helm
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.163.0 \
  --namespace dot-ai \
  --create-namespace \
  -f basic-http.yaml
```

---

### [https-cert-manager.yaml](https-cert-manager.yaml)
**HTTPS deployment with automated certificate provisioning**

Production-ready HTTPS deployment with cert-manager. Perfect for:
- Production environments
- Public-facing deployments
- Automated certificate management
- Let's Encrypt integration

Key features:
- HTTP listener on port 80 (for ACME challenge)
- HTTPS listener on port 443 with TLS termination
- cert-manager Certificate resource
- Automatic certificate renewal
- SSE streaming over HTTPS

Additional prerequisites:
- cert-manager installed ([installation guide](https://cert-manager.io/docs/installation/))
- ClusterIssuer or Issuer configured (e.g., Let's Encrypt)

**Quick start:**
```bash
# Download and edit the example
curl -O https://raw.githubusercontent.com/vfarcic/dot-ai/main/examples/gateway-api/https-cert-manager.yaml

# Edit configuration (hostname, GatewayClass, ClusterIssuer, secrets)
vim https-cert-manager.yaml

# Create Certificate resource
kubectl apply -f https-cert-manager.yaml  # (Certificate part)

# Wait for certificate
kubectl wait --for=condition=Ready certificate/dot-ai-tls -n dot-ai --timeout=300s

# Install with Helm
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.163.0 \
  --namespace dot-ai \
  --create-namespace \
  -f https-cert-manager.yaml
```

---

### [external-dns.yaml](external-dns.yaml)
**Automated DNS record management**

Deployment with external-dns for automatic DNS record creation. Perfect for:
- Multi-environment deployments
- Automated DNS management
- Cloud DNS providers (Route53, Cloud DNS, Azure DNS, Cloudflare)
- GitOps workflows

Key features:
- Automatic DNS A/AAAA record creation
- external-dns annotations on Gateway
- Automatic record updates on IP change
- Automatic cleanup on deletion
- Supports multiple DNS providers

Additional prerequisites:
- external-dns installed ([installation guide](https://github.com/kubernetes-sigs/external-dns))
- DNS provider configured (AWS Route53, Cloudflare, Google Cloud DNS, Azure DNS, etc.)

**Quick start:**
```bash
# Download and edit the example
curl -O https://raw.githubusercontent.com/vfarcic/dot-ai/main/examples/gateway-api/external-dns.yaml

# Edit configuration (hostname, GatewayClass, secrets)
vim external-dns.yaml

# Install with Helm
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.163.0 \
  --namespace dot-ai \
  --create-namespace \
  -f external-dns.yaml

# Watch external-dns create DNS record
kubectl logs -n external-dns -l app.kubernetes.io/name=external-dns -f

# Wait for DNS propagation (1-5 minutes)
dig +short dot-ai.example.com
```

---

## Combining Examples

### HTTPS + external-dns

For production deployment with both automated DNS and certificates:

1. Start with `external-dns.yaml` configuration
2. Add cert-manager Certificate from `https-cert-manager.yaml`
3. Enable HTTPS listener in Gateway configuration
4. Wait for DNS propagation before cert-manager can complete ACME challenge

**Combined configuration:**
```yaml
gateway:
  enabled: true
  className: "istio"
  annotations:
    # external-dns annotation
    external-dns.alpha.kubernetes.io/hostname: "dot-ai.example.com"
  listeners:
    http:
      enabled: true
      hostname: "dot-ai.example.com"
    https:
      enabled: true
      hostname: "dot-ai.example.com"
      secretName: "dot-ai-tls"
```

## Common Configuration Patterns

### Multiple Hostnames

Serve MCP server on multiple hostnames:
```yaml
gateway:
  annotations:
    external-dns.alpha.kubernetes.io/hostname: "dot-ai.example.com,api.example.com"
  listeners:
    http:
      enabled: true
      hostname: "dot-ai.example.com"
```

### Custom Timeouts

Increase timeout for longer SSE connections:
```yaml
gateway:
  timeouts:
    request: "7200s"        # 2 hours
    backendRequest: "7200s"
```

### ToolHive Deployment Method

Use operator-managed deployment instead of standard Kubernetes resources:
```yaml
deployment:
  method: toolhive  # Instead of "standard"
```

The HTTPRoute will automatically route to `mcp-<name>-proxy` Service.

## Verification Steps

After deployment, verify everything is working:

### 1. Check Resources
```bash
# Verify Gateway is programmed
kubectl get gateway -n dot-ai

# Verify HTTPRoute is accepted
kubectl get httproute -n dot-ai

# Check Services and Pods
kubectl get svc,pod -n dot-ai
```

### 2. Get Gateway Address
```bash
# Get Gateway IP or hostname
kubectl get gateway dot-ai -n dot-ai -o jsonpath='{.status.addresses[0].value}'
```

### 3. Test HTTP Endpoint
```bash
# Replace with your hostname
curl http://dot-ai.example.com/
```

### 4. Test SSE Connection
```bash
# Test Server-Sent Events endpoint
curl -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  http://dot-ai.example.com/sse
```

### 5. For HTTPS: Verify Certificate
```bash
# Check TLS certificate
openssl s_client -connect dot-ai.example.com:443 -servername dot-ai.example.com < /dev/null 2>/dev/null | openssl x509 -text -noout | grep -A 2 "Subject:"
```

## Troubleshooting

### Gateway Not Getting IP

```bash
# Check Gateway status and conditions
kubectl describe gateway dot-ai -n dot-ai

# Common issues:
# - GatewayClass not found or not Accepted
# - Gateway controller not running
# - Invalid listener configuration

# Verify GatewayClass
kubectl get gatewayclass -o yaml
```

### HTTPRoute Not Routing Traffic

```bash
# Check HTTPRoute status
kubectl describe httproute dot-ai -n dot-ai

# Verify backend Service exists
kubectl get svc -n dot-ai

# Check HTTPRoute parentRef matches Gateway
kubectl get httproute dot-ai -n dot-ai -o yaml | grep -A 5 "parentRefs"
```

### Certificate Not Ready (HTTPS example)

```bash
# Check Certificate status
kubectl describe certificate dot-ai-tls -n dot-ai

# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager

# Verify ClusterIssuer is ready
kubectl get clusterissuer -o yaml
```

### DNS Record Not Created (external-dns example)

```bash
# Check external-dns logs
kubectl logs -n external-dns -l app.kubernetes.io/name=external-dns

# Verify Gateway has annotation
kubectl get gateway dot-ai -n dot-ai -o yaml | grep external-dns

# Check DNS resolution
dig +short dot-ai.example.com
```

## Migration from Ingress

If you're migrating from traditional Ingress to Gateway API:

1. Note your current Ingress hostname and TLS configuration
2. Deploy Gateway with same hostname
3. Verify Gateway is working
4. Update DNS to point to Gateway IP
5. Disable Ingress: `--set ingress.enabled=false`

See [Gateway API Setup Guide](../../docs/setup/gateway-api-setup.md#migration-from-ingress-to-gateway-api) for detailed migration steps.

## Additional Resources

- **[Gateway API Setup Guide](../../docs/setup/gateway-api-setup.md)** - Complete setup documentation
- **[Gateway API Official Docs](https://gateway-api.sigs.k8s.io/)** - Kubernetes Gateway API documentation
- **[cert-manager Gateway API Integration](https://cert-manager.io/docs/usage/gateway/)** - cert-manager documentation
- **[external-dns Gateway API Support](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/gateway-api.md)** - external-dns documentation

## Support

For questions or issues:
- GitHub Issues: [vfarcic/dot-ai/issues](https://github.com/vfarcic/dot-ai/issues)
- GitHub Discussions: [vfarcic/dot-ai/discussions](https://github.com/vfarcic/dot-ai/discussions)
