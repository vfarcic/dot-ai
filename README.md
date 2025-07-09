# DevOps AI Toolkit

<div align="center">

![DevOps AI Toolkit Logo](assets/images/logo.png)

</div>

DevOps AI Toolkit discovers your cluster's capabilities and uses AI to recommend the optimal way to deploy your applications. Works with any Kubernetes cluster, from basic setups to clusters with advanced operators like Crossplane or ArgoCD.

## Who is this for?

- **Developers**: Deploy applications without needing deep Kubernetes expertise
- **AI Agents**: Integrate with Claude Code, Cursor, or VS Code for conversational deployments
- **Platform Engineers**: *(Coming Soon)* Governance, policy enforcement, and organizational compliance features

## Key Features

🔍 **Smart Discovery**: Automatically finds all available resources and operators in your cluster  
🤖 **AI Recommendations**: Get deployment suggestions tailored to your specific cluster setup  
⚡ **Two Usage Modes**: Use directly via CLI or integrate with AI development tools  
🔧 **Operator-Aware**: Leverages custom operators and CRDs when available  
🚀 **Complete Workflow**: From discovery to deployment with automated Kubernetes integration

## Quick Start

### Prerequisites
- **Node.js 18+** and **kubectl** configured with cluster access
- **Claude API key** (required for AI recommendations)

### Installation

**For CLI usage:**
```bash
# Install globally for command-line usage
npm install -g @vfarcic/dot-ai

# Required: Set up Claude API key
export ANTHROPIC_API_KEY=your_api_key_here

# Verify installation
dot-ai --version
```

**For MCP/AI Agent usage:** No installation needed - uses npx automatically

### Choose Your Usage Path

#### Option A: AI Agent Integration (Claude Code Example)
Perfect for conversational deployments with AI agents:

1. **Create `.mcp.json` in your project:**
```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here",
        "DOT_AI_SESSION_DIR": "./tmp/sessions",
        "KUBECONFIG": "./configs/my-cluster.yaml"
      }
    }
  }
}
```

**Environment Variables:**
- `ANTHROPIC_API_KEY`: Required for AI recommendations
- `DOT_AI_SESSION_DIR`: Required session directory (supports relative paths)
- `KUBECONFIG`: Optional kubeconfig path (supports relative paths, defaults to `~/.kube/config`)

2. **Start Claude Code with MCP enabled:**
```bash
# Create session directory (relative to dot-ai cwd)
mkdir -p tmp/sessions
claude
```

3. **Use conversational workflow:**

**Example conversation with AI agent:**
```
User: I want to deploy a web application to my cluster

Agent: I'll help you deploy a web application. Let me get recommendations based on your cluster.
[Uses recommend tool]

Agent: I found 3 options. Let's use Kubernetes Deployment + Service. 
What's your application name and container image?

User: App name is "myapp" and image is "nginx:latest"

Agent: Perfect! Generating manifests and deploying now...
[Uses chooseSolution, answerQuestion, generateManifests, deployManifests]

Agent: ✅ Successfully deployed! Your application is running.
```

📖 **[Complete MCP Setup Guide →](docs/mcp-guide.md)** - Detailed configuration, troubleshooting, and examples

#### Option B: Command Line Interface
For scripting and direct usage (requires global installation):

```bash
# 1. Get AI recommendations (includes cluster discovery)
dot-ai recommend --intent "deploy a web application" --session-dir ./tmp

# 2. Choose a solution
dot-ai choose-solution --solution-id sol_xxx --session-dir ./tmp

# 3. Configure step-by-step (all stages required)
dot-ai answer-question --solution-id sol_xxx --stage required --answers {...}
dot-ai answer-question --solution-id sol_xxx --stage basic --answers {}
dot-ai answer-question --solution-id sol_xxx --stage advanced --answers {}
dot-ai answer-question --solution-id sol_xxx --stage open --answers {"open":"N/A"}

# 4. Generate manifests
dot-ai generate-manifests --solution-id sol_xxx --session-dir ./tmp

# 5. Deploy to cluster
dot-ai deploy-manifests --solution-id sol_xxx --session-dir ./tmp
```

📖 **[Complete CLI Guide →](docs/cli-guide.md)** - Detailed command-line interface documentation

## Troubleshooting

### Installation Issues

**Package not found:**
```bash
# If you get "package not found" errors:
npm cache clean --force
npm install -g @vfarcic/dot-ai
```

**Permission errors on global install:**
```bash
# Use npm's recommended approach for global packages:
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g @vfarcic/dot-ai
```

### CLI Issues

**"dot-ai: command not found":**
- Ensure global installation: `npm install -g @vfarcic/dot-ai`
- Check PATH includes npm global bin: `npm config get prefix`
- Verify installation: `npm list -g @vfarcic/dot-ai`

### MCP Issues

**MCP server won't start:**
- Verify environment variables are set in `.mcp.json`
- Check session directory exists and is writable
- Ensure `ANTHROPIC_API_KEY` is valid

**"No active cluster" errors:**
- Verify kubectl connectivity: `kubectl cluster-info`
- Check KUBECONFIG path in environment variables
- Test cluster access: `kubectl get nodes`

## Documentation

### 🚀 Getting Started
- **[CLI Guide](docs/cli-guide.md)** - Complete command-line usage and examples
- **[MCP Integration Guide](docs/mcp-guide.md)** - AI tools integration (Claude Code, Cursor)

### 👩‍💻 Development  
- **[API Reference](docs/API.md)** - TypeScript interfaces and programmatic usage
- **[Development Guide](docs/DEVELOPMENT.md)** - Contributing, setup, and testing

### 🏗️ Architecture
- **[Design Overview](docs/design.md)** - Technical design and principles  
- **[Stage-Based API](docs/STAGE_BASED_API.md)** - Workflow stages and API design
- **[Discovery Engine](docs/discovery-engine.md)** - Cluster resource discovery

### 🤖 AI & Integration
- **[Error Handling](docs/error-handling.md)** - Error management and debugging
- **[Function Registration](docs/function-registration.md)** - Tool and function management

### 📋 Reference
- **[Context & Background](docs/CONTEXT.md)** - Project context and inspiration
- **[Next Steps & Roadmap](docs/NEXT_STEPS.md)** - Planned features and future vision

**Quick Navigation:**
- **New to DevOps AI Toolkit?** → Start with [CLI Guide](docs/cli-guide.md) or [MCP Guide](docs/mcp-guide.md)
- **Building integrations?** → See [API Reference](docs/API.md)
- **Contributing code?** → Read [Development Guide](docs/DEVELOPMENT.md)
- **Understanding architecture?** → Check [Design Overview](docs/design.md)

## Support

- **Issues**: [GitHub Issues](https://github.com/vfarcic/dot-ai/issues)

## Contributing

We welcome contributions! See the [Development Guide](docs/DEVELOPMENT.md) for details on:
- Setting up the development environment
- Running tests  
- Code style and conventions
- Submitting pull requests

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**DevOps AI Toolkit** - Making Kubernetes deployment intelligent and accessible for everyone.