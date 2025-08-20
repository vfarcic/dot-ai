# PRD: Pattern-Driven Policy Generation System

**Created**: 2025-08-20
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2025-08-20
**GitHub Issue**: [#74](https://github.com/vfarcic/dot-ai/issues/74)

## Executive Summary

Create a unified governance system where organizational patterns serve as the single source of truth for both AI guidance and enforcement. When patterns are created, AI analyzes them to automatically generate validated Kyverno deny policies, creating defense-in-depth where patterns guide AI solution construction and policies enforce those patterns when users interact directly with the cluster.

## Problem Statement

**Current State**: Patterns guide AI recommendations but lack enforcement mechanisms when users interact directly with the cluster or when AI generates incorrect solutions. This creates governance gaps where organizational standards can be bypassed.

**Key Issues**:
- Patterns and policies are managed separately, causing drift
- No automatic translation of organizational knowledge into enforceable rules
- Users must manually create and maintain Kyverno policies
- Policies can become inconsistent with evolving patterns

## Solution Overview

**Pattern-Driven Policy Generation**: Extend existing pattern management to automatically generate Kyverno deny policies from patterns, creating unified governance where patterns guide creation and policies prevent violations.

### Core Innovation

**Unified Governance Model**:
- **Patterns**: Proactive guidance for AI to construct correct solutions
- **Policies**: Reactive enforcement when things go wrong or bypass AI
- **Single Source**: Same business rule enforced at multiple layers

**Architecture**: Pattern Creation → AI Analysis → Policy Generation → Validation → Apply/Save

## Technical Architecture

### Integration Points

**Extends Existing Infrastructure**:
- **`manageOrgData` tool**: Enhanced with policy generation capabilities
- **Capability Search**: Uses semantic search to find applicable resources
- **Schema Validation**: Leverages existing `discovery.explainResource()` for field validation
- **Vector DB**: Stores pattern-policy references for lifecycle management

### Validation Pipeline

```typescript
Pattern Content → AI Analysis → Resource Discovery → Schema Validation → Policy Generation → Dry-Run → User Confirmation
```

**Quality Gates**:
1. **AI Analysis**: Determines if pattern contains enforceable deny rules
2. **Semantic Search**: Finds applicable resources with confidence scoring (>0.7)
3. **Schema Validation**: Ensures policy fields exist in resource schemas
4. **Dry-Run**: Validates policies against Kyverno before deployment

### Deny-Only Policy Focus

**Scope**: Generate only deny policies that prevent resource creation
**Rationale**: 
- Clear safety net role
- No conflicts with AI guidance
- Easier to review and audit
- GitOps friendly

## User Workflows

### Pattern Creation with Policy Generation

```
1. User creates organizational pattern
2. AI analyzes pattern for enforceable deny rules
3. If rules found → ask user "Generate policies?"
4. If yes → discover applicable resources via semantic search
5. Fetch resource schemas and validate field references
6. Generate policies and run dry-run validation
7. Present to user: "Apply to cluster" or "Save as files"
8. Store pattern-policy references for lifecycle management
```

### Pattern Update with Policy Refresh

```
1. User updates existing pattern
2. Check if pattern has associated policies
3. If yes → regenerate policies with same validation pipeline
4. Present changes to user for approval
5. Update or replace existing policies
```

### Pattern Deletion with Policy Cleanup

```
1. User deletes pattern
2. Check for associated policies
3. If found → ask "Delete associated policies?"
4. If yes → remove policies from cluster and clean references
5. Delete pattern from Vector DB
```

## Implementation Details

### Phase 1: Kyverno Detection and System Integration

**Goal**: Extend version tool and prepare infrastructure

**Implementation**:
- [ ] Extend `version` tool to detect Kyverno installation and status
- [ ] Add Kyverno version compatibility checking
- [ ] Update error messages to guide users to Kyverno documentation
- [ ] Add system status checks for policy generation readiness

**Success Criteria**:
- Version tool reports Kyverno status clearly
- Users get helpful error messages when Kyverno is missing
- System gracefully handles missing Kyverno during pattern operations

### Phase 2: AI Analysis and Policy Generation

**Goal**: Core policy generation from patterns

**Implementation**:
- [ ] Create AI prompt template for deny rule analysis
- [ ] Implement semantic resource discovery using capability search
- [ ] Build schema validation pipeline using existing explainResource
- [ ] Create Kyverno policy generation with field validation
- [ ] Add dry-run validation before user confirmation

**Technical Requirements**:
- Only generate policies that reference fields existing in resource schemas
- Use confidence scoring (>0.7) to filter applicable resources
- Generate policies with clear attribution to source patterns
- Include metadata linking policies back to patterns

**Success Criteria**:
- 100% of generated policies pass dry-run validation
- Zero false positive field references
- Clear user feedback at each decision point

### Phase 3: Lifecycle Management and User Experience

**Goal**: Complete pattern-policy integration

**Implementation**:
- [ ] Extend pattern metadata to store policy references
- [ ] Implement policy update workflow for pattern changes
- [ ] Add policy cleanup during pattern deletion
- [ ] Create file save functionality for GitOps workflows
- [ ] Add policy status tracking and reporting

**Pattern Metadata Enhancement**:
```typescript
interface PatternMetadata {
  id: string;
  version: number;
  content: string;
  
  // Policy tracking (new)
  policyGeneration?: {
    analyzed: boolean;
    hasDenyRules: boolean;
    analysisDate: Date;
    detectedRules: string[];
  };
  
  // Applied policies (in cluster)
  appliedPolicies?: string[];
  
  // Saved policy files (for GitOps)
  savedPolicyFiles?: string[];
}
```

**Success Criteria**:
- Pattern-policy references maintained correctly
- Clean deletion removes all associated resources
- File save generates proper YAML for GitOps

### Phase 4: Documentation and Production Readiness

**Goal**: Complete documentation and production hardening

**Implementation**:
- [ ] Complete user-facing documentation
- [ ] Add troubleshooting guides
- [ ] Create example workflows
- [ ] Performance optimization and error handling
- [ ] Monitoring and alerting integration

## Documentation Changes

### Files Created/Updated

**New Files**:
- **`docs/pattern-policy-generation.md`** - Complete user guide for pattern-driven policy generation

**Updates Required**:
- **`README.md`** - Add pattern-driven policy generation to Key Features
- **`docs/mcp-tools-overview.md`** - Add policy generation to Pattern Management section
- **`docs/pattern-management-guide.md`** - Add policy generation workflow
- **`docs/mcp-setup.md`** - Add Kyverno detection and setup guidance
- **`CLAUDE.md`** - Add critical rules about policy generation and validation

### Content Traceability

All documentation changes will include `<!-- PRD-74 -->` comments for traceability.

## Success Criteria

### Technical Metrics
- [ ] 100% of generated policies pass Kyverno dry-run validation
- [ ] Zero policies generated with non-existent resource fields
- [ ] 90% user satisfaction with policy generation accuracy
- [ ] Policy generation completes within 30 seconds for typical patterns

### User Experience Metrics
- [ ] Users can generate policies without Kyverno knowledge
- [ ] Clear feedback at every decision point
- [ ] Seamless integration with existing pattern workflow
- [ ] GitOps compatibility through file save functionality

### Business Impact
- [ ] Unified governance reduces configuration drift
- [ ] Faster policy creation compared to manual Kyverno writing
- [ ] Improved compliance through automated policy generation
- [ ] Better alignment between AI recommendations and enforcement

## Risk Assessment

### Technical Risks
- **Schema Changes**: Resource schemas may change between versions
  - *Mitigation*: Validate policies against current cluster schemas
- **Kyverno Compatibility**: Different Kyverno versions have different features
  - *Mitigation*: Detect Kyverno version and generate compatible policies
- **Resource Overload**: Large clusters may have many applicable resources
  - *Mitigation*: Use confidence scoring to limit resource scope

### User Experience Risks
- **Policy Complexity**: Generated policies may be hard to understand
  - *Mitigation*: Clear attribution and explanation in policy annotations
- **False Positives**: AI may generate incorrect policies
  - *Mitigation*: Always require user confirmation before applying

## Dependencies

### External Dependencies
- **Kyverno**: Required for policy enforcement
- **Vector DB**: Qdrant for semantic pattern storage
- **Kubernetes API**: For resource schema discovery
- **AI Services**: Anthropic Claude for pattern analysis

### Internal Dependencies
- **Capability Management**: Required for semantic resource discovery
- **Pattern Management**: Foundation for this feature
- **Schema Service**: For resource field validation
- **MCP Infrastructure**: For user interaction

## Alternatives Considered

### Alternative 1: Separate Policy Management Tool
**Rejected**: Would create separate governance silos and configuration drift

### Alternative 2: Policy-First Approach
**Rejected**: Patterns are more natural for users than policy syntax

### Alternative 3: Manual Policy Creation
**Rejected**: Doesn't solve the governance unification problem

## Success Milestones

### Milestone 1: Foundation Ready (Week 1)
- [ ] Kyverno detection integrated in version tool
- [ ] AI analysis pipeline for pattern deny rules
- [ ] Basic policy generation with schema validation

### Milestone 2: Core Functionality (Week 2)
- [ ] End-to-end policy generation from patterns
- [ ] Dry-run validation and user confirmation
- [ ] Apply/save functionality working

### Milestone 3: Lifecycle Management (Week 3)
- [ ] Pattern-policy references maintained
- [ ] Update and deletion workflows complete
- [ ] Error handling and edge cases covered

### Milestone 4: Documentation Complete (Week 4)
- [ ] All documentation updated and reviewed
- [ ] User guides tested and validated
- [ ] Examples and troubleshooting complete

### Milestone 5: Production Ready (Week 5)
- [ ] Performance optimization complete
- [ ] Monitoring and alerting integrated
- [ ] Feature ready for user testing

## Work Log

### 2025-08-20: PRD Creation
**Duration**: Initial creation
**Primary Focus**: Complete architectural design for pattern-driven policy generation

**Completed Work**:
- Defined unified governance model with patterns and policies
- Specified deny-only policy approach for safety
- Designed validation pipeline with semantic search and schema validation
- Outlined user workflows for creation, update, and deletion
- Planned integration with existing manageOrgData tool

**Key Decisions**:
- Extend existing pattern management rather than create separate tool
- Use semantic search for resource discovery to ensure relevance
- Require user confirmation for all policy operations
- Support both direct apply and GitOps file save workflows
- Maintain bidirectional references between patterns and policies

**Next Steps**: Begin implementation with Kyverno detection in version tool

---

## Appendix

### Example Generated Policy

**Source Pattern**: "Azure PostgreSQL requires ResourceGroup for infrastructure organization"

**Generated Policy**:
```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: deny-postgresql-without-resourcegroup-1724175600
  annotations:
    dot-ai/pattern-id: "pat_azure_postgresql"
    dot-ai/pattern-version: "1"
    dot-ai/generated-from: "pattern-to-policy"
    dot-ai/rule-description: "Deny PostgreSQL servers without ResourceGroup"
spec:
  validationFailureAction: Enforce
  background: false
  rules:
  - name: deny-postgresql-without-resourcegroup
    match:
      any:
      - resources:
          kinds: ["PostgreSQLServer"]
    validate:
      message: "PostgreSQL servers must reference a ResourceGroup"
      deny:
        conditions:
        - key: "{{ request.object.spec.resourceGroupNameRef || '' }}"
          operator: Equals
          value: ""
```

### Technical Implementation Notes

**Schema Validation Example**:
```typescript
// Validate policy fields against actual resource schema
const schema = await discovery.explainResource('PostgreSQLServer');
const hasField = checkFieldExists(schema, 'spec.resourceGroupNameRef');
if (!hasField) {
  // Don't generate policy for this field
}
```

**Resource Discovery Process**:
```typescript
// Use semantic search to find relevant resources
const capabilities = await capabilityService.searchCapabilities(
  pattern.content,
  { limit: 20 }
);
const relevant = capabilities.filter(c => c.score > 0.7);
```