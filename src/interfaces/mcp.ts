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
import { AppAgent } from '../core/index';
import { SchemaValidator, MCPToolSchemas } from '../core/validation';
import { formatRecommendationResponse } from '../core/schema';
import { 
  ErrorHandler, 
  ErrorCategory, 
  ErrorSeverity, 
  ConsoleLogger,
  Logger 
} from '../core/error-handling';
import { ToolRegistry, ToolContext, initializeTools } from '../tools';

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
  private logger: Logger;
  private requestIdCounter: number = 0;
  private toolRegistry: ToolRegistry;

  constructor(appAgent: AppAgent, config: MCPServerConfig) {
    this.appAgent = appAgent;
    this.logger = new ConsoleLogger('MCPServer');
    
    // Initialize tool registry with all available tools
    this.toolRegistry = initializeTools();
    
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

    this.logger.info('Initializing MCP Server', {
      name: config.name,
      version: config.version,
      author: config.author,
      registeredTools: this.toolRegistry.getStats().totalTools
    });

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    // Register list tools handler - dynamically get tools from registry
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const toolDefinitions = this.toolRegistry.getToolDefinitions();
      
      this.logger.debug('Listing available tools', {
        toolCount: toolDefinitions.length,
        tools: toolDefinitions.map(t => t.name)
      });

      return {
        tools: toolDefinitions.map(def => ({
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema
        }))
      };
    });

    // Register call tool handler with comprehensive error handling
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const requestId = this.generateRequestId();

      return await ErrorHandler.withErrorHandling(
        async () => {
          this.logger.info(`Processing tool request: ${name}`, {
            requestId,
            toolName: name,
            hasArgs: !!args
          });

          // Validate request structure
          if (!name || typeof name !== 'string') {
            throw ErrorHandler.createError(
              ErrorCategory.VALIDATION,
              ErrorSeverity.MEDIUM,
              'Tool name must be a non-empty string',
              {
                operation: 'tool_validation',
                component: 'MCPServer',
                requestId,
                input: { name, args }
              }
            );
          }

          // Dynamic tool dispatch through registry
          if (!this.toolRegistry.isToolAvailable(name)) {
            const availableTools = this.toolRegistry.getEnabledTools().map(t => t.definition.name);
            throw ErrorHandler.createError(
              ErrorCategory.MCP_PROTOCOL,
              ErrorSeverity.MEDIUM,
              `Unknown or disabled tool: ${name}`,
              {
                operation: 'tool_dispatch',
                component: 'MCPServer',
                requestId,
                input: { name, availableTools },
                suggestedActions: [
                  `Use one of the available tools: ${availableTools.join(', ')}`,
                  'Check the tool name for typos',
                  'Verify the MCP client is using the correct tool names',
                  'Ensure the tool is enabled in the registry'
                ]
              }
            );
          }

          // Create tool context
          const toolContext: ToolContext = {
            requestId,
            logger: this.logger,
            appAgent: this.appAgent
          };

          // Execute tool through registry
          return await this.toolRegistry.executeTool(name, args, toolContext);
        },
        {
          operation: 'mcp_tool_request',
          component: 'MCPServer',
          requestId,
          input: { toolName: name, args }
        },
        {
          convertToMcp: true,
          retryCount: 0 // No retries for MCP tool requests
        }
      );
    });
  }


  private async handleRecommend(args: any, requestId: string): Promise<{ content: { type: string; text: string }[] }> {
    try {
      return await ErrorHandler.withErrorHandling(
        async () => {
        this.logger.debug('Handling recommend request', { requestId, intent: args?.intent });

        await this.ensureInitialized();

        // Validate input parameters using schema
        try {
          SchemaValidator.validateToolInput('recommend', args, MCPToolSchemas.RECOMMEND_INPUT);
        } catch (error) {
          throw ErrorHandler.createError(
            ErrorCategory.VALIDATION,
            ErrorSeverity.MEDIUM,
            'Invalid input parameters for recommend tool',
            {
              operation: 'input_validation',
              component: 'MCPServer.handleRecommend',
              requestId,
              input: args,
              suggestedActions: [
                'Ensure intent parameter is provided as a non-empty string',
                'Check intent parameter length (must be 1-1000 characters)',
                'Verify the intent describes what you want to deploy'
              ]
            },
            error as Error
          );
        }

        this.logger.info('Processing resource recommendations', {
          requestId,
          intent: args.intent
        });

        // Use the actual implemented recommend functionality
        const solutions = await this.appAgent.schema.rankResources(args.intent);

        // Use shared formatting function
        const result = formatRecommendationResponse(args.intent, solutions, true);

        const response = this.formatResponse(result);
        
        // Validate output response
        try {
          SchemaValidator.validateToolOutput('recommend', response, MCPToolSchemas.MCP_RESPONSE_OUTPUT);
        } catch (error) {
          throw ErrorHandler.createError(
            ErrorCategory.INTERNAL,
            ErrorSeverity.HIGH,
            'Invalid response format from recommend tool',
            {
              operation: 'output_validation',
              component: 'MCPServer.handleRecommend',
              requestId,
              suggestedActions: [
                'Contact support - this indicates an internal error',
                'Try the request again',
                'Check server logs for more details'
              ]
            },
            error as Error
          );
        }

        this.logger.info('Successfully processed recommend request', {
          requestId,
          solutionCount: solutions?.length || 0
        });
        
        return response;
      },
      {
        operation: 'recommend_tool',
        component: 'MCPServer',
        requestId,
        input: args
      },
      {
        convertToMcp: true,
        retryCount: 1 // Allow one retry for AI service calls
      }
    );
    } catch (error: any) {
      // Convert McpError to proper error response
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: {
              code: error.code || -32603,
              message: error.message || 'Internal error'
            }
          }, null, 2)
        }]
      };
    }
  }

  // REMOVED: handleEnhanceSolution method - moved to legacy reference
  // See src/legacy/tools/enhance-solution.ts for reference implementation

  private generateRequestId(): string {
    return `mcp_${Date.now()}_${++this.requestIdCounter}`;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.logger.info('Initializing MCP Server components');
      
      try {
        await this.appAgent.initialize();
        await this.appAgent.discovery.connect();
        this.initialized = true;
        
        this.logger.info('MCP Server components initialized successfully');
      } catch (error) {
        this.logger.error('Failed to initialize MCP Server components', error as Error);
        throw ErrorHandler.createError(
          ErrorCategory.INTERNAL,
          ErrorSeverity.CRITICAL,
          'Failed to initialize MCP Server',
          {
            operation: 'server_initialization',
            component: 'MCPServer',
            suggestedActions: [
              'Check Kubernetes cluster connectivity',
              'Verify KUBECONFIG environment variable',
              'Ensure all required environment variables are set'
            ]
          },
          error as Error
        );
      }
    }
  }

  private formatResponse(data: any): { content: { type: string; text: string }[] } {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  async stop(): Promise<void> {
    await this.server.close();
  }

  getToolCount(): number {
    // Return the number of registered tools (recommend + can_help)
    return 2;
  }

  isReady(): boolean {
    return this.initialized;
  }
} 