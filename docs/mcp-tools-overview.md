# DevOps AI Toolkit - Tools and Features Overview

**Quick reference to all available tools in the DevOps AI Toolkit MCP server.**

## Available Tools

### 🚀 Kubernetes Deployment Recommendations
AI-powered application deployment assistance with semantic resource matching and automated manifest generation.
- **What it does**: Get intelligent deployment suggestions based on your cluster capabilities
- **Use when**: Deploying applications to Kubernetes clusters
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

### 📋 Documentation Testing
Automated validation of documentation accuracy through functionality testing and AI analysis.
- **What it does**: Tests commands, examples, and descriptions in documentation files
- **Use when**: Maintaining documentation quality or validating guide accuracy
- **📖 Full Guide**: [Documentation Testing](mcp-documentation-testing-guide.md)

### 💬 Shared Prompts Library
Centralized prompt sharing via native slash commands in MCP-enabled coding agents.
- **What it does**: Provides curated prompts as slash commands (e.g., `/explain-code`, `/security-review`)
- **Use when**: Boosting productivity with standardized prompts across projects
- **📖 Full Guide**: [Shared Prompts Library](mcp-prompts-guide.md)

## Quick Start

1. **Complete Setup**: Follow the [MCP Setup Guide](mcp-setup.md)
2. **Start with Capability Management** to scan your cluster (required for recommendations)
3. **Try Deployment Recommendations** with a simple application
4. **Optional**: Create organizational patterns, policy intents, or test documentation

## Prerequisites

- **MCP server configured**: See [MCP Setup Guide](mcp-setup.md)  
- **API keys**: `ANTHROPIC_API_KEY` for AI features
- **Cluster access**: `KUBECONFIG` for Kubernetes integration
- **Vector database**: Qdrant for capability, pattern, and policy storage

## Tool Dependencies

- **Deployment Recommendations** ← requires **Capability Management**
- **Pattern Management** → enhances **Deployment Recommendations** 
- **Policy Management** → enhances **Deployment Recommendations**
- **Documentation Testing** ← independent
- **Shared Prompts Library** ← independent

## Getting Help

For troubleshooting, use the system status command:
```
Show dot-ai status
```