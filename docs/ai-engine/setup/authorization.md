---
sidebar_position: 4
---

# Authorization (RBAC)

**Control what each user can do with Kubernetes-native role-based access control.**

## Overview

**What it does**: Restricts which tools each user can access and whether they can perform mutations (deployments, remediations, data changes). Permissions are managed with standard Kubernetes Roles and RoleBindings — the same way you manage access to any Kubernetes resource.

**Use when**: You have multiple users with different permission levels — for example, some users should only query the cluster while others can deploy changes.

**Prerequisites**: [OAuth authentication](authentication.md#oauth) must be enabled. RBAC requires individual user identity, which only OAuth provides.

**Key behaviors**:

- **Default deny** — OAuth users without any RoleBindings cannot access any tools
- **Static token users are unaffected** — they retain full access to all tools, same as before
- **Standard Kubernetes RBAC** — manage permissions with `kubectl`, Roles, and RoleBindings you already know

## Enabling RBAC

Set `rbac.enforcement.enabled: true` in your Helm values:

```yaml
dex:
  enabled: true          # OAuth required for RBAC

rbac:
  enforcement:
    enabled: true         # Enable authorization checks
```

Or via `--set` during install/upgrade:

```bash
helm upgrade dot-ai-mcp oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:$DOT_AI_VERSION \
  --set dex.enabled=true \
  --set rbac.enforcement.enabled=true \
  # ... other settings
  --namespace dot-ai
```

When enabled, the Helm chart automatically creates three pre-built ClusterRoles (`dotai-viewer`, `dotai-operator`, `dotai-admin`) and grants the AI Engine's ServiceAccount permission to evaluate authorization.

When disabled (default), all authenticated users have full access — no authorization checks are performed.

## Pre-built ClusterRoles

The Helm chart ships three ClusterRoles that cover common permission levels. They match **all tools** automatically — no updates needed when new tools are added.

| ClusterRole | Verbs | What Users Can Do |
|-------------|-------|-------------------|
| `dotai-viewer` | `execute` | Use any tool for read-only operations — query, plan, investigate, search |
| `dotai-operator` | `execute`, `apply` | Everything viewers can do, plus perform mutations — deploy, remediate, create/delete data |
| `dotai-admin` | `execute`, `apply` + user management | Everything operators can do, plus create and delete users |

Two verbs control all permissions:

- **`execute`** — use tools from any access method (MCP, CLI, Web UI) for non-mutating operations
- **`apply`** — perform mutations through those tools (deployments, remediations, data changes)

When a viewer attempts a mutation, they still get the analysis but execution is blocked. Here's an example of a viewer asking to scale a deployment:

```text
# Example: viewer attempts to scale a deployment

The operation was analyzed successfully, but your user doesn't have apply
permission on operate, so it can't be executed via MCP directly.

You can apply it manually:
kubectl patch deployment/silly-demo -n a-team -p '{"spec":{"replicas":2}}'
```

## Assigning Roles to Users

Create a ClusterRoleBinding to grant a user cluster-wide access. The `subjects[].name` must match the user's **email address** from OAuth — the same email shown when checking identity with the `version` tool.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: dot-ai-viewer-users
subjects:
  - kind: User
    name: alice@example.com
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: dotai-viewer
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply --filename dot-ai-viewer-users.yaml
```

To grant the same role to multiple users, add them as subjects:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: dot-ai-operator-users
subjects:
  - kind: User
    name: alice@example.com
    apiGroup: rbac.authorization.k8s.io
  - kind: User
    name: bob@example.com
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: dotai-operator
  apiGroup: rbac.authorization.k8s.io
```

## Group-Based Bindings

Instead of binding individual users, bind groups from your identity provider. Groups are defined in your IdP (Google Workspace groups, GitHub teams, LDAP groups, etc.) and passed through to Kubernetes via Dex.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: dot-ai-admin-group
subjects:
  - kind: Group
    name: platform-team
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: dotai-admin
  apiGroup: rbac.authorization.k8s.io
```

Any user whose identity provider assigns them to the `platform-team` group gets admin access. Configure group mappings in your [identity provider connector](connectors.md).

> **Note**: Not all identity providers return groups by default. For example, Google requires additional configuration (service account with domain-wide delegation) to include group memberships. Check your connector's documentation in the [Dex Connector Reference](https://dexidp.io/docs/connectors/).

## Custom Roles

The pre-built ClusterRoles grant access to all tools. For fine-grained control, create custom ClusterRoles that restrict access to specific tools using `resourceNames`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: dotai-query-only
rules:
  - apiGroups: ["dot-ai.devopstoolkit.ai"]
    resources: ["tools"]
    resourceNames: ["query", "version"]
    verbs: ["execute"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: dot-ai-query-only-users
subjects:
  - kind: User
    name: alice@example.com
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: dotai-query-only
  apiGroup: rbac.authorization.k8s.io
```

This grants Alice access only to the `query` and `version` tools — all other tools are denied.

> **Note**: Kubernetes RBAC is additive — permissions from all bindings are combined, never subtracted. If Alice has both `dotai-query-only` and `dotai-viewer` bindings, she gets the union of both. To restrict a user to specific tools, ensure they only have the custom role binding and not a broader one like `dotai-viewer`.

## Troubleshooting

### User gets "Access Denied" for all tools

The user has no ClusterRoleBinding. Check their bindings:

```bash
kubectl get clusterrolebindings --output wide | grep "alice@example.com"
```

If no results, create a binding as shown in [Assigning Roles to Users](#assigning-roles-to-users).

### User can query but can't deploy

The user has `dotai-viewer` (which grants `execute`) but not `dotai-operator` (which adds `apply`). Either upgrade their binding to `dotai-operator`, or create an additional `dotai-operator` binding — permissions are additive.

### RBAC changes don't take effect in MCP client

MCP clients register tools at session startup. Permission changes require disconnecting and reconnecting the MCP client.

### Static token user appears restricted

Static token users always bypass RBAC. If a token user appears restricted, the issue is not RBAC — verify the `DOT_AI_AUTH_TOKEN` value matches and the request includes the `Authorization: Bearer <token>` header.

## See Also

- **[Authentication](authentication.md)** — Configure OAuth and static token authentication
- **[Identity Provider Connectors](connectors.md)** — Connect Google, GitHub, LDAP, or SAML for group-based RBAC
- **[Deployment Guide](deployment.md)** — Install the AI Engine with RBAC enabled
