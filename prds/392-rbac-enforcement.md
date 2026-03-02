# PRD: Kubernetes RBAC Enforcement & Audit Logging

**Status**: Draft
**Priority**: High
**GitHub Issue**: [#392](https://github.com/vfarcic/dot-ai/issues/392)
**Created**: 2026-03-02
**Last Updated**: 2026-03-02
**Depends on**: [PRD #380 - MCP OAuth Authentication & User Identity](./380-gateway-auth-rbac.md)

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

### SubjectAccessReview Call

```typescript
const review = await k8sApi.createSubjectAccessReview({
    spec: {
        user: identity.userId,
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

The virtual API group `dot-ai.devopstoolkit.ai` requires no CRDs — SubjectAccessReview evaluates RBAC rules as pure string matching.

### Pre-built ClusterRoles

The Helm chart ships pre-built ClusterRoles. Admins only need to create bindings:

| ClusterRole | Tools Allowed | Use Case |
|-------------|---------------|----------|
| `dotai-viewer` | `query`, `version` | Read-only cluster visibility |
| `dotai-operator` | `query`, `version`, `operate`, `remediate` | Day-2 operations |
| `dotai-admin` | All tools + user management | Full access |

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

## Milestones

### Milestone 1: RBAC Enforcement Module
**Objective**: Create the authorization check module and integrate it into tool dispatch.

- [ ] Create `src/core/rbac/` module — SubjectAccessReview helper using `@kubernetes/client-node`
- [ ] Integrate RBAC check into REST API tool dispatch (`rest-api.ts`, before tool handler invocation)
- [ ] Integrate RBAC check into MCP tool handlers (`mcp.ts`)
- [ ] RBAC check on user management endpoints (`POST/GET/DELETE /api/v1/users`)
- [ ] Token users bypass RBAC — only OAuth users are checked
- [ ] Structured error response for denied tool calls (tool name, namespace, user, reason)
- [ ] Integration tests: authorized calls succeed, unauthorized rejected

**Success Criteria:**
- OAuth user without RoleBindings cannot execute any tool
- OAuth user with `dotai-viewer` binding can only use `query` and `version`
- Token users retain full access (no regression)

### Milestone 2: Helm Chart ClusterRoles & ServiceAccount
**Objective**: Ship pre-built ClusterRoles and grant dot-ai's ServiceAccount permission to create SubjectAccessReviews.

- [ ] Add `dotai-viewer`, `dotai-operator`, `dotai-admin` ClusterRoles to Helm templates
- [ ] Add `dotai-auth-checker` ClusterRole (allows `create` on `subjectaccessreviews`) and bind to dot-ai ServiceAccount
- [ ] Helm values for enabling/disabling RBAC enforcement (`rbac.enforcement.enabled`, default `false`)
- [ ] Integration tests: namespace-scoped permissions, group-based RoleBindings

**Success Criteria:**
- `helm install` creates all ClusterRoles
- dot-ai ServiceAccount can create SubjectAccessReviews
- RBAC enforcement can be toggled via Helm values

### Milestone 3: Performance & Caching
**Objective**: Ensure RBAC checks add minimal latency.

- [ ] Evaluate SubjectAccessReview latency under load
- [ ] Implement caching strategy if needed (short TTL, per-request dedup)
- [ ] Performance benchmarks: <10ms p99 for RBAC evaluation

**Success Criteria:**
- SubjectAccessReview adds <10ms latency per request (p99)

### Milestone 4: Audit Logging
**Objective**: Log all authorization decisions for traceability.

- [ ] Log allowed tool invocations with user identity (userId, email, tool, namespace)
- [ ] Log denied tool invocations with reason
- [ ] Log user management operations (who created/deleted which user)
- [ ] Integration tests: verify audit log entries for allowed and denied operations

**Success Criteria:**
- All operations traceable to specific user
- Denied access attempts logged with reason

### Milestone 5: Documentation
**Objective**: Document RBAC setup so admins can configure permissions.

- [ ] Documentation: RBAC concepts (virtual API group, SubjectAccessReview, default deny)
- [ ] Documentation: ClusterRole reference (viewer, operator, admin — what each allows)
- [ ] Documentation: Creating custom Roles and RoleBindings (with examples)
- [ ] Documentation: Namespace-scoped permissions (with examples)
- [ ] Documentation: Group-based bindings (Dex groups → K8s RBAC)
- [ ] Documentation: Troubleshooting denied access

**Success Criteria:**
- Admins can configure RBAC by following documentation alone

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
| MCP tool handlers | `src/interfaces/mcp.ts` | RBAC wrapper in `registerMcpTool()` |
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
- [PRD #380 - MCP OAuth Authentication & User Identity](./380-gateway-auth-rbac.md)

## Related Resources

- **GitHub Issue**: [#392](https://github.com/vfarcic/dot-ai/issues/392)
- **Depends on**: [PRD #380 - MCP OAuth Authentication & User Identity](./380-gateway-auth-rbac.md)
- **Dependent PRD**: [PRD #361 - User-Specific Permissions](./361-user-specific-permissions.md)
