# PRD: MCP OAuth Authentication & Kubernetes RBAC

**Status**: In Progress
**Priority**: High
**GitHub Issue**: [#380](https://github.com/vfarcic/dot-ai/issues/380)
**Created**: 2026-02-18
**Last Updated**: 2026-03-02
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
2. **dot-ai owns authorization via Kubernetes RBAC** — all requests converge on a `UserIdentity` extracted from the OAuth token, and dot-ai checks permissions using K8s [SubjectAccessReview](https://kubernetes.io/docs/reference/kubernetes-api/authentication-resources/subject-access-review-v1/).

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
┌─────────────┐                          │  ├── Token validation         │
│  Web UI      │ ── (internet) ──►        │  └── K8s RBAC check          │
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
    userId: string;      // OIDC `sub` claim from Dex
    email?: string;      // OIDC `email` claim from Dex
    groups: string[];    // OIDC `groups` claim (from Dex connector / upstream IdP)
    source: 'oauth';
}
```

### Authorization: Kubernetes RBAC

dot-ai leverages Kubernetes RBAC using a **virtual API group** (`dot-ai.devopstoolkit.ai`). No CRDs are required — SubjectAccessReview evaluates RBAC rules as pure string matching.

When a request arrives to use a tool (e.g., `operate` in namespace `production`):

```typescript
const review = await k8sApi.createSubjectAccessReview({
    spec: {
        user: identity.userId,
        groups: identity.groups,
        resourceAttributes: {
            namespace: targetNamespace,
            group: "dot-ai.devopstoolkit.ai",
            resource: "tools",
            name: toolName,       // e.g., "operate"
            verb: "execute",
        },
    },
});

if (!review.body.status.allowed) {
    // Reject with clear error message
}
```

**Example: Restrict a user to `remediate` and `query` in `production` only:**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: dotai-operator
  namespace: production
rules:
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["tools"]
    resourceNames: ["remediate", "query"]
    verbs: ["execute"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: viktor-operator
  namespace: production
subjects:
  - kind: User
    name: viktor@farcic.com
roleRef:
  kind: Role
  name: dotai-operator
  apiGroup: rbac.authorization.k8s.io
```

**Namespace scoping comes for free** — same user, different permissions per namespace. **Group bindings** leverage groups from the identity provider.

### Pre-built ClusterRoles

The Helm chart ships pre-built ClusterRoles. Admins only need to create bindings:

| ClusterRole | Tools Allowed | Use Case |
|-------------|---------------|----------|
| `dotai-viewer` | `query`, `version` | Read-only cluster visibility |
| `dotai-operator` | `query`, `version`, `operate`, `remediate` | Day-2 operations |
| `dotai-admin` | All tools (`*`) | Full access |

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: dotai-viewer
rules:
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["tools"]
    resourceNames: ["query", "version"]
    verbs: ["execute"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: dotai-operator
rules:
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["tools"]
    resourceNames: ["query", "version", "operate", "remediate"]
    verbs: ["execute"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: dotai-admin
rules:
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["tools"]
    resourceNames: ["query", "version", "recommend", "operate", "remediate",
                     "manageOrgData", "manageKnowledge", "projectSetup", "validateDocs"]
    verbs: ["execute"]
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["users"]
    verbs: ["create", "delete", "list"]
```

Admins can create additional custom ClusterRoles/Roles with standard `kubectl`.

### Authentication

OAuth via Dex is the **only** auth mode. The legacy token mode (`DOT_AI_AUTH_TOKEN`) is removed — all token-related code is deleted from the codebase.

**Migration from token mode:** On first Dex setup (no Dex Secret exists yet):
- If `DOT_AI_AUTH_TOKEN` is set → use its value as the initial admin password (bcrypt-hashed, stored in Dex Secret as `admin@dot-ai.local`)
- If no token → auto-generate a random password

Either way, credentials are output in Helm install/upgrade notes. After migration, `DOT_AI_AUTH_TOKEN` is ignored and can be removed.

**Future cleanup PRD:** ~6 months after release, create a PRD to remove the token migration logic (the code that detects `DOT_AI_AUTH_TOKEN` and converts it to a Dex password). By then all users will have transitioned.

### User Management

dot-ai provides authenticated API endpoints for managing Dex static users. These endpoints are RBAC-protected — only users with the `dotai-admin` role can manage users.

**Endpoints:**
- `POST /users` — Create a new static user (email, password)
- `GET /users` — List static users (emails only, no password hashes)
- `DELETE /users/:email` — Remove a static user

**How it works:**
1. Admin calls user management endpoint (via MCP tool, CLI, or REST API)
2. dot-ai updates the Dex configuration Secret in Kubernetes
3. A config reloader sidecar detects the Secret change and signals Dex to reload
4. New user can immediately authenticate

**RBAC for user management:**
```yaml
- apiGroups: ["dot-ai.devopstoolkit.ai"]
  resources: ["users"]
  verbs: ["create", "delete", "list"]
```

This is included in the `dotai-admin` ClusterRole. When Dex connectors are configured, static user management becomes irrelevant — users come from the upstream IdP.

### Configuration

```yaml
auth:
  oauth:
    issuer: "http://dex.dot-ai.svc.cluster.local:5556"  # Dex in-cluster URL

# Dex subchart configuration
dex:
  enabled: true
  configReloader:
    enabled: true  # Watches Secret for changes, reloads Dex config
  # No static passwords in values — auto-generated at install time (or migrated from DOT_AI_AUTH_TOKEN)
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
2. **Dex as default IdP** — ships as a subchart with static users; admins configure connectors for production IdPs
3. **Single authorization path** — all requests converge on UserIdentity → K8s RBAC
4. **Kubernetes-native** — K8s SubjectAccessReview, standard RBAC manifests
5. **Infrastructure-agnostic** — works with any ingress/gateway; dot-ai doesn't prescribe routing
6. **Validate first** — PoC proved the OAuth flow works before building RBAC
7. **Familiar UX** — admins manage permissions with `kubectl`

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
**Objective**: Implement OAuth endpoints per the MCP Authorization spec with Dex as the OIDC provider, replace legacy token auth, add user management, and show identity in the version tool.

**Architecture:** OAuth logic lives in the MCP server (`src/interfaces/oauth/`), not the plugin. OAuth endpoints are HTTP routes — not tool invocations routed through the plugin's `POST /execute`. Dex is an external OIDC provider (its own service/subchart), similar to how Kubernetes and Qdrant are external to the plugin. The server handles OAuth HTTP concerns (discovery metadata, redirects, token validation) and talks to Dex via OIDC.

**Delivery approach:** 5 incremental tasks. Each is self-contained and independently testable. A dual-mode auth middleware (JWT + legacy token) keeps existing tests passing throughout the transition.

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
- [ ] Create `dex-client.ts` — Dex OIDC communication: authorize URL builder, code exchange, ID token parsing
- [ ] Implement `provider.authorize()` — store pending auth request, redirect to Dex
- [ ] Implement `provider.handleCallback()` — exchange Dex code, extract identity, generate dot-ai auth code, redirect to MCP client
- [ ] Implement `provider.exchangeAuthorizationCode()` — consume auth code, issue JWT with user identity claims
- [ ] Add `/callback` Express route for Dex OIDC callback
- [ ] Dex as Helm subchart — no static passwords in chart values
- [ ] Auto-generate initial admin credentials on `helm install`, output in Helm notes (preserve on upgrade). If `DOT_AI_AUTH_TOKEN` exists, use as initial admin password instead of generating.
- [ ] Configuration: Dex settings in Helm values, deployment env vars (`DEX_ISSUER_URL`, `DEX_EXTERNAL_URL`, `DEX_CLIENT_ID`, `DEX_CLIENT_SECRET`, `DOT_AI_JWT_SECRET`)
- [ ] Integration tests: full OAuth flow end-to-end through Dex, token endpoint error handling

#### Task 2.4: Remove Legacy Auth + Identity in Version Tool
- [ ] Remove all legacy token auth code (`DOT_AI_AUTH_TOKEN`, token mode config, `src/interfaces/auth.ts`)
- [ ] Remove legacy token from Helm chart (deployment.yaml, secret.yaml, values.yaml)
- [ ] Update test infrastructure to use OAuth flow instead of static token
- [ ] `version` tool updated to include identity in output (userId, email, groups, source)
- [ ] All integration tests pass using OAuth only

#### Task 2.5: User Management + Config Reloader
- [ ] User management endpoints: `POST /users`, `GET /users`, `DELETE /users/:email` — RBAC-protected, writes to Dex Secret
- [ ] Config reloader sidecar for Dex — watches Secret for changes, signals Dex to reload
- [ ] Integration tests: user CRUD, config reload

**Success Criteria:**
- MCP clients complete OAuth through Dex and access tools
- `version` output shows the authenticated user's identity
- Missing/invalid token returns 401 with `WWW-Authenticate` header
- No legacy token auth code remains
- Admin can create/list/delete users via API without redeploying
- Config reloader picks up Secret changes and Dex reloads

---

### Milestone 3: Kubernetes RBAC Enforcement
**Objective**: Enforce tool-level and namespace-level permissions using K8s SubjectAccessReview.

**Deliverables:**
- [ ] SubjectAccessReview call before every tool invocation in OAuth mode
- [ ] Tool name and target namespace passed to SubjectAccessReview
- [ ] Rejected tool calls return structured error with reason
- [ ] Pre-built ClusterRoles in Helm chart: `dotai-viewer`, `dotai-operator`, `dotai-admin`
- [ ] ClusterRole for dot-ai's ServiceAccount to create SubjectAccessReview
- [ ] Integration tests: authorized calls succeed, unauthorized rejected, namespace scoping, group bindings

**Success Criteria:**
- Unauthorized tool access rejected 100% of the time
- Namespace-scoped permissions enforced correctly
- Group-based RoleBindings work
- SubjectAccessReview adds <10ms latency

---

### Milestone 4: Audit Integration
**Objective**: Include user identity in audit logs for traceability.

**Deliverables:**
- [ ] User identity in all operation audit log entries
- [ ] Authorization decisions logged (allowed and denied)

**Success Criteria:**
- All operations traceable to specific user
- Denied access attempts logged with reason

---

### Milestone 5: Client Identity PRDs
**Objective**: Define how CLI and Web UI authenticate and expose user management.

**Deliverables:**
- [ ] Create PRD for `dot-ai-cli`: how CLI authenticates (device flow, browser OAuth, etc.) and exposes user management commands (`dot-ai users add/list/remove`)
- [ ] Create PRD for `dot-ai-ui`: how Web UI authenticates users (OAuth redirect, etc.) and provides user management UI for admins

**Success Criteria:**
- CLI and Web UI PRDs define their auth flow and user management UX
- No changes needed in dot-ai core (CLI/UI use existing user management endpoints)

---

### Milestone 6: Documentation & End-to-End Testing
**Objective**: Validate the full stack, test Dex connectors, and document the complete system (including CLI/UI).

**Deliverables:**
- [ ] End-to-end integration tests: OAuth → identity → RBAC → tool execution
- [ ] Tests for role escalation prevention
- [ ] Test and document Dex connectors: Google, GitHub (validate the connector flow works end-to-end)
- [ ] Documentation: deployment with OAuth (default setup with auto-generated admin)
- [ ] Documentation: user management via CLI/UI/API
- [ ] Documentation: RBAC setup (ClusterRoles, RoleBindings, examples)
- [ ] Documentation: Dex connector configuration (Google, GitHub, LDAP, SAML)
- [ ] Documentation: MCP client configuration for each supported client

**Success Criteria:**
- All tests passing
- At least two Dex connectors tested and documented (Google, GitHub)
- Admins can deploy and configure auth following documentation

---

## Success Criteria

### Must Have (MVP)

- [ ] MCP OAuth endpoints in dot-ai (Milestone 2, Tasks 2.1-2.2)
- [ ] Dex integration as default OIDC provider (Milestone 2, Task 2.3)
- [ ] Identity extraction from OAuth tokens (Milestone 2, Task 2.4)
- [ ] User management endpoints with config reloader (Milestone 2, Task 2.5)
- [ ] K8s SubjectAccessReview enforcement (Milestone 3)
- [ ] Pre-built ClusterRoles in Helm chart, including user management (Milestone 3)
- [ ] Integration tests for auth, user management, and RBAC enforcement

### Nice to Have (Future)

- [ ] Rate limiting per user
- [ ] RBAC dry-run tool ("what would happen if user X tried tool Y?")
- [ ] Token refresh flow

### Success Metrics

- Unauthorized tool access rejected 100% of the time
- All authenticated operations traceable to specific user
- RBAC evaluation adds <10ms latency per request

## User Journey

### Current State (Shared Token)

1. Admin sets `DOT_AI_AUTH_TOKEN` on dot-ai server
2. All users share the same token
3. All users have full access to all tools
4. No individual identity tracking

### Future State (OAuth + K8s RBAC)

1. Admin runs `helm install` — gets auto-generated admin credentials in output
2. Admin logs in as initial admin, adds users via dot-ai API (CLI, UI, or MCP tool)
3. Admin optionally configures Dex connectors for production IdP (Google, GitHub, LDAP, etc.)
4. Admin applies ClusterRoles and RoleBindings via `kubectl`
5. User configures MCP client with dot-ai URL
6. On first connection, user authenticates via `/mcp` → Authenticate (browser opens for Dex login)
7. dot-ai validates identity, checks K8s RBAC, allows or denies
8. All operations logged with user identity

### User Personas

**Persona 1: Enterprise Platform Admin**
- Deploys dot-ai via Helm with OAuth enabled (Dex included)
- Configures Dex connectors for company IdP (Google, GitHub, LDAP)
- Creates RoleBindings for teams via `kubectl`

**Persona 2: Platform Team Lead**
- Team auto-assigned `dotai-operator` via Group RoleBinding
- Can query, operate, remediate — cannot deploy

**Persona 3: Developer (Existing User)**
- Dex static user for local development (KinD) — individual identity from day one

## Technical Scope

### dot-ai Changes (Milestones 2-3)

**OAuth Module (`src/interfaces/oauth/`):**
- `types.ts` — `UserIdentity`, JWT claims, pending auth request/authorization code types, `DexConfig`
- `jwt.ts` — JWT signing/verification using `node:crypto` HMAC-SHA256
- `provider.ts` — `OAuthServerProvider` implementation (SDK interface): client store, authorize→Dex redirect, code exchange→JWT issuance, token verification (JWT + legacy fallback), `/callback` handler
- `dex-client.ts` — Lightweight Dex OIDC communication using `node:http`: authorize URL builder, code exchange, ID token identity extraction
- `middleware.ts` — JWT validation middleware for non-OAuth routes, `WWW-Authenticate` challenge

**OAuth Endpoints (SDK `mcpAuthRouter()` + Express sub-app, served by MCP server):**
- `/.well-known/oauth-protected-resource` — Protected Resource Metadata (RFC 9728) — *SDK*
- `/.well-known/oauth-authorization-server` — Auth Server Metadata (RFC 8414) — *SDK*
- `/register` — Dynamic Client Registration (RFC 7591) — *SDK + provider.clientsStore*
- `/authorize` — Validates params, calls `provider.authorize()` → redirects to Dex — *SDK + provider*
- `/token` — PKCE verification + code exchange → JWT — *SDK + provider*
- `/callback` — Dex OIDC callback (custom Express route, not part of OAuth spec)

**User Management Endpoints (`src/interfaces/oauth/`):**
- `POST /users` — bcrypt-hash password, add to Dex Secret, trigger reload
- `GET /users` — read Dex Secret, return email list (no hashes)
- `DELETE /users/:email` — remove from Dex Secret, trigger reload
- RBAC-protected: requires `dotai-admin` role (`users` resource, `create`/`delete`/`list` verbs)

**Auth Middleware (`src/interfaces/oauth/middleware.ts`):**
- Replace `src/interfaces/auth.ts` with JWT token validation
- Validate Bearer tokens, extract `UserIdentity`

**Authorization Check (new module, Milestone 3):**
- K8s SubjectAccessReview before tool dispatch
- dot-ai's ServiceAccount needs `create` on `subjectaccessreviews`

### Helm Chart Changes (Milestone 2)

- Dex subchart with config reloader sidecar (watches Secret, signals Dex to reload)
- Auto-generated initial admin on `helm install` (or migrated from `DOT_AI_AUTH_TOKEN`)
- Pre-built ClusterRoles: `dotai-viewer`, `dotai-operator`, `dotai-admin`
- ClusterRole for SubjectAccessReview:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: dotai-auth-checker
rules:
  - apiGroups: ["authorization.k8s.io"]
    resources: ["subjectaccessreviews"]
    verbs: ["create"]
```

## Dependencies

**External Dependencies:**
- Kubernetes cluster with RBAC enabled
- Dex (ships as Helm subchart — no separate installation)

**Internal Dependencies:**
- `version` tool — for identity display (Milestone 2, Task 2.4)
- Auth middleware — replace existing with OAuth (Milestone 2, Task 2.1)
- Helm chart — for Dex subchart and ClusterRoles (Milestones 2-3)

**Dependent PRDs:**
- [PRD #361 (User-Specific Permissions)](./361-user-specific-permissions.md) — depends on user identity from this PRD
- New PRDs for `dot-ai-cli` and `dot-ai-ui` (Milestone 5)

## Security Considerations

### Token Security
- Access tokens are short-lived (configurable expiry)
- Tokens are cryptographically signed by dot-ai
- Token validation happens on every request
- Revocation via token expiry (refresh tokens for longer sessions — future)

### Default Deny
- In OAuth mode, requests without valid token → 401
- Users without RoleBindings → denied all tool access
- No default role — access must be explicitly granted

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
- **Follow-up PRDs**: CLI identity (`dot-ai-cli`), Web UI identity (`dot-ai-ui`)

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
