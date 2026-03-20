# PRD: Dependency & Impact Analysis

**Issue**: #405
**Created**: 2026-03-13
**Status**: In Progress
**Priority**: Medium
**Owner**: TBD

## Executive Summary

Map resource dependencies before operations to prevent cascading failures. Provide a standalone `impact_analysis` tool that accepts kubectl commands or GitOps manifest changes and returns blast radius with confidence levels. Existing tools (operate, remediate, query) guide users to call `impact_analysis` before executing destructive operations.

## Problem Statement

Users have no way to understand the blast radius of operations. Deleting a PVC, upgrading a CRD, or scaling a deployment can have cascading effects that are invisible until something breaks. The operate and remediate tools execute changes without showing downstream dependencies.

## Success Criteria

- Impact analysis surfaced before destructive operations in operate workflow
- Queryable via natural language ("what depends on this PVC?")
- Works with both built-in Kubernetes resources and CRDs/custom operators
- Confidence level communicated to users (definite, likely, uncertain)

## Solution Overview

A standalone `impact_analysis` MCP tool that uses AI reasoning to discover dependencies. The tool accepts free-text input — kubectl commands, YAML manifests, or a plain-English description of the planned operation. The AI parses whatever it receives and identifies target resources.

The AI combines three sources of knowledge to discover dependencies:

1. **Built-in AI knowledge** — The AI already understands standard Kubernetes relationships (Deployment→ReplicaSet→Pod, Service→Endpoints) and ecosystem tools (Crossplane XR→MR, Istio VirtualService→Service, etc.). No need to enumerate these — the AI uses its own judgement.
2. **Knowledge base** — If users have ingested operator docs or architecture documentation, the AI can search it for cluster-specific relationship information. However, we cannot assume this is available.
3. **Runtime cluster inspection** — The AI uses existing query tools to inspect the actual cluster: ownerReferences on child resources, resource specs that reference other resources by name, events linking related resources, labels/annotations tracing lineage.

The AI iteratively follows dependency chains using existing tools (kubectl_get, query) and its own reasoning — the same way a human expert would investigate. No new programmatic dependency graph engine is needed.

Existing tools (operate, remediate, query) are not modified to embed dependency analysis. Instead, they return `agentInstructions` suggesting users call `impact_analysis` before executing destructive operations. This keeps existing tool response times unchanged and makes impact analysis opt-in.

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
| 2026-03-19 | Standalone MCP tool instead of embedding into existing tools | Embedding dependency analysis into operate/remediate/query would add ~30-60s to every call, even for non-destructive operations. Standalone tool keeps existing response times unchanged and makes impact analysis opt-in. |
| 2026-03-19 | Free-text input instead of structured fields | AI-first philosophy — the AI can parse kubectl commands, YAML manifests, or plain-English descriptions. Structured fields add unnecessary parsing logic and constrain what users/agents can provide. |
| 2026-03-19 | Simple output: `safe` boolean + `summary` text | Consumer is another AI agent — it reads text natively. Rigid typed interfaces (AffectedResource, riskLevel enums) add complexity without value. `safe` boolean provides a clear programmatic signal for M2 integration. |
| 2026-03-19 | No separate namespace field | Consistent with free-text input decision — AI infers namespace from the input (kubectl `-n` flag, YAML metadata, or plain English). |
| 2026-03-19 | Single `agentInstructions` field, no `guidance` | Both fields serve the same purpose (instruct the consuming agent). Having both is redundant. |
| 2026-03-20 | Git/FS tools for GitOps source verification | When users reference a git repo and file change, the AI clones the repo and reads the file to verify the actual manifest — not just trust the description. Reuses existing `git_clone`/`fs_read`/`fs_list` internal tools from remediate. |
| 2026-03-20 | Tool descriptions are sufficient — no usage instructions in prompt | AI-first philosophy: tool descriptions tell the AI when to use each tool. Enumerating tool usage per source type in the system prompt is redundant and constraining. |
| 2026-03-20 | Rename operate's `nextAction` to `agentInstructions` | Operate's `nextAction` served the same purpose as `agentInstructions` in remediate and impact_analysis. Renamed for cross-tool consistency. |
| 2026-03-20 | Always present impact_analysis as an option, no conditional logic | Instead of only suggesting impact_analysis for destructive/high-risk operations, always present both options (execute directly or run impact_analysis first) and let the agent/user decide. Simpler code, no risk detection heuristics needed. |
| 2026-03-20 | Rename query's `guidance` to `agentInstructions` | Query was the last tool using `guidance`. Renamed for cross-tool consistency with operate and impact_analysis. Sent feature requests to dot-ai-ui and dot-ai-cli — no changes needed on their side. |

## Milestones

- [x] Milestone 1: Standalone impact_analysis tool — create MCP tool with AI prompts, free-text input, confidence-level output, and integration tests
- [x] Milestone 2: Operate/remediate integration — add agentInstructions to existing tools suggesting impact_analysis before destructive operations
- [x] Milestone 3: Query integration — answer dependency questions via natural language ("what depends on this database?")
- [ ] Milestone 4: Documentation
