# Quick Start

## Prerequisites

**For Kubernetes deployment and documentation testing:**
- **Claude API key** (required for AI analysis)
  - Get your API key from [Anthropic Console](https://console.anthropic.com/) (requires account login)
  <!-- dotai-ignore: Console URL may return 403 - expected behavior for auth-protected endpoint -->
  - Set it as environment variable: `export ANTHROPIC_API_KEY=your_api_key_here`

**For shared prompts library:**
- **No API key required** - Works with any MCP-enabled coding agent (other features like deployments do require ANTHROPIC_API_KEY)

**For Kubernetes deployment recommendations:**
- **kubectl** configured with cluster access
  - Verify cluster access with: `kubectl get nodes`
  - Should show your cluster nodes without authentication errors
<!-- dotai-ignore: kubectl verification command output format - implementation-specific -->

**For documentation testing:**
- **Documentation files** to test (Markdown, HTML, etc.)
- **File system access** to the documentation you want to validate

**For organizational pattern management:**
- **Vector DB service** (Qdrant) for pattern storage and semantic search
- **OpenAI API key** (required) for semantic pattern matching and vector operations

**For policy management and governance:**
- **Vector DB service** (Qdrant) for policy storage and semantic search
- **OpenAI API key** (required) for semantic policy matching and vector operations  
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
# Set your API keys
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
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
```
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
[Uses chooseSolution, answerQuestion, generateManifests, deployManifests]

Agent: ✅ Successfully deployed! Your production API is running with external access.
```

**Example: Capability Management**
```
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
```
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
```
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

**Example: Documentation Testing**
```
User: I want to test my README.md file to make sure all the examples work

Agent: I'll help you test your README.md for accuracy. Let me start a documentation testing session.
[Uses testDocs tool]

Agent: Found 6 testable sections in your README. Testing installation instructions...

✅ npm install command works correctly
❌ Configuration example has wrong port number (8080 vs 3000)
⚠️  Claims "works out of the box" but requires additional setup

Which issues would you like me to help you fix?

User: Fix the port number directly in the doc, and I'll create a GitHub issue for the setup requirements.

Agent: ✅ Documentation testing complete! Fixed 1 issue directly, 1 issue tracked externally.
```

*Note: Conversational examples are illustrative - actual AI responses will vary based on specific context and implementation.*

**Example: Shared Prompts Library**
```
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