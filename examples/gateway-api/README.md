# Gateway API Examples

> **📖 For complete deployment guide, see [Gateway API Deployment Guide](../../docs/setup/gateway-api.md)**

**This directory serves as a quick reference for users cloning the repository. All detailed examples, troubleshooting, and step-by-step guides are maintained in the documentation.**

## Quick Links

**Comprehensive Documentation:**
- **[Gateway API Deployment Guide](../../docs/setup/gateway-api.md)** - Complete guide with embedded YAML examples, troubleshooting, and best practices
- **[Kubernetes Setup Guide](../../docs/setup/kubernetes-setup.md)** - Main deployment guide with quick start

**Official Resources:**
- [Gateway API Documentation](https://gateway-api.sigs.k8s.io/)
- [Gateway API Best Practices](https://gateway-api.sigs.k8s.io/guides/best-practices/)

## Prerequisites

- Kubernetes 1.26+ cluster
- Gateway API CRDs v1.2+ installed
- Gateway controller running (Istio, Envoy Gateway, Kong, etc.)
- Helm 3.x

Install Gateway API CRDs:
```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml
```

## Quick Start

### Reference Pattern (RECOMMENDED for Production)

Platform team creates shared Gateway, application team references it:

```bash
# Application team deployment
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.168.0 \
  --namespace dot-ai \
  --create-namespace \
  --set gateway.name=cluster-gateway \
  --set gateway.namespace=gateway-system \
  --set secrets.auth.token="YOUR_TOKEN" \
  --set secrets.anthropic.apiKey="YOUR_KEY" \
  --set secrets.openai.apiKey="YOUR_KEY" \
  --wait
```

**See [Gateway API Deployment Guide](../../docs/setup/gateway-api.md) for platform team Gateway setup.**

### Creation Pattern (Development/Testing Only)

Creates a Gateway per application (NOT RECOMMENDED for production):

```bash
helm install dot-ai \
  oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.168.0 \
  --namespace dot-ai \
  --create-namespace \
  --set gateway.create=true \
  --set gateway.className=istio \
  --set gateway.listeners.http.hostname=dot-ai.example.com \
  --set secrets.auth.token="YOUR_TOKEN" \
  --set secrets.anthropic.apiKey="YOUR_KEY" \
  --set secrets.openai.apiKey="YOUR_KEY" \
  --wait
```

## Why Reference Pattern?

### ✅ RECOMMENDED: Reference existing Gateway

- Platform team manages shared Gateway infrastructure
- No per-application cloud load balancer costs
- Centralized Gateway configuration and policies
- Follows Gateway API best practices
- Avoids kGateway Envoy deployment naming collisions

### ⚠️ NOT RECOMMENDED: Create Gateway per application

- Creates separate load balancer per app ($$$)
- Violates Gateway API separation of concerns
- Can cause kGateway Envoy deployment naming conflicts

## Configuration Examples

### Reference Mode Values

```yaml
gateway:
  name: "cluster-gateway"
  namespace: "gateway-system"
  timeouts:
    request: "3600s"
    backendRequest: "3600s"
```

### Creation Mode Values (Dev/Test Only)

```yaml
gateway:
  create: true
  className: "istio"
  listeners:
    http:
      enabled: true
      hostname: "dot-ai.example.com"
  timeouts:
    request: "3600s"
    backendRequest: "3600s"
```

## Common Tasks

### Verify Deployment

**Check Gateway and HTTPRoute:**

```bash
# Check Gateway
kubectl get gateway -A

# Check HTTPRoute
kubectl get httproute -n dot-ai
kubectl describe httproute -n dot-ai

# Check Pods and Services
kubectl get pod,svc -n dot-ai
```

**Get Gateway IP:**

```bash
# Reference mode
kubectl get gateway cluster-gateway -n gateway-system -o jsonpath='{.status.addresses[0].value}'

# Creation mode
kubectl get gateway -n dot-ai -o jsonpath='{.items[0].status.addresses[0].value}'
```

**Verify MCP Connection:**

Verify the deployment through your MCP client by connecting to the configured endpoint. The client will validate the connection automatically.

## Need Help?

- **Full deployment guide:** [Gateway API Deployment Guide](../../docs/setup/gateway-api.md)
- **Troubleshooting:** See troubleshooting section in deployment guide
- **Issues:** [GitHub Issues](https://github.com/vfarcic/dot-ai/issues)
- **Discussions:** [GitHub Discussions](https://github.com/vfarcic/dot-ai/discussions)
