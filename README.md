# DevOps AI Toolkit

<div align="center">

![DevOps AI Toolkit Logo](assets/images/logo.png)

</div>

DevOps AI Toolkit provides two powerful AI-driven capabilities: **Kubernetes deployment recommendations** that discover your cluster's capabilities and suggest optimal deployment approaches, and **automated documentation testing** that validates documentation accuracy by executing commands and testing examples.

## Who is this for?

### Kubernetes Deployment
- **Developers**: Deploy applications without needing deep Kubernetes expertise
- **Platform Engineers**: *(Coming Soon)* Governance, policy enforcement, and organizational compliance features

### Documentation Testing  
- **Documentation Maintainers**: Automatically validate documentation accuracy and catch outdated content
- **Technical Writers**: Identify which sections need updates and prioritize work effectively
- **Open Source Maintainers**: Ensure documentation works correctly for new contributors

### AI Integration
- **AI Agents**: Integrate both capabilities with Claude Code, Cursor, or VS Code for conversational workflows

## Key Features

### Kubernetes Deployment Intelligence
🔍 **Smart Discovery**: Automatically finds all available resources and operators in your cluster  
🤖 **AI Recommendations**: Get deployment suggestions tailored to your specific cluster setup  
🔧 **Operator-Aware**: Leverages custom operators and CRDs when available  
🚀 **Complete Workflow**: From discovery to deployment with automated Kubernetes integration

### Documentation Testing & Validation
📖 **Automated Testing**: Validates documentation by executing commands and testing examples  
🔍 **Two-Phase Validation**: Tests both functionality (does it work?) and semantic accuracy (are descriptions truthful?)  
🛠️ **Fix Application**: User-driven selection and application of recommended documentation improvements  
💾 **Session Management**: Resumable testing workflows for large documentation sets

### AI Integration
⚡ **MCP Integration**: Works seamlessly with Claude Code, Cursor, or VS Code through Model Context Protocol  
🤖 **Conversational Interface**: Natural language interaction for both deployment and documentation testing workflows

## Quick Start

### Prerequisites

**For both features:**
- **Claude API key** (required for AI analysis)
  - Get your API key from [Anthropic Console](https://console.anthropic.com/)
  - Set it as environment variable: `export ANTHROPIC_API_KEY=your_api_key_here`

**For Kubernetes deployment recommendations:**
- **kubectl** configured with cluster access
  - Verify cluster access with: `kubectl get nodes`
  - Should show your cluster nodes without authentication errors
<!-- dotai-ignore: kubectl requirement not verifiable in current environment -->

**For documentation testing:**
- **Documentation files** to test (Markdown, HTML, etc.)
- **File system access** to the documentation you want to validate

### Installation

DevOps AI Toolkit is designed to be used through AI development tools via MCP (Model Context Protocol). No direct installation needed - simply configure your AI tool to connect to the MCP server.

### Choose Your Usage Path

#### Option A: AI Agent Integration (Claude Code Example)
Perfect for conversational deployments with AI agents:

1. **Create `.mcp.json` in your project:**
```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here",
        "DOT_AI_SESSION_DIR": "./tmp/sessions",
        "KUBECONFIG": "~/.kube/config"
      }
    }
  }
}
```

**Environment Variables:**
- `ANTHROPIC_API_KEY`: Required for AI analysis (both features)
- `DOT_AI_SESSION_DIR`: Required session directory (relative paths are relative to where the AI agent is started)
- `KUBECONFIG`: Optional kubeconfig path for Kubernetes deployments (adjust to your actual kubeconfig location, defaults to `~/.kube/config`)

2. **Start Claude Code with MCP enabled:**
```bash
# Create session directory (relative to the project)
mkdir -p tmp/sessions

claude
```

3. **Use conversational workflows:**

**Example: Kubernetes Deployment**
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

📖 **[Complete MCP Setup Guide →](docs/mcp-setup.md)** - Detailed configuration, troubleshooting, and examples



## Troubleshooting

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
- **[MCP Setup Guide](docs/mcp-setup.md)** - AI tools integration (Claude Code, Cursor)
- **[MCP Recommendation Guide](docs/mcp-recommendation-guide.md)** - Kubernetes deployment recommendations  
- **[MCP Documentation Testing Guide](docs/mcp-documentation-testing-guide.md)** - Automated documentation validation

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
- **New to DevOps AI Toolkit?** → Start with [MCP Setup Guide](docs/mcp-setup.md)
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