# App-Agent: Kubernetes Application Management

An intelligent dual-mode agent for deploying applications to ANY Kubernetes cluster through dynamic discovery and plain English governance.

## What It Does

App-Agent discovers what's available in your Kubernetes cluster (CRDs + core resources) and helps you deploy applications using the best available platform - whether that's AppClaim, CloudRun, Knative, standard Kubernetes, or your custom CRDs.

## Two Modes, Same Intelligence

**🖥️ Direct CLI Mode**: `app-agent deploy "web app with auto-scaling"`
- Interactive terminal experience 
- Built-in session management
- Perfect for developers and ops teams

**🔌 MCP Mode**: `app-agent-mcp` server
- Model Context Protocol integration
- Structured JSON responses  
- Perfect for AI agent orchestration

## Key Features

✅ **Discovery-Driven**: Works in any cluster by discovering available resources  
✅ **Resource-Agnostic**: Uses ANY Kubernetes resources (CRDs or core)  
✅ **Memory-Enhanced**: Learns from deployments and applies lessons  
✅ **Plain English Governance**: No YAML policies - just natural language rules  
✅ **Universal Compatibility**: From vanilla K8s to complex platform abstractions  

## Quick Start

```bash
# Install the CLI
npm install -g app-agent

# Deploy an application
app-agent deploy "microservice with database"

# Or start with specific context
app-agent deploy "batch job that runs nightly"
```

## Documentation

- **[📋 design.md](design.md)** - Complete architecture, workflow, and examples
- **[⚡ CONTEXT.md](CONTEXT.md)** - Quick reference for new development sessions  
- **[🌱 ORIGINAL_INSPIRATION.md](ORIGINAL_INSPIRATION.md)** - The prompt that started it all

## Project Evolution

This project evolved from a single application management prompt into a sophisticated dual-mode system powered by Claude Code SDK. The original inspiration (referenced above) focused on prompt-based workflow, while the current design provides both direct CLI interaction and MCP integration for broader AI agent ecosystems.

## Development Status

🚧 **Design Phase**: Architecture and API specifications complete  
📋 **Next**: Detailed API specifications for MCP functions  
🔧 **Future**: Implementation with Claude Code SDK integration  

---

**Philosophy**: If the agent is AI-powered, governance should be too. Let users express their intent in natural language, and let the AI figure out how to enforce it technically. 