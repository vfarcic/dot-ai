# DevOps AI Toolkit MCP Server Setup Guide

**Complete setup guide for using DevOps AI Toolkit as an MCP (Model Context Protocol) server with AI development tools.**

## Overview

The DevOps AI Toolkit provides five main capabilities through MCP (Model Context Protocol):
1. **Kubernetes Deployment Recommendations** - AI-powered application deployment assistance with enhanced semantic understanding
2. **Capability Management** - Discover and store semantic resource capabilities for intelligent recommendation matching
3. **Pattern Management** - Organizational deployment patterns that enhance AI recommendations
4. **Documentation Testing** - Automated validation of documentation accuracy
5. **Shared prompts library** - Centralized prompt sharing via native slash commands

This guide covers the foundational setup that enables all features.

## Quick Start

### 1. Install DevOps AI Toolkit

```bash
# Install globally
npm install -g @vfarcic/dot-ai

# Or use via npx (no installation required)
npx @vfarcic/dot-ai@latest --version
```

### 2. Configure MCP Server

Create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your_anthropic_key_here",
        "DOT_AI_SESSION_DIR": "./tmp/sessions"
      }
    }
  }
}
```

This configuration enables all capabilities including shared prompts, which will automatically appear as `/dot-ai:prompt-name` slash commands in your coding agent. <!-- dotai-ignore -->

### 3. Start Your AI Tool

```bash
# Claude Code
claude

# The MCP server will automatically connect
```

### 4. Verify Connection

**Test MCP server connection:**
```bash
# In your coding agent, verify that dot-ai MCP tools are available
# Look for tools like: recommend, testDocs, prompts, etc.
```

**Test shared prompts (if using prompts library):** <!-- dotai-ignore -->
```bash
# In your coding agent, type "/" to see available commands
# Look for commands like: /dot-ai:prd-create, /dot-ai:context-save, etc.
```

**Troubleshooting connection issues:**
- Check that `.mcp.json` file exists in your project root
- Verify environment variables are set correctly
- Restart your coding agent if configuration was changed
- Check coding agent logs for MCP connection errors

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key for AI analysis | `sk-ant-api03-...` |
| `DOT_AI_SESSION_DIR` | Directory for session storage | `./tmp/sessions` |

### Optional Variables

| Variable | Feature | Description | Example |
|----------|---------|-------------|---------|
| `KUBECONFIG` | Kubernetes Deployment | Kubernetes config file path | `./configs/cluster.yaml` |
| `QDRANT_URL` | Capability & Pattern Management | Qdrant Vector DB URL | `https://your-cluster.qdrant.io` |
| `QDRANT_API_KEY` | Capability & Pattern Management | Qdrant API key | `your-qdrant-api-key` |
| `OPENAI_API_KEY` | Capability & Pattern Management | OpenAI key for semantic search | `sk-proj-...` |

## Path Resolution

**Relative paths** are resolved relative to the MCP server's working directory:

```json
{
  "cwd": "/Users/you/projects/myapp",
  "env": {
    "DOT_AI_SESSION_DIR": "./tmp/sessions",     // → /Users/you/projects/myapp/tmp/sessions
    "KUBECONFIG": "./k8s/config.yaml"          // → /Users/you/projects/myapp/k8s/config.yaml
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
claude
# MCP tools are now available in conversation
```

### Cursor

**Setup:**
1. Open Cursor Settings
2. Navigate to "MCP Servers"  
3. Add DevOps AI Toolkit configuration
4. Restart Cursor

**Configuration:**
```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here",
        "DOT_AI_SESSION_DIR": "./cursor-sessions"
      }
    }
  }
}
```

### VS Code (with MCP Extension)

**Setup:**
1. Install MCP extension from marketplace
2. Configure in VS Code `settings.json`
3. Restart VS Code

**Configuration in settings.json:**
```json
{
  "mcp.servers": {
    "dot-ai": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here",
        "DOT_AI_SESSION_DIR": "./vscode-sessions"
      }
    }
  }
}
```

## Troubleshooting

### MCP Server Won't Start

**Symptoms:**
- "Cannot connect to MCP server" error
- Server process exits immediately

**Solutions:**

1. **Check API key:**
   ```bash
   echo $ANTHROPIC_API_KEY
   # Should show your API key starting with sk-ant-
   ```

2. **Verify session directory:**
   ```bash
   ls -la ./tmp/sessions
   # Directory should exist and be writable
   mkdir -p ./tmp/sessions  # Create if missing
   ```

3. **Test manual startup:**
   ```bash
   npx @vfarcic/dot-ai@latest mcp
   # Should start and show "MCP server listening"
   ```

### Session Directory Errors

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

3. **Use absolute path:**
   ```json
   {
     "env": {
       "DOT_AI_SESSION_DIR": "/tmp/dot-ai-sessions"
     }
   }
   ```

### API Key Issues

**Symptoms:**
- "Invalid API key" errors
- Authentication failures

**Solutions:**

1. **Verify API key format:**
   - Should start with `sk-ant-api03-`
   - Should be 60+ characters long

2. **Test API key:**
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "content-type: application/json" \
     -d '{"model":"claude-3-sonnet-20240229","max_tokens":1,"messages":[{"role":"user","content":"test"}]}'
   ```

3. **Check API key permissions:**
   - Ensure key has access to Claude 3 models
   - Verify account has sufficient credits

## Advanced Configuration

### Multiple Environments

Configure different MCP servers for different environments:

```json
{
  "mcpServers": {
    "dot-ai-prod": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here",
        "KUBECONFIG": "./configs/prod-cluster.yaml",
        "DOT_AI_SESSION_DIR": "./tmp/prod-sessions"
      }
    },
    "dot-ai-staging": {
      "command": "npx",
      "args": ["-y", "--package=@vfarcic/dot-ai@latest", "dot-ai-mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here", 
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
    "DOT_AI_SESSION_DIR": "./deployments/sessions"
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

### Development Setup

For development or local testing:

```json
{
  "mcpServers": {
    "dot-ai-dev": {
      "command": "npm",
      "args": ["run", "start:mcp"],
      "cwd": "/path/to/dot-ai-source",
      "env": {
        "ANTHROPIC_API_KEY": "your_key_here",
        "DOT_AI_SESSION_DIR": "./dev-sessions",
        "NODE_ENV": "development"
      }
    }
  }
}
```

## Debug Mode

For troubleshooting MCP server issues:

1. **Check MCP server logs** in your AI tool's output panel
2. **Test direct connection:**
   ```bash
   npx @vfarcic/dot-ai@latest mcp --verbose
   ```
3. **Verify MCP tools are loaded:**
   - Ask your AI assistant: "What MCP tools do you have available?"
   - Should list dot-ai tools like `recommend`, `testDocs`, etc.
   - Access your coding agent's command palette (for example, type `/` in Claude Code)
   - Should show shared prompts with server prefix (e.g., `/mcp__dot-ai__*` commands)

## Next Steps

Once MCP server setup is complete, explore the available features:

- **[Capability Management Guide](mcp-capability-management-guide.md)** - Discover resource capabilities for intelligent recommendation matching (recommended first step for Kubernetes users)
- **[MCP Recommendation Guide](mcp-recommendation-guide.md)** - Kubernetes deployment recommendations with enhanced semantic understanding
- **[Pattern Management Guide](pattern-management-guide.md)** - Organizational deployment patterns
- **[MCP Documentation Testing Guide](mcp-documentation-testing-guide.md)** - Automated documentation validation
- **[MCP Prompts Guide](mcp-prompts-guide.md)** - Shared prompt library and slash commands

## See Also

For additional information, see the main README.md file in the repository.