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

Pushing generated manifests to a Git repository is split across both verbs, because one of its two modes mutates and the other proposes — see [Git Push: Direct Push or Pull Request](#git-push-direct-push-or-pull-request).

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

## Git Push: Direct Push or Pull Request

The `recommend` tool's `pushToGit` stage can push generated manifests to a GitOps repository in two modes, and each requires a different verb:

| | Direct push | Pull request |
|--|-------------|--------------|
| **How it's called** | `pushToGit` | `pushToGit` with `pullRequest: true` |
| **Required verb** | **`apply`** on `recommend` | **`execute`** on `recommend` |
| **What it does** | Commits and pushes straight to the target branch | Commits to a server-generated branch and opens a pull request against the target branch, which is never written to |
| **Pros** | One step — the change is on the branch the controller reconciles as soon as the push lands | Needs only `execute`, so viewers can propose changes; the target branch is never written to, so it works against a protected branch |
| **Cons** | Needs `apply`, which also unblocks `deployManifests` — the two cannot be separated; nothing stands between the commit and the controller | Someone still has to merge it; automatic pull request creation is github.com-only, and elsewhere the branch is pushed and you open the PR/MR yourself |
| **Best for** | Trusted operators pushing to an unprotected branch | Review-gated GitOps, protected branches, and any user who holds only `execute` |

In a GitOps deployment a commit on the branch a controller reconciles *is* a cluster change, so direct push carries the same verb as `deployManifests`. Opening a pull request only proposes the change, so `execute` is enough.

A user with `dotai-viewer` therefore gets pull request mode only — and is steered to it rather than discovering the restriction through an error. The `generateManifests` response never offers direct push to them: option 3 becomes "Open a pull request", with `pullRequest: true` listed as a required parameter.

```text
# Example: the options a viewer (execute only) is offered after generateManifests

Manifests generated (Kustomize overlay). Present the user with these options:
1. **Save locally**: Write the files to "./manifests" — no further server call needed, you already have the file contents.
2. **Deploy to cluster**: Not available — requires 'apply' permission on 'recommend'.
3. **Open a pull request** (GitOps): Call the recommend tool with stage: "pushToGit" and pullRequest: true, providing repoUrl and targetPath. Recommended for Argo CD/Flux workflows.
   pullRequest: true is required — committing straight to the branch also needs 'apply'. The head branch is generated by the server; "branch" names the base branch the pull request targets, and is never written to.
```

If a direct push is attempted anyway, it is refused before anything is cloned, committed, or pushed:

```text
Access denied: pushing directly to a Git branch requires 'apply' permission on
'recommend'. Retry with pullRequest: true to open a pull request against the
branch instead, which needs only 'execute'.
```

See [Recommendation Guide - Option: GitOps Pull Request](../tools/recommend.md#option-gitops-pull-request) for the parameters and response shape.

### What This Gate Does and Does Not Enforce

If you are using this gate to force a pull-request-only workflow, it depends on four conditions. Each one is an operator responsibility that the server cannot verify for you — but they do not fail the same way, and the difference matters when you go looking for them. Three of them (1, 3, and 4) fail **open**: leave one unmet and a user you believe is restricted to pull requests still has direct push. The fourth (2) fails **closed**: it does not hand direct push back, it takes *both* modes away and looks like a broken deployment rather than a bypass. Check all four, for opposite reasons:

**1. Kubernetes RBAC is additive, never subtractive.** A `dotai-viewer` binding does not *remove* `apply` — it merely fails to grant it. A user who is also bound to `dotai-operator`, `dotai-admin`, or any custom role granting `apply` anywhere in the cluster gets the union of all of them, and direct push is available to them again. Forcing pull request mode therefore requires auditing that *no* broader binding exists for that user or any of their groups, not just adding a narrow one. **This is the most likely way to believe you are protected and not be.**

Don't audit by reading bindings — ask Kubernetes the same question the server asks. Create a SubjectAccessReview with no namespace (the server's check is cluster-scoped), and **fill in the user's groups**: the server sends `user` and `groups` together on every check, so an audit that sends only the user is not asking the same question.

```yaml
apiVersion: authorization.k8s.io/v1
kind: SubjectAccessReview
spec:
  user: alice@example.com
  # Required — not a placeholder to leave empty. List every group the identity
  # provider puts in the user's token (see Group-Based Bindings above). An empty
  # list asks Kubernetes about a user who belongs to no groups at all.
  groups:
    - platform-team
    - engineering
  resourceAttributes:
    group: dot-ai.devopstoolkit.ai
    resource: tools
    name: recommend
    verb: apply
```

```bash
kubectl create --filename can-push-directly.yaml \
  --output jsonpath='{.status.allowed}{"\n"}{.status.reason}{"\n"}'
```

`true` means the user can still push directly, and the reason names the binding that allows it — which is how you find the broader binding this limit warns about. A binding to the user names her:

```text
true
RBAC: allowed by ClusterRoleBinding "dot-ai-operator-users" of ClusterRole "dotai-operator" to User "alice@example.com"
```

A binding to one of her groups names the group instead:

```text
true
RBAC: allowed by ClusterRoleBinding "dot-ai-operator-group" of ClusterRole "dotai-operator" to Group "platform-team"
```

`false` means direct push is refused and pull request mode is the only path available to that user — **but only if you listed her groups**. Run the same check against that same group binding with `groups: []` and it answers:

```text
false
```

That is a false negative on exactly the binding this audit exists to catch, and nothing in the output hints at it: an allowed check explains itself in `reason`, a denied one comes back bare. If you cannot enumerate a user's groups — some identity providers omit them unless configured, see [Group-Based Bindings](#group-based-bindings) — treat a `false` as inconclusive rather than as a pass.

**2. The binding must be cluster-scoped — and this is the one that fails closed.** The permission check carries no namespace, so a namespaced `RoleBinding` never satisfies it. It does not leave the user with direct push; it leaves them with **nothing**. `apply` and `execute` are both denied, so pull request mode is gone along with direct push and every other tool refuses too — the symptom is [User gets "Access Denied" for all tools](#user-gets-access-denied-for-all-tools), never an unexpected push. Unlike limits 1, 3, and 4, no additive binding, static token, or disabled enforcement is involved: the permission was simply never granted where the server looks for it. Use `ClusterRoleBinding`, as shown in [Assigning Roles to Users](#assigning-roles-to-users).

**3. Static token users bypass RBAC entirely.** Any caller presenting `DOT_AI_AUTH_TOKEN` is allowed unconditionally and bindings are irrelevant to it. The gate covers OAuth end users only — automation, CI jobs, or UI paths authenticating with the static token retain direct push no matter how the ClusterRoleBindings are written. If pull-request-only is a requirement, the static token has to be disabled or restricted to callers you trust with direct push.

**4. `rbac.enforcement.enabled` must be `true`.** It defaults to `false`, and while it is off every authenticated user has full access — this check is a no-op along with every other one in this document.

### Upgrading: Direct Git Push Now Requires `apply`

**This is a breaking change.** Previously, `execute` on `recommend` was sufficient to push manifests to Git; direct push now requires `apply`.

- **Who is affected**: deployments with `rbac.enforcement.enabled: true` whose users push to Git with a viewer-level (execute-only) binding. Those pushes **stop working on upgrade**. Deployments that never enabled enforcement are unaffected, since the value defaults to `false`.
- **What to do**: adopt pull request mode — add `pullRequest: true` to the `pushToGit` call. No binding change is needed, and agents are told to do this automatically once they see the execute-only option list above.
- **What not to do**: granting `apply` to restore direct push **also unblocks `deployManifests`**, which is usually the opposite of what a GitOps-only deployment wants. The two cannot be separated (see the limitations below).

### Upgrading: Pushing to a Non-GitHub Host Now Requires an Allowlist Entry

**This is a second, independent breaking change in the same release.** The `pushToGit` stage now checks the repository's host against the `gitops.allowedRepoHosts` Helm value, which defaults to `["github.com"]`.

- **Who is affected**: deployments that push to a GitLab, Bitbucket, or self-hosted Git host. Those pushes — **direct push and pull request mode alike** — stop working on upgrade until an operator adds the host. Deployments that push only to github.com are unaffected by the default. Also affected, on any host: a `repoUrl` that is not an `https://` URL, since `https:` is the only scheme the server will attach its credential to.
- **What to do**: depends on which half you tripped, and the error says which. An unlisted **host** is an operator change — add it to `gitops.allowedRepoHosts`; no client, binding, or credential change is involved. A `repoUrl` that is not `https://` is a **client** change instead — re-issue the call with the repository's HTTPS clone URL; no chart value will fix it. Neither is a binding or credential change. See [GitOps Repository Host Allowlist](deployment.md#gitops-repository-host-allowlist) for matching rules (`https://` only, exact hostnames, no wildcards) and the empty-list semantics.
- **Unrelated to RBAC.** This gate is not a permission check and is not affected by `rbac.enforcement.enabled`. It applies to every caller, including static-token callers who bypass RBAC entirely, and it applies whether enforcement is on or off.

**Why it is a different control from everything else in this guide.** RBAC protects your **cluster**: it decides which users may push at all and by which route. The allowlist protects the **server's Git credential**: `repoUrl` comes from the caller, and the server attaches `DOT_AI_GIT_TOKEN` (or a GitHub App installation token) to whatever URL it is given, so before this release any caller who could reach the `pushToGit` stage could name a host they control and have that credential delivered to it — and left behind in that clone's `.git/config`. Note what that means for the RBAC gate above: pull request mode requires only `execute`, so the set of users who can supply a `repoUrl` is deliberately the *wider* one. The two controls compose and neither substitutes for the other — a user with `apply` still cannot push to an unlisted host, and listing a host grants nobody permission to push.

### What Pull Request Mode Actually Guarantees

Be precise about what `execute` plus pull request mode buys you: **a human must take an action** before the change reaches the cluster. It does **not** guarantee that a second human reviews it.

The review guarantee comes from the repository, not from dot-ai. Against a repository with no branch protection, or one where auto-merge is configured on the GitHub side, pull request mode is direct push by a slower route. If review is the actual requirement, enforce it where it is enforceable: branch protection or an organization ruleset that requires a pull request, required status checks, required approvals, and no auto-merge.

### Limitations Worth Knowing Before You Plan Around This

- **`apply` is all-or-nothing across tools in the shipped roles.** `dotai-operator` and `dotai-admin` grant `apply` on `tools` with no `resourceNames`, so granting `apply` for one tool grants it for all of them. For per-tool granularity, write a custom `resourceNames`-scoped ClusterRole as shown in [Custom Roles](#custom-roles).
- **`deployManifests` and direct Git push cannot be separated.** Both are `apply` on `recommend`, so no binding can permit one and deny the other. A team that wants operators to keep deploying directly to the cluster while being barred from direct Git push cannot be served by RBAC as it is designed today.
- **Binding changes need a client reconnect.** MCP clients register tools at session startup, so a change to a user's bindings only takes effect after the client disconnects and reconnects — see [RBAC changes don't take effect in MCP client](#rbac-changes-dont-take-effect-in-mcp-client).

## Troubleshooting

### User gets "Access Denied" for all tools

The user has no ClusterRoleBinding. Check their bindings:

```bash
kubectl get clusterrolebindings --output wide | grep "alice@example.com"
```

If no results, create a binding as shown in [Assigning Roles to Users](#assigning-roles-to-users).

### User can query but can't deploy

The user has `dotai-viewer` (which grants `execute`) but not `dotai-operator` (which adds `apply`). Either upgrade their binding to `dotai-operator`, or create an additional `dotai-operator` binding — permissions are additive.

### User can generate manifests but can't push them to Git

The user has `execute` but not `apply` on `recommend`, so only pull request mode is available to them:

```text
Access denied: pushing directly to a Git branch requires 'apply' permission on
'recommend'. Retry with pullRequest: true to open a pull request against the
branch instead, which needs only 'execute'.
```

Retrying with `pullRequest: true` is the intended resolution — see [Git Push: Direct Push or Pull Request](#git-push-direct-push-or-pull-request). Granting `apply` also grants `deployManifests`, so widen the binding only if you intend that too.

### Git push fails with "Repository host … is not allowed"

This is **not** an RBAC problem — no binding change will fix it, and it happens with enforcement disabled too. The repository's host is not in `gitops.allowedRepoHosts`, which defaults to `["github.com"]`:

```text
Repository host "gitlab.example.com" is not allowed. Currently allowed: github.com.
To allow it, add the host to the "gitops.allowedRepoHosts" Helm value
(default: github.com) and restart the server.
```

Add the host to the value as shown in [GitOps Repository Host Allowlist](deployment.md#gitops-repository-host-allowlist). Note that both push modes are refused, so switching to `pullRequest: true` does not work around it.

If the message names the URL's **scheme** or its shorthand form rather than its host, this is not your entry — see the next one, and do not add a host.

### Git push fails with "Repository URL scheme … is not allowed"

Also not an RBAC problem — and **not** an allowlist problem either, so no chart value fixes it. `repoUrl` must be the repository's `https://` clone URL, because `https:` is the only scheme the server will attach its Git credential to:

```text
Repository URL scheme "ssh://" is not allowed. Use an https:// URL: it is the only
scheme that can carry the server's git credential safely — http sends it in
cleartext, and ssh/git URLs would pass it as an SSH username.
```

The scp-style shorthand (`github.com:org/repo.git`) reports itself separately, with the same guidance:

```text
Repository URLs must be written in full, not in the scp-style "host:path"
shorthand. Use an https:// URL: it is the only scheme that can carry the server's
git credential safely — http sends it in cleartext, and ssh/git URLs would pass it
as an SSH username.
```

Both are client-side fixes: re-issue the `pushToGit` call with the HTTPS clone URL. Adding the host to `gitops.allowedRepoHosts` changes nothing here — the message deliberately does not mention the allowlist, because the host may well be listed already.

### RBAC changes don't take effect in MCP client

MCP clients register tools at session startup. Permission changes require disconnecting and reconnecting the MCP client.

### Static token user appears restricted

Static token users always bypass RBAC. If a token user appears restricted, the issue is not RBAC — verify the `DOT_AI_AUTH_TOKEN` value matches and the request includes the `Authorization: Bearer <token>` header.

## See Also

- **[Authentication](authentication.md)** — Configure OAuth and static token authentication
- **[Identity Provider Connectors](connectors.md)** — Connect Google, GitHub, LDAP, or SAML for group-based RBAC
- **[Deployment Guide](deployment.md)** — Install the AI Engine with RBAC enabled
