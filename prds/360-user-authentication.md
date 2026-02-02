# PRD: User Authentication & Access Control

**Status**: Planning
**Priority**: High
**GitHub Issue**: [#360](https://github.com/vfarcic/dot-ai/issues/360)
**Created**: 2026-01-30
**Last Updated**: 2026-02-02

---

## Problem Statement

The MCP server currently supports only a **single shared auth token** for all users. This design limitation prevents enterprise deployments where:

- Individual user identity needs to be verified before granting MCP access
- Access should be restricted to authorized users only
- Audit logs need to track which specific user performed operations
- Different users may need different permission levels

**Current State:**
- Single `AUTH_TOKEN` environment variable shared by all users
- Anyone with the token has full access
- No way to identify individual users in audit logs
- No mechanism to revoke access for specific users

**User Impact:**
- Enterprise security teams cannot approve MCP deployment without user-level access control
- Compliance requirements for user identity tracking cannot be met
- No accountability - cannot determine who performed specific operations
- Credential sharing creates security risks

## Proposed Solution

Implement **OAuth 2.1-based authentication** following the [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization). This is the official standard for MCP authentication, ensuring compatibility with MCP clients like Claude Code, Cursor, and others.

### Authentication Modes

| Mode | Authentication | Audit Identity | Use Case |
|------|----------------|----------------|----------|
| **none** | Admin token only | Anonymous | Development, simple setups |
| **oauth** | Admin token + OAuth | Specific user | Enterprise, compliance needs |

**Note**: The admin token (`DOT_AI_AUTH_TOKEN`) is always available in both modes. In `none` mode, only the admin token works. In `oauth` mode, both admin token and OAuth JWTs are valid. **Authentication is always required** - there is no anonymous access.

### How It Works (OAuth Flow)

```
┌─────────────┐                              ┌─────────────┐
│  MCP Client │  1. Connect (no token)       │  MCP Server │
│ (Claude Code)│ ───────────────────────────► │  (dot-ai)   │
│             │ ◄─────────────────────────── │             │
└─────────────┘  2. HTTP 401 + WWW-Authenticate└─────────────┘
       │
       │  3. Fetch /.well-known/oauth-protected-resource
       │  4. Generate PKCE code_verifier + code_challenge
       │  5. Open browser to auth URL
       ▼
┌─────────────┐     6. User authenticates    ┌─────────────┐
│   Browser   │ ───────────────────────────► │  GitHub/    │
│             │ ◄─────────────────────────── │  Google     │
└─────────────┘  7. Redirect with auth code  └─────────────┘
       │
       ▼
┌─────────────┐  8. Exchange code for token  ┌─────────────┐
│  MCP Client │ ───────────────────────────► │  dot-ai     │
│             │ ◄─────────────────────────── │  Auth Server│
└─────────────┘  9. Access token (+ refresh) └─────────────┘
       │
       │  10. MCP requests with Bearer token
       ▼
┌─────────────┐                              ┌─────────────┐
│  MCP Client │  Authorization: Bearer xyz   │  MCP Server │
└─────────────┘ ───────────────────────────► └─────────────┘
```

### Key Design Principles

1. **MCP Spec Compliant**: Follows official MCP Authorization specification
2. **Backward Compatible**: Single token mode continues to work unchanged
3. **Standard OAuth Providers**: GitHub and Google as initial identity providers
4. **Plugin-Based Architecture**: Auth implemented as tools in the agentic-tools plugin (same as kubectl tools)
5. **Local JWT Validation**: Plugin issues JWTs, MCP server validates locally (no per-request plugin calls)
6. **Extensible**: Users can add custom auth by deploying their own auth plugin
7. **Audit Integration**: User identity flows through to all audit logs
8. **Foundation for Permissions**: Provides identity that PRD #361 builds upon

## Success Criteria

### Must Have (MVP)

- [ ] MCP server implements OAuth 2.1 resource server role
- [ ] Protected Resource Metadata endpoint (`/.well-known/oauth-protected-resource`)
- [ ] Authorization Server Metadata endpoint (`/.well-known/oauth-authorization-server`)
- [ ] GitHub OAuth provider integration
- [ ] PKCE support (S256 code challenge method)
- [ ] Resource indicator validation (RFC 8707)
- [ ] Access token issuance and validation
- [ ] User identity in audit logs
- [ ] Existing single token mode continues to work
- [ ] Integration tests validating OAuth flow

### Nice to Have (Future)

- [ ] Google OAuth provider integration
- [ ] API keys for headless/CI environments
- [ ] Refresh token rotation
- [ ] Token revocation endpoint
- [ ] Client ID Metadata Documents (CIMD) support
- [ ] Enterprise-Managed Authorization extension
- [ ] Rate limiting per user

### Success Metrics

- Unauthorized access attempts rejected 100% of the time
- All authenticated operations traceable to specific user in audit logs
- No regression in single token mode functionality
- Authentication adds <100ms latency to initial connection
- Compatible with Claude Code, Cursor, and other MCP clients

## User Journey

### Current State (Single Token)

1. Admin sets `AUTH_TOKEN=shared-secret` on MCP server
2. All users configure MCP client with the same token
3. Users connect and use MCP tools
4. Audit logs show operations but not who performed them

### Future State (OAuth)

1. Admin enables OAuth mode and configures GitHub OAuth app
2. User connects MCP client to dot-ai server
3. Browser opens automatically to GitHub login
4. User authenticates with GitHub
5. dot-ai issues access token, MCP client stores it
6. All operations logged with user's GitHub identity
7. Token refresh happens automatically

### Future State (API Keys - Headless)

1. Admin creates API key for CI pipeline
2. CI configures MCP client with API key
3. CI connects and uses MCP tools
4. Operations logged with API key identity

### User Personas

**Persona 1: Enterprise Security Admin**
- Needs to approve MCP deployment for their organization
- Requires user-level access control and audit trails
- Wants integration with existing identity systems (GitHub org, Google Workspace)

**Persona 2: Platform Team Lead**
- Manages MCP access for their team
- Wants seamless auth via GitHub (team already uses it)
- Needs to track who is using MCP and how

**Persona 3: DevOps Engineer**
- Needs to integrate MCP into CI/CD pipelines
- Requires API keys for headless access
- Wants audit trail for automated operations

**Persona 4: Solo Developer (Existing User)**
- Uses single token mode locally
- Should see no changes to their workflow
- May later adopt OAuth for convenience (no token management)

## Technical Scope

### Architecture Overview

Auth is implemented as **plugin tools** in the existing agentic-tools plugin, following the same pattern as kubectl tools. This provides a unified extensibility model and keeps all built-in capabilities in a single deployment.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           MCP Server                                 │
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────────┐ │
│  │ Auth Hook    │    │ OAuth Routes │    │ JWT Validation         │ │
│  │ (calls       │    │ /oauth/*     │    │ (local, using          │ │
│  │  plugin)     │    │ /.well-known │    │  public key)           │ │
│  └──────┬───────┘    └──────┬───────┘    └────────────────────────┘ │
│         │                   │                                        │
└─────────┼───────────────────┼────────────────────────────────────────┘
          │                   │
          │    HTTP calls     │
          │    (initial auth  │
          │     only)         │
          ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    agentic-tools Plugin Pod                          │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ kubectl      │  │ Auth Tools:  │  │ JWT Signing              │   │
│  │ tools        │  │ - authenticate│  │ (private key)            │   │
│  │              │  │ - getMetadata│  │                          │   │
│  │              │  │ - exchangeCode│  │                          │   │
│  │              │  │ - getPublicKey│  │                          │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
          │
          │ (Users can deploy additional auth plugins)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Custom Auth Plugin Pod (optional)                 │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Custom Auth Tools: LDAP, SAML, custom SSO, etc.              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Request Flow

**Initial Authentication (OAuth):**
1. Client connects without token → MCP returns 401 with WWW-Authenticate
2. Client fetches `/.well-known/oauth-protected-resource` → MCP calls plugin's `getMetadata` tool
3. Client opens browser to `/oauth/authorize` → MCP calls plugin's `startOAuthFlow` tool, redirects to GitHub
4. User authenticates with GitHub → GitHub redirects to `/oauth/callback`
5. MCP calls plugin's `exchangeCode` tool → Plugin returns JWT signed with private key
6. MCP returns JWT to client

**Subsequent Requests:**
1. Client sends request with `Authorization: Bearer <JWT>`
2. MCP validates JWT locally using cached public key (no plugin call)
3. Request proceeds with user context

### Core Components

**1. Auth Tools in agentic-tools Plugin**

| Tool | Purpose |
|------|---------|
| `auth_get_public_key` | Returns public key for JWT validation (called once at startup) |
| `auth_get_metadata` | Returns OAuth metadata for well-known endpoints |
| `auth_start_oauth_flow` | Initiates OAuth flow, returns redirect URL |
| `auth_exchange_code` | Exchanges OAuth code for JWT (issues tokens) |
| `auth_refresh_token` | Exchanges refresh token for new access token |
| `auth_validate_token` | Validates token and returns claims (fallback if local validation fails) |

**2. MCP Server Auth Integration (`src/interfaces/mcp.ts`)**
- Auth hook that calls plugin tools for initial auth
- Local JWT validation using cached public key
- OAuth HTTP routes (`/oauth/*`) that delegate to plugin
- Well-known endpoints that call plugin's `getMetadata`
- 401 response with WWW-Authenticate header
- User context propagation to tool handlers
- Backward compatibility with single token mode

**3. JWT Token Management**
- Plugin generates RSA/EC key pair at startup
- Plugin issues JWTs after successful OAuth (signed with private key)
- MCP fetches public key once, validates JWTs locally
- Short-lived access tokens (1 hour), longer refresh tokens (7 days)

**4. Identity Providers (in plugin)**
- GitHub OAuth provider
- Google OAuth provider (future)
- Provider abstraction for custom providers

**5. API Key Authentication (Future)**
- API key generation and hashing
- API key validation
- Key revocation

**6. Audit Integration**
- Include user identity in all audit log entries
- Track authentication events (login, failed attempts)

### Configuration

**MCP Server Configuration:**
```yaml
# Example configuration
auth:
  mode: "oauth"  # "none" (admin token only) or "oauth" (admin token + OAuth)

  # Admin token - always works in both modes
  token: "shared-secret"

  # For mode: "oauth"
  # Plugin handles OAuth - just specify which plugins to use
  plugins:
    - "agentic-tools"  # Built-in auth (default)
    # - "custom-ldap-auth"  # User's custom auth plugin
```

**Environment Variable Overrides:**
```bash
DOT_AI_AUTH_MODE=oauth              # "none" | "oauth" (default: "none")
DOT_AI_AUTH_TOKEN=xxx               # Admin token (always available)
DOT_AI_AUTH_PLUGINS=agentic-tools   # Comma-separated plugin list (for oauth mode)
```

**Plugin Configuration (agentic-tools plugin):**
```yaml
# Plugin's own configuration (in plugin deployment)
auth:
  issuer: "https://mcp.company.com"

  providers:
    github:
      client_id: "xxx"
      client_secret: "yyy"
      allowed_orgs: ["my-company"]  # Optional: restrict to org members

    google:  # Future
      client_id: "xxx"
      client_secret: "yyy"
      allowed_domains: ["company.com"]

  tokens:
    access_token_ttl: "1h"
    refresh_token_ttl: "7d"
    # Signing key generated automatically by plugin
```

### Well-Known Endpoints

**Protected Resource Metadata** (`/.well-known/oauth-protected-resource`):
```json
{
  "resource": "https://mcp.company.com",
  "authorization_servers": ["https://mcp.company.com"],
  "scopes_supported": ["mcp:read", "mcp:write", "mcp:admin"]
}
```

**Authorization Server Metadata** (`/.well-known/oauth-authorization-server`):
```json
{
  "issuer": "https://mcp.company.com",
  "authorization_endpoint": "https://mcp.company.com/oauth/authorize",
  "token_endpoint": "https://mcp.company.com/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["mcp:read", "mcp:write", "mcp:admin"]
}
```

### MCP Client Configuration

Once authenticated, MCP clients store and use the token automatically:
```json
{
  "mcpServers": {
    "dot-ai": {
      "url": "https://mcp.company.com"
    }
  }
}
```

No manual token configuration needed - the OAuth flow handles it.

## Dependencies

**Internal Dependencies:**
- None - this is a foundational change

**External Dependencies:**
- GitHub OAuth App registration
- Google OAuth credentials (future)
- JWT library for token signing

**Dependent PRDs:**
- PRD #361 (User-Specific Permissions) depends on this PRD for user identity

## Milestones

### Milestone 1: Auth Plugin Tools & MCP Integration

**Objective**: Implement auth tools in agentic-tools plugin and MCP server integration

**Deliverables:**
- [x] Auth tools in agentic-tools plugin:
  - [x] `auth_get_public_key` - Returns public key for JWT validation
  - [x] `auth_get_metadata` - Returns OAuth metadata (RFC 9728, RFC 8414)
  - [x] `auth_validate_token` - Validates token (fallback for local validation)
- [x] MCP server integration:
  - [x] Fetch and cache public key from plugin at startup
  - [x] Local JWT validation using cached public key
  - [x] Well-known endpoints (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`)
  - [x] 401 response with WWW-Authenticate header
  - [x] Auth plugin configuration schema
- [x] Admin token always works regardless of mode (`DOT_AI_AUTH_TOKEN`)

**Success Criteria:**
- MCP clients can discover auth requirements via standard endpoints
- Endpoints return spec-compliant metadata
- JWTs validated locally (no plugin call per request)
- Single token mode unchanged

---

### Milestone 2: GitHub OAuth Flow

**Objective**: Implement GitHub OAuth flow via plugin tools

**Deliverables:**
- [ ] Auth tools in agentic-tools plugin:
  - [ ] `auth_start_oauth_flow` - Returns GitHub authorization URL with PKCE
  - [ ] `auth_exchange_code` - Exchanges code for JWT, fetches GitHub user info
  - [ ] `auth_refresh_token` - Exchanges refresh token for new access token
- [ ] MCP server OAuth routes:
  - [ ] `GET /oauth/authorize` - Initiates OAuth flow (calls plugin)
  - [ ] `GET /oauth/callback` - Receives GitHub callback (calls plugin)
  - [ ] `POST /oauth/token` - Token exchange endpoint (calls plugin)
- [ ] JWT token issuance with user claims (id, name, email, orgs)
- [ ] PKCE validation (S256)

**Success Criteria:**
- Users can authenticate via GitHub
- User's GitHub identity available in JWT claims
- PKCE prevents authorization code interception
- Tokens issued and validated correctly

---

### Milestone 3: MCP Request Authentication

**Objective**: Integrate auth into MCP request flow

**Deliverables:**
- [ ] Auth hook in MCP HTTP handler
- [ ] User context propagation to tool handlers
- [ ] Mode selection via configuration (`none`, `oauth`)
- [ ] Graceful degradation if plugin unavailable

**Success Criteria:**
- MCP connections require valid token (in OAuth mode)
- User identity available in all tool handlers
- Single token mode works when configured
- Clear error messages for auth failures

---

### Milestone 4: Audit Integration

**Objective**: Include user identity in all audit logs

**Deliverables:**
- [ ] User identity in operation audit logs
- [ ] Authentication event logging (success, failure)
- [ ] Audit log schema update for user fields

**Success Criteria:**
- All operations traceable to specific user
- Failed authentication attempts logged
- Audit logs queryable by user

---

### Milestone 5: Integration Testing & Documentation

**Objective**: Validate end-to-end flow and document for users

**Deliverables:**
- [ ] Integration tests for OAuth discovery flow
- [ ] Integration tests for GitHub auth flow
- [ ] Integration tests for JWT validation
- [ ] Integration tests for backward compatibility
- [ ] Documentation for OAuth setup
- [ ] Documentation for GitHub OAuth app creation
- [ ] Documentation for custom auth plugin development

**Success Criteria:**
- All integration tests passing
- Single token mode regression tests passing
- Users can set up OAuth following documentation
- Users can develop custom auth plugins

---

### Milestone 6: API Keys (Future)

**Objective**: Add API key support for headless environments

**Deliverables:**
- [ ] `auth_create_api_key` tool in plugin
- [ ] `auth_revoke_api_key` tool in plugin
- [ ] API key validation in MCP server
- [ ] Documentation for CI/CD usage

**Success Criteria:**
- CI/CD can authenticate with API keys
- API key operations logged with key identity

---

## Security Considerations

### Token Security

- Access tokens are short-lived (1 hour default)
- Refresh tokens rotated on use
- Tokens bound to specific resource (RFC 8707)
- Tokens signed with secure algorithm (RS256 or ES256)

### PKCE

- Required for all authorization requests
- S256 method mandatory
- Prevents authorization code interception

### Provider Security

- GitHub org restriction available (only org members can auth)
- Google domain restriction available (future)
- Failed auth attempts rate-limited and logged

### Token Storage

- MCP clients responsible for secure token storage
- Refresh tokens should be stored securely
- Guidance provided in documentation

## References

- [MCP Authorization Specification (June 2025)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)
- [RFC 8707 - Resource Indicators for OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8707.html)
- [RFC 9728 - OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [November 2025 MCP Auth Spec Updates](https://den.dev/blog/mcp-november-authorization-spec/)

## Related Resources

- **GitHub Issue**: [#360](https://github.com/vfarcic/dot-ai/issues/360)
- **Dependent PRD**: [#361 - User-Specific Permissions](./361-user-specific-permissions.md)

---

## Version History

- **v3.1** (2026-02-02): Simplified auth modes to `none`/`oauth`; admin token always available; removed anonymous access option; completed Milestone 1 implementation
- **v3.0** (2026-02-02): Architecture change to plugin-based auth; auth tools in agentic-tools plugin, MCP validates JWTs locally
- **v2.0** (2026-02-02): Major revision to align with MCP Authorization Specification; OAuth 2.1 as primary method, API keys as future fallback
- **v1.0** (2026-01-30): Initial PRD creation with API keys as primary method
