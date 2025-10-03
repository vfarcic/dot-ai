# Parse Nu Shell Script Operations

You are a specialized parser that extracts available operations from Nushell script help output.

## Input

Here is the help output from a Nu shell script:

```text
{helpOutput}
```

## Task

Parse this help output and extract all available tools/resources with their operations into a structured JSON array.

## Rules

1. Group operations by tool/resource (e.g., ArgoCD, Kubernetes cluster, Crossplane)
2. For each tool/resource, identify available operations (apply, delete, create, destroy, build, configure, etc.)
3. Extract:
   - `name`: Tool/resource name (e.g., "ArgoCD", "Kubernetes cluster", "Crossplane")
   - `description`: Description of what this tool/resource does
   - `operations`: Array of operation objects, each with:
     - `name`: Operation name extracted from help (e.g., "apply", "delete", "create")
     - `command`: Array of command parts from help output (e.g., ["apply", "argocd"])
4. **CRITICAL**: Extract command arrays EXACTLY as they appear in help - "dot.nu apply argocd" → `["apply", "argocd"]`
5. Do NOT include internal utility commands like "get", "print", "packages"

## Examples

From help output like:
```sh
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
    "operations": [
      {"name": "apply", "command": ["apply", "argocd"]},
      {"name": "delete", "command": ["delete", "argocd"]}
    ]
  },
  {
    "name": "Kubernetes cluster",
    "description": "Kubernetes cluster management",
    "operations": [
      {"name": "create", "command": ["create", "kubernetes"]},
      {"name": "destroy", "command": ["destroy", "kubernetes"]}
    ]
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
