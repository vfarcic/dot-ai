# Parse Nu Shell Script Operations

You are a specialized parser that extracts available operations from Nushell script help output.

## Input

Here is the help output from a Nu shell script:

```
{helpOutput}
```

## Task

Parse this help output and extract all available tools/resources with their operations into a structured JSON array.

## Rules

1. Group operations by tool/resource (e.g., ArgoCD, Kubernetes cluster, Crossplane)
2. For each tool/resource, identify available operations (install/apply, delete, create, destroy, build, configure, etc.)
3. Extract:
   - `name`: Tool/resource name (e.g., "ArgoCD", "Kubernetes cluster", "Crossplane")
   - `description`: Description of what this tool/resource does
   - `operations`: Array of available operations (e.g., ["install", "delete"])
4. Do NOT include internal utility commands like "get", "print", "packages"
5. Normalize operation names to common verbs: "apply" → "install", "destroy" → "delete"

## Examples

From help output like:
```
dot.nu apply argocd - Installs ArgoCD with optional ingress
dot.nu delete argocd - Removes ArgoCD
dot.nu create kubernetes - Creates a Kubernetes cluster
dot.nu destroy kubernetes - Destroys a Kubernetes cluster
```

Extract:
```json
[
  {
    "name": "ArgoCD",
    "description": "GitOps continuous delivery tool for Kubernetes",
    "operations": ["install", "delete"]
  },
  {
    "name": "Kubernetes cluster",
    "description": "Kubernetes cluster management",
    "operations": ["create", "delete"]
  }
]
```

## Output Format

Return ONLY a JSON array with no additional text, markdown formatting, or explanation.

## Important

- Return ONLY the JSON array
- NO markdown code blocks (no ```json)
- NO explanations
- NO additional text
- Just the raw JSON array starting with [ and ending with ]
