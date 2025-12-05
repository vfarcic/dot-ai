# Question Generation for Kubernetes Configuration

## User Intent
{{intent}}

## Recommended Solution
{{solution_description}}

{{{source_material}}}

## Cluster Context
{{cluster_options}}

## Organizational Policies
{{policy_context}}

## Instructions

## ⚠️ CRITICAL: MANDATORY "name" FIELD REQUIREMENT

**BEFORE GENERATING ANY QUESTIONS**: The REQUIRED section MUST include a question with `id: "name"`. This is non-negotiable and your response will be rejected if this field is missing or renamed to any variation like "cluster-name", "deployment-name", "app-name", or "release-name".

## 🛡️ POLICY-AWARE QUESTION GENERATION (HIGHEST PRIORITY)

**Policy Requirements Integration:**
- **Policy-driven questions** represent organizational governance requirements and must be enforced through configuration
- **Conditional applicability** - Only apply policies when their rationale matches the solution
- **REQUIRED question promotion** - Applicable policy requirements should become REQUIRED questions with helpful defaults
- **Compliance indicators** - Mark policy-driven questions with "⚠️ required by [policy description]" in question text
- **Policy rationale** - Include policy rationale as question hints to help users understand WHY they're required

**POLICY APPLICATION APPROACH:**

1. **Analyze Match**: Review each policy's rationale to determine if it applies to the solution
2. **Extract Requirements**: Identify what configuration properties the policy requires
3. **Create REQUIRED Questions**: Convert applicable policy requirements into REQUIRED questions
4. **Add Compliance Context**: Include policy context in question text and hints
5. **Set Sensible Defaults**: Provide policy-compliant defaults when possible

**CRITICAL: Policy Conditional Logic**
- **Read each policy's "Rationale" field carefully** - it specifies WHEN and TO WHAT the policy applies
- **Apply policies selectively** - only convert policy requirements to questions when the policy technically applies
- **Configuration matching** - If a policy rationale mentions specific configurations (e.g., "All Deployments must..."), only apply when relevant
- **Field-specific requirements** - Match policy requirements to configuration options available in the source material above
- **Policy compliance increases user success** - policy-driven questions help users create compliant configurations from the start

Based on the user's intent and the configuration options in the source material above, generate appropriate questions to gather the information needed.

**IMPORTANT**: Only ask questions about properties that are explicitly listed in the source material above. Do not ask about properties unless they appear in the provided configuration options.

Use the provided cluster options to populate dynamic select questions with real values from the user's cluster.

Organize questions into three categories based on their importance and impact:

### REQUIRED Questions
Essential information needed for basic functionality. These are mandatory fields or critical configuration that makes the difference between working and non-working deployments. Without answers to these questions, the manifests cannot be generated or will fail to deploy.

**🚨 CRITICAL MANDATORY REQUIREMENTS - NON-NEGOTIABLE 🚨**

You MUST include these EXACT questions with these EXACT IDs in the REQUIRED section. DO NOT rename, replace, or substitute these with similar fields:

1. **REQUIRED: `name` question (id: "name")**
   - Question ID MUST be exactly: `"id": "name"`
   - DO NOT use: "cluster-name", "deployment-name", "app-name", or any variation
   - This is used for tracking and metadata - the manifest generator will apply it appropriately to resource-specific name fields
   - Example: `{"id": "name", "question": "What is the name for this deployment?", "type": "text", ...}`

2. **REQUIRED: `namespace` question (id: "namespace")**
   - ONLY if any resource in the solution is namespace-scoped - check resource scope information
   - Question ID MUST be exactly: `"id": "namespace"`
   - **For Helm chart installations**: Use `type: "text"` (NOT `select`) because users typically want to create NEW namespaces for third-party tools (e.g., "monitoring", "argocd", "cert-manager"). Mention existing namespaces in the placeholder as suggestions.
   - **For capability-based solutions**: Use `type: "select"` with existing namespaces as options.

**VALIDATION**: Your response will fail if the REQUIRED section does not contain a question with `"id": "name"`

### BASIC Questions  
Common configuration options most users will want to set. These improve the deployment but aren't strictly required for basic functionality. They represent sensible customizations that enhance the deployment.

### ADVANCED Questions
Optional advanced configuration for power users. These are for optimization, security hardening, complex networking, resource management, or specialized scenarios that most users won't need initially.

## Guidelines

**CRITICAL CONSTRAINT**: Only ask questions about properties that actually exist in the provided source material. Do not invent or assume properties that are not explicitly listed.

For each question, consider:
- **ONLY the properties and their actual constraints from the source material** - never ask about properties not provided
- What information is truly needed to generate a working configuration
- **Configuration richness** - expose meaningful configuration options available in the source material
- User-friendly question wording (avoid Kubernetes jargon where possible)
- Practical defaults that work in most environments
- **Comprehensive coverage** - generate questions for all significant configurable properties, not just the minimum required
- Use cluster-discovered options when available for select questions

### Determining Suggested Answers

Each question MUST include a `suggestedAnswer` field. Determine appropriate values by considering:

1. **Organizational policies** - If a policy specifies required values or constraints, use compliant defaults
2. **Source material defaults** - Use defaults defined in the chart values.yaml, CRD schema, or documentation
3. **Cluster context** - For questions about cluster resources (ingress class, storage class, etc.), prefer options actually available in the cluster, especially those marked as default
4. **Best practices** - Apply common Kubernetes conventions and production-ready defaults

**VALIDATION RULE**: Before creating any question, verify that the property exists in the provided source material. If a property like "storageClass" is not listed, do not ask about it.

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
      "id": "name",
      "question": "What is the name for this deployment?",
      "type": "text",
      "placeholder": "e.g., my-app",
      "validation": {
        "required": true,
        "pattern": "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$"
      },
      "suggestedAnswer": "example-app"
    },
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
  },
  "relevantPolicies": ["Minimum 3 replicas for production deployments", "Resource limits required for all containers"]
}
```

**CRITICAL - Relevant Policies Field:**
- Include `relevantPolicies` array with the **descriptions** of organizational policies that influenced your question generation
- Use the policy `description` field from the Organizational Policies section provided above
- Only include policies that were actually applied (e.g., policies that resulted in questions being added or made required)
- Use empty array `[]` if no organizational policies influenced the questions

## Important Notes

- **CRITICAL VALIDATION REQUIREMENT**: The REQUIRED section MUST contain a question with `"id": "name"` - responses without this will be rejected
- **CRITICAL**: Only ask questions about properties explicitly defined in the provided source material
- **REQUIRED**: Each question must include a `suggestedAnswer` field (see "Determining Suggested Answers" section for guidance)
- **Generate comprehensive questions** covering all meaningful configuration options available in the source material
- Focus on questions that actually affect the generated configuration
- **Prefer explicit configuration over defaults** - give users control over important settings even if reasonable defaults exist
- **DO NOT** ask about storage classes, node selectors, or other properties unless they appear in the source material
- **DO NOT** make assumptions about what properties are configurable - stick strictly to the provided source material
- Use the provided cluster options to populate select questions with real values
- Consider real-world usage patterns and common configurations
- Ensure question IDs are unique and descriptive
- Use semantic question IDs that consolidate related fields (e.g., `port` instead of separate port questions)
- Validation rules should match Kubernetes constraints where applicable