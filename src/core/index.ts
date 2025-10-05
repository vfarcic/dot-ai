/**
 * Core Intelligence Module
 * 
 * Shared intelligence for both CLI and MCP interfaces
 */

import { KubernetesDiscovery } from './discovery';
import { MemorySystem } from './memory';
import { WorkflowEngine } from './workflow';
import { AIProvider } from './ai-provider.interface';
import { createAIProvider } from './ai-provider-factory';
import { SchemaParser, ManifestValidator, ResourceRecommender } from './schema';

export interface CoreConfig {
  kubernetesConfig?: string;
}

export class DotAI {
  private config: CoreConfig;
  private initialized: boolean = false;
  
  public readonly discovery: KubernetesDiscovery;
  public readonly memory: MemorySystem;
  public readonly workflow: WorkflowEngine;
  public readonly ai: AIProvider;
  public readonly schema: {
    parser: SchemaParser;
    validator: ManifestValidator;
    ranker: ResourceRecommender | null;
    parseResource: (resourceName: string) => Promise<any>;
    rankResources: (intent: string) => Promise<any>;
  };

  constructor(config: CoreConfig = {}) {
    this.config = {
      kubernetesConfig: config.kubernetesConfig || process.env.KUBECONFIG
    };
    
    // Initialize modules
    this.discovery = new KubernetesDiscovery({
      kubeconfigPath: this.config.kubernetesConfig
    });
    this.memory = new MemorySystem();
    this.workflow = new WorkflowEngine();
    this.ai = createAIProvider();
    
    // Initialize schema components
    const parser = new SchemaParser();
    const validator = new ManifestValidator();
    // ResourceRecommender uses the AI provider directly
    const ranker = new ResourceRecommender(this.ai);
    
    this.schema = {
      parser,
      validator,
      ranker,
      parseResource: async (resourceName: string) => {
        // Get raw resource explanation from discovery  
        const explanation = await this.discovery.explainResource(resourceName);
        
        // Parse GROUP, KIND, VERSION from kubectl explain output
        const lines = explanation.split('\n');
        const groupLine = lines.find((line: string) => line.startsWith('GROUP:'));
        const kindLine = lines.find((line: string) => line.startsWith('KIND:'));
        const versionLine = lines.find((line: string) => line.startsWith('VERSION:'));
        
        const group = groupLine ? groupLine.replace('GROUP:', '').trim() : '';
        const kind = kindLine ? kindLine.replace('KIND:', '').trim() : resourceName;
        const version = versionLine ? versionLine.replace('VERSION:', '').trim() : 'v1';
        
        // Build apiVersion from group and version
        const apiVersion = group ? `${group}/${version}` : version;
        
        // Return raw explanation for AI processing
        return { 
          kind: kind,
          rawExplanation: explanation,
          apiVersion: apiVersion,
          group: group,
          description: explanation.split('\n').find((line: string) => line.startsWith('DESCRIPTION:'))?.replace('DESCRIPTION:', '').trim() || '',
          properties: new Map() // Raw explanation contains all field info for AI
        };
      },
      rankResources: async (intent: string) => {
        if (!ranker) {
          throw new Error('ResourceRanker not available. AI provider API key is required for AI-powered ranking.');
        }
        
        // Create discovery function with proper binding
        const explainResourceFn = async (resource: string) => await this.discovery.explainResource(resource);
        
        return await ranker.findBestSolutions(intent, explainResourceFn);
      }
    };
  }

  async initialize(): Promise<void> {
    try {
      // Initialize all modules
      await this.discovery.connect();
      await this.memory.initialize();
      await this.workflow.initialize();
      
      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  async initializeWithoutCluster(): Promise<void> {
    try {
      // Initialize non-cluster modules only
      await this.memory.initialize();
      await this.workflow.initialize();
      
      this.initialized = true;
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getVersion(): string {
    return '0.1.0';
  }
}

// Re-export all modules for convenience
export { KubernetesDiscovery } from './discovery';
export { MemorySystem } from './memory';
export { WorkflowEngine } from './workflow';
export { AIProvider, AIResponse, IntentAnalysisResult, AIProviderConfig } from './ai-provider.interface';
export { createAIProvider, AIProviderFactory } from './ai-provider-factory';
export { SchemaParser, ManifestValidator, ResourceRecommender } from './schema';
export { OrganizationalPattern, CreatePatternRequest } from './pattern-types';
export { BaseOrganizationalEntity, PolicyIntent, CreatePolicyIntentRequest, DeployedPolicyReference } from './organizational-types';
export { validatePattern, createPattern, serializePattern, deserializePattern } from './pattern-operations';
// Removed obsolete pattern creation types - now using unified creation system
export { VectorDBService, VectorDBConfig, VectorDocument, SearchResult } from './vector-db-service';
export { BaseVectorService, BaseSearchOptions, BaseSearchResult } from './base-vector-service';
export { PatternVectorService, PatternSearchOptions, PatternSearchResult } from './pattern-vector-service';
export { PolicyVectorService, PolicySearchOptions, PolicySearchResult } from './policy-vector-service';
export { CapabilityVectorService, ResourceCapability, CapabilitySearchOptions } from './capability-vector-service';
export { EmbeddingService, EmbeddingConfig, EmbeddingProvider, OpenAIEmbeddingProvider } from './embedding-service';

// Default export
export default DotAI; 