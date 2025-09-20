---
name: remediate
description: AI-powered Kubernetes issue analysis and remediation
category: troubleshooting
---

# Kubernetes Issue Remediation

## What's going wrong with your Kubernetes cluster?

Describe the issue you're experiencing and I'll use AI-powered investigation to identify the root cause and provide executable remediation steps.

**Examples:**
- "Pod stuck in Pending state"
- "Database connection failing in production namespace"
- "Application deployment not working"
- "Something is wrong with my ingress"
- "Memory issues in my pods"
- "Storage problems in namespace xyz"
- "Network connectivity issues"
- "Service discovery not working"

**Your issue description**: [Describe what's going wrong]

---

## Execution Modes:

**Manual Mode** (default): You review and approve each remediation step
**Automatic Mode**: AI executes low-risk fixes automatically based on confidence thresholds

To use automatic mode, add phrases like:
- "fix this automatically"
- "remediate automatically with high confidence"
- "auto-fix if safe"

---

Once you describe your issue, I'll call the `remediate` tool to:
1. **Investigate** - Multi-step analysis to identify root cause
2. **Analyze** - Provide detailed explanation with confidence level  
3. **Remediate** - Generate specific kubectl commands with risk assessment
4. **Execute** - Run fixes via MCP or guide you through manual execution
5. **Validate** - Confirm the issue is resolved