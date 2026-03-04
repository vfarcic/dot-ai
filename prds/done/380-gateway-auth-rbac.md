# PRD: MCP OAuth Authentication & User Identity

**Status**: Complete
**Priority**: High
**GitHub Issue**: [#380](https://github.com/vfarcic/dot-ai/issues/380)
**Created**: 2026-02-18
**Last Updated**: 2026-03-04
**Supersedes**: [PRD #360 - User Authentication](./done/360-user-authentication.md) (closed)

---

## Problem Statement

Enterprise deployments need user-level authentication and authorization. The current system supports only a **single shared auth token** (`DOT_AI_AUTH_TOKEN`), which means:

- No individual user identity — all users share one token
- No way to control what specific users can do (no authorization)
- Audit logs cannot track who performed operations
- No mechanism to revoke access for specific users

Previous approaches (PRD #360, v1.0–v3.0 of this PRD) proposed gateway-delegated auth. These were rejected after a PoC proved that the MCP Authorization spec places OAuth responsibility on the MCP server itself, and that mandating a specific gateway is an adoption barrier.

## Proposed Solution

**Two core principles:**

1. **dot-ai handles OAuth directly** — following the [MCP Authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization), dot-ai serves OAuth metadata endpoints, triggers browser-based login, and validates tokens. No gateway required.
2. **Individual user identity** — all requests converge on a `UserIdentity` extracted from the OAuth token, providing the foundation for audit trails and future authorization (K8s RBAC via [SubjectAccessReview](https://kubernetes.io/docs/reference/kubernetes-api/authentication-resources/subject-access-review-v1/)).

### How It Works

```
User's laptop                              Kubernetes cluster
                                          ┌──────────────────────────────┐
┌─────────────┐                          │                              │
│  MCP Client  │                          │  Any Ingress/Gateway         │
│ (Claude Code)│ ── (internet) ──►        │  (NGINX, Traefik, etc.)     │
└─────────────┘                           │         │                    │
                                          │         ▼                    │
┌─────────────┐                          │  dot-ai ◄──── Dex            │
│  CLI         │ ── (internet) ──►        │  ├── OAuth endpoints    │    │
└─────────────┘                           │  ├── MCP endpoint       │    │
                                          │  ├── REST API      (OIDC)   │
┌─────────────┐                          │  └── Token validation         │
│  Web UI      │ ── (internet) ──►        │                              │
│ (browser)    │                          │                              │
└─────────────┘                           └──────────────────────────────┘
```

**Key points:**
- **dot-ai handles auth itself** — serves OAuth discovery metadata, authorization endpoint, token endpoint per the MCP spec
- **Dex as default OIDC provider** — ships as a Helm subchart with a static test user out of the box. For production, admins configure Dex connectors for their IdP (Google, GitHub, LDAP, SAML, etc.)
- **Any ingress works** — NGINX, Traefik, whatever users already have. dot-ai doesn't prescribe routing infrastructure
- **Identity comes from the OAuth token** — no trusted headers, no NetworkPolicy dependency for auth
- **dot-ai always talks to Dex** — one OIDC interface. Dex handles the variety of upstream IdPs via connectors

### MCP OAuth Flow

When an MCP client (e.g., Claude Code) connects:

1. Client sends request to dot-ai → receives **401** with `WWW-Authenticate: Bearer resource_metadata="..."`
2. Client fetches `/.well-known/oauth-protected-resource` → learns the authorization server URL
3. Client fetches `/.well-known/oauth-authorization-server` → discovers endpoints (authorize, token, register)
4. Client calls `/register` for **dynamic client registration** (RFC 7591)
5. Client opens browser to `/authorize` with PKCE challenge → dot-ai redirects to Dex → Dex shows IdP login (static user, Google, GitHub, etc.)
6. User approves → client receives authorization code via redirect
7. Client exchanges code for access token at `/token`
8. Client retries MCP request with `Authorization: Bearer <token>`

This flow is defined by the MCP Authorization spec and supported by MCP clients.

### MCP Client OAuth Compatibility

Validated through PoC (2026-02-28):

| Client | OAuth Flow | Status |
|--------|-----------|--------|
| **Claude Code** | Works via manual `/mcp` → Authenticate. Auto-trigger on tool call is a known bug ([#11585](https://github.com/anthropics/claude-code/issues/11585), [#26917](https://github.com/anthropics/claude-code/issues/26917)). | Validated |
| **ChatGPT** | Browser opens, clean flow | Reported working |
| **Windsurf** | Browser opens automatically | Reported working |
| **Gemini CLI** | Multiple auth modes | Reported working |
| **VS Code Copilot** | Supported (v1.101+) | Reported working |
| **Cursor** | Partial, platform-dependent | Untested |

**Claude Code specifics:** OAuth works end-to-end but requires the user to manually authenticate via `/mcp` → select server → Authenticate. Claude Code caches tokens across sessions, so re-authentication is only needed when tokens expire or are revoked.

### Identity Contract

User identity is extracted from the OAuth token, not from HTTP headers:

```typescript
interface UserIdentity {
    userId: string;      // OIDC `sub` claim from Dex (OAuth) or 'anonymous' (token)
    email?: string;      // OIDC `email` claim from Dex (OAuth only)
    groups: string[];    // OIDC `groups` claim (OAuth only; empty for token users)
    source: 'oauth' | 'token';
}
```

### Authorization (Follow-up PRD)

**Note:** Tool-level and namespace-level authorization via Kubernetes RBAC is planned as a follow-up PRD. The identity infrastructure delivered by this PRD (UserIdentity with userId, email, groups) provides the foundation for RBAC enforcement via K8s SubjectAccessReview.

Currently, all authenticated users (OAuth and token) have full access to all tools. The follow-up RBAC PRD will add:
- SubjectAccessReview checks before tool invocations
- Pre-built ClusterRoles (`dotai-viewer`, `dotai-operator`, `dotai-admin`)
- Namespace-scoped permissions

### Authentication

dot-ai supports **two authentication modes** that coexist permanently:

1. **OAuth via Dex** (recommended) — browser-based login with individual user identity, audit trail foundation, and Dex connectors for enterprise IdPs (Google, GitHub, LDAP, SAML)
2. **Static token** (`DOT_AI_AUTH_TOKEN`) — shared Bearer token for simple setups, CI/CD pipelines, REST API consumers, and MCP clients without OAuth support. Provides shared access with no individual identity — all token users appear as anonymous.

**When to use which:**

| Use Case | Auth Mode | Why |
|----------|-----------|-----|
| MCP clients with OAuth (Claude Code, ChatGPT, Windsurf) | OAuth | Individual identity |
| MCP clients without OAuth support | Static token | Only option available |
| REST API / CI/CD automation | Static token | No browser for OAuth flow |
| Enterprise with IdP (Google, LDAP) | OAuth + Dex connector | SSO, individual identity |
| Local development / quick start | Static token | Zero setup, works immediately |

**Both modes active simultaneously** — the auth middleware checks JWT first, falls back to static token match. OAuth users get full identity (userId, email, groups). Token users get shared anonymous access. All authenticated users currently have full tool access — authorization (RBAC) is a follow-up PRD.

### User Management

dot-ai provides authenticated API endpoints for managing Dex static users. Any authenticated user can currently manage users — authorization will be added in the follow-up RBAC PRD.

**Endpoints:**
- `POST /api/v1/users` — Create a new static user (email, password)
- `GET /api/v1/users` — List static users (emails only, no password hashes)
- `DELETE /api/v1/users/:email` — Remove a static user

**How it works:**
1. Admin calls user management endpoint (via MCP tool, CLI, or REST API)
2. dot-ai calls Dex gRPC API (`CreatePassword`, `ListPasswords`, `DeletePassword`)
3. Change takes effect immediately in Dex's storage — no Secret editing or pod restarts needed

**Note:** Any authenticated user can currently manage users. RBAC enforcement for user management will be added in the follow-up RBAC PRD. When Dex connectors are configured, static user management becomes irrelevant — users come from the upstream IdP.

### Configuration

**Simple setup (static token only — no Dex needed):**
```yaml
# In Kubernetes secret or environment:
DOT_AI_AUTH_TOKEN: "your-shared-token"

# Dex disabled by default
dex:
  enabled: false
```

**Enterprise setup (OAuth + optional static token):**
```yaml
# Static token still works alongside OAuth
# DOT_AI_AUTH_TOKEN: "your-shared-token"  # Optional, for CI/CD

# Dex subchart configuration
dex:
  enabled: true
  grpc:
    enabled: true   # Enables Dex gRPC API for user management
  # No static passwords in values — auto-generated at install time
  # Production: add connectors for your IdP
  # connectors:
  #   - type: google
  #     id: google
  #     name: Google
  #     config:
  #       clientID: "xxx.apps.googleusercontent.com"
  #       clientSecret: "xxx"
  #       redirectURI: "https://dex.example.com/callback"
```

### Initial Admin Bootstrap

No passwords are stored in chart values. On `helm install`, the chart:

1. Generates a random password for `admin@dot-ai.local`
2. Bcrypt-hashes it and writes to the Dex Secret
3. Outputs the credentials in Helm install notes (shown once)

**Helm install notes:**
```
=== dot-ai installed ===

Initial admin credentials:
  Email:    admin@dot-ai.local
  Password: <random-generated>

Change the password or add users:
  dot-ai users add --email alice@example.com
  dot-ai users list
  dot-ai users remove --email admin@dot-ai.local

Or configure a Dex connector for your IdP:
  https://devopstoolkit.ai/docs/auth/connectors
```

On `helm upgrade`, the existing Secret is preserved — credentials are only generated on first install.

### Key Design Principles

1. **Server-side OAuth** — dot-ai handles OAuth per the MCP Authorization spec; no gateway dependency for auth
2. **Dual-mode auth** — OAuth (individual identity) and static token (shared access) coexist permanently. Progressive adoption: start with token, upgrade to OAuth when ready
3. **Dex as default IdP** — ships as a subchart with static users; admins configure connectors for production IdPs
4. **Infrastructure-agnostic** — works with any ingress/gateway; dot-ai doesn't prescribe routing
5. **Validate first** — PoC proved the OAuth flow works before building the full system
6. **Identity foundation** — UserIdentity (userId, email, groups) extracted from OAuth tokens provides the basis for future RBAC enforcement

## Milestones

### Milestone 1: OAuth Proof of Concept (VALIDATED)
**Objective**: Validate the riskiest assumption — that MCP clients complete the OAuth browser flow when dot-ai serves OAuth endpoints per the MCP Authorization spec.

**Status**: Validated (2026-02-28)

**Findings:**
- [x] Built minimal MCP server with OAuth endpoints (~130 lines, `tmp/auth-poc-server.mjs`)
- [x] Implemented: Protected Resource Metadata (RFC 9728), Auth Server Metadata (RFC 8414), Dynamic Client Registration (RFC 7591), Authorization with PKCE, Token exchange
- [x] Claude Code completes the full OAuth flow: 401 → browser opens → user approves → token issued → connected
- [x] Claude Code requires manual `/mcp` → Authenticate (auto-trigger is a known bug)
- [x] Claude Code caches tokens across sessions
- [x] Claude Code silently falls back to LLM responses when tools are unavailable (masks auth failures)

**Decision**: Proceed with server-side OAuth. No gateway needed for auth.

**What was rejected:**
- Envoy AI Gateway v0.5: MCPRoute OAuth didn't serve discovery metadata, had broken Backend IPs, returned no `WWW-Authenticate` headers
- Gateway-based auth in general: mandating a specific gateway is an adoption barrier; the MCP spec puts OAuth on the server

---

### Milestone 2: OAuth + Dex Integration
**Objective**: Implement OAuth endpoints per the MCP Authorization spec with Dex as the OIDC provider, add user management, show identity in the version tool, and maintain static token auth for backward compatibility.

**Architecture:** OAuth logic lives in the MCP server (`src/interfaces/oauth/`), not the plugin. OAuth endpoints are HTTP routes — not tool invocations routed through the plugin's `POST /execute`. Dex is an external OIDC provider (its own service/subchart), similar to how Kubernetes and Qdrant are external to the plugin. The server handles OAuth HTTP concerns (discovery metadata, redirects, token validation) and talks to Dex via OIDC.

**Delivery approach:** 5 incremental tasks. Each is self-contained and independently testable. Dual-mode auth middleware (JWT + static token) is a permanent feature — both modes coexist.

#### Task 2.1+2.2: SDK Migration (Replace Custom OAuth with MCP SDK)
- [x] Delete `handlers.ts` + `store.ts` (replaced by SDK's `mcpAuthRouter()`)
- [x] Create `provider.ts` implementing SDK's `OAuthServerProvider` interface — `clientsStore` (in-memory Map), `verifyAccessToken` (JWT + legacy fallback), stub `authorize()`/`exchangeAuthorizationCode()` (no Dex yet)
- [x] Create Express sub-app in `mcp.ts` — mount `mcpAuthRouter()`, delegate OAuth routes (`/.well-known/*`, `/register`, `/authorize`, `/token`) before body parsing
- [x] Issuer URL defaults to `http://localhost:${port}` (SDK exempts localhost from HTTPS check — no insecure flag needed)
- [x] Update `types.ts` — clean up types for SDK compatibility (SDK uses `OAuthClientInformationFull` for clients)
- [x] Update `index.ts` — export provider instead of handlers/store
- [x] Update integration tests for SDK response format (metadata fields, registration response includes `client_secret`)
- [x] All existing integration tests pass (153/153 — legacy token still works via `verifyAccessToken` fallback)

#### Task 2.3: Dex Integration + Helm Subchart
- [x] Create `dex-client.ts` — Dex OIDC communication: authorize URL builder, code exchange, ID token parsing
- [x] Implement `provider.authorize()` — store pending auth request, redirect to Dex
- [x] Implement `provider.handleCallback()` — exchange Dex code, extract identity, generate dot-ai auth code, redirect to MCP client
- [x] Implement `provider.exchangeAuthorizationCode()` — consume auth code, issue JWT with user identity claims
- [x] Add `/callback` Express route for Dex OIDC callback
- [x] Dex as Helm subchart — no static passwords in chart values
- [x] Auto-generate initial admin credentials on `helm install`, output in Helm notes (preserve on upgrade). If `DOT_AI_AUTH_TOKEN` exists, use as initial admin password instead of generating.
- [x] Configuration: Dex settings in Helm values, deployment env vars (`DEX_ISSUER_URL`, `DEX_EXTERNAL_URL`, `DEX_CLIENT_ID`, `DEX_CLIENT_SECRET`, `DOT_AI_JWT_SECRET`)
- [x] Integration tests: full OAuth flow end-to-end through Dex, token endpoint error handling

#### Task 2.4: Identity in Version Tool + Auth Cleanup
- [x] `version` tool updated to include identity in output (userId, email, groups, source: 'oauth' | 'token')
- [x] Clean up old `src/interfaces/auth.ts` — consolidate into `src/interfaces/oauth/middleware.ts` (dual-mode stays)
- [x] Integration tests cover both auth modes: OAuth flow tests + static token tests
- [x] All integration tests pass

#### Task 2.5: User Management via Dex gRPC API
- [x] User management endpoints: `POST /api/v1/users`, `GET /api/v1/users`, `DELETE /api/v1/users/:email` — uses Dex gRPC API (changes take effect immediately, no restart needed)
- [x] Integration tests: user CRUD workflow with count verification, input validation, authentication requirement (all 162/162 tests pass)

**Success Criteria:**
- MCP clients complete OAuth through Dex and access tools
- Static token auth continues to work for REST API and non-OAuth MCP clients
- `version` output shows the authenticated user's identity (OAuth: full identity; token: anonymous)
- Missing/invalid token returns 401 with `WWW-Authenticate` header
- Admin can create/list/delete users via API without redeploying (Dex gRPC API — immediate effect)

---

### Milestone 3: Documentation & Connector Validation
**Objective**: Document the authentication system so users can adopt it, validate Dex connectors for production IdPs, and apply dot-ai branding to the login page.

#### Task 3.1: Authentication Overview Page
- [x] New `docs/ai-engine/setup/authentication.md` — two auth modes (static token vs OAuth), when to use which, identity contract (`UserIdentity`), see-also links

#### Task 3.2: Deployment Guide Update (OAuth)
- [x] Update `docs/ai-engine/setup/deployment.md` — OAuth is enabled by default, auto-generated admin credentials, retrieving admin password, Helm values reference for auth settings
- [x] Update `docs/ai-engine/quick-start.md` — reflect that OAuth is the default, show how to retrieve initial admin credentials

#### Task 3.3: MCP Client Configuration for OAuth
- [x] Update `docs/mcp/index.md` — OAuth flow per supported client (Claude Code, ChatGPT, Windsurf, VS Code Copilot), static token setup preserved as alternative

#### Task 3.4: User Management Documentation
- [x] Updated `docs/ai-engine/setup/authentication.md` — removed `user-management.md` references, added "coming soon" to CLI/Web UI links
- [x] No separate `user-management.md` needed — user management docs belong in CLI and Web UI projects
- [x] **External:** Created PRDs in dot-ai-cli ([#6](https://github.com/vfarcic/dot-ai-cli/issues/6)) and dot-ai-ui ([#18](https://github.com/vfarcic/dot-ai-ui/issues/18)) for OAuth + user management support. Both include milestone to send feature request back to update auth doc links.

#### Task 3.5: Dex Connector Configuration & Validation
- [x] New `docs/ai-engine/setup/connectors.md` — Google connector guide with validated example, domain restriction via `hostedDomains`, other connectors table with Dex docs reference
- [x] Google connector tested end-to-end and documented with validated example; other connectors reference [Dex Connector Documentation](https://dexidp.io/docs/connectors/)

#### Task 3.6: Dex Login Page Theming
- [x] Custom Dex Docker image (`ghcr.io/vfarcic/dot-ai-dex:v2.44.0`) with branded login page (logo, colors, CSS) baked in at `/srv/dex/web/`

**Success Criteria:**
- Admins can deploy and configure OAuth following documentation alone
- Google connector tested and documented end-to-end; other connectors reference Dex docs
- Login page uses dot-ai branding

---

### Future Work (Separate PRDs)

The following capabilities build on the authentication foundation delivered by this PRD and will be tracked as separate PRDs:

- **[PRD #392 - RBAC Enforcement](./392-rbac-enforcement.md)** — SubjectAccessReview-based tool-level and namespace-level permissions for OAuth users. Pre-built ClusterRoles (`dotai-viewer`, `dotai-operator`, `dotai-admin`). Includes audit logging of authorization decisions. Depends on Milestone 2 identity infrastructure.
- **Client Identity PRDs** — How CLI authenticates (device flow, browser OAuth) and exposes user management commands. How Web UI authenticates users and provides admin UI. These are separate projects that consume this PRD's user management endpoints.

---

## Success Criteria

### Must Have (MVP)

- [x] MCP OAuth endpoints in dot-ai (Milestone 2, Tasks 2.1-2.2)
- [x] Dex integration as default OIDC provider (Milestone 2, Task 2.3)
- [x] Identity extraction from OAuth tokens (Milestone 2, Task 2.4)
- [x] Static token auth preserved as permanent alternative (dual-mode)
- [x] User management endpoints via Dex gRPC API (Milestone 2, Task 2.5)
- [x] Integration tests for auth (both modes) and user management
- [x] Documentation for OAuth deployment, user management, Dex connectors, and MCP client configuration (Milestone 3)
- [x] Google Dex connector tested and documented; other connectors reference Dex docs (Milestone 3)

### Nice to Have (Future)

- [ ] Rate limiting per user
- [ ] Token refresh flow

### Success Metrics

- All authenticated operations traceable to specific user (via UserIdentity)
- Admins can deploy and configure OAuth by following documentation alone

## User Journey

### Simple Setup (Static Token)

1. Admin sets `DOT_AI_AUTH_TOKEN` on dot-ai server
2. All users share the same token via MCP config headers or REST API
3. All users have full access to all tools
4. No individual identity tracking — suitable for small teams, local dev, CI/CD

### Enterprise Setup (OAuth via Dex)

1. Admin runs `helm install` with `dex.enabled=true` — gets auto-generated admin credentials in output
2. Admin logs in as initial admin, adds users via dot-ai API (REST or MCP tool)
3. Admin optionally configures Dex connectors for production IdP (Google, GitHub, LDAP, etc.)
4. User configures MCP client with dot-ai URL
5. On first connection, user authenticates via `/mcp` → Authenticate (browser opens for Dex login)
6. dot-ai validates identity, grants access
7. All operations logged with user identity
8. Static token can coexist — useful for CI/CD pipelines alongside OAuth for interactive users

**Note:** Tool-level and namespace-level authorization (RBAC) will be added in a follow-up PRD. Currently all authenticated users have full tool access.

### User Personas

**Persona 1: Enterprise Platform Admin**
- Deploys dot-ai via Helm with OAuth enabled (Dex included)
- Configures Dex connectors for company IdP (Google, GitHub, LDAP)
- Manages users via API (create/list/delete)

**Persona 2: Developer (Existing User)**
- Dex static user for local development (KinD) — individual identity from day one
- Or static token for quick local setup — no Dex needed

**Persona 4: CI/CD Pipeline**
- Uses static token (`DOT_AI_AUTH_TOKEN`) via REST API
- No browser available for OAuth flow
- Full tool access, shared anonymous identity

## Technical Scope

### dot-ai Changes (Milestone 2)

**OAuth Module (`src/interfaces/oauth/`):**
- `types.ts` — `UserIdentity`, JWT claims, pending auth request/authorization code types, `DexConfig`
- `jwt.ts` — JWT signing/verification using `node:crypto` HMAC-SHA256
- `provider.ts` — `OAuthServerProvider` implementation (SDK interface): client store, authorize→Dex redirect, code exchange→JWT issuance, token verification (JWT + static token dual-mode), `/callback` handler
- `dex-client.ts` — Lightweight Dex OIDC communication using `node:http`: authorize URL builder, code exchange, ID token identity extraction
- `middleware.ts` — JWT validation middleware for non-OAuth routes, `WWW-Authenticate` challenge

**OAuth Endpoints (SDK `mcpAuthRouter()` + Express sub-app, served by MCP server):**
- `/.well-known/oauth-protected-resource` — Protected Resource Metadata (RFC 9728) — *SDK*
- `/.well-known/oauth-authorization-server` — Auth Server Metadata (RFC 8414) — *SDK*
- `/register` — Dynamic Client Registration (RFC 7591) — *SDK + provider.clientsStore*
- `/authorize` — Validates params, calls `provider.authorize()` → redirects to Dex — *SDK + provider*
- `/token` — PKCE verification + code exchange → JWT — *SDK + provider*
- `/callback` — Dex OIDC callback (custom Express route, not part of OAuth spec)

**User Management Endpoints (`src/interfaces/oauth/user-management.ts`):**
- `POST /api/v1/users` — bcrypt-hash password, call Dex gRPC `CreatePassword` (409 if exists)
- `GET /api/v1/users` — call Dex gRPC `ListPasswords`, return email list (no hashes)
- `DELETE /api/v1/users/:email` — call Dex gRPC `DeletePassword` (404 if not found)
- Any authenticated user can manage users (RBAC enforcement deferred to follow-up PRD)

**Auth Middleware (`src/interfaces/oauth/middleware.ts`):**
- Dual-mode token validation: JWT first, static token fallback
- Validate Bearer tokens, extract `UserIdentity` (OAuth: full identity; token: anonymous)

### Helm Chart Changes (Milestone 2)

- Dex subchart with gRPC enabled (`dex.grpc.enabled: true`) for user management API
- Auto-generated initial admin on `helm install` (or migrated from `DOT_AI_AUTH_TOKEN`)

## Dependencies

**External Dependencies:**
- Kubernetes cluster with RBAC enabled
- Dex (ships as Helm subchart — no separate installation)

**Internal Dependencies:**
- `version` tool — for identity display (Milestone 2, Task 2.4)
- Auth middleware — replace existing with OAuth (Milestone 2, Task 2.1)
- Helm chart — for Dex subchart (Milestone 2)

**Dependent PRDs:**
- [PRD #361 (User-Specific Permissions)](./361-user-specific-permissions.md) — depends on user identity from this PRD
- Follow-up RBAC PRD — depends on identity infrastructure from this PRD
- Future PRDs for `dot-ai-cli` and `dot-ai-ui` auth flows

## Security Considerations

### Token Security
- Access tokens are short-lived (configurable expiry)
- Tokens are cryptographically signed by dot-ai
- Token validation happens on every request
- Revocation via token expiry (refresh tokens for longer sessions — future)

### Default Deny
- Requests without valid Bearer token (JWT or static) → 401
- All authenticated users (OAuth and token) currently have full tool access
- Tool-level authorization (RBAC) will be added in a follow-up PRD — OAuth users will then require explicit RoleBindings

### Dex Trust
- dot-ai trusts Dex as its OIDC provider — Dex runs in-cluster alongside dot-ai
- Identity claims (sub, email, groups) come from the verified Dex token
- Dex in turn trusts its configured upstream connectors (Google, GitHub, LDAP, etc.)
- Admin is responsible for configuring Dex connectors appropriately

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **Gateway-based auth (Envoy AI Gateway)** | PoC proved Envoy AI Gateway v0.5 too immature; mandating a gateway is an adoption barrier; MCP spec puts OAuth on the server |
| **Gateway-injected identity headers** | Requires mandatory gateway + NetworkPolicy trust; fragile trust model |
| **Custom RBAC engine** (v1.0) | Reinvents K8s RBAC |
| **OPA / Casbin / Cerbos** | External dependency when K8s RBAC exists |
| **Kong / Traefik Hub** | MCP features require enterprise license |
| **HMAC-signed headers** | Shared secret on user laptops defeats the purpose |

## References

- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [RFC 9728 — OAuth Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414 — OAuth Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [RFC 7591 — OAuth Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [SubjectAccessReview API](https://kubernetes.io/docs/reference/kubernetes-api/authentication-resources/subject-access-review-v1/)
- PoC implementation: `tmp/auth-poc-server.mjs`

## Related Resources

- **GitHub Issue**: [#380](https://github.com/vfarcic/dot-ai/issues/380)
- **Supersedes**: [PRD #360 - User Authentication](./done/360-user-authentication.md) (closed)
- **Dependent PRD**: [PRD #361 - User-Specific Permissions](./361-user-specific-permissions.md)
- **Follow-up**: [PRD #392 - RBAC Enforcement](./392-rbac-enforcement.md) (K8s SubjectAccessReview, ClusterRoles, audit logging)
- **Follow-up**: CLI identity PRD, Web UI identity PRD
- **Follow-up**: dot-ai-stack quickstart update (enable Dex, auth setup in getting-started guide)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-18 | Gateway-delegated auth + custom RBAC | Initial design |
| 2026-02-28 | K8s SubjectAccessReview instead of custom RBAC | Don't reinvent K8s RBAC |
| 2026-02-28 | Envoy AI Gateway for unified MCP+HTTP auth | Only open-source option supporting both protocols |
| 2026-02-28 | **Reject gateway-based auth** | Envoy AI Gateway v0.5 too immature (no WWW-Authenticate, broken Backends). Mandating a gateway is an adoption barrier. |
| 2026-02-28 | **Server-side OAuth per MCP spec** | PoC validated: dot-ai serves OAuth endpoints, Claude Code completes the flow. ~130 lines, no dependencies. |
| 2026-02-28 | **No mandatory gateway** | Auth lives in dot-ai. Any ingress works for routing. Users keep their existing infrastructure. |
| 2026-03-01 | **Identity from OAuth tokens, not headers** | Without a mandatory gateway, no trusted header source. Token-based identity is self-contained. |
| 2026-03-01 | **Dex as default OIDC provider** | Ships as Helm subchart with static users (works out of the box). Admins configure Dex connectors for production IdPs. No need to bypass Dex — its `oidc` connector handles any OIDC provider. |
| 2026-03-01 | **OAuth replaces token as sole auth mode** | Dex static passwords give individual identity from day one. Token mode removed entirely — migration logic converts existing token to Dex password on first setup. |
| 2026-03-01 | **User management endpoints in dot-ai** | RBAC-protected API to create/list/delete Dex static users without redeploying. Config reloader sidecar watches Dex Secret for changes. CLI/UI hook into these endpoints. |
| 2026-03-01 | **Auto-generate initial admin on install** | No passwords in chart values or Git. `helm install` generates random admin credentials, outputs them once in Helm notes. Preserved on upgrade. Same pattern as Grafana, MinIO. |
| 2026-03-01 | **Remove token mode entirely** | OAuth via Dex is the only auth. All legacy token code (`DOT_AI_AUTH_TOKEN`, token mode config, related middleware) removed. Migration: if `DOT_AI_AUTH_TOKEN` exists on first Dex setup, use as initial admin password; otherwise auto-generate. Future cleanup PRD (~6 months) to remove migration logic. |
| 2026-03-02 | **Merge Milestones 2 and 3** | The self-contained OAuth (approve page, token issuance) in M2 is throwaway code — replaced entirely by Dex in M3. Skip the intermediate step, go straight to Dex. Old M2+M3 become new M2. |
| 2026-03-02 | **OAuth logic in MCP server, not plugin** | Reverses previous "plugin architecture for OAuth" decision. OAuth endpoints are HTTP routes (redirects, HTML, form bodies, WWW-Authenticate headers) — not tool invocations routed through the plugin's `POST /execute`. Token validation runs on every request and must be in-process. Dex is already an external service, playing the same role as Kubernetes/Qdrant do for the plugin. |
| 2026-03-02 | **5 incremental tasks with dual-mode auth transition** | Break merged M2 into 5 self-contained testable tasks. Dual-mode middleware (JWT + legacy token) keeps existing tests passing throughout. Tasks: (1) types + JWT + dual-mode middleware, (2) OAuth discovery + registration, (3) Dex subchart + authorize/token, (4) remove legacy auth + identity in version, (5) user management + config reloader. |
| 2026-03-02 | **Use MCP SDK's built-in OAuth server support** | SDK v1.25.3 includes `mcpAuthRouter()`, `OAuthServerProvider` interface, PKCE validation, rate limiting, error classes, Zod schemas. Eliminates ~500 lines of custom handler/store code. Deletes `handlers.ts` + `store.ts`, creates `provider.ts` implementing `OAuthServerProvider`. |
| 2026-03-02 | **Express sub-app for OAuth routes** | Express v5.0.1 is already bundled as an SDK dependency — no new dep needed. SDK's `mcpAuthRouter()` returns an Express router. OAuth routes delegate to Express sub-app via `this.oauthApp(req, res)`, rest of server stays on raw `node:http`. |
| 2026-03-02 | **Custom OAuthServerProvider, not ProxyOAuthServerProvider** | `ProxyOAuthServerProvider` passes MCP clients' `client_id`/`redirect_uri` directly to Dex, but Dex only knows dot-ai as a static client. dot-ai must act as OAuth AS to MCP clients AND as OIDC RP to Dex — requires custom provider that stores clients + auth codes in-memory, redirects to Dex on authorize, exchanges Dex codes on callback, issues its own JWTs. |
| 2026-03-02 | **Redo Tasks 2.1+2.2 as single SDK migration step** | SDK's `mcpAuthRouter()` is all-or-nothing (discovery + registration + authorize + token endpoints). Redoing 2.1 and 2.2 as separate steps is artificial. Two-step approach: (1) SDK migration — replace custom handlers/store with SDK router + provider with stub authorize/token, (2) Dex integration — implement real authorize/token + Helm subchart. |
| 2026-03-02 | **Keep dual-mode auth permanently (reverses "Remove token mode entirely")** | Static token (`DOT_AI_AUTH_TOKEN`) stays as a permanent alternative to OAuth. Reasons: (1) MCP clients without OAuth support need a way in, (2) REST API / CI/CD automation can't do browser-based OAuth, (3) simpler onboarding — works immediately without Dex, (4) backward compatibility — existing users don't break on upgrade. OAuth provides individual identity + RBAC; token provides shared anonymous access. Both modes coexist via dual-mode middleware (JWT first, token fallback). |
| 2026-03-02 | **Per-session McpServer factory pattern for multi-user** | MCP SDK's `Protocol` class only supports one transport per `McpServer` instance (`connect()` throws "Already connected"). Multi-user requires a new `McpServer` + `StreamableHTTPServerTransport` pair per session. Tool definitions extracted into shared `getToolDefs()`, registered on each session server. REST API stays shared (registered once). Stateful mode (`SESSION_MODE=stateful`) tracks sessions by `Mcp-Session-Id` header. |
| 2026-03-02 | **Dex gRPC API for user management (replaces Secret writes + Stakater Reloader)** | Dex exposes `CreatePassword`, `ListPasswords`, `DeletePassword` via gRPC. Changes take effect immediately in Dex's storage — no Secret editing, no pod restarts, no config reloader needed. Simpler architecture with fewer moving parts. |
| 2026-03-02 | **Defer RBAC on user management to Milestone 3** | Any authenticated user can currently manage users. RBAC enforcement via SubjectAccessReview will be added when Milestone 3 implements the full RBAC layer. Avoids a chicken-and-egg problem (need users before RBAC can protect user creation). |
| 2026-03-02 | **Session GC with 1-hour TTL** | In-memory sessions accumulate without cleanup. Sessions inactive for 1 hour are reaped (matches JWT expiry). 5-minute sweep interval via `setInterval(..).unref()`. Pod restarts invalidate all sessions; clients auto-reconnect with existing JWT (no re-auth through Dex needed). |
| 2026-03-02 | **Split RBAC, audit, and client PRDs into separate PRDs** | This PRD delivers authentication + identity + user management + documentation. RBAC enforcement (SubjectAccessReview, ClusterRoles), audit integration, and client identity PRDs moved to follow-up PRDs. Rationale: (1) auth alone provides real value — controlling who can access the server, (2) RBAC is a distinct concern deserving its own design space, (3) shipping sooner enables earlier feedback, (4) PRD was already 680+ lines with 6 milestones. |

## Version History

- **v1.0** (2026-02-18): Initial — gateway-delegated authN + custom plugin-based RBAC
- **v2.0** (2026-02-28): Auth-agnostic identity + K8s RBAC via SubjectAccessReview
- **v2.1** (2026-02-28): In-cluster deployment topology, NetworkPolicy trust model
- **v3.0** (2026-02-28): Unified gateway approach (Envoy AI Gateway for MCP + HTTP)
- **v4.0** (2026-03-01): **Server-side OAuth** — dot-ai handles OAuth directly per MCP spec. Gateway rejected after PoC. No mandatory gateway, no identity headers, no NetworkPolicy dependency. Identity from OAuth tokens. Milestones restructured.
- **v4.1** (2026-03-01): **Dex as default OIDC provider** — ships as Helm subchart with static users. Admins configure Dex connectors for production IdPs. Removed "replace Dex entirely" option — Dex's `oidc` connector handles any provider.
- **v4.2** (2026-03-01): **OAuth as default, user management endpoints** — Dex static passwords replace shared token as default auth. User management API (create/list/delete users) writes to Dex Secret with config reloader sidecar. CLI/UI expose user management via these endpoints.
- **v4.3** (2026-03-01): **Auto-generate initial admin** — no passwords in chart values. `helm install` generates random admin credentials, outputs in Helm notes. Preserved on upgrade.
- **v4.4** (2026-03-01): **Split Milestone 2** — Milestone 2 is now "OAuth endpoints in dot-ai (no Dex)" to prove the flow works in the real codebase first. Milestone 3 is "Dex integration & user management". Remaining milestones renumbered (4=RBAC, 5=Audit, 6=Docs, 7=Client PRDs).
- **v4.5** (2026-03-01): **Remove token mode, plugin architecture** — OAuth via Dex is the only auth mode. All legacy token code removed. Token migration on first Dex setup (DOT_AI_AUTH_TOKEN → Dex static password). Future cleanup PRD for migration logic. Auth logic follows plugin architecture (`packages/agentic-tools/`). Milestones 6/7 swapped (Client PRDs before Docs).
- **v5.0** (2026-03-02): **Merge M2+M3, OAuth in server, incremental delivery** — Merged "OAuth Endpoints (no Dex)" and "Dex Integration" into single Milestone 2 to avoid throwaway code. OAuth logic moves to `src/interfaces/oauth/` (server, not plugin) — endpoints are HTTP routes, not tool invocations; Dex is an external service like K8s/Qdrant. Milestone broken into 5 incremental tasks with dual-mode auth transition. Milestones renumbered (old M4-M7 → M3-M6).
- **v6.0** (2026-03-02): **MCP SDK OAuth support** — Replace custom `handlers.ts` + `store.ts` with SDK's `mcpAuthRouter()` + `OAuthServerProvider` interface. Express sub-app (bundled with SDK) handles OAuth routes; raw `node:http` stays for everything else. Custom provider (not `ProxyOAuthServerProvider`) because dot-ai is intermediary between MCP clients and Dex. Tasks 2.1+2.2 merged into single "SDK Migration" step; Task 2.3 narrowed to Dex-specific logic + Helm.
- **v7.0** (2026-03-02): **Dual-mode auth permanent** — Reverses "remove token mode entirely" decision. Static token (`DOT_AI_AUTH_TOKEN`) stays as a permanent alternative alongside OAuth. Reasons: MCP clients without OAuth support, CI/CD automation, simpler onboarding, backward compatibility. Task 2.4 rewritten from "remove legacy auth" to "identity in version tool + auth cleanup". Per-session McpServer factory for multi-user. Session GC with 1-hour TTL.
- **v8.0** (2026-03-02): **Scope reduction — auth + docs only** — Moved RBAC enforcement (SubjectAccessReview, ClusterRoles), audit integration, and client identity PRDs to separate follow-up PRDs. This PRD now delivers: authentication (OAuth + static token), Dex integration, identity extraction, user management, and documentation. Milestones reduced from 6 to 3. Rationale: ship authentication sooner, get feedback, RBAC is a distinct concern.
