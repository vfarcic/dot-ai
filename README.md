# DevOps AI Toolkit

<div align="center">

![DevOps AI Toolkit Logo](assets/images/logo.png)

</div>

DevOps AI Toolkit is an AI-powered development productivity platform that enhances software development workflows through intelligent automation and AI-driven assistance.

📚 [Quick Start](./docs/quick-start.md) | 🔧 [MCP Setup](./docs/mcp-setup.md) | 🛠️ [Features & Tools](./docs/mcp-tools-overview.md)

## Who is this for?

### Kubernetes Deployment
- **Developers**: Deploy applications without needing deep Kubernetes expertise
- **Platform Engineers**: Create organizational deployment patterns that enhance AI recommendations with institutional knowledge and best practices, and scan cluster resources to enable semantic matching for dramatically improved recommendation accuracy
- **Security Engineers**: Define governance policies that integrate into deployment workflows with optional Kyverno enforcement

### Kubernetes Issue Remediation
- **DevOps Engineers**: Quickly diagnose and fix Kubernetes issues without deep troubleshooting expertise
- **SRE Teams**: Automate root cause analysis and generate executable remediation commands
- **Support Teams**: Handle incident response with AI-guided investigation and repair workflows

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
- **REST API**: Access all tools via standard HTTP endpoints for CI/CD pipelines, automation scripts, and traditional applications

## Key Features

### Kubernetes Deployment Intelligence
🔍 **Smart Discovery**: Automatically finds all available resources and operators in your cluster  
🧠 **Semantic Capability Management**: Discovers what each resource actually does for intelligent matching  
🤖 **AI Recommendations**: Smart intent clarification gathers missing context, then provides deployment suggestions tailored to your specific cluster setup with enhanced semantic understanding  
🔧 **Operator-Aware**: Leverages custom operators and CRDs when available  
🚀 **Complete Workflow**: From discovery to deployment with automated Kubernetes integration

📖 [Learn more →](./docs/mcp-recommendation-guide.md)

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

📖 [Learn more about capability management →](./docs/mcp-capability-management-guide.md)

### Kubernetes Issue Remediation
🔍 **AI-Powered Root Cause Analysis**: Multi-step investigation loop identifies the real cause behind Kubernetes failures  
🛠️ **Executable Remediation**: Generates specific kubectl commands with risk assessment and validation  
⚡ **Dual Execution Modes**: Manual approval workflow or automatic execution based on confidence thresholds  
🔒 **Safety Mechanisms**: Automatic fallback to manual mode when validation discovers additional issues  
🎯 **Cross-Resource Intelligence**: Understands how pod issues may require fixes in different resource types (storage, networking, etc.)

📖 [Learn more →](./docs/mcp-remediate-guide.md)

### Documentation Testing & Validation
📖 **Automated Testing**: Validates documentation by executing commands and testing examples  
🔍 **Two-Phase Validation**: Tests both functionality (does it work?) and semantic accuracy (are descriptions truthful?)  
🛠️ **Fix Application**: User-driven selection and application of recommended documentation improvements  
💾 **Session Management**: Resumable testing workflows for large documentation sets

📖 [Learn more →](./docs/mcp-documentation-testing-guide.md)

### Organizational Pattern Management
🏛️ **Pattern Creation**: Define organizational deployment patterns that capture institutional knowledge  
🧠 **AI Enhancement**: Patterns automatically enhance deployment recommendations with organizational context  
🔍 **Semantic Search**: Uses Vector DB (Qdrant) for intelligent pattern matching based on user intent  
📋 **Best Practices**: Share deployment standards across teams through reusable patterns

📖 [Learn more →](./docs/pattern-management-guide.md)

### Policy Management & Governance
🛡️ **Policy Creation**: Define governance policies that guide users toward compliant configurations  
⚠️ **Compliance Integration**: Policies create required questions with compliance indicators during deployment  
🤖 **Kyverno Generation**: Automatically generates Kyverno ClusterPolicies for active enforcement  
🎯 **Proactive Governance**: Prevents configuration drift by embedding compliance into the recommendation workflow  
🔍 **Vector Storage**: Uses Qdrant Vector DB for semantic policy matching and retrieval

📖 [Learn more →](./docs/policy-management-guide.md)

### Shared Prompts Library
🎯 **Native Slash Commands**: Prompts appear as `/dot-ai:prompt-name` in your coding agent  
📚 **Curated Library**: Access proven prompts for code review, documentation, architecture, and project management  
🔄 **Zero Setup**: Connect to MCP server and prompts are immediately available across all projects  
🤝 **Team Consistency**: Standardized prompt usage with centralized management

📖 [Learn more →](./docs/mcp-prompts-guide.md)

### AI Integration
⚡ **MCP Integration**: Works seamlessly with Claude Code, Cursor, or VS Code through Model Context Protocol  
🤖 **Conversational Interface**: Natural language interaction for deployment, documentation testing, pattern management, and shared prompt workflows

**Setup Required**: See the [MCP Setup Guide](./docs/mcp-setup.md) for complete configuration instructions.

---
🚀 **Ready to deploy?** Jump to the [Quick Start](./docs/quick-start.md) guide to begin using DevOps AI Toolkit.
---

## See It In Action

[![DevOps AI Toolkit: AI-Powered Application Deployment](https://img.youtube.com/vi/8Yzn-9qQpQI/maxresdefault.jpg)](https://youtu.be/8Yzn-9qQpQI)

This video explains the platform engineering problem and demonstrates the Kubernetes deployment recommendation workflow from intent to running applications.

## Documentation

### 🚀 Getting Started
- **[MCP Setup Guide](docs/mcp-setup.md)** - Complete configuration instructions for AI tools integration
- **[Tools and Features Overview](docs/mcp-tools-overview.md)** - Comprehensive guide to all available tools and features

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

