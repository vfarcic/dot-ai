# App-Agent

**Intelligent Kubernetes deployment made simple**

Discover what's available in your cluster and get AI-powered recommendations for deploying your applications using the best resources for your needs.

## What is App-Agent?

App-Agent analyzes your Kubernetes cluster to understand what resources and operators are available, then uses AI to recommend the optimal way to deploy your applications. Whether you have a basic cluster or one with advanced operators like Crossplane or ArgoCD, App-Agent adapts to work with what you have.

## Key Benefits

🔍 **Cluster-Aware**: Automatically discovers your cluster's capabilities  
🤖 **AI-Powered**: Get intelligent deployment recommendations  
⚡ **Zero Configuration**: Works with any Kubernetes cluster out of the box  
🔧 **Operator-Friendly**: Leverages custom operators when available  
📝 **Interactive**: Asks the right questions to refine your deployment

## Quick Start

### Installation

```bash
# Clone and install
git clone https://github.com/your-org/app-agent.git
cd app-agent
npm install && npm run build
```

### Get Recommendations

```bash
# Discover what's in your cluster
node dist/cli.js discover

# Get AI recommendations for your application
node dist/cli.js recommend --intent "deploy a web application with database"

# Enhance recommendations with specific requirements
node dist/cli.js enhance --solution solution.json
```

### Set up AI Features (Optional)

For AI-powered recommendations, add your Claude API key:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

## How It Works

### 1. Discover Your Cluster
App-Agent scans your cluster to find all available resources - both standard Kubernetes resources and custom resources from operators.

```bash
node dist/cli.js discover
# Shows: Deployments, Services, Pods, AppClaims, CloudRun, etc.
```

### 2. Get AI Recommendations  
Describe what you want to deploy and get intelligent recommendations based on what's actually available in your cluster.

```bash
node dist/cli.js recommend --intent "deploy a web application that can scale"
# Returns: Ranked solutions using your cluster's best resources
```

### 3. Refine with Requirements
Enhance recommendations by describing additional requirements in plain English.

```bash
# Solution file contains questions with an "open" field where you add requirements
node dist/cli.js enhance --solution solution.json
# AI analyzes your requirements and completes missing configuration
```

## Example Workflow

```bash
# 1. See what's available
node dist/cli.js discover --output table

# 2. Get recommendations  
node dist/cli.js recommend --intent "deploy a microservice with database" > solution.json

# 3. Add your specific requirements to the solution.json file:
#    "open": { "answer": "needs to handle 1000 requests/sec, use PostgreSQL" }

# 4. Enhance the solution
node dist/cli.js enhance --solution solution.json > final-solution.json

# 5. Review the final configuration with all questions answered
cat final-solution.json
```

## Available Commands

```bash
# Discovery commands
app-agent discover [--kubeconfig PATH] [--output FORMAT]
app-agent explain RESOURCE [--field FIELD]
app-agent fingerprint [--detailed]

# AI-powered recommendations
app-agent recommend --intent "DESCRIPTION" [--output FORMAT]
app-agent enhance --solution PATH [--output FORMAT]

# Resource management  
app-agent apply CONFIG [--namespace NS]
app-agent delete RESOURCE [--all]

# Utility commands
app-agent version
app-agent help [COMMAND]
```

## Integration Options

### MCP Server
Use App-Agent as an MCP server for integration with AI tools and IDEs:

```bash
npm run mcp:start
# Compatible with Cursor, Claude Code, and other MCP-enabled tools
```

### Programmatic Usage
See the [API Documentation](docs/API.md) for TypeScript integration examples.

## Prerequisites

- **Node.js 18+**
- **kubectl** configured with cluster access
- **Claude API key** (optional, for AI features)

## Configuration

App-Agent automatically finds your kubeconfig file:
1. Custom path via `--kubeconfig` flag
2. `KUBECONFIG` environment variable  
3. Default `~/.kube/config`

```bash
# Optional: Custom kubeconfig location
export KUBECONFIG=/path/to/your/kubeconfig.yaml

# Optional: Claude AI API key (for AI features)
export ANTHROPIC_API_KEY=your_api_key_here
```

## Documentation

📖 **[Complete Documentation Index](docs/README.md)** - Browse all available documentation

### Key Documents
- **[API Reference](docs/API.md)** - Programmatic usage and TypeScript interfaces
- **[Development Guide](docs/DEVELOPMENT.md)** - Contributing, architecture, and testing
- **[Architecture Overview](docs/design.md)** - Technical design and principles

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/app-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/app-agent/discussions)

## Contributing

We welcome contributions! See the [Development Guide](docs/DEVELOPMENT.md) for details on:
- Setting up the development environment
- Running tests  
- Code style and conventions
- Submitting pull requests

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**App-Agent** - Making Kubernetes deployment intelligent and accessible for everyone.