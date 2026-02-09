# Security Policies

All workloads deployed to our Kubernetes clusters MUST comply with the following security policies.

## Container Security

- Containers MUST NOT run as root. Set `runAsNonRoot: true` in the Pod security context.
- Containers MUST drop all Linux capabilities and only add back what is explicitly needed.
- Read-only root filesystem is required. Set `readOnlyRootFilesystem: true`.
- Privilege escalation MUST be disabled. Set `allowPrivilegeEscalation: false`.

## Network Policies

- Every namespace MUST have a default-deny ingress NetworkPolicy.
- Services that need to receive traffic MUST have explicit NetworkPolicy rules allowing only the required sources.
- Egress to the internet is denied by default. Exceptions require platform team approval.

## Secrets Management

- Secrets MUST NOT be stored in Git repositories, even if encrypted.
- Use External Secrets Operator with the company Vault instance to inject secrets at runtime.
- Database credentials are managed automatically when using the `sqls.devopstoolkit.live` CRD.
- API keys and tokens must be rotated at least every 90 days.

## Image Provenance

- Only images from approved registries are allowed: `ghcr.io/vfarcic/`, `docker.io/library/`, and the company registry `registry.internal.company.com`.
- All images must have a valid signature verified by Cosign.
