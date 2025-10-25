# DevOps AI Toolkit

<div align="center">

![DevOps AI Toolkit Logo](assets/images/logo.png)

[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Project Status](https://img.shields.io/badge/status-beta-orange)

</div>

**AI-powered platform engineering and DevOps automation through intelligent Kubernetes operations and conversational workflows.**

📚 [Quick Start](./docs/quick-start.md) | 🔧 [MCP Setup](./docs/mcp-setup.md) | 🛠️ [Features & Tools](./docs/mcp-tools-overview.md)

---

## What is DevOps AI Toolkit?

DevOps AI Toolkit brings AI-powered intelligence to platform engineering, Kubernetes operations, and development workflows. It provides intelligent Kubernetes deployment recommendations through capability discovery and semantic matching, AI-powered issue remediation, automated repository setup with governance and security files, and shared prompt libraries for consistent development workflows—all through natural language conversation.

Built on the Model Context Protocol (MCP), it integrates seamlessly with Claude Code, Cursor, and VS Code to provide conversational interaction for complex DevOps and development tasks.

## Mission

DevOps AI Toolkit democratizes platform engineering and cloud native operations by making complex workflows accessible through AI-powered automation. We eliminate the expertise barrier that prevents teams from adopting best practices in Kubernetes operations, repository governance, and standardized development workflows—making professional-grade DevOps accessible through natural language interaction.

## Who Should Use This?

**DevOps AI Toolkit is for teams who want to**:
- Manage cloud resources (AWS, Azure, GCP) using Kubernetes as a control plane (developers, platform engineers)
- Quickly diagnose and fix cluster and infrastructure issues (SREs, DevOps engineers)
- Standardize resource provisioning with organizational patterns and policies (security engineers, platform teams)
- Bootstrap repositories with governance and security files (project maintainers)
- Access curated development prompts through native slash commands (development teams)

## Scope

### In Scope
- AI-powered resource provisioning recommendations using Kubernetes as control plane
- Intelligent issue remediation and root cause analysis
- Organizational pattern and policy management with semantic search
- MCP-based integration with AI coding assistants
- Multi-provider AI model support (Claude, GPT, Gemini)
- Project setup with governance, legal, and security files

### Out of Scope
- Kubernetes cluster provisioning/management (delegates to existing tools)
- CI/CD pipeline execution (provides recommendations only)
- Application runtime monitoring (integrates with existing observability tools)

## Key Features

### 🔍 Resource Provisioning Intelligence
Automatically discovers cluster resources using semantic capability management. AI understands what each resource actually does, providing intelligent recommendations for provisioning resources across clouds using Kubernetes as a control plane.
📖 [Deployment Guide](./docs/mcp-recommendation-guide.md) | [Capability Management](./docs/mcp-capability-management-guide.md)

### 🛠️ Issue Remediation
AI-powered root cause analysis with multi-step investigation, executable remediation commands, and safety mechanisms for manual or automatic execution.
📖 [Learn more →](./docs/mcp-remediate-guide.md)

### 🏛️ Pattern & Policy Management
Capture organizational knowledge and governance policies that automatically enhance AI recommendations with best practices and compliance requirements. Uses vector search for intelligent semantic matching.
📖 [Pattern Management](./docs/pattern-management-guide.md) | [Policy Management](./docs/policy-management-guide.md)

### 📦 Project Setup & Governance
Generate 25+ governance, legal, and automation files (LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, GitHub workflows, Renovate, OpenSSF Scorecard) for repository standardization.
📖 [Learn more →](./docs/mcp-project-setup-guide.md)

### 💬 Shared Prompts Library
Access curated prompts as native slash commands (`/dot-ai:prompt-name`) in your coding agent for consistent workflows across projects.
📖 [Learn more →](./docs/mcp-prompts-guide.md)

### ⚡ AI Integration
Works with Claude Code, Cursor, VS Code via Model Context Protocol. Supports multiple AI providers (Claude, GPT, Gemini) for flexibility and cost optimization.
📖 [AI Model Configuration](./docs/mcp-setup.md#ai-model-configuration)

## See It In Action

[![DevOps AI Toolkit: AI-Powered Application Deployment](https://img.youtube.com/vi/8Yzn-9qQpQI/maxresdefault.jpg)](https://youtu.be/8Yzn-9qQpQI)

This video explains the platform engineering problem and demonstrates the Kubernetes deployment recommendation workflow from intent to running applications.

## Quick Start

Get started in 3 steps:
1. Configure MCP server (Docker or npm)
2. Connect your AI coding assistant (Claude Code, Cursor, VS Code)
3. Start using conversational workflows

## Documentation

### Getting Started
- **[Quick Start Guide](docs/quick-start.md)** - Get started in minutes
- **[MCP Setup Guide](docs/mcp-setup.md)** - Complete configuration instructions
- **[Tools Overview](docs/mcp-tools-overview.md)** - All available tools and features

### Feature Guides
- **[Resource Provisioning](docs/mcp-recommendation-guide.md)** - AI-powered deployment recommendations
- **[Capability Management](docs/mcp-capability-management-guide.md)** - Semantic resource discovery
- **[Issue Remediation](docs/mcp-remediate-guide.md)** - AI-powered troubleshooting
- **[Pattern Management](docs/pattern-management-guide.md)** - Organizational deployment patterns
- **[Policy Management](docs/policy-management-guide.md)** - Governance and compliance
- **[Project Setup](docs/mcp-project-setup-guide.md)** - Repository governance automation

## Support

- **[Support Guide](SUPPORT.md)** - How to get help and where to ask questions
- **GitHub Issues**: [Bug reports and feature requests](https://github.com/vfarcic/dot-ai/issues)
- **GitHub Discussions**: [Community Q&A and discussions](https://github.com/vfarcic/dot-ai/discussions)
- **Troubleshooting**: See [Troubleshooting Guide](./docs/mcp-setup.md#troubleshooting) for common problems

## Contributing & Governance

We welcome contributions from the community! Please review:

- **[Contributing Guidelines](CONTRIBUTING.md)** - How to contribute code, docs, and ideas
- **[Code of Conduct](CODE_OF_CONDUCT.md)** - Community standards and expectations
- **[Security Policy](SECURITY.md)** - How to report security vulnerabilities
- **[Governance](docs/GOVERNANCE.md)** - Project governance and decision-making
- **[Maintainers](docs/MAINTAINERS.md)** - Current project maintainers
- **[Roadmap](docs/ROADMAP.md)** - Project direction and priorities

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

DevOps AI Toolkit is built on:
- [Model Context Protocol](https://modelcontextprotocol.io/) for AI integration framework
- [Vercel AI SDK](https://sdk.vercel.ai/) for unified AI provider interface
- [Kubernetes](https://kubernetes.io/) for the cloud native foundation
- [CNCF](https://www.cncf.io/) for the cloud native ecosystem

---

**DevOps AI Toolkit** - Making cloud native operations accessible through AI-powered intelligence.
