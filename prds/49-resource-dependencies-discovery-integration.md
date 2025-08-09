# PRD-49: Resource Dependencies Discovery & Integration

**Status**: Draft  
**Created**: 2025-08-05  
**GitHub Issue**: [#49](https://github.com/vfarcic/dot-ai/issues/49)  
**Dependencies**: [PRD #47 - Generic Cluster Data Management Tool](./47-generic-cluster-data-management-tool.md)  
**Related PRDs**: Complements PRD #48 (Resource Capabilities) for complete solution assembly

## Executive Summary

AI recommendation system frequently produces incomplete solutions that fail during deployment because it misses critical resource dependencies like ResourceGroup for Azure resources or supporting infrastructure components. This PRD implements dependency discovery through Kubernetes schema analysis and Graph DB storage, enabling automatic assembly of complete, deployable solutions with all required dependencies included.

## Problem Statement

### Current Issues with Incomplete Solutions
1. **Missing Foundation Resources**: ResourceGroup excluded from Azure PostgreSQL solutions
2. **Broken Dependency Chains**: AI picks Server without required infrastructure
3. **Deployment Failures**: Users get solutions that can't actually be deployed
4. **Manual Dependency Resolution**: Users must manually figure out missing pieces

### Real-World Impact
- User requests: "PostgreSQL on Azure"
- AI recommends: `[Server, FirewallRule]`
- **Missing**: `ResourceGroup` (required foundation)
- **Result**: Deployment fails because ResourceGroup wasn't created first
- **User Experience**: Frustration and manual troubleshooting required

## Success Criteria

### Primary Goals
- **Complete Solutions**: All resource dependencies automatically included
- **Deployment Success**: Recommended solutions work without manual intervention
- **Dependency Awareness**: System understands resource requirement chains
- **Foundation First**: Infrastructure dependencies included in proper order

### Success Metrics
- ResourceGroup automatically included in Azure database solutions
- Deployment success rate improves for recommended solutions
- Reduced user-reported "missing dependency" issues
- Complete dependency chains discovered and stored for all major resource types

## Solution Architecture

### Dependency Discovery Pipeline
```
Cluster Resources
↓
Schema Analysis (kubectl explain)
↓
Dependency Pattern Recognition
↓
Relationship Mapping
↓
Graph DB Storage (explicit relationships + traversal queries)
↓
Complete Solution Assembly
```

### Integration with Existing PRDs
```typescript
// Phase 1: PRD #48 finds primary resources
const primaryResources = await capabilitySearch("PostgreSQL Azure");
// Result: [server.dbforpostgresql.azure]

// Phase 2: PRD #49 finds dependencies via graph traversal
const dependencies = await dependencySearch(primaryResources[0]);
// Result: {required: [resourcegroup.azure], optional: [firewallrule]}

// Phase 3: Complete solution assembly
const completeSolution = {
  primary: primaryResources[0],
  required: dependencies.required,
  optional: dependencies.optional
};
```

## Technical Implementation

### Dependency Data Structure
```typescript
interface ResourceDependency {
  // Dependent resource (the one that needs something)
  dependent: {
    kind: string;           // "Server"
    group: string;          // "dbforpostgresql.azure.upbound.io"
    apiVersion: string;     // "dbforpostgresql.azure.upbound.io/v1beta1"
  };
  
  // Required resource (the dependency)
  dependency: {
    kind: string;           // "ResourceGroup"  
    group: string;          // "azure.upbound.io"
    apiVersion: string;     // "azure.upbound.io/v1beta1"
  };
  
  // Relationship metadata
  type: 'required' | 'optional' | 'enhances';
  field: string;            // "spec.resourceGroupName"
  pattern: string;          // "resourceGroupName <string>"
  reason: string;           // "Azure resources require ResourceGroup foundation"
  
  // Discovery metadata
  discoveredAt: string;     // ISO timestamp
  confidence: number;       // 0.0-1.0 confidence in this relationship
}
```

### Dependency Discovery Engine
```typescript
class DependencyDiscoveryEngine {
  /**
   * Analyze resource schema to discover dependencies
   */
  async discoverDependencies(resource: ResourceReference): Promise<ResourceDependency[]> {
    const dependencies: ResourceDependency[] = [];
    
    try {
      // Get detailed schema from Kubernetes API
      const schema = await this.getResourceSchema(resource);
      
      // Extract dependencies using pattern recognition
      const schemaDeps = this.extractSchemaReferences(resource, schema);
      dependencies.push(...schemaDeps);
      
      // Discover cloud provider patterns
      const cloudDeps = this.inferCloudDependencies(resource, schema);
      dependencies.push(...cloudDeps);
      
      // Discover operational dependencies
      const operationalDeps = this.inferOperationalDependencies(resource, schema);
      dependencies.push(...operationalDeps);
      
      return dependencies;
    } catch (error) {
      console.warn(`Failed to discover dependencies for ${resource.kind}:`, error);
      return [];
    }
  }
  
  /**
   * Extract explicit references from schema fields
   */
  private extractSchemaReferences(resource: ResourceReference, schema: string): ResourceDependency[] {
    const dependencies: ResourceDependency[] = [];
    const lines = schema.split('\n');
    
    // Known reference patterns
    const referencePatterns = [
      {
        pattern: /resourceGroupName\s+<string>/,
        dependencyKind: 'ResourceGroup',
        dependencyGroup: 'azure.upbound.io',
        type: 'required' as const,
        field: 'spec.resourceGroupName',
        reason: 'Azure resources require ResourceGroup for organization and billing'
      },
      {
        pattern: /serverRef\s+<Object>/,
        dependencyKind: 'Server', 
        dependencyGroup: this.inferGroupFromResource(resource, 'Server'),
        type: 'required' as const,
        field: 'spec.serverRef',
        reason: 'Database objects require parent server instance'
      },
      {
        pattern: /configMapRef\s+<Object>/,
        dependencyKind: 'ConfigMap',
        dependencyGroup: '',
        type: 'optional' as const,
        field: 'spec.configMapRef',
        reason: 'Configuration data can be externalized via ConfigMap'
      },
      {
        pattern: /secretRef\s+<Object>/,
        dependencyKind: 'Secret',
        dependencyGroup: '',
        type: 'required' as const,
        field: 'spec.secretRef', 
        reason: 'Sensitive data requires Secret resource for security'
      }
    ];
    
    for (const line of lines) {
      for (const refPattern of referencePatterns) {
        if (refPattern.pattern.test(line)) {
          dependencies.push({
            dependent: {
              kind: resource.kind,
              group: resource.group,
              apiVersion: resource.apiVersion
            },
            dependency: {
              kind: refPattern.dependencyKind,
              group: refPattern.dependencyGroup,
              apiVersion: this.buildApiVersion(refPattern.dependencyGroup)
            },
            type: refPattern.type,
            field: refPattern.field,
            pattern: line.trim(),
            reason: refPattern.reason,
            discoveredAt: new Date().toISOString(),
            confidence: 0.9 // High confidence for explicit schema references
          });
        }
      }
    }
    
    return dependencies;
  }
  
  /**
   * Infer cloud provider-specific dependencies
   */
  private inferCloudDependencies(resource: ResourceReference, schema: string): ResourceDependency[] {
    const dependencies: ResourceDependency[] = [];
    
    // Azure pattern: Most Azure resources need ResourceGroup
    if (resource.group.includes('azure') && !resource.kind.includes('ResourceGroup')) {
      dependencies.push({
        dependent: {
          kind: resource.kind,
          group: resource.group,
          apiVersion: resource.apiVersion
        },
        dependency: {
          kind: 'ResourceGroup',
          group: 'azure.upbound.io',
          apiVersion: 'azure.upbound.io/v1beta1'
        },
        type: 'required',
        field: 'spec.resourceGroupName',
        pattern: 'Inferred from Azure resource pattern',
        reason: 'Azure resources require ResourceGroup as organizational foundation',
        discoveredAt: new Date().toISOString(),
        confidence: 0.8 // High confidence for well-known cloud patterns
      });
    }
    
    // GCP pattern: Most GCP resources need Project
    if (resource.group.includes('gcp') && !resource.kind.includes('Project')) {
      dependencies.push({
        dependent: {
          kind: resource.kind,
          group: resource.group,
          apiVersion: resource.apiVersion
        },
        dependency: {
          kind: 'Project',
          group: 'cloudresourcemanager.gcp.upbound.io',
          apiVersion: 'cloudresourcemanager.gcp.upbound.io/v1beta1'
        },
        type: 'required',
        field: 'spec.project',
        pattern: 'Inferred from GCP resource pattern',
        reason: 'GCP resources require Project as organizational foundation',
        discoveredAt: new Date().toISOString(),
        confidence: 0.8
      });
    }
    
    return dependencies;
  }
  
  /**
   * Infer operational dependencies (networking, security, etc.)
   */
  private inferOperationalDependencies(resource: ResourceReference, schema: string): ResourceDependency[] {
    const dependencies: ResourceDependency[] = [];
    
    // Database resources often benefit from firewall rules
    if (this.isDatabaseResource(resource, schema)) {
      const firewallDependency = this.inferFirewallDependency(resource);
      if (firewallDependency) {
        dependencies.push(firewallDependency);
      }
    }
    
    // Storage resources might need storage classes
    if (this.isStorageResource(resource, schema)) {
      dependencies.push({
        dependent: {
          kind: resource.kind,
          group: resource.group,
          apiVersion: resource.apiVersion
        },
        dependency: {
          kind: 'StorageClass',
          group: 'storage.k8s.io',
          apiVersion: 'storage.k8s.io/v1'
        },
        type: 'optional',
        field: 'spec.storageClassName',
        pattern: 'Inferred from storage resource pattern',
        reason: 'Storage resources benefit from explicit StorageClass configuration',
        discoveredAt: new Date().toISOString(),
        confidence: 0.6 // Lower confidence for inferred operational dependencies
      });
    }
    
    return dependencies;
  }
}
```

### Graph DB Integration for Dependencies
```typescript
// Example using Neo4j driver-type API (any graph DB is fine)
class DependencyGraphService {
  constructor(private driver: any) {}

  async upsertResource(resource: ResourceReference): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        'MERGE (r:ResourceKind {kind: $kind, group: $group, apiVersion: $apiVersion})',
        resource
      );
    } finally {
      await session.close();
    }
  }

  async upsertDependency(dep: ResourceDependency): Promise<void> {
    const session = this.driver.session();
    try {
      const relType = dep.type.toUpperCase(); // REQUIRED|OPTIONAL|ENHANCES
      await session.run(
        `MERGE (a:ResourceKind {kind: $ak, group: $ag, apiVersion: $aa})
         MERGE (b:ResourceKind {kind: $bk, group: $bg, apiVersion: $ba})
         MERGE (a)-[r:${'${relType}'} {field: $field}]->(b)
         SET r.reason = $reason, r.pattern = $pattern, r.confidence = $confidence, r.discoveredAt = $discoveredAt`,
        {
          ak: dep.dependent.kind, ag: dep.dependent.group, aa: dep.dependent.apiVersion,
          bk: dep.dependency.kind, bg: dep.dependency.group, ba: dep.dependency.apiVersion,
          field: dep.field, reason: dep.reason, pattern: dep.pattern,
          confidence: dep.confidence, discoveredAt: dep.discoveredAt
        }
      );
    } finally {
      await session.close();
    }
  }

  async findDirectDependencies(resource: ResourceReference): Promise<ResourceDependency[]> {
    const session = this.driver.session();
    try {
      const res = await session.run(
        `MATCH (a:ResourceKind {kind: $kind, group: $group})
         MATCH (a)-[r]->(b:ResourceKind)
         RETURN type(r) as type, r.field as field, r.pattern as pattern, r.reason as reason,
                r.confidence as confidence, r.discoveredAt as discoveredAt,
                a.kind as ak, a.group as ag, a.apiVersion as aa,
                b.kind as bk, b.group as bg, b.apiVersion as ba`,
        { kind: resource.kind, group: resource.group }
      );
      return res.records.map((row: any) => ({
        dependent: { kind: row.get('ak'), group: row.get('ag'), apiVersion: row.get('aa') },
        dependency: { kind: row.get('bk'), group: row.get('bg'), apiVersion: row.get('ba') },
        type: (row.get('type') as string).toLowerCase() as 'required' | 'optional' | 'enhances',
        field: row.get('field'), pattern: row.get('pattern'), reason: row.get('reason'),
        discoveredAt: row.get('discoveredAt'), confidence: row.get('confidence')
      }));
    } finally {
      await session.close();
    }
  }

  async expandTransitiveDependencies(resource: ResourceReference): Promise<{
    required: ResourceReference[]; optional: ResourceReference[]; enhances: ResourceReference[]; all: ResourceDependency[];
  }> {
    const session = this.driver.session();
    try {
      // REQUIRES transitive closure
      const requiredRes = await session.run(
        `MATCH (a:ResourceKind {kind: $kind, group: $group})-[:REQUIRES*1..5]->(b:ResourceKind)
         RETURN DISTINCT b.kind as kind, b.group as group, b.apiVersion as apiVersion`,
        { kind: resource.kind, group: resource.group }
      );
      const required = requiredRes.records.map((r: any) => ({ kind: r.get('kind'), group: r.get('group'), apiVersion: r.get('apiVersion') }));

      // Direct OPTIONAL/ENHANCES for primary
      const optEnh = await session.run(
        `MATCH (a:ResourceKind {kind: $kind, group: $group})-[r:OPTIONAL|ENHANCES]->(b:ResourceKind)
         RETURN type(r) as type, b.kind as kind, b.group as group, b.apiVersion as apiVersion`,
        { kind: resource.kind, group: resource.group }
      );
      const optional: ResourceReference[] = [];
      const enhances: ResourceReference[] = [];
      for (const row of optEnh.records) {
        const ref = { kind: row.get('kind'), group: row.get('group'), apiVersion: row.get('apiVersion') };
        (row.get('type') === 'OPTIONAL' ? optional : enhances).push(ref);
      }

      // Collect all direct edges for rationale
      const all = await this.findDirectDependencies(resource);
      return { required, optional, enhances, all };
    } finally {
      await session.close();
    }
  }

  async hasCycles(resource: ResourceReference): Promise<boolean> {
    const session = this.driver.session();
    try {
      const res = await session.run(
        `MATCH p=(a:ResourceKind {kind: $kind, group: $group})-[:REQUIRES*1..10]->(a)
         RETURN count(p) as cycles`,
        { kind: resource.kind, group: resource.group }
      );
      return (res.records[0]?.get('cycles') || 0) > 0;
    } finally {
      await session.close();
    }
  }

  async getCompleteSolution(primary: ResourceReference): Promise<CompleteSolution> {
    const { required, optional, all } = await this.expandTransitiveDependencies(primary);
    const ordered = this.computeTopologicalOrder(primary, all);
    return {
      primary,
      required: this.removeDuplicates(required),
      optional: this.removeDuplicates(optional),
      dependencies: all,
      order: ordered,
      rationale: this.generateSolutionRationale(primary, all)
    };
  }

  private computeTopologicalOrder(primary: ResourceReference, deps: ResourceDependency[]): ResourceReference[] {
    // Build adjacency for REQUIRES only
    const adj = new Map<string, Set<string>>();
    const nodes = new Map<string, ResourceReference>();
    const key = (r: ResourceReference) => `${r.group}/${r.kind}`;
    nodes.set(key(primary), primary);
    for (const d of deps) {
      nodes.set(key(d.dependent), d.dependent);
      nodes.set(key(d.dependency), d.dependency);
      if (d.type === 'required') {
        const from = key(d.dependency); // dependency must come before dependent
        const to = key(d.dependent);
        if (!adj.has(from)) adj.set(from, new Set());
        adj.get(from)!.add(to);
      }
    }
    // Kahn's algorithm
    const indeg = new Map<string, number>();
    for (const n of nodes.keys()) indeg.set(n, 0);
    for (const [from, tos] of adj) for (const to of tos) indeg.set(to, (indeg.get(to) || 0) + 1);
    const queue: string[] = Array.from(nodes.keys()).filter(k => (indeg.get(k) || 0) === 0);
    const ordered: string[] = [];
    while (queue.length) {
      const n = queue.shift()!;
      ordered.push(n);
      for (const m of Array.from(adj.get(n) || [])) {
        indeg.set(m, (indeg.get(m) || 0) - 1);
        if ((indeg.get(m) || 0) === 0) queue.push(m);
      }
    }
    return ordered.map(k => nodes.get(k)!).filter(Boolean);
  }

  private removeDuplicates(list: ResourceReference[]): ResourceReference[] {
    const seen = new Set<string>();
    const out: ResourceReference[] = [];
    for (const r of list) {
      const k = `${r.group}/${r.kind}`;
      if (!seen.has(k)) { seen.add(k); out.push(r); }
    }
    return out;
  }

  private generateSolutionRationale(primary: ResourceReference, deps: ResourceDependency[]): string {
    // Build a concise rationale string from edge reasons
    const lines = deps.map(d => `${d.dependent.kind} -> ${d.type.toUpperCase()} -> ${d.dependency.kind}: ${d.reason}`);
    return [`Primary: ${primary.kind}`, ...lines].join('\n');
  }
}
```

## Integration with Recommendation System

### Enhanced Complete Solution Assembly

#### Current Flow (Incomplete)
```
User: "PostgreSQL on Azure"
↓
PRD #48: Finds server.dbforpostgresql.azure (semantic match)
↓
AI Ranking: [Server, FirewallRule] 
↓
Deployment: ❌ FAILS (missing ResourceGroup)
```

#### New Flow (Complete)
```
User: "PostgreSQL on Azure"
↓
PRD #48: Finds server.dbforpostgresql.azure (semantic match)
↓
PRD #49: Finds dependencies for Server
  Required: [ResourceGroup]
  Optional: [FirewallRule]
↓
Complete Solution: [ResourceGroup, Server, FirewallRule]
↓
AI Ranking: Complete, deployable solutions
↓
Deployment: ✅ SUCCESS (all dependencies included)
```

### Modified Recommendation Integration
```typescript
// Enhanced findBestSolutions with dependency completion via graph
async findBestSolutions(intent: string, discovery: DiscoveryFunctions): Promise<ResourceSolution[]> {
  // Phase 1: Capability-based resource discovery (PRD #48)
  const capabilityService = new CapabilityVectorService(this.vectorDB);
  const primaryCandidates = await capabilityService.searchCapabilities(intent, 5);
  
  // Phase 2: Dependency completion (PRD #49)
  const dependencyService = new DependencyGraphService(this.graphDB);
  const completeSolutions: CompleteSolution[] = [];
  
  for (const candidate of primaryCandidates) {
    const resourceRef = {
      kind: candidate.kind,
      group: candidate.group,
      apiVersion: candidate.apiVersion
    };
    
    const completeSolution = await dependencyService.getCompleteSolution(resourceRef);
    completeSolutions.push(completeSolution);
  }
  
  // Phase 3: Convert to ResourceSolution format for AI ranking
  const resourceSolutions: ResourceSolution[] = [];
  for (const solution of completeSolutions) {
    // Build complete resource list for schema analysis
    const allResources = [solution.primary, ...solution.required, ...solution.optional];
    const schemas = await this.fetchDetailedSchemas(allResources, discovery.explainResource);
    
    const resourceSolution: ResourceSolution = {
      type: solution.required.length > 0 ? 'combination' : 'single',
      resources: schemas,
      score: this.calculateCompletionScore(solution), // Higher score for complete solutions
      description: `Complete ${solution.primary.kind} solution with dependencies`,
      reasons: [
        `Primary: ${solution.primary.kind} handles core functionality`,
        ...solution.required.map(dep => `Required: ${dep.kind} provides foundation`),
        ...solution.optional.map(dep => `Optional: ${dep.kind} enhances functionality`)
      ],
      analysis: solution.rationale,
      questions: await this.generateQuestionsWithAI(intent, { resources: schemas }),
      patternInfluences: [],
      usedPatterns: false
    };
    
    resourceSolutions.push(resourceSolution);
  }
  
  return resourceSolutions.sort((a, b) => b.score - a.score);
}
```

## Decision Log

- Decision: Use Graph DB for dependency relationships in PRD-49
  - Date: 2025-08-08
  - Rationale: Requires transitive traversal, reverse lookups, cycle detection, and topological ordering; graph databases provide correctness and efficient queries for these operations.
  - Impact: Architecture updated to graph storage and traversal; Milestone 2 changed to Graph DB; Technical Dependencies updated; code examples updated to `DependencyGraphService`.
  - Code Impact: Introduce graph driver (e.g., `neo4j-driver`), implement node/edge upserts, traversal APIs, cycle detection, and deploy ordering; update recommendation integration to call graph service.
  - Owner: Viktor Farcic

- Decision: Keep capability storage/search on Vector DB (PRD-48)
  - Date: 2025-08-08
  - Rationale: Primary operations are semantic intent matching with simple filters; no multi-hop reasoning required.
  - Impact: No change to PRD-49 aside from integration still using `CapabilityVectorService` for Phase 1.
  - Code Impact: None for this PRD.

## Implementation Milestones

### Milestone 1: Dependency Discovery Engine
- [ ] Implement schema-based dependency extraction
- [ ] Create cloud provider dependency inference (Azure, GCP, AWS patterns)
- [ ] Build operational dependency detection (networking, security, storage)
- **Success Criteria**: ResourceGroup dependency discovered for Azure Server resources

### Milestone 2: Graph DB Dependency Storage
- [ ] Integrate with PRD #47's cluster data management tool  
- [ ] Implement dependency storage and retrieval in Graph DB (nodes/edges)
- [ ] Support traversal for transitive dependencies and reverse dependents
- [ ] Implement cycle detection and topological ordering for deploy sequence
- **Success Criteria**: Dependencies stored and retrievable via graph queries; complete deploy order produced with cycle safeguards

### Milestone 3: Cluster Dependency Scanning
- [ ] Add dependency scanning operation to manageClusterData tool
- [ ] Implement batch dependency analysis for all cluster resources
- [ ] Add dependency validation and confidence scoring
- **Success Criteria**: Full cluster dependency scan completes and identifies major relationships

### Milestone 4: Complete Solution Assembly
- [ ] Implement getCompleteSolution functionality  
- [ ] Create solution validation and deployment order logic
- [ ] Add dependency conflict detection and resolution
- **Success Criteria**: Azure PostgreSQL request returns [ResourceGroup, Server, FirewallRule] complete solution

### Milestone 5: Recommendation System Integration
- [ ] Modify findBestSolutions to use dependency completion
- [ ] Implement solution scoring based on completeness
- [ ] Add fallback handling when dependencies unavailable
- **Success Criteria**: Recommended solutions include all required dependencies and deploy successfully

## Risk Assessment

### Technical Risks
- **Dependency Inference Accuracy**: May incorrectly identify or miss dependencies
- **Circular Dependencies**: Could create infinite loops in dependency chains
- **Schema Parsing Complexity**: Different CRD schema formats may break parsing
- **Performance Impact**: Dependency analysis for 415+ resources could be slow

### Mitigation Strategies
- **Confidence Scoring**: Track confidence levels for dependency relationships
- **Dependency Validation**: Implement cycle detection and maximum depth limits
- **Incremental Discovery**: Discover dependencies progressively, not all at once
- **Fallback Mechanisms**: Continue working even if dependency discovery fails

## Dependencies and Assumptions

### Technical Dependencies
- **PRD #47**: Generic cluster data management tool provides interface
- **PRD #48**: Resource capabilities provide context for dependency inference
- Graph DB infrastructure for relationship storage and traversal (e.g., Neo4j)
- Kubernetes API access for schema analysis

### Assumptions
- Resource schemas contain discoverable dependency patterns
- Cloud provider patterns are consistent enough for reliable inference
- Dependency relationships are primarily hierarchical (not circular)
- Users prefer complete solutions over partial ones, even if more complex

## Related Work

### Builds Upon
- **PRD #47**: Uses unified cluster data management interface
- **PRD #48**: Leverages capability information for better dependency inference
- Existing schema analysis and AI recommendation infrastructure

### Enables Future Work
- Advanced deployment ordering and validation
- Automated dependency conflict resolution  
- Machine learning improvements for dependency pattern recognition
- Integration with GitOps workflows for complete infrastructure management

## Appendix

### Example: Azure PostgreSQL Complete Solution

#### Current State (Broken)
```
User Intent: "PostgreSQL database on Azure with high availability"
↓
AI Recommendation:
- server.dbforpostgresql.azure (primary)
- firewallrule.dbforpostgresql.azure (optional)

Deployment Attempt:
❌ Error: ResourceGroup 'default-rg' not found
❌ Server creation fails - no foundation resources
```

#### After Implementation (Complete)
```
User Intent: "PostgreSQL database on Azure with high availability"
↓
Capability Search: Finds server.dbforpostgresql.azure
↓  
Dependency Analysis:
- server.dbforpostgresql.azure requires:
  * resourcegroup.azure (foundation)
- server.dbforpostgresql.azure enhances with:
  * firewallrule.dbforpostgresql.azure (security)
  * backup.dbforpostgresql.azure (availability)
↓
Complete Solution Assembly:
1. resourcegroup.azure (foundation - deploy first)
2. server.dbforpostgresql.azure (primary resource)
3. firewallrule.dbforpostgresql.azure (security enhancement)
4. backup.dbforpostgresql.azure (high availability requirement)
↓
Deployment:
✅ ResourceGroup creates foundation
✅ Server creates successfully with ResourceGroup reference  
✅ FirewallRule configures secure access
✅ Backup enables high availability
✅ Complete, working PostgreSQL deployment
```

### Dependency Pattern Examples

#### Azure Resource Dependencies
```typescript
// Discovered automatically from schema analysis
const azureDependencies = [
  {
    dependent: "server.dbforpostgresql.azure",
    dependency: "resourcegroup.azure", 
    type: "required",
    field: "spec.resourceGroupName",
    reason: "Azure resources require ResourceGroup foundation"
  },
  {
    dependent: "firewallrule.dbforpostgresql.azure",
    dependency: "server.dbforpostgresql.azure",
    type: "required", 
    field: "spec.serverName",
    reason: "Firewall rules apply to specific database servers"
  }
];
```

#### Cross-Cloud Dependency Patterns
```typescript
// Generic patterns that work across providers
const genericDependencies = [
  {
    dependent: "any-storage-resource",
    dependency: "StorageClass",
    type: "optional",
    field: "spec.storageClassName", 
    reason: "Storage resources benefit from explicit storage class configuration"
  },
  {
    dependent: "any-workload",
    dependency: "ServiceAccount",
    type: "optional",
    field: "spec.serviceAccountName",
    reason: "Workloads can use custom service accounts for RBAC"
  }
];
```

This PRD ensures that users receive complete, deployable solutions instead of partial configurations that fail during deployment due to missing dependencies.