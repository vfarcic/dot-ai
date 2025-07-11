# DevOps AI Toolkit MCP Integration Guide

**Complete guide for using DevOps AI Toolkit as an MCP (Model Context Protocol) server with AI development tools.**

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Supported AI Tools](#supported-ai-tools)
- [MCP Tools Reference](#mcp-tools-reference)
- [Workflow Examples](#workflow-examples)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

## Quick Start

### 1. Configure MCP Server (Claude Code)

Create `.mcp.json` in your project for Claude Code:

```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your_anthropic_key_here",
        "DOT_AI_SESSION_DIR": "./tmp/sessions",
        "KUBECONFIG": "./configs/my-cluster.yaml"
      }
    }
  }
}
```

### 2. Start Claude Code

```bash
# Start Claude Code with MCP enabled
claude
```

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | ✅ Yes | Claude API key for AI recommendations | `sk-ant-api03-...` |
| `DOT_AI_SESSION_DIR` | ✅ Yes | Session storage directory | `./tmp/sessions` |
| `KUBECONFIG` | ❌ Optional | Kubernetes config file path | `./configs/cluster.yaml` |

### Path Resolution

**Relative paths** are resolved relative to the MCP server's working directory:

```json
{
  "cwd": "/Users/you/projects/myapp",
  "env": {
    "DOT_AI_SESSION_DIR": "./tmp/sessions",     // → /Users/you/projects/myapp/tmp/sessions
    "KUBECONFIG": "./k8s/config.yaml"             // → /Users/you/projects/myapp/k8s/config.yaml
  }
}
```

**Absolute paths** work as expected:

```json
{
  "env": {
    "DOT_AI_SESSION_DIR": "/tmp/dot-ai-sessions",
    "KUBECONFIG": "/Users/you/.kube/config"
  }
}
```

## Supported AI Tools

### Claude Code

**Setup:**
```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here",
        "DOT_AI_SESSION_DIR": "./tmp/sessions"
      }
    }
  }
}
```

**Usage:**
```bash
claude --mcp
# Now you can use dot-ai MCP tools directly in conversation
```

### Cursor

**Setup:**
1. Open Cursor Settings
2. Navigate to "MCP Servers"
3. Add DevOps AI Toolkit configuration
4. Restart Cursor

### VS Code

**Setup:**
1. Install MCP extension
2. Configure in `settings.json`
3. Restart VS Code

## MCP Tools Reference

### Core Workflow Tools

#### `recommend`
Get AI-powered deployment recommendations based on your cluster capabilities.

**Usage:**
```
Use the recommend tool to get deployment suggestions for my web application
```

**Parameters:**
- `intent` (required): Description of what you want to deploy

**Returns:**
- List of recommended solutions with scoring
- Available configuration questions

#### `chooseSolution`
Select a specific solution and get its configuration questions.

**Usage:**
```
Use chooseSolution with solution ID sol_2024-12-01T123456_abc123
```

**Parameters:**
- `solutionId` (required): ID from recommend tool response

**Returns:**
- Configuration questions grouped by stage (required, basic, advanced, open)

#### `answerQuestion`
Provide answers to configuration questions for your chosen solution.

**Usage:**
```
Use answerQuestion to configure the database settings
```

**Parameters:**
- `solutionId` (required): Solution ID
- `stage` (required): Question stage (required/basic/advanced/open)
- `answers` (required): Your configuration answers

**Returns:**
- Next set of questions or completion status

#### `generateManifests`
Generate final Kubernetes manifests from your configured solution.

**Usage:**
```
Use generateManifests to create the deployment files
```

**Parameters:**
- `solutionId` (required): Fully configured solution ID

**Returns:**
- Generated Kubernetes YAML manifests
- Deployment instructions

#### `deployManifests`
Deploy the generated manifests to your Kubernetes cluster.

**Usage:**
```
Use deployManifests to apply the configuration to the cluster
```

**Parameters:**
- `solutionId` (required): Solution ID with generated manifests
- `timeout` (optional): Deployment timeout in seconds (default: 30)

**Returns:**
- Deployment status and results
- Any deployment errors or warnings

### Utility Tools

#### `canHelp`
Check if DevOps AI Toolkit can assist with your specific deployment request.

**Usage:**
```
Use canHelp to check if you can deploy a microservice with database
```

**Parameters:**
- `request` (required): Description of your deployment needs

**Returns:**
- Whether DevOps AI Toolkit can help
- Suggested approach or alternatives

## Workflow Examples

### Example 1: Simple Web Application

```
User: I want to deploy a Node.js web application to my cluster

Agent: I'll help you deploy a Node.js web application. Let me get recommendations for your cluster.

[Uses recommend tool with intent "deploy Node.js web application"]

Agent: Based on your cluster capabilities, I found 3 deployment options:
1. Standard Kubernetes Deployment + Service (Score: 85)
2. Cloud Run Service (Score: 78) 
3. Knative Service (Score: 72)

Let's go with the standard Kubernetes approach.

[Uses chooseSolution with the selected solution ID]

Agent: Great! I need some configuration details:

Required Configuration:
- Application name
- Container image
- Port number

[Uses answerQuestion to collect responses]

Agent: Perfect! Now generating your Kubernetes manifests...

[Uses generateManifests and deployManifests]

Agent: Successfully deployed! Your Node.js application is now running.
```

### Example 2: Database + Application

```
User: I need to deploy a web app with a PostgreSQL database

Agent: I'll help you set up both the application and database.

[Uses recommend tool]

Agent: I found several options including StatefulSet for PostgreSQL and Deployment for your app. Let me configure this step by step...

[Goes through chooseSolution, answerQuestion cycle for both components]

Agent: Deploying your complete stack now...

[Uses generateManifests and deployManifests]
```

## Troubleshooting

### Common Issues

#### MCP Server Won't Start

**Symptoms:**
- "Cannot connect to MCP server" error
- Server process exits immediately

**Solutions:**
1. **Check API key:**
   ```bash
   echo $ANTHROPIC_API_KEY
   # Should show your API key
   ```

2. **Verify session directory:**
   ```bash
   ls -la ./tmp/sessions
   # Directory should exist and be writable
   ```

3. **Test manual startup:**
   ```bash
   cd /path/to/dot-ai
   npm run start:mcp
   # Should start without errors
   ```

#### Kubeconfig Not Found

**Symptoms:**
- "Kubeconfig file not found" errors
- Cannot discover cluster resources

**Solutions:**
1. **Check path resolution:**
   ```json
   {
     "cwd": "/your/project/root",
     "env": {
       "KUBECONFIG": "./path/to/config.yaml"  // Relative to cwd
     }
   }
   ```

2. **Use absolute path:**
   ```json
   {
     "env": {
       "KUBECONFIG": "/Users/you/.kube/config"
     }
   }
   ```

3. **Verify file exists:**
   ```bash
   ls -la /Users/you/.kube/config
   kubectl config view  # Test kubeconfig
   ```

#### Session Directory Errors

**Symptoms:**
- "Session directory not found" errors
- Permission denied errors

**Solutions:**
1. **Create directory:**
   ```bash
   mkdir -p ./tmp/sessions
   chmod 755 ./tmp/sessions
   ```

2. **Check permissions:**
   ```bash
   ls -la ./tmp/
   # Should show write permissions for sessions directory
   ```

### Debug Mode

For debugging MCP server issues, check the logs in your AI tool's MCP output. There are currently no specific debug environment variables.

## Advanced Configuration

### Multiple Clusters

Configure different MCP servers for different clusters:

```json
{
  "mcpServers": {
    "dot-ai-prod": {
      "command": "npm",
      "args": ["run", "start:mcp"],
      "cwd": "/path/to/dot-ai",
      "env": {
        "KUBECONFIG": "./configs/prod-cluster.yaml",
        "DOT_AI_SESSION_DIR": "./tmp/prod-sessions"
      }
    },
    "dot-ai-staging": {
      "command": "npm",
      "args": ["run", "start:mcp"],
      "cwd": "/path/to/dot-ai",
      "env": {
        "KUBECONFIG": "./configs/staging-cluster.yaml",
        "DOT_AI_SESSION_DIR": "./tmp/staging-sessions"
      }
    }
  }
}
```

### Custom Session Management

**Project-specific sessions:**
```json
{
  "env": {
    "DOT_AI_SESSION_DIR": "./deployments/dot-ai-sessions"
  }
}
```

**Shared sessions across projects:**
```json
{
  "env": {
    "DOT_AI_SESSION_DIR": "/Users/you/.dot-ai/sessions"
  }
}
```

### Performance Tuning

Performance tuning is currently handled automatically. For large clusters with many resources, the discovery process may take longer but should complete successfully.

## See Also

- [CLI Guide](cli-guide.md) - Command-line interface documentation
- [API Reference](API.md) - Programmatic usage
- [Development Guide](DEVELOPMENT.md) - Contributing and architecture