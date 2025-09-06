/**
 * Model Context Protocol (MCP) Interface for DevOps AI Toolkit
 *
 * Provides MCP server capabilities that expose DevOps AI Toolkit functionality
 * to AI assistants like Claude through standardized protocol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DotAI } from '../core/index';
import { ConsoleLogger, Logger } from '../core/error-handling';
import {
  RECOMMEND_TOOL_NAME,
  RECOMMEND_TOOL_DESCRIPTION,
  RECOMMEND_TOOL_INPUT_SCHEMA,
  handleRecommendTool,
} from '../tools/recommend';
import {
  CHOOSESOLUTION_TOOL_NAME,
  CHOOSESOLUTION_TOOL_DESCRIPTION,
  CHOOSESOLUTION_TOOL_INPUT_SCHEMA,
  handleChooseSolutionTool,
} from '../tools/choose-solution';
import {
  ANSWERQUESTION_TOOL_NAME,
  ANSWERQUESTION_TOOL_DESCRIPTION,
  ANSWERQUESTION_TOOL_INPUT_SCHEMA,
  handleAnswerQuestionTool,
} from '../tools/answer-question';
import {
  GENERATEMANIFESTS_TOOL_NAME,
  GENERATEMANIFESTS_TOOL_DESCRIPTION,
  GENERATEMANIFESTS_TOOL_INPUT_SCHEMA,
  handleGenerateManifestsTool,
} from '../tools/generate-manifests';
import {
  DEPLOYMANIFESTS_TOOL_NAME,
  DEPLOYMANIFESTS_TOOL_DESCRIPTION,
  DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA,
  handleDeployManifestsTool,
} from '../tools/deploy-manifests';
import {
  VERSION_TOOL_NAME,
  VERSION_TOOL_DESCRIPTION,
  VERSION_TOOL_INPUT_SCHEMA,
  handleVersionTool,
} from '../tools/version';
import {
  TESTDOCS_TOOL_NAME,
  TESTDOCS_TOOL_DESCRIPTION,
  TESTDOCS_TOOL_INPUT_SCHEMA,
  handleTestDocsTool,
} from '../tools/test-docs';
import {
  ORGANIZATIONAL_DATA_TOOL_NAME,
  ORGANIZATIONAL_DATA_TOOL_DESCRIPTION,
  ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA,
  handleOrganizationalDataTool,
} from '../tools/organizational-data';

import {
  handlePromptsListRequest,
  handlePromptsGetRequest,
} from '../tools/prompts';

export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
  transport?: 'stdio' | 'http';
  port?: number;
  host?: string;
  sessionMode?: 'stateful' | 'stateless';
}

export class MCPServer {
  private server: McpServer;
  private dotAI: DotAI;
  private initialized: boolean = false;
  private logger: Logger;
  private requestIdCounter: number = 0;
  private config: MCPServerConfig;
  private httpServer?: ReturnType<typeof createServer>;
  private httpTransport?: StreamableHTTPServerTransport;

  constructor(dotAI: DotAI, config: MCPServerConfig) {
    this.dotAI = dotAI;
    this.config = config;
    this.logger = new ConsoleLogger('MCPServer');

    // Create McpServer instance
    this.server = new McpServer(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    this.logger.info('Initializing MCP Server', {
      name: config.name,
      version: config.version,
      author: config.author,
    });

    // Register all tools and prompts directly with McpServer
    this.registerTools();
    this.registerPrompts();
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
        this.logger.info(`Processing ${RECOMMEND_TOOL_NAME} tool request`, {
          requestId,
        });
        return await handleRecommendTool(
          args,
          this.dotAI,
          this.logger,
          requestId
        );
      }
    );

    // Register chooseSolution tool
    this.server.tool(
      CHOOSESOLUTION_TOOL_NAME,
      CHOOSESOLUTION_TOOL_DESCRIPTION,
      CHOOSESOLUTION_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${CHOOSESOLUTION_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleChooseSolutionTool(
          args,
          this.dotAI,
          this.logger,
          requestId
        );
      }
    );

    // Register answerQuestion tool
    this.server.tool(
      ANSWERQUESTION_TOOL_NAME,
      ANSWERQUESTION_TOOL_DESCRIPTION,
      ANSWERQUESTION_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${ANSWERQUESTION_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleAnswerQuestionTool(
          args,
          this.dotAI,
          this.logger,
          requestId
        );
      }
    );

    // Register generateManifests tool
    this.server.tool(
      GENERATEMANIFESTS_TOOL_NAME,
      GENERATEMANIFESTS_TOOL_DESCRIPTION,
      GENERATEMANIFESTS_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${GENERATEMANIFESTS_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleGenerateManifestsTool(
          args,
          this.dotAI,
          this.logger,
          requestId
        );
      }
    );

    // Register deployManifests tool
    this.server.tool(
      DEPLOYMANIFESTS_TOOL_NAME,
      DEPLOYMANIFESTS_TOOL_DESCRIPTION,
      DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${DEPLOYMANIFESTS_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleDeployManifestsTool(
          args,
          this.dotAI,
          this.logger,
          requestId
        );
      }
    );

    // Register version tool
    this.server.tool(
      VERSION_TOOL_NAME,
      VERSION_TOOL_DESCRIPTION,
      VERSION_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${VERSION_TOOL_NAME} tool request`, {
          requestId,
        });
        return await handleVersionTool(args, this.logger, requestId);
      }
    );

    // Register testDocs tool
    this.server.tool(
      TESTDOCS_TOOL_NAME,
      TESTDOCS_TOOL_DESCRIPTION,
      TESTDOCS_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${TESTDOCS_TOOL_NAME} tool request`, {
          requestId,
        });
        return await handleTestDocsTool(args, null, this.logger, requestId);
      }
    );

    // Register organizational-data tool
    this.server.tool(
      ORGANIZATIONAL_DATA_TOOL_NAME,
      ORGANIZATIONAL_DATA_TOOL_DESCRIPTION,
      ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${ORGANIZATIONAL_DATA_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleOrganizationalDataTool(
          args,
          this.dotAI,
          this.logger,
          requestId
        );
      }
    );

    this.logger.info('Registered all tools with McpServer', {
      tools: [
        RECOMMEND_TOOL_NAME,
        CHOOSESOLUTION_TOOL_NAME,
        ANSWERQUESTION_TOOL_NAME,
        GENERATEMANIFESTS_TOOL_NAME,
        DEPLOYMANIFESTS_TOOL_NAME,
        VERSION_TOOL_NAME,
        TESTDOCS_TOOL_NAME,
        ORGANIZATIONAL_DATA_TOOL_NAME,
      ],
      totalTools: 8,
    });
  }

  /**
   * Register prompts capability with McpServer
   */
  private registerPrompts(): void {
    // Register prompts/list handler
    this.server.server.setRequestHandler(
      ListPromptsRequestSchema,
      async request => {
        const requestId = this.generateRequestId();
        this.logger.info('Processing prompts/list request', { requestId });
        return await handlePromptsListRequest(
          request.params || {},
          this.logger,
          requestId
        );
      }
    );

    // Register prompts/get handler
    this.server.server.setRequestHandler(
      GetPromptRequestSchema,
      async request => {
        const requestId = this.generateRequestId();
        this.logger.info('Processing prompts/get request', {
          requestId,
          promptName: request.params?.name,
        });
        return await handlePromptsGetRequest(
          request.params || {},
          this.logger,
          requestId
        );
      }
    );

    this.logger.info('Registered prompts capability with McpServer', {
      endpoints: ['prompts/list', 'prompts/get'],
    });
  }

  private generateRequestId(): string {
    return `mcp_${Date.now()}_${++this.requestIdCounter}`;
  }

  async start(): Promise<void> {
    // Get transport type from environment or config
    const transportType = process.env.TRANSPORT_TYPE || this.config.transport || 'stdio';
    
    this.logger.info('Starting MCP Server', { 
      transportType,
      sessionMode: this.config.sessionMode || 'stateful'
    });

    if (transportType === 'http') {
      await this.startHttpTransport();
    } else {
      await this.startStdioTransport();
    }
    
    this.initialized = true;
  }

  private async startStdioTransport(): Promise<void> {
    this.logger.info('Using STDIO transport');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  private async startHttpTransport(): Promise<void> {
    const port = parseInt(process.env.PORT || '') || this.config.port || 3456;
    const host = process.env.HOST || this.config.host || '0.0.0.0';
    const sessionMode = process.env.SESSION_MODE || this.config.sessionMode || 'stateful';
    
    this.logger.info('Using HTTP/SSE transport', { port, host, sessionMode });

    // Create HTTP transport with session management
    this.httpTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: sessionMode === 'stateful' ? () => randomUUID() : undefined,
      enableJsonResponse: false, // Use SSE for streaming
      onsessioninitialized: (sessionId: string) => {
        this.logger.info('Session initialized', { sessionId });
      }
    });

    // Connect MCP server to transport
    await this.server.connect(this.httpTransport);

    // Create HTTP server
    this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      this.logger.debug('HTTP request received', { 
        method: req.method, 
        url: req.url,
        headers: req.headers 
      });

      // Handle CORS for browser-based clients
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Parse request body for POST requests
      let body: any = undefined;
      if (req.method === 'POST') {
        body = await this.parseRequestBody(req);
      }

      // Handle the request using the transport
      try {
        await this.httpTransport!.handleRequest(req, res, body);
      } catch (error) {
        this.logger.error('Error handling HTTP request', error as Error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(port, host, () => {
        this.logger.info(`HTTP server listening on ${host}:${port}`);
        resolve();
      }).on('error', reject);
    });
  }

  private async parseRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : undefined);
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    await this.server.close();
    
    // Stop HTTP server if running
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => {
          this.logger.info('HTTP server stopped');
          resolve();
        });
      });
    }
    
    this.initialized = false;
  }

  isReady(): boolean {
    return this.initialized;
  }
}
