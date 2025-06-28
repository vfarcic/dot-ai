/**
 * Core Intelligence Module
 * 
 * Shared intelligence for both CLI and MCP interfaces
 */

import { KubernetesDiscovery } from './discovery';
import { MemorySystem } from './memory';
import { WorkflowEngine } from './workflow';
import { ClaudeIntegration } from './claude';

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

  constructor(config: CoreConfig = {}) {
    this.validateConfig(config);
    this.config = config;
    
    // Initialize modules
    this.discovery = new KubernetesDiscovery({ 
      kubeconfigPath: config.kubernetesConfig 
    });
    this.memory = new MemorySystem();
    this.workflow = new WorkflowEngine();
    this.claude = new ClaudeIntegration(config.anthropicApiKey || 'test-key');
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
}

// Re-export all modules for convenience
export { KubernetesDiscovery } from './discovery';
export { MemorySystem } from './memory';
export { WorkflowEngine } from './workflow';
export { ClaudeIntegration } from './claude';

// Default export
export default AppAgent; 