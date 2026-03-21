---
sidebar_position: 1
---

# Tools and Features Overview

**Quick reference to all available tools in the DevOps AI Toolkit.**

## Why Your Infrastructure AI Sucks (And How to Fix It)

[![Why Your Infrastructure AI Sucks (And How to Fix It)](https://img.youtube.com/vi/Ma3gKmuXahc/maxresdefault.jpg)](https://youtu.be/Ma3gKmuXahc)

This video demonstrates the core AI-powered deployment workflow: capabilities discovery, organizational patterns, policy enforcement, context management, and intelligent workflows. Watch how these components work together to transform generic AI responses into infrastructure solutions that actually work in your organization.

## Available Tools

### 🚀 Kubernetes Deployment Recommendations
AI-powered application deployment assistance with smart intent clarification, semantic resource matching, and automated manifest generation.
- **What it does**: Clarifies deployment intents through adaptive questioning, then provides intelligent deployment suggestions based on your cluster capabilities. When no capability matches, automatically discovers and installs third-party applications via Helm charts from ArtifactHub.
- **Use when**: Deploying applications to Kubernetes clusters, or installing third-party tools (Prometheus, Argo CD, Crossplane, etc.) via Helm
- **📖 Full Guide**: [Kubernetes Deployment Recommendations](recommend.md)

### 🔎 Cluster Query
Natural language interface for querying your Kubernetes cluster.
- **What it does**: Ask questions about your cluster in plain English - find resources by concept, describe specific resources, or check health status. Optionally augmented with tools from [MCP servers](../setup/deployment.md#mcp-server-integration) (e.g., Prometheus metrics)
- **Use when**: Exploring your cluster, finding resources without memorizing kubectl syntax, or checking resource status
- **📖 Full Guide**: [Cluster Query](query.md)

### 🔍 Capability Management
Teaches the AI what your Kubernetes resources actually do through semantic discovery and analysis.
- **What it does**: Scans cluster resources and discovers their capabilities for intelligent matching
- **Use when**: Setting up recommendations (required) or improving deployment intelligence
- **📖 Full Guide**: [Capability Management](capability-management.md)

### 🏛️ Pattern Management
Captures organizational deployment knowledge as reusable patterns that enhance AI recommendations.
- **What it does**: Creates deployment templates with your organization's best practices
- **Use when**: Standardizing deployments across teams or enforcing organizational standards
- **📖 Full Guide**: [Pattern Management](../organizational-data/patterns.md)

### 🛡️ Policy Management
Enables proactive governance through policy intents that guide users toward compliant configurations.
- **What it does**: Creates governance policies that integrate into AI recommendations with optional Kyverno enforcement
- **Use when**: Implementing security requirements, compliance standards, or configuration governance
- **📖 Full Guide**: [Policy Management](../organizational-data/policies.md)

### 🔧 Kubernetes Issue Remediation
AI-powered issue analysis and remediation with intelligent root cause identification.
- **What it does**: Multi-step investigation loop to identify root causes and generate executable remediation commands. Optionally augmented with tools from [MCP servers](../setup/deployment.md#mcp-server-integration) (e.g., Prometheus metrics, distributed traces)
- **Use when**: Troubleshooting Kubernetes failures, diagnosing pod/networking/storage issues, or understanding "what's wrong"
- **📖 Full Guide**: [Kubernetes Issue Remediation](remediate.md)

### ⚙️ Kubernetes Operations
AI-powered Day 2 operations for any Kubernetes resources through natural language intents.
- **What it does**: Handles updates, scaling, enhancements, rollbacks, and any operational changes to workloads, databases, infrastructure, cloud resources, or Helm-managed applications with pattern-driven recommendations and dry-run validation. Optionally augmented with tools from [MCP servers](../setup/deployment.md#mcp-server-integration)
- **Use when**: Performing operational changes on deployed resources - applications, databases, storage, Helm releases, AWS/Azure/GCP resources via operators, networking, or any Kubernetes-managed infrastructure
- **📖 Full Guide**: [Kubernetes Operations](operate.md)

### 🔗 Dependency & Impact Analysis
AI-powered blast radius assessment before destructive operations.
- **What it does**: Accepts kubectl commands, YAML manifests, or plain-English descriptions and maps resource dependencies to assess blast radius with confidence levels (definite, likely, uncertain)
- **Use when**: Unsure about the impact of an operation on your cluster
- **📖 Full Guide**: [Dependency & Impact Analysis](impact-analysis.md)

### 📦 Project Setup & Governance
Comprehensive repository setup with governance, legal, security, and automation files.
- **What it does**: Generates 25+ standardized files including LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY policies, GitHub issue/PR templates, workflows (OpenSSF Scorecard), and automation (Renovate, Labeler, Stale Bot)
- **Use when**: Setting up new repositories, standardizing team workflows, or implementing governance and security best practices
- **📖 Full Guide**: [Project Setup & Governance](project-setup.md)


### 💬 Shared Prompts Library
Centralized prompt sharing via native slash commands in AI coding agents.
- **What it does**: Provides curated prompts as slash commands (e.g., `/explain-code`, `/security-review`)
- **Use when**: Boosting productivity with standardized prompts across projects
- **📖 Full Guide**: [Shared Prompts Library](prompts.md)

### 🌐 REST API Gateway
HTTP REST endpoints for all DevOps AI Toolkit tools, enabling integration with traditional applications and CI/CD pipelines.
- **What it does**: Exposes all tools via standard HTTP POST/GET endpoints with auto-generated OpenAPI documentation
- **Use when**: Integrating with automation scripts, CI/CD pipelines, Kubernetes controllers, or any non-MCP applications
- **📖 Full Guide**: [REST API Gateway](../api/rest-api.md)

### 🩺 System Status & Diagnostics
Comprehensive health check and diagnostics for your DevOps AI Toolkit installation.
- **What it does**: Shows version info, component health (Kubernetes, Vector DB, AI provider), collection statistics, and active capabilities
- **Use when**: Troubleshooting setup issues, verifying installation, or checking what features are available
- **📖 Full Guide**: [System Status](version.md)

### 📚 Knowledge Base
Semantic search over organizational documentation.
- **What it does**: Ingests documents into a searchable vector store, enabling natural language search across your organization's documentation
- **Use when**: Making organizational knowledge searchable by AI, finding relevant documentation by meaning rather than keywords
- **📖 Full Guide**: [Knowledge Base](knowledge-base.md)

## Quick Start

1. **Complete Setup**: Follow the [Deployment Guide](../setup/deployment.md)
2. **Start with Capability Management** to scan your cluster (required for recommendations and operations)
3. **Try Deployment Recommendations** with a simple application
4. **Use Kubernetes Operations** for Day 2 changes (updates, scaling, enhancements)
5. **Optional**: Create organizational patterns, policy intents, or use issue remediation

## Prerequisites

**Required for all tools:**
- **DevOps AI Toolkit deployed**: See [Deployment Guide](../setup/deployment.md)

**Works without AI keys:**
- ✅ **Project Setup & Governance**
- ✅ **Shared Prompts Library**
- ✅ **REST API Gateway**

**For AI-powered features (deployment, remediation, patterns, policies, capabilities):**
- **AI Model API key**: See [AI Model Configuration](../setup/deployment.md#ai-model-configuration) for model options
- **Cluster access**: `KUBECONFIG` for Kubernetes integration (deployment, remediation, capabilities)
- **Vector database**: Qdrant for capability, pattern, and policy storage
- **Embedding provider API key**: OpenAI, Google, or Amazon Bedrock for pattern/policy semantic search

## Tool Dependencies

- **Deployment Recommendations** ← requires **Capability Management**
- **Kubernetes Operations** ← requires **Capability Management**
- **Pattern Management** → enhances **Deployment Recommendations** and **Kubernetes Operations**
- **Policy Management** → enhances **Deployment Recommendations** and **Kubernetes Operations**
- **Kubernetes Issue Remediation** ← independent
- **Dependency & Impact Analysis** ← independent (enhanced by **Capability Management**)
<!-- - **Platform Building** ← independent (requires Nushell runtime) -->
- **Project Setup** ← independent
- **Shared Prompts Library** ← independent
- **REST API Gateway** ← provides HTTP access to all tools

## Getting Help

For troubleshooting, use the system status command:
```
Show dot-ai status
```

This provides comprehensive diagnostics including component health, connection status, and capability summary. See the [System Status Guide](version.md) for detailed troubleshooting steps.