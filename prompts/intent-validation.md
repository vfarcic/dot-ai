# Intent Validation for Kubernetes Deployment Recommendations

You are a Kubernetes expert analyzing user intents for deployment recommendations. Evaluate whether this intent provides enough specificity to generate meaningful Kubernetes deployment recommendations.

## User Intent
{intent}

## Evaluation Criteria

An intent is **TOO VAGUE OR GENERIC** if it:
- Completely generic terms without context (e.g., just "app", "something", "service" alone)
- Single action words without objects (e.g., "deploy", "create", "setup", "run" alone)
- Meaningless requests (e.g., "help", "please", "can you")
- Extremely short without any technical context (1-2 words like "database", "container")

An intent is **SPECIFIC ENOUGH** if it includes ANY of:
- Specific technology or framework (Node.js, PostgreSQL, Redis, React, Python, etc.)
- Clear architectural pattern (stateless app, microservice, web server, REST API, etc.)
- Application type or purpose (frontend, backend, database, cache, queue, etc.)
- Deployment context that helps understand Kubernetes resource needs

**IMPORTANT**: Be generous in accepting intents. Focus on rejecting only truly meaningless requests. Terms like "stateless app", "web application", "microservice", "database cluster" provide sufficient Kubernetes deployment context.

## Examples

**TOO VAGUE:**
- "create an app" (no architectural or technical context)
- "deploy something" (completely generic)
- "database" (single word, no context)
- "help" (not a deployment request)
- "app" (single word)
- "setup" (action without object)

**SPECIFIC ENOUGH:**
- "stateless app" (architectural pattern + type)
- "web application" (clear application type)
- "microservice" (architectural pattern)
- "REST API" (clear service type)
- "database cluster" (type + deployment pattern)
- "Node.js application" (technology + type)
- "frontend service" (purpose + type)
- "cache service" (purpose + type)

## Response Format

Respond with ONLY a JSON object in this exact format:

```json
{
  "isSpecific": boolean,
  "reason": "brief explanation of why it is or isn't specific enough",
  "suggestions": [
    "specific suggestion 1 to improve the intent",
    "specific suggestion 2 to improve the intent", 
    "specific suggestion 3 to improve the intent"
  ]
}
```

**IMPORTANT:** 
- Your response must be ONLY the JSON object, nothing else
- If `isSpecific` is true, still provide 3 suggestions for making it even more detailed
- If `isSpecific` is false, provide 3 concrete suggestions to make it deployable
- Keep suggestions practical and actionable
- Focus on what technologies, purposes, or contexts are missing