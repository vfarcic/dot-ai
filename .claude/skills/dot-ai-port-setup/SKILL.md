---
name: dot-ai-port-setup
description: Set up Port integrations to sync Kubernetes resources and GitHub Actions to Port.io
user-invocable: true
---

# Setup Port Integrations

Set up Port integrations to sync Kubernetes resources and GitHub Actions to Port.io.

## Prerequisites

Check the following and instruct the user to install/configure if missing:

- **kubectl** - installed and configured with cluster access
- **helm** - installed (for checking chart versions)
- **gh** - GitHub CLI installed and authenticated
- **Environment variables** set:
  - `PORT_CLIENT_ID`
  - `PORT_CLIENT_SECRET`

## General Guidelines

- **Always check latest versions** of third-party tools (Helm charts, GitHub Actions, etc.) before creating manifests. Use `helm search repo` or check the official documentation.
- **Consult Port MCP tools** when in doubt - use them to explore existing blueprints, entities, actions, and integrations.
- **Validate each step** before moving to the next - verify resources are created, synced, and working as expected.
- **User actions vs automated**: Some steps require user action (marked with "User action required") - present these as instructions, then **STOP and wait for user confirmation** before proceeding to the next step.

---

# Step 0: Discover Environment

Before starting, discover what tools are available and gather configuration:

1. **GitOps Tool**: Check for ArgoCD (`argocd` namespace) or Flux (`flux-system` namespace)
2. **ESO**: Check for External Secrets Operator CRD and available ClusterSecretStores
3. **Manifest directory**: Ask the user where manifests should be stored (e.g., `apps/`, `manifests/`, `k8s/`)

| GitOps Tool | Deployment Method | Self-Service Actions |
|-------------|-------------------|---------------------|
| ArgoCD | ArgoCD Application manifests in Git | Commit YAML to Git → ArgoCD syncs |
| Flux | Flux HelmRelease/Kustomization in Git | Commit YAML to Git → Flux syncs |
| Neither | Manifests in Git + `kubectl apply` | Commit YAML to Git → `kubectl apply` |

| ESO Status | Secrets Method |
|------------|----------------|
| Installed with ClusterSecretStore | Use ExternalSecret to pull from secret manager |
| Not installed | Create Secret directly with `kubectl create secret` |

**Note:** Always store manifests in Git for auditability, regardless of GitOps availability.

## GitOps Workflow Rules

**IMPORTANT: When ArgoCD or Flux is detected, NEVER run `kubectl apply` on application manifests.**

Instead, follow this workflow:
1. **Write manifests to Git** - Create the YAML files in the manifest directory
2. **Commit and push** - The GitOps tool will detect changes and sync automatically
3. **Verify sync status** - Use `kubectl get applications -n argocd` (ArgoCD) or `flux get all` (Flux)

For **GitOps resources** (ArgoCD Applications, Flux Kustomizations/HelmReleases):
- Discover the deployment pattern by examining existing resources in the cluster
- Add new manifests to the appropriate watched directory so GitOps syncs them automatically

For **Secrets without ESO**:
- Use `kubectl create secret` directly (secrets cannot be stored unencrypted in Git)

---

# Part 1: Kubernetes Exporter

## Step 1: Create Port Credentials Secret

Create a Secret named `port-credentials` in the `port-k8s-exporter` namespace with keys `PORT_CLIENT_ID` and `PORT_CLIENT_SECRET`.

- **With ESO**: Create an ExternalSecret referencing the available ClusterSecretStore
- **Without ESO**: Create the Secret directly with `kubectl create secret`

## Step 2: Deploy the K8s Exporter

Deploy the `port-k8s-exporter` Helm chart from `https://port-labs.github.io/helm-charts`.

Key Helm values:
- `secret.useExistingSecret: true` and `secret.name: port-credentials`
- `overwriteConfigurationOnRestart: true` (forces use of configMap config)
- `stateKey` and `extraEnv[].CLUSTER_NAME` set to cluster identifier
- `configMap.config` with resource mappings (see Step 4)

Deployment method based on discovery:
- **ArgoCD**: Create ArgoCD Application manifest
- **Flux**: Create HelmRepository + HelmRelease manifests
- **Neither**: Run `helm install` then commit values to Git

## Step 3: Create Blueprints in Port

**Default blueprints** (always created by the exporter):
- `cluster` (Port concept, not a K8s resource)
- `namespace` (from namespaces)
- `workload` (from deployments, daemonsets, statefulsets)

**Discover and recommend:**
1. Run `kubectl api-resources` to list all available resources
2. Exclude resources already covered by defaults (namespaces, deployments, daemonsets, statefulsets)
3. Present findings to the user with recommendations
4. Let user select which additional resources to track

Create selected blueprints using Port MCP tools. All blueprints should have:
- Relation to `namespace` blueprint
- `creationTimestamp` property

## Step 4: Configure Resource Mappings

In the Helm values `configMap.config`, define mappings for the resources selected in Step 3.

**For nested resources** (arrays inside a resource spec), use `itemsToParse`:

```yaml
- kind: your.api/v1/yourresource
  selector:
    query: "true"
  port:
    itemsToParse: .spec.items
    entity:
      mappings:
        - identifier: .item.name + "-" + .metadata.namespace + "-" + env.CLUSTER_NAME
          blueprint: '"child-blueprint"'
          properties:
            name: .item.name
          relations:
            Parent: .metadata.name + "-" + .metadata.namespace + "-" + env.CLUSTER_NAME
```

## Step 5: Configure Blueprint Relations

Analyze exported resources and establish relations:
- Examine ownerReferences to link child → parent resources
- Use selector labels to connect Services → Workloads
- Link Ingress/HTTPRoute → Services via backend references

For each relation:
1. Add the relation to the blueprint in Port
2. Add the corresponding JQ mapping in the exporter config

---

# Part 2: GitHub Integration

Sync GitHub workflows, workflow runs, and pull requests to Port.

## Step 1: Install Port's GitHub App (User action required)

1. Go to Port's Data Sources: https://app.port.io/settings/data-sources
2. Click "+ Data source" → select "GitHub"
3. Install the GitHub App on your account/organization
4. Select repositories to sync
5. Ensure permissions for: actions, checks, pull requests, repository metadata

## Step 2: Create GitHub Blueprints

Create blueprints for `githubWorkflow`, `githubWorkflowRun`, and `githubPullRequest` (if not exists) using Port MCP tools. Inspect integration kinds to determine appropriate properties.

## Step 3: Configure GitHub Integration Mapping

Use Port REST API to update the integration config with mappings for `pull-request`, `workflow`, and `workflow-run` kinds.

## Step 4: Trigger Integration Resync

After creating blueprints, trigger a resync so the integration populates them with data. Use the Port API:

```bash
# Get access token
curl -s -X POST 'https://api.getport.io/v1/auth/access_token' \
  -H 'Content-Type: application/json' \
  -d '{"clientId": "'"$PORT_CLIENT_ID"'", "clientSecret": "'"$PORT_CLIENT_SECRET"'"}' \
  | jq -r '.accessToken' > ./port_access_token.txt

# Trigger resync (replace INTEGRATION_ID with actual ID)
curl -s -X PATCH 'https://api.getport.io/v1/integration/INTEGRATION_ID' \
  -H "Authorization: Bearer $(cat ./port_access_token.txt)" \
  -H 'Content-Type: application/json' \
  -d '{}'

# Cleanup
rm -f ./port_access_token.txt
```

Get the integration ID from `mcp__port-vscode-eu__list_integrations`.

---

# Part 3: Self-Service Actions for CRDs

Create Port self-service actions that trigger GitHub workflows to manage CRD manifests.

## Step 0: Configure GitHub Repository Secrets

Use `gh secret set` to add required secrets:
- `PORT_CLIENT_ID` - Port client ID
- `PORT_CLIENT_SECRET` - Port client secret
- `KUBE_CONFIG` - (Only for non-GitOps) Base64-encoded kubeconfig

## Step 1: Create GitHub Workflows

Create workflow for each CRD with `workflow_dispatch` trigger accepting:
- `action` (create/update/delete)
- `name`, `namespace`
- Resource-specific inputs
- `port_run_id`

**Workflow steps:**
1. Checkout repository
2. Report "RUNNING" status to Port using `port-labs/port-github-action@v1`
3. Create/update/delete manifest in the configured manifest directory
4. Commit and push to Git
5. **Non-GitOps only**: Run `kubectl apply` or `kubectl delete`
6. Report "SUCCESS" or "FAILURE" to Port

## Step 2: Create Port Self-Service Actions

Create 3 actions per CRD using Port MCP tools:

- **CREATE** - Creates new resources (no entity context)
- **DAY-2** - Updates existing resources (has entity context)
- **DELETE** - Deletes resources (has entity context)

**Key template expressions:**
- `{{ .inputs.fieldName }}` - User input value
- `{{ .run.id }}` - Port action run ID
- `{{ .entity.identifier }}` - Entity identifier (for DAY-2/DELETE)
- `{{ .entity.identifier | split("-") | last }}` - Extract resource name from identifier

**For DAY-2 actions**, pre-populate inputs with current entity values:

```json
"default": {
  "jqQuery": ".entity.properties.someField // \"default_value\""
}
```

