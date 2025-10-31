# kagent Setup Guide

**Connect DevOps AI Toolkit MCP Server to kagent agents.**

## Prerequisites

- [kagent](https://kagent.dev) installed in your Kubernetes cluster
- DevOps AI Toolkit MCP server deployed (see [Kubernetes Setup](kubernetes-setup.md))

## Setup Steps

### Step 1: Create RemoteMCPServer Resource

Create a `RemoteMCPServer` resource pointing to the DevOps AI Toolkit MCP server:

```yaml
apiVersion: kagent.dev/v1alpha2
kind: RemoteMCPServer
metadata:
  name: dot-ai-mcp
  namespace: kagent
spec:
  description: DevOps AI Toolkit MCP Server
  protocol: STREAMABLE_HTTP
  sseReadTimeout: 5m0s
  terminateOnClose: true
  timeout: 30s
  url: http://dot-ai-mcp.dot-ai.svc.cluster.local:3456
```

**Note**: Adjust the URL if you deployed to a different namespace or service name.

### Step 2: Create or Update Agent

Create a new agent that uses the DevOps AI Toolkit MCP server:

```yaml
apiVersion: kagent.dev/v1alpha2
kind: Agent
metadata:
  name: devops-agent
  namespace: kagent
spec:
  type: Declarative
  description: DevOps automation agent with AI-powered Kubernetes tools
  declarative:
    modelConfig: default-model-config  # Use your existing model config
    stream: true
    systemMessage: You are a DevOps automation agent with access to AI-powered Kubernetes deployment, troubleshooting, and project setup tools.
    tools:
    - type: McpServer
      mcpServer:
        apiGroup: kagent.dev
        kind: RemoteMCPServer
        name: dot-ai-mcp
        toolNames:
        - recommend
        - version
        - manageOrgData
        - remediate
        - projectSetup
```

**Or update an existing agent** to include DevOps AI Toolkit tools:

```yaml
kubectl patch agent my-agent -n kagent --type=merge -p '
spec:
  declarative:
    tools:
    - type: McpServer
      mcpServer:
        apiGroup: kagent.dev
        kind: RemoteMCPServer
        name: dot-ai-mcp
        toolNames:
        - recommend
        - version
        - manageOrgData
        - remediate
        - projectSetup
'
```

### Step 3: Verify Setup

Check that the RemoteMCPServer discovered all tools:

```bash
kubectl get remotemcpserver dot-ai-mcp -n kagent -o yaml
```

You should see 5 tools in `status.discoveredTools`: `recommend`, `version`, `manageOrgData`, `remediate`, `projectSetup`.

Check that the agent is ready:

```bash
kubectl get agent devops-agent -n kagent
```

Status should show `READY: True`.

## Troubleshooting

**Agent pod not starting:**
- Check if `toolNames` is specified (kagent requires explicit tool list)
- Verify the MCP server URL is accessible from the kagent namespace
- Check agent pod logs: `kubectl logs -n kagent <agent-pod>`

**Tools not discovered:**
- Verify RemoteMCPServer status: `kubectl describe remotemcpserver dot-ai-mcp -n kagent`
- Check MCP server is running: `kubectl get pods -n dot-ai`
- Test MCP server directly: `curl http://dot-ai-mcp.dot-ai.svc.cluster.local:3456`

**Tool invocation fails:**
- Ensure capability scan completed successfully
- Check MCP server logs: `kubectl logs -n dot-ai deployment/dot-ai-mcp`
- Verify network connectivity between kagent and dot-ai namespaces
