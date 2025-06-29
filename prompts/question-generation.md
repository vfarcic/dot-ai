# Question Generation for Kubernetes Resource Configuration

## User Intent
{intent}

## Recommended Solution
{solution_description}

## Resources in Solution
{resource_details}

## Available Cluster Options
{cluster_options}

## Instructions

Based on the user's intent and the Kubernetes resources in this solution, generate appropriate questions to gather the information needed to create working manifests.

Use the provided cluster options to populate dynamic select questions with real values from the user's cluster.

Organize questions into three categories based on their importance and impact:

### REQUIRED Questions
Essential information needed for basic functionality. These are mandatory fields or critical configuration that makes the difference between working and non-working deployments. Without answers to these questions, the manifests cannot be generated or will fail to deploy.

### BASIC Questions  
Common configuration options most users will want to set. These improve the deployment but aren't strictly required for basic functionality. They represent sensible customizations that enhance the deployment.

### ADVANCED Questions
Optional advanced configuration for power users. These are for optimization, security hardening, complex networking, resource management, or specialized scenarios that most users won't need initially.

## Guidelines

For each question, consider:
- The resource schema properties and their actual constraints
- What information is truly needed to generate a working manifest
- Progressive disclosure - start simple, add complexity only if needed  
- User-friendly question wording (avoid Kubernetes jargon where possible)
- Practical defaults that work in most environments
- The actual complexity of the solution (simple solutions need fewer questions, complex solutions may need many)
- Use cluster-discovered options when available for select questions

Question types available:
- `text`: Free text input
- `select`: Single choice from options (use cluster-discovered options when possible)
- `multiselect`: Multiple choices from options  
- `boolean`: Yes/no question
- `number`: Numeric input

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
      }
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

- Generate as many questions as needed for the solution complexity
- Focus on questions that actually affect the generated manifests
- Avoid asking for information that can be reasonably defaulted
- Use the provided cluster options to populate select questions with real values
- Consider real-world usage patterns and common configurations
- Ensure question IDs are unique and descriptive
- Validation rules should match Kubernetes constraints where applicable