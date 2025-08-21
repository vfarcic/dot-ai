# PRD: Organizational Policy Management and Enforcement System

**Created**: 2025-08-20
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2025-08-21
**GitHub Issue**: [#74](https://github.com/vfarcic/dot-ai/issues/74)

## Executive Summary

Create a comprehensive organizational policy management system that maintains policies as independent entities alongside patterns and capabilities. Policies proactively integrate with the AI recommendation workflow through enhanced question generation, ensuring users receive compliant configurations from the start rather than discovering violations after manifest rejection. This approach separates resource recommendations (patterns) from configuration enforcement (policies) while providing a seamless user experience.

## Problem Statement

**Current State**: Organizations have governance requirements that are difficult to enforce consistently across AI recommendations and direct cluster interactions. Current patterns conflate resource recommendations with configuration enforcement, creating confusion about their purpose and scope.

**Key Issues**:
- **Conflated Responsibilities**: Patterns try to serve both resource recommendation and configuration enforcement roles
- **Reactive Enforcement**: Users discover policy violations only after manifest rejection
- **No Proactive Guidance**: Policy requirements aren't presented during resource configuration
- **Manual Policy Management**: Users must separately create and maintain Kyverno policies
- **Poor User Experience**: Users hit policy walls without guidance on compliance

## Solution Overview

**Organizational Policy Management with Proactive Integration**: Create policies as independent organizational entities that integrate seamlessly with the AI recommendation workflow. Policies guide users proactively during configuration through enhanced question generation, ensuring compliance from the start.

### Core Innovation

**Clear Separation of Concerns**:
- **Patterns**: Guide resource selection ("For web apps, suggest Deployment + Service + Ingress")
- **Capabilities**: Discover what's actually available in the cluster
- **Policies**: Enforce how resources must be configured ("All Deployments must have resource limits")

**Proactive Compliance Architecture**: User Intent → Find Resources (Patterns + Capabilities) → Find Policies → Generate Policy-Aware Questions → Compliant Configuration

## Technical Architecture

### Integration Points

**Extends Existing Infrastructure**:
- **`manageOrgData` tool**: Enhanced with policy CRUD operations as new `dataType: 'policy'`
- **Question Generation**: Enhanced `generateQuestionsWithAI` includes policy search and integration
- **Schema Validation**: Leverages existing `discovery.explainResource()` for Kyverno policy validation
- **Vector DB**: Stores policy intents independently with semantic search via `PolicyVectorService`

### Two-Part Policy Model

**Policy Intent** (Stored in Vector DB):
- User-friendly description of what should be enforced
- Semantic search enables finding relevant policies during recommendations
- Guides AI to generate appropriate questions and defaults
- Independent of specific resource types (works on whatever resources are selected)

**Kyverno Policy** (Applied to Cluster):
- Generated from policy intent when enforcement is needed
- Last line of defense at Kubernetes API level
- Single source of truth for actual enforcement rules
- Referenced by name from policy intent (no duplication)

### Recommendation Integration Pipeline

```typescript
User Intent → Search Patterns → Search Capabilities → Search Policy Intents → Generate Policy-Enhanced Questions → User Answers → Compliant Manifests
```

**Quality Gates**:
1. **Pattern Search**: Finds organizational patterns matching user intent (resource suggestions)
2. **Capability Search**: Finds actual cluster resources available for deployment
3. **Policy Intent Search**: Finds policy intents applicable to the selected resources
4. **Question Enhancement**: AI incorporates policy requirements into question generation
5. **Manifest Generation**: Creates compliant manifests using policy-aware answers
6. **Optional Enforcement**: User can generate Kyverno policies from intents for cluster-level blocking

### Policy Intent Structure

```typescript
interface PolicyIntent {
  id: string;                    // Auto-generated UUID
  description: string;           // Detailed description for embedding
  triggers: string[];            // Keywords for semantic matching
  rationale: string;             // Why this policy exists  
  createdAt: string;             // ISO 8601 timestamp
  createdBy: string;             // Author identifier
  
  // Track deployed Kyverno policies (names only - no YAML duplication)
  deployedPolicies?: {
    name: string;                // e.g., "require-resource-limits-1735789200"
    appliedAt: string;           // When it was applied to cluster
  }[];
}

## User Workflows

### Policy Creation and Deployment

```
1. User provides policy description: "All containers must have resource limits"
2. AI generates Kyverno YAML from description
3. Dry-run validation against cluster to ensure policy is valid
4. User reviews generated policy and chooses:
   - Apply to cluster → policy enforced at Kubernetes level
   - Save as file → for GitOps workflows  
   - Discard → policy not used
5. System stores policy intent in Vector DB with:
   - Description, triggers, rationale (for semantic search)
   - Deployed policy names (if applied)
   - File paths (if saved)
6. Policy intent immediately available for recommendation guidance
```

### Policy-Enhanced Recommendations

```
1. User: "Deploy a web application"
2. System searches patterns → finds "web-app-pattern" suggesting [Deployment, Service, Ingress]
3. System searches capabilities → finds actual resources in cluster
4. System searches policy intents → finds "resource-limits-policy"
5. AI generates questions with policy requirements:
   - name: "Application name"
   - cpu_limit: "CPU limit (⚠️ required by resource-limits-policy)"
     default: "500m"
     hint: "Organization policy requires CPU limits"
   - memory_limit: "Memory limit (⚠️ required by resource-limits-policy)"
     default: "512Mi"
6. User provides answers → manifests are compliant from the start
```

### Policy Lifecycle Management

**Update Policy Intent**:
```
1. User updates policy description
2. If deployed policies exist → ask "Regenerate Kyverno policies?"
3. If yes → regenerate, apply to cluster, update references
```

**Delete Policy Intent**:
```
1. User deletes policy intent
2. If deployed policies exist → ask "Delete Kyverno policies from cluster?"
3. If yes → remove from cluster using stored names
4. Remove policy intent from Vector DB
```

## Implementation Details

### Phase 1: Kyverno Detection and System Integration

**Goal**: Extend version tool and prepare infrastructure

**Implementation**:
- [x] Extend `version` tool to detect Kyverno installation and status
- [x] Add Kyverno version compatibility checking
- [x] Update error messages to guide users to Kyverno documentation
- [x] Add system status checks for policy generation readiness

**Success Criteria**:
- [x] Version tool reports Kyverno status clearly
- [x] Users get helpful error messages when Kyverno is missing
- [x] System gracefully handles missing Kyverno during pattern operations

### Phase 2: Policy Intent Management Infrastructure

**Goal**: Create independent policy management system with shared organizational architecture

**Implementation**:
- [x] Create `BaseOrganizationalEntity` interface for shared fields
- [x] Refactor `OrganizationalPattern` to extend base interface
- [x] Create `PolicyIntent` interface extending `BaseOrganizationalEntity`
- [ ] Implement `PolicyVectorService` extending `BaseVectorService<PolicyIntent>`
- [ ] Add `dataType: 'policy'` to `manageOrgData` tool with CRUD operations
- [ ] Add policy intent lifecycle management (create, update, delete, search)

**Technical Requirements**:
- Consistent architecture with existing pattern management system
- Policy intents stored independently in Vector DB using proven `BaseVectorService` pattern
- Semantic search capability for finding relevant policies
- Shared utilities for validation, ID generation, and timestamp management
- Support for tracking deployed Kyverno policy references
- No duplication of Kyverno YAML in storage

**Success Criteria**:
- Policy intents can be created, updated, deleted, and searched
- Semantic search finds relevant policies based on description
- Policy lifecycle operations work correctly
- Clean separation from pattern management

### Phase 3: Recommendation System Integration

**Goal**: Integrate policy intents with AI question generation

**Implementation**:
- [ ] Modify `generateQuestionsWithAI` to search for relevant policy intents
- [ ] Update `prompts/question-generation.md` to include policy context
- [ ] Add policy requirements to question generation (required fields, defaults, validation)
- [ ] Implement policy-aware manifest generation
- [ ] Add policy compliance indicators in generated questions

**Integration Requirements**:
- Policy search occurs after resource selection (Deployment, Service, etc.)
- AI interprets policy descriptions to enhance questions
- Policy requirements become REQUIRED questions with helpful defaults
- Users get clear indication of policy-driven requirements
- Generated manifests comply with policy intents from the start

**Success Criteria**:
- Questions correctly include policy requirements as REQUIRED fields
- Policy-driven defaults and validation work in questions
- Generated manifests are compliant with policy intents
- Clear user feedback about policy influence on configuration

### Phase 4: Kyverno Policy Generation and Enforcement

**Goal**: Optional Kyverno policy generation from policy intents

**Implementation**:
- [ ] Create AI prompt template for Kyverno YAML generation from policy descriptions
- [ ] Implement schema validation pipeline using existing `explainResource`
- [ ] Add dry-run validation before applying policies to cluster
- [ ] Create policy deployment and cleanup operations
- [ ] Add policy status tracking and reporting

**Technical Requirements**:
- Generate Kyverno policies from policy intent descriptions
- Validate generated policies against cluster schemas
- Support policy application, updates, and cleanup
- Track deployed policy names in policy intent records
- No duplication of YAML in Vector DB storage

**Success Criteria**:
- Generated Kyverno policies pass dry-run validation
- Policy deployment and cleanup work correctly
- Policy intents correctly track deployed policy references
- Users can enforce policy intents as cluster-level policies

### Phase 5: Documentation and Production Readiness

**Goal**: Complete documentation and production hardening

**Implementation**:
- [ ] Complete user-facing documentation
- [ ] Add troubleshooting guides  
- [ ] Create example workflows showing policy intent → recommendation → enforcement flow
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

## Design Decisions

### Decision 1: Separate Policies from Patterns
**Date**: 2025-08-21  
**Decision**: Policies and patterns are separate entities with distinct purposes  
**Rationale**: 
- Patterns guide resource selection ("For web apps, suggest Deployment + Service + Ingress")
- Policies enforce configuration ("All Deployments must have resource limits")
- Conflating them creates confusion and limits flexibility

**Impact**: 
- Complete architecture change from original PRD concept
- Policies become independent organizational data type
- No cross-references between patterns and policies

**Code Impact**: Remove pattern-based policy generation, create new policy management system

### Decision 2: Two-Part Policy Model
**Date**: 2025-08-21  
**Decision**: Policies exist as both intents (guidance) and Kyverno policies (enforcement)  
**Rationale**:
- Policy intents guide AI during recommendations (proactive)
- Kyverno policies enforce at cluster level (reactive)
- Same business rule expressed in two forms for different purposes

**Impact**: 
- Policy intents stored in Vector DB for semantic search
- Kyverno policies optionally generated and applied to cluster
- Clear separation between guidance and enforcement

**Code Impact**: Create PolicyIntent interface, implement policy-to-Kyverno generation

### Decision 3: Integrate with Question Generation
**Date**: 2025-08-21  
**Decision**: Policies enhance question generation rather than block manifests  
**Rationale**: Proactive compliance (users learn while configuring) is better UX than reactive rejection  
**Impact**: 
- Policies searched after resources are selected
- Policy requirements become REQUIRED questions
- Users get compliant configurations from the start

**Code Impact**: Modify `generateQuestionsWithAI`, update question generation prompts

### Decision 4: Lean Storage Strategy  
**Date**: 2025-08-21  
**Decision**: Only store policy intents and references in Vector DB, not Kyverno YAML  
**Rationale**: 
- Avoid data duplication and sync issues
- Cluster is single source of truth for Kyverno policies
- Reduces storage overhead and complexity

**Impact**: 
- PolicyIntent only tracks deployed policy names
- Kyverno YAML fetched from cluster when needed
- Simpler lifecycle management

**Code Impact**: Remove YAML storage from PolicyIntent, implement cluster-based policy retrieval

### Decision 5: No Resource Type Constraints
**Date**: 2025-08-21  
**Decision**: Policy intents don't specify which resource types they apply to  
**Rationale**: 
- Policies work on whatever resources the recommendation system already selected
- More flexible - new resource types automatically supported
- Avoids potential conflicts between resource lists and actual applicability

**Impact**: Policy search happens after resource selection, not before  
**Code Impact**: Remove `applicableResources` field from PolicyIntent interface

### Decision 6: No Prescriptive Kyverno Examples
**Date**: 2025-08-21  
**Decision**: Avoid providing specific Kyverno YAML examples that could constrain AI generation  
**Rationale**: 
- AI should use its knowledge to generate appropriate Kyverno structures per policy
- Specific examples might cause pattern-matching that fails for different policy types
- Different policies may need different Kyverno features (validate, mutate, generate)

**Impact**: 
- PRD focuses on PolicyIntent structure and workflow, not Kyverno syntax
- AI has flexibility to generate appropriate policies for each intent
- Reduces risk of generation failures due to pattern constraints

**Code Impact**: Remove Kyverno YAML examples from PRD, rely on AI's Kyverno knowledge

### Decision 7: Immediate Generation Workflow  
**Date**: 2025-08-21
**Decision**: Generate Kyverno policy immediately when user creates policy intent, store intent only after user decision
**Rationale**: 
- Simpler workflow - user sees the actual policy before committing
- Only store policy intents that weren't discarded  
- Can track deployment/save status accurately

**Impact**: 
- Policy intent stored at end of process with deployment information
- Vector DB only contains policy intents that are actually being used
- Clean lifecycle management with accurate reference tracking

**Code Impact**: Store policy intent after Apply/Save/Discard decision, include deployment status

### Decision 8: Shared Organizational Entity Architecture
**Date**: 2025-08-21
**Decision**: Create base `BaseOrganizationalEntity` interface that both patterns and policies extend
**Rationale**: 
- PolicyIntent and OrganizationalPattern share 5 out of 6 fields (id, description, triggers, rationale, createdAt, createdBy)
- Existing `BaseVectorService` architecture provides proven foundation for Vector DB operations
- Consistent architecture reduces maintenance overhead and ensures type safety
- Leverages existing validation, ID generation, and timestamp utilities

**Impact**: 
- Create shared base interface for common organizational entity fields
- PolicyVectorService extends existing `BaseVectorService<PolicyIntent>` pattern
- Consistent type system across organizational data types
- Shared utilities for ID generation, validation, and timestamp management

**Code Impact**: 
- Create `src/core/organizational-types.ts` with `BaseOrganizationalEntity` interface
- Refactor `OrganizationalPattern` to extend base interface
- Create `PolicyIntent` interface extending base interface
- Implement `PolicyVectorService` using existing `BaseVectorService` architecture

## Success Criteria

### Technical Metrics
- [ ] Policy intents correctly enhance questions with requirements and defaults
- [ ] Generated manifests comply with policy intents from the start
- [ ] 100% of generated Kyverno policies pass dry-run validation
- [ ] Policy search finds relevant intents within 1 second
- [ ] Policy intent lifecycle operations (create, update, delete) work correctly

### User Experience Metrics
- [ ] Users receive clear indication of policy-required fields in questions
- [ ] Policy-driven defaults and validation work seamlessly in questions
- [ ] Users can create policy intents using natural language descriptions
- [ ] Clear separation between guidance (intents) and enforcement (Kyverno)
- [ ] GitOps compatibility through optional Kyverno policy file generation

### Business Impact
- [ ] Proactive compliance reduces manifest rejections
- [ ] Faster policy creation compared to manual Kyverno writing
- [ ] Improved compliance through policy-aware recommendations
- [ ] Clear governance model with patterns (what to deploy) and policies (how to configure)

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
- [x] Kyverno detection integrated in version tool
- [x] Shared organizational entity architecture implemented
- [ ] PolicyIntent interface and PolicyVectorService created

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

### 2025-08-20: Phase 1 Complete - Kyverno Detection Integration
**Duration**: ~4 hours implementation + testing
**Commits**: 1 comprehensive commit (4086d41)
**Primary Focus**: Kyverno detection and system integration

**Completed Phase 1 Items**:
- [x] Kyverno installation detection via CRDs, deployment status, webhook validation
- [x] Version compatibility checking from deployment labels and image tags
- [x] User-friendly error messages with specific guidance
- [x] Policy generation readiness integrated into system diagnostics
- [x] Comprehensive test coverage (29 tests) with all edge cases
- [x] Manual testing confirmation - system correctly detects installed Kyverno

**Technical Achievements**:
- Fixed webhook detection to use correct Kubernetes resource (validatingwebhookconfigurations)
- Robust version extraction supporting multiple fallback methods
- Graceful degradation ensuring pattern management works regardless of Kyverno status
- All 793 tests passing across entire codebase

**Next Session Priorities**:
- Begin Phase 2: Create AI prompt template for pattern analysis
- Implement semantic resource discovery integration  
- Build schema validation pipeline for policy field validation

### 2025-08-21: Major Architecture Refinement - Policy-Pattern Separation
**Duration**: Extended design discussion (~2 hours)
**Primary Focus**: Complete architectural redesign based on conceptual clarity

**Key Insight**: Discovered fundamental conflation between patterns (resource recommendations) and policies (configuration enforcement). Led to complete separation and redesign.

**Major Decisions Made**:
1. **Patterns vs Policies Separation**: Patterns guide what resources to deploy, policies guide how to configure them
2. **Two-Part Policy Model**: Policy intents for guidance, Kyverno policies for enforcement  
3. **Question Generation Integration**: Policies enhance recommendations proactively, not reactively
4. **Lean Storage**: Store intents and references, not duplicate Kyverno YAML
5. **Resource Independence**: Policies work on selected resources, don't specify resource types

**Architecture Changes**:
- Removed pattern-to-policy generation workflow
- Created PolicyIntent as independent entity with pattern-aligned structure  
- Integrated policy search into recommendation pipeline after resource selection
- Designed optional Kyverno policy generation from intents
- Implemented clean lifecycle management with reference tracking

**Technical Impact**:
- Complete rewrite of implementation phases
- New PolicyVectorService for semantic search
- Integration with generateQuestionsWithAI function
- Policy-aware question generation and manifest creation
- Clean separation from pattern management

**User Experience Impact**:
- Proactive compliance through enhanced questions
- Clear indication of policy-required fields
- Policy-driven defaults and validation
- Compliant manifests from the start
- Optional enforcement through Kyverno generation

**Next Steps**: Complete PolicyVectorService implementation (remaining Phase 2 items)

### 2025-08-21: Phase 2 Foundation Architecture Complete
**Duration**: ~2 hours implementation and testing
**Primary Focus**: Shared organizational entity architecture implementation

**Completed Phase 2 Items**:
- [x] Create `BaseOrganizationalEntity` interface for shared fields - Created `/src/core/organizational-types.ts` with 6 shared fields
- [x] Refactor `OrganizationalPattern` to extend base interface - Updated `pattern-types.ts`, maintained backward compatibility
- [x] Create `PolicyIntent` interface extending `BaseOrganizationalEntity` - Implemented with `deployedPolicies` tracking

**Technical Achievements**:
- Consistent type system across organizational entities (patterns and policies)
- Foundation ready for `PolicyVectorService` implementation using proven `BaseVectorService` pattern
- All 793 tests passing after refactoring, no breaking changes
- Clean separation between patterns (resource selection) and policies (configuration enforcement)

**Next Session Priorities**:
- Implement `PolicyVectorService` extending `BaseVectorService<PolicyIntent>`
- Add policy CRUD operations to `manageOrgData` tool
- Begin policy lifecycle management implementation

---

## Appendix

### Example Policy Intent and Usage

**Policy Intent Structure**:
```typescript
{
  id: "pol_2025_01_21_resource_limits",
  description: "All containers must specify CPU and memory resource limits to prevent resource exhaustion and ensure fair scheduling across the cluster",
  triggers: ["resource limits", "cpu limits", "memory limits", "resource management"],
  rationale: "Prevents single containers from consuming all cluster resources and ensures predictable application performance",
  createdAt: "2025-01-21T10:00:00Z", 
  createdBy: "platform-team",
  
  // Added after user applies generated Kyverno policy
  deployedPolicies: [
    {
      name: "require-resource-limits-1735789200",
      appliedAt: "2025-01-21T10:30:00Z"
    }
  ]
}
```

**Policy-Enhanced Question Generation** (User: "Deploy web application"):
```yaml
# System workflow:
# 1. Finds Deployment + Service resources (patterns + capabilities)
# 2. Searches policy intents, finds resource limits policy
# 3. AI generates questions enhanced with policy requirements:

REQUIRED Questions:
  - name: "Application name"
  - cpu_limit: "CPU limit (⚠️ required by resource-limits policy)"
    default: "500m"
    hint: "Organization policy requires CPU limits on all deployments"
  - memory_limit: "Memory limit (⚠️ required by resource-limits policy)" 
    default: "512Mi"
    hint: "Organization policy requires memory limits on all deployments"

# Result: User gets compliant manifest from the start
```

**Kyverno Policy Generation**:
AI generates appropriate Kyverno ClusterPolicy YAML from the policy intent description using its knowledge of Kyverno syntax and best practices. The generated policy includes:
- Appropriate validation/mutation/generation rules based on the intent
- `background: false` to apply only to new/updated resources  
- Proper metadata with policy intent reference
- Dry-run validation ensures the policy is syntactically correct

### Technical Implementation Notes

**Shared Architecture Pattern**:
```typescript
// Base interface shared by patterns and policies
interface BaseOrganizationalEntity {
  id: string;           // Auto-generated UUID
  description: string;  // For Vector DB embedding
  triggers: string[];   // Keywords for semantic matching
  rationale: string;    // Business justification
  createdAt: string;    // ISO 8601 timestamp
  createdBy: string;    // Creator identifier
}

// PolicyIntent extends base with policy-specific fields
interface PolicyIntent extends BaseOrganizationalEntity {
  deployedPolicies?: DeployedPolicyReference[];
}

// OrganizationalPattern extends base with pattern-specific fields
interface OrganizationalPattern extends BaseOrganizationalEntity {
  suggestedResources: string[];
}
```

**Policy Intent Storage**:
```typescript
// Store policy intent only after user decision (Apply/Save/Discard)
// Include deployment status for lifecycle management
const policyIntent: PolicyIntent = {
  ...intentData,
  deployedPolicies: userApplied ? [{ name: policyName, appliedAt: now }] : undefined
};
await policyVectorService.storeIntent(policyIntent);
```

**Policy Search Integration**:
```typescript  
// Search for relevant policy intents after resource selection
const relevantPolicies = await policyVectorService.searchPolicyIntents(
  resourceContext, 
  { limit: 10 }
);
// AI incorporates policy requirements into question generation
```