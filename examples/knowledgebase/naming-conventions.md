# Naming Conventions

All Kubernetes resources MUST follow these naming conventions.

## Namespaces

Namespaces represent teams. Use lowercase team names with no prefixes or suffixes.

Approved namespaces:
- `a-team` - Platform engineering team
- `b-team` - Application development team

Creating new namespaces requires approval from the platform team.

## Resource Names

- Use lowercase with hyphens (`my-app`, not `myApp` or `my_app`)
- Maximum 63 characters (Kubernetes limit)
- Names must describe the workload (e.g., `orders-api`, `user-store`, `inventory-db`)
- Do not include the team name or namespace in the resource name since the namespace already provides that context

## Image Tags

- Always use explicit version tags (e.g., `1.4.307`)
- The `latest` tag is prohibited and will be rejected by policy
- Use semantic versioning where possible

## Labels

All resources MUST include these labels:

| Label          | Description                     | Example        |
|----------------|---------------------------------|----------------|
| `app`          | Name of the application         | `orders-api`   |
| `tier`         | Component tier                  | `frontend`, `backend`, `database` |
