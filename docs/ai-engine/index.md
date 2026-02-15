---
sidebar_position: 1
---

# DevOps AI Toolkit

**AI-powered platform engineering and DevOps automation through intelligent Kubernetes operations and conversational workflows.**

---

## What is DevOps AI Toolkit?

DevOps AI Toolkit brings AI-powered intelligence to platform engineering, Kubernetes operations, and development workflows. It provides intelligent Kubernetes deployment recommendations through capability discovery and semantic matching, AI-powered issue remediation, semantic search over organizational documentation, automated repository setup with governance and security files, and shared prompt libraries for consistent development workflows—all through natural language conversation.

Access the toolkit through [MCP](/docs/mcp) (Model Context Protocol) or the [CLI](https://devopstoolkit.ai/docs/cli) — both designed for AI agents, with CLI offering lower token overhead and more granular endpoints.

![DevOps AI Toolkit Infographic](img/index.jpeg)

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
- Knowledge base with semantic search over organizational documentation
- Integration with AI agents via MCP and CLI
- Multi-provider AI model support (Claude, GPT, Gemini)
- Project setup with governance, legal, and security files

### Out of Scope
- Kubernetes cluster provisioning/management (delegates to existing tools)
- CI/CD pipeline execution (provides recommendations only)
- Application runtime monitoring (integrates with existing observability tools)

## Key Features

### Resource Provisioning Intelligence
Automatically discovers cluster resources using semantic capability management. AI understands what each resource actually does, providing intelligent recommendations for provisioning resources across clouds using Kubernetes as a control plane. When no matching capability exists, automatically discovers and installs third-party tools (Prometheus, Argo CD, Crossplane, etc.) via Helm charts from ArtifactHub.

[Deployment Guide](tools/recommend.md) | [Capability Management](tools/capability-management.md)

### Cluster Query
Ask questions about your cluster in plain English. Find resources by concept ("What databases are running?"), describe specific resources, or check health status - all without memorizing kubectl syntax.

[Learn more](tools/query.md)

### Issue Remediation
AI-powered root cause analysis with multi-step investigation, executable remediation commands, and safety mechanisms for manual or automatic execution.

[Learn more](tools/remediate.md)

### Pattern & Policy Management
Capture organizational knowledge and governance policies that automatically enhance AI recommendations with best practices and compliance requirements. Uses vector search for intelligent semantic matching.

[Pattern Management](organizational-data/patterns.md) | [Policy Management](organizational-data/policies.md)

### Knowledge Base
#### Overview
- **What it does**: Ingests organizational documentation into a searchable vector store for semantic retrieval by meaning, not keywords.
- **Use when**: You want AI to find relevant internal docs or run ad-hoc ingestion via your coding assistant or controller.
- **📖 Full Guide**: [Knowledge Base](tools/knowledge-base.md)

### Project Setup & Governance
Generate 25+ governance, legal, and automation files (LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, GitHub workflows, Renovate, OpenSSF Scorecard) for repository standardization.

[Learn more](tools/project-setup.md)

### Shared Prompts Library
Access curated prompts as native slash commands (`/dot-ai:prompt-name`) in your coding agent for consistent workflows across projects:
- **PRD Management**: Create, track, and complete Product Requirements Documents (`prd-create`, `prd-next`, `prd-done`, etc.)
- **Dockerfile Generation**: Generate production-ready, secure multi-stage Dockerfiles for any project (`generate-dockerfile`)
- **CI/CD Generation**: Generate intelligent CI/CD workflows through interactive conversation (`generate-cicd`)

[Learn more](tools/prompts.md)

### AI Integration
Works with Claude Code, Cursor, and VS Code via [MCP](/docs/mcp), or any AI agent via the [CLI](https://devopstoolkit.ai/docs/cli). Supports multiple AI providers (Claude, GPT, Gemini, Host LLM) for flexibility and cost optimization.

[AI Model Configuration](setup/deployment.md#ai-model-configuration)

## Quick Start

> **For the easiest setup**, we recommend installing the complete dot-ai stack which includes all components pre-configured. See the [Stack Installation Guide](https://devopstoolkit.ai/docs/stack).

For individual component installation:
1. Deploy the AI Engine to Kubernetes
2. Connect via [MCP](/docs/mcp) or [CLI](https://devopstoolkit.ai/docs/cli)
3. Start using conversational workflows

[Quick Start Guide](quick-start.md)

## Documentation

### Getting Started
- **[Quick Start Guide](quick-start.md)** - Get started in minutes
- **[Deployment Guide](setup/deployment.md)** - Complete configuration instructions
- **[Tools Overview](tools/overview.md)** - All available tools and features

### Deployment
- 🎯 **[Stack Installation](https://devopstoolkit.ai/docs/stack)** - Recommended: Complete dot-ai stack with all components pre-configured
- **[Deployment Guide](setup/deployment.md)** - Individual component deployment with full features

### Feature Guides
- **[Resource Provisioning](tools/recommend.md)** - AI-powered deployment recommendations
- **[Cluster Query](tools/query.md)** - Natural language cluster exploration
- **[Capability Management](tools/capability-management.md)** - Semantic resource discovery
- **[Issue Remediation](tools/remediate.md)** - AI-powered troubleshooting
- **[Pattern Management](organizational-data/patterns.md)** - Organizational deployment patterns
- **[Policy Management](organizational-data/policies.md)** - Governance and compliance
- **[Knowledge Base](tools/knowledge-base.md)** - Semantic search over documentation
- **[Project Setup](tools/project-setup.md)** - Repository governance automation
