# Gateway API Examples

This directory contains complete deployment examples for using DevOps AI Toolkit with Kubernetes Gateway API v1.

## 🎯 Recommended Approach: Reference Pattern

**The Gateway API is designed with a clear separation of concerns:**
- **Platform/Infrastructure Team**: Creates and manages shared Gateway resources
- **Application Team**: Creates HTTPRoutes that reference existing Gateways

This repository demonstrates **both patterns**, but we strongly recommend the **reference pattern** for production deployments.

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

### [basic-http.yaml](basic-http.yaml) ✅ RECOMMENDED
**HTTP-only deployment using reference pattern**

Demonstrates the recommended approach where the application references an existing Gateway created by the platform team.

**Perfect for:**
- Production deployments
- Multi-tenant environments
- Cost-effective infrastructure (shared load balancer)
- Centralized Gateway management

**Key features:**
- References existing Gateway via `gateway.name`
- Cross-namespace Gateway support via `gateway.namespace`
- No Gateway creation (HTTPRoute only)
- SSE streaming timeout: 3600s
- ReferenceGrant examples for cross-namespace access

**Quick start:**
```bash
# Platform team creates shared Gateway (ONCE)
kubectl apply -f basic-http.yaml  # (Gateway resource section)

# Application team deploys dot-ai
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.166.0 \
  --namespace dot-ai \
  --create-namespace \
  --set gateway.name=cluster-gateway \
  --set gateway.namespace=gateway-system \
  --set secrets.auth.token="YOUR_TOKEN" \
  --set secrets.anthropic.apiKey="YOUR_KEY" \
  --set secrets.openai.apiKey="YOUR_KEY"
```

---

### [https-cert-manager.yaml](https-cert-manager.yaml) ✅ RECOMMENDED
**HTTPS deployment with cert-manager using reference pattern**

Production-ready HTTPS deployment with wildcard certificate managed by platform team.

**Perfect for:**
- Production environments
- Public-facing deployments
- Centralized certificate management
- Let's Encrypt integration

**Key features:**
- References existing Gateway with HTTPS listener
- Platform-managed wildcard certificates
- Automatic certificate renewal
- SSE streaming over HTTPS
- Alternative: per-application certificates with ReferenceGrant

**Additional prerequisites:**
- cert-manager installed ([installation guide](https://cert-manager.io/docs/installation/))
- ClusterIssuer or Issuer configured (e.g., Let's Encrypt)

**Quick start:**
```bash
# Platform team creates Gateway with wildcard cert (ONCE)
kubectl apply -f https-cert-manager.yaml  # (Certificate and Gateway sections)

# Application team deploys dot-ai
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.166.0 \
  --namespace dot-ai \
  --create-namespace \
  --set gateway.name=cluster-gateway \
  --set gateway.namespace=gateway-system \
  --set secrets.auth.token="YOUR_TOKEN" \
  --set secrets.anthropic.apiKey="YOUR_KEY" \
  --set secrets.openai.apiKey="YOUR_KEY"
```

---

### [external-dns.yaml](external-dns.yaml) ⚠️  DEVELOPMENT/TESTING ONLY
**Gateway creation mode with external-dns (NOT RECOMMENDED for production)**

Demonstrates Gateway creation per application. Use this **only** for development/testing scenarios.

**Use this when:**
- Development/testing environments
- Single-application clusters
- Platform team doesn't provide shared Gateway
- Learning Gateway API concepts

**❌ Avoid in production because:**
- Creates per-application load balancers ($$$)
- Violates Gateway API separation of concerns
- Can cause kGateway Envoy deployment naming conflicts
- Harder to manage centralized policies

**Key features:**
- Creates Gateway with `-http` suffix (prevents kGateway naming conflicts)
- external-dns annotations for automatic DNS records
- Per-application Gateway and load balancer
- Cost comparison and migration guide to reference pattern

**Additional prerequisites:**
- external-dns installed ([installation guide](https://github.com/kubernetes-sigs/external-dns))
- DNS provider configured (AWS Route53, Cloudflare, Google Cloud DNS, etc.)

**Quick start:**
```bash
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.166.0 \
  --namespace dot-ai \
  --create-namespace \
  --set gateway.create=true \
  --set gateway.className=istio \
  --set 'gateway.annotations.external-dns\.alpha\.kubernetes\.io/hostname=dot-ai.example.com' \
  --set secrets.auth.token="YOUR_TOKEN" \
  --set secrets.anthropic.apiKey="YOUR_KEY" \
  --set secrets.openai.apiKey="YOUR_KEY"
```

**Note:** The created Gateway will have `-http` suffix (e.g., `dot-ai-http`) to prevent naming conflicts with kGateway Envoy deployments.

---

## ReferenceGrant: Cross-Namespace Gateway Access

When using cross-namespace Gateway references (e.g., Gateway in `gateway-system`, HTTPRoute in `dot-ai`), you may need a ReferenceGrant depending on the Gateway's `allowedRoutes` configuration.

### When do you need ReferenceGrant?

**NO ReferenceGrant needed:**
```yaml
# Gateway with allowedRoutes.namespaces.from: All
listeners:
- name: http
  allowedRoutes:
    namespaces:
      from: All  # ← Allows all namespaces
```

**ReferenceGrant REQUIRED:**
```yaml
# Gateway with allowedRoutes.namespaces.from: Same
listeners:
- name: http
  allowedRoutes:
    namespaces:
      from: Same  # ← Only allows same namespace (requires ReferenceGrant for cross-namespace)
```

### ReferenceGrant Example

Platform team creates this in the Gateway namespace to allow specific namespaces to reference the Gateway:

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
    namespace: dot-ai  # Application namespace that can reference the Gateway
  to:
  - group: gateway.networking.k8s.io
    kind: Gateway
    # Optional: name: cluster-gateway  # Restrict to specific Gateway
```

For more ReferenceGrant examples, see:
- [basic-http.yaml](basic-http.yaml) - ReferenceGrant for cross-namespace HTTPRoute
- [https-cert-manager.yaml](https-cert-manager.yaml) - ReferenceGrant for cross-namespace TLS Secret

---

## Understanding the `-http` Suffix (Creation Mode)

When using `gateway.create=true`, the Helm chart creates a Gateway with `-http` suffix to prevent naming conflicts with kGateway (Kong Gateway Operator).

**Why the suffix?**
- kGateway creates an Envoy Deployment with the same name as the Gateway
- Without suffix: Gateway name = Application Deployment name = Conflict ❌
- With suffix: Gateway name includes `-http` = No conflict ✅

**Example:**
- Release name: `dot-ai`
- Application Deployment: `dot-ai`
- Created Gateway: `dot-ai-http` ← suffix prevents conflict
- HTTPRoute automatically references: `dot-ai-http`

**Note:** This suffix is an implementation detail. In reference mode, you reference the Gateway by whatever name the platform team chose (no suffix involved).

---

## Comparison: Reference vs Creation Mode

| Aspect | Reference Mode (✅ RECOMMENDED) | Creation Mode (⚠️  DEV/TEST ONLY) |
|--------|-------------------------------|----------------------------------|
| **Gateway Creation** | Platform team (ONCE) | Per application |
| **Load Balancer Cost** | Shared ($18-30/month total) | Per app ($18-30/month each) |
| **Separation of Concerns** | ✅ Clear | ❌ Violated |
| **Centralized Policies** | ✅ Yes | ❌ No |
| **Gateway API Best Practice** | ✅ Yes | ❌ Anti-pattern |
| **kGateway Conflicts** | ✅ No risk | ⚠️  Requires `-http` suffix |
| **Configuration** | `gateway.name: cluster-gateway` | `gateway.create: true` |
| **Production Ready** | ✅ Yes | ❌ No |

---

## Common Configuration Patterns

### Multiple Hostnames

Serve MCP server on multiple hostnames (reference mode):
```yaml
# Platform team configures Gateway with wildcard or specific hostnames
gateway:
  name: cluster-gateway
  namespace: gateway-system
```

Use DNS to point multiple domains to the same Gateway IP.

### Custom Timeouts

Increase timeout for longer SSE connections:
```yaml
gateway:
  name: cluster-gateway
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

---

## Verification Steps

After deployment, verify everything is working:

### 1. Check Resources (Reference Mode)
```bash
# Verify Gateway exists (platform team's namespace)
kubectl get gateway cluster-gateway -n gateway-system

# Verify HTTPRoute references it (your namespace)
kubectl get httproute -n dot-ai
kubectl describe httproute -n dot-ai | grep -A 5 parentRefs

# Check Services and Pods (your namespace)
kubectl get svc,pod -n dot-ai
```

### 2. Check Resources (Creation Mode)
```bash
# Verify Gateway created with -http suffix
kubectl get gateway -n dot-ai
# Should show: dot-ai-http (or <release-name>-dot-ai-http)

# Verify HTTPRoute references it
kubectl get httproute -n dot-ai
kubectl describe httproute -n dot-ai | grep -A 5 parentRefs

# Check Services and Pods
kubectl get svc,pod -n dot-ai
```

### 3. Get Gateway Address
```bash
# Reference mode (platform team's namespace)
kubectl get gateway cluster-gateway -n gateway-system -o jsonpath='{.status.addresses[0].value}'

# Creation mode (your namespace)
kubectl get gateway -n dot-ai -o jsonpath='{.items[0].status.addresses[0].value}'
```

### 4. Test HTTP Endpoint
```bash
# Replace with your hostname
curl http://dot-ai.example.com/
```

### 5. Test SSE Connection
```bash
# Test Server-Sent Events endpoint
curl -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  http://dot-ai.example.com/sse
```

### 6. For HTTPS: Verify Certificate
```bash
# Check TLS certificate
openssl s_client -connect dot-ai.example.com:443 -servername dot-ai.example.com < /dev/null 2>/dev/null | openssl x509 -text -noout | grep -A 2 "Subject:"
```

---

## Troubleshooting

### Gateway Not Found (Reference Mode)

```bash
# Check Gateway exists in platform namespace
kubectl get gateway cluster-gateway -n gateway-system

# Common issues:
# - Gateway not created by platform team
# - Wrong Gateway name in HTTPRoute
# - Wrong namespace specified

# Verify Gateway name and namespace
kubectl get gateway -A
```

### HTTPRoute Not Routing Traffic

```bash
# Check HTTPRoute status
kubectl describe httproute -n dot-ai

# Verify parentRef matches Gateway
kubectl get httproute -n dot-ai -o yaml | grep -A 5 "parentRefs"

# Common issues:
# - Gateway name mismatch
# - Gateway namespace mismatch
# - ReferenceGrant missing (for cross-namespace)
# - Backend Service doesn't exist
```

### Cross-Namespace Access Denied

```bash
# Check if ReferenceGrant exists
kubectl get referencegrant -n gateway-system

# Verify ReferenceGrant allows your namespace
kubectl describe referencegrant -n gateway-system

# Check Gateway allowedRoutes configuration
kubectl get gateway cluster-gateway -n gateway-system -o yaml | grep -A 10 "allowedRoutes"
```

### Gateway Name Conflict (Creation Mode)

```bash
# Verify Gateway has -http suffix
kubectl get gateway -n dot-ai

# Expected: dot-ai-http
# If no suffix, you may have naming conflicts

# Check for deployment conflicts
kubectl get deploy,gateway -n dot-ai
```

### DNS Record Not Created (external-dns)

```bash
# Check external-dns logs
kubectl logs -n external-dns -l app.kubernetes.io/name=external-dns

# Verify Gateway has external-dns annotation
kubectl get gateway -n dot-ai -o yaml | grep external-dns

# Check DNS resolution
dig +short dot-ai.example.com
```

---

## Migration from Ingress

If you're migrating from traditional Ingress to Gateway API:

1. Note your current Ingress hostname and TLS configuration
2. Platform team creates shared Gateway with same hostname
3. Deploy application with `gateway.name` (reference mode)
4. Verify Gateway is working
5. Update DNS to point to Gateway IP (if different)
6. Disable Ingress: `--set ingress.enabled=false`

See [Kubernetes Setup Guide](../../docs/setup/kubernetes-setup.md) for detailed migration steps.

---

## Additional Resources

- **[Gateway API Setup Guide](../../docs/setup/kubernetes-setup.md)** - Complete setup documentation
- **[Gateway API Official Docs](https://gateway-api.sigs.k8s.io/)** - Kubernetes Gateway API documentation
- **[Gateway API Best Practices](https://gateway-api.sigs.k8s.io/guides/best-practices/)** - Official best practices
- **[cert-manager Gateway API Integration](https://cert-manager.io/docs/usage/gateway/)** - cert-manager documentation
- **[external-dns Gateway API Support](https://github.com/kubernetes-sigs/external-dns/blob/master/docs/tutorials/gateway-api.md)** - external-dns documentation

---

## Support

For questions or issues:
- GitHub Issues: [vfarcic/dot-ai/issues](https://github.com/vfarcic/dot-ai/issues)
- GitHub Discussions: [vfarcic/dot-ai/discussions](https://github.com/vfarcic/dot-ai/discussions)
