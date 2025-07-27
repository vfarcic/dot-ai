# DevOps AI Toolkit

<div align="center">

![DevOps AI Toolkit Logo](assets/images/logo.png)

</div>

DevOps AI Toolkit is an AI-powered development productivity platform that enhances software development workflows through intelligent automation and AI-driven assistance.

## Who is this for?

### Kubernetes Deployment
- **Developers**: Deploy applications without needing deep Kubernetes expertise
- **Platform Engineers**: *(Coming Soon)* Governance, policy enforcement, and organizational compliance features

### Documentation Testing  
- **Documentation Maintainers**: Automatically validate documentation accuracy and catch outdated content
- **Technical Writers**: Identify which sections need updates and prioritize work effectively
- **Open Source Maintainers**: Ensure documentation works correctly for new contributors

### Shared Prompts Library
- **Development Teams**: Share proven prompts across projects without file management
- **Project Managers**: Standardize workflows with consistent prompt usage across teams
- **Individual Developers**: Access curated prompt library via native slash commands

### AI Integration
- **AI Agents**: Integrate all capabilities with Claude Code, Cursor, or VS Code for conversational workflows

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

### Shared Prompts Library
🎯 **Native Slash Commands**: Prompts appear as `/dot-ai:prompt-name` in your coding agent  
📚 **Curated Library**: Access proven prompts for code review, documentation, architecture, and project management  
🔄 **Zero Setup**: Connect to MCP server and prompts are immediately available across all projects  
🤝 **Team Consistency**: Standardized prompt usage with centralized management

### AI Integration
⚡ **MCP Integration**: Works seamlessly with Claude Code, Cursor, or VS Code through Model Context Protocol  
🤖 **Conversational Interface**: Natural language interaction for deployment, documentation testing, and shared prompt workflows

**Setup Required**: See the [MCP Setup Guide](./docs/mcp-setup.md) for complete configuration instructions.

## Quick Start

### Prerequisites

**For Kubernetes deployment and documentation testing:**
- **Claude API key** (required for AI analysis)
  - Get your API key from [Anthropic Console](https://console.anthropic.com/) (requires account login)
  <!-- dotai-ignore: Console URL may return 403 - expected behavior for auth-protected endpoint -->
  - Set it as environment variable: `export ANTHROPIC_API_KEY=your_api_key_here`

**For shared prompts library:**
- **No API key required** - Works with any MCP-enabled coding agent

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

### Usage

**AI Agent Integration (Claude Code Example)**
Perfect for conversational AI-driven workflows:

1. **Create `.mcp.json` in your project:**
<!-- dotai-ignore: MCP server binary (dot-ai-mcp) only works through MCP client connections -->
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

# Verify MCP server connection
# You should see "dot-ai" listed as an available MCP server
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

📖 **[Complete MCP Setup Guide →](docs/mcp-setup.md)** - Detailed configuration, troubleshooting, and examples



## Troubleshooting

### MCP Issues

**MCP server won't start:**
- Verify environment variables are correctly configured in `.mcp.json` env section
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
- **[MCP Prompts Guide](docs/mcp-prompts-guide.md)** - Shared prompt library and slash commands

## Support

- **Issues**: [GitHub Issues](https://github.com/vfarcic/dot-ai/issues)

## Contributing

We welcome contributions! Please:
- Fork the repository and create a feature branch
- Run tests with `npm test` to ensure changes work correctly
- Follow existing code style and conventions
- Submit a pull request with a clear description of changes

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**DevOps AI Toolkit** - AI-powered development productivity platform for enhanced software development workflows.