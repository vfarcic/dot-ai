/**
 * Core Intelligence Module
 * 
 * Shared intelligence for both CLI and MCP interfaces
 */

import { KubernetesDiscovery } from './discovery';
import { MemorySystem } from './memory';
import { WorkflowEngine } from './workflow';
import { ClaudeIntegration } from './claude';
import { SchemaParser, ManifestValidator, ResourceRecommender } from './schema';

export interface CoreConfig {
  kubernetesConfig?: string;
  anthropicApiKey?: string;
}

export class AppAgent {
  private config: CoreConfig;
  private initialized: boolean = false;
  
  public readonly discovery: KubernetesDiscovery;
  public readonly memory: MemorySystem;
  public readonly workflow: WorkflowEngine;
  public readonly claude: ClaudeIntegration;
  public readonly schema: {
    parser: SchemaParser;
    validator: ManifestValidator;
    ranker: ResourceRecommender | null;
    parseResource: (resourceName: string) => Promise<any>;
    validateManifest: (manifestPath: string) => Promise<any>;
    rankResources: (intent: string) => Promise<any>;
  };

  constructor(config: CoreConfig = {}) {
    this.validateConfig(config);
    // Centralize environment variable reading
    this.config = {
      kubernetesConfig: config.kubernetesConfig || process.env.KUBECONFIG,
      anthropicApiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY
    };
    
    // Initialize modules
    this.discovery = new KubernetesDiscovery({ 
      kubeconfigPath: this.config.kubernetesConfig 
    });
    this.memory = new MemorySystem();
    this.workflow = new WorkflowEngine();
    this.claude = new ClaudeIntegration(this.config.anthropicApiKey || 'test-key');
    
    // Initialize schema components
    const parser = new SchemaParser();
    const validator = new ManifestValidator();
    const ranker = this.config.anthropicApiKey ? 
      new ResourceRecommender({ claudeApiKey: this.config.anthropicApiKey }) : 
      null;
    
    this.schema = {
      parser,
      validator,
      ranker,
      parseResource: async (resourceName: string) => {
        // Get resource explanation from discovery
        const explanation = await this.discovery.explainResource(resourceName);
        return parser.parseResourceExplanation(explanation);
      },
      validateManifest: async (manifestPath: string) => {
        // This would read the manifest file and validate it
        // For now, return a mock implementation
        return {
          valid: true,
          errors: [],
          warnings: []
        };
      },
      rankResources: async (intent: string) => {
        if (!ranker) {
          throw new Error('ResourceRanker not available. ANTHROPIC_API_KEY is required for AI-powered ranking.');
        }
        
        // Create discovery functions with proper binding
        const discoverResourcesFn = async () => await this.discovery.discoverResources();
        const explainResourceFn = async (resource: string) => await this.discovery.explainResource(resource);
        
        return await ranker.findBestSolutions(intent, discoverResourcesFn, explainResourceFn);
      }
    };
  }

  private validateConfig(config: CoreConfig): void {
    if (config.anthropicApiKey === '') {
      throw new Error('Invalid configuration: Empty API key provided');
    }
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

  isInitialized(): boolean {
    return this.initialized;
  }

  getVersion(): string {
    return '0.1.0';
  }

  getAnthropicApiKey(): string | undefined {
    return this.config.anthropicApiKey;
  }
}

// Re-export all modules for convenience
export { KubernetesDiscovery } from './discovery';
export { MemorySystem } from './memory';
export { WorkflowEngine } from './workflow';
export { ClaudeIntegration } from './claude';
export { SchemaParser, ManifestValidator, ResourceRecommender } from './schema';

// Default export
export default AppAgent; 