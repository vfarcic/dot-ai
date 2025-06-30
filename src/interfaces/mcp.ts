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
import { SchemaValidator, MCPToolSchemas } from '../core/validation';

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
    // Register list tools handler - only expose actually implemented features
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'recommend',
            description: 'Get AI-powered Kubernetes resource recommendations based on deployment intent',
            inputSchema: MCPToolSchemas.RECOMMEND_INPUT
          },
          {
            name: 'enhance_solution',
            description: 'Process open-ended user requirements to enhance and customize deployment solutions',
            inputSchema: MCPToolSchemas.ENHANCE_SOLUTION_INPUT
          }
        ]
      };
    });

    // Register call tool handler with proper error handling
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Validate request structure
        if (!name || typeof name !== 'string') {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Tool name must be a non-empty string'
          );
        }

        // Function dispatch - only implemented tools
        switch (name) {
          case 'recommend':
            return await this.handleRecommend(args);
          case 'enhance_solution':
            return await this.handleEnhanceSolution(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}. Available tools: recommend, enhance_solution`
            );
        }
      } catch (error) {
        // Enhanced error handling with proper context preservation
        if (error instanceof McpError) {
          throw error;
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed for '${name}': ${errorMessage}`
        );
      }
    });
  }


  private async handleRecommend(args: any): Promise<{ content: { type: string; text: string }[] }> {
    await this.ensureInitialized();

    // Validate input parameters using schema
    SchemaValidator.validateToolInput('recommend', args, MCPToolSchemas.RECOMMEND_INPUT);

    // Use the actual implemented recommend functionality
    const solutions = await this.appAgent.schema.rankResources(args.intent);

    const result = {
      intent: args.intent,
      solutions: solutions,
      timestamp: new Date().toISOString()
    };

    const response = this.formatResponse(result);
    
    // Validate output response
    SchemaValidator.validateToolOutput('recommend', response, MCPToolSchemas.MCP_RESPONSE_OUTPUT);
    
    return response;
  }

  private async handleEnhanceSolution(args: any): Promise<{ content: { type: string; text: string }[] }> {
    await this.ensureInitialized();

    // Validate input parameters using schema
    SchemaValidator.validateToolInput('enhance_solution', args, MCPToolSchemas.ENHANCE_SOLUTION_INPUT);

    // Parse the solution data
    let solutionObj;
    try {
      solutionObj = JSON.parse(args.solution_data);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Solution data must be valid JSON'
      );
    }

    // Validate the parsed solution data structure
    try {
      SchemaValidator.validate(solutionObj, MCPToolSchemas.SOLUTION_DATA, 'solution_data');
    } catch (validationError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid solution data structure: ${validationError}`
      );
    }

    // Additional validation for required open response
    if (!solutionObj.questions?.open?.answer) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Solution must include questions.open.answer field with user response'
      );
    }

    // Import and use the SolutionEnhancer
    const { SolutionEnhancer } = await import('../core/schema');
    const apiKey = this.appAgent.getAnthropicApiKey();
    if (!apiKey) {
      throw new McpError(
        ErrorCode.InternalError,
        'ANTHROPIC_API_KEY environment variable must be set for solution enhancement'
      );
    }
    const enhancer = new SolutionEnhancer({ claudeApiKey: apiKey });

    // Create discovery functions for the enhancer
    const discoverResourcesFn = () => this.appAgent.discovery.discoverResources();
    const explainResourceFn = (resource: string) => this.appAgent.discovery.explainResource(resource);

    // Enhance the solution
    const enhancedSolution = await enhancer.enhanceSolution(
      solutionObj,
      solutionObj.questions.open.answer,
      discoverResourcesFn,
      explainResourceFn
    );

    const result = {
      original_solution: solutionObj,
      user_response: solutionObj.questions.open.answer,
      enhanced_solution: enhancedSolution,
      timestamp: new Date().toISOString()
    };

    const response = this.formatResponse(result);
    
    // Validate output response
    SchemaValidator.validateToolOutput('enhance_solution', response, MCPToolSchemas.MCP_RESPONSE_OUTPUT);
    
    return response;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.appAgent.initialize();
      await this.appAgent.discovery.connect();
      this.initialized = true;
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
    // Return the number of registered tools (recommend + enhance_solution)
    return 2;
  }

  isReady(): boolean {
    return this.initialized;
  }
} 