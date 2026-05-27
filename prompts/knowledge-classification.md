Classify this document by determining whether it contains policy content,
pattern content, both, or neither.

A **policy** is a rule, requirement, constraint, or guideline that should be enforced
during infrastructure/application deployments. Examples:
- "All databases must use PostgreSQL"
- "Container images must come from approved registries"
- "Services must have health checks defined"

A **pattern** is a reusable deployment template or architectural approach. Examples:
- "Public web applications use Deployment + Service + Ingress"
- "Stateful workloads use StatefulSet + PVC + headless Service"
- "Event-driven services use Knative Serving with autoscaling"

Return ONLY a JSON array of applicable tags. Possible values: "policy", "pattern".
- If the document contains policy content, include "policy"
- If the document contains pattern content, include "pattern"
- If it contains both, include both: ["policy", "pattern"]
- If it contains neither, return an empty array: []

Do not include any explanation, markdown formatting, or text outside the JSON array.

Document:
{{{documentContent}}}
