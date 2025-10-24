# Quick Start

**Get started with DevOps AI Toolkit in minutes - deploy applications, manage policies, and remediate issues using AI-powered Kubernetes workflows through MCP.**

## Overview

**What it does**: DevOps AI Toolkit provides AI-powered Kubernetes deployment, remediation, policy management, and capability discovery through conversational workflows in your MCP-enabled coding agent.

**Use when**: You want intelligent Kubernetes operations without memorizing commands, need AI-powered troubleshooting, or want to establish governance policies across your cluster.

**📖 Full Guide**: See [MCP Setup Guide](mcp-setup.md) for detailed configuration options and [Tools Overview](mcp-tools-overview.md) for complete feature reference.

## Prerequisites

**Works without AI keys:**
- ✅ **Shared prompts library** - No API key needed, works with any MCP-enabled coding agent

**For AI-powered features (deployment, remediation, patterns, policies, capabilities):**
- **AI Model API key** - Required for AI analysis and intelligent recommendations
  - **Multiple AI models supported** - see [AI Model Configuration](mcp-setup.md#ai-model-configuration) for all options and setup
  - **Quick setup**: Claude (default) - `export ANTHROPIC_API_KEY=your_key_here`

**For Kubernetes deployment recommendations:**
- **kubectl** configured with cluster access
  - Verify cluster access with: `kubectl get nodes`
  - Should show your cluster nodes without authentication errors

**For organizational pattern management:**
- **Vector DB service** (Qdrant) for pattern storage and semantic search
- **Embedding provider API key** (OpenAI, Google, or Mistral) - Required for semantic pattern matching

**For policy management and governance:**
- **Vector DB service** (Qdrant) for policy storage and semantic search
- **Embedding provider API key** (OpenAI, Google, or Mistral) - Required for semantic policy matching
- **Optional**: Kyverno installed in cluster for active policy enforcement

## Installation

DevOps AI Toolkit is designed to be used through AI development tools via MCP (Model Context Protocol). No direct installation needed - simply configure your AI tool to connect to the MCP server.

## Usage

**🎯 Recommended: Docker Setup (Complete Stack)**
Perfect for getting all features working immediately with minimal setup:

1. **Download Docker Compose configuration:**
```bash
curl -o docker-compose-dot-ai.yaml https://raw.githubusercontent.com/vfarcic/dot-ai/main/docker-compose-dot-ai.yaml
```

2. **Set environment variables and create MCP configuration:**
```bash
# Set your AI model API key (example with Claude - see setup guide for other models)
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
# Set embedding provider key if needed (see setup guide for options)
export OPENAI_API_KEY="sk-proj-your-openai-key-here"

# Create MCP configuration for Claude Code
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "dot-ai": {
      "command": "docker",
      "args": [
        "compose", 
        "-f",
        "docker-compose-dot-ai.yaml",
        "--env-file",
        ".env",
        "run", 
        "--rm",
        "--remove-orphans",
        "dot-ai"
      ]
    }
  }
}
EOF
```

**What you get:**
- ✅ **Complete Stack**: MCP server + Qdrant vector database included
- ✅ **All Features Working**: Capability management, pattern storage, policy governance, semantic search
- ✅ **No External Dependencies**: Everything runs in containers
- ✅ **Kubernetes Integration**: Direct kubectl access to your clusters

**Alternative Methods**: See the [MCP Setup Guide](mcp-setup.md) for NPX (Node.js) and Development setup options.

3. **Start your MCP client:**
```bash
claude  # or your preferred MCP-enabled AI tool

# Verify everything works by asking:
"Show dot-ai status"
```

4. **Use conversational workflows:**

**Example: Kubernetes Deployment**
```text
User: I want to deploy a web application to my cluster

Agent: I'll help you deploy a web application. Let me get recommendations. First, a few questions to provide better suggestions:

What type of web application is this? Is it for development or production?
Does it need external access?
[Uses recommend tool for clarification]

User: It's a production Node.js API that needs external access

Agent: Perfect! Based on your production requirements, I found 3 deployment options.
Let's use the Production Web Stack with external access.
What's your application name and container image?
[Uses recommend tool with refined intent]

User: App name is "myapp" and image is "myapp:v1.0.0"

Agent: Excellent! Generating production-ready manifests and deploying...
[Uses recommend tool with stage routing: chooseSolution → answerQuestion → generateManifests → deployManifests]

Agent: ✅ Successfully deployed! Your production API is running with external access.
```

**Example: Capability Management**
```text
User: I want to scan my cluster for resource capabilities to improve recommendations

[Uses manageOrgData with capabilities scanning]

Agent: Would you like to scan all cluster resources or specify a subset?
Options: 1) All resources 2) Specific subset

User: All resources in auto mode

Agent: Starting comprehensive cluster capability scan...
✅ Capability scan completed! Processed cluster resources successfully.

User: Now I need a PostgreSQL database

Agent: Let me get enhanced recommendations using your capability data.
[Uses recommend tool with capability pre-filtering]

Agent: Perfect! I found sqls.devopstoolkit.live as the top match - it's a managed database solution supporting PostgreSQL with multi-cloud capabilities and low complexity. Much better than the generic StatefulSet approach I would have suggested before!
```

**Example: Kubernetes Issue Remediation**
```text
User: Something is wrong with my database in postgres-demo namespace

Agent: I'll investigate the database issue using AI-powered analysis.
[Uses remediate tool for systematic investigation]

Agent: 🔍 Root Cause (95% confidence): PostgreSQL pod can't start because the required PersistentVolumeClaim 'postgres-pvc' is missing.

🔧 Recommended Fix: Create missing PVC
- Risk Level: Low  
- Command: kubectl apply [PVC manifest]

Choose execution: 1) Execute via MCP  2) Show commands

User: 1

Agent: ✅ Issue Resolved! Created postgres-pvc, pod transitioned to Running state. Database is operational!
```

**Example: Policy Management**
```text
User: I want to create a policy requiring resource limits on all deployments

Agent: I'll help you create a governance policy for resource limits. Let me start the creation workflow.
[Uses manageOrgData with policy creation]

Agent: Please describe your resource limits policy intent:

User: All container deployments must have CPU and memory limits to prevent resource exhaustion. CPU limits should be between 100m-2000m, memory between 128Mi-4Gi.

Agent: Excellent! I've created your Resource Limits Policy and generated a Kyverno ClusterPolicy for enforcement. 

Would you like to:
1. Store policy intent only (for AI guidance)  
2. Apply Kyverno policy to cluster (active enforcement)

User: Apply the Kyverno policy for active enforcement

Agent: ✅ Policy deployed! Now when users deploy applications, they'll get required questions for CPU/memory limits with your specified ranges, and any non-compliant deployments will be blocked by Kyverno.
```

*Note: Conversational examples are illustrative - actual AI responses will vary based on specific context and implementation.*

**Example: Shared Prompts Library**
```text
# Conversational approach
User: I want to create a new PRD for a feature

Agent: I'll help you create a documentation-first PRD. Let me start the process.
[Uses prd-create prompt via /dot-ai:prd-create]

Agent: Great! I've created GitHub issue #34 and the PRD file. What feature would you like to document?

# Direct slash command approach  
User: /dot-ai:prd-create

Agent: I'm executing the PRD creation workflow. Please describe the feature you want to create a PRD for...
```

## Next Steps

📖 **[MCP Setup Guide →](mcp-setup.md)** - Detailed configuration, troubleshooting, and examples

📖 **[Complete Tools & Features Reference →](mcp-tools-overview.md)** - Comprehensive guide to all available tools, workflows, and advanced features