# PRD-48: Resource Capabilities Discovery & Integration

**Status**: Draft  
**Created**: 2025-08-05  
**GitHub Issue**: [#48](https://github.com/vfarcic/dot-ai/issues/48)  
**Dependencies**: [PRD #47 - Generic Cluster Data Management Tool](./47-generic-cluster-data-management-tool.md)  
**Related PRDs**: Works alongside PRD #49 (Resource Dependencies) for complete solution

## Executive Summary

AI recommendation system fails to match user intents like "PostgreSQL database" to optimal resources like `sqls.devopstoolkit.live` because it cannot understand semantic relationships between generic resource names and specific capabilities. This PRD implements cluster scanning to discover and store resource capabilities in Vector DB, enabling semantic intent-to-resource matching that solves the "sqls.devopstoolkit.live not found" problem.

## Problem Statement

### Current Issues with Semantic Matching
1. **Generic Name Blindness**: AI doesn't recognize that "SQL" resource handles "PostgreSQL" intents
2. **Capability Unknown**: System doesn't know what each resource actually does
3. **Intent Mismatch**: "database in Azure" doesn't match `sqls.devopstoolkit.live` 
4. **Overwhelming Information**: 415 resources without capability context confuses AI

### Real-World Impact
- User requests: "PostgreSQL database on Azure"
- AI sees: `sqls.devopstoolkit.live` (name means nothing to AI)
- AI picks: Complex multi-resource solutions instead
- User misses: Perfect one-resource solution that handles everything

## Success Criteria

### Primary Goals
- **Semantic Discovery**: "PostgreSQL" intent finds `sqls.devopstoolkit.live` as top candidate
- **Capability Intelligence**: System understands what each resource actually does
- **Intent Matching**: Generic resource names matched to specific user needs
- **Improved Recommendations**: AI gets pre-filtered, relevant resource candidates

### Success Metrics
- `sqls.devopstoolkit.live` appears in PostgreSQL/database recommendations
- Composite resources prioritized over complex multi-resource solutions
- Recommendation accuracy improves for generic resource names
- AI processing time reduces (fewer resources to analyze)

## Solution Architecture

### Capability Discovery Pipeline
```
Cluster Resources (415+)
↓
Schema Analysis + Metadata Extraction
↓
Capability Inference (AI-powered)
↓
Vector DB Storage (semantic embeddings)
↓
Fast Semantic Search for Recommendations
```

### Integration with PRD #47
```typescript
// Using the unified cluster data management tool
await manageClusterData({
  dataType: 'capabilities',
  operation: 'scan',
  // Analyzes all cluster resources and stores capabilities
});

// Later, during recommendations:
const capabilities = await vectorDB.search(userIntent, {type: 'capabilities'});
// Returns: SQL.devopstoolkit.live with high relevance score
```

## Technical Implementation

### Capability Data Structure
```typescript
interface ResourceCapability {
  // Resource identification
  kind: string;              // "SQL"
  group: string;             // "devopstoolkit.live"
  apiVersion: string;        // "devopstoolkit.live/v1beta1"
  
  // Capability information
  capabilities: string[];    // ["postgresql", "mysql", "database", "multi-cloud"]
  providers: string[];       // ["azure", "gcp", "aws"] 
  abstractions: string[];    // ["high-availability", "persistent-storage", "backup"]
  complexity: 'low' | 'medium' | 'high';  // User experience complexity
  
  // Metadata for AI understanding
  description: string;       // "Managed database solution supporting multiple engines"
  useCase: string;          // "Simple database deployment without infrastructure complexity"
  
  // Vector embedding for semantic search
  embedding?: number[];      // Generated from capability description
  
  // Analysis metadata
  analyzedAt: string;        // ISO timestamp
  schemaVersion: string;     // CRD version when analyzed
}
```

### Capability Inference Engine
```typescript
class CapabilityInferenceEngine {
  /**
   * Analyze resource to infer capabilities
   */
  async inferCapabilities(resource: ResourceReference): Promise<ResourceCapability> {
    // Step 1: Schema analysis
    const schema = await this.getResourceSchema(resource);
    const schemaCapabilities = this.extractFromSchema(schema);
    
    // Step 2: Metadata analysis  
    const metadata = await this.getResourceMetadata(resource);
    const metadataCapabilities = this.extractFromMetadata(metadata);
    
    // Step 3: AI-powered inference
    const aiCapabilities = await this.inferWithAI(resource, schema, metadata);
    
    // Step 4: Combine and validate
    return this.combineCapabilities(schemaCapabilities, metadataCapabilities, aiCapabilities);
  }
  
  /**
   * Extract capabilities from CRD schema fields
   */
  private extractFromSchema(schema: string): string[] {
    const capabilities = [];
    
    // Database indicators
    if (schema.includes('database') || schema.includes('sql')) {
      capabilities.push('database');
    }
    
    // Engine detection
    if (schema.includes('postgresql') || schema.includes('postgres')) {
      capabilities.push('postgresql');
    }
    if (schema.includes('mysql')) {
      capabilities.push('mysql');
    }
    
    // Cloud provider detection
    if (schema.includes('azure') || schema.includes('resourceGroup')) {
      capabilities.push('azure');
    }
    
    return capabilities;
  }
  
  /**
   * Use AI to infer capabilities from resource context
   */
  private async inferWithAI(resource: ResourceReference, schema: string, metadata: any): Promise<string[]> {
    const prompt = this.buildInferencePrompt(resource, schema, metadata);
    const response = await this.claudeIntegration.sendMessage(prompt);
    return this.parseCapabilitiesFromAI(response);
  }
}
```

### Vector DB Integration
```typescript
class CapabilityVectorService {
  async storeCapability(capability: ResourceCapability): Promise<void> {
    // Generate embedding from capability description
    const embedding = await this.generateEmbedding(
      `${capability.kind} ${capability.capabilities.join(' ')} ${capability.description}`
    );
    
    await this.vectorDB.store({
      id: `capability-${capability.kind}-${capability.group}`,
      type: 'capability',
      embedding,
      metadata: capability
    });
  }
  
  async searchCapabilities(intent: string, limit: number = 10): Promise<ResourceCapability[]> {
    const results = await this.vectorDB.search(intent, {
      type: 'capability',
      limit
    });
    
    return results.map(result => result.metadata as ResourceCapability);
  }
}
```

## Integration with Recommendation System

### Enhanced Two-Phase Recommendation Flow

#### Current Flow (Broken)
```
User: "PostgreSQL database"
↓
AI gets 415 raw resources
↓
AI picks: StatefulSet + ConfigMap + Secret (complex)
↓
Misses: sqls.devopstoolkit.live (perfect solution)
```

#### New Flow (With Capabilities)
```
User: "PostgreSQL database"
↓
Phase 1: Semantic capability search
  Vector DB finds: sqls.devopstoolkit.live (high relevance)
↓
Phase 2: AI ranking of pre-filtered candidates  
  AI compares: 3-5 relevant resources instead of 415
↓
Result: sqls.devopstoolkit.live ranked #1 (optimal solution)
```

### Modified AI Ranking Integration
```typescript
// Enhanced findBestSolutions in schema.ts
async findBestSolutions(intent: string, discovery: DiscoveryFunctions): Promise<ResourceSolution[]> {
  // NEW: Phase 0 - Capability-based pre-filtering
  const capabilityService = new CapabilityVectorService(this.vectorDB);
  const relevantCapabilities = await capabilityService.searchCapabilities(intent, 10);
  
  if (relevantCapabilities.length > 0) {
    console.log(`🎯 Found ${relevantCapabilities.length} capabilities matching intent`);
    
    // Convert capabilities to resource candidates
    const candidates = relevantCapabilities.map(cap => ({
      kind: cap.kind,
      apiVersion: cap.apiVersion,
      group: cap.group
    }));
    
    // Continue with existing schema analysis on filtered candidates
    const schemas = await this.fetchDetailedSchemas(candidates, discovery.explainResource);
    return await this.rankWithDetailedSchemas(intent, schemas, []);
  }
  
  // Fallback to original discovery if no capabilities found
  console.log('⚠️ No capabilities found, falling back to full discovery');
  return this.originalFindBestSolutions(intent, discovery);
}
```

## Implementation Milestones

### Milestone 1: Capability Inference Engine
- [ ] Implement schema-based capability extraction
- [ ] Create metadata analysis for capability hints
- [ ] Build AI-powered capability inference system
- **Success Criteria**: Can analyze `sqls.devopstoolkit.live` and identify database capabilities

### Milestone 2: Vector DB Capability Storage
- [ ] Integrate with PRD #47's cluster data management tool
- [ ] Implement capability storage and retrieval in Vector DB
- [ ] Create semantic embedding generation for capabilities
- **Success Criteria**: Capabilities stored and searchable via "postgresql" queries

### Milestone 3: Cluster Scanning Integration
- [ ] Add cluster scanning operation to manageClusterData tool
- [ ] Implement batch capability analysis for all cluster resources
- [ ] Add progress tracking and error handling for large clusters
- **Success Criteria**: Full cluster scan completes and stores all resource capabilities

### Milestone 4: Recommendation System Integration  
- [ ] Modify findBestSolutions to use capability pre-filtering
- [ ] Implement fallback to original system when capabilities unavailable
- [ ] Add capability-based resource ranking enhancements
- **Success Criteria**: "PostgreSQL database" intent returns sqls.devopstoolkit.live as top recommendation

### Milestone 5: Production Readiness
- [ ] Comprehensive testing with various cluster configurations
- [ ] Performance optimization for large-scale capability analysis
- [ ] Documentation and user guidance for capability management
- **Success Criteria**: Feature ready for production use with measurable recommendation improvements

## Risk Assessment

### Technical Risks
- **AI Inference Accuracy**: Capability inference might be incorrect for complex resources
- **Schema Parsing Complexity**: Different CRD schemas may be inconsistent
- **Performance Impact**: Full cluster scanning could be slow for large clusters

### Mitigation Strategies
- **Validation Framework**: Human-reviewable capability inference with override capabilities
- **Incremental Analysis**: Scan resources progressively, not all at once
- **Caching Strategy**: Cache capability analysis to avoid repeated schema fetching

## Dependencies and Assumptions

### Technical Dependencies
- **PRD #47**: Generic cluster data management tool provides the interface
- Vector DB infrastructure (Qdrant) for capability storage
- Claude AI integration for capability inference
- Kubernetes API access for schema analysis

### Assumptions
- Resource schemas contain sufficient information for capability inference
- AI can accurately infer capabilities from schema and metadata context
- Vector embeddings effectively capture semantic relationships between intents and capabilities

## Related Work

### Builds Upon
- **PRD #47**: Uses unified cluster data management interface
- Existing AI recommendation pipeline and schema analysis
- Current Vector DB and pattern storage infrastructure

### Enables Future Work
- **PRD #49**: Resource dependencies can use capability information for better solution assembly
- Enhanced organizational patterns with capability-aware recommendations
- Machine learning improvements based on capability-intent matching data

## Appendix

### Example: PostgreSQL Intent Matching Flow

#### Current State (Broken)
```
User Intent: "PostgreSQL database on Azure"
↓
AI Analysis: 415 resources → overwhelmed
↓  
AI Selection: Server.dbforpostgresql.azure + StatefulSet + ConfigMap
↓
Missing: sqls.devopstoolkit.live (because AI didn't understand it handles PostgreSQL)
```

#### After Implementation (Fixed)
```
User Intent: "PostgreSQL database on Azure"
↓
Capability Search: "postgresql database azure" 
↓
Vector DB Results: 
  1. sqls.devopstoolkit.live (score: 0.95) - capabilities: [postgresql, database, azure, multi-cloud]
  2. server.dbforpostgresql.azure (score: 0.87) - capabilities: [postgresql, azure, infrastructure]
↓
AI Ranking: Pre-filtered candidates with capability context
↓
Final Result: sqls.devopstoolkit.live ranked #1 (optimal solution found!)
```

### Capability Inference Examples

#### SQL Resource Analysis
```yaml
# Input: sqls.devopstoolkit.live CRD
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: sqls.devopstoolkit.live
spec:
  group: devopstoolkit.live
  names:
    kind: SQL
    plural: sqls

# AI Inference Process:
# 1. Schema Analysis: "SQL" + "database" fields → database capability
# 2. Group Analysis: "devopstoolkit.live" → high-level composite  
# 3. Field Analysis: "provider", "engine" → multi-cloud, multi-engine
# 4. AI Context: "Simple database management" → low complexity

# Output: ResourceCapability
{
  kind: "SQL",
  group: "devopstoolkit.live", 
  capabilities: ["postgresql", "mysql", "database", "multi-cloud"],
  providers: ["azure", "gcp", "aws"],
  abstractions: ["managed-service", "high-availability"],
  complexity: "low",
  description: "High-level managed database solution supporting multiple engines and cloud providers",
  useCase: "Simple database deployment without infrastructure complexity"
}
```

This PRD ensures that users requesting database solutions will find the optimal high-level resources instead of being overwhelmed with complex multi-resource alternatives.