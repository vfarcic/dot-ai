# PRD: Pattern & Policy Learning System

**Created**: 2025-11-16
**Status**: No Longer Needed
**Owner**: TBD
**Last Updated**: 2026-02-16
**Closed**: 2026-02-16
**Issue**: #218
**Priority**: Medium

## Executive Summary

Implement a learning system that improves patterns and policies over time by tracking usage metrics and using AI to suggest improvements. This system embeds simple counters directly in patterns/policies, analyzes workflow outcomes via AI, and presents actionable suggestions for user approval.

## Problem Statement

### Current Challenges
- **Static Knowledge Base**: Patterns and policies don't improve based on real usage
- **No Success Tracking**: Can't tell which patterns work well vs poorly
- **Gap Detection Missing**: Recurring user intents with weak pattern matches go unnoticed
- **No Evolution Mechanism**: Patterns that need updating stay outdated
- **Lost Insights**: When AI adds resources beyond patterns, that knowledge is lost

### User Impact
- **Platform Teams**: Can't identify which patterns need improvement or replacement
- **Development Teams**: Keep getting suboptimal recommendations because patterns don't evolve
- **AI System**: Makes same suggestions repeatedly without learning from outcomes
- **Organizations**: Miss opportunities to capture emerging deployment patterns

## Goals

### Primary Goals

1. **Learn from Usage**
   - Track which patterns/policies are recommended vs actually used
   - Identify patterns with high success rates vs low acceptance rates
   - Build confidence scores based on real outcomes

2. **Detect Gaps Automatically**
   - Identify recurring user intents with weak pattern matches
   - Notice when AI consistently adds resources beyond what patterns suggest
   - Flag combinations of patterns frequently used together

3. **Suggest Improvements**
   - AI analyzes workflow outcomes and proposes new patterns
   - AI suggests updates to existing patterns based on usage
   - AI recommends new policies for common configurations

4. **User-Controlled Evolution**
   - All suggestions require user approval via MCP tools
   - Clear rationale and evidence for each suggestion
   - Simple workflow to accept/reject/modify suggestions

## Solution Overview

### Three-Phase Approach

**Phase 1: Passive Usage Tracking**
- Add `usageMetrics` field to `OrganizationalPattern` and `PolicyIntent` interfaces
- Embed simple counters: timesRecommended, timesUsed, successRate
- Update counters automatically based on workflow stages
- No user-facing changes - just data collection

**Phase 2: AI-Driven Suggestions**
- At workflow completion, send context to AI for analysis
- AI examines: patterns retrieved, patterns used, resources generated, outcomes
- AI generates suggestions with rationale and confidence scores
- Present suggestions to user in final workflow stage
- User approves/rejects via existing MCP tools

**Phase 3: Enhanced Intelligence**
- Add frequency analysis (e.g., "added in 80% of cases")
- Cluster-specific performance tracking
- Pattern co-usage detection
- Higher confidence suggestions based on accumulated data

## Requirements

### Functional Requirements

1. **Usage Metrics Schema**
   ```typescript
   interface UsageMetrics {
     timesRecommended: number;
     timesUsed: number;
     commonAdditions: Map<string, number>; // Resources users add
     lastUsed: string;
   }
   ```

2. **Automatic Metric Updates**
   - Increment counters during recommend/operate workflows
   - No manual intervention required
   - Backwards compatible with existing patterns

3. **AI Suggestion Generation**
   - Triggered at workflow completion
   - Analyzes full workflow context
   - Returns structured suggestions with:
     - Type (create_pattern, update_pattern, create_policy)
     - Rationale (why this suggestion makes sense)
     - Draft (proposed content)
     - Confidence (0.0-1.0)
     - Evidence (supporting data)

4. **Suggestion Presentation**
   - New final stage in recommend/operate workflows
   - Clear presentation of suggestions
   - Instructions for using MCP tools to act on suggestions
   - Option to skip/dismiss

### Non-Functional Requirements

- **Performance**: Suggestion generation < 5 seconds
- **Backwards Compatibility**: Existing patterns work without usageMetrics
- **Storage**: Metrics stored in Qdrant with patterns/policies
- **Privacy**: No sensitive user data in metrics

## Implementation Milestones

### Milestone 1: Usage Metrics Foundation ⬜
**Goal**: Start collecting usage data without user-facing changes

**Tasks:**
- [ ] Add `usageMetrics` interface to organizational-types.ts
- [ ] Update PatternVectorService to handle metrics
- [ ] Initialize default metrics for existing patterns
- [ ] Update recommend tool to increment counters
- [ ] Update operate tool to increment counters
- [ ] Integration tests validating metric updates
- [ ] Documentation: Technical notes on metrics schema

**Success Criteria:**
- [ ] All patterns have usageMetrics field
- [ ] Counters increment correctly during workflows
- [ ] Backwards compatible with existing code
- [ ] Integration tests pass

**Estimated Duration**: 3-5 days

### Milestone 2: AI Suggestion Engine ⬜
**Goal**: Generate intelligent suggestions at workflow completion

**Tasks:**
- [ ] Create prompt template: `prompts/learning-suggestions.md`
- [ ] Implement suggestion generation function
- [ ] Add suggestion stage to recommend workflow
- [ ] Add suggestion stage to operate workflow
- [ ] Parse and format AI responses
- [ ] Handle edge cases (no suggestions, errors)
- [ ] Integration tests for suggestion generation
- [ ] Documentation: How suggestions work

**Success Criteria:**
- [ ] AI generates relevant suggestions based on context
- [ ] Suggestions include rationale and confidence
- [ ] Users see suggestions at workflow completion
- [ ] Suggestions are actionable via MCP tools
- [ ] Integration tests cover suggestion scenarios

**Estimated Duration**: 4-6 days

### Milestone 3: Frequency Analysis & Enhancement ⬜
**Goal**: Higher confidence suggestions based on patterns over time

**Tasks:**
- [ ] Implement frequency analysis for common additions
- [ ] Detect pattern co-usage patterns
- [ ] Add cluster-specific tracking (optional)
- [ ] Improve suggestion confidence scoring
- [ ] Add suggestion filtering (minimum confidence threshold)
- [ ] Integration tests for enhanced analysis
- [ ] Documentation: Understanding suggestion confidence

**Success Criteria:**
- [ ] Suggestions reference frequency data ("added in 80% of cases")
- [ ] High-frequency patterns get higher confidence
- [ ] Low-quality suggestions filtered out
- [ ] Integration tests validate frequency logic

**Estimated Duration**: 3-4 days

### Milestone 4: Production Validation ⬜
**Goal**: System validated with real-world usage

**Tasks:**
- [ ] Deploy to production environment
- [ ] Monitor suggestion quality
- [ ] Collect user feedback on suggestions
- [ ] Adjust confidence thresholds based on feedback
- [ ] Document best practices
- [ ] Create usage guide for platform teams

**Success Criteria:**
- [ ] 10+ suggestions generated in production
- [ ] 60%+ acceptance rate on suggestions
- [ ] No performance degradation
- [ ] User feedback positive
- [ ] Documentation complete

**Estimated Duration**: 1-2 weeks

## Technical Design

### Schema Changes

```typescript
// Add to OrganizationalPattern and PolicyIntent
interface BaseOrganizationalEntity {
  id: string;
  description: string;
  triggers: string[];
  rationale: string;
  createdAt: string;
  createdBy: string;

  // NEW: Usage metrics
  usageMetrics?: {
    timesRecommended: number;
    timesUsed: number;
    commonAdditions: Map<string, number>;
    lastUsed: string;
  };
}
```

### AI Suggestion Prompt

```markdown
# prompts/learning-suggestions.md

Analyze this deployment workflow and suggest improvements:

User Intent: {userIntent}

Patterns Retrieved: {patternsRetrieved}
Policies Retrieved: {policiesRetrieved}
Solution Generated: {solutionGenerated}

Suggest improvements:
1. New pattern needed? (weak matches or AI added resources)
2. Update existing pattern? (frequently modified)
3. New policy needed? (common configurations)

Return JSON with suggestions array.
```

### Workflow Integration

```typescript
// Final stage in recommend tool
{
  stage: 'learningSuggestions',
  result: 'success',
  suggestions: {
    patterns: [...],
    policies: [...]
  }
}
```

## Success Criteria

- [ ] **Data Collection Working**: 50+ patterns have usage metrics after 2 weeks
- [ ] **Suggestions Generated**: AI produces 5+ suggestions in first month
- [ ] **User Adoption**: 60%+ of suggestions approved or modified by users
- [ ] **Pattern Quality**: New patterns created from suggestions are used 3+ times
- [ ] **No Performance Impact**: Workflow completion time increases < 5 seconds

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| AI suggestions low quality | High | Medium | Start with high confidence threshold, tune based on feedback |
| Users ignore suggestions | Medium | Medium | Make suggestions optional, demonstrate value with examples |
| Performance impact | Medium | Low | Use fast AI models, cache results, async processing |
| Schema migration issues | Low | Low | Make usageMetrics optional, backwards compatible |

## Dependencies

- **Existing Infrastructure**:
  - ✅ Qdrant vector DB for pattern/policy storage
  - ✅ AI models (Claude/GPT) via Vercel AI SDK
  - ✅ RAG infrastructure for pattern matching
  - ✅ MCP tools for pattern/policy CRUD

## Open Questions

1. **Confidence Threshold**: What minimum confidence score should trigger suggestions? (0.6? 0.7?)
2. **Suggestion Limit**: How many suggestions to show at once? (3? 5?)
3. **Suggestion Storage**: Should we store rejected suggestions? For how long?
4. **Metrics Retention**: How long to keep usage metrics? (forever? 1 year?)
5. **Cross-Cluster Learning**: Should patterns learn across different clusters or per-cluster?

## Future Enhancements

- **Pattern Deprecation**: Automatically suggest deprecating low-usage patterns
- **A/B Testing**: Test new patterns with subset of users before rolling out
- **Suggestion History**: Track which suggestions were accepted/rejected over time
- **Collaborative Filtering**: "Users who used pattern X also used pattern Y"
- **Export/Import**: Share learned patterns across organizations (anonymized)

## Work Log

### 2025-11-16: PRD Creation
**Duration**: ~2 hours
**Status**: Planning

**Completed Work**:
- Created PRD based on architectural discussion
- Defined three-phase implementation approach
- Established schema changes and workflow integration
- Documented milestones with clear success criteria

**Key Decisions**:
- Embed metrics in patterns/policies vs separate collection
- AI-driven suggestions vs hardcoded rules
- User approval required for all changes
- Start simple, enhance based on real usage

**Next Steps**:
- Begin Milestone 1: Add usageMetrics schema
- Initialize metrics for existing patterns
- Update workflows to track usage

---

## Appendix

### Example Suggestion Output

```json
{
  "type": "create_pattern",
  "confidence": 0.85,
  "reason": "Users combined 'Public Web App' and 'Stateful Storage' patterns in 8 out of 10 recent deployments",
  "draft": {
    "description": "Public stateful web application with persistence",
    "triggers": ["public", "stateful", "web", "persistent"],
    "suggestedResources": ["StatefulSet", "Service", "Ingress", "PVC"],
    "rationale": "Combines public access with persistent storage for stateful web applications"
  },
  "evidence": {
    "frequency": 0.8,
    "recentCases": 10,
    "patternsUsed": ["public-web-123", "stateful-456"]
  }
}
```
