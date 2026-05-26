---
name: dot-ai-impact_analysis
description: "Analyze the blast radius of a proposed Kubernetes operation. Accepts free-text input: kubectl commands (e.g., \"kubectl delete pvc data-postgres-0 -n production\"), YAML manifests, or plain-English descriptions (e.g., \"what happens if I delete the postgres database?\"). Returns whether the operation is safe and a detailed dependency analysis with confidence levels."
user-invocable: true
---

# dot-ai impact_analysis

Analyze the blast radius of a proposed Kubernetes operation. Accepts free-text input: kubectl commands (e.g., "kubectl delete pvc data-postgres-0 -n production"), YAML manifests, or plain-English descriptions (e.g., "what happens if I delete the postgres database?"). Returns whether the operation is safe and a detailed dependency analysis with confidence levels.

## Usage

```bash
dot-ai impact_analysis
```
