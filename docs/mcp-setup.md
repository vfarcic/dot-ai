# DevOps AI Toolkit MCP Server Setup Guide

**Complete setup guide for using DevOps AI Toolkit as an MCP (Model Context Protocol) server with AI development tools.**

## Overview

The DevOps AI Toolkit provides five main capabilities through MCP (Model Context Protocol):

1. **Kubernetes Deployment Recommendations** - AI-powered application deployment assistance with enhanced semantic understanding
2. **Capability Management** - Discover and store semantic resource capabilities for intelligent recommendation matching
3. **Pattern Management** - Organizational deployment patterns that enhance AI recommendations
4. **Documentation Testing** - Automated validation of documentation accuracy
5. **Shared Prompts Library** - Centralized prompt sharing via native slash commands

This guide helps you choose the right setup method and get started quickly.

## Setup Methods

Choose the method that best fits your environment and workflow:

### Method Comparison

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **[Docker](setup/docker-setup.md)** | Complete stack, no external dependencies | Requires Docker | Full-featured setup, containerized environments |  
| **[NPX](setup/npx-setup.md)** | Simple single-command start | Requires Node.js + manual Qdrant setup | Quick trials, environments with Node.js |
| **[Development](setup/development-setup.md)** | Fast iteration, easy debugging | Requires source build + manual Qdrant setup | Contributors, toolkit development |

### Infrastructure Dependencies

| Method | Qdrant Vector Database | Impact |
|--------|----------------------|---------|
| **NPX** | Must setup separately | Requires manual Qdrant setup |
| **Docker** | Included automatically | All features work out-of-the-box |  
| **Development** | Must setup separately | Requires manual Qdrant setup |

### Decision Tree

**🎯 Recommended setup** → [Docker Setup](setup/docker-setup.md) - Complete stack, all features working in 2 commands

**🔧 Don't like Docker?** → [NPX Setup](setup/npx-setup.md) - Uses Node.js, requires manual Qdrant setup

**🛠️ Development work** → [Development Setup](setup/development-setup.md) - Source code access and fast iteration

**🏗️ Production deployment** → Kubernetes Setup (coming in future release)

## Configuration Overview

All setup methods need the same core configuration, but handle it differently:

### Configuration Components

| Component | Purpose | Example |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Claude API key for AI analysis | `sk-ant-api03-...` |
| `DOT_AI_SESSION_DIR` | Directory for session storage | `./tmp/sessions` |
| `KUBECONFIG` | Path to Kubernetes configuration | `~/.kube/config` |
| `QDRANT_URL` | Qdrant vector database connection | `http://localhost:6333` |
| `OPENAI_API_KEY` | OpenAI key for enhanced semantic search | `sk-proj-...` |
| `QDRANT_API_KEY` | Qdrant API key (for cloud instances) | `your-qdrant-api-key` |

**Note**: How you configure these depends on your chosen setup method. See the individual setup guides for specific configuration instructions.

### Environment Variable Management

All setup methods benefit from using `.env` files for easier environment variable management:

#### Using .env Files

Create a `.env` file to manage environment variables consistently:

```bash
# Create environment file
cat > .env << 'EOF'
# Required API keys
ANTHROPIC_API_KEY=your_anthropic_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Custom Kubernetes config path
KUBECONFIG=/path/to/your/kubeconfig.yaml

# Additional variables specific to your chosen setup method
# (see individual setup guides for method-specific variables)
EOF
```

#### Security Best Practices

```bash
# Prevent accidental git commits
echo ".env" >> .gitignore

# Set restrictive file permissions
chmod 600 .env
```

#### Usage with Setup Methods

- **Docker**: `docker compose --env-file .env ...`
- **NPX**: Most tools automatically load `.env` files
- **Development**: Use `dotenv` package or similar

Each setup method guide shows how to use `.env` files with that specific approach.

## MCP Client Compatibility

The DevOps AI Toolkit works with any MCP-compatible coding agent or development tool.

### Popular MCP Clients

**Claude Code**
- Create `.mcp.json` in your project root with your chosen setup method configuration
- Start with `claude` - MCP tools automatically available

**Cursor**  
- Settings → "MCP Servers" → Add configuration → Restart

**Cline (VS Code Extension)**
- Configure in VS Code settings or extension preferences

**VS Code (with MCP Extension)**
- Add configuration to `settings.json` under `mcp.servers`

**Other MCP Clients**
- Any client supporting the Model Context Protocol standard
- Use the configuration pattern from your chosen setup method

### Configuration Pattern

Each setup method provides an MCP configuration that works with any compatible client:

```json
{
  "mcpServers": {
    "dot-ai": {
      // Method-specific command and arguments
      // See individual setup guides for details
    }
  }
}
```

## Getting Started

### 1. Choose Your Setup Method

- **Recommended**: [Docker Setup](setup/docker-setup.md) - Complete working system in 2 commands
- **Alternative**: [NPX Setup](setup/npx-setup.md) - If you prefer Node.js over Docker  
- **Development**: [Development Setup](setup/development-setup.md) - For contributing to the toolkit

### 2. Follow Setup Instructions

Each setup guide provides complete instructions:
- Prerequisites and dependencies
- Step-by-step configuration
- MCP client integration
- Troubleshooting guidance

### 3. Verify Installation

Test that everything is working:

```bash
# In your MCP client, ask:
"Show dot-ai status"

# Should display comprehensive system status including:
# - Version information
# - Vector DB connectivity  
# - API connections (Anthropic, OpenAI)
# - Kubernetes cluster connectivity
# - Available features and readiness
```

### 4. Explore Available Features

Once setup is complete, see [Key Features](../README.md#key-features) for detailed information about available capabilities and usage examples.

## Troubleshooting

If you encounter issues after setup, use the built-in diagnostics:

```bash
# In your MCP client, ask:
"Show dot-ai status"
```

This will show the status of all system components and help identify any problems.


## Next Steps

Once your MCP server is running:

### 1. Explore Feature Guides
- **[Capability Management Guide](mcp-capability-management-guide.md)** - Semantic resource discovery (recommended first step for Kubernetes users)
- **[MCP Recommendation Guide](mcp-recommendation-guide.md)** - AI-powered deployment recommendations
- **[Pattern Management Guide](pattern-management-guide.md)** - Organizational deployment patterns
- **[Documentation Testing Guide](mcp-documentation-testing-guide.md)** - Automated documentation validation
- **[Prompts Guide](mcp-prompts-guide.md)** - Shared prompt library and slash commands

### 2. Production Considerations
- For production workloads, plan for Kubernetes-based deployment (coming in future release)
- Consider backup strategies for vector database content (organizational patterns and capabilities)

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/vfarcic/dot-ai/issues)