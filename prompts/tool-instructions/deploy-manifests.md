# Deploy Manifests Tool Instructions

## Tool Purpose
Apply generated Kubernetes manifests to the cluster using `kubectl apply --wait` with configurable timeout.

## Parameters
- **solutionId** (required): Solution ID to deploy (format: sol_YYYY-MM-DDTHHMMSS_hash)
- **sessionDir** (optional): Session directory path (defaults to ./sessions)
- **timeout** (optional): Deployment timeout in seconds (default: 30, max: 600)

## Tool Behavior
1. **Manifest Location**: Expects manifest file at `{sessionDir}/{solutionId}/manifest.yaml`
2. **Deployment Command**: Executes `kubectl apply -f manifest.yaml --wait --timeout={timeout}s`
3. **Readiness Check**: Built-in kubectl readiness checking for all resources
4. **Error Handling**: Distinguishes between deployment failures and timeout issues

## Response Format
Returns deployment status including:
- **success**: Boolean indicating deployment success
- **kubectlOutput**: Raw kubectl command output
- **readinessTimeout**: Boolean indicating if timeout occurred during readiness check
- **message**: Human-readable status message
- **deploymentComplete**: True if fully deployed and ready
- **requiresStatusCheck**: True if deployment applied but readiness timed out

## Usage Notes
- This tool only applies manifests - it does NOT generate them
- Use `generateManifests` tool first to create the manifest file
- Timeout applies to the entire kubectl operation (apply + wait)
- Resources are applied in dependency order automatically by kubectl
- All resource types are supported (Deployment, Service, ConfigMap, etc.)

## Error Scenarios
- **Manifest not found**: solutionId doesn't have a generated manifest
- **kubectl failure**: Invalid YAML, RBAC issues, or resource conflicts
- **Readiness timeout**: Resources applied but not ready within timeout
- **Cluster connectivity**: kubectl cannot connect to cluster