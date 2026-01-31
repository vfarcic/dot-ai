/**
 * Model Context Protocol (MCP) Interface for DevOps AI Toolkit
 *
 * Provides MCP server capabilities that expose DevOps AI Toolkit functionality
 * to AI assistants through standardized protocol
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
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
  type OrganizationalDataInput,
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
  QUERY_TOOL_NAME,
  QUERY_TOOL_DESCRIPTION,
  QUERY_TOOL_INPUT_SCHEMA,
  handleQueryTool,
} from '../tools/query';

import {
  handlePromptsListRequest,
  handlePromptsGetRequest,
  type PromptsListArgs,
} from '../tools/prompts';
import { RestToolRegistry } from './rest-registry';
import { RestApiRouter } from './rest-api';
import { checkBearerAuth } from './auth';
import { sendErrorResponse } from './error-response';
import { createHttpServerSpan, withToolTracing } from '../core/tracing';
import { context, trace } from '@opentelemetry/api';
import { getTelemetry, McpClientInfo } from '../core/telemetry';
import { PluginManager } from '../core/plugin-manager';
import { isPluginInitialized } from '../core/plugin-registry';

/**
 * Tool handler function type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Flexible handler type for various tool signatures
type ToolHandler = (args: any, ...rest: any[]) => Promise<unknown>;

/**
 * Tool arguments passed to handlers
 */
type ToolArgs = Record<string, unknown>;

/**
 * Sampling message structure
 */
interface SamplingMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string } | string;
}

/**
 * Sampling options
 */
interface SamplingOptions {
  maxTokens?: number;
  [key: string]: unknown;
}

/**
 * Sampling result structure
 */
interface SamplingResult {
  content: { type: 'text'; text: string } | string;
}

/**
 * Sampling handler function type
 */
type SamplingHandler = (
  messages: SamplingMessage[],
  systemPrompt?: string,
  options?: SamplingOptions
) => Promise<SamplingResult>;

export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
  port?: number;
  host?: string;
  sessionMode?: 'stateful' | 'stateless';
  /** Optional PluginManager for plugin-based tools (PRD #343) */
  pluginManager?: PluginManager;
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
  private mcpClientInfo: McpClientInfo | undefined;
  private pluginManager?: PluginManager;

  constructor(dotAI: DotAI, config: MCPServerConfig) {
    this.dotAI = dotAI;
    this.config = config;
    this.logger = new ConsoleLogger('MCPServer');
    this.pluginManager = config.pluginManager;
    // PRD #359: Plugin manager connected to unified registry in server.ts

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

    // Set up telemetry tracking for client connection
    // oninitialized fires when the MCP client has completed initialization handshake
    this.server.server.oninitialized = () => {
      const clientVersion = this.server.server.getClientVersion();
      if (clientVersion) {
        this.mcpClientInfo = {
          name: clientVersion.name,
          version: clientVersion.version,
        };
        getTelemetry().trackClientConnected(this.mcpClientInfo);
        this.logger.info('MCP client connected', {
          client: clientVersion.name,
          version: clientVersion.version,
        });
      }
    };

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
      this.logger,
      this.pluginManager
    );

    // Register all tools and prompts directly with McpServer
    this.registerTools();
    this.registerPrompts();
  }

  /**
   * Get the current MCP client info (available after client connects)
   */
  getMcpClientInfo(): McpClientInfo | undefined {
    return this.mcpClientInfo;
  }

  /**
   * Helper method to register a tool with both MCP server and REST registry
   */
  private registerTool(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: ToolHandler,
    category?: string,
    tags?: string[]
  ): void {
    // MCP handler: uses actual client info from MCP handshake (e.g., "claude-code", "cursor")
    const mcpTracedHandler = async (args: ToolArgs) => {
      return await withToolTracing(name, args, handler, { mcpClient: this.mcpClientInfo });
    };

    // REST handler: uses "http" as client identifier for REST API calls
    const restTracedHandler = async (args: ToolArgs) => {
      return await withToolTracing(name, args, handler, { mcpClient: { name: 'http', version: 'rest-api' } });
    };

    // Register MCP handler with MCP server
    /* eslint-disable @typescript-eslint/no-explicit-any -- MCP SDK type compatibility */
    this.server.registerTool(name, {
      description,
      inputSchema: inputSchema as any
    }, mcpTracedHandler as any);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Register REST handler with REST registry
    this.restRegistry.registerTool({
      name,
      description,
      inputSchema: inputSchema as Record<string, z.ZodSchema>,
      handler: restTracedHandler as (...args: unknown[]) => Promise<unknown>,
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
    // PRD #343: pluginManager required for kubectl operations in deploy stage
    this.registerTool(
      RECOMMEND_TOOL_NAME,
      RECOMMEND_TOOL_DESCRIPTION,
      RECOMMEND_TOOL_INPUT_SCHEMA,
      async (args: ToolArgs) => {
        const requestId = this.generateRequestId();
        this.logger.info(`Processing ${RECOMMEND_TOOL_NAME} tool request`, {
          requestId,
        });
        if (!this.pluginManager) {
          throw new Error('Plugin system not available. Recommend tool requires agentic-tools plugin.');
        }
        return await handleRecommendTool(
          args,
          this.dotAI,
          this.logger,
          requestId,
          this.pluginManager
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
      async (args: ToolArgs) => {
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
    // PRD #343: pluginManager needed for capability scanning kubectl operations
    this.registerTool(
      ORGANIZATIONAL_DATA_TOOL_NAME,
      ORGANIZATIONAL_DATA_TOOL_DESCRIPTION,
      ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA,
      async (args: ToolArgs) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${ORGANIZATIONAL_DATA_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleOrganizationalDataTool(
          args as unknown as OrganizationalDataInput,
          this.dotAI,
          this.logger,
          requestId
        );
      },
      'Management',
      ['patterns', 'policies', 'capabilities', 'data']
    );

    // Register remediate tool
    // PRD #343: pluginManager is required - all kubectl operations go through plugin
    this.registerTool(
      REMEDIATE_TOOL_NAME,
      REMEDIATE_TOOL_DESCRIPTION,
      REMEDIATE_TOOL_INPUT_SCHEMA,
      async (args: ToolArgs) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${REMEDIATE_TOOL_NAME} tool request`,
          { requestId }
        );
        if (!isPluginInitialized()) {
          throw new Error('Plugin system not available. Remediate tool requires agentic-tools plugin for kubectl operations.');
        }
        return await handleRemediateTool(args);
      },
      'Troubleshooting',
      ['remediation', 'troubleshooting', 'kubernetes', 'analysis']
    );

    // Register operate tool
    // PRD #343: pluginManager is required - all kubectl operations go through plugin
    this.registerTool(
      OPERATE_TOOL_NAME,
      OPERATE_TOOL_DESCRIPTION,
      OPERATE_TOOL_INPUT_SCHEMA,
      async (args: ToolArgs) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${OPERATE_TOOL_NAME} tool request`,
          { requestId }
        );
        if (!this.pluginManager) {
          throw new Error('Plugin system not available. Operate tool requires agentic-tools plugin for kubectl operations.');
        }
        return await handleOperateTool(args, this.pluginManager);
      },
      'Operations',
      ['operate', 'operations', 'kubernetes', 'day2', 'update', 'scale']
    );

    // Register projectSetup tool
    this.registerTool(
      PROJECT_SETUP_TOOL_NAME,
      PROJECT_SETUP_TOOL_DESCRIPTION,
      PROJECT_SETUP_TOOL_INPUT_SCHEMA,
      async (args: ToolArgs) => {
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

    // Register query tool (PRD #291: Cluster Query Tool)
    this.registerTool(
      QUERY_TOOL_NAME,
      QUERY_TOOL_DESCRIPTION,
      QUERY_TOOL_INPUT_SCHEMA,
      async (args: ToolArgs) => {
        const requestId = this.generateRequestId();
        this.logger.info(
          `Processing ${QUERY_TOOL_NAME} tool request`,
          { requestId }
        );
        return await handleQueryTool(args, this.pluginManager);
      },
      'Intelligence',
      ['query', 'search', 'discover', 'capabilities', 'cluster']
    );

    // NOTE: Plugin tools (kubectl_*, helm_*, shell_exec) are NOT registered as MCP tools.
    // They are internal implementation details used by built-in tools like remediate/query.
    // Plugin tools remain available internally via pluginManager.invokeTool().
    // Only the 7 built-in MCP tools are exposed to clients.

    const builtInTools = [
      RECOMMEND_TOOL_NAME,
      VERSION_TOOL_NAME,
      ORGANIZATIONAL_DATA_TOOL_NAME,
      REMEDIATE_TOOL_NAME,
      OPERATE_TOOL_NAME,
      PROJECT_SETUP_TOOL_NAME,
      QUERY_TOOL_NAME
    ];

    // Log summary of tool registration
    const pluginToolCount = this.pluginManager?.getDiscoveredTools().length || 0;
    this.logger.info('Registered tools with McpServer', {
      builtInTools,
      totalRegistered: builtInTools.length,
      pluginToolsAvailableInternally: pluginToolCount,
    });
  }

  /**
   * Register prompts capability with McpServer
   */
  private registerPrompts(): void {
    // Register prompts/list handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK type compatibility
    (this.server.server.setRequestHandler as any)(
      ListPromptsRequestSchema,
      async (request: { params?: PromptsListArgs }) => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK type compatibility
    (this.server.server.setRequestHandler as any)(
      GetPromptRequestSchema,
      async (request: { params?: { name: string; arguments?: Record<string, string> } }) => {
        const requestId = this.generateRequestId();
        this.logger.info('Processing prompts/get request', {
          requestId,
          promptName: request.params?.name,
        });
        return await handlePromptsGetRequest(
          request.params || { name: '' },
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
    const aiProvider = this.dotAI.ai as { setSamplingHandler?: (handler: SamplingHandler) => void; getProviderType?: () => string };

    if (typeof aiProvider.setSamplingHandler === 'function') {
      this.logger.info('Configuring Host AI Provider with Sampling capability');
      aiProvider.setSamplingHandler(this.handleSamplingRequest.bind(this));
    } else {
      this.logger.info('Using configured AI Provider', {
        type: aiProvider.getProviderType ? aiProvider.getProviderType() : 'unknown'
      });
    }
  }

  private async handleSamplingRequest(
    messages: SamplingMessage[],
    systemPrompt?: string,
    options?: SamplingOptions
  ): Promise<SamplingResult> {
    try {
      if (!this.server.server.createMessage) {
         throw new Error('Server does not support createMessage (sampling)');
      }
      return await this.server.server.createMessage({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK type compatibility
        messages: messages as any,
        systemPrompt,
        includeContext: 'none',
        maxTokens: options?.maxTokens || 4096,
        ...options
      }, {
        timeout: 3600000 // 1 hour timeout for sampling requests
      }) as SamplingResult;
    } catch (error) {
      this.logger.error('Sampling request failed', error as Error);
      throw error;
    }
  }

  private generateRequestId(): string {
    return `mcp_${Date.now()}_${++this.requestIdCounter}`;
  }

  async start(): Promise<void> {
    this.logger.info('Starting MCP Server', {
      sessionMode: this.config.sessionMode || 'stateful'
    });

    await this.startHttpTransport();
    this.initialized = true;
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
        let body: unknown = undefined;
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

  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
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
