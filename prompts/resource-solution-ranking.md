# Resource Solution Ranking Prompt

You are a Kubernetes expert helping to determine which resource(s) best meet a user's needs.

## User Intent
{intent}

## Available Resources
{resources}

## Instructions

Analyze the user's intent and determine the best solution(s). This could be:
- A single resource that fully addresses the need
- A combination of resources that work together to create a complete solution
- Multiple alternative approaches ranked by effectiveness

For each solution, provide:
1. A score from 0-100 for how well it meets the user's needs
2. Specific reasons why this solution addresses the intent
3. Whether it's a single resource or combination, and why
4. Production readiness and best practices

Consider:
- Semantic meaning and typical use cases
- Resource relationships and orchestration patterns
- Complete end-to-end solutions vs partial solutions
- Production patterns and best practices
- **Custom Resource Definitions (CRDs)** that may provide simpler, higher-level abstractions
- Platform operators (Crossplane, Knative, etc.) that might offer better user experience
- User experience - simpler declarative approaches often score higher than complex multi-resource solutions

## CRD Preference Guidelines

When evaluating CRDs vs standard Kubernetes resources:
- **Prefer CRDs with matching capabilities**: If a CRD's listed capabilities directly address the user's specific needs, it should score higher than manually combining multiple standard resources
- **Favor purpose-built solutions**: CRDs designed for specific use cases should score higher than generic resource combinations when the use case aligns
- **Value comprehensive functionality**: A single CRD that handles multiple related concerns (deployment + networking + scaling) should score higher than manually orchestrating separate resources for the same outcome
- **Consider operational simplicity**: CRDs that provide intuitive, domain-specific interfaces should be preferred over complex multi-resource configurations
- **Give preference to platform abstractions**: For application deployment scenarios, purpose-built CRDs with comprehensive application platform features should be weighted more favorably than basic resources requiring manual orchestration
- **Match scope to intent**: Only prefer CRDs when their documented capabilities genuinely align with what the user is trying to achieve

## Response Format

```json
{
  "solutions": [
    {
      "type": "single|combination",
      "resources": [
        {
          "kind": "Deployment",
          "apiVersion": "apps/v1",
          "group": "apps"
        }
      ],
      "score": 85,
      "description": "Brief description of this solution",
      "reasons": ["reason1", "reason2"],
      "analysis": "Detailed explanation of why this solution meets the user's needs"
    }
  ]
}
```

For each resource in the `resources` array, provide:
- `kind`: The resource type (e.g., "Deployment", "Service", "AppClaim")
- `apiVersion`: The API version (e.g., "apps/v1", "v1")
- `group`: The API group (empty string for core resources, e.g., "apps", "devopstoolkit.live")

## Scoring Guidelines

- **90-100**: Complete solution, fully addresses user needs
- **70-89**: Good solution, addresses most needs with minor gaps
- **50-69**: Partial solution, addresses some needs but requires additional work
- **30-49**: Incomplete solution, only peripherally addresses needs
- **0-29**: Poor fit, doesn't meaningfully address the user's intent