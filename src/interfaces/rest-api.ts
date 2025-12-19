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
import { Logger } from '../core/error-handling';
import { DotAI } from '../core/index';
import { handleResourceSync } from './resource-sync-handler';

/**
 * HTTP status codes for REST responses
 */
export enum HttpStatus {
  OK = 200,
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  INTERNAL_SERVER_ERROR = 500,
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
  private logger: Logger;
  private dotAI: DotAI;
  private config: RestApiConfig;
  private openApiGenerator: OpenApiGenerator;
  private requestCounter: number = 0;

  constructor(
    registry: RestToolRegistry, 
    dotAI: DotAI,
    logger: Logger, 
    config: Partial<RestApiConfig> = {}
  ) {
    this.registry = registry;
    this.dotAI = dotAI;
    this.logger = logger;
    this.config = {
      basePath: '/api',
      version: 'v1',
      enableCors: true,
      requestTimeout: 1800000, // 30 minutes for long-running operations (capability scan with slower AI providers)
      ...config
    };
    
    // Initialize OpenAPI generator
    this.openApiGenerator = new OpenApiGenerator(registry, logger, {
      basePath: this.config.basePath,
      apiVersion: this.config.version
    });
  }

  /**
   * Handle incoming HTTP requests for REST API
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

      // Parse URL and route
      const url = new URL(req.url || '/', 'http://localhost');
      const pathMatch = this.parseApiPath(url.pathname);

      if (!pathMatch) {
        await this.sendErrorResponse(res, requestId, HttpStatus.NOT_FOUND, 'NOT_FOUND', 'API endpoint not found');
        return;
      }

      // Route to appropriate handler
      switch (pathMatch.endpoint) {
        case 'tools':
          if (req.method === 'GET') {
            await this.handleToolDiscovery(req, res, requestId, url.searchParams);
          } else {
            await this.sendErrorResponse(res, requestId, HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED', 'Only GET method allowed for tool discovery');
          }
          break;

        case 'tool':
          if (req.method === 'POST' && pathMatch.toolName) {
            await this.handleToolExecution(req, res, requestId, pathMatch.toolName, body, startTime);
          } else if (req.method !== 'POST') {
            await this.sendErrorResponse(res, requestId, HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED', 'Only POST method allowed for tool execution');
          } else {
            await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Tool name is required');
          }
          break;

        case 'openapi':
          if (req.method === 'GET') {
            await this.handleOpenApiSpec(req, res, requestId);
          } else {
            await this.sendErrorResponse(res, requestId, HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED', 'Only GET method allowed for OpenAPI specification');
          }
          break;

        case 'resources':
          if (req.method === 'POST' && pathMatch.action === 'sync') {
            await this.handleResourceSyncRequest(req, res, requestId, body);
          } else if (req.method !== 'POST') {
            await this.sendErrorResponse(res, requestId, HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED', 'Only POST method allowed for resource sync');
          } else {
            await this.sendErrorResponse(res, requestId, HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Unknown resources endpoint');
          }
          break;

        default:
          await this.sendErrorResponse(res, requestId, HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Unknown API endpoint');
      }

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
   * Parse API path and extract route information
   */
  private parseApiPath(pathname: string): { endpoint: string; toolName?: string; action?: string } | null {
    // Expected patterns:
    // /api/v1/tools -> tools discovery
    // /api/v1/tools/{toolName} -> tool execution
    // /api/v1/openapi -> OpenAPI spec
    // /api/v1/resources/sync -> resource sync from controller

    const basePath = `${this.config.basePath}/${this.config.version}`;

    if (!pathname.startsWith(basePath)) {
      return null;
    }

    const pathSuffix = pathname.substring(basePath.length);

    // Remove leading slash
    const cleanPath = pathSuffix.startsWith('/') ? pathSuffix.substring(1) : pathSuffix;

    if (cleanPath === 'tools') {
      return { endpoint: 'tools' };
    }

    if (cleanPath === 'openapi') {
      return { endpoint: 'openapi' };
    }

    if (cleanPath.startsWith('tools/')) {
      const toolName = cleanPath.substring(6); // Remove 'tools/'
      if (toolName) {
        return { endpoint: 'tool', toolName };
      }
    }

    // Handle resources/sync endpoint
    if (cleanPath === 'resources/sync') {
      return { endpoint: 'resources', action: 'sync' };
    }

    return null;
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
      const timeoutMs = this.config.requestTimeout;
      const toolPromise = toolMetadata.handler(body, this.dotAI, this.logger, requestId);
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
      this.logger.error('Tool execution failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        toolName,
        errorMessage: error instanceof Error ? error.message : String(error)
      });

      await this.sendErrorResponse(res, requestId, HttpStatus.INTERNAL_SERVER_ERROR, 'EXECUTION_ERROR', 'Tool execution failed');
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
}