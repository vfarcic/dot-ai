/**
 * Model Context Protocol (MCP) Interface for DevOps AI Toolkit
 *
 * Provides MCP server capabilities that expose DevOps AI Toolkit functionality
 * to AI assistants through standardized protocol
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
  OPERATE_TOOL_NAME,
  OPERATE_TOOL_DESCRIPTION,
  OPERATE_TOOL_INPUT_SCHEMA,
  handleOperateTool,
} from '../tools/operate';
import {
  PROJECT_SETUP_TOOL_NAME,
  PROJECT_SETUP_TOOL_DESCRIPTION,
  PROJECT_SETUP_TOOL_INPUT_SCHEMA,
  handleProjectSetupTool,
} from '../tools/project-setup';

import {
  handlePromptsListRequest,
  handlePromptsGetRequest,
} from '../tools/prompts';
import { RestToolRegistry } from './rest-registry';
import { RestApiRouter } from './rest-api';
import { checkBearerAuth } from './auth';
import { sendErrorResponse } from './error-response';
import { createHttpServerSpan, withToolTracing } from '../core/tracing';
import { context, trace } from '@opentelemetry/api';

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

    // Configure HostProvider if active
    this.configureHostProvider();

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
    // Wrap handler with tracing for both STDIO (MCP) and HTTP (REST) transports
    const tracedHandler = async (args: any) => {
      return await withToolTracing(name, args, handler);
    };

    // Register traced handler with MCP server
    this.server.registerTool(name, {
      description,
      inputSchema
    }, tracedHandler);

    // Register traced handler with REST registry
    this.restRegistry.registerTool({
      name,
      description,
      inputSchema,
      handler: tracedHandler,
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

    // Register operate tool
    this.registerTool(
      OPERATE_TOOL_NAME,
      OPERATE_TOOL_DESCRIPTION,
      OPERATE_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${OPERATE_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleOperateTool(args);
      },
      'Operations',
      ['operate', 'operations', 'kubernetes', 'day2', 'update', 'scale']
    );

    // Register projectSetup tool
    this.registerTool(
      PROJECT_SETUP_TOOL_NAME,
      PROJECT_SETUP_TOOL_DESCRIPTION,
      PROJECT_SETUP_TOOL_INPUT_SCHEMA,
      async (args: any) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${PROJECT_SETUP_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleProjectSetupTool(args, this.logger);
      },
      'Project Setup',
      ['governance', 'infrastructure', 'configuration', 'files']
    );

    this.logger.info('Registered all tools with McpServer', {
      tools: [
        RECOMMEND_TOOL_NAME,
        VERSION_TOOL_NAME,
        ORGANIZATIONAL_DATA_TOOL_NAME,
        REMEDIATE_TOOL_NAME,
        OPERATE_TOOL_NAME,
        PROJECT_SETUP_TOOL_NAME
      ],
      totalTools: 6,
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

  private configureHostProvider(): void {
    // Configure HostProvider if active
    // We use capability detection (duck typing) to avoid strict class dependency
    // and handle potential class loading issues
    const aiProvider = this.dotAI.ai as any;

    if (typeof aiProvider.setSamplingHandler === 'function') {
      this.logger.info('Configuring Host AI Provider with Sampling capability');
      aiProvider.setSamplingHandler(this.handleSamplingRequest.bind(this));
    } else {
      this.logger.info('Using configured AI Provider', {
        type: this.dotAI.ai.getProviderType ? this.dotAI.ai.getProviderType() : 'unknown'
      });
    }
  }

  private async handleSamplingRequest(
    messages: any[],
    systemPrompt?: string,
    options?: any
  ): Promise<any> {
    try {
      if (!this.server.server.createMessage) {
         throw new Error('Server does not support createMessage (sampling)');
      }
      
      return await this.server.server.createMessage({
        messages,
        systemPrompt,
        includeContext: 'none',
        maxTokens: options?.maxTokens || 4096,
        ...options
      }, {
        timeout: 3600000 // 1 hour timeout for sampling requests
      });
    } catch (error) {
      this.logger.error('Sampling request failed', error as Error);
      throw error;
    }
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
      // Create HTTP SERVER span for distributed tracing
      const { span, endSpan } = createHttpServerSpan(req);

      // Execute entire request within the span's context for proper propagation
      await context.with(trace.setSpan(context.active(), span), async () => {
        try {
          this.logger.debug('HTTP request received', {
            method: req.method,
            url: req.url,
            headers: req.headers
          });

        // Handle CORS for browser-based clients
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id, Authorization');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          endSpan(204);
          return;
        }

        // Health check endpoint (unauthenticated, for Kubernetes probes)
        if (req.url === '/healthz' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
          endSpan(200);
          return;
        }

        // Check Bearer token authentication (only when DOT_AI_AUTH_TOKEN is set)
        // Skip authentication for OpenAPI specification endpoint (public documentation)
        const isOpenApiEndpoint = req.url?.startsWith('/api/v1/openapi');
        if (!isOpenApiEndpoint) {
          const authResult = checkBearerAuth(req);
          if (!authResult.authorized) {
            this.logger.warn('Authentication failed', { message: authResult.message });
            sendErrorResponse(res, 401, 'UNAUTHORIZED', authResult.message || 'Authentication required');
            endSpan(401);
            return;
          }
        }

        // Parse request body for POST requests
        let body: any = undefined;
        if (req.method === 'POST') {
          body = await this.parseRequestBody(req);
        }

        // Check if this is a REST API request
        if (this.restApiRouter.isApiRequest(req.url || '')) {
          this.logger.debug('Routing to REST API handler', { url: req.url });
          // Mark span as REST API request
          span.setAttribute('request.type', 'rest-api');
          try {
            await this.restApiRouter.handleRequest(req, res, body);
            endSpan(res.statusCode || 200);
            return;
          } catch (error) {
            this.logger.error('REST API request failed', error as Error);
            if (!res.headersSent) {
              sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'REST API internal server error');
            }
            endSpan(500);
            return;
          }
        }

        // Handle MCP protocol requests using the transport
        // Mark span as MCP protocol request
        span.setAttribute('request.type', 'mcp-protocol');
        span.updateName('MCP ' + (req.url || '/'));
        try {
          await this.httpTransport!.handleRequest(req, res, body);
          endSpan(res.statusCode || 200);
        } catch (error) {
          this.logger.error('Error handling MCP HTTP request', error as Error);
          if (!res.headersSent) {
            sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'MCP internal server error');
          }
          endSpan(500);
        }
        } catch (error) {
          // Handle any unexpected errors in span creation or request handling
          this.logger.error('Unexpected error in HTTP request handler', error as Error);
          span.recordException(error as Error);
          endSpan(500);

          if (!res.headersSent) {
            sendErrorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
          }
        }
      }); // Close context.with()
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
