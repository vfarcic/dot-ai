# Quick Start

**Get started with DevOps AI Toolkit in minutes - deploy applications, manage policies, and remediate issues using AI-powered Kubernetes workflows through MCP.**

## Overview

**What it does**: DevOps AI Toolkit provides AI-powered Kubernetes deployment, remediation, policy management, and capability discovery through conversational workflows in your MCP-enabled coding agent.

**Use when**: You want intelligent Kubernetes operations without memorizing commands, need AI-powered troubleshooting, or want to establish governance policies across your cluster.

**📖 Full Guide**: See [MCP Setup Guide](setup/mcp-setup.md) for detailed configuration options and [Tools Overview](guides/mcp-tools-overview.md) for complete feature reference.

## Prerequisites

**Works without AI keys:**
- ✅ **Shared prompts library** - No API key needed, works with any MCP-enabled coding agent

**For AI-powered features (deployment, remediation, patterns, policies, capabilities):**
- **AI Model API key** - Required for AI analysis and intelligent recommendations
  - **Multiple AI models supported** - see [AI Model Configuration](setup/mcp-setup.md#ai-model-configuration) for all options and setup
  - **Quick setup**: Claude (default) - `export ANTHROPIC_API_KEY=your_key_here`

**For Kubernetes deployment recommendations:**
- **kubectl** configured with cluster access
  - Verify cluster access with: `kubectl get nodes`
  - Should show your cluster nodes without authentication errors

**For organizational pattern management:**
- **Vector DB service** (Qdrant) for pattern storage and semantic search
- **Embedding provider API key** - Required for semantic pattern matching:
  - OpenAI: `OPENAI_API_KEY`
  - Google: `GOOGLE_API_KEY`
  - Amazon Bedrock: AWS credentials via environment variables or `~/.aws/credentials`

**For policy management and governance:**
- **Vector DB service** (Qdrant) for policy storage and semantic search
- **Embedding provider API key** - Required for semantic policy matching (same options as above)
- **Optional**: Kyverno installed in cluster for active policy enforcement

## Installation

DevOps AI Toolkit is designed to be used through AI development tools via MCP (Model Context Protocol). No direct installation needed - simply configure your AI tool to connect to the MCP server.

## Usage

**🎯 Recommended: Kubernetes Setup (Full Features)**
Production-ready deployment with autonomous capability scanning via controller:

### Step 0: Create a Kubernetes Cluster (Optional)

Skip this step if you already have a Kubernetes cluster with an ingress controller.

**Prerequisites:** [Install Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) if you don't have it.

**Create a Kind cluster with ingress support:**
```bash
# Create Kind cluster configuration
cat > kind-config.yaml << 'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
EOF

# Create the cluster
kind create cluster --name dot-ai --config kind-config.yaml

# Install nginx ingress controller for Kind
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Wait for ingress controller to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

### Step 1: Set Environment Variables
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
export OPENAI_API_KEY="sk-proj-your-openai-key-here"
export DOT_AI_AUTH_TOKEN=$(openssl rand -base64 32)

# Ingress class - change to match your ingress controller (traefik, haproxy, etc.)
export INGRESS_CLASS_NAME="nginx"
```

### Step 2: Install via Helm
```bash
# Set versions from GitHub packages
export DOT_AI_VERSION="..."  # https://github.com/vfarcic/dot-ai/pkgs/container/dot-ai%2Fcharts%2Fdot-ai
export DOT_AI_CONTROLLER_VERSION="..."  # https://github.com/vfarcic/dot-ai-controller/pkgs/container/dot-ai-controller%2Fcharts%2Fdot-ai-controller

# Install controller (enables autonomous capability scanning)
helm install dot-ai-controller \
  oci://ghcr.io/vfarcic/dot-ai-controller/charts/dot-ai-controller:$DOT_AI_CONTROLLER_VERSION \
  --namespace dot-ai --create-namespace --wait

# Install MCP server
helm install dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --set secrets.anthropic.apiKey="$ANTHROPIC_API_KEY" \
  --set secrets.openai.apiKey="$OPENAI_API_KEY" \
  --set secrets.auth.token="$DOT_AI_AUTH_TOKEN" \
  --set ingress.enabled=true \
  --set ingress.className="$INGRESS_CLASS_NAME" \
  --set ingress.host="dot-ai.127.0.0.1.nip.io" \
  --set controller.enabled=true \
  --namespace dot-ai --wait
```

### Step 3: Create MCP Configuration

Create the MCP client configuration file with your auth token:

```bash
cat > .mcp.json << EOF
{
  "mcpServers": {
    "dot-ai": {
      "type": "http",
      "url": "http://dot-ai.127.0.0.1.nip.io",
      "headers": {
        "Authorization": "Bearer $DOT_AI_AUTH_TOKEN"
      }
    }
  }
}
EOF
```

**Note:** The `$DOT_AI_AUTH_TOKEN` variable is expanded when creating the file. Make sure you're in the same terminal session where you set the environment variables in Step 1.

### Step 4: Start Your MCP Client

```bash
claude  # or your preferred MCP-enabled AI tool
```

Verify everything works by asking:
```
Show dot-ai status
```

You should see a status report showing all components are healthy.

**What you get:**
- ✅ **Full Features**: All capabilities including autonomous scanning via controller
- ✅ **Production-Ready**: Scalable deployment with proper resource management
- ✅ **Automatic Capability Discovery**: Controller watches for CRD changes and scans automatically
- ✅ **Team Collaboration**: Shared MCP server accessible by multiple developers

**Alternative Methods**: See the [MCP Setup Guide](setup/mcp-setup.md) for Docker (local development) and NPX options.

### Step 5: Start Using Conversational Workflows

Try these example prompts to explore the toolkit:

| What You Want | Example Prompt | Guide |
|---------------|----------------|-------|
| Scan capabilities | Use controller (recommended) or "Scan my cluster for capabilities" | [Capability Management](guides/mcp-capability-management-guide.md) |
| Query cluster | "What databases are running?" | [Cluster Query](guides/mcp-query-guide.md) |
| Deploy an app | "I want to deploy a web application" | [Recommendation Guide](guides/mcp-recommendation-guide.md) |
| Operate resources | "Scale my database to 3 replicas" | [Operations Guide](guides/mcp-operate-guide.md) |
| Fix issues | "Something is wrong with my database" | [Remediation Guide](guides/mcp-remediate-guide.md) |
| Create patterns | "Create a pattern for database deployments" | [Pattern Management](guides/pattern-management-guide.md) |
| Create policies | "Create a policy requiring resource limits" | [Policy Management](guides/policy-management-guide.md) |
| Setup project | "Help me setup governance files" | [Project Setup Guide](guides/mcp-project-setup-guide.md) |
| Use prompts | `/dot-ai:prd-create` | [Prompts Guide](guides/mcp-prompts-guide.md) |

## Next Steps

📖 **[MCP Setup Guide →](setup/mcp-setup.md)** - Detailed configuration, troubleshooting, and examples

📖 **[Complete Tools & Features Reference →](guides/mcp-tools-overview.md)** - Comprehensive guide to all available tools, workflows, and advanced features