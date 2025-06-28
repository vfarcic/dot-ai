/**
 * Model Context Protocol (MCP) Interface for App-Agent
 * 
 * Provides MCP server capabilities that expose App-Agent functionality
 * to AI assistants like Claude through standardized protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { AppAgent } from '../core/index.js';

export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
}

export class MCPServer {
  private server: Server;
  private appAgent: AppAgent;
  private initialized: boolean = false;

  constructor(appAgent: AppAgent, config: MCPServerConfig) {
    this.appAgent = appAgent;
    this.server = new Server(
      {
        name: config.name,
        version: config.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    // Register list tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'discover_cluster',
            description: 'Discover Kubernetes cluster resources and capabilities',
            inputSchema: {
              type: 'object',
              properties: {
                deep_scan: {
                  type: 'boolean',
                  description: 'Perform deep resource discovery including CRDs',
                  default: false
                }
              }
            }
          },
          {
            name: 'deploy_application',
            description: 'Deploy application to Kubernetes cluster with AI assistance',
            inputSchema: {
              type: 'object',
              properties: {
                spec: {
                  type: 'string',
                  description: 'Application specification in plain English or YAML'
                },
                namespace: {
                  type: 'string',
                  description: 'Target namespace for deployment',
                  default: 'default'
                },
                interactive: {
                  type: 'boolean',
                  description: 'Enable interactive deployment with AI guidance',
                  default: true
                }
              },
              required: ['spec']
            }
          },
          {
            name: 'check_status',
            description: 'Check cluster status and deployment health',
            inputSchema: {
              type: 'object',
              properties: {
                workflow_id: {
                  type: 'string',
                  description: 'Optional workflow ID to check specific deployment status'
                }
              }
            }
          },
          {
            name: 'learn_patterns',
            description: 'Retrieve deployment patterns and recommendations from memory',
            inputSchema: {
              type: 'object',
              properties: {
                pattern_type: {
                  type: 'string',
                  description: 'Type of pattern to retrieve (deployment, service, ingress, etc.)'
                }
              }
            }
          }
        ]
      };
    });

    // Register call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'discover_cluster':
            return await this.handleDiscoverCluster(args);
          case 'deploy_application':
            return await this.handleDeployApplication(args);
          case 'check_status':
            return await this.handleCheckStatus(args);
          case 'learn_patterns':
            return await this.handleLearnPatterns(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error}`
        );
      }
    });
  }

  private async handleDiscoverCluster(args: any): Promise<{ content: { type: string; text: string }[] }> {
    await this.ensureInitialized();
    
    const resources = await this.appAgent.discovery.discoverResources();
    const clusterInfo = await this.appAgent.discovery.getClusterInfo();
    
    if (args.deep_scan) {
      const crds = await this.appAgent.discovery.discoverCRDs();
      resources.custom = crds;
    }

    const result = {
      cluster: clusterInfo,
      resources: resources,
      timestamp: new Date().toISOString()
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  private async handleDeployApplication(args: any): Promise<{ content: { type: string; text: string }[] }> {
    await this.ensureInitialized();

    const workflowId = await this.appAgent.workflow.createDeploymentWorkflow({
      spec: args.spec,
      namespace: args.namespace || 'default',
      interactive: args.interactive !== false
    });

    const result = {
      workflow_id: workflowId,
      status: 'created',
      message: 'Deployment workflow created successfully'
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  private async handleCheckStatus(args: any): Promise<{ content: { type: string; text: string }[] }> {
    await this.ensureInitialized();

    const status = {
      cluster_connected: this.appAgent.discovery.isConnected(),
      current_phase: this.appAgent.workflow.getCurrentPhase(),
      workflow_id: args.workflow_id || null,
      timestamp: new Date().toISOString()
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2)
        }
      ]
    };
  }

  private async handleLearnPatterns(args: any): Promise<{ content: { type: string; text: string }[] }> {
    await this.ensureInitialized();

    const patternType = args.pattern_type || 'deployment';
    const recommendations = await this.appAgent.memory.getRecommendations(patternType, {});
    const successPatterns = await this.appAgent.memory.getSuccessPatterns(patternType);
    
    const result = {
      pattern_type: patternType,
      recommendations: recommendations,
      success_patterns: successPatterns,
      timestamp: new Date().toISOString()
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.appAgent.initialize();
      await this.appAgent.discovery.connect();
      this.initialized = true;
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  async stop(): Promise<void> {
    await this.server.close();
  }

  getToolCount(): number {
    // Return the number of registered tools
    return 4;
  }

  isReady(): boolean {
    return this.initialized;
  }
} 