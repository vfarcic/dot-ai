# Git Push Integration for GitOps Workflows

This guide explains how to use the `pushToGit` stage in the recommend tool to enable GitOps workflows with Argo CD, Flux, and other GitOps controllers.

## Overview

The `pushToGit` stage allows you to push generated Kubernetes manifests directly to a Git repository, enabling continuous deployment through GitOps patterns.

## Workflow

```
recommend → chooseSolution → answerQuestion → generateManifests → pushToGit
```

## Usage

### Basic Push

```json
{
  "stage": "pushToGit",
  "solutionId": "sol-1234567890-abc12345",
  "repoUrl": "https://github.com/your-org/gitops-repo.git",
  "targetPath": "apps/postgresql/"
}
```

### With Custom Options

```json
{
  "stage": "pushToGit",
  "solutionId": "sol-1234567890-abc12345",
  "repoUrl": "https://github.com/your-org/gitops-repo.git",
  "targetPath": "apps/postgresql/",
  "branch": "main",
  "commitMessage": "Add PostgreSQL production deployment",
  "authorName": "DevOps Bot",
  "authorEmail": "bot@example.com"
}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `stage` | Yes | Must be `"pushToGit"` |
| `solutionId` | Yes | Solution ID from generateManifests stage |
| `repoUrl` | Yes | Git repository URL (HTTPS only) |
| `targetPath` | Yes | Path within repository for manifests (e.g., `"apps/postgresql/"`) |
| `branch` | No | Git branch (default: `"main"`) |
| `commitMessage` | No | Commit message (default: `"Add {intent} manifests"`) |
| `authorName` | No | Git author name |
| `authorEmail` | No | Git author email |

## Response

```json
{
  "success": true,
  "status": "manifests_pushed",
  "solutionId": "sol-1234567890-abc12345",
  "gitPush": {
    "repoUrl": "https://github.com/your-org/gitops-repo.git",
    "path": "apps/postgresql",
    "branch": "main",
    "commitSha": "abc123def456789",
    "filesPushed": ["apps/postgresql/deployment.yaml", "apps/postgresql/service.yaml"],
    "pushedAt": "2026-03-10T12:00:00.000Z"
  },
  "gitopsMessage": "Manifests pushed successfully. Your GitOps controller (Argo CD/Flux) will sync these changes automatically.",
  "visualizationUrl": "https://ui.dot-ai.dev/v/sol-1234567890-abc12345"
}
```

## GitOps Controller Setup

### Argo CD

1. Create an Application pointing to your manifests directory:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: postgresql
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/your-org/gitops-repo.git
    targetRevision: main
    path: apps/postgresql
  destination:
    server: https://kubernetes.default.svc
    namespace: postgresql
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

2. Argo CD will automatically sync when manifests are pushed.

### Flux

1. Create a Kustomization pointing to your manifests:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: postgresql
  namespace: flux-system
spec:
  interval: 5m
  path: ./apps/postgresql
  sourceRef:
    kind: GitRepository
    name: flux-system
  prune: true
  wait: true
  timeout: 2m
```

2. Flux will reconcile on the configured interval after manifests are pushed.

## Authentication

### Personal Access Token (PAT)

Set the `DOT_AI_GIT_TOKEN` environment variable:

```bash
export DOT_AI_GIT_TOKEN="ghp_your_token_here"
```

**Required scopes:**
- `repo` (for private repositories)
- `public_repo` (for public repositories)

### GitHub App

Configure GitHub App authentication for enterprise use:

```bash
export GITHUB_APP_ENABLED="true"
export GITHUB_APP_ID="123456"
export GITHUB_APP_PRIVATE_KEY="$(cat private-key.pem)"
```

**Required permissions:**
- Contents: Read and Write
- Pull requests: Write (optional, for PR creation)

## Security Considerations

1. **Credential Protection**: Repository URLs are scrubbed of credentials in logs
2. **Path Traversal**: Target paths are validated to prevent directory traversal
3. **Branch Validation**: Only specified branches are pushed to
4. **Token Scoping**: Use minimal required token permissions

## Error Handling

The tool provides detailed error messages with remediation steps:

### Authentication Errors

```
No Git authentication configured. Set DOT_AI_GIT_TOKEN or configure GitHub App.
```

**Solution**: Set the `DOT_AI_GIT_TOKEN` environment variable.

### Repository Access Errors

```
Failed to clone repository: Repository not found
```

**Solution**: Verify repository URL and token permissions.

### Push Errors

```
Failed to push to repository: Permission denied
```

**Solution**: Ensure token has write access to the repository.

## Helm Chart Support

For Helm-based solutions, the tool pushes `values.yaml` instead of raw manifests:

```json
{
  "gitPush": {
    "filesPushed": ["apps/postgresql/values.yaml"]
  }
}
```

This integrates with Helm-based GitOps patterns where Argo CD/Flux apply the chart with your custom values.

## Best Practices

1. **Directory Structure**: Organize manifests by application/environment
   ```
   apps/
   ├── postgresql/
   │   ├── deployment.yaml
   │   ├── service.yaml
   │   └── configmap.yaml
   └── redis/
       └── ...
   ```

2. **Branch Strategy**: Use feature branches for changes, main for production

3. **Commit Messages**: Use descriptive commit messages that include the application name and change type

4. **Access Control**: Use GitHub Apps for production, PATs for development

5. **Validation**: Run `generateManifests` with validation before pushing

## Troubleshooting

### Manifests not syncing

1. Check GitOps controller logs
2. Verify repository access from cluster
3. Confirm path matches Application/Kustomization configuration

### Authentication failures

1. Verify token is not expired
2. Check token has required scopes
3. Test token with `git clone` manually

### Push conflicts

1. Pull latest changes first
2. Use unique target paths per application
3. Consider using branches for isolation
