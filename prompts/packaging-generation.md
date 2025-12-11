# {{output_format}} Packaging

Convert validated Kubernetes manifests into {{output_format_description}}.

## User Intent
{{intent}}

## Solution Description
{{solution_description}}

## Raw Kubernetes Manifests (Validated)
```yaml
{{raw_manifests}}
```

## User Configuration (Questions and Answers)
{{questions_and_answers}}

## Output Path
{{output_path}}

## Instructions

Transform the raw Kubernetes manifests into {{output_format_description}}.

1. **Analyze Context**: Review the user intent, solution description, and the questions/answers to understand what the user is trying to achieve.

2. **Externalize Configuration**: Make values that users might want to change across deployments or environments configurable. Use your judgment based on the context - the questions asked indicate what the user cares about customizing.

3. **Convert Manifests**: Transform raw manifests into the appropriate format with references to externalized configuration.

4. **Generate Metadata**: Create required metadata files for the package.

{{format_specific_instructions}}

## Response Format

Return a JSON object with exactly this structure:

```json
{
  "files": [
    {
      "relativePath": "path/to/file.yaml",
      "content": "file content as string"
    }
  ]
}
```

**JSON Schema:**
- `files`: array (required) - List of files to generate
  - `relativePath`: string (required) - File path relative to output directory (e.g., "Chart.yaml", "templates/deployment.yaml")
  - `content`: string (required) - Complete file content

{{format_example}}

## Previous Attempt (if retry)
{{previous_attempt}}

## Validation Error Details (if retry)
{{error_details}}

If this is a retry, analyze the validation error and fix the specific issue while preserving working parts.

**CRITICAL**: Return ONLY the JSON object. NO markdown code blocks, NO explanations, NO additional text before or after the JSON.
