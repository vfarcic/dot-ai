# MCP

**Connect to the DevOps AI Toolkit Engine via MCP protocol from your preferred coding assistant.**

MCP (Model Context Protocol) is an open protocol that lets AI coding assistants connect to external tools and data sources. When you connect your coding assistant to the DevOps AI Toolkit via MCP, all toolkit tools become available directly in your editor — no context switching required.

> **Alternative**: The [CLI](https://devopstoolkit.ai/docs/cli) provides command-line access to all toolkit capabilities — for AI agents (with lower token overhead), scripting, CI/CD pipelines, and direct resource access beyond what MCP exposes.

## Prerequisites

- DevOps AI Toolkit Engine deployed to Kubernetes — see [AI Engine Deployment](/docs/ai-engine/setup/deployment)
- An MCP-compatible client (Claude Code, Cursor, VS Code, Cline, etc.)
- Your server URL from the deployment step
- **Authentication** — a static token (`DOT_AI_AUTH_TOKEN`) or OAuth credentials. See [Authentication](/docs/ai-engine/setup/authentication) for both modes.

## Step 1: Configure Your Client

Create an `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "dot-ai": {
      "type": "http",
      "url": "http://dot-ai.127.0.0.1.nip.io",
      "headers": {
        "Authorization": "Bearer <your-auth-token>"
      }
    }
  }
}
```

Replace `<your-auth-token>` with the token from your deployment (run `echo $DOT_AI_AUTH_TOKEN` to view it).

**Notes**:
- Replace the URL with your actual hostname if you changed `ingress.host` during deployment.
- For production deployments with TLS, use `https://` in the URL.

## Step 2: Start Your Client

Start your MCP client. It will automatically connect to the server.

- **Claude Code**: Run `claude` in the directory containing `.mcp.json`
- **Cursor**: The MCP connection activates when you open the project
- **VS Code / Cline**: The MCP connection activates based on your extension settings

## Step 3: Verify the Connection

In your MCP client, ask:

```text
Show dot-ai status
```

You should see comprehensive system status including Kubernetes connectivity, vector database, and all available tools.

## OAuth Authentication

If your deployment has OAuth enabled (the default), MCP clients that support OAuth can authenticate via browser login instead of a static token. This gives each user their own identity for audit trails and future access control.

Some clients open the login page automatically. If yours doesn't, go to your client's MCP server configuration and select the option to authenticate (e.g., in Claude Code: `/mcp` → select server → Authenticate). Tokens are cached across sessions — you only re-authenticate when they expire.

For OAuth, your `.mcp.json` does not need an `Authorization` header — the client handles authentication automatically:

```json
{
  "mcpServers": {
    "dot-ai": {
      "type": "http",
      "url": "http://dot-ai.127.0.0.1.nip.io"
    }
  }
}
```

### Client OAuth Support

| Client | OAuth Support | Notes |
|--------|--------------|-------|
| **Claude Code** | Yes | Run `/mcp` → select server → Authenticate. Tokens cached across sessions. |
| **ChatGPT** | Yes | Browser opens automatically. |
| **Windsurf** | Yes | Browser opens automatically. |
| **VS Code Copilot** | Yes (v1.101+) | Supported in recent versions. |
| **Cursor** | Partial | Platform-dependent; use static token if OAuth doesn't work. |
| **Cline** | No | Use static token. |

For full details on authentication modes, user management, and identity provider setup, see the [Authentication Guide](/docs/ai-engine/setup/authentication).

## Client Compatibility

The DevOps AI Toolkit works with any MCP-compatible coding agent or development tool.

### Popular MCP Clients

**Claude Code**
- Save `.mcp.json` in your project root
- Start with `claude` — tools are automatically available
- Supports OAuth: run `/mcp` → select server → Authenticate

**Cursor**
- Settings -> "MCP Servers" -> Add configuration -> Restart

**Cline (VS Code Extension)**
- Configure in VS Code settings or extension preferences

**VS Code (with MCP Extension)**
- Add configuration to `settings.json` under `mcp.servers`

**Other MCP Clients**
- Any client supporting the Model Context Protocol standard
- Use the HTTP configuration pattern shown in [Step 1](#step-1-configure-your-client)
- If your client supports OAuth, omit the `Authorization` header — see [OAuth Authentication](#oauth-authentication)

## Next Steps

- **[Tools Overview](/docs/ai-engine/tools/overview)** — Explore all available tools and how they work together
- **[Authentication](/docs/ai-engine/setup/authentication)** — Understand OAuth vs static token, manage users, configure identity providers

