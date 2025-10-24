# Map User Intent to Platform Operation

You are helping map natural language user intent to available Kubernetes platform operations.

## User Intent
```text
{{intent}}
```

## Available Operations
```json
{{operations}}
```

## Your Task

Analyze the user intent and find the **single best matching operation** from the available operations list.

### Matching Guidelines

1. **Keyword Matching**: Look for operation names, tool names, or descriptions that match intent keywords
2. **Context Understanding**: Consider what the user is trying to accomplish
3. **Semantic Matching**: Match based on meaning, not just exact words
   - "Install X" → operation with "install", "apply", "setup" in name/description
   - "Create cluster" → operation with "create" and "kubernetes"
   - "Deploy X" → operation with "apply", "install"
   - "Remove X" → operation with "delete", "uninstall"

4. **Be Specific**:
   - "Install database" → Match to actual database tool (CNPG for PostgreSQL), not schema migration tools
   - "Install Argo CD" / "Install ArgoCD" → Match to ArgoCD installation
   - Consider the primary purpose of each tool from its description

### Response Format

Return **ONLY** valid JSON (no markdown, no code blocks, no explanations):

**If exact match found:**
```json
{
  "matched": true,
  "operation": {
    "tool": "ArgoCD",
    "operation": "install",
    "command": ["apply", "argocd"],  // COPY THIS EXACTLY from operations data - do NOT modify
    "description": "Installs ArgoCD with optional ingress and applications setup"
  }
}
```

**CRITICAL**: The `command` array MUST be copied **character-for-character** from the operations data. Do NOT infer, modify, or construct it based on the user's intent.

**If no match found:**
```json
{
  "matched": false,
  "reason": "No operation matches the intent 'Install FooBarBaz'. Use stage: 'list' to see all available operations."
}
```

### Important Rules

- Return **only one operation** (the best match)
- If no reasonable match exists, return `"matched": false` with helpful reason
- Be confident in your matches - don't be overly conservative
- Consider synonyms: "install" ≈ "setup" ≈ "deploy" ≈ "apply"
- **CRITICAL**: Use the **EXACT command array** from the operations data - do NOT modify it
  - User may say "cross plane" but if operation command is ["apply", "crossplane"], use that exactly
  - User may say "external secrets" but if command is ["apply", "externalsecrets"], use that exactly
  - Match by description/meaning, but return the exact command from operations data
- Extract tool name from the operation name or description
- Extract operation type from the command or description (e.g., "install" for apply commands)

### Examples

**Intent**: "Install Crossplane"
**Operations**:
```json
[{
  "name": "Crossplane",
  "description": "Infrastructure management tool",
  "operations": [{"name": "apply", "command": ["apply", "crossplane"]}]
}]
```
→ Match to: `{"matched": true, "operation": {"tool": "Crossplane", "operation": "apply", "command": ["apply", "crossplane"], "description": "Infrastructure management tool"}}`

**Intent**: "Create a kind cluster"
**Operations**:
```json
[{
  "name": "Kubernetes",
  "description": "Kubernetes cluster management",
  "operations": [{"name": "create", "command": ["create", "kubernetes", "kind"]}]
}]
```
→ Match to: `{"matched": true, "operation": {"tool": "Kubernetes", "operation": "create", "command": ["create", "kubernetes", "kind"], "description": "Kubernetes cluster management"}}`

**Intent**: "Install FooBarBaz"
**Operations**: `[{...no matching operations...}]`
→ No match: `{"matched": false, "reason": "No operation matches the intent 'Install FooBarBaz'. Use stage: 'list' to see all available operations."}`

**REMEMBER**: Always copy the exact `command` array from the operations data!

Now analyze the user intent and return the matching operation in JSON format.
