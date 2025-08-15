# DevOps AI Toolkit

<div align="center">

![DevOps AI Toolkit Logo](assets/images/logo.png)

</div>

DevOps AI Toolkit is an AI-powered development productivity platform that enhances software development workflows through intelligent automation and AI-driven assistance.


## Who is this for?

### Kubernetes Deployment
- **Developers**: Deploy applications without needing deep Kubernetes expertise
- **Platform Engineers**: Create organizational deployment patterns that enhance AI recommendations with institutional knowledge and best practices, and scan cluster resources to enable semantic matching for dramatically improved recommendation accuracy

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
🧠 **Semantic Capability Management**: Discovers what each resource actually does for intelligent matching  
🤖 **AI Recommendations**: Get deployment suggestions tailored to your specific cluster setup with enhanced semantic understanding  
🔧 **Operator-Aware**: Leverages custom operators and CRDs when available  
🚀 **Complete Workflow**: From discovery to deployment with automated Kubernetes integration

#### Capability-Enhanced Recommendations
Transform how AI understands your cluster by discovering semantic capabilities of each resource:

**The Problem**: Traditional discovery sees `sqls.devopstoolkit.live` as a meaningless name among hundreds of resources.

**The Solution**: Capability management teaches the system that `sqls.devopstoolkit.live` handles PostgreSQL databases with multi-cloud support.

**Before Capability Management:**
```
User: "I need a PostgreSQL database"
AI: Gets 400+ generic resource names → picks complex multi-resource solution
Result: Misses optimal single-resource solutions
```

**After Capability Management:**
```
User: "I need a PostgreSQL database"  
AI: Gets pre-filtered relevant resources with rich context
Result: Finds sqls.devopstoolkit.live as perfect match ✨
```

**Get Started**: See the [Capability Management Guide](./docs/mcp-capability-management-guide.md) for complete workflows including cluster scanning, capability search, and recommendation enhancement.

### Documentation Testing & Validation
📖 **Automated Testing**: Validates documentation by executing commands and testing examples  
🔍 **Two-Phase Validation**: Tests both functionality (does it work?) and semantic accuracy (are descriptions truthful?)  
🛠️ **Fix Application**: User-driven selection and application of recommended documentation improvements  
💾 **Session Management**: Resumable testing workflows for large documentation sets

### Organizational Pattern Management
🏛️ **Pattern Creation**: Define organizational deployment patterns that capture institutional knowledge  
🧠 **AI Enhancement**: Patterns automatically enhance deployment recommendations with organizational context  
🔍 **Semantic Search**: Uses Vector DB technology for intelligent pattern matching based on user intent  
📋 **Best Practices**: Share deployment standards across teams through reusable patterns

### Shared Prompts Library
🎯 **Native Slash Commands**: Prompts appear as `/dot-ai:prompt-name` in your coding agent  
📚 **Curated Library**: Access proven prompts for code review, documentation, architecture, and project management  
🔄 **Zero Setup**: Connect to MCP server and prompts are immediately available across all projects  
🤝 **Team Consistency**: Standardized prompt usage with centralized management

### AI Integration
⚡ **MCP Integration**: Works seamlessly with Claude Code, Cursor, or VS Code through Model Context Protocol  
🤖 **Conversational Interface**: Natural language interaction for deployment, documentation testing, pattern management, and shared prompt workflows

**Setup Required**: See the [MCP Setup Guide](./docs/mcp-setup.md) for complete configuration instructions.

## Quick Start

### Prerequisites

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
- **OpenAI API key** (optional) for semantic pattern matching - falls back to keyword matching if not available
- See the [Pattern Management Guide](./docs/pattern-management-guide.md) for complete setup

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
        "KUBECONFIG": "~/.kube/config",
        "QDRANT_URL": "https://your-cluster.qdrant.io",
        "QDRANT_API_KEY": "your_qdrant_key",
        "OPENAI_API_KEY": "sk-proj-your_openai_key"
      }
    }
  }
}
```

**Note**: Replace all placeholder values (like `your_key_here`, `your-cluster.qdrant.io`) with your actual API keys and service URLs.

**Environment Variable Setup**: You can set these variables either:
- **In the `.mcp.json` file** (as shown above in the `env` section), OR  
- **As shell environment variables** (e.g., `export ANTHROPIC_API_KEY=your_key_here`), OR
- **A combination of both** (shell variables take precedence)

**Environment Variables:**
- `ANTHROPIC_API_KEY`: Required for AI analysis (Kubernetes deployments, documentation testing, pattern management). Not required for shared prompts library.
- `DOT_AI_SESSION_DIR`: Required session directory (relative paths are relative to where the AI agent is started)
- `KUBECONFIG`: Optional kubeconfig path for Kubernetes deployments (adjust to your actual kubeconfig location, defaults to `~/.kube/config`)
- `QDRANT_URL`: Required for pattern management - Vector DB endpoint
- `QDRANT_API_KEY`: Required for pattern management - Vector DB authentication  
- `OPENAI_API_KEY`: Optional for semantic pattern matching - enables enhanced pattern search

2. **Start Claude Code with MCP enabled:**
```bash
# Create session directory (relative to the project)
mkdir -p tmp/sessions

claude

# Verify MCP server connection by running `/mcp` command
# Example: type `/mcp` in Claude Code to see server status
# Expected output shows "dot-ai" server connected with available tools
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

**Example: Capability Management**
```
User: I want to scan my cluster for resource capabilities to improve recommendations

Agent: I'll help you scan your cluster to discover semantic capabilities. This will dramatically improve recommendation accuracy.
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