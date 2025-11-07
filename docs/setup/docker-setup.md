# Docker Setup Guide

**Complete Docker deployment with MCP server + Qdrant vector database - all features included out-of-the-box.**

## When to Use This Method

✅ **Perfect for:**
- Individual developers running MCP locally
- Full-featured setup with all capabilities working immediately
- Local development and testing environments
- Users who want everything working without external dependencies

❌ **Consider alternatives for:**
- Company-wide or centralized deployments (use Docker with external orchestration)
- Environments without Docker

→ See [other setup methods](../mcp-setup.md#setup-methods) for alternatives

## What You Get

- **DevOps AI Toolkit MCP Server** - All Kubernetes deployment and testing features
- **Qdrant Vector Database** - Automatic setup for capability and pattern management
- **Complete Integration** - All features work immediately
- **Isolated Local Environment** - No conflicts with local Node.js or other services
- **Local Development Focus** - Perfect for individual developer workflows

## Prerequisites

- Docker and Docker Compose installed
- Kubernetes cluster access (kubectl configured)
- AI model API key (default: Anthropic). See [AI Model Configuration](../mcp-setup.md#ai-model-configuration) for available model options.
- OpenAI API key (for enhanced semantic search)

## Quick Start (2 Minutes)

### 1. Download Docker Compose Configuration

```bash
# Download Docker Compose configuration
curl -o docker-compose-dot-ai.yaml https://raw.githubusercontent.com/vfarcic/dot-ai/main/docker-compose-dot-ai.yaml
```

### 2. Set Environment Variables

**All environment variables from the [Configuration Overview](../mcp-setup.md#configuration-overview) can be used with Docker setup.** Variables must be added to the `docker-compose-dot-ai.yaml` file's `environment:` section to be passed to the container.

**Quick start example:**

```bash
# Required: Anthropic API key
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Required: OpenAI API key for enhanced semantic search
export OPENAI_API_KEY="sk-proj-..."

# Optional: Custom Docker images and ports (defaults shown)
export DOT_AI_IMAGE="ghcr.io/vfarcic/dot-ai:0.68.0"  # See available versions: https://github.com/vfarcic/dot-ai/pkgs/container/dot-ai
export QDRANT_IMAGE="qdrant/qdrant:v1.7.4"
export QDRANT_PORT="6333"

# Optional: Custom kubeconfig path (defaults to ~/.kube/config)
export KUBECONFIG="/path/to/your/kubeconfig.yaml"

# Optional: Custom endpoints (OpenRouter, self-hosted)
# See: https://github.com/vfarcic/dot-ai/blob/main/docs/mcp-setup.md#custom-endpoint-configuration
export CUSTOM_LLM_API_KEY="sk-or-v1-..."
export CUSTOM_LLM_BASE_URL="https://openrouter.ai/api/v1"
export AI_PROVIDER="openai"
export AI_MODEL="anthropic/claude-3.5-sonnet"

# Optional: Observability/Tracing (OpenTelemetry)
# See: https://github.com/vfarcic/dot-ai/blob/main/docs/observability-guide.md for complete tracing configuration
export OTEL_TRACING_ENABLED="true"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318/v1/traces"
```

### 3. Create and Save MCP Client Configuration

Create your MCP configuration file with this content:

```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "docker",
      "args": [
        "compose", 
        "-f",
        "docker-compose-dot-ai.yaml",
        "run", 
        "--rm",
        "--remove-orphans",
        "dot-ai"
      ]
    }
  }
}
```

**What this does:**
- **`"dot-ai"`** - Server name (you'll see this in your MCP client)
- **`"command": "docker"`** - Uses Docker to run the MCP server
- **`"compose"` and `-f` flag** - Runs the specific Docker Compose file
- **`"run --rm --remove-orphans"`** - Runs container and cleans up after use

**🔧 Multi-Project Support**: To run multiple dot-ai instances simultaneously, use environment variables to create isolated containers and data:

**For additional projects**, set these environment variables:
```bash
export QDRANT_NAME=my-project-qdrant
export QDRANT_PORT=6334
```

This creates:
- **Unique containers**: `my-project-qdrant` (vs default `qdrant`)
- **Separate ports**: `6334` (vs default `6333`) 
- **Isolated data**: `my-project-qdrant-data` volume

**Benefits**: Complete isolation between projects with separate Qdrant databases and no port conflicts.

**Save this configuration:**
- **Claude Code**: Save as `.mcp.json` in your project directory
- **Other clients**: See [MCP client configuration](../mcp-setup.md#mcp-client-compatibility) for filename and location

### 4. Start Your MCP Client

Start your MCP client (e.g., `claude` for Claude Code). The client will automatically manage the Docker containers.

**Multi-Project Isolation:** Each project name creates completely isolated containers, volumes, and networks. Projects can run simultaneously without conflicts.

### 5. Verify Everything Works

In your MCP client, ask:
```
Show dot-ai status
```

You should see comprehensive system status with all components showing ✅.

## Configuration Reference

### Environment File Setup

For easier variable management, consider using a `.env` file (see [Environment Variable Management](../mcp-setup.md#environment-variable-management) in the main setup guide). The MCP configuration above includes `--env-file .env` to automatically load your environment variables.

## Data Persistence

**Qdrant Vector Database**: Data is automatically persisted using project-scoped Docker volumes (e.g., `my-project-dot-ai-qdrant-data`). Each project maintains separate organizational patterns and capabilities.

**Session Data**: Not persisted by default. Sessions are temporary and cleared when containers restart.

**Multi-Project Data Isolation**: Each project name creates its own isolated volume, so different projects don't share organizational data.

## Advanced Configuration

### Custom Resource Limits

Add resource limits to `docker-compose-dot-ai.yaml`:

```yaml
services:
  dot-ai:
    # ... existing config
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
          
  qdrant:
    # ... existing config
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
```

### External Qdrant

To use external Qdrant instead of the bundled one:

1. **Remove Qdrant service from Docker Compose file**:
   Edit `docker-compose-dot-ai.yaml` and delete the entire `qdrant:` service section (including all its sub-configurations like `image:`, `ports:`, `volumes:`, etc.)

2. **Set external Qdrant connection**:
   Set `QDRANT_URL` and `QDRANT_API_KEY` environment variables using any method from the [Environment Variable Management](../mcp-setup.md#environment-variable-management) guide.

3. **Run Qdrant externally** however you prefer (cloud service, separate container, etc.)

The MCP client will automatically connect to your external Qdrant using the environment variables.

## Troubleshooting

For troubleshooting guidance, see the [Troubleshooting section](../mcp-setup.md#troubleshooting) in the main setup guide.

## Security Considerations

### API Key Management

See [Environment Variable Management](../mcp-setup.md#environment-variable-management) for security best practices.

### Container Security

- Containers run with minimal privileges
- Read-only kubeconfig mounting
- Qdrant is only exposed locally (127.0.0.1:6333)

## Next Steps

Once your Docker setup is complete, see the [Next Steps section](../mcp-setup.md#next-steps) in the main setup guide for guidance on exploring features and advanced usage.

## See Also

- [MCP Setup Guide](../mcp-setup.md) - Method comparison and feature overview
- [NPX Setup](npx-setup.md) - Alternative setup without Docker
- [Development Setup](development-setup.md) - For toolkit development
- [Tools and Features Overview](../mcp-tools-overview.md) - Complete guide to all available tools