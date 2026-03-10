# PRD: Kubernetes RBAC Enforcement & Audit Logging

**Status**: In Progress
**Priority**: High
**GitHub Issue**: [#392](https://github.com/vfarcic/dot-ai/issues/392)
**Created**: 2026-03-02
**Last Updated**: 2026-03-02
**Depends on**: [PRD #380 - MCP OAuth Authentication & User Identity](./done/380-gateway-auth-rbac.md)

---

## Problem Statement

After PRD #380, dot-ai has individual user identity (OAuth via Dex) and static token authentication. However, **all authenticated users have full access to all tools**. There is no way to:

- Restrict which tools a specific user can execute
- Limit a user's operations to specific namespaces
- Prevent non-admins from managing users
- Audit which users performed which operations and whether access was allowed or denied

Without authorization, authentication alone only answers "who are you?" — not "what are you allowed to do?"

## Proposed Solution

Enforce tool-level and namespace-level permissions using Kubernetes RBAC via [SubjectAccessReview](https://kubernetes.io/docs/reference/kubernetes-api/authentication-resources/subject-access-review-v1/). This is a Kubernetes-native approach — no custom RBAC engine, no external policy service.

### How It Works

When an OAuth-authenticated user invokes a tool:

1. dot-ai extracts `UserIdentity` from the JWT (already done by PRD #380)
2. dot-ai creates a `SubjectAccessReview` with the user's identity, the tool name, and the target namespace
3. Kubernetes evaluates the request against existing RBAC rules (Roles, ClusterRoles, RoleBindings, ClusterRoleBindings)
4. If allowed → tool executes normally
5. If denied → structured error returned to the user

**Static token users bypass RBAC** — they get full tool access as today (shared anonymous identity, no user/group to evaluate).

### RBAC-Filtered Tool Discovery

The `GET /api/v1/tools` endpoint returns only tools the authenticated user is authorized for. This is the foundation for all client-side filtering — MCP, CLI, and Web UI all consume this filtered response.

For **MCP clients** (Claude Code, Cursor, etc.), dot-ai only registers the tools returned by the filtered discovery at session startup. An OAuth user with `dotai-viewer` binding only sees `query` and `version` — `operate`, `recommend`, etc. are never loaded. The AI agent can't attempt unauthorized calls because it doesn't know the tools exist.

For **CLI and Web UI**, the same filtered endpoint means these clients can hide commands/UI elements for tools the user can't access (handled by feature requests to those projects).

**Tradeoff**: For MCP, permission changes don't take effect until the user reconnects their session. This is acceptable since RBAC changes are infrequent administrative operations.

**Static token users** see all tools (no filtering) since they bypass RBAC.

Invocation-time RBAC checks remain as a second layer of defense — if a tool is registered but permissions were revoked mid-session, the call is still denied.

### SubjectAccessReview Call

```typescript
const review = await k8sApi.createSubjectAccessReview({
    spec: {
        user: identity.email,              // email for human-readable bindings
        groups: identity.groups,
        resourceAttributes: {
            namespace: targetNamespace,     // from tool args, or cluster-scoped
            group: "dot-ai.devopstoolkit.ai",
            resource: "tools",
            name: toolName,                 // e.g., "operate", "query"
            verb: "execute",
        },
    },
});

if (!review.body.status.allowed) {
    // Return structured error with reason
}
```

> **Design Decision**: RBAC bindings use `identity.email` (not the opaque Dex `sub` claim) so admins can configure human-readable ClusterRoleBindings (e.g., `subjects[].name: viktor@farcic.com`).

> **RBAC Toggle**: Controlled by `DOT_AI_RBAC_ENABLED` env var (default `false`). When disabled, all authenticated users have full access — backward-compatible with pre-RBAC deployments.

The virtual API group `dot-ai.devopstoolkit.ai` requires no CRDs — SubjectAccessReview evaluates RBAC rules as pure string matching.

### Pre-built ClusterRoles

The Helm chart ships pre-built ClusterRoles. Admins only need to create bindings:

| ClusterRole | Tools Allowed | Verbs | Use Case |
|-------------|---------------|-------|----------|
| `dotai-viewer` | `query`, `version` | `execute` | Read-only cluster visibility |
| `dotai-operator` | `query`, `version`, `operate`, `remediate` | `execute`, `apply` | Day-2 operations (plan + apply) |
| `dotai-admin` | All tools + user management | `execute`, `apply` | Full access |

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
    verbs: ["execute", "apply"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: dotai-admin
rules:
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["tools"]
    resourceNames: ["query", "version", "recommend", "operate", "remediate",
                     "manageOrgData", "manageKnowledge", "projectSetup"]
    verbs: ["execute", "apply"]
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["users"]
    verbs: ["execute"]
```

**Namespace scoping comes for free** — same user, different Roles per namespace. **Group bindings** leverage groups from the identity provider (Dex).

### Example: Restrict a User

```yaml
# Allow only remediate and query in production namespace
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

### Audit Logging

All authorization decisions are logged:

- **Allowed**: user, tool, namespace, timestamp
- **Denied**: user, tool, namespace, reason, timestamp
- **User management**: who created/deleted which user

This builds on the existing `UserIdentity` propagation (AsyncLocalStorage requestContext) from PRD #380.

### Key Design Principles

1. **Kubernetes-native** — SubjectAccessReview, standard RBAC manifests, familiar to any K8s admin
2. **No custom policy engine** — no OPA, Casbin, or Cerbos dependency
3. **Default deny for OAuth users** — no RoleBindings = no tool access
4. **Token users unaffected** — static token bypasses RBAC (backward-compatible)
5. **Namespace scoping for free** — K8s RBAC already supports namespace-scoped Roles
6. **Familiar UX** — admins manage permissions with `kubectl`

## Open Design Decisions

### Namespace & Resource-Level Enforcement Strategy

**Context**: This PRD defines tool-level authorization ("can this user use `recommend`?") via SubjectAccessReview on the virtual API group `dot-ai.devopstoolkit.ai`. But there's a second layer: **namespace and resource-level enforcement** ("can this user deploy to `production`?", "can they see pods in `team-b` namespace?"). See also [#397](https://github.com/vfarcic/dot-ai/issues/397) (closed as duplicate).

**The problem**: Currently dot-ai uses a single shared kubeconfig (the ServiceAccount). Even if a user is restricted to `dotai-viewer` at the tool level, the underlying kubectl calls still run with the ServiceAccount's full cluster permissions. A user could `query` resources in namespaces they shouldn't have visibility into.

**Options under consideration:**

#### Option A: SubjectAccessReview for Namespaces (Virtual RBAC)
Extend the existing SubjectAccessReview approach — before executing a tool in a namespace, check if the user has permission on the virtual API group for that namespace.

- **Pro**: Consistent with tool-level enforcement, single mechanism
- **Pro**: Admins use familiar Role/RoleBinding per namespace
- **Con**: The actual kubectl calls still run as the ServiceAccount — enforcement is application-level only
- **Con**: Discovery (`query`) would need to filter results post-fetch, since kubectl runs as ServiceAccount

#### Option B: Per-User Kubeconfig
Associate each OAuth user with their own kubeconfig (mapped to their own ServiceAccount or credentials). All kubectl calls execute with the user's own permissions.

- **Pro**: Kubernetes itself enforces everything — no application-level checks needed for namespaces
- **Pro**: `query` naturally only returns what the user can see
- **Pro**: `recommend` only suggests actions the user can perform
- **Con**: Operationally heavier — managing per-user kubeconfigs or ServiceAccounts
- **Con**: Requires mapping OAuth identity → Kubernetes credentials

#### Option C: Kubernetes User Impersonation
dot-ai's ServiceAccount impersonates the OAuth user via [user impersonation](https://kubernetes.io/docs/reference/access-authn-authz/authentication/#user-impersonation). All kubectl calls include `--as=<user> --as-group=<group>` headers.

- **Pro**: Kubernetes-native enforcement without per-user kubeconfigs
- **Pro**: Uses the user's actual RBAC bindings for all operations
- **Pro**: Single ServiceAccount, no credential management
- **Con**: ServiceAccount needs impersonation privileges (powerful permission)
- **Con**: User identities must match between OAuth provider and K8s RBAC bindings

#### Option D: Hybrid — Tool-Level Virtual RBAC + Resource-Level Impersonation
- Tool access (`can you use recommend?`) → SubjectAccessReview on virtual API group (this PRD, Milestone 1)
- Resource access (`can you deploy to production?`) → Kubernetes impersonation for actual kubectl calls

- **Pro**: Clean separation of concerns — dot-ai controls tool access, Kubernetes controls resource access
- **Pro**: No post-fetch filtering needed, results are naturally scoped
- **Con**: Two enforcement mechanisms to understand and configure

**Decision**: TBD — to be resolved before Milestone 2 (Verb Mapping) since namespace enforcement affects how verbs and workflow phases interact with permissions.

---

## Milestones

### Milestone 1: RBAC Enforcement Module
**Objective**: Create the authorization check module and integrate it into tool dispatch.

- [x] Create `src/core/rbac/` module — SubjectAccessReview helper using `@kubernetes/client-node`
- [x] Integrate RBAC check into REST API tool dispatch (`rest-api.ts`, before tool handler invocation)
- [x] RBAC-filtered tool discovery — `GET /api/v1/tools` returns only tools the authenticated user is authorized for
- [x] Integrate RBAC check into MCP tool handlers (`mcp.ts`)
- [x] MCP dynamic tool filtering — only register tools the user is authorized for at session startup (consumes filtered tool discovery)
- [x] RBAC check on user management endpoints (`POST/GET/DELETE /api/v1/users`)
- [x] Token users bypass RBAC — only OAuth users are checked
- [x] Structured error response for denied tool calls (tool name, namespace, user, reason)
- [x] Integration tests: authorized calls succeed, unauthorized rejected

**Success Criteria:**
- OAuth user without RoleBindings cannot execute any tool
- OAuth user with `dotai-viewer` binding can only use `query` and `version`
- Token users retain full access (no regression)

### Milestone 2: Verb Mapping Per Tool
**Objective**: Define which RBAC verbs (`read`, `write`, etc.) gate which phases of each tool's workflow. This determines the granularity of permissions — e.g., a user with `read` on `recommend` can generate recommendations but not apply them.

**Design Principle**: Single-phase tools (read-only or all-or-nothing) retain the `execute` verb from Milestone 1 — verb granularity adds no value when there's only one access level. Verb mapping only applies to multi-phase tools where distinguishing `read` vs `write` enables meaningful partial access (e.g., generate but not apply).

- [~] Define verb mapping for `query` — single-phase read-only tool, retains `execute` (no change needed)
- [~] Define verb mapping for `version` — single-phase read-only tool, retains `execute` (no change needed)
- [x] Define verb mapping for `recommend` — `execute` for all phases up to and including `generateManifests`; `apply` verb required for `deployManifests` stage. When user lacks `apply`, the `generateManifests` response includes a message explaining that deploying requires `apply` permission and suggests saving files locally or pushing to Git instead. Invocations of `deployManifests` without `apply` return structured denial.
- [x] Define verb mapping for `operate` — `execute` for analysis and refinement routes; `apply` verb required for execution route (sessionId + executeChoice). When user lacks `apply`, analysis response explains that executing requires `apply` permission and suggests applying manually via kubectl or GitOps. Execution without `apply` returns structured denial.
- [x] Define verb mapping for `remediate` — `execute` for investigation and diagnosis; `apply` verb required for executing remediation commands (both manual executeChoice and automatic mode). When user lacks `apply`: manual mode omits execution choices and explains the restriction; automatic mode downgrades to awaiting_user_approval with explanation. Direct executeChoice calls without `apply` return structured denial.
- [~] Define verb mapping for `manageOrgData` — all operations (create, delete, scan, list, get, search) are independent CRUD with no plan-then-apply workflow; retains `execute` (no change needed)
- [~] Define verb mapping for `manageKnowledge` — independent operations (ingest, search, deleteByUri) with no plan-then-apply workflow; retains `execute` (no change needed)
- [~] Define verb mapping for `projectSetup` — multi-step workflow but generateScope only returns content (no cluster/disk mutation); retains `execute` (no change needed)
- [~] Define verb mapping for user management (`users` resource) — admin-only tool with no plan-then-apply workflow; retains `execute` (no change needed)
- [x] Update ClusterRole definitions to use verbs where applicable
- [x] Update RBAC enforcement module to check verb per workflow phase

**Success Criteria:**
- Each tool assessed for verb granularity; single-phase tools documented as retaining `execute`
- Multi-phase tools have clear verb-to-workflow-phase mappings
- ClusterRoles updated for tools where granular verbs add value
- Users can be granted read-only access to mutating tools (e.g., recommend without apply)

### Milestone 3: Helm Chart ClusterRoles & ServiceAccount
**Objective**: Ship pre-built ClusterRoles and grant dot-ai's ServiceAccount permission to create SubjectAccessReviews.

- [x] Add `dotai-viewer`, `dotai-operator`, `dotai-admin` ClusterRoles to Helm templates
- [x] Add `dotai-auth-checker` ClusterRole (allows `create` on `subjectaccessreviews`) and bind to dot-ai ServiceAccount
- [x] Helm values for enabling/disabling RBAC enforcement (`rbac.enforcement.enabled`, default `false`)
- [x] Integration tests: group-based RoleBindings

**Success Criteria:**
- `helm install` creates all ClusterRoles
- dot-ai ServiceAccount can create SubjectAccessReviews
- RBAC enforcement can be toggled via Helm values

### Milestone 4: Performance & Caching
**Objective**: Ensure RBAC checks add minimal latency.

- [~] Evaluate SubjectAccessReview latency under load — deferred: SAR evaluates in-memory RBAC rules on kube-apiserver, expected <5ms per call; benchmark if latency issues surface in production
- [~] Implement caching strategy if needed — deferred: caching adds cache-invalidation risk (stale permissions) for marginal gain; revisit only if benchmarks show >10ms p99
- [~] Performance benchmarks: <10ms p99 for RBAC evaluation — deferred: pending production load data

**Success Criteria:**
- SubjectAccessReview adds <10ms latency per request (p99)

### Milestone 5: Audit Logging
**Objective**: Log all authorization decisions for traceability.

- [x] Log allowed tool invocations with user identity (userId, email, tool, namespace)
- [x] Log denied tool invocations with reason
- [x] Log user management operations (who created/deleted which user)
- [x] Integration tests: verify audit log entries for allowed and denied operations

**Success Criteria:**
- All operations traceable to specific user
- Denied access attempts logged with reason

### Milestone 6: Documentation
**Objective**: Document RBAC setup so admins can configure permissions.

- [ ] Documentation: RBAC concepts (virtual API group, SubjectAccessReview, default deny)
- [ ] Documentation: ClusterRole reference (viewer, operator, admin — what each allows)
- [ ] Documentation: Creating custom Roles and RoleBindings (with examples)
- [ ] Documentation: Namespace-scoped permissions (with examples)
- [ ] Documentation: Group-based bindings (Dex groups → K8s RBAC)
- [ ] Documentation: Troubleshooting denied access

**Success Criteria:**
- Admins can configure RBAC by following documentation alone

### Milestone 7: Client-Side RBAC Integration (Feature Requests)
**Objective**: Ensure CLI and Web UI consume the RBAC-filtered tool discovery endpoint so users only see tools they're authorized for.

- [ ] Send feature request to CLI (`dot-ai-cli`): hide/disable commands for tools not returned by RBAC-filtered `GET /api/v1/tools`
- [ ] Send feature request to Web UI (`dot-ai-ui`): hide/disable UI elements for tools not returned by RBAC-filtered `GET /api/v1/tools`

**Note:** These are cross-project tasks. This PRD delivers the RBAC-filtered API; CLI and Web UI need to consume it on their side.

---

## Success Criteria

### Must Have

- [ ] SubjectAccessReview enforcement for all tool invocations (OAuth users)
- [ ] Token users bypass RBAC (backward-compatible)
- [ ] Pre-built ClusterRoles in Helm chart (`dotai-viewer`, `dotai-operator`, `dotai-admin`)
- [ ] RBAC on user management endpoints
- [ ] Structured error messages for denied access
- [ ] Audit logging of authorization decisions
- [ ] Integration tests covering authorized, unauthorized, namespace-scoped, and group-based scenarios
- [ ] Documentation for RBAC setup

### Success Metrics

- Unauthorized tool access rejected 100% of the time
- Namespace-scoped permissions enforced correctly
- Group-based RoleBindings work
- SubjectAccessReview adds <10ms latency per request (p99)
- All operations traceable to specific user

## Technical Scope

### New Module: `src/core/rbac/`

- `check-access.ts` — SubjectAccessReview wrapper using `@kubernetes/client-node`
- Maps tool names to RBAC resources (tool name → `resourceNames`)
- Extracts target namespace from tool arguments where applicable
- Returns structured allow/deny result

### Integration Points

| Location | File | What Changes |
|----------|------|-------------|
| REST API tool dispatch | `src/interfaces/rest-api.ts` | RBAC check before `toolMetadata.handler()` call |
| MCP tool handlers | `src/interfaces/mcp.ts` | RBAC wrapper in `registerMcpTool()` + dynamic tool filtering at session startup |
| User management | `src/interfaces/rest-api.ts` | RBAC check on `handleCreateUser`, `handleListUsers`, `handleDeleteUser` |
| Identity access | `src/interfaces/request-context.ts` | Use existing `getCurrentIdentity()` |
| Helm chart | `charts/templates/` | New ClusterRole templates |

### Existing Infrastructure (from PRD #380)

- **UserIdentity**: `{ userId, email, groups, source }` in `src/interfaces/oauth/types.ts`
- **Request context**: AsyncLocalStorage propagation via `getCurrentIdentity()`
- **Kubernetes client**: `@kubernetes/client-node` already a dependency
- **Auth middleware**: Dual-mode (JWT + token) in `src/interfaces/oauth/middleware.ts`

## Dependencies

**External Dependencies:**
- Kubernetes cluster with RBAC enabled

**Internal Dependencies:**
- PRD #380 — UserIdentity, OAuth middleware, request context (must be merged first)

**Dependent PRDs:**
- [PRD #361 (User-Specific Permissions)](./361-user-specific-permissions.md) — depends on RBAC infrastructure from this PRD

## Security Considerations

### Default Deny
- OAuth users without RoleBindings cannot execute any tool
- No "default role" for OAuth users — access must be explicitly granted
- Token users bypass RBAC — this is intentional (shared anonymous access, no user/group to evaluate)

### Privilege Escalation Prevention
- dot-ai's ServiceAccount only gets `create` on `subjectaccessreviews` — it doesn't grant itself tool permissions
- Users cannot escalate beyond their K8s RBAC bindings
- User management restricted to `dotai-admin` ClusterRole

### Audit Trail
- All denied and allowed decisions logged
- Audit logs include user identity, tool, namespace, and timestamp
- Cannot be bypassed at the application layer

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **Custom RBAC engine** | Reinvents what K8s RBAC already provides |
| **OPA / Casbin / Cerbos** | External dependency when K8s RBAC exists natively |
| **Application-level role tables** | Would require a database, doesn't leverage K8s ecosystem |
| **Always-on RBAC (no bypass for tokens)** | Token users have no identity to evaluate — would break CI/CD and non-OAuth clients |

## References

- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [SubjectAccessReview API](https://kubernetes.io/docs/reference/kubernetes-api/authentication-resources/subject-access-review-v1/)
- [PRD #380 - MCP OAuth Authentication & User Identity](./done/380-gateway-auth-rbac.md)

## Related Resources

- **GitHub Issue**: [#392](https://github.com/vfarcic/dot-ai/issues/392)
- **Depends on**: [PRD #380 - MCP OAuth Authentication & User Identity](./done/380-gateway-auth-rbac.md)
- **Dependent PRD**: [PRD #361 - User-Specific Permissions](./361-user-specific-permissions.md)
