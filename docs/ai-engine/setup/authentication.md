---
sidebar_position: 3
---

# Authentication

**Control access to your DevOps AI Toolkit Engine with OAuth single sign-on or static tokens.**

## Overview

**What it does**: Authenticates users before they can access any toolkit tools. Supports two modes that coexist — OAuth is enabled by default, and static tokens work alongside it.

**Use when**: You're deploying the AI Engine and need to understand how authentication works or configure it for your team.

## Two Authentication Modes

The AI Engine supports two authentication modes simultaneously. Both can be active at the same time — the server tries OAuth (JWT) first, then falls back to static token.

| | OAuth (default) | Static Token |
|--|----------------|--------------|
| **How it works** | Browser-based login via OIDC | Shared Bearer token (`DOT_AI_AUTH_TOKEN`) |
| **Identity** | Individual — each user has their own identity | Anonymous — all users share one token |
| **Setup** | Enabled by default with auto-generated admin | One environment variable |
| **User management** | Create/list/delete users via [CLI](https://devopstoolkit.ai/docs/cli) *(coming soon)* and [Web UI](https://devopstoolkit.ai/docs/ui) *(coming soon)* | N/A — single shared token |
| **Best for** | Teams, enterprise SSO, per-user audit trail | Local dev, CI/CD, quick start |

### When to Use Which

| Use Case | Auth Mode | Why |
|----------|-----------|-----|
| Teams needing per-user identity | OAuth | Individual audit trail |
| Enterprise SSO (Google, GitHub, LDAP) | OAuth | Connects to your existing identity provider |
| MCP clients with OAuth (Claude Code, Codex, Windsurf) | OAuth | Automatic browser-based login |
| Local development / quick start | Static token | Zero setup, works immediately |
| CI/CD pipelines | Static token | No browser for OAuth flow |
| REST API automation | Static token | Programmatic access without interactive login |
| MCP clients without OAuth support | Static token | Only option available |

## OAuth

On `helm install`, the AI Engine automatically:

1. Generates a random admin password
2. Creates an `admin@dot-ai.local` account
3. Shows the credentials in the Helm install output

No passwords are stored in chart values or Git. See the [Deployment Guide](deployment.md) for retrieving the initial credentials.

For MCP client setup with OAuth (which clients support it, how to authenticate), see [MCP Client Setup](/docs/mcp#oauth-authentication).

To connect your organization's identity provider (Google, GitHub, LDAP, SAML), see [Identity Provider Connectors](connectors.md).

## Static Token

`DOT_AI_AUTH_TOKEN` is required in the Kubernetes secret referenced by the Helm chart. All users sharing this token get anonymous identity — there's no individual user tracking.

**Option A — via Helm values** (chart creates the secret):

```yaml
secrets:
  auth:
    token: "your-shared-token"
```

**Option B — create the secret yourself:**

```bash
kubectl create secret generic dot-ai-secrets \
  --from-literal=auth-token="your-shared-token" \
  -n dot-ai
```

Static token works alongside OAuth — you can use both at the same time. See [MCP Client Setup](/docs/mcp) for client configuration with either mode.

## User Identity

Every authenticated request carries a user identity. The `version` tool includes identity information in its response:

| Field | OAuth | Static Token |
|-------|-------|--------------|
| **userId** | Unique ID from identity provider | `anonymous` |
| **email** | User's email | — |
| **groups** | Groups from identity provider | — |
| **source** | `oauth` | `token` |

## See Also

- **[Deployment Guide](deployment.md)** — Install the AI Engine and retrieve initial admin credentials
- **[MCP Client Setup](/docs/mcp)** — Connect your MCP client with OAuth or static token
- **[Identity Provider Connectors](connectors.md)** — Connect Google, GitHub, LDAP, or SAML
