/**
 * Model Context Protocol (MCP) Interface for DevOps AI Toolkit
 * 
 * Provides MCP server capabilities that expose DevOps AI Toolkit functionality
 * to AI assistants like Claude through standardized protocol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DotAI } from '../core/index';
import { 
  ConsoleLogger,
  Logger 
} from '../core/error-handling';
import { 
  RECOMMEND_TOOL_NAME, 
  RECOMMEND_TOOL_DESCRIPTION, 
  RECOMMEND_TOOL_INPUT_SCHEMA,
  handleRecommendTool 
} from '../tools/recommend';
import { 
  CHOOSESOLUTION_TOOL_NAME, 
  CHOOSESOLUTION_TOOL_DESCRIPTION, 
  CHOOSESOLUTION_TOOL_INPUT_SCHEMA,
  handleChooseSolutionTool 
} from '../tools/choose-solution';
import { 
  ANSWERQUESTION_TOOL_NAME, 
  ANSWERQUESTION_TOOL_DESCRIPTION, 
  ANSWERQUESTION_TOOL_INPUT_SCHEMA,
  handleAnswerQuestionTool 
} from '../tools/answer-question';
import { 
  GENERATEMANIFESTS_TOOL_NAME, 
  GENERATEMANIFESTS_TOOL_DESCRIPTION, 
  GENERATEMANIFESTS_TOOL_INPUT_SCHEMA,
  handleGenerateManifestsTool 
} from '../tools/generate-manifests';
import { 
  DEPLOYMANIFESTS_TOOL_NAME, 
  DEPLOYMANIFESTS_TOOL_DESCRIPTION, 
  DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA,
  handleDeployManifestsTool 
} from '../tools/deploy-manifests';

export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
}

export class MCPServer {
  private server: McpServer;
  private dotAI: DotAI;
  private initialized: boolean = false;
  private logger: Logger;
  private requestIdCounter: number = 0;

  constructor(dotAI: DotAI, config: MCPServerConfig) {
    this.dotAI = dotAI;
    this.logger = new ConsoleLogger('MCPServer');
    
    // Create McpServer instance
    this.server = new McpServer(
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
      author: config.author
    });

    // Register all tools directly with McpServer
    this.registerTools();
  }

  /**
   * Register all tools with McpServer
   */
  private registerTools(): void {
    // Register recommend tool
    this.server.tool(
      RECOMMEND_TOOL_NAME,
      RECOMMEND_TOOL_DESCRIPTION,
      RECOMMEND_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${RECOMMEND_TOOL_NAME} tool request`, { requestId });
        return await handleRecommendTool(args, this.dotAI, this.logger, requestId);
      }
    );

    // Register chooseSolution tool
    this.server.tool(
      CHOOSESOLUTION_TOOL_NAME,
      CHOOSESOLUTION_TOOL_DESCRIPTION,
      CHOOSESOLUTION_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${CHOOSESOLUTION_TOOL_NAME} tool request`, { requestId });
        return await handleChooseSolutionTool(args, this.dotAI, this.logger, requestId);
      }
    );

    // Register answerQuestion tool
    this.server.tool(
      ANSWERQUESTION_TOOL_NAME,
      ANSWERQUESTION_TOOL_DESCRIPTION,
      ANSWERQUESTION_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${ANSWERQUESTION_TOOL_NAME} tool request`, { requestId });
        return await handleAnswerQuestionTool(args, this.dotAI, this.logger, requestId);
      }
    );

    // Register generateManifests tool
    this.server.tool(
      GENERATEMANIFESTS_TOOL_NAME,
      GENERATEMANIFESTS_TOOL_DESCRIPTION,
      GENERATEMANIFESTS_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${GENERATEMANIFESTS_TOOL_NAME} tool request`, { requestId });
        return await handleGenerateManifestsTool(args, this.dotAI, this.logger, requestId);
      }
    );

    // Register deployManifests tool
    this.server.tool(
      DEPLOYMANIFESTS_TOOL_NAME,
      DEPLOYMANIFESTS_TOOL_DESCRIPTION,
      DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${DEPLOYMANIFESTS_TOOL_NAME} tool request`, { requestId });
        return await handleDeployManifestsTool(args, this.dotAI, this.logger, requestId);
      }
    );
    
    this.logger.info('Registered all tools with McpServer', { 
      tools: [
        RECOMMEND_TOOL_NAME,
        CHOOSESOLUTION_TOOL_NAME,
        ANSWERQUESTION_TOOL_NAME,
        GENERATEMANIFESTS_TOOL_NAME,
        DEPLOYMANIFESTS_TOOL_NAME
      ],
      totalTools: 5
    });
  }

  private generateRequestId(): string {
    return `mcp_${Date.now()}_${++this.requestIdCounter}`;
  }


  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.initialized = true;
  }

  async stop(): Promise<void> {
    await this.server.close();
    this.initialized = false;
  }


  isReady(): boolean {
    return this.initialized;
  }
} 