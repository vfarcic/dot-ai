# PRD-43: Dependency-Aware Resource Discovery via Kubernetes API Analysis

**Status**: Draft  
**Created**: 2025-08-05  
**GitHub Issue**: [#43](https://github.com/vfarcic/dot-ai/issues/43)  
**Dependencies**: None (Foundation PRD)  
**Related PRDs**: [#44 - Semantic Resource Matching](./44-semantic-resource-matching.md) (depends on this PRD)

## Executive Summary

Current resource recommendation system overwhelms AI with 415+ individual resources, leading to incomplete solutions that miss critical cross-domain dependencies. This PRD establishes a foundation for structured resource discovery through Kubernetes API schema analysis, enabling complete solution assembly and hierarchical resource prioritization.

## Problem Statement

### Current Issues
1. **AI Information Overload**: 415+ resources sent to AI causes attention degradation
2. **Missing Cross-Domain Dependencies**: ResourceGroup excluded from Azure PostgreSQL solutions despite being required
3. **No Resource Hierarchy**: Composite resources not prioritized over primitive alternatives
4. **Incomplete Solutions**: Users get StatefulSet+ConfigMap+Secret instead of single high-level resources

### Real-World Impact
- User requests "PostgreSQL on Azure" → Gets complex multi-resource primitive setup
- Missing `sqls.devopstoolkit.live` composite resource that handles everything in one declaration
- Azure deployments fail because ResourceGroup foundation is not included
- Poor user experience requiring manual resource integration

## Success Criteria

### Primary Goals
- **Complete Solutions**: All resource dependencies automatically included
- **Hierarchical Discovery**: Composite > Operator > Primitive resource prioritization  
- **Cross-Domain Awareness**: Infrastructure foundations (ResourceGroup) included for cloud resources
- **Reduced AI Overwhelm**: Structured solution patterns instead of raw resource lists

### Success Metrics
- ResourceGroup automatically included in Azure database solutions
- Composite resources prioritized over primitive equivalents
- Solution completeness validation (all dependencies present)
- Reduced average solution complexity (fewer resources when possible)

## Solution Architecture

### Phase 1: Schema-Based Dependency Discovery
Extract dependency relationships directly from Kubernetes API schemas:

```typescript
// Discover dependencies from CRD schemas
const serverSchema = await kubectl.explain('server.dbforpostgresql.azure');
const dependencies = extractReferences(serverSchema);
// Result: ["ResourceGroup"] - discoverable from schema!
```

### Phase 2: Resource Hierarchization
Categorize resources by abstraction level using metadata patterns:

```typescript
const hierarchy = {
  composite: resources.filter(r => r.categories?.includes('composite')),
  operators: resources.filter(r => r.group?.includes('upbound.io')),
  primitives: resources.filter(r => r.group === '' || r.group === 'apps')
};
```

### Phase 3: Solution Pattern Assembly
Build complete solutions including all required dependencies:

```typescript
const completeSolution = {
  primary: "Server (dbforpostgresql.azure.upbound.io)",
  dependencies: ["ResourceGroup (azure.upbound.io)"], // Force included
  optional: ["FirewallRule (dbforpostgresql.azure.upbound.io)"]
};
```

## Technical Implementation

### Discovery Engine Components

#### 1. Dependency Chain Builder
- Parse CRD schemas for reference fields (`resourceGroupName`, `serverRef`)
- Build directed dependency graphs
- Identify required vs optional relationships

#### 2. Resource Categorizer  
- Analyze metadata for abstraction level hints
- Group by complexity and scope
- Prioritize user-friendly resources

#### 3. Solution Assembler
- Combine primary resources with their dependency chains
- Validate solution completeness
- Generate structured solution candidates

### Data Flow
```
Raw Resources (415) 
→ Schema Analysis 
→ Dependency Graphs 
→ Hierarchical Categorization 
→ Complete Solutions (3-5)
→ AI Ranking
```

## Implementation Milestones

### Milestone 1: Dependency Discovery Engine
- [ ] Implement CRD schema parsing for reference extraction
- [ ] Build dependency chain discovery from Kubernetes API
- [ ] Create resource relationship mapping
- **Success Criteria**: ResourceGroup automatically discovered as Server dependency

### Milestone 2: Resource Hierarchization System  
- [ ] Implement abstraction level categorization
- [ ] Create composite resource prioritization logic
- [ ] Build resource complexity scoring
- **Success Criteria**: sqls.devopstoolkit.live prioritized over StatefulSet solutions

### Milestone 3: Solution Pattern Assembly
- [ ] Implement complete solution building with dependencies
- [ ] Create solution validation and completeness checking
- [ ] Build structured solution presentation for AI
- **Success Criteria**: Azure PostgreSQL solutions include ResourceGroup automatically

### Milestone 4: Integration with Existing Recommendation System
- [ ] Replace raw resource list with structured solutions in AI prompts
- [ ] Implement solution-based ranking instead of individual resource ranking
- [ ] Create backward compatibility for existing workflows
- **Success Criteria**: Improved recommendation quality without breaking existing functionality

### Milestone 5: Testing and Validation
- [ ] Comprehensive testing with complex multi-cloud scenarios
- [ ] Performance optimization for large clusters
- [ ] User acceptance testing and feedback incorporation
- **Success Criteria**: Feature ready for production deployment

## Risk Assessment

### Technical Risks
- **Schema Parsing Complexity**: CRD schemas may have inconsistent reference patterns
- **Performance Impact**: Additional API calls for schema analysis
- **Edge Cases**: Complex dependency cycles or circular references

### Mitigation Strategies
- Start with well-known patterns (Crossplane, Upbound providers)
- Implement caching for schema analysis results
- Build fallback to current system for unsupported cases

## Dependencies and Assumptions

### Technical Dependencies
- Kubernetes API access for schema discovery
- Existing resource discovery infrastructure
- Current AI recommendation pipeline

### Assumptions
- CRD schemas contain discoverable reference patterns
- Dependency relationships are primarily hierarchical (not circular)
- Performance impact of schema analysis is acceptable

## Related Work

### Enables Future Work
- **PRD #44**: Semantic Resource Matching via Vector Database (depends on this foundation)
- Enhanced organizational pattern matching
- Machine learning-based solution optimization

### Integration Points
- Current MCP recommendation tools
- Existing Claude AI integration
- Pattern vector service architecture

## Appendix

### Example: Azure PostgreSQL Discovery Flow

**Current Flow:**
```
Intent: "PostgreSQL on Azure"
→ 415 resources sent to AI
→ AI picks: Server, FirewallRule
→ Missing: ResourceGroup (deployment fails)
```

**Enhanced Flow:**
```
Intent: "PostgreSQL on Azure" 
→ Schema analysis discovers: ResourceGroup ← Server ← FirewallRule
→ Complete solution: [ResourceGroup, Server, FirewallRule]
→ AI ranks complete solutions instead of individual resources
```

### Schema Reference Patterns
Common patterns discoverable from Kubernetes API:
- `spec.resourceGroupName` → ResourceGroup dependency
- `spec.serverRef.name` → Crossplane reference pattern  
- `metadata.ownerReferences` → Parent-child relationships
- `metadata.finalizers` → Cleanup dependency order