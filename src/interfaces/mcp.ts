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
  REMEDIATE_TOOL_NAME,
  REMEDIATE_TOOL_DESCRIPTION,
  REMEDIATE_TOOL_INPUT_SCHEMA,
  handleRemediateTool,
} from '../tools/remediate';

import {
  handlePromptsListRequest,
  handlePromptsGetRequest,
} from '../tools/prompts';
import { RestToolRegistry } from './rest-registry';
import { RestApiRouter } from './rest-api';

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
  private restRegistry: RestToolRegistry;
  private restApiRouter: RestApiRouter;

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

    // Initialize REST API components
    this.restRegistry = new RestToolRegistry(this.logger);
    this.restApiRouter = new RestApiRouter(
      this.restRegistry,
      this.dotAI,
      this.logger
    );

    // Register all tools and prompts directly with McpServer
    this.registerTools();
    this.registerPrompts();
  }

  /**
   * Helper method to register a tool with both MCP server and REST registry
   */
  private registerTool(
    name: string,
    description: string,
    inputSchema: Record<string, any>,
    handler: (...args: any[]) => Promise<any>,
    category?: string,
    tags?: string[]
  ): void {
    // Register with MCP server
    this.server.tool(name, description, inputSchema, handler);
    
    // Register with REST registry
    this.restRegistry.registerTool({
      name,
      description,
      inputSchema,
      handler,
      category,
      tags
    });
  }

  /**
   * Register all tools with McpServer and REST registry
   */
  private registerTools(): void {
    // Register unified recommend tool with stage-based routing
    // Handles all deployment workflow stages: recommend, chooseSolution, answerQuestion, generateManifests, deployManifests
    this.registerTool(
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
      },
      'Deployment',
      ['recommendation', 'kubernetes', 'deployment', 'workflow']
    );

    // Register version tool
    this.registerTool(
      VERSION_TOOL_NAME,
      VERSION_TOOL_DESCRIPTION,
      VERSION_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${VERSION_TOOL_NAME} tool request`, {
          requestId,
        });
        return await handleVersionTool(args, this.logger, requestId);
      },
      'System',
      ['version', 'diagnostics', 'status']
    );

    // Register testDocs tool
    this.registerTool(
      TESTDOCS_TOOL_NAME,
      TESTDOCS_TOOL_DESCRIPTION,
      TESTDOCS_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${TESTDOCS_TOOL_NAME} tool request`, {
          requestId,
        });
        return await handleTestDocsTool(args, null, this.logger, requestId);
      },
      'Documentation',
      ['testing', 'validation', 'docs']
    );

    // Register organizational-data tool
    this.registerTool(
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
      },
      'Management',
      ['patterns', 'policies', 'capabilities', 'data']
    );

    // Register remediate tool
    this.registerTool(
      REMEDIATE_TOOL_NAME,
      REMEDIATE_TOOL_DESCRIPTION,
      REMEDIATE_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${REMEDIATE_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleRemediateTool(args);
      },
      'Troubleshooting',
      ['remediation', 'troubleshooting', 'kubernetes', 'analysis']
    );

    this.logger.info('Registered all tools with McpServer', {
      tools: [
        RECOMMEND_TOOL_NAME,
        VERSION_TOOL_NAME,
        TESTDOCS_TOOL_NAME,
        ORGANIZATIONAL_DATA_TOOL_NAME,
        REMEDIATE_TOOL_NAME,
      ],
      totalTools: 5,
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
    const port = process.env.PORT ? parseInt(process.env.PORT) : (this.config.port !== undefined ? this.config.port : 3456);
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

      // Check if this is a REST API request
      if (this.restApiRouter.isApiRequest(req.url || '')) {
        this.logger.debug('Routing to REST API handler', { url: req.url });
        try {
          await this.restApiRouter.handleRequest(req, res, body);
          return;
        } catch (error) {
          this.logger.error('REST API request failed', error as Error);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'REST API internal server error' }));
          }
          return;
        }
      }

      // Handle MCP protocol requests using the transport
      try {
        await this.httpTransport!.handleRequest(req, res, body);
      } catch (error) {
        this.logger.error('Error handling MCP HTTP request', error as Error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'MCP internal server error' }));
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
