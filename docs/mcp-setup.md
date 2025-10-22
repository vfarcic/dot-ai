# DevOps AI Toolkit MCP Server Setup Guide

**Complete setup guide for using DevOps AI Toolkit as an MCP (Model Context Protocol) server with AI development tools.**

## Overview

The DevOps AI Toolkit provides six main capabilities through MCP (Model Context Protocol):

1. **Kubernetes Deployment Recommendations** - AI-powered application deployment assistance with enhanced semantic understanding
2. **Capability Management** - Discover and store semantic resource capabilities for intelligent recommendation matching
3. **Pattern Management** - Organizational deployment patterns that enhance AI recommendations
4. **Policy Management** - Governance policies that guide users toward compliant configurations with optional Kyverno enforcement
5. **Documentation Testing** - Automated validation of documentation accuracy
6. **Shared Prompts Library** - Centralized prompt sharing via native slash commands

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

**Note**: How you configure these depends on your chosen setup method. See the individual setup guides for specific configuration instructions.

### AI Model Configuration

The DevOps AI Toolkit supports 10 different AI models from 5 providers. Choose based on your quality, cost, and reliability requirements.

#### Model Recommendations

| Model | Provider | Overall Score | Reliability | Recommendation |
|-------|----------|----------------|-------------|----------------|
| **Claude Sonnet 4.5** | Anthropic | 0.846 | 0.952 | ✅ **Best overall** - Maximum reliability, production-ready |
| **Claude Haiku 4.5** | Anthropic | 0.836 | 0.916 | ✅ **Best balanced** - Excellent performance at 1/3 cost of Sonnet |
| **Grok-4-Fast-Reasoning** | xAI | 0.740 | 0.802 | ✅ **Best value** - 87% of Sonnet performance at 3.9% of cost |
| **Gemini 2.5 Pro** | Google | 0.768 | 0.837 | ⚠️ **Use cautiously** - Good capability analysis, weak remediation |
| **Grok-4** | xAI | 0.743 | 0.834 | ⚠️ **Use cautiously** - Good remediation, weaker on other tools |
| **GPT-5** | OpenAI | 0.732 | 0.827 | ⚠️ **Use cautiously** - Weak capability analysis performance |
| **Gemini 2.5 Flash** | Google | 0.733 | 0.859 | ⚠️ **Limited use** - Weak pattern & remediation tasks |
| **DeepSeek Reasoner** | DeepSeek | 0.640 | 0.645 | ❌ **Avoid** - Reliability concerns, lacks function calling |
| **Mistral Large Latest** | Mistral | 0.589 | 0.542 | ❌ **Avoid** - Complete remediation failures, inconsistent |
| **GPT-5-Pro** | OpenAI | 0.311 | 0.332 | ❌ **Avoid** - Catastrophic failures across all tools |

**Usage Guidelines:**
- **Production (max reliability)**: Use Claude Sonnet 4.5
- **Production (best balanced)**: Use Claude Haiku 4.5 (98.8% of Sonnet at 33% cost)
- **Development & testing**: Use Grok-4-Fast-Reasoning for best value
- **Budget-constrained**: Use Grok-4-Fast-Reasoning (25x more operations than Sonnet)
- **Avoid**: Mistral Large Latest, DeepSeek Reasoner, and GPT-5-Pro due to reliability issues

📖 **[Complete Model Analysis Report](../eval/analysis/platform/synthesis-report.md)** - Detailed performance analysis, technical evaluation methodology, and comprehensive testing results across all MCP tools.

#### Model Selection

Choose your AI model by setting the provider:

| Model | AI_PROVIDER | API Key Required |
|-------|-------------|------------------|
| **Claude Sonnet 4.5** | `anthropic` | `ANTHROPIC_API_KEY` |
| **Claude Haiku 4.5** | `anthropic_haiku` | `ANTHROPIC_API_KEY` |
| **GPT-5** | `openai` | `OPENAI_API_KEY` |
| **GPT-5-Pro** | `openai_pro` | `OPENAI_API_KEY` |
| **Gemini 2.5 Pro** | `google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| **Gemini 2.5 Flash** | `google_fast` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| **Grok-4** | `xai` | `XAI_API_KEY` |
| **Grok-4-Fast-Reasoning** | `xai_fast` | `XAI_API_KEY` |
| **Mistral Large Latest** | `mistral` | `MISTRAL_API_KEY` |
| **DeepSeek Reasoner** | `deepseek` | `DEEPSEEK_API_KEY` |
| **Amazon Bedrock Models** | `bedrock` | `BEDROCK_API_KEY` + `AWS_REGION` |

**Configuration Steps:**

1. **Set your provider** (defaults to anthropic):
```bash
AI_PROVIDER=anthropic_haiku  # Example: using Claude Haiku 4.5
```

2. **Set the corresponding API key** (**only one** needed):
```bash
# Choose ONE based on your selected provider:

# For Claude Sonnet 4.5 or Claude Haiku 4.5 (default - recommended)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# For OpenAI models (GPT-5, GPT-5-Pro)
OPENAI_API_KEY=your_openai_api_key_here

# For Google models (Gemini 2.5 Pro, Gemini 2.5 Flash)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here

# For xAI models (Grok-4, Grok-4-Fast-Reasoning)
XAI_API_KEY=your_xai_api_key_here

# For Mistral model (Mistral Large Latest)
MISTRAL_API_KEY=your_mistral_api_key_here

# For DeepSeek model (DeepSeek Reasoner)
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# For Amazon Bedrock models
AI_PROVIDER=bedrock
BEDROCK_API_KEY=your_bedrock_api_key_here
AWS_REGION=us-west-2
AI_MODEL=anthropic.claude-3-sonnet-20240229-v1:0  # Optional: specify model
```

### Embedding Provider Configuration

The DevOps AI Toolkit supports multiple embedding providers for enhanced semantic search capabilities in pattern management, capability discovery, and policy matching.

#### Provider Comparison

| Provider | Model | Dimensions | Pros | Cons | Best For |
|----------|-------|------------|------|------|----------|
| **OpenAI** | `text-embedding-3-small` | 1536 | ✅ High quality, mature API | Higher cost | Production deployments |
| **Google** | `text-embedding-004` | 768 | ✅ Cost-effective, good performance | Smaller dimensions | Development, cost-conscious setups |
| **Mistral** | `mistral-embed` | 1024 | ✅ Balanced dimensions, cost-effective | Newer option | Alternative to OpenAI/Google |

**Usage Guidelines:**
- **Production**: Use OpenAI for maximum semantic search quality
- **Development**: Use Google for cost-effective development and testing  
- **Alternative**: Use Mistral for balanced performance and dimensions

#### Provider Selection

Choose your embedding provider by setting the provider:

| Provider | EMBEDDINGS_PROVIDER | API Key Required | Model Used |
|----------|-------------------|------------------|------------|
| **OpenAI** | `openai` (default) | `OPENAI_API_KEY` | `text-embedding-3-small` |
| **Google** | `google` | `GOOGLE_API_KEY` | `text-embedding-004` |
| **Mistral** | `mistral` | `MISTRAL_API_KEY` | `mistral-embed` |

**Configuration Steps:**

1. **Set your embedding provider** (defaults to openai):
```bash
EMBEDDINGS_PROVIDER=google  # Example: using Google embeddings
```

2. **Set the corresponding API key** (**only one** needed):
```bash
# Choose ONE based on your selected provider:

# For OpenAI embeddings (default - recommended for production)
OPENAI_API_KEY=your_openai_api_key_here

# For Google embeddings (cost-effective alternative)
GOOGLE_API_KEY=your_google_api_key_here

# For Mistral embeddings (alternative option)
MISTRAL_API_KEY=your_mistral_api_key_here
```

**Important Notes:**
- **Same Provider Efficiency**: If using the same provider for both AI models and embeddings (e.g., `AI_PROVIDER=google` and `EMBEDDINGS_PROVIDER=google`), you only need to set one API key (`GOOGLE_API_KEY`)
- **Mixed Providers**: You can mix embedding and AI providers. For example, use Claude for AI (`AI_PROVIDER=anthropic`) with Google embeddings (`EMBEDDINGS_PROVIDER=google`) - embeddings are very cost-effective, so using different providers is economical
- **Limited Embedding Support**: Not all AI model providers support embeddings. Popular combinations:
  - Anthropic AI models + OpenAI embeddings (premium quality)
  - Anthropic AI models + Google embeddings (cost-optimized)
  - Google AI models + Google embeddings (unified setup)

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

### 2. Production Considerations
- For production workloads, plan for Docker deployment with external orchestration
- Consider backup strategies for vector database content (organizational patterns and capabilities)

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/vfarcic/dot-ai/issues)