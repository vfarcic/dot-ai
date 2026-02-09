# Environment Strategy

We operate three environments. All promotion between environments is automated through GitOps.

## Environments

| Environment | Cluster        | Purpose                          |
|-------------|----------------|----------------------------------|
| Development | `dev-cluster`  | Feature testing, integration     |
| Staging     | `stg-cluster`  | Pre-production validation        |
| Production  | `prod-cluster` | Live traffic                     |

## Promotion Flow

1. A pull request is merged to `main`.
2. CI builds and pushes a new image tag.
3. The dev environment is updated automatically via Argo CD.
4. After passing automated tests in dev, the staging environment is updated.
5. Production promotion requires a manual approval gate in Argo CD.

## Environment-Specific Configuration

- Use Kustomize overlays per environment, not Helm value overrides.
- Scaling defaults differ per environment:
  - **Dev**: `scaling.min: 1`, `scaling.max: 2`
  - **Staging**: `scaling.min: 2`, `scaling.max: 5`
  - **Production**: `scaling.min: 3`, `scaling.max: 10`
- Database sizes follow the same pattern: `small` for dev, `medium` for staging, `large` for production.
