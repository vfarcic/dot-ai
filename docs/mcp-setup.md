# DevOps AI Toolkit MCP Server Setup Guide

**Complete setup guide for using DevOps AI Toolkit as an MCP (Model Context Protocol) server with AI development tools.**

## Overview

The DevOps AI Toolkit provides main capabilities through MCP (Model Context Protocol):

1. **Kubernetes Deployment Recommendations** - AI-powered application deployment assistance with enhanced semantic understanding
2. **Capability Management** - Discover and store semantic resource capabilities for intelligent recommendation matching
3. **Pattern Management** - Organizational deployment patterns that enhance AI recommendations
4. **Policy Management** - Governance policies that guide users toward compliant configurations with optional Kyverno enforcement
5. **Kubernetes Issue Remediation** - AI-powered root cause analysis and automated remediation
6. **Shared Prompts Library** - Centralized prompt sharing via native slash commands
7. **REST API Gateway** - HTTP endpoints for all toolkit capabilities

This guide helps you choose the right setup method and get started quickly.

## See MCP Deployment Options in Action

[![How to Deploy and Run MCP Servers (NPX, Docker, Kubernetes, ToolHive)](https://img.youtube.com/vi/MHf-M8qOogY/maxresdefault.jpg)](https://youtu.be/MHf-M8qOogY)

This video demonstrates four different ways to deploy MCP servers, from local NPX execution to production-ready Kubernetes deployments. Watch a comprehensive comparison of deployment methods including security implications, isolation patterns, dependency management, and multi-user scenarios. See hands-on demonstrations of NPX, Docker, Kubernetes with standard resources, Kubernetes with ToolHive operator, plus coverage of cloud alternatives like Fly.io, Cloudflare Workers, AWS Lambda, Vercel, Railway, and Podman.

## Setup Methods

Choose the method that best fits your environment and workflow:

### Method Comparison

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **[Docker](setup/docker-setup.md)** | Complete stack, no external dependencies | Requires Docker | Full-featured setup, containerized environments |  
| **[Kubernetes](setup/kubernetes-setup.md)** | Full control, standard resources, HTTP transport | Requires K8s cluster + Helm | Teams wanting direct resource management |
| **[ToolHive](setup/kubernetes-toolhive-setup.md)** | Simplified management, built-in security, operator-managed | Requires K8s cluster + Helm + ToolHive operator | Teams preferring operator-managed deployments |
| **[NPX](setup/npx-setup.md)** | Simple single-command start | Requires Node.js + manual Qdrant setup | Quick trials, environments with Node.js |
| **[Development](setup/development-setup.md)** | Fast iteration, easy debugging | Requires source build + manual Qdrant setup | Contributors, toolkit development |

### Infrastructure Dependencies

| Method | Qdrant Vector Database | Impact |
|--------|----------------------|---------|
| **NPX** | Must setup separately | Requires manual Qdrant setup |
| **Docker** | Included automatically | All features work out-of-the-box |  
| **Kubernetes** | Included automatically | All features work out-of-the-box via Helm chart |
| **ToolHive** | Included automatically | All features work out-of-the-box via Helm chart |
| **Development** | Must setup separately | Requires manual Qdrant setup |

### Decision Tree

**🎯 Recommended setup** → [Docker Setup](setup/docker-setup.md) - Complete stack, all features working in 2 commands

**🚀 Production deployment** → [Kubernetes Setup](setup/kubernetes-setup.md) - Standard resources, full control, HTTP transport

**🔧 Operator-managed deployment** → [ToolHive Setup](setup/kubernetes-toolhive-setup.md) - Simplified management, built-in security

**🔧 Don't like Docker?** → [NPX Setup](setup/npx-setup.md) - Uses Node.js, requires manual Qdrant setup

**🛠️ Development work** → [Development Setup](setup/development-setup.md) - Source code access and fast iteration

## Configuration Overview

All setup methods need the same core configuration, but handle it differently:

### Configuration Components

| Component | Purpose | Example |
|----------|---------|---------|
| `AI_PROVIDER` | AI model selection (defaults to anthropic) | [See AI Model Configuration](#ai-model-configuration) |
| `EMBEDDINGS_PROVIDER` | Embedding provider selection (defaults to openai) | [See Embedding Provider Configuration](#embedding-provider-configuration) |
| `DOT_AI_SESSION_DIR` | Directory for session storage | `./tmp/sessions` |
| `KUBECONFIG` | Path to Kubernetes configuration | `~/.kube/config` |
| `QDRANT_URL` | Qdrant vector database connection | `http://localhost:6333` |
| `QDRANT_API_KEY` | Qdrant API key (for cloud instances) | `your-qdrant-api-key` |
| **AI Model API Keys** | **Corresponding API key for your chosen provider** | [See AI Model Configuration](#ai-model-configuration) |
| **Embedding Provider API Keys** | **Corresponding API key for your chosen embedding provider** | [See Embedding Provider Configuration](#embedding-provider-configuration) |
| **Tracing (Optional)** | OpenTelemetry distributed tracing | [See Observability Guide](observability-guide.md) |

**Note**: How you configure these depends on your chosen setup method. See the individual setup guides for specific configuration instructions.

**AI Keys Are Optional**: The MCP server starts successfully without AI API keys. Tools like **Shared Prompts Library** and **REST API Gateway** work without AI. AI-powered tools (deployment recommendations, remediation, pattern/policy management, capability scanning) require AI keys and will show helpful error messages when accessed without configuration.

### AI Model Configuration

The DevOps AI Toolkit supports multiple AI models. Choose your model by setting the `AI_PROVIDER` environment variable.

#### Model Requirements

All AI models must meet these minimum requirements:
- **Context window**: 200K+ tokens (some tools like capability scanning use large context)
- **Output tokens**: 8K+ tokens (for YAML generation and policy creation)
- **Function calling**: Required for MCP tool interactions

#### Available Models

| Provider | Model | AI_PROVIDER | API Key Required | Recommended |
|----------|-------|-------------|------------------|-------------|
| **Anthropic** | Claude Haiku 4.5 | `anthropic_haiku` | `ANTHROPIC_API_KEY` | Yes |
| **Anthropic** | Claude Opus 4.5 | `anthropic_opus` | `ANTHROPIC_API_KEY` | Yes |
| **Anthropic** | Claude Sonnet 4.5 | `anthropic` | `ANTHROPIC_API_KEY` | Yes |
| **AWS** | Amazon Bedrock | `amazon_bedrock` | AWS credentials ([see setup](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)) | Yes |
| **Google** | Gemini 3 Pro | `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | Yes (might be slow) |
| **Moonshot AI** | Kimi K2 | `kimi` | `MOONSHOT_API_KEY` | Yes |
| **Moonshot AI** | Kimi K2 Thinking | `kimi_thinking` | `MOONSHOT_API_KEY` | Yes (might be slow) |
| **OpenAI** | GPT-5.1 Codex | `openai` | `OPENAI_API_KEY` | No * |
| **xAI** | Grok-4 | `xai` | `XAI_API_KEY` | No * |

\* **Note**: These models may not perform as well as other providers for complex DevOps reasoning tasks.

**Configuration Steps:**

1. **Set your provider** (defaults to anthropic):
```bash
AI_PROVIDER=anthropic_haiku  # Example: using Claude Haiku 4.5
```

2. **Set the corresponding API key** (**only one** needed):
```bash
# Choose ONE based on your selected provider:

# For Claude models (Opus 4.5, Sonnet 4.5, Haiku 4.5)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# For OpenAI models (GPT-5.1 Codex)
OPENAI_API_KEY=your_openai_api_key_here

# For Google models (Gemini 2.5 Pro, Gemini 2.5 Flash)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here

# For xAI models (Grok-4)
XAI_API_KEY=your_xai_api_key_here

# For Moonshot AI models (Kimi K2, Kimi K2 Thinking)
MOONSHOT_API_KEY=your_moonshot_api_key_here

# For Amazon Bedrock (uses AWS credential chain)
# Set AWS credentials via environment variables, ~/.aws/credentials, or IAM roles
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AI_MODEL=anthropic.claude-sonnet-4-5-20250929-v1:0  # Bedrock model ID
```

### Embedding Provider Configuration

The DevOps AI Toolkit supports multiple embedding providers for semantic search capabilities in pattern management, capability discovery, and policy matching.

#### Available Embedding Providers

| Provider | EMBEDDINGS_PROVIDER | Model | Dimensions | API Key Required |
|----------|-------------------|-------|------------|------------------|
| **Amazon Bedrock** | `amazon_bedrock` | `amazon.titan-embed-text-v2:0` | 1024 | AWS credentials |
| **Google** | `google` | `text-embedding-004` | 768 | `GOOGLE_API_KEY` |
| **OpenAI** | `openai` (default) | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` |

**Configuration Steps:**

1. **Set your embedding provider** (defaults to openai):
```bash
EMBEDDINGS_PROVIDER=google  # Example: using Google embeddings
```

2. **Set the corresponding API key** (**only one** needed):
```bash
# Choose ONE based on your selected provider:

# For OpenAI embeddings (default)
OPENAI_API_KEY=your_openai_api_key_here

# For Google embeddings
GOOGLE_API_KEY=your_google_api_key_here

# For Amazon Bedrock embeddings (uses AWS credential chain)
# Set AWS credentials via environment variables, ~/.aws/credentials, or IAM roles
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
EMBEDDINGS_MODEL=amazon.titan-embed-text-v2:0  # Optional: defaults to Titan v2
```

**Notes:**
- **Same Provider**: If using the same provider for both AI models and embeddings (e.g., `AI_PROVIDER=google` and `EMBEDDINGS_PROVIDER=google`), you only need to set one API key
- **Mixed Providers**: You can use different providers for AI models and embeddings (e.g., `AI_PROVIDER=anthropic` with `EMBEDDINGS_PROVIDER=google`)
- **Embedding Support**: Not all AI model providers support embeddings. Anthropic does not provide embeddings; use OpenAI, Google, or Amazon Bedrock for embeddings

### Custom Endpoint Configuration

You can configure custom OpenAI-compatible endpoints for AI models. This enables using alternative providers like OpenRouter, self-hosted models, or air-gapped deployments.

#### Configuration Variables

| Variable | Purpose |
|----------|---------|
| `CUSTOM_LLM_BASE_URL` | Custom AI model endpoint URL |
| `CUSTOM_LLM_API_KEY` | API key for custom AI endpoint |
| `CUSTOM_EMBEDDINGS_BASE_URL` | Custom embeddings endpoint URL (OpenAI-compatible) |
| `CUSTOM_EMBEDDINGS_API_KEY` | API key for custom embeddings endpoint |
| `EMBEDDINGS_MODEL` | Custom embeddings model name (defaults to `text-embedding-3-small`) |
| `EMBEDDINGS_DIMENSIONS` | Custom embeddings dimensions (defaults to `1536`) |

#### Example: OpenRouter

OpenRouter provides access to 100+ LLM models from multiple providers:

```bash
# AI Model configuration via OpenRouter
export CUSTOM_LLM_API_KEY="sk-or-v1-your-key-here"
export CUSTOM_LLM_BASE_URL="https://openrouter.ai/api/v1"
export AI_PROVIDER=openai
export AI_MODEL="anthropic/claude-3.5-sonnet"

# Embeddings still use OpenAI directly (OpenRouter doesn't support embeddings)
export OPENAI_API_KEY="sk-proj-your-openai-key"
export EMBEDDINGS_PROVIDER=openai
```

**Note**: OpenRouter does not support embedding models. Use OpenAI, Google, or Amazon Bedrock for embeddings.

Get your OpenRouter API key at [https://openrouter.ai/](https://openrouter.ai/)

#### Environment Variable Management

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

**kagent (Kubernetes AI Agent Framework)**
- Requires Kubernetes-deployed MCP server (HTTP transport)
- See [kagent Setup Guide](setup/kagent-setup.md) for agent integration

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
- **Production**: [Kubernetes Setup](setup/kubernetes-setup.md) - Standard resources, full control, HTTP transport
- **Operator-managed**: [ToolHive Setup](setup/kubernetes-toolhive-setup.md) - Simplified deployment with built-in security
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

### 1. Explore Available Tools and Features
- **[Tools and Features Overview](mcp-tools-overview.md)** - Complete guide to all available tools, how they work together, and recommended usage flow

### 2. Enable Observability (Optional)
- **[Observability Guide](observability-guide.md)** - Distributed tracing with OpenTelemetry for debugging workflows, measuring AI performance, and monitoring Kubernetes operations

### 3. Production Considerations
- For production workloads, plan for Docker deployment with external orchestration
- Consider backup strategies for vector database content (organizational patterns and capabilities)

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/vfarcic/dot-ai/issues)