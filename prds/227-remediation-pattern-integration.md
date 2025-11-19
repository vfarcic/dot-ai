# PRD: Integrate Patterns & Policies into Remediation Tool

**Issue**: #227  
**Created**: 2025-11-19  
**Status**: Planning  
**Priority**: Medium  
**Owner**: TBD  

## Executive Summary

Enhance the AI-powered remediation tool (`remediate`) to respect organizational standards by integrating it with the existing **Pattern & Policy System**. Instead of relying solely on generic Kubernetes knowledge, the tool will actively query the existing vector database using its proposed remediation intent (e.g., "scale deployment", "increase memory") to find and apply relevant governance rules and architectural patterns.

## Problem Statement

### Current Challenges
- **Generic Fixes**: The remediation tool applies standard Kubernetes fixes (e.g., `kubectl scale`) that may violate company standards (e.g., "Always use HPA").
- **Policy Violations**: AI might suggest resource limits (e.g., "4Gi memory") that exceed organizational quotas or policies, leading to admission controller rejections or non-compliant state.
- **Siloed Knowledge**: The rich repository of Patterns and Policies used by the *Recommendation* tool is currently ignored by the *Remediation* tool.

### User Impact
- **Inconsistency**: Deployments created via Recommendations follow standards, but fixes applied via Remediation drift from them.
- **Rework**: Users have to manually correct AI fixes to match internal standards.
- **Trust**: Users hesitate to use "Automatic" remediation mode if it risks violating policy.

## Success Criteria

- **Pattern Awareness**: Remediation tool successfully retrieves relevant patterns for a given remediation intent.
- **Policy Compliance**: Remediation tool identifies and respects policy constraints (e.g., max limits) during fix generation.
- **Integration**: Seamless integration with `src/tools/remediate.ts` without requiring user intervention.
- **Validation**: Test cases confirm that a generic "scale" intent is corrected by a "Scaling Pattern" if one exists.

## Solution Architecture

### Workflow
1.  **Investigation (Existing)**: AI analyzes the issue and determines the root cause.
2.  **Intent Formulation (New Step)**: AI formulates a *remediation intent* (e.g., "Increase memory limit for payment-service to 2Gi").
3.  **Knowledge Search (New Step)**:
    *   System queries the `patterns` and `policies` vector collections using this intent.
    *   Relevant matches (e.g., "Standard Go App Pattern", "Resource Limit Policy") are returned.
4.  **Solution Refinement (New Step)**:
    *   AI evaluates its original plan against the returned knowledge.
    *   *Example*: "Policy says max memory is 1.5Gi. I will adjust my fix to 1.5Gi."
    *   *Example*: "Pattern says use KEDA for scaling. I will create a ScaledObject instead of scaling the Deployment directly."
5.  **Execution (Existing)**: AI generates and executes the refined, compliant commands.

### Technical Components

#### 1. Tool Capability
The `remediate` tool needs access to the Vector DB services currently used by `recommend`.
- Inject `PatternVectorService` and `PolicyVectorService` into the `conductInvestigation` or `handleRemediateTool` flow.
- Create a helper function `searchOrganizationalKnowledge(intent: string)` that queries both collections.

#### 2. System Prompt Update
Update `prompts/remediate-system.md` to include a new instruction block:
> **ORGANIZATIONAL STANDARDS CHECK**:
> Before generating any remediation commands, you MUST verify if your proposed action aligns with organizational patterns or policies.
> 1. Formulate your intended action (e.g., "scale deployment").
> 2. Use the provided organizational context to check for constraints.
> 3. If a Policy prohibits your action, find a compliant alternative.
> 4. If a Pattern suggests a specific approach, prefer that approach over generic Kubernetes commands.

## Implementation Milestones

### Milestone 1: Service Integration
**Goal**: Enable the remediation tool to access Pattern and Policy services.
- [ ] Import `PatternVectorService` and `PolicyVectorService` in `src/tools/remediate.ts`.
- [ ] Implement `searchOrganizationalKnowledge(intent)` function within the tool handler.
- [ ] Ensure graceful fallback if Vector DB is unavailable.

### Milestone 2: Prompt Engineering & Context Injection
**Goal**: Instruct the AI to use the retrieved knowledge.
- [ ] Update `prompts/remediate-system.md` to include instructions for using organizational knowledge.
- [ ] Modify the tool loop to perform the search *after* root cause analysis but *before* final solution generation.
- [ ] Inject search results into the AI's context window.

### Milestone 3: Validation & Testing
**Goal**: Verify that patterns actually influence remediation.
- [ ] Create a test case with a restrictive Policy (e.g., "Max Replicas: 3").
- [ ] Trigger a remediation scenario where the "natural" fix would violate this (e.g., "Scale to 5").
- [ ] Verify that the AI adjusts its solution to comply (e.g., "Scale to 3" or explains the limitation).

## Risks & Mitigations

- **Latency**: Vector search adds time to the remediation loop. *Mitigation*: Run searches in parallel or only for high-impact actions.
- **Context Window**: Too many patterns might confuse the AI. *Mitigation*: Limit search results to top 3-5 most relevant matches.
- **Conflicting Instructions**: Pattern might contradict the immediate fix needed for stability. *Mitigation*: Instruct AI to prioritize *stability* for critical issues but *compliance* for non-critical ones.

## Dependencies
- **Existing Pattern/Policy Services**: Already implemented for Recommendation tool.
- **Vector DB**: Must be running and populated.

