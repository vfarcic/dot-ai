# Development Setup Guide

**Source code development with hot-reload and debugging - external Qdrant required for full features.**

## When to Use This Method

✅ **Perfect for:**
- Contributing to the DevOps AI Toolkit project
- Developing new features or bug fixes
- Fast iteration development workflows
- Testing changes before publishing

❌ **Consider alternatives for:**
- Using the toolkit as an MCP server (use [MCP Setup Guide](../setup/mcp-setup.md))
- Production environments (use Kubernetes deployment)

→ See [MCP Setup Guide](../setup/mcp-setup.md) for production deployment

## What You Get

- **Source Code Access** - Full repository with all development tools
- **Hot-Reload Development** - Instant changes with `npm run build:watch`
- **Complete Test Suite** - 349+ tests for validation and development
- **Debug Configuration** - Source maps and debugging support
- **External Qdrant Required** - Manual setup needed for capability and pattern management

## Prerequisites

- Node.js 18+ and npm installed
- Git for repository cloning
- Kubernetes cluster access (kubectl configured)
- AI model API key (default: Anthropic). See [AI Model Configuration](../setup/mcp-setup.md#ai-model-configuration) for available model options.
- OpenAI API key (for enhanced semantic search)
- **External Qdrant setup** (see [Qdrant Setup](#qdrant-setup) section)

## Quick Start (5 Minutes)

### 1. Clone and Setup Repository

```bash
# Clone the repository
git clone https://github.com/vfarcic/dot-ai.git
cd dot-ai

# Install dependencies
npm install

# Build the project
npm run build
```

### 2. Start Qdrant Database

```bash
docker container run --detach --name qdrant --publish 6333:6333 --volume qdrant_storage:/qdrant/storage qdrant/qdrant:v1.7.4
```

### 3. Create MCP Client Configuration

Create your MCP configuration file with this content:

```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "node",
      "args": ["./dist/mcp/server.js"],
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

**Optional: Custom Endpoints** - Add to `env` for OpenRouter or self-hosted ([details](../setup/mcp-setup.md#custom-endpoint-configuration)):
```json
"CUSTOM_LLM_API_KEY": "sk-or-v1-...",
"CUSTOM_LLM_BASE_URL": "https://openrouter.ai/api/v1",
"AI_PROVIDER": "openai",
"AI_MODEL": "anthropic/claude-3.5-sonnet"
```

**Alternatively, use `.env` file** for easier variable management:
```bash
# .env
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
CUSTOM_LLM_API_KEY=sk-or-v1-...
CUSTOM_LLM_BASE_URL=https://openrouter.ai/api/v1
AI_PROVIDER=openai
AI_MODEL=anthropic/claude-3.5-sonnet
```

**What this does:**
- **`"dot-ai"`** - Server name (you'll see this in your MCP client)
- **`"command": "node"`** - Uses Node.js to run the compiled MCP server directly
- **`"./dist/mcp/server.js"`** - Relative path to the compiled server (works since you're in the project directory)
- **`"env"`** - Environment variables passed directly to the MCP server

**Save this configuration:**
- **Claude Code**: Save as `.mcp.json` in your project directory
- **Other clients**: See [MCP client configuration](../setup/mcp-setup.md#mcp-client-compatibility) for filename and location

### 4. Start Your MCP Client

Start your MCP client (e.g., `claude` for Claude Code). The client will run your locally built MCP server.

### 5. Verify Everything Works

In your MCP client, ask:
```
Show dot-ai status
```

You should see comprehensive system status. If Qdrant is not set up, you'll see warnings about missing vector database capabilities.

## Development Workflow

### Hot-Reload Development

For active development with automatic rebuilds:

```bash
# Terminal 1: Watch mode for continuous compilation
npm run build:watch

# Terminal 2: Run tests in watch mode (optional - builds once then watches)
npm run test:watch
```

After making changes:
1. The `build:watch` command automatically compiles your changes
2. Tests in watch mode will re-run automatically when files change
3. Restart your MCP client to load the new compiled version
4. Test your changes using the MCP client

### Testing and Validation

Before committing changes:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run full CI validation
npm run ci
```

**⚠️ MANDATORY**: All tests must pass before marking development work as complete. See [Testing Requirements](../../CLAUDE.md#testing-reminders) in CLAUDE.md.

## Qdrant Setup

The Quick Start above uses Docker to run Qdrant locally. For other deployment methods (cloud, local installation, custom configuration), see the [Qdrant documentation](https://qdrant.tech/documentation/install/). 

You'll need to update the `QDRANT_URL` in your MCP configuration accordingly, and add `QDRANT_API_KEY` if authentication is required.

## Configuration Reference

### Environment File Setup

For easier variable management, consider using a `.env` file (see [Environment Variable Management](../setup/mcp-setup.md#environment-variable-management) in the main setup guide).

### Development-Specific Configuration

- **Source maps**: Enabled by default in development builds (`npm run build:dev`)
- **Debug logging**: Set `DEBUG=*` environment variable for verbose logging
- **Test configuration**: Jest setup in `package.json` with 349+ tests

## Data Persistence

**Qdrant Vector Database**: Data persistence depends on your Qdrant setup method (Docker volumes, cloud storage, or local installation).

**Session Data**: Stored in `./sessions/` directory and persisted between development sessions.

**Build Artifacts**: Generated in `./dist/` directory - automatically rebuilt with `build:watch`

## Advanced Configuration

### Development with External Qdrant

For development with production-like Qdrant setup:

```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "node",
      "args": ["/absolute/path/to/dot-ai/dist/mcp/server.js"],
      "env": {
        "QDRANT_URL": "https://your-cloud-qdrant:6333",
        "QDRANT_API_KEY": "your-secure-api-key"
      }
    }
  }
}
```

### Debug Configuration

Enable source maps and detailed error reporting:

```bash
# Build with source maps
npm run build:dev

# Run with Node.js debugging
node --inspect dist/mcp/server.js
```

### Custom Build Targets

Available build commands:

- `npm run build` - Production build (no source maps)
- `npm run build:dev` - Development build (with source maps)
- `npm run build:watch` - Continuous development builds
- `npm run build:prod` - Optimized production build (no comments)

## Troubleshooting

For troubleshooting guidance, see the [Troubleshooting section](../setup/mcp-setup.md#troubleshooting) in the main setup guide.

### Development-Specific Issues

**Build failures:**
- Check TypeScript errors: `npm run lint`
- Clear build cache: `npm run clean && npm run build`
- Verify Node.js version: `node --version` (requires 18+)

**MCP client can't find server:**
- **Critical**: Ensure MCP configuration file is in the project root directory
- Check build completed successfully: `ls -la dist/mcp/server.js`
- Verify file permissions: `ls -la dist/mcp/server.js` (should be executable)

**Test failures:**
- Update dependencies: `npm install`
- Clear Jest cache: `npx jest --clearCache`
- Run specific test: `npm test -- --testNamePattern="pattern"`

## Security Considerations

### API Key Management

See [Environment Variable Management](../setup/mcp-setup.md#environment-variable-management) for security best practices.

### Development Security

- Never commit API keys to version control
- Use `.env.example` files for configuration templates
- Keep development Qdrant instances isolated from production

## Contributing Workflow

For contributing to the project:

1. **Fork the repository** on GitHub
2. **Create feature branch**: `git checkout -b feature/your-feature`
3. **Make changes** using the development workflow above
4. **Run tests**: `npm test` (all tests must pass)
5. **Submit pull request** with clear description

## Next Steps

Once your development setup is complete, see the [Next Steps section](../setup/mcp-setup.md#next-steps) in the main setup guide for guidance on exploring features and advanced usage.

## See Also

- [MCP Setup Guide](../setup/mcp-setup.md) - Production Kubernetes deployment
- [Tools and Features Overview](../guides/mcp-tools-overview.md) - Complete guide to all available tools