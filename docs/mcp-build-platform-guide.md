# DevOps AI Toolkit MCP Build Platform Guide

**Complete guide for AI-powered platform operations through natural language - install tools, create clusters, and manage infrastructure conversationally.**

## Prerequisites

Before using this guide, complete the [MCP Setup](mcp-setup.md) to configure your MCP server with:
- DevOps AI Toolkit MCP server running
- AI model API key configured (see [AI Model Configuration](mcp-setup.md#ai-model-configuration) for supported models and setup)
- Nushell installed (or use Docker image which includes it)

**Required Dependencies:**

The following dependencies are needed **only if running the MCP server directly** (via `npx` or local development). If using the Docker image, all dependencies except cloud provider CLIs are pre-installed.

- **Nushell** (>= 0.95.0) - Required runtime for infrastructure scripts
  - Local installation: https://www.nushell.sh/book/installation.html
  - ✅ Pre-installed in Docker image
- **kubectl** - For Kubernetes operations
  - ✅ Pre-installed in Docker image

**Cloud Provider CLIs** (only needed for creating cloud clusters):
- **AWS CLI** - For EKS cluster creation (must be configured with credentials)
- **Azure CLI** - For AKS cluster creation (must be logged in with `az login`)
- **Google Cloud CLI** - For GKE cluster creation (must be authenticated)
- 📝 Note: These are NOT included in Docker image - mount credentials or configure from host

**Local Cluster Tools** (optional, for local development):
- **Docker** - For kind cluster creation (✅ Docker socket can be mounted into container)
- **kind** - For local Kubernetes clusters (✅ Pre-installed in Docker image)

## Overview

**What it does**: Provides conversational platform operations through natural language. Instead of remembering script paths, command syntax, or configuration options, you simply express your intent ("Install Argo CD", "Create an AWS cluster") and the AI guides you through the process, collecting necessary parameters conversationally and executing infrastructure operations automatically.

**Use when**: Building Kubernetes platforms, installing platform tools (Argo CD, Crossplane, cert-manager, etc.), creating clusters, or managing infrastructure without memorizing commands and scripts.

📖 **Full Guide**: This document covers the complete platform building workflow with detailed examples and real outputs.

### Key Features

The DevOps AI Toolkit buildPlatform feature provides:
- **Natural language operations** - Express intent without knowing script names or paths
- **Dynamic operation discovery** - Automatically discovers available operations from infrastructure scripts
- **Conversational parameter collection** - Guides you through configuration step-by-step
- **Zero-knowledge onboarding** - New users can successfully build platforms through conversation
- **Smart intent mapping** - AI understands variations like "Install Argo CD", "Set up ArgoCD", "Deploy Argo CD"
- **Multi-step workflows** - Complex operations broken down into manageable conversational steps
- **Session persistence** - Resume interrupted workflows where you left off

### How It Works

**Traditional Problem**: Platform engineers must:
- Know exact script paths and names
- Remember command-line argument syntax
- Look up configuration options in documentation
- Manually handle complex multi-parameter setups

**BuildPlatform Solution**: Conversational infrastructure operations through AI.

**Workflow**:
1. **Express Intent**: "Install Argo CD" (no need to know script paths)
2. **AI Discovers Operation**: Automatically finds the right infrastructure script
3. **Conversational Configuration**: AI asks for required parameters one at a time
4. **Confirmation**: Review configuration before execution
5. **Automatic Execution**: Scripts run with collected parameters
6. **Clear Results**: Success/failure feedback with actionable information

## Complete Workflow Examples

### Optional: Discovering Available Tools

Before expressing your intent, you can optionally discover what tools are available:

```md
User: What tools can I install with dot-ai?
```

```md
Agent: Let me discover all available platform operations for you.

[Uses mcp__dot-ai__buildPlatform with stage: 'list']

I found 21 platform tools available. Here are some key ones:

**GitOps & Delivery:**
- **ArgoCD** - GitOps continuous delivery (apply)
- **Argo Workflows** - Workflow engine (apply)

**Cloud Infrastructure:**
- **Crossplane** - Cloud-native control plane (apply, delete, publish)
- **ACK** - AWS Controllers for Kubernetes (apply, delete)
- **ASO** - Azure Service Operator (apply)

**Platform Tools:**
- **cert-manager** - Certificate management (apply)
- **Ingress** - Ingress controller (apply, delete)
- **Kyverno** - Policy engine (apply)

**Cluster Operations:**
- **Kubernetes cluster** - Create/destroy clusters (create, destroy)

... and 12 more tools available.

Would you like to install any of these tools?
```

### Example: Installing Argo CD

Let's install Argo CD, which demonstrates the conversational parameter collection workflow.

```md
User: Install Argo CD
```

```md
Agent: I'll help you install Argo CD.

[Uses mcp__dot-ai__buildPlatform with intent: "Install Argo CD"]

I found the ArgoCD installation operation. I need to collect a few configuration parameters:

**Parameters for ArgoCD:**
1. **host-name** (optional, string) - Hostname for Argo CD ingress (default: none)
2. **apply-apps** (optional, boolean) - Apply sample applications (default: true)
3. **ingress-class-name** (optional, string) - Ingress controller class (default: "traefik")

How would you like to configure these? You can provide all at once or I can ask one at a time.
```

```md
User: Use argocd.example.com as hostname, apply the apps, and use nginx as ingress class
```

```md
Agent: Perfect! Let me execute the installation with those parameters.

[Uses mcp__dot-ai__buildPlatform with stage: "submitAnswers", sessionId: "...", and answers]

✅ **ArgoCD installation started successfully!**

The installation is running in your cluster. You can monitor progress using:
- `kubectl get pods -n argocd` - Check pod status
- `kubectl get ingress -n argocd` - Verify ingress configuration

Once complete, access Argo CD at: https://argocd.example.com
```

**Key Points:**
- All parameters were optional with sensible defaults
- User provided values in natural language
- System executed the operation automatically
- Clear next steps provided for monitoring
