# PRD #357: Policy Extraction from Knowledge Base

**Status**: No Longer Needed
**Created**: 2025-01-30
**Closed**: 2026-02-16
**GitHub Issue**: [#357](https://github.com/vfarcic/dot-ai/issues/357)
**Priority**: High
**Depends On**: PRD #356 (Knowledge Base System)
**Related**: Existing `manageOrgData` policy infrastructure
**Last Updated**: 2026-02-16

---

## Problem Statement

Manually creating policies via the existing `manageOrgData` tool is time-consuming. Organizations already have policies documented in various formats (markdown docs, wikis, runbooks) but these aren't automatically discoverable or usable by the AI system.

### Current Challenges

- **Manual Policy Creation**: Each policy must be created step-by-step via MCP tool
- **Hidden Policies**: Policies exist in documentation but aren't in the policy database
- **Duplication Risk**: Users may create policies that already exist in docs
- **Maintenance Burden**: When docs change, policies may become outdated
- **Discovery Gap**: AI can't enforce policies it doesn't know about

### User Impact

- **Platform Teams**: Spend significant time manually creating policies from existing documentation
- **AI System**: Misses organizational policies not yet entered into the system
- **Organizations**: Risk of policy drift between documentation and enforcement

---

## Solution Overview

Extend the system to automatically extract structured policies from the knowledge base (PRD #356), using AI classification and extraction with human-in-the-loop review workflow.

### Key Principles

1. **Human-in-the-Loop**: All extracted policies require approval before becoming active
2. **Leverage Existing Infrastructure**: Store approved policies via existing `manageOrgData` policy tools
3. **Provenance Tracking**: Link policies back to source chunks for audit trail
4. **Confidence Scoring**: AI provides confidence scores to help prioritize review

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  KNOWLEDGE BASE (PRD #356)                                      │
│  "knowledge-base" collection in Qdrant                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. CLASSIFICATION                                              │
│     AI analyzes chunks: "Is this policy-relevant?"              │
│     Uses Instructor for structured output                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ policy-relevant chunks
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. EXTRACTION                                                  │
│     AI extracts structured PolicyIntent from chunk              │
│     • description, triggers, rationale                          │
│     • confidence score                                          │
│     • source chunk reference                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ candidate policies
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. DEDUPLICATION                                               │
│     Check similarity against existing policies                  │
│     Flag potential duplicates for review                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. REVIEW WORKFLOW                                             │
│     MCP operations: listCandidates, reviewCandidate             │
│     User: approve / reject / edit                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ approved
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. POLICY STORAGE (Existing)                                   │
│     manageOrgData(dataType: 'policy', operation: 'create')      │
│     Stores in "policies" collection with embeddings             │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Stories

### Primary User Stories

1. **As a platform engineer**, I want to scan my knowledge base for policies so I can discover undocumented rules
   - **Acceptance**: Can trigger extraction scan on knowledge base chunks

2. **As a platform engineer**, I want to review extracted policy candidates so I can approve or reject them
   - **Acceptance**: Can list candidates, see source context, and approve/reject

3. **As a platform engineer**, I want approved policies stored in the existing policy system so they're enforced during deployments
   - **Acceptance**: Approved policies appear in `manageOrgData` policy searches

4. **As a user**, I want to see where a policy came from so I can verify it against the source
   - **Acceptance**: Policies have provenance links to source chunks

### Secondary User Stories

5. **As a platform engineer**, I want to be warned about potential duplicates so I don't create redundant policies
   - **Acceptance**: Extraction flags candidates similar to existing policies

6. **As a platform engineer**, I want to be notified when source documents change so I can review affected policies
   - **Acceptance**: Stale source chunks trigger policy review notifications

---

## Technical Approach

### Classification Prompt

Using Instructor for structured output:

```typescript
// Classification schema
interface ChunkClassification {
  isPolicyRelevant: boolean;
  confidence: number;           // 0.0 - 1.0
  relevanceReason?: string;     // Why it's policy-relevant
  policyType?: 'requirement' | 'recommendation' | 'constraint' | 'guideline';
}
```

Prompt template (`prompts/policy-classification.md`):

```markdown
Analyze this text chunk and determine if it contains organizational policy content.

A policy is a rule, requirement, constraint, or guideline that should be enforced
or considered during infrastructure/application deployments.

Examples of policies:
- "All databases must use PostgreSQL"
- "Production workloads should run in us-east-1"
- "Container images must come from approved registries"
- "Services must have health checks defined"

NOT policies:
- General documentation or tutorials
- Historical information or meeting notes
- Code examples without enforcement intent
- Marketing or promotional content

Text chunk:
{chunkContent}

Source: {sourceUri}
```

### Extraction Prompt

Using Instructor for structured output:

```typescript
// Extraction schema matching PolicyIntent
interface ExtractedPolicy {
  description: string;          // What the policy requires
  triggers: string[];           // Keywords that should match this policy
  rationale: string;            // Why this policy exists
  confidence: number;           // Extraction confidence 0.0 - 1.0
  extractionNotes?: string;     // Any caveats or uncertainties
}
```

Prompt template (`prompts/policy-extraction.md`):

```markdown
Extract a structured policy from this text. The policy should be actionable
and enforceable during Kubernetes deployments.

Guidelines:
- Description: Clear, imperative statement of what's required
- Triggers: Keywords that would indicate this policy applies
  (e.g., "database", "postgresql", "storage", "persistent")
- Rationale: Why this policy exists (compliance, security, cost, etc.)

Text chunk:
{chunkContent}

Source: {sourceUri}
Classification: {classificationResult}
```

### Policy Candidate Schema

```typescript
interface PolicyCandidate {
  id: string;                           // UUID

  // Extracted policy content
  description: string;
  triggers: string[];
  rationale: string;

  // Extraction metadata
  confidence: number;                   // AI confidence score
  extractionNotes?: string;
  extractedAt: string;
  extractedBy: string;                  // Model used

  // Source provenance
  sourceChunkId: string;                // Link to knowledge-base chunk
  sourceChunkContent: string;           // Snapshot of source text
  sourceUri: string;                    // Original source location

  // Review state
  status: 'pending' | 'approved' | 'rejected' | 'needs_edit';
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;

  // Deduplication
  similarPolicies?: Array<{
    id: string;
    description: string;
    similarity: number;
  }>;

  // After approval
  createdPolicyId?: string;             // ID in policies collection
}
```

### Extended PolicyIntent (Provenance)

Small addition to existing type:

```typescript
interface PolicyIntent {
  // ... existing fields ...

  // NEW: Optional extraction provenance
  extraction?: {
    sourceChunkId: string;              // Link to knowledge-base chunk
    sourceUri: string;                  // Original source location
    confidence: number;                 // Extraction confidence
    extractedAt: string;
    extractedBy: string;                // Model used
  };
}
```

### MCP Tool Extensions

Add extraction operations to existing `manageKnowledge` tool:

```typescript
// New operations for manageKnowledge
type KnowledgeOperation =
  | ... // existing operations from PRD #356
  | 'extractPolicies'      // Scan chunks for policy candidates
  | 'listCandidates'       // List pending policy candidates
  | 'getCandidate'         // Get candidate with source context
  | 'reviewCandidate'      // Approve/reject/edit candidate
  | 'listStalePolices';    // Policies whose sources changed

// Parameters
interface ManageKnowledgeParams {
  // ... existing params ...

  // For extractPolicies
  sourceId?: string;           // Extract from specific source, or all
  confidenceThreshold?: number; // Minimum confidence to keep (default: 0.5)

  // For candidate operations
  candidateId?: string;

  // For reviewCandidate
  action?: 'approve' | 'reject' | 'edit';
  editedPolicy?: {             // For edit action
    description?: string;
    triggers?: string[];
    rationale?: string;
  };
  reviewNotes?: string;
}
```

### Library: Instructor

Using Instructor for structured extraction:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import Instructor from "@instructor-ai/instructor";

const client = Instructor({
  client: new Anthropic(),
  mode: "TOOLS",
});

// Classification
const classification = await client.chat.completions.create({
  model: "claude-sonnet-4-20250514",
  response_model: { schema: ChunkClassificationSchema },
  messages: [{ role: "user", content: classificationPrompt }],
});

// Extraction
const extracted = await client.chat.completions.create({
  model: "claude-sonnet-4-20250514",
  response_model: { schema: ExtractedPolicySchema },
  messages: [{ role: "user", content: extractionPrompt }],
});
```

---

## Milestones

### Milestone 1: Classification Pipeline
**Goal**: Identify policy-relevant chunks in knowledge base

**Success Criteria**:
- [ ] Classification prompt template created
- [ ] Instructor integration for structured output
- [ ] ChunkClassification schema implemented
- [ ] Can classify chunks as policy-relevant or not
- [ ] Confidence scores guide filtering
- [ ] Integration tests for classification

**Validation**:
- Correctly identifies policy content in test documents
- Filters out non-policy content (tutorials, code examples)
- Confidence scores correlate with actual relevance

---

### Milestone 2: Extraction Pipeline
**Goal**: Extract structured policies from relevant chunks

**Success Criteria**:
- [ ] Extraction prompt template created
- [ ] ExtractedPolicy schema implemented
- [ ] Triggers are meaningful and comprehensive
- [ ] Rationale captures the "why"
- [ ] Confidence reflects extraction quality
- [ ] Integration tests for extraction

**Validation**:
- Extracted policies are well-structured
- Triggers would match appropriate queries
- Rationale explains policy purpose

---

### Milestone 3: Candidate Storage and Deduplication
**Goal**: Store candidates and detect duplicates

**Success Criteria**:
- [ ] PolicyCandidate schema implemented
- [ ] Candidates stored in Qdrant (separate collection or tagged)
- [ ] Similarity check against existing policies
- [ ] Similar policies flagged with similarity scores
- [ ] Integration tests for candidate management

**Validation**:
- Candidates persisted correctly
- Duplicates detected with reasonable accuracy
- Can list and retrieve candidates

---

### Milestone 4: Review Workflow
**Goal**: Human-in-the-loop review process

**Success Criteria**:
- [ ] listCandidates operation working
- [ ] getCandidate returns full context (source chunk, similar policies)
- [ ] reviewCandidate supports approve/reject/edit
- [ ] Approved candidates create policies via existing infrastructure
- [ ] Policy provenance (extraction field) populated
- [ ] Integration tests for review workflow

**Validation**:
- Can review candidates with full context
- Approval creates policy in policies collection
- Rejection removes candidate
- Edit allows modification before approval

---

### Milestone 5: MCP Tool Integration
**Goal**: All operations accessible via manageKnowledge

**Success Criteria**:
- [ ] extractPolicies operation triggers full pipeline
- [ ] Progress feedback for long-running extraction
- [ ] Clear error messages and guidance
- [ ] Documentation for extraction workflow
- [ ] Integration tests for MCP operations

**Validation**:
- End-to-end extraction workflow via MCP tool
- Users can follow documented workflow
- Errors guide users to resolution

---

### Milestone 6: Stale Policy Detection
**Goal**: Detect when source documents change

**Success Criteria**:
- [ ] Link between policies and source chunks maintained
- [ ] When chunk marked stale, linked policies flagged
- [ ] listStalePolicies operation working
- [ ] Clear guidance on how to update
- [ ] Integration tests for stale detection

**Validation**:
- Source document changes flag related policies
- Users can review and update affected policies
- Audit trail maintained

---

## Success Criteria

### Functional Success
- [ ] Can extract policy candidates from knowledge base
- [ ] Classification filters non-policy content effectively
- [ ] Extraction produces well-structured policies
- [ ] Review workflow is intuitive
- [ ] Approved policies work with existing infrastructure

### Quality Success
- [ ] Classification accuracy > 80% (policy vs non-policy)
- [ ] Extraction quality reviewed favorably by users
- [ ] Duplicate detection catches > 70% of duplicates
- [ ] End-to-end workflow < 5 minutes per batch review

### Architecture Success
- [ ] Reuses existing policy storage and search
- [ ] Provenance enables audit and updates
- [ ] Clean separation between extraction and storage

---

## Risks and Mitigations

### Risk 1: Low Extraction Quality
**Risk**: AI extracts poor policies that users always reject

**Mitigation**:
- Tune prompts based on real documents
- High confidence threshold initially
- Provide examples in prompts
- Iterate based on user feedback

**Severity**: High
**Likelihood**: Medium

---

### Risk 2: Too Many Candidates
**Risk**: Large knowledge bases produce overwhelming candidate volumes

**Mitigation**:
- Confidence threshold filters low-quality candidates
- Source filtering (extract from specific sources)
- Batch review UI with quick actions
- Priority ordering by confidence

**Severity**: Medium
**Likelihood**: Medium

---

### Risk 3: Duplicate Policies Created
**Risk**: Same policy extracted from multiple similar documents

**Mitigation**:
- Deduplication check before storing candidates
- Show similar policies during review
- Semantic similarity threshold for flagging

**Severity**: Low
**Likelihood**: Medium

---

### Risk 4: Stale Provenance Links
**Risk**: Source chunks deleted but policies remain

**Mitigation**:
- Policies remain valid even without source
- Mark provenance as "source removed"
- Don't delete policies automatically
- Notify for manual review

**Severity**: Low
**Likelihood**: Low

---

## Dependencies

### External Dependencies
- **Instructor**: Structured extraction library (MIT license)
- **Anthropic SDK**: For Claude-based extraction

### Internal Dependencies
- **PRD #356**: Knowledge Base System (must be complete)
- **Existing Policy Infrastructure**: `manageOrgData`, `PolicyVectorService`
- **Existing Embedding Service**: For deduplication similarity

### Blocked By
- PRD #356 (Knowledge Base) - requires knowledge base to extract from

### Blocks
- None

---

## Open Questions

1. **Candidate Storage**: Separate collection or same as policies with status field?
   - **Proposal**: Separate "policy-candidates" collection to avoid polluting policy searches

2. **Batch vs Interactive**: Extract all at once or chunk-by-chunk with review?
   - **Proposal**: Batch extraction with interactive review

3. **Re-extraction**: What happens if user re-extracts from same source?
   - **Proposal**: Skip chunks with existing candidates/policies unless forced

4. **Confidence Threshold**: What default threshold for keeping candidates?
   - **Proposal**: 0.5 initially, tunable per extraction

5. **Edit Workflow**: How detailed should edit capabilities be?
   - **Proposal**: Allow editing description, triggers, rationale before approval

---

## Future Enhancements (Out of Scope)

### Phase 2: Other Extraction Types
- Runbook extraction (operational procedures)
- Pattern extraction (reusable templates)
- Glossary extraction (term definitions)

### Phase 3: Automated Confidence Tuning
- Learn from approval/rejection patterns
- Adjust confidence thresholds automatically
- Improve prompts based on feedback

### Phase 4: Continuous Extraction
- Watch for new knowledge base content
- Extract candidates automatically
- Notification system for new candidates

---

## References

- **Instructor**: https://github.com/jxnl/instructor
- **PRD #356**: Knowledge Base System
- **Existing Policy Types**: `src/core/organizational-types.ts`
- **Existing Policy Service**: `src/core/policy-vector-service.ts`
- **Existing Policy Operations**: `src/core/policy-operations.ts`

---

## Work Log

### 2025-01-30: PRD Creation
**Status**: Planning

**Completed Work**:
- Architecture design with human-in-the-loop review
- Classification and extraction prompt design
- Candidate schema with provenance tracking
- MCP tool extension design
- Milestone breakdown

**Key Decisions**:
- Human-in-the-loop (Option B) for initial implementation
- Use Instructor for structured extraction
- Separate candidate collection from policies
- Extend existing policy infrastructure rather than replace

**Next Steps**:
- Complete PRD #356 (Knowledge Base) first
- Begin Milestone 1: Classification pipeline
