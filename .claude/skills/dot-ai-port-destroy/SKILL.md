---
name: dot-ai-port-destroy
description: Remove all Port integrations, Kubernetes resources, and local files created by /port-setup
user-invocable: true
---

# Destroy Port Integrations

Remove all Port integrations, Kubernetes resources, and local files created by `/port-setup`.

## Prerequisites

Check the following and instruct the user to install/configure if missing:

- **kubectl** - installed and configured with cluster access
- **helm** - installed
- **gh** - GitHub CLI installed and authenticated
- **Environment variables** set:
  - `PORT_CLIENT_ID`
  - `PORT_CLIENT_SECRET`

## General Guidelines

- **Confirm with user** before proceeding with deletion
- **Order matters** - stop syncing FIRST, then delete Port resources
- **Check existence** before attempting deletion to avoid errors
- **Consult Port MCP tools** to discover what was created
- **User actions vs automated**: Some steps require user action (marked with "User action required") - present these as instructions, then **STOP and wait for user confirmation** before proceeding to the next step.

---

# Step 0: Discover Environment

Before destroying, discover what exists and how it was deployed:

1. **GitOps Tool**: Check for ArgoCD (`argocd` namespace) or Flux (`flux-system` namespace)
2. **Manifest directory**: Check for Port-related manifests (e.g., `apps/port-*.yaml`)
3. **Port resources**: Use Port MCP tools to list blueprints, entities, actions, integrations
4. **GitHub resources**: Check for workflows (`.github/workflows/port-*.yaml`) and repository secrets

## GitOps Workflow Rules

**IMPORTANT: When ArgoCD or Flux is detected, deletions must go through Git first.**

1. **Delete manifests from Git** - Remove the YAML files from the manifest directory
2. **Commit and push** - The GitOps tool will detect changes and delete resources automatically
3. **Wait for sync** - Verify the resources are deleted before proceeding to Port cleanup
4. **Then delete Port resources** - Only after syncing stops, delete blueprints/entities/actions

This order ensures the exporter stops syncing before you delete resources in Port.

---

# Part 1: Delete Kubernetes Resources (FIRST - stops syncing)

**Critical:** Delete the K8s exporter FIRST to stop new entities from being synced to Port.

## Uninstall Port K8s Exporter

Check deployment method and delete accordingly:

**With ArgoCD/Flux (GitOps):**
1. Delete the manifest file from Git:
```bash
rm <manifest-dir>/port-k8s-exporter.yaml
git add -A && git commit -m "Remove port-k8s-exporter" && git push
```
2. Wait for ArgoCD/Flux to sync and delete the resources
3. Verify: `kubectl get ns port-k8s-exporter` should return not found
4. If namespace still exists after sync, delete it manually: `kubectl delete ns port-k8s-exporter`

**With Helm directly (non-GitOps):**
```bash
helm uninstall port-k8s-exporter -n port-k8s-exporter
kubectl delete secret port-credentials -n port-k8s-exporter
kubectl delete externalsecret port-credentials -n port-k8s-exporter  # if using ESO
kubectl delete namespace port-k8s-exporter
```

---

# Part 2: Delete Port Self-Service Actions

Delete all self-service actions created for CRDs. Do this BEFORE deleting blueprints since actions reference blueprints.

1. Use `mcp__port-vscode-eu__list_actions` to find actions with identifiers matching patterns:
   - `create_*`, `update_*`, `delete_*`
2. For each action, use `mcp__port-vscode-eu__delete_action`

---

# Part 3: Delete Port Blueprints and Entities (User Action Required)

Delete the blueprints created during setup from the Data Model page.

**Steps:**
1. Use `mcp__port-vscode-eu__list_blueprints` to discover which blueprints exist
2. Identify blueprints that were created by `/port-setup` (exclude system blueprints starting with `_` and the defaults: `cluster`, `namespace`, `workload`)
3. Present the list to the user
4. Instruct the user to:
   - Go to [Data Model](https://app.getport.io/settings/data-model)
   - **Tip:** Switch to **Cards** view (top-right toggle) to make it easier to find and delete blueprints
   - For each blueprint, click the "..." menu -> **Delete All [Blueprint Name]**
   - This deletes all entities AND the blueprint in one action

**STOP and wait for user confirmation before proceeding.**

---

# Part 4: Delete GitHub Workflows and Secrets

## Delete Workflow Files

Look for Port-related workflows and delete them:
```bash
rm .github/workflows/port-*.yaml
```

## Delete Repository Secrets

```bash
gh secret delete PORT_CLIENT_ID
gh secret delete PORT_CLIENT_SECRET
gh secret delete KUBE_CONFIG  # if created
```

Commit and push the deletions:
```bash
git add -A && git commit -m "Remove Port self-service workflows" && git push
```

---

# Part 5: Delete GitHub Integration Mapping (Optional)

If user wants to remove GitHub integration:

1. Go to Port Data Sources: https://app.port.io/settings/data-sources
2. Find the GitHub integration
3. Either:
   - Remove specific resource mappings (User action required)
   - Or uninstall the entire GitHub App (User action required)

---

# Verification

After cleanup, verify:

1. **Kubernetes**: `kubectl get ns port-k8s-exporter` returns not found
2. **Port**: No custom blueprints, entities, or actions remain
3. **GitHub**: No Port-related workflows or secrets
4. **Local**: No Port manifests in the repository

