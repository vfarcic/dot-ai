# PRD: Dependency & Impact Analysis

**Issue**: #405
**Created**: 2026-03-13
**Status**: Planning
**Priority**: Medium
**Owner**: TBD

## Executive Summary

Map resource dependencies before operations to prevent cascading failures. Surface impact analysis within query, operate, and remediate workflows — showing what resources are affected before any destructive or modifying action is taken.

## Problem Statement

Users have no way to understand the blast radius of operations. Deleting a PVC, upgrading a CRD, or scaling a deployment can have cascading effects that are invisible until something breaks. The operate and remediate tools execute changes without showing downstream dependencies.

## Success Criteria

- Impact analysis surfaced before destructive operations in operate workflow
- Queryable via natural language ("what depends on this PVC?")
- Works with both built-in Kubernetes resources and CRDs/custom operators
- Confidence level communicated to users (definite, likely, uncertain)

## Solution Overview

Use AI reasoning to discover dependencies rather than building a hardcoded relationship mapping engine. The AI combines three sources of knowledge to build dependency graphs:

1. **Built-in AI knowledge** — The AI already understands standard Kubernetes relationships (Deployment→ReplicaSet→Pod, Service→Endpoints) and ecosystem tools (Crossplane XR→MR, Istio VirtualService→Service, etc.). No need to enumerate these — the AI uses its own judgement.
2. **Knowledge base** — If users have ingested operator docs or architecture documentation, the AI can search it for cluster-specific relationship information. However, we cannot assume this is available.
3. **Runtime cluster inspection** — The AI uses existing query tools to inspect the actual cluster: ownerReferences on child resources, resource specs that reference other resources by name, events linking related resources, labels/annotations tracing lineage.

The AI iteratively follows dependency chains using existing tools (kubectl_get, query) and its own reasoning — the same way a human expert would investigate. No new programmatic dependency graph engine is needed.

**Confidence communication**: Since completeness cannot be guaranteed (especially for unknown CRDs), the AI communicates confidence:
- **Definite** — confirmed from cluster data (e.g., ownerReferences found)
- **Likely** — based on AI knowledge of the ecosystem (e.g., "Crossplane typically manages MRs for this XR")
- **Uncertain** — insufficient information; suggests user check operator docs or ingest them into the knowledge base

## Design Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-19 | AI-first discovery instead of hardcoded mapping | Enumerating all relationship types is impossible — every operator invents its own model (Crossplane, Istio, KEDA, etc.). AI already knows these ecosystems. |
| 2026-03-19 | No programmatic dependency graph engine | ownerReferences are bottom-up only (child→parent), making reverse lookups expensive. AI can use existing query tools to discover relationships iteratively. |
| 2026-03-19 | Confidence-level communication | AI cannot guarantee completeness for unknown CRDs without docs, so it must communicate certainty to the user. |

## Milestones

- [ ] Milestone 1: Discovery & design — define how AI prompts structure dependency analysis, agree on confidence-level UX, identify integration points in operate/remediate/query
- [ ] Milestone 2: Dependency analysis in operate — surface impact warnings with confidence levels before destructive operations
- [ ] Milestone 3: Query integration — answer dependency questions via natural language ("what depends on this database?")
- [ ] Milestone 4: Integration tests and documentation
