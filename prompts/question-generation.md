# Question Generation for Kubernetes Resource Configuration

## User Intent
{intent}

## Recommended Solution
{solution_description}

## Resources in Solution
{resource_details}

## Available Cluster Options
{cluster_options}

## Organizational Policies
{policy_context}

## Instructions

## 🛡️ POLICY-AWARE QUESTION GENERATION (HIGHEST PRIORITY)

**Policy Requirements Integration:**
- **Policy-driven questions** represent organizational governance requirements and must be enforced through configuration
- **Conditional applicability** - Only apply policies when their rationale matches the selected resources
- **REQUIRED question promotion** - Applicable policy requirements should become REQUIRED questions with helpful defaults
- **Compliance indicators** - Mark policy-driven questions with "⚠️ required by [policy description]" in question text
- **Policy rationale** - Include policy rationale as question hints to help users understand WHY they're required

**POLICY APPLICATION APPROACH:**

1. **Analyze Resource Match**: Review each policy's rationale to determine if it applies to the selected resources
2. **Extract Requirements**: Identify what configuration properties the policy requires
3. **Create REQUIRED Questions**: Convert applicable policy requirements into REQUIRED questions
4. **Add Compliance Context**: Include policy context in question text and hints
5. **Set Sensible Defaults**: Provide policy-compliant defaults when possible

**CRITICAL: Policy Conditional Logic**
- **Read each policy's "Rationale" field carefully** - it specifies WHEN and TO WHAT the policy applies  
- **Apply policies selectively** - only convert policy requirements to questions when the policy technically applies to the selected resource types
- **Resource type matching** - If a policy rationale mentions specific resource types (e.g., "All Deployments must..."), only apply when Deployment resources are selected
- **Field-specific requirements** - Match policy requirements to actual resource schema fields available in the "Resources in Solution" section
- **Policy compliance increases user success** - policy-driven questions help users create compliant configurations from the start

Based on the user's intent and the Kubernetes resources in this solution, generate appropriate questions to gather the information needed to create working manifests.

**IMPORTANT**: Only ask questions about properties that are explicitly listed in the "Resources in Solution" section below. Do not ask about common Kubernetes properties unless they appear in the actual resource schema.

Use the provided cluster options to populate dynamic select questions with real values from the user's cluster.

Organize questions into three categories based on their importance and impact:

### REQUIRED Questions
Essential information needed for basic functionality. These are mandatory fields or critical configuration that makes the difference between working and non-working deployments. Without answers to these questions, the manifests cannot be generated or will fail to deploy.

**MANDATORY QUESTIONS**: You MUST always include these questions in the REQUIRED section:
- `name`: Resource name (applies to metadata.name across all resources)
- `namespace`: Target namespace (ONLY if any resource in the solution is namespace-scoped - check resource scope information)

### BASIC Questions  
Common configuration options most users will want to set. These improve the deployment but aren't strictly required for basic functionality. They represent sensible customizations that enhance the deployment.

### ADVANCED Questions
Optional advanced configuration for power users. These are for optimization, security hardening, complex networking, resource management, or specialized scenarios that most users won't need initially.

## Guidelines

**CRITICAL CONSTRAINT**: Only ask questions about properties that actually exist in the provided resource schemas. Do not invent or assume properties that are not explicitly listed in the resource details.

For each question, consider:
- **ONLY the resource schema properties and their actual constraints** - never ask about properties not in the schema
- What information is truly needed to generate a working manifest from the actual schema fields
- **Resource capabilities and configuration richness** - expose meaningful configuration options available in the schema
- User-friendly question wording (avoid Kubernetes jargon where possible)
- Practical defaults that work in most environments
- **Comprehensive coverage** - generate questions for all significant configurable properties, not just the minimum required
- Use cluster-discovered options when available for select questions

**VALIDATION RULE**: Before creating any question, verify that the property exists in the provided resource schema. If a property like "storageClass" is not listed in the schema, do not ask about it.

Question types available:
- `text`: Free text input
- `select`: Single choice from options (use cluster-discovered options when possible)
- `multiselect`: Multiple choices from options  
- `boolean`: Yes/no question
- `number`: Numeric input

## Question Design for Manifest Generation

**IMPORTANT**: Questions should be designed to collect semantic answers that the manifest generator can intelligently apply to the appropriate resource fields. Focus on user-friendly question IDs and clear descriptions.

### Question ID Guidelines
- Use semantic IDs that describe what the answer represents: `name`, `port`, `namespace`, `replicas`
- Avoid resource-specific IDs like `deployment-name` or `service-port` 
- Use consolidation-friendly IDs when the same answer applies to multiple resources
- Examples:
  - `name` (applies to metadata.name across all resources)
  - `port` (applies to containerPort, service port, ingress port)
  - `namespace` (applies to metadata.namespace across all resources)
  - `replicas` (applies to spec.replicas in Deployment)

### Semantic Consolidation
When multiple resources need the same information, create a single question with a consolidated ID:
- **Instead of**: `deployment-port`, `service-port`, `ingress-port`
- **Use**: `port` (manifest generator will apply to all relevant port fields)

- **Instead of**: `deployment-name`, `service-name` 
- **Use**: `name` (manifest generator will apply to all resource names)

## Response Format

Return your response as JSON in this exact format:

```json
{
  "required": [
    {
      "id": "unique-kebab-case-id",
      "question": "User-friendly question text?",
      "type": "text|select|multiselect|boolean|number",
      "options": ["option1", "option2"],
      "placeholder": "example value or helpful hint",
      "validation": {
        "required": true,
        "min": 1,
        "max": 100,
        "pattern": "^[a-z0-9-]+$"
      },
      "suggestedAnswer": "example-value"
    }
  ],
  "basic": [
    // same format as required
  ],
  "advanced": [
    // same format as required
  ],
  "open": {
    "question": "Is there anything else about your requirements or constraints that would help us provide better recommendations?",
    "placeholder": "e.g., specific security requirements, performance needs, existing infrastructure constraints..."
  }
}
```

## Important Notes

- **CRITICAL**: Only ask questions about properties explicitly defined in the provided resource schemas
- **REQUIRED**: Each question must include a `suggestedAnswer` field with a valid example value that passes the validation rules
- **Generate comprehensive questions** covering all meaningful configuration options available in the resource schemas
- Focus on questions that actually affect the generated manifests based on the actual schema
- **Prefer explicit configuration over defaults** - give users control over important settings even if reasonable defaults exist
- **DO NOT** ask about storage classes, node selectors, or other properties unless they appear in the resource schema
- **DO NOT** make assumptions about what properties are configurable - stick strictly to the provided schema
- Use the provided cluster options to populate select questions with real values
- Consider real-world usage patterns and common configurations
- Ensure question IDs are unique and descriptive
- Use semantic question IDs that consolidate related fields (e.g., `port` instead of separate port questions)
- Validation rules should match Kubernetes constraints where applicable