# Solution Assembly and Ranking Prompt

You are a Kubernetes expert. Given this user intent, available resources, and organizational patterns, create and rank complete solutions that address the user's needs.

## User Intent
{{{intent}}}

## Available Resources
{{{resources}}}

## Organizational Patterns
{{{patterns}}}

## Instructions

## 🏆 PATTERN PRIORITIZATION (HIGHEST PRIORITY)

**Pattern-Aware Resource Selection:**
- **Pattern resources are included** in the Available Resources list below with source marked as "organizational-pattern"
- **Golden Path Priority** - Pattern resources represent approved organizational standards and should rank higher than alternatives
- **Higher-Level Abstractions** - Pattern resources often provide better user experience than low-level cloud provider resources

**SOLUTION ASSEMBLY APPROACH:**

1. **Analyze Available Resources**: Review capabilities, providers, complexity, and use cases
2. **Apply Pattern Logic**: Read pattern rationales to understand when they apply
3. **Create Complete Solutions**: Assemble resources into working combinations
4. **Rank by Effectiveness**: Score based on capability match, pattern compliance, and user intent

**CRITICAL: Pattern Conditional Logic**
- **Read each pattern's "Rationale" field carefully** - it specifies WHEN the pattern applies
- **Apply patterns conditionally** - only include pattern resources when their technical conditions are met
- **Resource compatibility analysis**: Before including pattern resources in a solution, verify the pattern's rationale matches the resources you're selecting
- **API group dependencies**: If a pattern rationale mentions specific API groups (e.g., "solutions using X.api"), only apply that pattern when the solution actually uses resources from those API groups
- **Multi-provider abstractions**: Higher-level abstractions that work across providers should not automatically trigger provider-specific auxiliary patterns unless technically required
- **Pattern compliance increases solution score** - solutions following organizational patterns should rank higher, but only when patterns are correctly applied based on technical compatibility

Create multiple alternative solutions. Consider:
- **🥇 FIRST: Pattern-based solutions** - Complete solutions using organizational patterns when applicable
- **🥈 SECOND: Technology-focused solutions** - Solutions optimized for specific technologies or providers  
- **🥉 THIRD: Complexity variations** - Simple vs comprehensive approaches
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

**Generate 2-5 different solutions** that genuinely address the user intent. Prioritize relevance over quantity - it's better to provide 2-3 high-quality, relevant solutions than to include irrelevant alternatives just to reach a target number.

## Helm Installation Fallback

**After analyzing available capabilities, determine if they can genuinely fulfill the user's intent.**

Ask yourself: "If the user applies these resources, will they get what they actually asked for?"

**Evaluation principles:**

1. **Don't confuse "uses X" with "is X"**
   - ServiceMonitor CRD *uses* Prometheus but doesn't *provide* Prometheus
   - Certificate CRD *uses* cert-manager but doesn't *provide* cert-manager
   - Prometheus CRD *provides* Prometheus instances (operator is installed)
   - Cluster CRD from CNPG *provides* PostgreSQL instances (operator is installed)

2. **Match the actual ask:**
   - "Install Prometheus" + Prometheus CRD exists → Capability solution (can create Prometheus instance)
   - "Install Prometheus" + Only ServiceMonitor exists → Helm fallback (cannot install Prometheus itself)
   - "Deploy PostgreSQL" + CNPG Cluster CRD exists → Capability solution (can create database)
   - "Deploy PostgreSQL" + No database operators → Helm fallback (need to install something first)

3. **Decision:**
   - If capabilities CAN fulfill the intent → Return `solutions` array with capability-based solutions
   - If capabilities CANNOT fulfill the intent → Return `helmRecommendation` with empty `solutions` array

## Response Format

Respond with ONLY a JSON object. The format depends on whether capabilities can fulfill the intent:

### When capabilities CAN fulfill the intent:

Return solutions with resources. Include the `resourceName` field for each resource (extract from Available Resources list).

**Solution type field (REQUIRED):**
- `"type": "single"` - when the solution uses exactly ONE resource
- `"type": "combination"` - when the solution uses TWO OR MORE resources together

```json
{
  "solutions": [
    {
      "type": "combination",
      "resources": [
        {
          "kind": "Deployment",
          "apiVersion": "apps/v1",
          "group": "apps",
          "resourceName": "deployments.apps"
        },
        {
          "kind": "Service",
          "apiVersion": "v1",
          "group": "",
          "resourceName": "services"
        }
      ],
      "score": 95,
      "description": "Complete web application deployment with networking",
      "reasons": ["High capability match for web applications", "Includes essential networking"],
      "appliedPatterns": ["High availability web application pattern"]
    }
  ]
}
```

**Applied Patterns:** Include pattern descriptions that influenced the solution. Use empty array `[]` if none applied.

### When capabilities CANNOT fulfill the intent (Helm fallback):

Return empty solutions with Helm recommendation. Patterns do not apply to Helm installations.

```json
{
  "solutions": [],
  "helmRecommendation": {
    "reason": "No capabilities can install Prometheus. ServiceMonitor CRD configures monitoring targets but cannot install Prometheus itself.",
    "suggestedTool": "Prometheus",
    "searchQuery": "prometheus"
  }
}
```

**searchQuery construction rules:**
- Use the primary tool name only (e.g., "prometheus", "argo cd", "cert-manager")
- Do NOT include generic terms like "helm", "chart", "kubernetes", "install"
- Do NOT include compound queries - pick the main tool (e.g., "prometheus with alertmanager" → searchQuery: "prometheus")
- Keep it simple - ArtifactHub search works best with short, focused queries
- The full intent will be used later when selecting the best chart from search results

IMPORTANT: Your response must be ONLY the JSON object, nothing else.

## Selection Philosophy

- **Be inclusive** - It's better to analyze too many than miss important ones
- **Think holistically** - Consider complete solutions, not just individual components
- **Consider dependencies** - If you select one resource, include its typical dependencies
- **Include supporting resources** - ConfigMaps, Secrets, ServiceAccounts often needed
- **Evaluate custom resources** - CRDs often provide simpler, higher-level interfaces than raw Kubernetes resources
- **Prefer namespace-scoped CRDs** - When multiple similar CRDs exist from the same group (e.g., "App" vs "AppClaim"), prefer namespace-scoped ones as they're more user-friendly and require fewer permissions
- **Don't assume user knowledge** - Users may not know about available platforms/operators in their cluster
- **Use exact identifiers** - Include full apiVersion and group to avoid ambiguity