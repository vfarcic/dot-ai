/**
 * REST API Router for MCP Tools
 * 
 * Provides HTTP REST endpoints for all registered MCP tools.
 * Handles routing, validation, execution, and response formatting.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { RestToolRegistry, ToolInfo } from './rest-registry';
import { OpenApiGenerator } from './openapi-generator';
import { RestRouteRegistry, RouteMatch } from './rest-route-registry';
import { registerAllRoutes } from './routes';
import { Logger } from '../core/error-handling';
import { DotAI } from '../core/index';
import { handleResourceSync } from './resource-sync-handler';
import { handlePromptsListRequest, handlePromptsGetRequest } from '../tools/prompts';
import { GenericSessionManager } from '../core/generic-session-manager';
import { QuerySessionData } from '../tools/query';
import { loadPrompt } from '../core/shared-prompt-loader';
import {
  extractPrefixFromSessionId,
  getPromptForTool,
  BaseVisualizationData,
  parseVisualizationResponse
} from '../core/visualization';
import { createAIProvider } from '../core/ai-provider-factory';
import { CAPABILITY_TOOLS, executeCapabilityTools } from '../core/capability-tools';
import {
  RESOURCE_TOOLS,
  executeResourceTools,
  getResourceKinds,
  listResources,
  getNamespaces
} from '../core/resource-tools';
import { MERMAID_TOOLS, executeMermaidTools } from '../core/mermaid-tools';
import { PluginManager } from '../core/plugin-manager';

/**
 * HTTP status codes for REST responses
 */
export enum HttpStatus {
  OK = 200,
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503
}

/**
 * Standard REST API response format
 */
export interface RestApiResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    version: string;
  };
}

/**
 * Tool execution response format
 */
export interface ToolExecutionResponse extends RestApiResponse {
  data?: {
    result: any;
    tool: string;
    executionTime?: number;
  };
}

/**
 * Tool discovery response format
 */
export interface ToolDiscoveryResponse extends RestApiResponse {
  data?: {
    tools: ToolInfo[];
    total: number;
    categories?: string[];
    tags?: string[];
  };
}

/**
 * Visualization types supported by the API
 * PRD #320: Added 'diff' type for before/after comparisons
 * PRD #328: Added 'bar-chart' type for metrics visualization
 */
export type VisualizationType = 'mermaid' | 'cards' | 'code' | 'table' | 'diff' | 'bar-chart';

/**
 * Diff visualization content (PRD #320)
 */
export interface DiffVisualizationContent {
  before: { language: string; code: string };
  after: { language: string; code: string };
}

/**
 * Bar chart data item (PRD #328)
 */
export interface BarChartDataItem {
  label: string;       // e.g., "node-1", "kube-system"
  value: number;       // e.g., 8.5
  max?: number;        // e.g., 10 (for percentage calculation)
  status?: 'error' | 'warning' | 'ok';  // for color-coding
}

/**
 * Bar chart visualization content (PRD #328)
 */
export interface BarChartVisualizationContent {
  data: BarChartDataItem[];
  unit?: string;       // e.g., "Gi", "cores", "%"
  orientation?: 'horizontal' | 'vertical';  // default: horizontal
}

/**
 * Individual visualization item
 */
export interface Visualization {
  id: string;
  label: string;
  type: VisualizationType;
  content:
    | string // mermaid
    | { language: string; code: string } // code
    | { headers: string[]; rows: string[][] } // table
    | Array<{ id: string; title: string; description?: string; tags?: string[] }> // cards
    | DiffVisualizationContent // diff
    | BarChartVisualizationContent; // bar-chart
}

/**
 * Visualization endpoint response format
 * PRD #320: Added toolsUsed for test validation of mermaid validation
 */
export interface VisualizationResponse {
  title: string;
  visualizations: Visualization[];
  insights: string[];
  toolsUsed?: string[];  // Tools called during visualization generation
}

/**
 * REST API router configuration
 */
export interface RestApiConfig {
  basePath: string;
  version: string;
  enableCors: boolean;
  requestTimeout: number;
}

/**
 * REST API Router for MCP tools
 */
export class RestApiRouter {
  private registry: RestToolRegistry;
  private routeRegistry: RestRouteRegistry;
  private logger: Logger;
  private dotAI: DotAI;
  private config: RestApiConfig;
  private openApiGenerator: OpenApiGenerator;
  private requestCounter: number = 0;
  private pluginManager?: PluginManager;

  constructor(
    registry: RestToolRegistry,
    dotAI: DotAI,
    logger: Logger,
    pluginManager?: PluginManager,
    config: Partial<RestApiConfig> = {}
  ) {
    this.registry = registry;
    this.dotAI = dotAI;
    this.logger = logger;
    this.pluginManager = pluginManager;
    this.config = {
      basePath: '/api',
      version: 'v1',
      enableCors: true,
      requestTimeout: 1800000, // 30 minutes for long-running operations (capability scan with slower AI providers)
      ...config
    };

    // Initialize route registry and register all routes (PRD #354)
    this.routeRegistry = new RestRouteRegistry(logger);
    registerAllRoutes(this.routeRegistry);
    this.logger.info('REST route registry initialized', {
      routeCount: this.routeRegistry.getRouteCount(),
      tags: this.routeRegistry.getTags(),
    });

    // Initialize OpenAPI generator with route registry (PRD #354)
    this.openApiGenerator = new OpenApiGenerator(
      registry,
      logger,
      {
        basePath: this.config.basePath,
        apiVersion: this.config.version,
      },
      this.routeRegistry
    );
  }

  /**
   * Handle incoming HTTP requests for REST API
   *
   * PRD #354: Uses route registry for matching, dispatches to handlers based on route path.
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse, body?: any): Promise<void> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      this.logger.debug('REST API request received', {
        requestId,
        method: req.method,
        url: req.url,
        hasBody: !!body
      });

      // Handle CORS preflight
      if (this.config.enableCors) {
        this.setCorsHeaders(res);
        if (req.method === 'OPTIONS') {
          res.writeHead(HttpStatus.OK);
          res.end();
          return;
        }
      }

      // Parse URL
      const url = new URL(req.url || '/', 'http://localhost');
      const method = req.method || 'GET';

      // PRD #354: Try route registry first
      const routeMatch = this.routeRegistry.findRoute(method, url.pathname);

      if (routeMatch) {
        this.logger.debug('Route matched via registry', {
          requestId,
          path: routeMatch.route.path,
          method: routeMatch.route.method,
          params: routeMatch.params,
        });

        // Dispatch to handler based on route path
        await this.dispatchRoute(req, res, requestId, routeMatch, url.searchParams, body, startTime);
        return;
      }

      // Check if path matches but method is wrong (HTTP 405 per RFC 7231)
      const allowedMethods = this.routeRegistry.findAllowedMethods(url.pathname);
      if (allowedMethods.length > 0) {
        res.setHeader('Allow', allowedMethods.join(', '));
        const methodList = allowedMethods.join(', ');
        const message = allowedMethods.length === 1
          ? `Only ${methodList} method allowed`
          : `Only ${methodList} methods allowed`;
        await this.sendErrorResponse(res, requestId, HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED', message);
        return;
      }

      // No match found
      await this.sendErrorResponse(res, requestId, HttpStatus.NOT_FOUND, 'NOT_FOUND', 'API endpoint not found');

    } catch (error) {
      this.logger.error('REST API request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR',
        'An internal server error occurred'
      );
    }
  }

  /**
   * Dispatch request to appropriate handler based on matched route
   * PRD #354: Central dispatch using handler map for registry-matched routes.
   */
  private async dispatchRoute(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    routeMatch: RouteMatch,
    searchParams: URLSearchParams,
    body: any,
    startTime: number
  ): Promise<void> {
    const { route, params } = routeMatch;
    const routeKey = `${route.method}:${route.path}`;

    // Handler map: route key -> handler function
    const handlers: Record<string, () => Promise<void>> = {
      'GET:/api/v1/tools': () => this.handleToolDiscovery(req, res, requestId, searchParams),
      'POST:/api/v1/tools/:toolName': () => this.handleToolExecution(req, res, requestId, params.toolName, body, startTime),
      'GET:/api/v1/openapi': () => this.handleOpenApiSpec(req, res, requestId),
      'GET:/api/v1/resources': () => this.handleListResources(req, res, requestId, searchParams),
      'GET:/api/v1/resources/kinds': () => this.handleGetResourceKinds(req, res, requestId, searchParams),
      'GET:/api/v1/resources/search': () => this.handleSearchResources(req, res, requestId, searchParams),
      'POST:/api/v1/resources/sync': () => this.handleResourceSyncRequest(req, res, requestId, body),
      'GET:/api/v1/resource': () => this.handleGetResource(req, res, requestId, searchParams),
      'GET:/api/v1/namespaces': () => this.handleGetNamespaces(req, res, requestId),
      'GET:/api/v1/events': () => this.handleGetEvents(req, res, requestId, searchParams),
      'GET:/api/v1/logs': () => this.handleGetLogs(req, res, requestId, searchParams),
      'GET:/api/v1/prompts': () => this.handlePromptsListRequest(req, res, requestId),
      'POST:/api/v1/prompts/:promptName': () => this.handlePromptsGetRequest(req, res, requestId, params.promptName, body),
      'GET:/api/v1/visualize/:sessionId': () => this.handleVisualize(req, res, requestId, params.sessionId, searchParams),
      'GET:/api/v1/sessions/:sessionId': () => this.handleSessionRetrieval(req, res, requestId, params.sessionId),
    };

    const handler = handlers[routeKey];
    if (handler) {
      await handler();
    } else {
      this.logger.warn('Route matched but no handler found', { requestId, routeKey });
      await this.sendErrorResponse(res, requestId, HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Handler not found for route');
    }
  }

  /**
   * Handle tool discovery requests
   */
  private async handleToolDiscovery(
    req: IncomingMessage, 
    res: ServerResponse, 
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const category = searchParams.get('category') || undefined;
      const tag = searchParams.get('tag') || undefined;
      const search = searchParams.get('search') || undefined;

      const tools = this.registry.getToolsFiltered({ category, tag, search });
      const categories = this.registry.getCategories();
      const tags = this.registry.getTags();

      const response: ToolDiscoveryResponse = {
        success: true,
        data: {
          tools,
          total: tools.length,
          categories,
          tags
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Tool discovery request completed', {
        requestId,
        totalTools: tools.length,
        filters: { category, tag, search }
      });

    } catch (error) {
      await this.sendErrorResponse(res, requestId, HttpStatus.INTERNAL_SERVER_ERROR, 'DISCOVERY_ERROR', 'Failed to retrieve tool information');
    }
  }

  /**
   * Handle tool execution requests
   */
  private async handleToolExecution(
    req: IncomingMessage, 
    res: ServerResponse, 
    requestId: string,
    toolName: string,
    body: any,
    startTime: number
  ): Promise<void> {
    try {
      // Check if tool exists
      const toolMetadata = this.registry.getTool(toolName);
      if (!toolMetadata) {
        await this.sendErrorResponse(res, requestId, HttpStatus.NOT_FOUND, 'TOOL_NOT_FOUND', `Tool '${toolName}' not found`);
        return;
      }

      // Validate request body
      if (!body || typeof body !== 'object') {
        await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'Request body must be a JSON object');
        return;
      }


      this.logger.info('Executing tool via REST API', {
        requestId,
        toolName,
        parameters: Object.keys(body)
      });

      // Execute the tool handler with timeout
      // Note: Tool handlers expect the same format as MCP calls
      // PRD #343: Pass pluginManager for kubectl operations via plugin system
      const timeoutMs = this.config.requestTimeout;
      const toolPromise = toolMetadata.handler(body, this.dotAI, this.logger, requestId, this.pluginManager);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout exceeded')), timeoutMs)
      );
      // Prevent unhandled rejection if toolPromise resolves after timeout
      toolPromise.catch(() => {});
      const mcpResult = await Promise.race([toolPromise, timeoutPromise]);
      
      // Transform MCP format to proper REST JSON
      // All MCP tools return JSON.stringify() in content[0].text, so parse it back to proper JSON
      let transformedResult;
      if (mcpResult?.content?.[0]?.type === 'text') {
        try {
          transformedResult = JSON.parse(mcpResult.content[0].text);
        } catch (parseError) {
          this.logger.warn('Failed to parse MCP tool result as JSON, returning as text', {
            requestId,
            toolName,
            error: parseError instanceof Error ? parseError.message : String(parseError)
          });
          transformedResult = mcpResult.content[0].text;
        }
      } else {
        // Fallback for unexpected format
        transformedResult = mcpResult;
      }
      
      const executionTime = Date.now() - startTime;

      const response: ToolExecutionResponse = {
        success: true,
        data: {
          result: transformedResult,
          tool: toolName,
          executionTime
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Tool execution completed', {
        requestId,
        toolName,
        executionTime,
        success: true
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Tool execution failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        toolName,
        errorMessage
      });

      await this.sendErrorResponse(res, requestId, HttpStatus.INTERNAL_SERVER_ERROR, 'EXECUTION_ERROR', errorMessage);
    }
  }

  /**
   * Handle OpenAPI specification requests
   */
  private async handleOpenApiSpec(req: IncomingMessage, res: ServerResponse, requestId: string): Promise<void> {
    try {
      this.logger.debug('Generating OpenAPI specification', { requestId });
      
      const spec = this.openApiGenerator.generateSpec();
      
      await this.sendJsonResponse(res, HttpStatus.OK, spec);
      
      this.logger.info('OpenAPI specification served successfully', {
        requestId,
        pathCount: Object.keys(spec.paths).length,
        componentCount: Object.keys(spec.components?.schemas || {}).length
      });
      
    } catch (error) {
      this.logger.error('Failed to generate OpenAPI specification', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'OPENAPI_ERROR',
        'Failed to generate OpenAPI specification'
      );
    }
  }

  /**
   * Handle resource sync requests from controller
   */
  private async handleResourceSyncRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    body: any
  ): Promise<void> {
    try {
      this.logger.info('Processing resource sync request', { requestId });

      // Validate request body exists
      if (!body || typeof body !== 'object') {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_REQUEST',
          'Request body must be a JSON object'
        );
        return;
      }

      // Delegate to the resource sync handler
      const response = await handleResourceSync(body, this.logger, requestId);

      // Determine HTTP status based on response and error type
      let httpStatus = HttpStatus.OK;
      if (!response.success) {
        const errorCode = response.error?.code;
        if (errorCode === 'VECTOR_DB_UNAVAILABLE' || errorCode === 'HEALTH_CHECK_FAILED') {
          httpStatus = HttpStatus.SERVICE_UNAVAILABLE;
        } else if (errorCode === 'SERVICE_INIT_FAILED' || errorCode === 'COLLECTION_INIT_FAILED' || errorCode === 'RESYNC_FAILED') {
          httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        } else {
          httpStatus = HttpStatus.BAD_REQUEST;
        }
      }

      await this.sendJsonResponse(res, httpStatus, response);

      this.logger.info('Resource sync request completed', {
        requestId,
        success: response.success,
        upserted: response.data?.upserted,
        deleted: response.data?.deleted
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Resource sync request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'SYNC_ERROR',
        'Resource sync failed',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/resources/kinds (PRD #328)
   * Returns all unique resource kinds with counts
   * Supports optional namespace query parameter for filtering
   */
  private async handleGetResourceKinds(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const namespace = searchParams.get('namespace') || undefined;

      this.logger.info('Processing get resource kinds request', { requestId, namespace });

      const kinds = await getResourceKinds(namespace);

      const response: RestApiResponse = {
        success: true,
        data: {
          kinds
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get resource kinds request completed', {
        requestId,
        kindCount: kinds.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Get resource kinds request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'RESOURCE_KINDS_ERROR',
        'Failed to retrieve resource kinds',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/resources/search (PRD #328)
   * Semantic search for resources with optional exact filters
   */
  private async handleSearchResources(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      // Extract query parameters
      const q = searchParams.get('q');
      const namespace = searchParams.get('namespace') || undefined;
      const kind = searchParams.get('kind') || undefined;
      const apiVersion = searchParams.get('apiVersion') || undefined;
      const limitParam = searchParams.get('limit');
      const offsetParam = searchParams.get('offset');
      const minScoreParam = searchParams.get('minScore');

      // Validate required parameters
      if (!q) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'MISSING_PARAMETER',
          'The "q" query parameter is required for search'
        );
        return;
      }

      const limit = limitParam ? parseInt(limitParam, 10) : 100;
      const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
      const minScore = minScoreParam ? parseFloat(minScoreParam) : undefined;

      // Validate numeric parameters
      if (limitParam && (isNaN(limit) || limit < 1)) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "limit" parameter must be a positive integer'
        );
        return;
      }

      if (offsetParam && (isNaN(offset) || offset < 0)) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "offset" parameter must be a non-negative integer'
        );
        return;
      }

      if (minScoreParam && (isNaN(minScore!) || minScore! < 0 || minScore! > 1)) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "minScore" parameter must be a number between 0 and 1'
        );
        return;
      }

      this.logger.info('Processing search resources request', {
        requestId,
        query: q,
        namespace,
        kind,
        apiVersion,
        limit,
        offset,
        minScore
      });

      // Build filters
      const filters: { namespace?: string; kind?: string; apiVersion?: string } = {};
      if (namespace) filters.namespace = namespace;
      if (kind) filters.kind = kind;
      if (apiVersion) filters.apiVersion = apiVersion;

      // Perform search using ResourceVectorService singleton
      const { getResourceService } = await import('../core/resource-tools');
      const service = await getResourceService();

      // Request more results than needed for offset pagination
      const searchLimit = limit + offset;
      const results = await service.searchResources(
        q,
        Object.keys(filters).length > 0 ? filters : undefined,
        searchLimit,
        minScore
      );

      // Apply offset pagination
      const paginatedResults = results.slice(offset, offset + limit);

      // Transform results to include score for relevance ranking
      const resources = paginatedResults.map(r => ({
        name: r.resource.name,
        namespace: r.resource.namespace,
        kind: r.resource.kind,
        apiVersion: r.resource.apiVersion,
        labels: r.resource.labels || {},
        createdAt: r.resource.createdAt,
        score: r.score
      }));

      const response: RestApiResponse = {
        success: true,
        data: {
          resources,
          total: results.length,
          limit,
          offset
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Search resources request completed', {
        requestId,
        query: q,
        resultCount: resources.length,
        totalMatches: results.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Search resources request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'SEARCH_ERROR',
        'Failed to search resources',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/resources (PRD #328)
   * Returns filtered and paginated list of resources
   * Supports optional live status enrichment from K8s API
   */
  private async handleListResources(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      // Extract query parameters
      const kind = searchParams.get('kind');
      const apiVersion = searchParams.get('apiVersion');
      const namespace = searchParams.get('namespace') || undefined;
      const includeStatusParam = searchParams.get('includeStatus');
      const limitParam = searchParams.get('limit');
      const offsetParam = searchParams.get('offset');

      // Validate required parameters
      if (!kind) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'MISSING_PARAMETER',
          'The "kind" query parameter is required'
        );
        return;
      }

      if (!apiVersion) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'MISSING_PARAMETER',
          'The "apiVersion" query parameter is required'
        );
        return;
      }

      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;
      const includeStatus = includeStatusParam === 'true';

      // Validate numeric parameters
      if (limitParam && (isNaN(limit!) || limit! < 1)) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "limit" parameter must be a positive integer'
        );
        return;
      }

      if (offsetParam && (isNaN(offset!) || offset! < 0)) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_REQUEST,
          'INVALID_PARAMETER',
          'The "offset" parameter must be a non-negative integer'
        );
        return;
      }

      this.logger.info('Processing list resources request', {
        requestId,
        kind,
        apiVersion,
        namespace,
        includeStatus,
        limit,
        offset
      });

      // PRD #343: Never pass includeStatus to listResources (it uses direct kubectl)
      // Fetch status via plugin separately if requested
      const result = await listResources({ kind, apiVersion, namespace, limit, offset });

      // Enrich with live status via plugin if requested
      if (includeStatus && result.resources.length > 0 && this.pluginManager?.isPluginTool('kubectl_get_resource_json')) {
        const statusPromises = result.resources.map(async (resource) => {
          const resourceType = resource.apiGroup
            ? `${resource.kind.toLowerCase()}.${resource.apiGroup}`
            : resource.kind.toLowerCase();
          const resourceId = `${resourceType}/${resource.name}`;

          const pluginResponse = await this.pluginManager!.invokeTool('kubectl_get_resource_json', {
            resource: resourceId,
            namespace: resource.namespace,
            field: 'status'
          });

          if (pluginResponse.success && pluginResponse.result) {
            const pluginResult = pluginResponse.result as { success: boolean; data: string };
            if (pluginResult.success && pluginResult.data) {
              try {
                return { ...resource, status: JSON.parse(pluginResult.data) };
              } catch {
                return resource;
              }
            }
          }
          return resource;
        });

        result.resources = await Promise.all(statusPromises);
      }

      const response: RestApiResponse = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('List resources request completed', {
        requestId,
        resourceCount: result.resources.length,
        total: result.total,
        includeStatus
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('List resources request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'LIST_RESOURCES_ERROR',
        'Failed to list resources',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/namespaces (PRD #328)
   * Returns all unique namespaces
   */
  private async handleGetNamespaces(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string
  ): Promise<void> {
    try {
      this.logger.info('Processing get namespaces request', { requestId });

      const namespaces = await getNamespaces();

      const response: RestApiResponse = {
        success: true,
        data: {
          namespaces
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get namespaces request completed', {
        requestId,
        namespaceCount: namespaces.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Get namespaces request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'NAMESPACES_ERROR',
        'Failed to retrieve namespaces',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/resource (PRD #328)
   * Returns a single resource with full metadata, spec, and status
   */
  private async handleGetResource(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const kind = searchParams.get('kind');
      const apiVersion = searchParams.get('apiVersion');
      const name = searchParams.get('name');
      const namespace = searchParams.get('namespace') || undefined;

      // Validate required parameters
      if (!kind) {
        await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'kind query parameter is required');
        return;
      }
      if (!apiVersion) {
        await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'apiVersion query parameter is required');
        return;
      }
      if (!name) {
        await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'name query parameter is required');
        return;
      }

      this.logger.info('Processing get resource request', { requestId, kind, apiVersion, name, namespace });

      // Extract apiGroup from apiVersion (e.g., "apps/v1" -> "apps", "v1" -> "")
      const apiGroup = apiVersion.includes('/') ? apiVersion.split('/')[0] : '';

      // PRD #343: Use plugin for kubectl operations
      if (!this.pluginManager?.isPluginTool('kubectl_get_resource_json')) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'PLUGIN_UNAVAILABLE',
          'Kubernetes plugin not available'
        );
        return;
      }

      // Build resource identifier (kind.group/name or kind/name for core resources)
      const resourceType = apiGroup ? `${kind.toLowerCase()}.${apiGroup}` : kind.toLowerCase();
      const resourceId = `${resourceType}/${name}`;

      const pluginResponse = await this.pluginManager.invokeTool('kubectl_get_resource_json', {
        resource: resourceId,
        namespace: namespace
      });

      // Check for plugin-level failures first
      if (!pluginResponse.success) {
        const errorMsg = pluginResponse.error?.message || 'Plugin invocation failed';
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_GATEWAY,
          'PLUGIN_ERROR',
          `Kubernetes plugin error: ${errorMsg}`
        );
        return;
      }

      let resource: object | undefined;
      let pluginError: string | undefined;
      if (pluginResponse.result) {
        const result = pluginResponse.result as { success: boolean; data: string; error?: string };
        if (result.success && result.data) {
          try {
            resource = JSON.parse(result.data);
          } catch (parseError) {
            pluginError = `Failed to parse resource JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
          }
        } else if (!result.success) {
          // kubectl command failed - check if it's a "not found" error
          pluginError = result.error || 'kubectl command failed';
        }
      }

      // Handle parse errors
      if (pluginError && !pluginError.toLowerCase().includes('not found')) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.BAD_GATEWAY,
          'KUBECTL_ERROR',
          pluginError
        );
        return;
      }

      if (!resource) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.NOT_FOUND,
          'NOT_FOUND',
          `Resource ${kind}/${name} not found${namespace ? ` in namespace ${namespace}` : ''}`
        );
        return;
      }

      const response: RestApiResponse = {
        success: true,
        data: {
          resource
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get resource request completed', {
        requestId,
        kind,
        name,
        namespace
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Get resource request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'RESOURCE_ERROR',
        'Failed to retrieve resource',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/events (PRD #328)
   * Returns Kubernetes events for a specific resource
   */
  private async handleGetEvents(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const name = searchParams.get('name');
      const kind = searchParams.get('kind');
      const namespace = searchParams.get('namespace') || undefined;
      const uid = searchParams.get('uid') || undefined;

      // Validate required parameters
      if (!name) {
        await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'name query parameter is required');
        return;
      }
      if (!kind) {
        await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'kind query parameter is required');
        return;
      }

      this.logger.info('Processing get events request', { requestId, name, kind, namespace, uid });

      // PRD #343: Use plugin for kubectl operations
      if (!this.pluginManager?.isPluginTool('kubectl_events')) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'PLUGIN_UNAVAILABLE',
          'Kubernetes plugin not available'
        );
        return;
      }

      // Build field selector for involvedObject filtering
      const fieldSelectors: string[] = [
        `involvedObject.name=${name}`,
        `involvedObject.kind=${kind}`
      ];
      if (uid) {
        fieldSelectors.push(`involvedObject.uid=${uid}`);
      }

      const pluginResponse = await this.pluginManager.invokeTool('kubectl_events', {
        namespace: namespace,
        args: [`--field-selector=${fieldSelectors.join(',')}`]
      });

      let events: any[] = [];
      if (pluginResponse.success && pluginResponse.result) {
        const pluginResult = pluginResponse.result as { success: boolean; data: string };
        if (pluginResult.success && pluginResult.data) {
          // Parse the table output or handle JSON if available
          // Events output is typically table format, so we need to parse it
          const lines = pluginResult.data.split('\n').filter(line => line.trim());
          if (lines.length > 1) {
            // Skip header line, parse remaining lines
            for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].split(/\s{2,}/);
              if (parts.length >= 5) {
                events.push({
                  lastTimestamp: parts[0],
                  type: parts[1],
                  reason: parts[2],
                  involvedObject: { kind, name },
                  message: parts.slice(4).join(' ')
                });
              }
            }
          }
        }
      }

      const response: RestApiResponse = {
        success: true,
        data: {
          events,
          count: events.length
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get events request completed', {
        requestId,
        name,
        kind,
        namespace,
        eventCount: events.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Get events request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'EVENTS_ERROR',
        'Failed to retrieve events',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle GET /api/v1/logs (PRD #328)
   * Returns container logs for a pod
   */
  private async handleGetLogs(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      const name = searchParams.get('name');
      const namespace = searchParams.get('namespace');
      const container = searchParams.get('container') || undefined;
      const tailLinesParam = searchParams.get('tailLines');

      // Validate required parameters
      if (!name) {
        await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'name query parameter is required');
        return;
      }
      if (!namespace) {
        await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'namespace query parameter is required');
        return;
      }

      // Parse tailLines with validation
      let tailLines: number | undefined;
      if (tailLinesParam) {
        tailLines = parseInt(tailLinesParam, 10);
        if (isNaN(tailLines) || tailLines < 1) {
          await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'INVALID_PARAMETER', 'tailLines must be a positive integer');
          return;
        }
      }

      this.logger.info('Processing get logs request', { requestId, name, namespace, container, tailLines });

      // PRD #343: Use plugin for kubectl operations
      if (!this.pluginManager?.isPluginTool('kubectl_logs')) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'PLUGIN_UNAVAILABLE',
          'Kubernetes plugin not available'
        );
        return;
      }

      // Build args for kubectl_logs
      const args: string[] = [];
      if (tailLines) {
        args.push(`--tail=${tailLines}`);
      }
      if (container) {
        args.push('-c', container);
      }

      const pluginResponse = await this.pluginManager.invokeTool('kubectl_logs', {
        resource: name,
        namespace: namespace,
        args: args.length > 0 ? args : undefined
      });

      if (!pluginResponse.success) {
        const errorMsg = pluginResponse.error?.message || 'Failed to retrieve logs';
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'LOGS_ERROR',
          'Failed to retrieve logs',
          { error: errorMsg }
        );
        return;
      }

      const result = pluginResponse.result as { success: boolean; data: string; message: string };
      if (!result.success) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'LOGS_ERROR',
          'Failed to retrieve logs',
          { error: result.message || 'Unknown error' }
        );
        return;
      }

      const response: RestApiResponse = {
        success: true,
        data: {
          logs: result.data,
          container: container || 'default',
          containerCount: 1
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Get logs request completed', {
        requestId,
        name,
        namespace,
        container: container || 'default',
        logLength: result.data.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Get logs request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        errorMessage
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'LOGS_ERROR',
        'Failed to retrieve logs',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle prompts list requests
   */
  private async handlePromptsListRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string
  ): Promise<void> {
    try {
      this.logger.info('Processing prompts list request', { requestId });

      const result = await handlePromptsListRequest({}, this.logger, requestId);

      const response: RestApiResponse = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Prompts list request completed', {
        requestId,
        promptCount: result.prompts?.length || 0
      });

    } catch (error) {
      this.logger.error('Prompts list request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'PROMPTS_LIST_ERROR',
        'Failed to list prompts'
      );
    }
  }

  /**
   * Handle prompt get requests
   */
  private async handlePromptsGetRequest(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    promptName: string,
    body: any
  ): Promise<void> {
    try {
      this.logger.info('Processing prompt get request', { requestId, promptName });

      const result = await handlePromptsGetRequest(
        { name: promptName, arguments: body?.arguments },
        this.logger,
        requestId
      );

      const response: RestApiResponse = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Prompt get request completed', {
        requestId,
        promptName
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Prompt get request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        promptName
      });

      // Check if it's a validation error (missing required arguments or prompt not found)
      const isValidationError = errorMessage.includes('Missing required arguments') ||
                                errorMessage.includes('Prompt not found');

      await this.sendErrorResponse(
        res,
        requestId,
        isValidationError ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR,
        isValidationError ? 'VALIDATION_ERROR' : 'PROMPT_GET_ERROR',
        errorMessage
      );
    }
  }

  /**
   * Handle visualization requests (PRD #317)
   * Returns structured visualization data for a query session
   * PRD #320: Supports ?reload=true to regenerate visualization from current session data
   */
  private async handleVisualize(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    sessionIdParam: string,
    searchParams: URLSearchParams
  ): Promise<void> {
    try {
      // PRD #320: Support multiple session IDs separated by +
      const sessionIds = sessionIdParam.split('+').filter(id => id.length > 0);
      const isMultiSession = sessionIds.length > 1;

      // PRD #320: Support ?reload=true to regenerate visualization from current session data
      const reload = searchParams.get('reload') === 'true';

      this.logger.info('Processing visualization request', {
        requestId,
        sessionIds,
        isMultiSession,
        reload
      });

      // Fetch all sessions
      const sessions: Array<{ sessionId: string; data: any }> = [];
      for (const sessionId of sessionIds) {
        const sessionPrefix = extractPrefixFromSessionId(sessionId);
        const sessionManager = new GenericSessionManager<QuerySessionData & BaseVisualizationData>(sessionPrefix);
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          await this.sendErrorResponse(
            res,
            requestId,
            HttpStatus.NOT_FOUND,
            'SESSION_NOT_FOUND',
            `Session '${sessionId}' not found or has expired`
          );
          return;
        }
        sessions.push({ sessionId, data: session.data });
      }

      // For single session, check cache (multi-session doesn't use cache yet)
      // PRD #320: Skip cache if reload=true to regenerate from current session data
      const primarySession = sessions[0];
      if (!isMultiSession && !reload && primarySession.data.cachedVisualization) {
        this.logger.info('Returning cached visualization', {
          requestId,
          sessionId: sessionIds[0],
          generatedAt: primarySession.data.cachedVisualization.generatedAt
        });

        const cachedResponse: RestApiResponse = {
          success: true,
          data: {
            title: primarySession.data.cachedVisualization.title,
            visualizations: primarySession.data.cachedVisualization.visualizations,
            insights: primarySession.data.cachedVisualization.insights,
            toolsUsed: primarySession.data.cachedVisualization.toolsUsed  // PRD #320
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            version: this.config.version
          }
        };

        await this.sendJsonResponse(res, HttpStatus.OK, cachedResponse);
        return;
      }

      // Generate AI-powered visualization (PRD #317 Milestone 4)
      const aiProvider = createAIProvider();

      if (!aiProvider.isInitialized()) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.SERVICE_UNAVAILABLE,
          'AI_NOT_CONFIGURED',
          'AI provider is not configured. Set ANTHROPIC_API_KEY or other AI provider credentials.'
        );
        return;
      }

      // PRD #320: Select prompt based on tool name (defaults to 'query' for backwards compatibility)
      const toolName = primarySession.data.toolName || 'query';
      const promptName = getPromptForTool(toolName);

      this.logger.info('Loading visualization prompt', { requestId, sessionIds, toolName, promptName });

      // Load system prompt with session context
      // PRD #320: Unified visualization prompt with tool-aware data selection
      let intent: string;
      let data: any;

      switch (toolName) {
        case 'recommend':
          intent = primarySession.data.intent || '';
          data = isMultiSession ? sessions.map(s => s.data) : primarySession.data;
          break;
        case 'remediate':
          intent = primarySession.data.issue || '';
          data = primarySession.data.finalAnalysis || primarySession.data;
          break;
        case 'operate':
          intent = primarySession.data.intent || '';
          data = primarySession.data;
          break;
        case 'version':
          // PRD #320: Version tool provides system health status
          intent = `System health: ${primarySession.data.summary?.overall || 'unknown'}`;
          data = primarySession.data;
          break;
        default:
          // Query and other tools: use toolCallsExecuted or full data
          intent = primarySession.data.intent || '';
          data = primarySession.data.toolCallsExecuted || primarySession.data;
      }

      const promptData = {
        intent,
        data: JSON.stringify(data, null, 2),
        visualizationOutput: loadPrompt('partials/visualization-output')
      };

      const systemPrompt = loadPrompt(promptName, promptData);

      // PRD #343: Local executor for non-plugin tools (capability, resource, mermaid)
      const localToolExecutor = async (toolName: string, input: any): Promise<any> => {
        if (toolName.startsWith('search_capabilities') || toolName.startsWith('query_capabilities')) {
          return executeCapabilityTools(toolName, input);
        }
        if (toolName.startsWith('search_resources') || toolName.startsWith('query_resources')) {
          return executeResourceTools(toolName, input);
        }
        // PRD #320: Mermaid validation tools
        if (toolName === 'validate_mermaid') {
          return executeMermaidTools(toolName, input);
        }
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          message: `Tool '${toolName}' is not implemented in visualization`
        };
      };

      // PRD #343: Use plugin executor for kubectl tools, local for others
      const executeVisualizationTools = this.pluginManager
        ? this.pluginManager.createToolExecutor(localToolExecutor)
        : localToolExecutor;

      // PRD #343: Get kubectl tools from plugin (read-only tools for visualization)
      const KUBECTL_READONLY_TOOL_NAMES = [
        'kubectl_api_resources',
        'kubectl_get',
        'kubectl_describe',
        'kubectl_logs',
        'kubectl_events',
        'kubectl_get_crd_schema'
      ];
      const pluginKubectlTools = this.pluginManager
        ? this.pluginManager.getDiscoveredTools().filter(t => KUBECTL_READONLY_TOOL_NAMES.includes(t.name))
        : [];

      this.logger.info('Starting AI visualization generation with tools', { requestId, sessionIds, toolName });

      // Execute tool loop - AI can gather additional data if needed
      const result = await aiProvider.toolLoop({
        systemPrompt,
        userMessage: 'Generate visualizations based on the query results provided. Use tools if you need additional information about any resources.',
        // PRD #320: Include MERMAID_TOOLS for diagram validation
        // PRD #343: kubectl tools from plugin
        tools: [...CAPABILITY_TOOLS, ...RESOURCE_TOOLS, ...pluginKubectlTools, ...MERMAID_TOOLS],
        toolExecutor: executeVisualizationTools,
        maxIterations: 10,  // Allow enough iterations for tool calls + JSON generation
        operation: `visualize-${toolName}`  // PRD #320: Include tool name for debugging
      });

      this.logger.info('AI visualization generation completed', {
        requestId,
        sessionIds,
        toolName,
        iterations: result.iterations,
        toolsUsed: [...new Set(result.toolCallsExecuted.map(tc => tc.tool))]
      });

      // Parse AI response as JSON using shared function
      let visualizationResponse: VisualizationResponse;
      let isFallbackResponse = false;
      try {
        const toolsUsed = [...new Set(result.toolCallsExecuted.map(tc => tc.tool))];
        visualizationResponse = parseVisualizationResponse(result.finalMessage, toolsUsed);
      } catch (parseError) {
        this.logger.error('Failed to parse AI visualization response', parseError instanceof Error ? parseError : new Error(String(parseError)), {
          requestId,
          sessionIds,
          rawResponse: result.finalMessage.substring(0, 500)
        });

        // Fallback to basic visualization on parse error
        // NOTE: isFallbackResponse flag prevents caching this response
        isFallbackResponse = true;
        visualizationResponse = {
          title: `Query: ${primarySession.data.intent}`,
          visualizations: [
            {
              id: 'raw-data',
              label: 'Raw Data',
              type: 'code',
              content: {
                language: 'json',
                code: JSON.stringify(isMultiSession ? sessions.map(s => s.data) : primarySession.data, null, 2)
              }
            }
          ],
          insights: [
            'AI visualization generation failed - showing raw data'
          ]
        };
      }

      // Cache the visualization in the session for subsequent requests (single session only)
      // Don't cache fallback responses - let subsequent requests retry AI generation
      if (!isMultiSession && !isFallbackResponse) {
        const sessionPrefix = extractPrefixFromSessionId(sessionIds[0]);
        const cacheManager = new GenericSessionManager<QuerySessionData & BaseVisualizationData>(sessionPrefix);
        cacheManager.updateSession(sessionIds[0], {
          cachedVisualization: {
            title: visualizationResponse.title,
            visualizations: visualizationResponse.visualizations,
            insights: visualizationResponse.insights,
            toolsUsed: visualizationResponse.toolsUsed,  // PRD #320: Cache toolsUsed
            generatedAt: new Date().toISOString()
          }
        });
        this.logger.info('Visualization cached in session', { requestId, sessionId: sessionIds[0] });
      } else if (isFallbackResponse) {
        this.logger.warn('Skipping cache for fallback visualization response', { requestId, sessionId: sessionIds[0] });
      }

      const response: RestApiResponse = {
        success: true,
        data: visualizationResponse,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Visualization request completed', {
        requestId,
        sessionIds,
        visualizationCount: visualizationResponse.visualizations.length,
        cached: !isMultiSession && !isFallbackResponse,
        isFallback: isFallbackResponse
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Visualization request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        sessionIdParam
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'VISUALIZATION_ERROR',
        'Failed to generate visualization',
        { error: errorMessage }
      );
    }
  }

  /**
   * Handle generic session retrieval requests
   * Returns raw session data for any tool type (remediate, query, recommend, etc.)
   * Session type is determined by the session ID prefix (rem-, qry-, rec-, opr-, etc.)
   */
  private async handleSessionRetrieval(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    sessionId: string
  ): Promise<void> {
    try {
      const sessionPrefix = extractPrefixFromSessionId(sessionId);

      this.logger.info('Processing session retrieval', {
        requestId,
        sessionId,
        sessionPrefix
      });

      const sessionManager = new GenericSessionManager<Record<string, unknown>>(sessionPrefix);
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        await this.sendErrorResponse(
          res,
          requestId,
          HttpStatus.NOT_FOUND,
          'SESSION_NOT_FOUND',
          `Session '${sessionId}' not found or has expired`
        );
        return;
      }

      const response: RestApiResponse = {
        success: true,
        data: session,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: this.config.version
        }
      };

      await this.sendJsonResponse(res, HttpStatus.OK, response);

      this.logger.info('Session retrieved successfully', {
        requestId,
        sessionId,
        toolName: session.data?.toolName || 'unknown'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Session retrieval failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        sessionId
      });

      await this.sendErrorResponse(
        res,
        requestId,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'SESSION_RETRIEVAL_ERROR',
        'Failed to retrieve session',
        { error: errorMessage }
      );
    }
  }

  /**
   * Set CORS headers
   */
  private setCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  /**
   * Send JSON response
   */
  private async sendJsonResponse(res: ServerResponse, status: HttpStatus, data: any): Promise<void> {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send error response
   */
  private async sendErrorResponse(
    res: ServerResponse, 
    requestId: string,
    status: HttpStatus, 
    code: string, 
    message: string,
    details?: any
  ): Promise<void> {
    const response: RestApiResponse = {
      success: false,
      error: {
        code,
        message,
        details
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: this.config.version
      }
    };

    await this.sendJsonResponse(res, status, response);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `rest_${Date.now()}_${++this.requestCounter}`;
  }

  /**
   * Check if the given path matches the REST API pattern
   */
  isApiRequest(pathname: string): boolean {
    return pathname.startsWith(`${this.config.basePath}/${this.config.version}`);
  }

  /**
   * Get API configuration
   */
  getConfig(): RestApiConfig {
    return { ...this.config };
  }

  /**
   * Get the route registry for OpenAPI generation and fixture validation
   * PRD #354: Exposes route registry for downstream consumers
   */
  getRouteRegistry(): RestRouteRegistry {
    return this.routeRegistry;
  }
}