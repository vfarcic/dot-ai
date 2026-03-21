---
sidebar_position: 7
---

# Impact Analysis Guide

**Complete guide for AI-powered dependency and blast radius analysis with the DevOps AI Toolkit.**

> **Note**: The examples below use MCP, but this tool is also available via the [CLI](https://devopstoolkit.ai/docs/cli), [Web Dashboard](https://devopstoolkit.ai/docs/ui), and [Headlamp Plugin](https://devopstoolkit.ai/docs/headlamp).

## Prerequisites

Before using this guide, complete the [Deployment Guide](../setup/deployment.md).

**Optional but recommended:**
- Scanned capabilities — see [Capability Management](capability-management.md)
- Resources synced to Vector DB — automatically handled by the [dot-ai-controller](https://devopstoolkit.ai/docs/controller/setup-guide)

## Overview

**What it does:**
- **Blast radius assessment** — Maps all resources affected by a proposed operation before you execute it
- **Multi-level dependency tracing** — Follows dependency chains iteratively (e.g., PVC → Pod → Service → Ingress), not just first-level relationships
- **Free-text input** — Accepts kubectl commands, YAML manifests, or plain-English descriptions
- **Confidence-level reporting** — Categorizes each discovered dependency as Definite, Likely, or Uncertain
- **GitOps-aware** — When you reference a git repo and file change, clones the repo and reads the actual manifest to verify the change
- **Safe/not-safe verdict** — Returns a clear signal on whether the operation is safe to proceed

**Use when:**
- Unsure about the impact of an operation on your cluster

### How It Works

The AI combines three sources to discover dependencies:

1. **Built-in AI knowledge** — Standard Kubernetes relationships (Deployment → ReplicaSet → Pod, Service → Endpoints) and ecosystem tools (CNPG Cluster → Pod/PVC/Service, Crossplane XR → MR, Istio VirtualService → Service, etc.)
2. **Cluster inspection** — Reads the actual cluster state: ownerReferences, resource specs that reference other resources by name, events, labels, and annotations
3. **Capabilities and resources** — If available, searches the Vector DB for semantic understanding of your cluster's resource types and their relationships

The AI iteratively follows dependency chains using these sources — the same way a human expert would investigate. When it can't confirm a relationship, it tells you.

### Confidence Levels

Each dependency in the analysis is tagged with a confidence level:

| Level | Meaning | Example |
|-------|---------|---------|
| **Definite** | Confirmed from cluster data or git source | ownerReference links Pod to its parent Cluster |
| **Likely** | Based on ecosystem knowledge, not verified in cluster | "CNPG typically creates a Service for each Cluster" |
| **Uncertain** | Might be affected but cannot confirm | Unknown CRD without documentation |

## Complete Workflow Examples

### Plain-English Input

```text
User: What happens if I delete the postgres service in the production namespace?
```

```text
Agent: I'll analyze the blast radius of deleting the postgres service.

[Uses impact_analysis tool with input: "what happens if I delete the postgres service in the production namespace?"]

The operation is NOT safe. Here's the analysis:

There's no service literally named "postgres" — the CNPG Cluster "test-pg" manages
three services: test-pg-rw, test-pg-r, and test-pg-ro.

Deleting any of them would cause:

DEFINITE impact:
- test-pg-rw — clients using it for write access to the primary (test-pg-1)
  lose connectivity immediately
- test-pg-r — clients reading from any instance lose connectivity
- test-pg-ro — clients using read-only routing lose connectivity

LIKELY impact:
- The CNPG operator will automatically recreate deleted services, but there's
  a disruption window
- Applications in other namespaces with hardcoded DNS references will get
  connection failures
- Monitoring targets become unavailable

Risk summary:
- Data loss risk: LOW — services are networking constructs, not data
- Service disruption risk: HIGH — all database connectivity breaks immediately
- Automatic recovery: YES — the operator recreates services within minutes,
  but there's a gap
- Cascading failures: MEDIUM — anything currently connected will fail

Recommendation: Don't delete these services. If you need to reconfigure,
modify them instead.
```

**What happened behind the scenes:**
- AI parsed the plain-English description and identified the target resources
- No service named "postgres" existed — AI discovered the actual CNPG-managed services
- Investigation traced dependencies: Services → Pods → client connections → monitoring
- Confidence levels distinguished between confirmed cluster state (Definite) and ecosystem knowledge (Likely)

---

### GitOps Manifest Change

When you reference a git repository and file change, the AI clones the repo and reads the actual manifest to verify what's changing.

```text
User: In repo https://github.com/vfarcic/dot-ai.git, the file
tests/integration/fixtures/gitops/cnpg-cluster/cluster.yaml will be
changed to set spec.instances from 2 to 1. What is the impact?
```

```text
Agent: I'll analyze the impact of this GitOps manifest change.

[Uses impact_analysis tool]

The impact analysis confirms this change is safe. Here's the breakdown:

Affected Resources

Definite:
- Pod/gitops-pg-2 (replica) — will be terminated cleanly
- PVC/gitops-pg-2 — deleted after scale-down (contains only replica data)
- Pod/gitops-pg-1 (primary) — remains unchanged, keeps all data
- Services (gitops-pg-rw, gitops-pg-r, gitops-pg-ro) — auto-adjust routing,
  no disruption

Likely:
- PodDisruptionBudget — updates automatically, becomes more protective
  (0 allowed disruptions)
- ArgoCD Application/impact-analysis-pg — will briefly show OutOfSync,
  then auto-reconcile (<1 min)

Uncertain:
- No integration test dependencies found on this fixture

Key Takeaways:
- Data safety: Primary pod and PVC retain all data
- Service continuity: All connection strings and services remain valid
- HA degraded: Loses failover capability
- Rollback: Simple — revert to instances: 2, CNPG auto-creates a new
  replica in ~2-5 min

Safe to proceed.
```

**What happened behind the scenes:**
- AI cloned the git repository and read the actual manifest file
- Compared the proposed change (instances: 2 → 1) against the live cluster state
- Detected the Argo CD Application managing this resource and assessed sync impact
- Traced dependencies through Pods, PVCs, Services, and PodDisruptionBudgets

## Integration with Other Tools

Impact analysis works alongside the other DevOps AI Toolkit tools. You don't need to remember to call it — the other tools will suggest it when relevant:

- **[Operate](operate.md)** — After generating an operational proposal (scale, update, delete), the tool suggests running `impact_analysis` before executing to understand the blast radius
- **[Query](query.md)** — When you ask dependency or impact questions ("what depends on this database?"), the tool suggests `impact_analysis` for detailed blast radius analysis
- **[Remediate](remediate.md)** — When remediation involves destructive actions, the tool suggests running `impact_analysis` first to understand downstream effects

This is opt-in — existing tool response times are unchanged. The AI agent decides whether to follow the suggestion based on the context.
