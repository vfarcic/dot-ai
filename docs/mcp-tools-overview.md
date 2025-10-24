# DevOps AI Toolkit - Tools and Features Overview

**Quick reference to all available tools in the DevOps AI Toolkit MCP server.**

## Why Your Infrastructure AI Sucks (And How to Fix It)

[![Why Your Infrastructure AI Sucks (And How to Fix It)](https://img.youtube.com/vi/Ma3gKmuXahc/maxresdefault.jpg)](https://youtu.be/Ma3gKmuXahc)

This video demonstrates the core AI-powered deployment workflow: capabilities discovery, organizational patterns, policy enforcement, context management, and intelligent workflows. Watch how these components work together to transform generic AI responses into infrastructure solutions that actually work in your organization.

## Available Tools

### 🚀 Kubernetes Deployment Recommendations
AI-powered application deployment assistance with smart intent clarification, semantic resource matching, and automated manifest generation.
- **What it does**: Clarifies deployment intents through adaptive questioning, then provides intelligent deployment suggestions based on your cluster capabilities
- **Use when**: Deploying applications to Kubernetes clusters, especially when requirements are not fully specified
- **📖 Full Guide**: [Kubernetes Deployment Recommendations](mcp-recommendation-guide.md)

### 🔍 Capability Management  
Teaches the AI what your Kubernetes resources actually do through semantic discovery and analysis.
- **What it does**: Scans cluster resources and discovers their capabilities for intelligent matching
- **Use when**: Setting up recommendations (required) or improving deployment intelligence
- **📖 Full Guide**: [Capability Management](mcp-capability-management-guide.md)

### 🏛️ Pattern Management
Captures organizational deployment knowledge as reusable patterns that enhance AI recommendations.
- **What it does**: Creates deployment templates with your organization's best practices
- **Use when**: Standardizing deployments across teams or enforcing organizational standards
- **📖 Full Guide**: [Pattern Management](pattern-management-guide.md)

### 🛡️ Policy Management
Enables proactive governance through policy intents that guide users toward compliant configurations.
- **What it does**: Creates governance policies that integrate into AI recommendations with optional Kyverno enforcement
- **Use when**: Implementing security requirements, compliance standards, or configuration governance
- **📖 Full Guide**: [Policy Management](policy-management-guide.md)

### 🔧 Kubernetes Issue Remediation
AI-powered issue analysis and remediation with intelligent root cause identification.
- **What it does**: Multi-step investigation loop to identify root causes and generate executable remediation commands
- **Use when**: Troubleshooting Kubernetes failures, diagnosing pod/networking/storage issues, or understanding "what's wrong"
- **📖 Full Guide**: [Kubernetes Issue Remediation](mcp-remediate-guide.md)

### 📦 Project Setup & Governance
Comprehensive repository setup with governance, legal, security, and automation files.
- **What it does**: Generates 25+ standardized files including LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY policies, GitHub issue/PR templates, workflows (OpenSSF Scorecard), and automation (Renovate, Labeler, Stale Bot)
- **Use when**: Setting up new repositories, standardizing team workflows, or implementing governance and security best practices
- **📖 Full Guide**: [Project Setup & Governance](mcp-project-setup-guide.md)


### 💬 Shared Prompts Library
Centralized prompt sharing via native slash commands in MCP-enabled coding agents.
- **What it does**: Provides curated prompts as slash commands (e.g., `/explain-code`, `/security-review`)
- **Use when**: Boosting productivity with standardized prompts across projects
- **📖 Full Guide**: [Shared Prompts Library](mcp-prompts-guide.md)

### 🌐 REST API Gateway
HTTP REST endpoints for all DevOps AI Toolkit capabilities, enabling integration with traditional applications and CI/CD pipelines.
- **What it does**: Exposes all MCP tools via standard HTTP POST/GET endpoints with auto-generated OpenAPI documentation
- **Use when**: Integrating with automation scripts, CI/CD pipelines, Kubernetes controllers, or any non-MCP applications
- **📖 Full Guide**: [REST API Gateway](rest-api-gateway-guide.md)

## Quick Start

1. **Complete Setup**: Follow the [MCP Setup Guide](mcp-setup.md)
2. **Start with Capability Management** to scan your cluster (required for recommendations)
3. **Try Deployment Recommendations** with a simple application
4. **Optional**: Create organizational patterns, policy intents, or use issue remediation

## Prerequisites

**Required for all tools:**
- **MCP server configured**: See [MCP Setup Guide](mcp-setup.md)

**Works without AI keys:**
- ✅ **Project Setup & Governance**
- ✅ **Shared Prompts Library**
- ✅ **REST API Gateway**

**For AI-powered features (deployment, remediation, patterns, policies, capabilities):**
- **AI Model API key**: See [AI Model Configuration](mcp-setup.md#ai-model-configuration) for model options
- **Cluster access**: `KUBECONFIG` for Kubernetes integration (deployment, remediation, capabilities)
- **Vector database**: Qdrant for capability, pattern, and policy storage
- **Embedding provider API key**: OpenAI, Google, or Mistral for pattern/policy semantic search

## Tool Dependencies

- **Deployment Recommendations** ← requires **Capability Management**
- **Pattern Management** → enhances **Deployment Recommendations**
- **Policy Management** → enhances **Deployment Recommendations**
- **Kubernetes Issue Remediation** ← independent
<!-- - **Platform Building** ← independent (requires Nushell runtime) -->
- **Project Setup** ← independent
- **Shared Prompts Library** ← independent
- **REST API Gateway** ← provides HTTP access to all tools

## Getting Help

For troubleshooting, use the system status command:
```
Show dot-ai status
```