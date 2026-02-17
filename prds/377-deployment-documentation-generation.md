# PRD #377: Deployment Documentation Generation for Knowledge Base

**Status**: Planning
**Created**: 2026-02-17
**GitHub Issue**: [#377](https://github.com/vfarcic/dot-ai/issues/377)
**Priority**: High
**Owner**: TBD
**Last Updated**: 2026-02-17
**Supersedes**: [PRD #228](./done/228-deployment-documentation-learning.md) (Deployment Documentation & Example-Based Learning)

---

## Problem Statement

When the recommend tool generates Kubernetes manifests, all context about *why* certain decisions were made is lost. Each new recommendation starts from scratch with no memory of past deployments. There is no organizational memory of deployment decisions, rationale, trade-offs, or patterns applied.

### User Impact

- **Inconsistent deployments**: Similar applications get deployed differently because the AI has no memory of past decisions
- **Lost knowledge**: New team members can't see how previous deployments were configured and why
- **Repetitive explanations**: Users repeatedly explain the same deployment preferences to the AI
- **Lower accuracy**: Recommendations could be more accurate if informed by real deployment history

---

## Solution Overview

Enhance the recommend tool's `generateManifests` step to also produce a deployment documentation markdown file. Propose committing this file to the user's Git repo through their existing workflow (PR, branch, direct commit). The existing `GitKnowledgeSource` controller automatically ingests the doc into the unified knowledge base. Future recommendations find relevant past deployments through the unified KB search.

### Key Architecture Decisions

1. **Git is the source of truth** — deployment docs live in version-controlled repos alongside manifests. Vector DB is a derived index that can be rebuilt from Git at any time.

2. **Leverage existing infrastructure** — no new collections, CRDs, pipelines, or search endpoints. Uses the `GitKnowledgeSource` controller and unified knowledge base (PRD #375) that already exist.

3. **User approval workflows** — deployment docs go through the user's existing Git workflow (PRs, reviews, branch policies) before becoming organizational knowledge. This prevents bad recommendations from polluting the KB without human review.

4. **AI classification via PRD #375** — the unified KB's AI classification during ingestion automatically tags deployment docs (likely `["pattern"]` or a `["deployment-example"]` tag), making them discoverable by recommend, operate, and remediate tools.

### End-to-End Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User runs recommend tool                                  │
│    - AI generates Kubernetes manifests (existing)            │
│    - AI generates deployment documentation (NEW)             │
│    - Both returned to user                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 2. Propose to Git repo (via PRD #362 Git Operations)         │
│    - Create PR or commit with manifests + docs               │
│    - User reviews through their normal workflow              │
│    - User merges when satisfied                              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 3. Automatic ingestion (existing infrastructure)             │
│    - GitKnowledgeSource controller detects changes           │
│    - Controller sends doc to MCP server                      │
│    - AI classifies, chunks, embeds, stores in unified KB     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 4. Future recommendations benefit (existing infrastructure)  │
│    - User runs recommend for a new deployment                │
│    - Unified KB search finds relevant past deployment docs   │
│    - AI uses past examples as context for better accuracy    │
└─────────────────────────────────────────────────────────────┘
```

Steps 3 and 4 require **zero new code** — they use the existing GitKnowledgeSource controller and unified KB search from PRD #375.

---

## Requirements

### Functional Requirements

1. **Documentation generation**: `generateManifests` produces a markdown document alongside YAML manifests, capturing:
   - User intent (what they asked to deploy)
   - Solution overview (what was generated and why)
   - Key decisions (replicas, storage, resource limits, etc.) and their rationale
   - Patterns applied (from organizational patterns)
   - Policies satisfied (from organizational policies)
   - Resources deployed (list of Kubernetes resources with key config)
   - User answers to configuration questions

2. **Git proposal**: After generating manifests + docs, propose committing both to the user's Git repo using PRD #362's Git operations. The doc should live alongside the manifests.

3. **Concise output**: Keep deployment docs short enough to work well with the KB's chunking (ideally under 1000 characters for single-chunk ingestion, or structured so each section is meaningful when chunked independently).

### Non-Functional Requirements

- **No new infrastructure**: No new Qdrant collections, CRDs, controllers, or search endpoints
- **No latency impact on recommendations**: Doc generation happens after manifest generation, not on the retrieval path
- **Graceful degradation**: If Git operations fail, the user still gets their manifests and docs — they can commit manually

---

## Dependencies

### Prerequisites

| Dependency | Why Needed | Status |
|---|---|---|
| **PRD #375** (Unified Knowledge Base) | Consumer tools (recommend, operate, remediate) must search unified KB with tags so past deployment docs are discoverable | Planning |
| **PRD #362** (Git Operations for Recommend Tool) | Recommend tool needs ability to propose files to user's Git repo | Open |

### Existing Infrastructure (No Changes Needed)

- `GitKnowledgeSource` controller — ingests docs from Git repos into KB
- `manageKnowledge` ingestion pipeline — chunks, embeds, stores documents
- AI classification during ingestion (PRD #375) — tags docs automatically
- Unified KB search — returns results with tags to consumer tools

---

## Milestones

### Milestone 1: Documentation Generation
**Goal**: `generateManifests` produces a deployment doc alongside YAML

- [ ] Create deployment documentation prompt template (`prompts/deployment-documentation.md`)
- [ ] Enhance `generateManifests` to call AI with solution data to produce a markdown doc
- [ ] Doc captures: intent, solution overview, decisions, patterns, policies, resources, answers
- [ ] Return doc alongside manifests in the response
- [ ] Integration tests for documentation generation

**Success Criteria**: When a user completes the recommend workflow, they receive both YAML manifests and a deployment documentation markdown file.

---

### Milestone 2: Git Proposal Integration
**Goal**: Propose deployment docs + manifests to user's Git repo

- [ ] After generating manifests + docs, use PRD #362's Git operations to propose a commit/PR
- [ ] Place doc alongside manifests in the repo (e.g., `docs/deployments/` or next to manifests)
- [ ] Handle Git operation failures gracefully (user still gets manifests + docs locally)
- [ ] Integration tests for Git proposal flow

**Depends on**: PRD #362 (Git Operations for Recommend Tool)

**Success Criteria**: After manifest generation, the system proposes a PR/commit containing both manifests and deployment docs to the user's Git repo.

---

### Milestone 3: End-to-End Validation
**Goal**: Verify the full loop — generate, commit, ingest, retrieve

- [ ] Full workflow test: generate manifests + docs → commit to Git repo watched by GitKnowledgeSource → verify ingestion into KB → verify retrieval during new recommendation
- [ ] Verify AI classification tags deployment docs appropriately
- [ ] Verify recommend tool finds past deployment docs in unified KB search results
- [ ] Verify AI uses past deployment context to improve recommendations

**Depends on**: PRD #375 (Unified Knowledge Base)

**Success Criteria**: A deployment doc generated by the recommend tool flows through Git → controller → KB, and is retrieved as context during a subsequent recommendation for a similar deployment.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| PRD #362 (Git ops) delayed | Milestone 2 blocked | Milestone 1 (doc generation) is independent and delivers value on its own — users can commit manually |
| PRD #375 (unified KB) delayed | Milestone 3 blocked | Milestones 1 and 2 still deliver value — docs exist in Git for human consumption even without KB ingestion |
| Generated docs are low quality | Bad examples pollute KB | PR workflow gives humans review/edit opportunity before merge; docs can be improved post-merge and controller re-ingests |
| Chunking fragments deployment records | Reduced retrieval quality | Keep docs concise; structure sections to be meaningful independently; multiple chunks from same URI appear in search results |

---

## What Changed from PRD #228

PRD #228 designed a custom system with a separate `deployment-examples` Qdrant collection, custom CRDs for deployment tracking, a dedicated ingestion pipeline, and a hard dependency on `dot-ai-controller` PRD #4. That entire approach has been replaced:

| Aspect | PRD #228 (Old) | PRD #377 (New) |
|---|---|---|
| **Storage** | Separate `deployment-examples` collection | Unified `knowledge-base` collection (PRD #375) |
| **Ingestion** | Custom pipeline with dedicated CRDs | Existing GitKnowledgeSource controller |
| **Source of truth** | Vector DB | Git |
| **Approval workflow** | None | User's existing Git workflow (PRs) |
| **Dependency** | dot-ai-controller PRD #4 (CRD infrastructure) | PRD #362 (Git ops) + PRD #375 (unified KB) |
| **New infrastructure** | Collection, CRDs, controller, search endpoints | None — only a new prompt and enhanced generateManifests |
| **Milestones** | 4 | 3 (and Milestone 1 is independently valuable) |

---

## Open Questions

1. **Doc location in repo**: Where should deployment docs live relative to manifests? Same directory? A `docs/deployments/` subdirectory? Configurable?
2. **Doc filename convention**: Based on app name? Timestamp? Solution ID?
3. **Classification tag**: Should PRD #375's classification prompt be updated to recognize `"deployment-example"` as a tag, or is `"pattern"` sufficient?
4. **Conciseness vs. completeness**: How much detail should the generated doc contain? Shorter docs chunk better but capture less context.

---

## Work Log

### 2026-02-17: PRD Creation
**Status**: Planning

**Completed Work**:
- Created PRD based on analysis of existing knowledge base infrastructure and discussion
- Closed and superseded PRD #228
- Designed approach leveraging existing GitKnowledgeSource controller and unified KB (PRD #375)
- Established Git-as-source-of-truth architecture with user approval workflows

**Key Decisions**:
- Reuse existing infrastructure entirely — no new collections, CRDs, or pipelines
- Git is source of truth, Vector DB is derived index
- User approval via existing Git workflows (PRs) before docs become organizational knowledge
- Independent milestones — doc generation delivers value without Git ops or unified KB
- Supersedes PRD #228 which took a custom-infrastructure approach
