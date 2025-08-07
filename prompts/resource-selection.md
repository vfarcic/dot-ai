# Resource Selection Prompt

You are a Kubernetes expert. Given this user intent and available resources, select the resources that could be relevant for detailed analysis.

## User Intent
{intent}

## Available Resources
{resources}

## Organizational Patterns
{patterns}

## Instructions

## 🏆 PATTERN PRIORITIZATION (HIGHEST PRIORITY)

**If any organizational pattern above matches this intent (based on pattern triggers), prioritize those resources above all others:**
- **Golden Path Priority** - Pattern resources represent approved organizational standards and should rank higher than cloud-native alternatives
- **Pattern Recognition** - Match pattern triggers against user intent keywords. If triggers match, the pattern's "Suggested Resources" become high-priority candidates
- **Higher-Level Abstractions** - Pattern resources often provide better user experience than low-level cloud provider resources
- **Resource Name Matching** - Find exact "Suggested Resources" names in the "Resource Name" field of available resources

Select all resources that could be relevant for this intent. Consider:
- **🥇 FIRST: Organizational pattern resources** - When patterns match the intent, their suggested resources should appear early in your selection
- Direct relevance to the user's needs (applications, infrastructure, operators, networking, storage)  
- Common Kubernetes patterns and best practices
- Resource relationships and combinations
- Production deployment patterns
- Complex multi-component solutions
- **Custom Resource Definitions (CRDs)** that might provide higher-level abstractions or simpler alternatives
- Platform-specific resources (e.g., Crossplane, Knative, Istio, ArgoCD) that could simplify the deployment
- **Infrastructure components**: networking (Ingress, Service, NetworkPolicy), storage (PVC, StorageClass), security (RBAC, ServiceAccount)
- **Database operators**: PostgreSQL, MongoDB, MySQL, Redis operators that provide managed database services
- **Monitoring and observability**: Prometheus, Grafana, AlertManager, logging operators
- **Operator patterns**: Look for operators that provide simplified management of complex infrastructure
- **CRD Selection Priority**: If you see multiple CRDs from the same group with similar purposes (like "App" and "AppClaim"), include the namespace-scoped ones (marked as "Namespaced: true") rather than cluster-scoped ones, as they're more appropriate for application deployments

Don't limit yourself - if the intent is complex, select as many resources as needed. **Be extra inclusive** - the detailed schema analysis phase will filter out inappropriate resources, so it's better to include more candidates initially.

## Response Format

Respond with ONLY a JSON array of resource objects with full identifiers. Do NOT wrap in an object - just return the array:

```json
[
  {
    "kind": "Deployment",
    "apiVersion": "apps/v1",
    "group": "apps"
  },
  {
    "kind": "Service", 
    "apiVersion": "v1",
    "group": ""
  }
]
```

IMPORTANT: Your response must be ONLY the JSON array, nothing else.

## Selection Philosophy

- **Be inclusive** - It's better to analyze too many than miss important ones
- **Think holistically** - Consider complete solutions, not just individual components
- **Consider dependencies** - If you select one resource, include its typical dependencies
- **Include supporting resources** - ConfigMaps, Secrets, ServiceAccounts often needed
- **Evaluate custom resources** - CRDs often provide simpler, higher-level interfaces than raw Kubernetes resources
- **Prefer namespace-scoped CRDs** - When multiple similar CRDs exist from the same group (e.g., "App" vs "AppClaim"), prefer namespace-scoped ones as they're more user-friendly and require fewer permissions
- **Don't assume user knowledge** - Users may not know about available platforms/operators in their cluster
- **Use exact identifiers** - Include full apiVersion and group to avoid ambiguity