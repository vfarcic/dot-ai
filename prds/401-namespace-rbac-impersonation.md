# PRD: Kubernetes User Impersonation for Namespace-Level RBAC Enforcement

**Status**: Draft
**Priority**: High
**GitHub Issue**: [#401](https://github.com/vfarcic/dot-ai/issues/401)
**Created**: 2026-03-10
**Last Updated**: 2026-03-10
**Depends on**: [PRD #392 - Kubernetes RBAC Enforcement & Audit Logging](./392-rbac-enforcement.md)

---

## Problem Statement

PRD #392 delivered tool-level RBAC — controlling *which tools* a user can invoke. However, all kubectl commands still execute using dot-ai's shared ServiceAccount. A user with `dotai-viewer` can query resources in any namespace because the underlying kubectl calls run with the SA's full cluster permissions.

There is no namespace-level enforcement: "can this user see pods in `production`?" is not checked. The tool-level gate answers "can this user use `query`?" but not "can this user query *this namespace*?"

## Proposed Solution

Use [Kubernetes user impersonation](https://kubernetes.io/docs/reference/access-authn-authz/authentication/#user-impersonation) so kubectl commands execute as the authenticated user, not the shared ServiceAccount. When enabled, dot-ai appends `--as=<email> --as-group=<group>` flags to all kubectl invocations for OAuth users. Kubernetes itself enforces namespace-level access — no application-level filtering needed.

### How It Works

1. OAuth user invokes a tool (e.g., `query` targeting namespace `production`)
2. Tool-level RBAC check passes (PRD #392 — unchanged)
3. `UserIdentity` is threaded from request context through the plugin invocation payload to the kubectl execution layer
4. `executeKubectl()` appends `--as=user@email.com --as-group=team-a` to the kubectl command
5. Kubernetes API server evaluates the impersonated user's RBAC bindings
6. If the user has access to the namespace — command succeeds with scoped results
7. If denied — Kubernetes returns a 403, surfaced to the user

**Static token users** are unaffected — no identity means no `--as` flags, kubectl runs as the SA (full access, backward-compatible).

### Identity Threading

Currently, identity stops at the RBAC check layer. This PRD threads it through:

```
Request (MCP/REST)
  → RequestContext (AsyncLocalStorage) — identity available [exists today]
  → checkToolAccess() — tool-level RBAC [exists today, PRD #392]
  → plugin-client.ts invoke() — add identity to InvokePayload [NEW]
  → agentic-tools invoke hook — pass identity to tool handlers [NEW]
  → executeKubectl() — append --as/--as-group flags [NEW]
```

### Impersonation Flags

```bash
# Without impersonation (current behavior, token users, or feature disabled)
kubectl get pods -n production

# With impersonation (OAuth user, feature enabled)
kubectl get pods -n production --as=viktor@farcic.com --as-group=platform-team --as-group=sre
```

### ServiceAccount Permission

dot-ai's SA needs `impersonate` permission on `users` and `groups`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: dotai-impersonator
rules:
  - apiGroups: [""]
    resources: ["users", "groups"]
    verbs: ["impersonate"]
```

This follows the same pattern as the existing `dotai-auth-checker` ClusterRole + binding — an SA operational requirement shipped with the Helm chart. The ClusterRole and its binding to the SA are conditional on the feature being enabled.

### Helm Configuration

```yaml
rbac:
  enforcement:
    enabled: false          # Tool-level RBAC (PRD #392)
  impersonation:
    enabled: false          # Namespace-level impersonation (this PRD)
```

Impersonation is disabled by default. When disabled, kubectl runs as the SA with full cluster access (current behavior). Enabling impersonation requires that `rbac.enforcement.enabled` is also `true` (impersonation without tool-level RBAC doesn't make sense).

### Key Design Principles

1. **Kubernetes enforces access** — not the application. A bug in dot-ai can't leak cross-namespace access because the API server rejects the impersonated request.
2. **No post-fetch filtering** — `query` results are naturally scoped to what the impersonated user can see.
3. **Standard kubectl flags** — works with shell subprocess execution, no need to switch to client-library calls.
4. **Opt-in** — disabled by default, zero impact on existing deployments.
5. **Token users unaffected** — no identity = no impersonation flags = SA's full permissions.
6. **Admins use standard K8s RBAC** — same Role/RoleBinding/ClusterRoleBinding they already know for namespace scoping.

---

## Milestones

### Milestone 1: Identity Threading Through Plugin Layer
**Objective**: Propagate `UserIdentity` from request context to kubectl tool handlers.

- [ ] Add `identity` field to `InvokePayload` in plugin-client
- [ ] Pass identity from `RequestContext` when invoking plugin tools
- [ ] Receive and forward identity in agentic-tools invoke hook to tool handlers
- [ ] Integration tests: identity reaches tool handler layer (with and without identity)

**Success Criteria:**
- Tool handlers receive `UserIdentity` when available
- Token users (no identity) still work without regression
- No behavior change yet — identity is threaded but not used

### Milestone 2: kubectl Impersonation Flag Injection
**Objective**: Append `--as`/`--as-group` flags to kubectl commands when impersonation is enabled.

- [ ] Add impersonation flag logic to `executeKubectl()` in base tool — append `--as=<email>` and `--as-group=<group>` for each group when identity is present and impersonation is enabled
- [ ] Add `DOT_AI_RBAC_IMPERSONATION_ENABLED` env var check (default `false`)
- [ ] Ensure no flags appended when: feature disabled, token user, no identity
- [ ] Integration tests: kubectl commands include correct impersonation flags when enabled
- [ ] Integration tests: namespace-scoped access works (user with namespace Role can access that namespace, denied for others)

**Success Criteria:**
- OAuth user's kubectl commands run as their identity, not the SA
- Namespace access governed by the user's K8s RBAC bindings
- Feature disabled by default with no behavior change

### Milestone 3: Helm Chart — Impersonation ClusterRole & Configuration
**Objective**: Ship impersonator ClusterRole + binding and Helm values for enabling impersonation.

- [ ] Add `dotai-impersonator` ClusterRole (impersonate on users and groups) and ClusterRoleBinding to SA, conditional on `rbac.impersonation.enabled`
- [ ] Add `rbac.impersonation.enabled` Helm value (default `false`)
- [ ] Set `DOT_AI_RBAC_IMPERSONATION_ENABLED` env var on deployment from Helm value
- [ ] Integration tests: Helm template renders correctly with impersonation enabled/disabled

**Success Criteria:**
- `helm install` with impersonation enabled creates impersonator ClusterRole + binding
- `helm install` with impersonation disabled creates neither
- SA can impersonate users when enabled

### Milestone 4: Error Handling & User Experience
**Objective**: Surface Kubernetes 403 errors as clear, actionable messages.

- [ ] Catch and parse Kubernetes 403 responses from impersonated kubectl calls
- [ ] Return structured error: user, namespace, action attempted, and guidance (e.g., "Ask your admin to create a RoleBinding for you in namespace X")
- [ ] Audit log impersonation denials (extend PRD #392 audit logger)
- [ ] Integration tests: denied access returns structured error, not raw kubectl stderr

**Success Criteria:**
- Users understand why access was denied and what to do about it
- Denied impersonation attempts are audit-logged

### Milestone 5: Documentation
**Objective**: Document impersonation setup for admins.

- [ ] Documentation: impersonation concepts (how it works, relationship to tool-level RBAC)
- [ ] Documentation: enabling impersonation (Helm values, prerequisites)
- [ ] Documentation: namespace-scoped permissions with examples (Role + RoleBinding per namespace)
- [ ] Documentation: troubleshooting impersonation errors

**Success Criteria:**
- Admins can enable and configure impersonation by following documentation alone

### Milestone 6: Update PRD #392 Open Design Decision
**Objective**: Resolve the open design decision in PRD #392 now that this PRD exists.

- [ ] Update PRD #392 "Namespace & Resource-Level Enforcement Strategy" section to reference this PRD as the chosen approach (Option C: Impersonation)
- [ ] Update deferred Milestone 6 item (namespace-scoped permissions documentation) to reference this PRD

**Success Criteria:**
- PRD #392 open design decision is resolved with a clear pointer to this PRD

---

## Success Criteria

### Must Have

- [ ] OAuth user kubectl commands execute with impersonation flags
- [ ] Kubernetes enforces namespace-level access based on user's RBAC bindings
- [ ] Token users bypass impersonation (backward-compatible)
- [ ] Feature disabled by default (opt-in via Helm value)
- [ ] Structured error messages for impersonation denials
- [ ] Audit logging of impersonation denials
- [ ] Integration tests covering namespace-scoped access scenarios
- [ ] Documentation for enabling and configuring impersonation

### Success Metrics

- Namespace-restricted users cannot access resources outside their namespaces
- No regression for token users or when feature is disabled
- Impersonation adds no measurable latency (flags are appended locally, Kubernetes evaluates)

## Technical Scope

### Modified Modules

| Location | File | What Changes |
|----------|------|-------------|
| Plugin client | `src/core/plugin-client.ts` | Add `identity` to `InvokePayload` |
| Plugin invoke hook | `packages/agentic-tools/src/hooks/invoke.ts` | Forward identity to tool handlers |
| kubectl base | `packages/agentic-tools/src/tools/base.ts` | Append `--as`/`--as-group` in `executeKubectl()` |
| Helm chart | `charts/templates/rbac-enforcement.yaml` | Add impersonator ClusterRole + binding |
| Helm values | `charts/values.yaml` | Add `rbac.impersonation.enabled` |
| Audit logger | `src/core/rbac/audit-logger.ts` | Log impersonation denials |

### Existing Infrastructure (from PRD #380 and #392)

- **UserIdentity**: `{ userId, email, groups, source }` in `src/interfaces/oauth/types.ts`
- **Request context**: AsyncLocalStorage propagation via `getCurrentIdentity()`
- **RBAC module**: Tool-level SubjectAccessReview checks in `src/core/rbac/check-access.ts`
- **Audit logger**: Authorization decision logging in `src/core/rbac/audit-logger.ts`
- **kubectl execution**: Shell subprocess in `packages/agentic-tools/src/tools/base.ts`

## Dependencies

**External Dependencies:**
- Kubernetes cluster with RBAC enabled
- Cluster must support user impersonation (standard in all supported K8s versions)

**Internal Dependencies:**
- PRD #380 — UserIdentity, OAuth middleware, request context
- PRD #392 — Tool-level RBAC enforcement, audit logging, Helm ClusterRoles

## Security Considerations

### Impersonation Permission
- dot-ai's SA gets `impersonate` on `users` and `groups` — a powerful but necessary permission
- Scoped to the SA only, and only when the feature is enabled
- Same trust model as the SA having `create` on `subjectaccessreviews` (PRD #392)

### Defense in Depth
- **Layer 1**: Tool-level RBAC via SubjectAccessReview (PRD #392) — "can you use this tool?"
- **Layer 2**: Namespace-level enforcement via impersonation (this PRD) — "can you access this namespace?"
- Both layers are independent — even if one is bypassed, the other still enforces

### Token User Security
- Token users bypass both layers (no identity to impersonate)
- This is intentional — token access is for CI/CD and non-OAuth clients
- Admins control token access by managing the static token itself

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| **SubjectAccessReview for namespaces (Virtual RBAC)** | Application-level only — a bug leaks full SA access; requires post-fetch filtering for queries |
| **Per-user kubeconfig** | Massive operational burden — creating/managing per-user SAs and credentials |
| **Hybrid (Virtual RBAC + Impersonation)** | Effectively the same as impersonation alone since tool-level RBAC already exists from PRD #392 |

## References

- [Kubernetes User Impersonation](https://kubernetes.io/docs/reference/access-authn-authz/authentication/#user-impersonation)
- [PRD #392 - Kubernetes RBAC Enforcement & Audit Logging](./392-rbac-enforcement.md)
- [PRD #380 - MCP OAuth Authentication & User Identity](./done/380-gateway-auth-rbac.md)

## Related Resources

- **GitHub Issue**: [#401](https://github.com/vfarcic/dot-ai/issues/401)
- **Depends on**: [PRD #392 - RBAC Enforcement](./392-rbac-enforcement.md), [PRD #380 - OAuth Authentication](./done/380-gateway-auth-rbac.md)
