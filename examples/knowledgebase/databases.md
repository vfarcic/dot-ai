# Database Standard

All databases MUST be deployed using the `sqls.devopstoolkit.live` Custom Resource Definition (CRD). Direct provisioning of databases through cloud provider consoles, Terraform, or raw Kubernetes operators is not permitted.

## Required CRD

- **API Group**: `devopstoolkit.live`
- **Version**: `v1beta1`
- **Kind**: `SQL`

This is a Crossplane Composite Resource (XR) that abstracts cloud-specific database provisioning into a single interface. The underlying cloud provider is selected through the `compositionRef`.

## Cloud Provider Compositions

| Cloud    | compositionRef.name  |
|----------|----------------------|
| AWS      | `aws-postgresql`     |
| GCP      | `google-postgresql`  |
| Azure    | `azure-postgresql`   |

## Example

```yaml
apiVersion: devopstoolkit.live/v1beta1
kind: SQL
metadata:
  name: orders-db
  namespace: a-team
spec:
  size: small
  crossplane:
    compositionRef:
      name: aws-postgresql
```

## Rationale

Using `sqls.devopstoolkit.live` ensures that:

- Database provisioning follows a consistent, auditable workflow
- Credentials are managed automatically through Crossplane and External Secrets
- Teams can switch cloud providers by changing a single field
- Security and compliance policies are enforced at the CRD level via Kyverno
