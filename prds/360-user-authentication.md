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
| **Single Token** (existing) | Shared token | Anonymous | Development, simple setups |
| **OAuth 2.1** (new, primary) | Browser-based OAuth flow | Specific user | Enterprise, compliance needs |
| **API Keys** (new, fallback) | Per-user static keys | Specific user | CI/CD, headless environments |

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
4. **MCP Server Issues Tokens**: Third-party provider authenticates, dot-ai issues its own tokens
5. **Audit Integration**: User identity flows through to all audit logs
6. **Foundation for Permissions**: Provides identity that PRD #361 builds upon

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

### Core Components

**1. OAuth Resource Server (`src/core/auth/oauth/`)**
- Protected Resource Metadata endpoint
- Authorization Server Metadata endpoint
- Token validation middleware
- Bearer token extraction and verification

**2. Authorization Server (`src/core/auth/oauth/`)**
- Authorization endpoint (redirects to provider)
- Token endpoint (issues dot-ai tokens)
- PKCE validation
- Resource indicator validation (RFC 8707)

**3. Identity Providers (`src/core/auth/providers/`)**
- GitHub OAuth provider
- Google OAuth provider (future)
- Provider abstraction interface

**4. Token Management (`src/core/auth/tokens/`)**
- JWT token generation and signing
- Token validation and claims extraction
- Refresh token handling
- Token storage (user sessions)

**5. API Key Authentication (`src/core/auth/apikeys/`) - Future**
- API key generation and hashing
- API key validation
- Key revocation

**6. MCP Integration (`src/interfaces/mcp.ts`)**
- Authentication middleware for MCP connections
- 401 response with WWW-Authenticate header
- User context propagation to tool handlers
- Backward compatibility with single token mode

**7. Audit Integration**
- Include user identity in all audit log entries
- Track authentication events (login, failed attempts)

### Configuration

```yaml
# Example configuration
auth:
  mode: "oauth"  # "token" (existing), "oauth" (new), or "both"

  # For mode: "token" (existing behavior)
  token: "shared-secret"

  # For mode: "oauth" or "both"
  oauth:
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
      signing_key: "..."  # Or path to key file
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

### Milestone 1: OAuth Infrastructure & Metadata Endpoints

**Objective**: Implement MCP-compliant OAuth discovery endpoints

**Deliverables:**
- [ ] Protected Resource Metadata endpoint (`/.well-known/oauth-protected-resource`)
- [ ] Authorization Server Metadata endpoint (`/.well-known/oauth-authorization-server`)
- [ ] 401 response with WWW-Authenticate header for unauthenticated requests
- [ ] Configuration schema for OAuth mode

**Success Criteria:**
- MCP clients can discover auth requirements via standard endpoints
- Endpoints return spec-compliant metadata

---

### Milestone 2: GitHub OAuth Provider

**Objective**: Implement GitHub as the first identity provider

**Deliverables:**
- [ ] GitHub OAuth provider implementation
- [ ] Authorization endpoint (redirects to GitHub)
- [ ] Callback handling (receives auth code from GitHub)
- [ ] User info fetching from GitHub API
- [ ] Provider abstraction for future providers

**Success Criteria:**
- Users can authenticate via GitHub
- User's GitHub identity (username, email, orgs) available after auth

---

### Milestone 3: Token Issuance & Validation

**Objective**: Issue and validate dot-ai access tokens

**Deliverables:**
- [ ] JWT token generation with user claims
- [ ] PKCE validation (S256)
- [ ] Resource indicator validation (RFC 8707)
- [ ] Token endpoint implementation
- [ ] Bearer token validation middleware
- [ ] Refresh token support

**Success Criteria:**
- Tokens issued after successful GitHub auth
- Tokens validated on every MCP request
- Invalid/expired tokens rejected with 401
- Refresh tokens work correctly

---

### Milestone 4: MCP Integration

**Objective**: Integrate OAuth into MCP request flow

**Deliverables:**
- [ ] Authentication middleware for MCP connections
- [ ] User context propagation to tool handlers
- [ ] Backward compatibility with single token mode
- [ ] Mode selection via configuration

**Success Criteria:**
- MCP connections require valid token (in OAuth mode)
- User identity available in all tool handlers
- Single token mode still works when configured
- Seamless experience for MCP client users

---

### Milestone 5: Audit Integration

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

### Milestone 6: Integration Testing & Documentation

**Objective**: Validate end-to-end flow and document for users

**Deliverables:**
- [ ] Integration tests for OAuth discovery flow
- [ ] Integration tests for GitHub auth flow
- [ ] Integration tests for token validation
- [ ] Tests for backward compatibility (single token)
- [ ] Documentation for OAuth setup
- [ ] Documentation for GitHub OAuth app creation

**Success Criteria:**
- All integration tests passing
- Single token mode regression tests passing
- Users can set up OAuth following documentation

---

### Milestone 7: API Keys (Future)

**Objective**: Add API key support for headless environments

**Deliverables:**
- [ ] API key generation (CLI or API)
- [ ] API key validation as Bearer token alternative
- [ ] API key revocation
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

- **v2.0** (2026-02-02): Major revision to align with MCP Authorization Specification; OAuth 2.1 as primary method, API keys as future fallback
- **v1.0** (2026-01-30): Initial PRD creation with API keys as primary method
