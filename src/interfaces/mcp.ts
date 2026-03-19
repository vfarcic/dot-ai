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
  isInitializeRequest,
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
  MANAGE_KNOWLEDGE_TOOL_NAME,
  MANAGE_KNOWLEDGE_TOOL_DESCRIPTION,
  MANAGE_KNOWLEDGE_TOOL_INPUT_SCHEMA,
  handleManageKnowledgeTool,
  type ManageKnowledgeInput,
} from '../tools/manage-knowledge';
import {
  IMPACT_ANALYSIS_TOOL_NAME,
  IMPACT_ANALYSIS_TOOL_DESCRIPTION,
  IMPACT_ANALYSIS_TOOL_INPUT_SCHEMA,
  handleImpactAnalysisTool,
} from '../tools/impact-analysis';

import {
  handlePromptsListRequest,
  handlePromptsGetRequest,
  type PromptsListArgs,
} from '../tools/prompts';
import { RestToolRegistry } from './rest-registry';
import { RestApiRouter } from './rest-api';
import {
  checkBearerAuth,
  DotAIOAuthProvider,
  type UserIdentity,
} from './oauth';
import { requestContext, getCurrentIdentity } from './request-context';
import { checkToolAccess, filterAuthorizedTools } from '../core/rbac';
import express from 'express';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
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

export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  author?: string;
  port?: number;
  host?: string;
  /** Optional PluginManager for plugin-based tools (PRD #343) */
  pluginManager?: PluginManager;
}

/**
 * Per-session MCP state: each client gets its own McpServer + transport.
 * The SDK's Protocol class only supports one transport at a time,
 * so multi-user requires separate McpServer instances.
 */
interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  clientInfo?: McpClientInfo;
  lastActivity: number;
}

/** Sessions inactive for 1 hour are reaped (matches JWT expiry). */
const SESSION_TTL_MS = 60 * 60 * 1000;
/** How often to check for expired sessions. */
const SESSION_GC_INTERVAL_MS = 5 * 60 * 1000;

export class MCPServer {
  private dotAI: DotAI;
  private initialized: boolean = false;
  private logger: Logger;
  private requestIdCounter: number = 0;
  private config: MCPServerConfig;
  private httpServer?: ReturnType<typeof createServer>;
  /** Per-session state: each MCP client gets its own McpServer + transport */
  private sessions = new Map<string, McpSession>();
  private sessionGcTimer?: ReturnType<typeof setInterval>;
  private restRegistry: RestToolRegistry;
  private restApiRouter: RestApiRouter;
  private pluginManager?: PluginManager;
  private oauthApp?: ReturnType<typeof express>;
  private oauthProvider?: DotAIOAuthProvider;
  private issuerUrl?: URL;

  constructor(dotAI: DotAI, config: MCPServerConfig) {
    this.dotAI = dotAI;
    this.config = config;
    this.logger = new ConsoleLogger('MCPServer');
    this.pluginManager = config.pluginManager;
    // PRD #359: Plugin manager connected to unified registry in server.ts

    this.logger.info('Initializing MCP Server', {
      name: config.name,
      version: config.version,
      author: config.author,
    });

    // Initialize REST API components (shared across all sessions)
    this.restRegistry = new RestToolRegistry(this.logger);
    this.restApiRouter = new RestApiRouter(
      this.restRegistry,
      this.dotAI,
      this.logger,
      this.pluginManager
    );

    // Log AI provider info
    this.configureHostProvider();

    // Register tools with REST registry (one-time, shared)
    this.registerRestTools();
  }

  /**
   * Get the current MCP client info (available after client connects).
   * Returns info from the most recently connected session.
   */
  getMcpClientInfo(): McpClientInfo | undefined {
    // Return the last connected client's info (for telemetry compatibility)
    for (const session of this.sessions.values()) {
      if (session.clientInfo) return session.clientInfo;
    }
    return undefined;
  }

  /**
   * Register a tool with the REST registry only (shared, one-time).
   */
  private registerRestTool(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: ToolHandler,
    category?: string,
    tags?: string[]
  ): void {
    const restTracedHandler = async (args: ToolArgs) => {
      return await withToolTracing(name, args, handler, {
        mcpClient: { name: 'http', version: 'rest-api' },
      });
    };
    this.restRegistry.registerTool({
      name,
      description,
      inputSchema: inputSchema as Record<string, z.ZodSchema>,
      handler: restTracedHandler as (...args: unknown[]) => Promise<unknown>,
      category,
      tags,
    });
  }

  /**
   * Register a tool on a per-session McpServer instance.
   */
  private registerMcpTool(
    server: McpServer,
    session: McpSession,
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: ToolHandler
  ): void {
    const mcpTracedHandler = async (args: ToolArgs) => {
      // RBAC enforcement (PRD #392) — invocation-time check as second layer of defense
      const identity = getCurrentIdentity();
      if (identity) {
        const rbacResult = await checkToolAccess(identity, { toolName: name });
        if (!rbacResult.allowed) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'FORBIDDEN',
                  message: `Access denied: tool '${name}' not authorized for user '${identity.email}'`,
                }),
              },
            ],
          };
        }
      }
      return await withToolTracing(name, args, handler, {
        mcpClient: session.clientInfo,
      });
    };
    /* eslint-disable @typescript-eslint/no-explicit-any -- MCP SDK type compatibility */
    server.registerTool(
      name,
      {
        description,
        inputSchema: inputSchema as any,
      },
      mcpTracedHandler as any
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  /**
   * Tool definitions — shared between REST (registered once) and MCP (registered per session).
   */
  private getToolDefs(): Array<{
    name: string;
    description: string;
    schema: Record<string, unknown>;
    handler: ToolHandler;
    category?: string;
    tags?: string[];
  }> {
    return [
      {
        name: RECOMMEND_TOOL_NAME,
        description: RECOMMEND_TOOL_DESCRIPTION,
        schema: RECOMMEND_TOOL_INPUT_SCHEMA,
        handler: async (args: ToolArgs) => {
          const requestId = this.generateRequestId();
          this.logger.info(`Processing ${RECOMMEND_TOOL_NAME} tool request`, {
            requestId,
          });
          if (!this.pluginManager)
            throw new Error(
              'Plugin system not available. Recommend tool requires agentic-tools plugin.'
            );
          return await handleRecommendTool(
            args,
            this.dotAI,
            this.logger,
            requestId,
            this.pluginManager
          );
        },
        category: 'Deployment',
        tags: ['recommendation', 'kubernetes', 'deployment', 'workflow'],
      },
      {
        name: VERSION_TOOL_NAME,
        description: VERSION_TOOL_DESCRIPTION,
        schema: VERSION_TOOL_INPUT_SCHEMA,
        handler: async (args: ToolArgs) => {
          const requestId = this.generateRequestId();
          this.logger.info(`Processing ${VERSION_TOOL_NAME} tool request`, {
            requestId,
          });
          return await handleVersionTool(args, this.logger, requestId);
        },
        category: 'System',
        tags: ['version', 'diagnostics', 'status'],
      },
      {
        name: ORGANIZATIONAL_DATA_TOOL_NAME,
        description: ORGANIZATIONAL_DATA_TOOL_DESCRIPTION,
        schema: ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA,
        handler: async (args: ToolArgs) => {
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
        category: 'Management',
        tags: ['patterns', 'policies', 'capabilities', 'data'],
      },
      {
        name: REMEDIATE_TOOL_NAME,
        description: REMEDIATE_TOOL_DESCRIPTION,
        schema: REMEDIATE_TOOL_INPUT_SCHEMA,
        handler: async (args: ToolArgs) => {
          const requestId = this.generateRequestId();
          this.logger.info(`Processing ${REMEDIATE_TOOL_NAME} tool request`, {
            requestId,
          });
          if (!isPluginInitialized())
            throw new Error(
              'Plugin system not available. Remediate tool requires agentic-tools plugin for kubectl operations.'
            );
          return await handleRemediateTool(args);
        },
        category: 'Troubleshooting',
        tags: ['remediation', 'troubleshooting', 'kubernetes', 'analysis'],
      },
      {
        name: OPERATE_TOOL_NAME,
        description: OPERATE_TOOL_DESCRIPTION,
        schema: OPERATE_TOOL_INPUT_SCHEMA,
        handler: async (args: ToolArgs) => {
          const requestId = this.generateRequestId();
          this.logger.info(`Processing ${OPERATE_TOOL_NAME} tool request`, {
            requestId,
          });
          if (!this.pluginManager)
            throw new Error(
              'Plugin system not available. Operate tool requires agentic-tools plugin for kubectl operations.'
            );
          return await handleOperateTool(args, this.pluginManager);
        },
        category: 'Operations',
        tags: [
          'operate',
          'operations',
          'kubernetes',
          'day2',
          'update',
          'scale',
        ],
      },
      {
        name: PROJECT_SETUP_TOOL_NAME,
        description: PROJECT_SETUP_TOOL_DESCRIPTION,
        schema: PROJECT_SETUP_TOOL_INPUT_SCHEMA,
        handler: async (args: ToolArgs) => {
          const requestId = this.generateRequestId();
          this.logger.info(
            `Processing ${PROJECT_SETUP_TOOL_NAME} tool request`,
            { requestId }
          );
          return await handleProjectSetupTool(args, this.logger);
        },
        category: 'Project Setup',
        tags: ['governance', 'infrastructure', 'configuration', 'files'],
      },
      {
        name: QUERY_TOOL_NAME,
        description: QUERY_TOOL_DESCRIPTION,
        schema: QUERY_TOOL_INPUT_SCHEMA,
        handler: async (args: ToolArgs) => {
          const requestId = this.generateRequestId();
          this.logger.info(`Processing ${QUERY_TOOL_NAME} tool request`, {
            requestId,
          });
          return await handleQueryTool(args, this.pluginManager);
        },
        category: 'Intelligence',
        tags: ['query', 'search', 'discover', 'capabilities', 'cluster'],
      },
      {
        name: MANAGE_KNOWLEDGE_TOOL_NAME,
        description: MANAGE_KNOWLEDGE_TOOL_DESCRIPTION,
        schema: MANAGE_KNOWLEDGE_TOOL_INPUT_SCHEMA,
        handler: async (args: ToolArgs) => {
          const requestId = this.generateRequestId();
          this.logger.info(
            `Processing ${MANAGE_KNOWLEDGE_TOOL_NAME} tool request`,
            { requestId }
          );
          return await handleManageKnowledgeTool(
            args as unknown as ManageKnowledgeInput,
            this.dotAI,
            this.logger,
            requestId
          );
        },
        category: 'Knowledge',
        tags: ['knowledge', 'documents', 'ingest', 'semantic', 'search'],
      },
      {
        name: IMPACT_ANALYSIS_TOOL_NAME,
        description: IMPACT_ANALYSIS_TOOL_DESCRIPTION,
        schema: IMPACT_ANALYSIS_TOOL_INPUT_SCHEMA,
        handler: async (args: ToolArgs) => {
          const requestId = this.generateRequestId();
          this.logger.info(`Processing ${IMPACT_ANALYSIS_TOOL_NAME} tool request`, { requestId });
          return await handleImpactAnalysisTool(args, this.pluginManager);
        },
        category: 'Intelligence',
        tags: ['impact', 'dependency', 'blast-radius', 'analysis', 'safety'],
      },
    ];
  }

  /**
   * Register tools with the shared REST registry (called once at startup).
   */
  private registerRestTools(): void {
    for (const def of this.getToolDefs()) {
      this.registerRestTool(
        def.name,
        def.description,
        def.schema,
        def.handler,
        def.category,
        def.tags
      );
    }
    const pluginToolCount =
      this.pluginManager?.getDiscoveredTools().length || 0;
    this.logger.info('Registered tools with REST registry', {
      totalRegistered: this.getToolDefs().length,
      pluginToolsAvailableInternally: pluginToolCount,
    });
  }

  /**
   * Create a new McpServer instance with all tools and prompts registered.
   * Each MCP client session gets its own server instance (SDK limitation:
   * Protocol only supports one transport per server).
   */
  private async createSessionServer(
    session: McpSession,
    authIdentity?: UserIdentity
  ): Promise<McpServer> {
    const server = new McpServer(
      { name: this.config.name, version: this.config.version },
      { capabilities: { tools: {}, prompts: {} } }
    );

    // Track client info per session
    server.server.oninitialized = () => {
      const clientVersion = server.server.getClientVersion();
      if (clientVersion) {
        session.clientInfo = {
          name: clientVersion.name,
          version: clientVersion.version,
        };
        getTelemetry().trackClientConnected(session.clientInfo);
        this.logger.info('MCP client connected', {
          client: clientVersion.name,
          version: clientVersion.version,
        });
      }
    };

    // Register tools on this session server, filtered by RBAC (PRD #392)
    const allDefs = this.getToolDefs();
    const defs = await filterAuthorizedTools(authIdentity, allDefs);
    for (const def of defs) {
      this.registerMcpTool(
        server,
        session,
        def.name,
        def.description,
        def.schema,
        def.handler
      );
    }

    // Register prompts
    this.registerPromptsOn(server);

    return server;
  }

  /**
   * Register prompts capability on a given McpServer instance.
   */
  private registerPromptsOn(server: McpServer): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK type compatibility
    (server.server.setRequestHandler as any)(
      ListPromptsRequestSchema,
      async (request: { params?: PromptsListArgs }) => {
        const requestId = this.generateRequestId();
        this.logger.info('Processing prompts/list request', { requestId });
        return await handlePromptsListRequest(
          { ...request.params, excludeFileSkills: true },
          this.logger,
          requestId
        );
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP SDK type compatibility
    (server.server.setRequestHandler as any)(
      GetPromptRequestSchema,
      async (request: {
        params?: { name: string; arguments?: Record<string, string> };
      }) => {
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
  }

  private configureHostProvider(): void {
    const aiProvider = this.dotAI.ai as { getProviderType?: () => string };
    this.logger.info('Using configured AI Provider', {
      type: aiProvider.getProviderType
        ? aiProvider.getProviderType()
        : 'unknown',
    });
  }

  /**
   * Reap sessions that have been inactive for longer than SESSION_TTL_MS.
   */
  private reapStaleSessions(): void {
    const now = Date.now();
    for (const [sid, session] of this.sessions) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        this.logger.info('Reaping inactive session', { sessionId: sid });
        session.server.close().catch(() => {});
        this.sessions.delete(sid);
      }
    }
  }

  private generateRequestId(): string {
    return `mcp_${Date.now()}_${++this.requestIdCounter}`;
  }

  async start(): Promise<void> {
    this.logger.info('Starting MCP Server');

    await this.startHttpTransport();

    // Start periodic session cleanup
    this.sessionGcTimer = setInterval(
      () => this.reapStaleSessions(),
      SESSION_GC_INTERVAL_MS
    );
    this.sessionGcTimer.unref(); // Don't prevent process exit

    this.initialized = true;
  }

  private async startHttpTransport(): Promise<void> {
    const port = process.env.PORT
      ? parseInt(process.env.PORT)
      : this.config.port !== undefined
        ? this.config.port
        : 3456;
    const host = process.env.HOST || this.config.host || '0.0.0.0';
    this.logger.info('Using HTTP/SSE transport', { port, host });

    // Create OAuth provider and Express sub-app with SDK router
    // Issuer URL: DOT_AI_EXTERNAL_URL for production (HTTPS), localhost for dev/test
    // SDK exempts localhost from HTTPS requirement
    const externalUrl =
      process.env.DOT_AI_EXTERNAL_URL || `http://localhost:${port}`;
    this.issuerUrl = new URL(externalUrl);
    this.oauthProvider = new DotAIOAuthProvider();
    this.oauthApp = express();
    this.oauthApp.set('trust proxy', 1);
    this.oauthApp.use(
      mcpAuthRouter({
        provider: this.oauthProvider,
        issuerUrl: this.issuerUrl,
      })
    );

    // Dex OIDC callback — receives redirect from Dex after user authenticates (Task 2.3)
    const oauthProvider = this.oauthProvider;
    this.oauthApp.get('/callback', async (req, res) => {
      await oauthProvider.handleCallback(req, res);
    });

    // Create HTTP server
    this.httpServer = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        // Create HTTP SERVER span for distributed tracing
        const { span, endSpan } = createHttpServerSpan(req);

        // Execute entire request within the span's context for proper propagation
        await context.with(trace.setSpan(context.active(), span), async () => {
          try {
            this.logger.debug('HTTP request received', {
              method: req.method,
              url: req.url,
              headers: req.headers,
            });

            // Handle CORS for browser-based clients
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader(
              'Access-Control-Allow-Methods',
              'GET, POST, DELETE, OPTIONS'
            );
            res.setHeader(
              'Access-Control-Allow-Headers',
              'Content-Type, X-Session-Id, Authorization, X-Dot-AI-Authorization'
            );

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

            // OAuth endpoints (unauthenticated) — delegate to Express sub-app with SDK router
            // SDK handles: discovery metadata, client registration, authorize, token
            // (with built-in rate limiting, CORS, Zod validation)
            const oauthPaths = [
              '/.well-known/oauth-protected-resource',
              '/.well-known/oauth-authorization-server',
              '/register',
              '/authorize',
              '/token',
              '/callback',
            ];
            if (oauthPaths.some(p => req.url?.startsWith(p))) {
              res.on('finish', () => endSpan(res.statusCode || 200));
              this.oauthApp!(req, res);
              return;
            }

            // Check Bearer token authentication (only when DOT_AI_AUTH_TOKEN is set)
            // Skip authentication for OpenAPI specification endpoint (public documentation)
            const isOpenApiEndpoint = req.url?.startsWith('/api/v1/openapi');
            let authIdentity: UserIdentity | undefined;
            if (!isOpenApiEndpoint) {
              const authResult = checkBearerAuth(req);
              if (!authResult.authorized) {
                this.logger.warn('Authentication failed', {
                  message: authResult.message,
                });
                const issuerHref = this.issuerUrl!.href.replace(/\/$/, '');
                const resourceMetadataUrl = `${issuerHref}/.well-known/oauth-protected-resource`;
                sendErrorResponse(
                  res,
                  401,
                  'UNAUTHORIZED',
                  authResult.message || 'Authentication required',
                  undefined,
                  {
                    'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
                  }
                );
                endSpan(401);
                return;
              }
              authIdentity = authResult.identity;
            }

            // Propagate identity to all downstream tool handlers (PRD #380)
            await requestContext.run({ identity: authIdentity }, async () => {
              // Parse request body for POST requests
              let body: unknown = undefined;
              if (req.method === 'POST') {
                body = await this.parseRequestBody(req);
              }

              // Check if this is a REST API request
              if (this.restApiRouter.isApiRequest(req.url || '')) {
                this.logger.debug('Routing to REST API handler', {
                  url: req.url,
                });
                // Mark span as REST API request
                span.setAttribute('request.type', 'rest-api');
                try {
                  await this.restApiRouter.handleRequest(req, res, body);
                  endSpan(res.statusCode || 200);
                  return;
                } catch (error) {
                  this.logger.error('REST API request failed', error as Error);
                  if (!res.headersSent) {
                    sendErrorResponse(
                      res,
                      500,
                      'INTERNAL_ERROR',
                      'REST API internal server error'
                    );
                  }
                  endSpan(500);
                  return;
                }
              }

              // Handle MCP protocol requests — route to per-session transport
              span.setAttribute('request.type', 'mcp-protocol');
              span.updateName('MCP ' + (req.url || '/'));
              try {
                // Determine if this is an initialize request (needs new transport)
                const isInit =
                  req.method === 'POST' &&
                  body != null &&
                  (Array.isArray(body)
                    ? (body as unknown[]).some(m => isInitializeRequest(m))
                    : isInitializeRequest(body));

                if (isInit) {
                  // Create a new McpServer + transport pair for this client session.
                  // Each session gets its own McpServer instance because the SDK's
                  // Protocol class only supports one transport at a time.
                  const session: McpSession = {
                    lastActivity: Date.now(),
                  } as McpSession;
                  const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    enableJsonResponse: false,
                    onsessioninitialized: (sid: string) => {
                      this.logger.info('Session initialized', {
                        sessionId: sid,
                      });
                      this.sessions.set(sid, session);
                    },
                  });
                  const server = await this.createSessionServer(
                    session,
                    authIdentity
                  );
                  session.server = server;
                  session.transport = transport;
                  transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid) this.sessions.delete(sid);
                    this.logger.info('Session closed', { sessionId: sid });
                  };
                  await server.connect(transport);
                  await transport.handleRequest(req, res, body);
                  endSpan(res.statusCode || 200);
                } else {
                  // Route to existing session by Mcp-Session-Id header
                  const sessionId = req.headers['mcp-session-id'] as
                    | string
                    | undefined;
                  const session = sessionId
                    ? this.sessions.get(sessionId)
                    : undefined;
                  if (!session) {
                    sendErrorResponse(
                      res,
                      404,
                      'SESSION_NOT_FOUND',
                      'Session not found'
                    );
                    endSpan(404);
                    return;
                  }
                  session.lastActivity = Date.now();
                  await session.transport.handleRequest(req, res, body);
                  endSpan(res.statusCode || 200);
                }
              } catch (error) {
                this.logger.error(
                  'Error handling MCP HTTP request',
                  error as Error
                );
                if (!res.headersSent) {
                  sendErrorResponse(
                    res,
                    500,
                    'INTERNAL_ERROR',
                    'MCP internal server error'
                  );
                }
                endSpan(500);
              }
            }); // Close requestContext.run()
          } catch (error) {
            // Handle any unexpected errors in span creation or request handling
            this.logger.error(
              'Unexpected error in HTTP request handler',
              error as Error
            );
            span.recordException(error as Error);
            endSpan(500);

            if (!res.headersSent) {
              sendErrorResponse(
                res,
                500,
                'INTERNAL_ERROR',
                'Internal server error'
              );
            }
          }
        }); // Close context.with()
      }
    );

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
      req.on('data', chunk => (body += chunk.toString()));
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
    // Stop OAuth provider pruning timer
    if (this.oauthProvider) {
      this.oauthProvider._stopPruning();
      this.oauthProvider = undefined;
    }

    // Stop session GC timer
    if (this.sessionGcTimer) {
      clearInterval(this.sessionGcTimer);
      this.sessionGcTimer = undefined;
    }

    // Close all session servers and transports
    for (const [sid, session] of this.sessions) {
      try {
        await session.server.close();
      } catch {
        /* ignore */
      }
      this.sessions.delete(sid);
    }

    // Stop HTTP server if running
    if (this.httpServer) {
      await new Promise<void>(resolve => {
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
