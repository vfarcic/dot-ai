---
sidebar_position: 5
---

# NPX Setup Guide

**Simple single-command start with Node.js runtime - external Qdrant required for full features.**

## When to Use This Method

✅ **Perfect for:**
- Environments with Node.js already installed
- Quick trials and evaluations
- Users who prefer npm-based workflows
- Environments where Docker is not available

❌ **Consider alternatives for:**
- Full-featured setup out-of-the-box (use [Docker](docker-setup.md) - includes Qdrant automatically)
- Local development and testing (use [Docker](docker-setup.md) for complete isolation)
- Production deployments (use Docker with external orchestration)

→ See [other setup methods](mcp-setup.md#setup-methods) for alternatives

## What You Get

- **DevOps AI Toolkit MCP Server** - All Kubernetes deployment and testing features
- **NPX Runtime** - Simple single-command execution via Node.js
- **External Qdrant Required** - Manual setup needed for capability and pattern management
- **Host System Integration** - Direct access to local files and kubectl configuration

## Prerequisites

- Node.js 18+ and npm installed
- Kubernetes cluster access (kubectl configured)
- AI model API key (default: Anthropic). See [AI Model Configuration](mcp-setup.md#ai-model-configuration) for available model options.
- OpenAI API key (for enhanced semantic search)
- **External Qdrant setup** (see [Qdrant Setup](#qdrant-setup) section)

## Quick Start (3 Minutes)

### 1. Start Qdrant Database

```bash
docker container run --detach --name qdrant --publish 6333:6333 --volume qdrant_storage:/qdrant/storage qdrant/qdrant:v1.7.4
```

### 2. Create MCP Client Configuration

Create your MCP configuration file with this content:

```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-api03-your-key-here",
        "OPENAI_API_KEY": "sk-proj-your-key-here",
        "QDRANT_URL": "http://localhost:6333",
        "KUBECONFIG": "/path/to/your/kubeconfig.yaml"
      }
    }
  }
}
```

**Optional: Custom Endpoints** - Add to `env` section for OpenRouter or self-hosted models ([details](mcp-setup.md#custom-endpoint-configuration)):
```json
"CUSTOM_LLM_API_KEY": "sk-or-v1-...",
"CUSTOM_LLM_BASE_URL": "https://openrouter.ai/api/v1",
"AI_PROVIDER": "openai",
"AI_MODEL": "anthropic/claude-3.5-sonnet"
```

**What this does:**
- **`"dot-ai"`** - Server name (you'll see this in your MCP client)
- **`"command": "npx"`** - Uses npx to run the published MCP server
- **`"-y"`** - Automatically confirms npx prompts without user interaction
- **`"--package=@vfarcic/dot-ai@latest"`** - Downloads and runs the latest version
- **`"dot-ai-mcp"`** - The actual MCP server binary within the package
- **`"env"`** - Environment variables passed directly to the MCP server

**Save this configuration:**
- **Claude Code**: Save as `.mcp.json` in your project directory
- **Other clients**: See [MCP client configuration](mcp-setup.md#mcp-client-compatibility) for filename and location

### 3. Start Your MCP Client

Start your MCP client (e.g., `claude` for Claude Code). The client will automatically run `npx` with the package when needed.

**Note:** Each time your MCP client starts the server, npx may download the latest version. This ensures you're always running current features but requires internet connectivity.

### 4. Verify Everything Works

In your MCP client, ask:
```
Show dot-ai status
```

You should see comprehensive system status. If Qdrant is not set up, you'll see warnings about missing vector database capabilities.

## Qdrant Setup

The Quick Start above uses Docker to run Qdrant locally. For other deployment methods (cloud, local installation, custom configuration), see the [Qdrant documentation](https://qdrant.tech/documentation/install/). 

You'll need to update the `QDRANT_URL` in your MCP configuration accordingly, and add `QDRANT_API_KEY` if authentication is required.

## Configuration Reference

### Environment File Setup

For easier variable management, consider using a `.env` file (see [Environment Variable Management](mcp-setup.md#environment-variable-management) in the main setup guide).

### NPX-Specific Configuration

- **Version pinning**: Use `@vfarcic/dot-ai@0.69.0` instead of `@latest` for consistent versions (see [available versions](https://www.npmjs.com/package/@vfarcic/dot-ai?activeTab=versions))
- **Offline usage**: NPX requires internet for first download per version
- **Cache location**: NPX caches packages in `~/.npm/_npx/` directory

## Data Persistence

**Qdrant Vector Database**: Data persistence depends on your Qdrant setup method (Docker volumes, cloud storage, or local installation).

**Session Data**: Stored in temporary directories and cleared when the npx process exits.

## Advanced Configuration

### Version Management

Pin to specific version for consistent environments:

```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@0.69.0", "dot-ai-mcp"]
    }
  }
}
```

See [npm package releases](https://www.npmjs.com/package/@vfarcic/dot-ai?activeTab=versions) for available versions.

### Custom Node.js Options

Add Node.js runtime options:

```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["--node-options=--max-old-space-size=4096", "@vfarcic/dot-ai@latest"]
    }
  }
}
```

### External Qdrant Configuration

For production Qdrant setups with authentication:

```bash
# Required environment variables
export QDRANT_URL="https://your-production-qdrant:6333"
export QDRANT_API_KEY="your-secure-api-key"
```

## Troubleshooting

For troubleshooting guidance, see the [Troubleshooting section](mcp-setup.md#troubleshooting) in the main setup guide.

### NPX-Specific Issues

**Package download failures:**
- Check internet connectivity
- Clear NPX cache: `npm cache clean --force`
- Try specific version: `@vfarcic/dot-ai@0.69.0`

**Node.js version conflicts:**
- Ensure Node.js 18+ is installed: `node --version`

## Security Considerations

### API Key Management

See [Environment Variable Management](mcp-setup.md#environment-variable-management) for security best practices.

### NPX Security

- NPX downloads packages from npm registry - ensure you trust the source
- Use version pinning in production to avoid unexpected updates

## Next Steps

Once your NPX setup is complete, see the [Next Steps section](mcp-setup.md#next-steps) in the main setup guide for guidance on exploring features and advanced usage.

## See Also

- [MCP Setup Guide](mcp-setup.md) - Method comparison and feature overview
- [Docker Setup](docker-setup.md) - Complete setup with bundled Qdrant
- [Tools and Features Overview](../guides/mcp-tools-overview.md) - Complete guide to all available tools