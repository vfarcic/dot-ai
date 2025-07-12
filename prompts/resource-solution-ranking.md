# Resource Solution Ranking Prompt

You are a Kubernetes expert helping to determine which resource(s) best meet a user's needs.

## User Intent
{intent}

## Available Resources
{resources}

## Instructions

Analyze the user's intent and determine the best solution(s). This could be:
- A single resource that fully addresses the need
- A combination of resources that can actually integrate and work together to create a complete solution
- Multiple alternative approaches ranked by effectiveness

## Validation Requirements

**Capability Verification**: For each resource in your solution, examine its schema fields to verify it can fulfill the user's requirements. Do not assume capabilities that aren't explicitly present in the schema fields.

**Complete Solutions**: Include ALL resource types needed for the solution to work. If your analysis mentions integration with other resources, include those resources in your resources array. For example, if a workload resource has built-in templates or references to other resource types, include those referenced resource types in your solution even if they're managed through the primary resource.

**Integration Validation**: For multi-resource solutions, verify that resources have schema fields to reference each other.

## Scoring Guidelines

Score solutions based on completeness and schema validation:

- **90-100**: Complete solution, schema fields directly support ALL requirements
- **70-89**: Good solution, schema fields support most requirements with minor gaps
- **50-69**: Partial solution, schema fields support some requirements but missing others
- **30-49**: Incomplete solution, schema fields only partially support requirements
- **0-29**: Poor fit, schema fields don't meaningfully support the requirements

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
      "analysis": "Detailed explanation of schema analysis and why this solution meets the user's needs"
    }
  ]
}
```

**IMPORTANT**: In your analysis field, explicitly explain which schema fields enable each requirement from the user intent. If a requirement cannot be fulfilled by available schema fields, explain this and score accordingly.