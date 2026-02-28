# PRD: Auth-Agnostic Identity & Kubernetes RBAC

**Status**: Planning
**Priority**: High
**GitHub Issue**: [#380](https://github.com/vfarcic/dot-ai/issues/380)
**Created**: 2026-02-18
**Last Updated**: 2026-02-28
**Supersedes**: [PRD #360 - User Authentication](./done/360-user-authentication.md) (closed)

---

## Problem Statement

Enterprise deployments need user-level authentication and authorization. The current system supports only a **single shared auth token** (`DOT_AI_AUTH_TOKEN`), which means:

- No individual user identity — all users share one token
- No way to control what specific users can do (no authorization)
- Audit logs cannot track who performed operations
- No mechanism to revoke access for specific users

Previous approaches (PRD #360, v1.0 of this PRD) proposed building auth/RBAC inside dot-ai. Both were rejected — authentication is orthogonal to dot-ai's core value, and Kubernetes already has battle-tested RBAC.

## Proposed Solution

**Two core principles:**

1. **dot-ai is auth-agnostic** — it does not care how clients authenticate. A unified gateway handles authN for all access paths (MCP, HTTP/REST, Web UI).
2. **dot-ai owns authorization via Kubernetes RBAC** — all requests converge on a `UserIdentity`, and dot-ai checks permissions using K8s [SubjectAccessReview](https://kubernetes.io/docs/reference/kubernetes-api/authentication-resources/subject-access-review-v1/).

### Deployment Topology

All components run **inside the Kubernetes cluster**. A single gateway ([Envoy AI Gateway](https://aigateway.envoyproxy.io/) — open source, Apache 2.0, CNCF) handles both MCP and HTTP protocols with unified OAuth authentication:

```
User's laptop                              Kubernetes cluster
                                          ┌──────────────────────────────────────────┐
┌─────────────┐                          │                                          │
│  MCP Client  │                          │                                          │
│ (Claude Code)│ ── (internet) ──►        │                                          │
└─────────────┘                           │  Envoy AI Gateway ──► dot-ai             │
                                          │  (Ingress/LB)         (ClusterIP)        │
┌─────────────┐                          │                                          │
│  CLI         │ ── (internet) ──►        │  Unified authN         Extracts identity │
└─────────────┘                           │  (OAuth/OIDC for       Checks K8s RBAC   │
                                          │   both MCP + HTTP)                       │
┌─────────────┐                          │                                          │
│  Web UI      │ ── (internet) ──►        │                                          │
│ (browser)    │                          │                                          │
└─────────────┘                           │                                          │
                                          │  ┌─────────────────────────────────┐     │
                                          │  │ NetworkPolicy:                  │     │
                                          │  │ Only gateway can reach dot-ai   │     │
                                          │  └─────────────────────────────────┘     │
                                          └──────────────────────────────────────────┘
```

**Key points:**
- **One gateway for all protocols** — Envoy AI Gateway supports MCPRoute (for agents) and HTTPRoute (for CLI/Web UI) on the same instance with shared OAuth configuration
- **dot-ai is ClusterIP only** — never exposed directly. NetworkPolicy ensures only the gateway can reach it
- **Gateway authenticates all traffic** — whether MCP or HTTP, the same OAuth/OIDC flow applies. Gateway injects verified identity headers before forwarding to dot-ai.

### Why Envoy AI Gateway

| Requirement | Envoy AI Gateway |
|-------------|-----------------|
| MCP protocol support | Yes (MCPRoute CRD) |
| HTTP protocol support | Yes (HTTPRoute CRD, via Envoy Gateway) |
| Unified OAuth for both | Yes (same auth filters) |
| Open source | Yes (Apache 2.0, CNCF) |
| Kubernetes-native | Yes (CRDs, Helm chart) |
| Identity header forwarding | Yes (Envoy header manipulation) |

Commercial alternatives exist (Kong Enterprise, Traefik Hub, Gravitee) but require paid licenses for MCP features. Envoy AI Gateway is the only fully open source option that handles both protocols.

**Note:** Envoy AI Gateway is at v0.5 (early but actively developed). MCP over Streamable HTTP is just HTTP, so even plain Envoy Gateway (stable, CNCF graduated) could work as a fallback if MCP-specific features aren't needed for auth.

### MCP Client OAuth Compatibility

The MCP Authorization spec defines OAuth 2.1 for client authentication. When a client connects to the gateway, the gateway should trigger a browser-based OAuth flow (e.g., Google login). Current client support:

| Client | OAuth Flow | Reliability |
|--------|-----------|-------------|
| **ChatGPT** | Browser opens, clean flow | High |
| **Windsurf** | Browser opens automatically | High |
| **Gemini CLI** | Multiple auth modes | High |
| **VS Code Copilot** | Supported (v1.101+) | Medium-High |
| **Claude Code** | Documented, but buggy (silent failures, browser not opening) | Low |
| **Cursor** | Partial, platform-dependent | Medium |

**Claude Code specifically** has open bugs where the OAuth browser flow fails silently. Fallback options include pre-configured bearer tokens in MCP client config and manual `/mcp` → "Authenticate" flow.

**This is the riskiest assumption in the entire PRD** — which is why Milestone 1 validates it before building anything else.

### Identity Contract

The gateway injects verified user identity as trusted HTTP headers before forwarding to dot-ai:

| Header | Required | Description | Example |
|--------|----------|-------------|---------|
| `X-User-Id` | Yes | Unique user identifier (OIDC `sub` claim) | `jane.doe` |
| `X-User-Email` | No | User email address | `jane@company.com` |
| `X-User-Groups` | No | Comma-separated group list | `platform-team,dev-team` |

Header names are **configurable** to support different gateway conventions.

Headers are **trusted because of the deployment topology** — dot-ai is only reachable from the gateway (enforced by NetworkPolicy). No external client can set these headers directly. This is the same trust model used by Kubernetes itself (auth proxies), Istio (sidecar identity), and standard reverse proxy architectures.

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
```

Admins can create additional custom ClusterRoles/Roles with standard `kubectl`.

### Authentication Modes

| Mode | Identity Source | RBAC | Use Case |
|------|----------------|------|----------|
| **Token** (existing) | Shared token, no individual identity | No RBAC | Development, simple setups |
| **Identity** (new) | User identity from gateway headers | Full K8s RBAC | Multi-user / enterprise |

Both modes require authentication. There is no unauthenticated access.

### Configuration

```yaml
auth:
  mode: "identity"  # "token" (existing) or "identity" (new)

  # For mode: "token" (existing behavior, unchanged)
  token: "${DOT_AI_AUTH_TOKEN}"

  # For mode: "identity"
  identity:
    headers:
      user_id: "X-User-Id"
      email: "X-User-Email"
      groups: "X-User-Groups"
```

### Key Design Principles

1. **Auth-agnostic** — dot-ai never handles authentication; the gateway handles authN for all protocols
2. **Single gateway** — one Envoy AI Gateway instance handles MCP + HTTP with unified OAuth
3. **Single authorization path** — all requests converge on UserIdentity → K8s RBAC
4. **Kubernetes-native** — K8s SubjectAccessReview, standard RBAC manifests, NetworkPolicy
5. **Network-enforced trust** — dot-ai is ClusterIP only; only the gateway can reach it
6. **Validate first** — prove the gateway + OAuth flow works before building RBAC
7. **Familiar UX** — admins manage permissions with `kubectl`

## Milestones

### Milestone 1: Gateway Proof of Concept
**Objective**: Validate the riskiest assumption — that an in-cluster gateway can handle OAuth for both MCP and HTTP, and that MCP clients (especially Claude Code) complete the auth flow successfully.

**This milestone is a spike. No dot-ai code changes. Just gateway deployment and client testing.**

**Deliverables:**
- [ ] Deploy Envoy AI Gateway in a test cluster (KinD or remote)
- [ ] Configure OAuth with a test identity provider (e.g., Google)
- [ ] Configure MCPRoute pointing to dot-ai's existing MCP endpoint
- [ ] Configure HTTPRoute pointing to dot-ai's existing REST API
- [ ] Verify identity headers are forwarded to dot-ai for both routes
- [ ] Test MCP OAuth flow from Claude Code — does the browser open? Does auth complete? Do tools load?
- [ ] Test MCP OAuth flow from at least one other client (Windsurf, Gemini CLI, or VS Code)
- [ ] Test HTTP flow — `curl` with bearer token through the gateway
- [ ] Document findings: what works, what doesn't, what workarounds are needed
- [ ] If Envoy AI Gateway doesn't work: test plain Envoy Gateway as fallback (MCP is just HTTP)

**Success Criteria:**
- At least one MCP client completes OAuth and can use dot-ai tools through the gateway
- HTTP requests with bearer tokens are proxied correctly with identity headers
- Clear documentation of Claude Code's behavior (works / needs workaround / doesn't work)

**Decision Point:** Based on findings:
- **OAuth works for key clients** → proceed to Milestone 2
- **OAuth is unreliable** → define fallback strategy (pre-configured bearer tokens, manual auth step) and document it before proceeding
- **Gateway doesn't forward identity properly** → evaluate alternative gateways or adjust architecture

---

### Milestone 2: Identity Extraction & Display
**Objective**: dot-ai extracts identity from gateway headers and displays it in the `version` tool output. No authorization enforcement yet — just proving dot-ai receives and reads the identity.

**Deliverables:**
- [ ] `UserIdentity` type definition
- [ ] Identity extraction from configurable trusted headers
- [ ] Auth middleware extended to support identity mode alongside token mode
- [ ] `version` tool updated to include identity in output (userId, email, groups, source)
- [ ] Configuration: auth mode and header name settings in Helm values
- [ ] Integration tests: identity extracted correctly, version shows identity, token mode unaffected

**Success Criteria:**
- `version` output shows the authenticated user's identity when headers are present
- Missing identity headers in identity mode returns 401
- Token mode behavior unchanged
- End-to-end: Claude Code → gateway → dot-ai → `version` shows user identity

---

### Milestone 3: Kubernetes RBAC Enforcement
**Objective**: Enforce tool-level and namespace-level permissions using K8s SubjectAccessReview.

**Deliverables:**
- [ ] SubjectAccessReview call before every tool invocation in identity mode
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
- Token mode unaffected (no RBAC checks)

---

### Milestone 4: Network Security
**Objective**: Ensure dot-ai is only reachable from the gateway.

**Deliverables:**
- [ ] NetworkPolicy in Helm chart restricting ingress to dot-ai pods
- [ ] Only gateway pods can reach dot-ai
- [ ] Documentation: CNI requirements, verification steps
- [ ] Integration tests: unauthorized pods cannot reach dot-ai

**Success Criteria:**
- Direct access to dot-ai bypassing the gateway is blocked
- NetworkPolicy deployed automatically with Helm chart

---

### Milestone 5: Audit Integration
**Objective**: Include user identity in audit logs for traceability.

**Deliverables:**
- [ ] User identity in all operation audit log entries
- [ ] Authorization decisions logged (allowed and denied)
- [ ] Token-mode users logged as "shared-token"

**Success Criteria:**
- All operations traceable to specific user
- Denied access attempts logged with reason

---

### Milestone 6: Documentation & End-to-End Testing
**Objective**: Validate the full stack and document setup.

**Deliverables:**
- [ ] End-to-end integration tests: gateway → auth → identity → RBAC → tool execution
- [ ] Tests for role escalation prevention
- [ ] Documentation: full deployment topology
- [ ] Documentation: RBAC setup (ClusterRoles, RoleBindings, examples)
- [ ] Documentation: gateway configuration with OAuth providers (Google, GitHub, etc.)
- [ ] Documentation: MCP client configuration for each supported client

**Success Criteria:**
- All tests passing
- Admins can deploy and configure the full auth stack following documentation

---

### Milestone 7: Client Identity PRDs
**Objective**: Define how CLI and Web UI authenticate through the gateway.

**Deliverables:**
- [ ] Create PRD for `dot-ai-cli`: how CLI authenticates through the gateway (bearer token from kubeconfig, device flow, etc.)
- [ ] Create PRD for `dot-ai-ui`: how Web UI authenticates users through the gateway (OAuth redirect, etc.)

**Success Criteria:**
- CLI and Web UI PRDs define their auth flow through the unified gateway
- No changes needed in dot-ai core

---

## Success Criteria

### Must Have (MVP)

- [ ] Unified gateway handling MCP + HTTP with OAuth (Milestone 1)
- [ ] Identity extraction from gateway headers (Milestone 2)
- [ ] K8s SubjectAccessReview enforcement (Milestone 3)
- [ ] Pre-built ClusterRoles in Helm chart (Milestone 3)
- [ ] NetworkPolicy restricting access to dot-ai (Milestone 4)
- [ ] Existing token mode unaffected
- [ ] Integration tests for RBAC enforcement

### Nice to Have (Future)

- [ ] Rate limiting per user at the gateway level
- [ ] RBAC dry-run tool ("what would happen if user X tried tool Y?")

### Success Metrics

- Unauthorized tool access rejected 100% of the time
- All authenticated operations traceable to specific user
- No regression in token mode
- RBAC evaluation adds <10ms latency per request
- dot-ai not reachable from outside the cluster without going through the gateway

## User Journey

### Current State (Token Mode)

1. Admin sets `DOT_AI_AUTH_TOKEN` on dot-ai server
2. All users share the same token
3. All users have full access to all tools
4. No individual identity tracking

### Future State (Gateway + K8s RBAC)

1. Admin deploys Envoy AI Gateway + dot-ai in the cluster
2. Admin configures OAuth (e.g., Google) on the gateway
3. Admin applies ClusterRoles and RoleBindings via `kubectl`
4. User configures MCP client with gateway URL
5. On first connection, browser opens for OAuth (Google login)
6. Gateway authenticates, forwards requests to dot-ai with identity headers
7. dot-ai extracts identity, checks K8s RBAC, allows or denies
8. All operations logged with user identity

### User Personas

**Persona 1: Enterprise Platform Admin**
- Deploys gateway + dot-ai via Helm
- Configures OAuth with company IdP
- Creates RoleBindings for teams via `kubectl`
- One gateway, one auth config, all protocols

**Persona 2: Platform Team Lead**
- Team auto-assigned `dotai-operator` via Group RoleBinding
- Can query, operate, remediate — cannot deploy

**Persona 3: Developer (Existing User)**
- Token mode for local development (KinD)
- Zero changes to workflow

## Technical Scope

### dot-ai Changes (Milestones 2-5)

**Identity Extraction (`src/interfaces/auth.ts`):**
- Extend `checkBearerAuth()` to support identity mode
- Extract configured headers, construct `UserIdentity`
- Token mode unchanged

**Authorization Check (new module):**
- K8s SubjectAccessReview before tool dispatch
- dot-ai's ServiceAccount needs `create` on `subjectaccessreviews`

**Interface:**
```typescript
interface UserIdentity {
    userId: string;
    email?: string;
    groups: string[];
    source: 'identity-headers' | 'token';
}
```

### Helm Chart Changes (Milestones 3-4)

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
- NetworkPolicy:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: dotai-allow-gateway-only
spec:
  podSelector:
    matchLabels:
      app: dot-ai
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: envoy-ai-gateway
```

## Dependencies

**External Dependencies:**
- Envoy AI Gateway (or plain Envoy Gateway as fallback)
- Kubernetes cluster with RBAC enabled
- CNI supporting NetworkPolicy (Calico, Cilium) for production
- OAuth identity provider (Google, GitHub, company IdP)

**Internal Dependencies:**
- `version` tool — for identity display (Milestone 2)
- Auth middleware — extend existing (Milestone 2)
- Helm chart — for ClusterRoles and NetworkPolicy (Milestones 3-4)

**Dependent PRDs:**
- [PRD #361 (User-Specific Permissions)](./361-user-specific-permissions.md) — depends on user identity from this PRD
- New PRDs for `dot-ai-cli` and `dot-ai-ui` (Milestone 7)

## Security Considerations

### Trust Boundary
The trust boundary is the **Kubernetes network**. dot-ai trusts identity headers because only the gateway can reach it (enforced by NetworkPolicy). This is the same trust model used by Kubernetes (auth proxy → API server), Istio (sidecar identity), and standard reverse proxy architectures.

### Default Deny
- In identity mode, requests without identity headers → 401
- Users without RoleBindings → denied all tool access
- No default role — access must be explicitly granted

### Header Spoofing Prevention
Headers cannot be spoofed because NetworkPolicy prevents external traffic from reaching dot-ai. An attacker would need to compromise the gateway pod itself.

### NetworkPolicy Requirements
- Production: Calico or Cilium for full enforcement
- Development (KinD): limited NetworkPolicy support, but dev uses token mode

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **Custom RBAC engine** (v1.0) | Reinvents K8s RBAC |
| **OPA / Casbin / Cerbos** | External dependency or custom config when K8s RBAC exists |
| **Dex** (bundled for authN) | Adds auth infra to dot-ai; gateway handles this |
| **Separate auth per protocol** | Complex; unified gateway is simpler |
| **Kong / Traefik Hub** | MCP features require enterprise license |
| **HMAC-signed headers** | Shared secret on user laptops defeats the purpose |
| **TokenReview** | MCP gateways don't forward tokens upstream |

## MCP Gateway Ecosystem

Research (Feb 2026) — gateways supporting both MCP + HTTP with unified auth:

| Gateway | MCP + HTTP | Open Source | Auth | Notes |
|---------|-----------|-------------|------|-------|
| **Envoy AI Gateway** | Yes (MCPRoute + HTTPRoute) | Yes (Apache 2.0) | OAuth/JWT | v0.5, CNCF |
| **Kong 3.12+** | Yes | Enterprise only (AI plugins) | OIDC | Most mature |
| **Traefik Hub** | Yes (MCP as middleware) | Commercial | JWT | Clean architecture |
| **Gravitee 4.8+** | Yes (dual entrypoint) | Commercial | OAuth | Same API, two protocols |
| **Envoy Gateway** | HTTP only (no MCPRoute) | Yes (Apache 2.0) | OAuth/JWT | Stable fallback |

MCP-only gateways (IBM ContextForge, AgentGateway, Klavis) cannot serve HTTP to CLI/Web UI.

## References

- [Envoy AI Gateway](https://aigateway.envoyproxy.io/) — MCP + HTTP gateway
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [SubjectAccessReview API](https://kubernetes.io/docs/reference/kubernetes-api/authentication-resources/subject-access-review-v1/)
- [Kubernetes NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [awesome-mcp-gateways](https://github.com/e2b-dev/awesome-mcp-gateways)

## Related Resources

- **GitHub Issue**: [#380](https://github.com/vfarcic/dot-ai/issues/380)
- **Supersedes**: [PRD #360 - User Authentication](./done/360-user-authentication.md) (closed)
- **Dependent PRD**: [PRD #361 - User-Specific Permissions](./361-user-specific-permissions.md)
- **Follow-up PRDs**: CLI identity (`dot-ai-cli`), Web UI identity (`dot-ai-ui`)

---

## Version History

- **v1.0** (2026-02-18): Initial — gateway-delegated authN + custom plugin-based RBAC
- **v2.0** (2026-02-28): Auth-agnostic identity + K8s RBAC via SubjectAccessReview
- **v2.1** (2026-02-28): In-cluster deployment topology, NetworkPolicy trust model
- **v3.0** (2026-02-28): Unified gateway approach (Envoy AI Gateway for MCP + HTTP). Milestone 1 is now a gateway proof of concept — validate OAuth flow with MCP clients before building anything. Restructured milestones to validate riskiest assumption first.
