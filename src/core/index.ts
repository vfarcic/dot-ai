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
import { SchemaParser, ManifestValidator, ResourceRecommender, QuestionGroup } from './schema';
import { HelmChartInfo } from './helm-types';
import { AI_SERVICE_ERROR_TEMPLATES } from './constants';

// PRD #343: CoreConfig simplified - kubernetesConfig removed since all K8s ops go through plugin
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CoreConfig {
  // Reserved for future configuration options
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
    parseResource: (resourceName: string) => Promise<unknown>;
    rankResources: (intent: string) => Promise<unknown>;
    generateQuestionsForHelmChart: (intent: string, chart: HelmChartInfo, description: string, interaction_id?: string) => Promise<QuestionGroup>;
    fetchHelmChartContent: (chart: HelmChartInfo) => Promise<{ valuesYaml: string; readme: string }>;
  };

  constructor() {
    this.config = {};

    // Initialize modules
    // PRD #343: KubernetesDiscovery no longer needs kubeconfig - all K8s ops go through plugin
    this.discovery = new KubernetesDiscovery();
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
          throw new Error(AI_SERVICE_ERROR_TEMPLATES.RESOURCE_RANKER_UNAVAILABLE('AI-powered ranking'));
        }

        // Create discovery function with proper binding
        const explainResourceFn = async (resource: string) => await this.discovery.explainResource(resource);

        return await ranker.findBestSolutions(intent, explainResourceFn);
      },
      generateQuestionsForHelmChart: async (intent: string, chart: HelmChartInfo, description: string, interaction_id?: string) => {
        if (!ranker) {
          throw new Error(AI_SERVICE_ERROR_TEMPLATES.RESOURCE_RANKER_UNAVAILABLE('question generation'));
        }
        return await ranker.generateQuestionsForHelmChart(intent, chart, description, interaction_id);
      },
      fetchHelmChartContent: async (chart: HelmChartInfo) => {
        if (!ranker) {
          throw new Error(AI_SERVICE_ERROR_TEMPLATES.RESOURCE_RANKER_UNAVAILABLE('fetching Helm chart content'));
        }
        return await ranker.fetchHelmChartContent(chart);
      }
    };
  }

  async initialize(): Promise<void> {
    try {
      // Initialize all modules
      // PRD #343: K8s access via plugin - no connect() needed
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
  // PRD #359: Plugin manager is now handled through the unified registry
  // KubernetesDiscovery automatically uses the registry - no setPluginManager needed
}

// Re-export all modules for convenience
export { KubernetesDiscovery } from './discovery';
export { MemorySystem } from './memory';
export { WorkflowEngine } from './workflow';
export { AIProvider, AIResponse, AIProviderConfig } from './ai-provider.interface';
export { createAIProvider, AIProviderFactory } from './ai-provider-factory';
export { SchemaParser, ManifestValidator, ResourceRecommender } from './schema';
export { OrganizationalPattern, CreatePatternRequest } from './pattern-types';
export { BaseOrganizationalEntity, PolicyIntent, CreatePolicyIntentRequest, DeployedPolicyReference } from './organizational-types';
export { validatePattern, createPattern, serializePattern, deserializePattern } from './pattern-operations';
// Removed obsolete pattern creation types - now using unified creation system
export { BaseVectorService, BaseSearchOptions, BaseSearchResult, VectorDocument } from './base-vector-service';
export { PatternVectorService, PatternSearchOptions, PatternSearchResult } from './pattern-vector-service';
export { PolicyVectorService, PolicySearchOptions, PolicySearchResult } from './policy-vector-service';
export { CapabilityVectorService, ResourceCapability, CapabilitySearchOptions } from './capability-vector-service';
export { EmbeddingService, EmbeddingConfig, EmbeddingProvider, VercelEmbeddingProvider } from './embedding-service';
export { AgentDisplayOptions, buildAgentDisplayBlock } from './agent-display';
export { CircuitBreaker, CircuitBreakerFactory, CircuitBreakerConfig, CircuitBreakerStats, CircuitState, CircuitOpenError } from './circuit-breaker';

// Plugin system (PRD #343, #359)
export { PluginManager, PluginDiscoveryError } from './plugin-manager';
export { PluginClient, PluginClientError } from './plugin-client';
export {
  PluginConfig,
  PluginToolDefinition,
  DescribeResponse,
  InvokeResponse,
  InvokeSuccessResponse,
  InvokeErrorResponse,
  DiscoveredPlugin,
} from './plugin-types';

// Unified plugin registry (PRD #359)
export {
  initializePluginRegistry,
  getPluginManager,
  isPluginInitialized,
  invokePluginTool,
} from './plugin-registry';

// Default export
export default DotAI; 