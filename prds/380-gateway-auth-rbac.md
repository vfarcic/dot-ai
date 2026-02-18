# PRD: Gateway-Delegated Authentication & Built-in RBAC

**Status**: Planning
**Priority**: High
**GitHub Issue**: [#380](https://github.com/vfarcic/dot-ai/issues/380)
**Created**: 2026-02-18
**Last Updated**: 2026-02-18
**Supersedes**: [PRD #360 - User Authentication](./done/360-user-authentication.md) (closed)

---

## Problem Statement

Enterprise deployments need user-level authentication and authorization for MCP access. The current system supports only a **single shared auth token** (`DOT_AI_AUTH_TOKEN`), which means:

- No individual user identity — all users share one token
- No way to control what specific users can do (no authorization)
- Audit logs cannot track who performed operations
- No mechanism to revoke access for specific users

The previous approach (PRD #360) proposed building a full OAuth 2.1 authorization server inside dot-ai. This was closed because:

1. **MCP gateways already handle authN natively** — see [awesome-mcp-gateways](https://github.com/e2b-dev/awesome-mcp-gateways)
2. **Redirect URL problem** — different MCP clients (Claude Code, Cursor, Gemini CLI) have different redirect URLs, making in-app OAuth complex
3. **Scope creep** — building and maintaining a full auth server is orthogonal to dot-ai's core value as a Kubernetes operations tool

## Proposed Solution

**Hybrid architecture** with clean separation of concerns:

| Layer | Responsibility | Owner |
|-------|---------------|-------|
| **AuthN** (who are you?) | OAuth, SSO, token validation | MCP Gateway (external) |
| **AuthZ/RBAC** (what can you do?) | Role-based access control | dot-ai plugin |
| **Single token** (existing) | Shared token for simple setups | dot-ai MCP layer |

### Authentication Modes

| Mode | Identity Source | RBAC | Use Case |
|------|----------------|------|----------|
| **Token** (existing) | Shared token, no individual identity | No RBAC | Development, simple deployments |
| **Gateway** (new) | User identity from gateway headers/JWT | Full RBAC | Enterprise deployments |

Both modes require authentication. There is no unauthenticated access.

### How It Works

```
┌─────────────┐                              ┌─────────────┐
│  MCP Client  │  1. Connect with OAuth      │  MCP Gateway │
│ (Claude Code)│ ──────────────────────────► │  (external)  │
│              │ ◄────────────────────────── │              │
└──────────────┘  2. Authenticated           └──────────────┘
                                                    │
                                                    │ 3. Forward request with
                                                    │    verified identity headers
                                                    ▼
                                             ┌──────────────────────┐
                                             │   dot-ai MCP Server  │
                                             │   (thin orchestrator)│
                                             │                      │
                                             │ 4. Extract headers   │
                                             │ 5. Call auth plugin  │
                                             │ 6. Enforce decision  │
                                             └──────────────────────┘
                                                    │
                                              invokePluginTool()
                                                    │
                                                    ▼
                                             ┌──────────────────────┐
                                             │   Auth Plugin        │
                                             │ (agentic-tools)      │
                                             │                      │
                                             │ - Validate identity  │
                                             │ - Resolve role       │
                                             │ - Evaluate RBAC      │
                                             │ - Return decision    │
                                             └──────────────────────┘
```

### Plugin Architecture

Following the existing pattern where MCP orchestrates and plugins do the work (like `shell_exec`, `kubectl_apply`, `vector_store`), the auth/RBAC logic lives in the plugin layer:

**MCP Layer (`src/interfaces/auth.ts`)** — thin orchestration:
- Extract identity headers from request
- Call auth plugin via `invokePluginTool('agentic-tools', 'auth_validate', ...)`
- Enforce the allow/deny decision
- Propagate `UserIdentity` to request context

**Auth Plugin (`packages/agentic-tools/src/tools/auth-*.ts`)** — all logic:
- `auth_validate`: Validate identity and resolve RBAC role
- `auth_check`: Check if a role permits a specific tool invocation
- Load and evaluate role definitions and bindings
- Return structured allow/deny decisions

### Identity Extraction

dot-ai extracts verified user identity from gateway-provided data. Two mechanisms supported:

**Option A: Trusted Headers** (simpler, common with reverse proxies)
```
X-User-Id: jane.doe
X-User-Email: jane@company.com
X-User-Groups: platform-team,dev-team
```

**Option B: Validated JWT** (more secure, self-contained)
```
Authorization: Bearer <jwt>
```
JWT claims provide user ID, email, groups/roles. dot-ai validates the JWT signature against a configured public key or JWKS endpoint (verification only — dot-ai does NOT issue tokens).

### RBAC Model

Roles define what a user can do. Roles are assigned to users or groups.

**Built-in Roles:**

| Role | Description | Allowed Tools |
|------|-------------|---------------|
| `viewer` | Read-only cluster visibility | `query` |
| `operator` | Day-2 operations | `query`, `operate`, `remediate` |
| `admin` | Full access including deployments | All tools |

**Role Definition Schema:**
```yaml
roles:
  - name: viewer
    tools:
      allow: [query]
    namespaces:
      allow: ["*"]

  - name: operator
    tools:
      allow: [query, operate, remediate]
    namespaces:
      allow: ["dev", "staging"]

  - name: deployer
    tools:
      allow: [query, operate, remediate, recommend]
    namespaces:
      allow: ["dev", "staging", "production"]

  - name: admin
    tools:
      allow: ["*"]
    namespaces:
      allow: ["*"]
```

**Role Bindings:**
```yaml
bindings:
  # Bind by user
  - role: admin
    users: ["jane.doe"]

  # Bind by group (from gateway identity)
  - role: operator
    groups: ["platform-team"]

  # Default role for authenticated users without explicit binding
  - role: viewer
    users: ["*"]
```

### Configuration

```yaml
auth:
  mode: "gateway"  # "token" (existing) or "gateway" (new)

  # For mode: "token" (existing behavior)
  token: "${DOT_AI_AUTH_TOKEN}"

  # For mode: "gateway"
  gateway:
    # Identity extraction method
    identity_source: "headers"  # "headers" or "jwt"

    # For headers-based identity
    headers:
      user_id: "X-User-Id"
      email: "X-User-Email"
      groups: "X-User-Groups"

    # For JWT-based identity
    jwt:
      jwks_uri: "https://gateway.company.com/.well-known/jwks.json"
      issuer: "https://gateway.company.com"
      audience: "dot-ai"
      claims:
        user_id: "sub"
        email: "email"
        groups: "groups"

  # RBAC configuration (applies in gateway mode)
  rbac:
    roles: []      # Role definitions (see above)
    bindings: []   # Role-to-user/group bindings
    default_role: "viewer"  # Role for authenticated users without explicit binding
```

### Key Design Principles

1. **dot-ai never handles authentication** — gateways do this better
2. **dot-ai owns authorization** — only dot-ai knows the domain-specific permissions
3. **Always authenticated** — both token and gateway modes require valid credentials
4. **Plugin-based** — RBAC logic lives in `packages/agentic-tools/`, MCP orchestrates
5. **Secure by default** — in gateway mode, unknown users get the most restrictive role
6. **Group-based bindings** — leverage existing org structure from identity provider
7. **Foundation for PRD #361** — provides the user identity that permission filtering needs

## Success Criteria

### Must Have (MVP)

- [ ] Auth plugin tools (`auth_validate`, `auth_check`) in agentic-tools package
- [ ] Extract user identity from gateway-provided trusted headers
- [ ] RBAC engine evaluating tool-level permissions per user/group
- [ ] Built-in roles: viewer, operator, admin
- [ ] Role binding by user ID and group
- [ ] Default role for authenticated users without explicit binding
- [ ] Unauthorized tool invocations rejected with clear error message
- [ ] User identity available for audit logging
- [ ] Existing token mode unaffected
- [ ] Integration tests for RBAC enforcement

### Nice to Have (Future)

- [ ] JWT-based identity extraction with JWKS validation
- [ ] Namespace-level RBAC (restrict which namespaces a role can target)
- [ ] Custom role definitions beyond built-in roles
- [ ] RBAC configuration via MCP tool (manage roles without restart)
- [ ] Audit log of authorization decisions (allowed and denied)
- [ ] Rate limiting per user/role

### Success Metrics

- Unauthorized tool access rejected 100% of the time
- All authenticated operations traceable to specific user in audit logs
- No regression in token mode
- RBAC evaluation adds <10ms latency per request
- Compatible with common MCP gateways

## User Journey

### Current State (Token Mode)

1. Admin sets `DOT_AI_AUTH_TOKEN` on MCP server
2. All users configure MCP client with the same token
3. All users have full access to all tools
4. Audit logs show operations but not who performed them

### Future State (Gateway + RBAC)

1. Admin deploys MCP gateway in front of dot-ai with OAuth configured
2. Admin configures dot-ai RBAC roles and bindings
3. User connects MCP client through gateway, authenticates via browser
4. Gateway forwards request with verified identity headers
5. MCP layer extracts headers, calls auth plugin to validate and resolve role
6. Auth plugin evaluates RBAC, returns allow/deny decision
7. MCP layer enforces decision — proceeds or rejects with clear error
8. All operations logged with user identity

### User Personas

**Persona 1: Enterprise Security Admin**
- Deploys MCP gateway with company SSO
- Configures dot-ai RBAC: devs get `operator` role, leads get `admin`
- Monitors audit logs for compliance

**Persona 2: Platform Team Lead**
- Team members auto-assigned `operator` role via group binding
- Can use query, operate, remediate tools
- Cannot deploy new services (no `recommend` access)

**Persona 3: Developer (Existing User)**
- Continues using token mode for local development
- Zero changes to workflow
- May later adopt gateway mode when team grows

## Technical Scope

### Plugin Components (`packages/agentic-tools/`)

**1. `auth_validate` tool**
- Receives identity data (headers or JWT claims)
- Resolves user to RBAC role via bindings (user match, then group match, then default)
- Returns `UserIdentity` with resolved role

**2. `auth_check` tool**
- Receives user role and requested tool name
- Evaluates whether role permits the tool invocation
- Returns structured `RBACDecision` (allowed/denied with reason)

**3. RBAC configuration loader**
- Load role definitions and bindings from configuration
- Validate configuration at startup
- Support wildcard (`*`) for tools and namespaces

### MCP Components (`src/`)

**4. Auth Middleware (`src/interfaces/auth.ts` — extend existing)**
- Extend current `checkBearerAuth()` to support gateway mode
- In gateway mode: extract headers, call `auth_validate` plugin, call `auth_check` plugin before tool dispatch
- In token mode: existing behavior unchanged
- Propagate `UserIdentity` to request context

**5. User Context Propagation**
- Pass `UserIdentity` through to MCP tool handlers
- Make identity available for audit logging
- Foundation for PRD #361 (permission-filtered queries)

### Interface Changes

```typescript
interface UserIdentity {
  userId: string;
  email?: string;
  groups: string[];
  role: string;         // resolved RBAC role
  source: 'gateway-headers' | 'gateway-jwt' | 'token';
}

interface RBACRole {
  name: string;
  tools: {
    allow: string[];    // tool names or ["*"]
  };
  namespaces?: {
    allow: string[];    // namespace names or ["*"] (future)
  };
}

interface RBACBinding {
  role: string;
  users?: string[];     // user IDs or ["*"] for default
  groups?: string[];    // group names from identity provider
}

interface RBACDecision {
  allowed: boolean;
  role: string;
  reason: string;       // e.g., "role 'viewer' does not permit tool 'operate'"
}
```

## Dependencies

**Internal Dependencies:**
- Plugin system (`packages/agentic-tools/`) — already exists
- `invokePluginTool()` pattern — already established

**External Dependencies:**
- MCP gateway deployed in front of dot-ai (for gateway mode)
- Gateway configured to forward identity headers or JWT

**Dependent PRDs:**
- [PRD #361 (User-Specific Permissions)](./361-user-specific-permissions.md) depends on this for user identity — PRD #361's dependency on #360 should be updated to reference #380

## Milestones

### Milestone 1: Auth Plugin Tools
**Objective**: Implement RBAC logic as plugin tools in agentic-tools package

**Deliverables:**
- [ ] `auth_validate` plugin tool — resolve identity to RBAC role
- [ ] `auth_check` plugin tool — evaluate tool-level permissions
- [ ] RBAC configuration loader with role and binding schema
- [ ] Built-in roles: viewer, operator, admin
- [ ] Default role assignment for unbound authenticated users
- [ ] Integration tests for plugin tools

**Success Criteria:**
- Plugin correctly resolves user/group to role
- Plugin correctly evaluates tool permissions
- Wildcard bindings and roles work as expected

---

### Milestone 2: Gateway Identity Extraction & MCP Integration
**Objective**: Extract identity from gateway headers and wire RBAC into MCP request flow

**Deliverables:**
- [ ] Identity extraction from trusted headers (configurable header names)
- [ ] Auth middleware extended to support gateway mode alongside token mode
- [ ] RBAC check via plugin before every MCP tool invocation
- [ ] Rejected tool calls return structured error to MCP client
- [ ] User identity propagated to request context
- [ ] Integration tests for end-to-end enforcement

**Success Criteria:**
- User identity correctly extracted from configured headers
- Missing identity in gateway mode returns 401
- Unauthorized tool calls rejected before execution
- Token mode unaffected
- No performance regression (RBAC check <10ms)

---

### Milestone 3: Audit Integration
**Objective**: Include user identity in audit logs

**Deliverables:**
- [ ] User identity in all operation audit log entries
- [ ] Authorization decisions logged (allowed and denied)
- [ ] Audit log schema updated for user fields

**Success Criteria:**
- All operations traceable to specific user
- Denied access attempts logged with reason
- Token-mode users logged appropriately

---

### Milestone 4: Integration Testing & Documentation
**Objective**: Validate end-to-end and document setup

**Deliverables:**
- [ ] End-to-end integration tests simulating gateway + RBAC flow
- [ ] Tests for each auth mode (token, gateway)
- [ ] Tests for role escalation prevention
- [ ] Documentation for gateway setup with dot-ai
- [ ] Documentation for RBAC configuration

**Success Criteria:**
- All integration tests passing
- No regression in token mode
- Users can set up gateway + RBAC following documentation

---

## Security Considerations

### Trust Boundary
- dot-ai trusts identity headers only when `auth.mode: "gateway"` is configured
- In gateway mode, dot-ai MUST be deployed behind the gateway (not exposed directly)
- Network policies should ensure only the gateway can reach dot-ai

### Default Deny
- In gateway mode, requests without identity headers are rejected (401)
- Users without explicit role binding get the configured `default_role` (most restrictive)

### Header Spoofing Prevention
- Gateway must strip and re-set identity headers on incoming requests
- This is a gateway responsibility, documented in setup guide

### JWT Security (Future)
- JWT validation uses JWKS for key rotation support
- Validate issuer, audience, and expiration
- Reject tokens with unexpected claims

## References

- [awesome-mcp-gateways](https://github.com/e2b-dev/awesome-mcp-gateways) — MCP gateway ecosystem
- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) — for gateway implementers
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) — inspiration for role model

## Related Resources

- **GitHub Issue**: [#380](https://github.com/vfarcic/dot-ai/issues/380)
- **Supersedes**: [PRD #360 - User Authentication](./done/360-user-authentication.md) (closed)
- **Dependent PRD**: [PRD #361 - User-Specific Permissions](./361-user-specific-permissions.md)

---

## Version History

- **v1.0** (2026-02-18): Initial PRD — gateway-delegated authN + plugin-based RBAC, superseding PRD #360
