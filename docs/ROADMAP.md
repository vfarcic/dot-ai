# Roadmap

This document outlines the planned direction and priorities for DevOps AI Toolkit.

This roadmap is a living document and may change based on community feedback and project priorities.

## Short-term (Next 1-3 Months)

- AI provider comparison and benchmarking infrastructure (PRD #139)
- Guided setup system to simplify onboarding (PRD #165)
- Standardized embedding architecture on Vercel AI SDK (PRD #176)
- Git operations for recommend tool - push generated manifests to Git repos (PRD #362)
- Git push recommend integration - pushToGit stage for GitOps workflows (PRD #395)
- Deployment documentation generation for knowledge base - organizational memory of deployment decisions (PRD #377)
- GitOps operations for remediate tool - create PRs with fixes for GitOps-managed resources (PRD #408)
- Agentic documentation validation and remediation - Pod-based validation, automated fixes, PR creation with feedback loop (PRD #388)
- Consolidate duplicated constants and messages to eliminate code duplication (PRD #323)
- Unified knowledge base - consolidate policies, patterns, and knowledge into single collection with AI classification (PRD #375)

## Medium-term (3-6 Months)

- Custom headers and base URL support for all AI providers - enterprise proxy/gateway compatibility (PRD #443)
- Auto-generated Go CLI as alternative to MCP - self-contained multi-arch binaries from OpenAPI spec (PRD #371)
- MCP tool filtering - server-side allow/deny lists to control tool exposure (PRD #347)
- Elicitation enhancement across MCP tools - systematic review and improvement of confirmation, clarification, and adaptive questioning (PRD #307)
- Multi-step workflow distributed tracing (PRD #197)
- Integrate patterns & policies into remediation tool (PRD #227)
- Cost estimation & optimization - integrate with OpenCost/Kubecost for cost insights in recommend and operate workflows (PRD #404)
- Upgrade path analysis - assess cluster readiness for Kubernetes version upgrades using existing tools (PRD #406)

## Long-term (6-12 Months)

- Retire legacy collection migration from unified knowledge base (PRD #376)

## How to Contribute

We welcome contributions toward any roadmap items:

1. Check the [issue tracker](https://github.com/vfarcic/dot-ai/issues) for related work
2. Comment on issues or open discussions
3. See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines

---

_This roadmap reflects current plans but is subject to change._
