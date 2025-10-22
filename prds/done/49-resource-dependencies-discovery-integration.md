# PRD-49: Resource Dependencies Discovery & Integration

**Status**: No Longer Needed
**Created**: 2025-08-10
**Closed**: 2025-10-22
**GitHub Issue**: [#49](https://github.com/vfarcic/dot-ai/issues/49)  
**Dependencies**: [PRD #47 - Generic Cluster Data Management Tool](./47-generic-cluster-data-management-tool.md)  
**Related PRDs**: Complements PRD #48 (Resource Capabilities) for complete solution assembly

## Executive Summary

AI recommendation system frequently produces incomplete solutions that fail during deployment because it misses critical resource dependencies and architectural relationships. This PRD implements a Graph DB-based dependency discovery system using Neo4j to model resource relationships, enabling automatic assembly of complete, deployable solutions with proper dependency ordering and architectural completeness.

## Problem Statement

### Current Issues with Incomplete Solutions
1. **Schema Dependencies**: Missing ConfigMap, Secret, ServiceAccount references
2. **Architectural Dependencies**: AI suggests Deployment without Service/Ingress
3. **Foundation Dependencies**: ResourceGroup excluded from Azure solutions  
4. **Deployment Failures**: Users get solutions that can't actually be deployed
5. **Manual Assembly**: Users must manually figure out missing architectural pieces

### Real-World Examples
**Example 1**: "Deploy a web application"
- AI recommends: `[Deployment]`
- **Missing**: `Service` (for networking), `Ingress` (for external access)
- **Result**: Application deploys but is unreachable

**Example 2**: "PostgreSQL on Azure"  
- AI recommends: `[Server, FirewallRule]`
- **Missing**: `ResourceGroup` (required foundation)
- **Result**: Deployment fails because ResourceGroup wasn't created first

## Success Criteria

### Primary Goals
- **Complete Architectural Solutions**: Both schema and logical dependencies included
- **Deployment Success**: Recommended solutions work without manual intervention  
- **Intelligent Recommendations**: System understands both "needs" and "commonly used with"
- **Proper Ordering**: Dependencies deployed in correct sequence

### Success Metrics
- Web application requests include Service + Ingress automatically
- Azure resources include ResourceGroup foundation automatically  
- Deployment success rate improves for recommended solutions
- Reduced user-reported "incomplete solution" issues

## Solution Architecture

### Neo4j-Based Dependency Graph
```
Kubernetes Resources (Nodes)
↓
Schema Analysis + Architectural Pattern Learning
↓ 
Graph Relationships (Edges):
- REQUIRES (schema dependencies)
- SUGGESTS (architectural patterns) 
- ENHANCES (optional additions)
↓
Graph Traversal Queries
↓
Complete Solution Assembly
```

### Two Types of Dependencies

#### 1. Schema Dependencies (REQUIRES)
Explicit references in resource schemas:
```yaml
# Pod schema dependency on ServiceAccount
spec:
  serviceAccountName: my-service-account  # REQUIRES ServiceAccount
  volumes:
  - configMap:
      name: my-config                     # REQUIRES ConfigMap
```

#### 2. Architectural Dependencies (SUGGESTS)  
Common architectural patterns not in schema:
```
Deployment SUGGESTS Service (for networking)
Service SUGGESTS Ingress (for external access)
StatefulSet SUGGESTS PersistentVolumeClaim (for storage)
Database SUGGESTS Backup (for reliability)
```

### Integration with Existing PRDs
```typescript
// Phase 1: PRD #48 finds primary resources via vector search
const primaryResources = await capabilitySearch("web application");
// Result: [Deployment.apps]

// Phase 2: PRD #49 finds dependencies via graph traversal  
const completeSolution = await dependencyGraph.getCompleteSolution(primaryResources[0]);
// Result: {
//   primary: Deployment.apps,
//   requires: [ServiceAccount, ConfigMap],
//   suggests: [Service, Ingress], 
//   enhances: [HorizontalPodAutoscaler]
// }

// Phase 3: Complete solution assembly
const deployableSolution = {
  foundation: completeSolution.requires,     // Deploy first
  primary: completeSolution.primary,        // Core functionality
  networking: completeSolution.suggests,    // Architectural completeness  
  enhancements: completeSolution.enhances   // Optional improvements
};
```

## Technical Implementation

### Neo4j Graph Schema
```cypher
// Resource nodes with metadata
CREATE (r:Resource {
  kind: "Deployment",
  group: "apps", 
  apiVersion: "apps/v1",
  provider: "kubernetes",
  category: "workload"
})

// Relationship types with metadata
CREATE (deployment:Resource {kind: "Deployment"})
CREATE (service:Resource {kind: "Service"})  
CREATE (deployment)-[:SUGGESTS {
  reason: "Deployments need Services for network access",
  field: "networking", 
  confidence: 0.9,
  pattern: "web-application"
}]->(service)
```

### Graph Service Implementation
```typescript
class DependencyGraphService {
  constructor(private neo4jDriver: Driver) {}

  // Load cluster resource schemas into graph
  async ingestClusterResources(): Promise<void> {
    const resources = await this.discoverClusterResources();
    
    for (const resource of resources) {
      // Create resource node
      await this.createResourceNode(resource);
      
      // Discover and create schema dependencies (REQUIRES)
      const schemaDeps = await this.analyzeSchemaReferences(resource);
      await this.createRequiresRelationships(resource, schemaDeps);
      
      // Learn architectural patterns (SUGGESTS) 
      const archPatterns = await this.learnArchitecturalPatterns(resource);
      await this.createSuggestsRelationships(resource, archPatterns);
    }
  }

  // Find complete solution for a resource
  async getCompleteSolution(primary: ResourceReference): Promise<CompleteSolution> {
    const session = this.neo4jDriver.session();
    
    try {
      // Find all REQUIRES dependencies (transitive)
      const requires = await session.run(`
        MATCH (primary:Resource {kind: $kind, group: $group})
        MATCH (primary)-[:REQUIRES*1..5]->(dep:Resource)
        RETURN DISTINCT dep.kind, dep.group, dep.apiVersion
      `, primary);

      // Find architectural SUGGESTS (direct only, to avoid explosion)
      const suggests = await session.run(`
        MATCH (primary:Resource {kind: $kind, group: $group})
        MATCH (primary)-[:SUGGESTS]->(arch:Resource)
        RETURN arch.kind, arch.group, arch.apiVersion, 
               rel.reason, rel.confidence, rel.pattern
      `, primary);

      // Find ENHANCES (optional improvements)
      const enhances = await session.run(`
        MATCH (primary:Resource {kind: $kind, group: $group})
        MATCH (primary)-[:ENHANCES]->(enh:Resource)
        RETURN enh.kind, enh.group, enh.apiVersion,
               rel.reason, rel.confidence
      `, primary);

      // Compute topological order for deployment
      const deployOrder = await this.computeDeploymentOrder([
        primary,
        ...requires.records.map(r => this.recordToResource(r)),
        ...suggests.records.map(r => this.recordToResource(r))
      ]);

      return {
        primary,
        requires: requires.records.map(r => this.recordToResource(r)),
        suggests: suggests.records.map(r => this.recordToResource(r)),
        enhances: enhances.records.map(r => this.recordToResource(r)),
        deploymentOrder: deployOrder,
        rationale: this.buildRationale(suggests.records, enhances.records)
      };

    } finally {
      await session.close();
    }
  }

  // Query by intent - find resources that match architectural patterns
  async findResourcesByPattern(pattern: string): Promise<ResourceReference[]> {
    const session = this.neo4jDriver.session();
    
    try {
      const result = await session.run(`
        MATCH (r:Resource)-[rel:SUGGESTS|ENHANCES]->()
        WHERE rel.pattern = $pattern OR r.category = $pattern
        RETURN DISTINCT r.kind, r.group, r.apiVersion
        ORDER BY rel.confidence DESC
      `, { pattern });

      return result.records.map(r => this.recordToResource(r));
    } finally {
      await session.close();
    }
  }

  // Learn patterns from existing deployments
  async learnArchitecturalPatterns(resource: ResourceReference): Promise<ArchitecturalPattern[]> {
    // Analyze actual cluster deployments to discover patterns like:
    // - When there's a Deployment with certain labels, there's usually a Service
    // - StatefulSets commonly have PersistentVolumeClaims  
    // - Databases often have backup CronJobs
    
    const patterns: ArchitecturalPattern[] = [];
    
    // Web application pattern
    if (this.isWebWorkload(resource)) {
      patterns.push({
        suggests: { kind: "Service", group: "", apiVersion: "v1" },
        reason: "Web workloads typically need Services for network access",
        confidence: 0.9,
        pattern: "web-application"
      });
      
      patterns.push({
        suggests: { kind: "Ingress", group: "networking.k8s.io", apiVersion: "networking.k8s.io/v1" },
        reason: "Web applications often need external access via Ingress",
        confidence: 0.7, 
        pattern: "web-application"
      });
    }
    
    // Database pattern  
    if (this.isDatabaseResource(resource)) {
      patterns.push({
        suggests: { kind: "PersistentVolumeClaim", group: "", apiVersion: "v1" },
        reason: "Databases need persistent storage",
        confidence: 0.95,
        pattern: "database"
      });
    }
    
    // Cloud provider patterns
    if (resource.group.includes("azure")) {
      patterns.push({
        suggests: { kind: "ResourceGroup", group: "azure.upbound.io", apiVersion: "azure.upbound.io/v1beta1" },
        reason: "Azure resources require ResourceGroup as foundation", 
        confidence: 0.98,
        pattern: "azure-foundation"
      });
    }
    
    return patterns;
  }

  // Analyze resource schema for explicit dependencies
  private async analyzeSchemaReferences(resource: ResourceReference): Promise<SchemaDependency[]> {
    const schema = await this.getResourceSchema(resource);
    const dependencies: SchemaDependency[] = [];
    
    // Parse schema for reference fields
    const referencePatterns = [
      { pattern: /serviceAccountName.*<string>/, 
        creates: { kind: "ServiceAccount", group: "", apiVersion: "v1" },
        field: "spec.serviceAccountName" },
      { pattern: /configMapRef.*<Object>/, 
        creates: { kind: "ConfigMap", group: "", apiVersion: "v1" },
        field: "spec.configMapRef" },
      { pattern: /secretRef.*<Object>/, 
        creates: { kind: "Secret", group: "", apiVersion: "v1" },
        field: "spec.secretRef" },
      { pattern: /resourceGroupName.*<string>/, 
        creates: { kind: "ResourceGroup", group: "azure.upbound.io", apiVersion: "azure.upbound.io/v1beta1" },
        field: "spec.resourceGroupName" }
    ];
    
    for (const pattern of referencePatterns) {
      if (pattern.pattern.test(schema)) {
        dependencies.push({
          requires: pattern.creates,
          field: pattern.field,
          reason: `Schema field ${pattern.field} references ${pattern.creates.kind}`,
          confidence: 0.95
        });
      }
    }
    
    return dependencies;
  }
}
```

### Integration with Recommendation System
```typescript
// Enhanced findBestSolutions with graph-based dependency completion
async findBestSolutions(intent: string, discovery: DiscoveryFunctions): Promise<ResourceSolution[]> {
  // Phase 1: Capability-based primary resource discovery (PRD #48)
  const capabilityService = new CapabilityVectorService(this.vectorDB);
  const primaryCandidates = await capabilityService.searchCapabilities(intent, 5);
  
  // Phase 2: Graph-based dependency completion (PRD #49)
  const dependencyService = new DependencyGraphService(this.neo4jDriver);
  const completeSolutions: CompleteSolution[] = [];
  
  for (const candidate of primaryCandidates) {
    const resourceRef = {
      kind: candidate.kind,
      group: candidate.group, 
      apiVersion: candidate.apiVersion
    };
    
    // Get complete solution with all dependencies
    const completeSolution = await dependencyService.getCompleteSolution(resourceRef);
    
    // Check if solution matches intent patterns
    const intentScore = await this.scoreIntentMatch(intent, completeSolution);
    completeSolution.intentScore = intentScore;
    
    completeSolutions.push(completeSolution);
  }
  
  // Phase 3: Convert to ResourceSolution format with completeness scoring
  const resourceSolutions: ResourceSolution[] = [];
  for (const solution of completeSolutions) {
    // Merge all resources for schema analysis
    const allResources = [
      solution.primary,
      ...solution.requires,
      ...solution.suggests, 
      ...solution.enhances
    ].filter(r => r); // Remove any nulls
    
    const schemas = await this.fetchDetailedSchemas(allResources, discovery.explainResource);
    
    const resourceSolution: ResourceSolution = {
      type: (solution.requires.length + solution.suggests.length) > 0 ? 'complete-architecture' : 'single',
      resources: schemas,
      score: this.calculateCompletenessScore(solution), // Higher score for complete solutions
      description: `Complete ${solution.primary.kind} architecture with dependencies`,
      reasons: [
        `Primary: ${solution.primary.kind} provides core functionality`,
        ...solution.requires.map(dep => `Required: ${dep.kind} (schema dependency)`),
        ...solution.suggests.map(dep => `Suggested: ${dep.kind} (architectural best practice)`),
        ...solution.enhances.map(dep => `Enhancement: ${dep.kind} (optional improvement)`)
      ],
      analysis: solution.rationale,
      deploymentOrder: solution.deploymentOrder,
      questions: await this.generateQuestionsWithAI(intent, { resources: schemas }),
      patternInfluences: this.extractPatternInfluences(solution),
      usedPatterns: true
    };
    
    resourceSolutions.push(resourceSolution);
  }
  
  return resourceSolutions
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Return top 3 complete solutions
}

private calculateCompletenessScore(solution: CompleteSolution): number {
  let score = 0.5; // Base score
  
  // Bonus for having required dependencies (schema completeness)
  score += solution.requires.length * 0.15;
  
  // Bonus for architectural suggestions (architectural completeness) 
  score += solution.suggests.length * 0.10;
  
  // Bonus for intent matching
  score += (solution.intentScore || 0) * 0.20;
  
  // Penalty for too many dependencies (complexity)
  const totalDeps = solution.requires.length + solution.suggests.length + solution.enhances.length;
  if (totalDeps > 5) score -= (totalDeps - 5) * 0.05;
  
  return Math.max(0, Math.min(1, score));
}
```

## Implementation Milestones

### Milestone 1: Neo4j Infrastructure Setup
- [ ] Set up Neo4j database infrastructure
- [ ] Create graph schema for resources and relationships
- [ ] Implement basic Neo4j driver integration
- [ ] Create resource node CRUD operations
- **Success Criteria**: Neo4j running and basic resource nodes can be created/queried

### Milestone 2: Schema Dependency Discovery
- [ ] Implement kubectl schema analysis for REQUIRES relationships
- [ ] Parse resource schemas for reference fields (serviceAccountName, configMapRef, etc.)
- [ ] Store schema dependencies as REQUIRES edges in Neo4j
- [ ] Add confidence scoring for schema-based dependencies
- **Success Criteria**: Pod resources show REQUIRES relationships to ServiceAccount, ConfigMap, Secret

### Milestone 3: Architectural Pattern Learning  
- [ ] Implement pattern-based SUGGESTS relationships
- [ ] Add common architectural patterns (web-app, database, cloud-provider)
- [ ] Learn patterns from existing cluster deployments
- [ ] Store architectural suggestions as SUGGESTS edges
- **Success Criteria**: Deployment resources show SUGGESTS relationships to Service, Ingress

### Milestone 4: Graph Traversal and Complete Solutions
- [ ] Implement transitive dependency traversal  
- [ ] Add topological sorting for deployment ordering
- [ ] Create complete solution assembly API
- [ ] Add cycle detection and validation
- **Success Criteria**: Deployment query returns complete architecture with Service + Ingress

### Milestone 5: Recommendation System Integration
- [ ] Integrate graph service with existing recommendation flow
- [ ] Implement completeness scoring for solutions
- [ ] Add pattern-based intent matching  
- [ ] Test with real user scenarios
- **Success Criteria**: "Deploy web app" returns [Deployment, Service, Ingress] automatically

## Risk Assessment

### Technical Risks
- **Pattern Accuracy**: Architectural patterns may not match user intent
- **Complexity Explosion**: Too many suggestions could overwhelm users
- **Performance**: Graph traversals could be slow for complex dependency chains
- **Graph Maintenance**: Keeping graph in sync with cluster changes

### Mitigation Strategies  
- **Confidence Scoring**: Track confidence levels and allow filtering
- **Pattern Categories**: Group patterns by use case (web, database, etc.)
- **Query Optimization**: Use indexed queries and limit traversal depth
- **Incremental Updates**: Update graph incrementally rather than full rebuilds

## Dependencies and Assumptions

### Technical Dependencies
- **Neo4j**: Graph database for relationship storage and traversal
- **PRD #47**: Generic cluster data management tool provides interface
- **PRD #48**: Resource capabilities provide primary resource discovery
- **Kubernetes API**: Access for schema analysis and cluster resource discovery

### Assumptions
- Neo4j infrastructure is available or can be set up
- Users prefer complete architectural solutions over minimal solutions
- Common architectural patterns exist and can be learned
- Schema-based dependencies are reliable indicators of requirements

## Related Work

### Builds Upon
- **PRD #47**: Uses unified cluster data management interface
- **PRD #48**: Leverages capability search for primary resource discovery
- Existing schema analysis and AI recommendation infrastructure

### Enables Future Work  
- Advanced deployment orchestration with proper dependency ordering
- Pattern learning from successful deployments
- Cross-cluster pattern sharing and recommendations
- GitOps integration with complete infrastructure definitions

## Appendix

### Example: Complete Web Application Solution

#### Before (Incomplete)
```
User: "Deploy a web application"
↓
Primary Resource: Deployment.apps
↓ 
Result: [Deployment] 
↓
Deployment: ✅ Pod runs
Access: ❌ No way to reach the application
```

#### After (Complete)  
```
User: "Deploy a web application"
↓
Primary Resource: Deployment.apps (from capabilities)  
↓
Graph Traversal:
- Deployment SUGGESTS Service (networking)
- Service SUGGESTS Ingress (external access)
↓
Complete Solution: [Deployment, Service, Ingress]
↓
Deployment: ✅ Pod runs
Networking: ✅ Service provides internal access
External: ✅ Ingress provides external access
```

### Example: Azure Database Complete Solution

#### Before (Missing Foundation)
```
User: "PostgreSQL on Azure"
↓
Result: [Server, FirewallRule]
↓ 
Deploy: ❌ ResourceGroup missing
```

#### After (Complete Foundation)
```
User: "PostgreSQL on Azure" 
↓
Primary: Server.dbforpostgresql.azure
↓
Graph Analysis:
- Server REQUIRES ResourceGroup (schema dependency)
- Server SUGGESTS FirewallRule (security pattern)
- Server ENHANCES BackupConfiguration (reliability pattern)
↓
Complete Solution:
1. ResourceGroup (foundation)
2. Server (primary) 
3. FirewallRule (security)
4. BackupConfiguration (reliability)
↓
Deploy: ✅ Complete working database with proper foundation
```

This PRD transforms the AI recommendation system from producing minimal, often incomplete solutions to generating complete, architecturally sound deployments that work out of the box.

---

## Work Log

### 2025-10-22: PRD Closure - No Longer Needed
**Duration**: N/A (administrative closure)
**Status**: Closed

**Closure Summary**:
After thorough analysis and discussion, this PRD is no longer needed. The core problems this PRD aimed to solve are already addressed by the current system architecture without requiring Graph DB infrastructure.

**Why Graph DB is No Longer Needed**:

1. **Schema Dependencies Already Solved**
   - AI can analyze schemas on-demand via `kubectl explain`
   - Current system at `src/core/schema.ts:629-704` implements `addMissingPatternResources()`
   - Manual organizational patterns successfully include missing dependencies (e.g., ResourceGroup for Azure)
   - No need for pre-computed REQUIRES relationships

2. **Architectural Patterns Better as Manual**
   - Current manual patterns (Vector DB) are prescriptive and intent-based
   - Platform teams encode expert knowledge, not just observed correlations
   - Automated pattern learning would reinforce existing practices (good or bad)
   - Manual patterns provide context and rationale that automated learning cannot

3. **Current System Provides Complete Solutions**
   - Vector DB semantic search finds primary resources
   - Manual organizational patterns add missing resources
   - AI assembles complete solutions with proper context
   - Example working flow: User → Capability Search → Pattern Enhancement → AI Assembly → Complete Solution

4. **Operational Complexity Not Justified**
   - Graph DB requires: Neo4j infrastructure, sync mechanisms, maintenance overhead
   - Benefits are marginal optimizations, not fundamental capabilities
   - AI can reason about relationships dynamically without pre-computation
   - Current Vector DB + manual patterns architecture is simpler and effective

**Key Implementation Already Present**:
- `schema.ts:629-704`: Pattern-based resource completion
- `pattern-vector-service.ts`: Semantic pattern search
- `capability-vector-service.ts`: Resource capability matching
- AI integration handles complex relationship reasoning

**Functionality Status**:

| Requirement | Current Solution | Status |
|-------------|-----------------|--------|
| Complete solutions | Manual patterns + AI | ✅ Implemented |
| Missing dependencies | Pattern suggestedResources | ✅ Implemented |
| Schema relationships | AI schema analysis | ✅ Implemented |
| Architectural patterns | Manual pattern definition | ✅ Implemented |
| Deployment ordering | AI reasoning | ✅ Implemented |

**Not Implemented** (no longer needed):
- Neo4j Graph DB infrastructure
- REQUIRES/SUGGESTS/ENHANCES relationship graph
- Automated pattern learning from cluster observation
- Pre-computed dependency traversal

**Decision Rationale**:
The PRD was exploratory and proposed Graph DB as a solution before the current Vector DB + manual patterns architecture was fully developed. Real-world usage demonstrates that:
- Complete solutions are achievable without Graph DB
- Manual patterns provide superior quality over automated learning
- Operational complexity of Graph DB doesn't justify marginal benefits
- AI can handle relationship reasoning dynamically

**Related**: PRD #98 (Relationship Modeling Epic) also closed for same reasons.