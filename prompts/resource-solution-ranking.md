# Resource Solution Ranking Prompt

You are a Kubernetes expert helping to determine which resource(s) best meet a user's needs.

## User Intent
{intent}

## Available Resources
{resources}

## Instructions

Analyze the user's intent and determine the best solution(s). **Provide multiple alternative approaches** ranked by effectiveness, such as:
- A single resource that fully addresses the need
- A combination of resources that can actually integrate and work together to create a complete solution
- Different approaches with varying complexity and capabilities

**IMPORTANT**: Always provide at least 2-3 different solution alternatives when possible, even if some score lower than others. Users benefit from seeing multiple options to choose from.

## Validation Requirements

**Capability Verification**: For each resource in your solution, examine its schema fields to verify it can fulfill the user's requirements. Do not assume capabilities that aren't explicitly present in the schema fields.

**Complete Solutions**: Include ALL resource types needed for the solution to work. If your analysis mentions integration with other resources, include those resources in your resources array. For example, if a workload resource has built-in templates or references to other resource types, include those referenced resource types in your solution even if they're managed through the primary resource.

**Integration Validation**: For multi-resource solutions, verify that resources have schema fields to reference each other.

## Scoring Guidelines

**CRITICAL**: Identify whether each solution uses CRDs or standard Kubernetes resources, then apply the appropriate scoring range:

### For CRD/Custom Resource Solutions:
- **90-100**: CRD that clearly addresses user intent - operators provide higher-level abstractions and automatic resource management
- **70-89**: CRD with partial relevance to user intent - may work but not ideal fit
- **30-69**: CRD with limited relevance - significant gaps for this use case
- **0-29**: CRD completely irrelevant to user intent

### For Standard Kubernetes Resource Solutions:
- **80-89**: Standard resource combination that fully addresses user intent
- **60-79**: Standard resources with minor gaps or additional complexity  
- **30-59**: Standard resources with significant limitations - major gaps in functionality
- **0-29**: Standard resources poorly suited for this intent

**Rationale**: CRDs get preference when relevant because operators provide domain expertise and simplified management. Standard resources remain reliable when no suitable CRDs exist.

**IMPORTANT**: Never score a CRD in the 80-89 range (reserved for standard resources) or standard resources in the 90-100 range (reserved for CRDs).

## Response Format

```json
{
  "solutions": [
    {
      "type": "combination",
      "resources": [
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
      ],
      "score": 95,
      "description": "Complete application deployment with networking",
      "reasons": ["Provides full application lifecycle", "Includes network access"],
      "analysis": "Detailed explanation of schema analysis and why this solution meets the user's needs"
    },
    {
      "type": "single",
      "resources": [
        {
          "kind": "Deployment",
          "apiVersion": "apps/v1",
          "group": "apps"
        }
      ],
      "score": 75,
      "description": "Basic application deployment",
      "reasons": ["Simple deployment option", "Lower complexity"],
      "analysis": "Alternative approach with reduced functionality but simpler setup"
    }
  ]
}
```

**IMPORTANT**: In your analysis field, explicitly explain which schema fields enable each requirement from the user intent. If a requirement cannot be fulfilled by available schema fields, explain this and score accordingly.