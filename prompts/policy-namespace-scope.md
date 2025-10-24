# Policy Namespace Scope

Your policy can be applied cluster-wide or limited to specific namespaces.

## Available Namespaces in Your Cluster:
{{namespaces}}

## Choose the scope for your policy:

1. **Apply to all namespaces** (cluster-wide enforcement)
   - Type: `all` or `1`

2. **Apply only to specific namespaces** (inclusive list)
   - Type: `include: namespace1, namespace2, namespace3`
   - Example: `include: production, staging`

3. **Apply to all namespaces EXCEPT specific ones** (exclusion list)
   - Type: `exclude: namespace1, namespace2`
   - Example: `exclude: kube-system, kube-public`

**Your choice**: [Type your selection]

---

## Examples:

**For cluster-wide policy:**
```
all
```

**To apply only to production and staging:**
```
include: production, staging
```

**To exclude system namespaces:**
```
exclude: kube-system, kube-public, kube-node-lease
```

## Note
System namespaces (kube-system, kube-public, kube-node-lease) are often excluded from policies to prevent conflicts with Kubernetes core functionality. Consider whether your policy should apply to these system namespaces.