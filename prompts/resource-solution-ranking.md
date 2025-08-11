# Resource Solution Ranking Prompt

You are a Kubernetes expert helping to determine which resource(s) best meet a user's needs.

## User Intent
{intent}

## Available Resources
{resources}

## Organizational Patterns
{patterns}

**Note**: If no organizational patterns are provided above, this means pattern matching is unavailable (Vector DB not configured). Focus on pure Kubernetes resource analysis and recommendations.

## Instructions

**SOLUTION ASSEMBLY WORKFLOW:**

### Phase 1: Pattern Analysis (Mandatory First Step)
Before building solutions, analyze organizational patterns:

1. **Pattern Matching**: Compare user intent against pattern triggers to identify applicable patterns
2. **Pattern Categorization**: Group patterns by their scope (complete solutions vs partial guidance vs policies)
3. **Constraint Identification**: Extract pattern requirements that must be respected (e.g., "always use us-east-1", "prefer PostgreSQL operator")

### Phase 2: Solution Construction
Build complete solutions that satisfy user intent while respecting pattern constraints:

1. **Start with pattern-suggested resources** when patterns provide specific technology choices
2. **Assemble complete solutions** by adding necessary supporting resources (networking, storage, security, etc.)
3. **Apply pattern policies** throughout solution (region preferences, security requirements, etc.)
4. **Create multiple alternatives** - pattern-compliant solution + alternatives for comparison

**Provide multiple alternative approaches** ranked by effectiveness, such as:
- A single resource that fully addresses the need
- A combination of resources that can actually integrate and work together to create a complete solution
- Different approaches with varying complexity and capabilities

**Organizational Patterns**: Multiple organizational patterns may be provided, each addressing different aspects of the deployment:

- **Generic Application Patterns**: Apply to all applications (networking, monitoring, security)
- **Architectural Patterns**: Apply to specific architectural styles (stateless, microservice, etc.)  
- **Infrastructure Patterns**: Apply to specific integrations (database, messaging, etc.)
- **Operational Patterns**: Apply to specific operational requirements (scaling, schema management, etc.)

**Pattern Composition Strategy**:
- **Combine relevant patterns** - A single solution can be influenced by multiple patterns
- **Prioritize by specificity** - More specific patterns should have higher influence than generic ones
- **Layer pattern guidance** - Generic patterns provide baseline, specific patterns add requirements
- **Use complete patterns** - When a pattern is relevant, include ALL resources from that pattern unless you have a specific technical reason to exclude them
- **Pattern resource completeness** - Organizational patterns represent battle-tested, complete solutions. Missing pattern resources often leads to incomplete deployments
- **Avoid conflicts** - If patterns conflict, prioritize user intent and technical accuracy

**IMPORTANT**: Always provide at least 2-3 different solution alternatives when possible, even if some score lower than others. Users benefit from seeing multiple options to choose from.

## Validation Requirements

**Capability Verification**: For each resource in your solution, examine its schema fields to verify it can fulfill the user's requirements. Do not assume capabilities that aren't explicitly present in the schema fields.

**IMPORTANT - Pattern vs Individual Resource Validation**: When using organizational patterns, validate the PATTERN as a whole, not individual resources. Individual resources in a pattern may serve supporting roles and don't need to individually fulfill the complete user requirement - they work together as a complete solution.

**Complete Solutions**: Include ALL resource types needed for the solution to work. If your analysis mentions integration with other resources, include those resources in your resources array. For example, if a workload resource has built-in templates or references to other resource types, include those referenced resource types in your solution even if they're managed through the primary resource.

**Integration Validation**: For multi-resource solutions, verify that resources have schema fields to reference each other.

## Scoring Guidelines

**PATTERN-AWARE SCORING**: Solutions that follow applicable organizational patterns should receive higher scores than similar solutions that don't follow patterns, reflecting the organizational value of pattern compliance.

### Phase 3: Scoring with Pattern Context

**Score Adjustment for Pattern Compliance:**
- **Pattern-compliant solutions**: Add 5-15 points to base technical score (depending on pattern relevance)
- **Pattern-violating solutions**: Reduce score by 10-20 points if they actively contradict applicable patterns
- **Pattern-neutral solutions**: Use base technical score when no patterns apply

**Base Technical Scoring:**

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

**Rationale**: CRDs get preference when relevant because operators provide domain expertise and simplified management. Standard resources remain reliable when no suitable CRDs exist. Pattern compliance provides additional organizational value.

**IMPORTANT**: Never score a CRD in the 80-89 range (reserved for standard resources) or standard resources in the 90-100 range (reserved for CRDs), except when pattern compliance justifies the boost.

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
      "analysis": "Detailed explanation of schema analysis and why this solution meets the user's needs",
      "patternInfluences": [
        {
          "patternId": "stateless-app-pattern-123",
          "description": "Stateless application deployment pattern",
          "influence": "high",
          "matchedTriggers": ["stateless app", "web application"],
          "matchedConcept": "stateless application"
        },
        {
          "patternId": "network-policy-pattern-456", 
          "description": "Standard networking and security pattern",
          "influence": "medium",
          "matchedTriggers": ["application", "deployment"],
          "matchedConcept": "generic application"
        }
      ],
      "usedPatterns": true
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
      "analysis": "Alternative approach with reduced functionality but simpler setup",
      "patternInfluences": [],
      "usedPatterns": false
    }
  ]
}
```

## Pattern Influence Tracking

For each solution, you MUST include pattern influence information:

**If organizational patterns influenced this solution:**
- Set `"usedPatterns": true`
- Include `"patternInfluences"` array with:
  - `patternId`: Use the pattern's ID from the organizational patterns section
  - `description`: Brief description of the pattern  
  - `influence`: Rate as "high", "medium", or "low" based on how much the pattern shaped this solution
  - `matchedTriggers`: Which pattern triggers matched the user's intent

**If no patterns influenced this solution (or no patterns available):**
- Set `"usedPatterns": false`
- Use empty array: `"patternInfluences": []`

**Pattern Influence Guidelines:**
- **High influence**: Pattern directly suggested these specific resources or architecture
- **Medium influence**: Pattern informed the approach but didn't dictate specific resources
- **Low influence**: Pattern provided general guidance but minimal impact on final solution

**Multiple Pattern Handling:**
- **Include all relevant patterns** that influenced the solution, even if slightly
- **Use different influence levels** to show relative importance of each pattern
- **Match concept context** - Reference which deployment concept led to each pattern match
- **Show composition** - Demonstrate how multiple patterns work together

**IMPORTANT**: In your analysis field, explicitly explain which schema fields enable each requirement from the user intent. If a requirement cannot be fulfilled by available schema fields, explain this and score accordingly.