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
import { handlePromptsListRequest, handlePromptsGetRequest } from '../tools/prompts';
import { GenericSessionManager } from '../core/generic-session-manager';
import { QuerySessionData } from '../tools/query';
import { loadPrompt } from '../core/shared-prompt-loader';
import { createAIProvider } from '../core/ai-provider-factory';
import { CAPABILITY_TOOLS, executeCapabilityTools } from '../core/capability-tools';
import { RESOURCE_TOOLS, executeResourceTools } from '../core/resource-tools';
import {
  KUBECTL_API_RESOURCES_TOOL,
  KUBECTL_GET_TOOL,
  KUBECTL_DESCRIBE_TOOL,
  KUBECTL_LOGS_TOOL,
  KUBECTL_EVENTS_TOOL,
  KUBECTL_GET_CRD_SCHEMA_TOOL,
  executeKubectlTools
} from '../core/kubectl-tools';

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
 * Visualization types supported by the API
 */
export type VisualizationType = 'mermaid' | 'cards' | 'code' | 'table';

/**
 * Individual visualization item
 */
export interface Visualization {
  id: string;
  label: string;
  type: VisualizationType;
  content: string | { language: string; code: string } | { headers: string[]; rows: string[][] } | Array<{ id: string; title: string; description?: string; tags?: string[] }>;
}

/**
 * Visualization endpoint response format
 */
export interface VisualizationResponse {
  title: string;
  visualizations: Visualization[];
  insights: string[];
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

        case 'prompts':
          if (req.method === 'GET') {
            await this.handlePromptsListRequest(req, res, requestId);
          } else {
            await this.sendErrorResponse(res, requestId, HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED', 'Only GET method allowed for prompts list');
          }
          break;

        case 'prompt':
          if (req.method === 'POST' && pathMatch.promptName) {
            await this.handlePromptsGetRequest(req, res, requestId, pathMatch.promptName, body);
          } else if (req.method !== 'POST') {
            await this.sendErrorResponse(res, requestId, HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED', 'Only POST method allowed for prompt get');
          } else {
            await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Prompt name is required');
          }
          break;

        case 'visualize':
          if (req.method === 'GET' && pathMatch.sessionId) {
            await this.handleVisualize(req, res, requestId, pathMatch.sessionId);
          } else if (req.method !== 'GET') {
            await this.sendErrorResponse(res, requestId, HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED', 'Only GET method allowed for visualization');
          } else {
            await this.sendErrorResponse(res, requestId, HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Session ID is required');
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
  private parseApiPath(pathname: string): { endpoint: string; toolName?: string; action?: string; promptName?: string; sessionId?: string } | null {
    // Expected patterns:
    // /api/v1/tools -> tools discovery
    // /api/v1/tools/{toolName} -> tool execution
    // /api/v1/openapi -> OpenAPI spec
    // /api/v1/resources/sync -> resource sync from controller
    // /api/v1/prompts -> prompts list
    // /api/v1/prompts/{promptName} -> prompt get

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

    // Handle prompts endpoints
    if (cleanPath === 'prompts') {
      return { endpoint: 'prompts' };
    }

    if (cleanPath.startsWith('prompts/')) {
      const promptName = cleanPath.substring(8); // Remove 'prompts/'
      if (promptName) {
        return { endpoint: 'prompt', promptName };
      }
    }

    // Handle visualize endpoint (PRD #317)
    if (cleanPath.startsWith('visualize/')) {
      const sessionId = cleanPath.substring(10); // Remove 'visualize/'
      if (sessionId) {
        return { endpoint: 'visualize', sessionId };
      }
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
   */
  private async handleVisualize(
    req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    sessionId: string
  ): Promise<void> {
    try {
      this.logger.info('Processing visualization request', { requestId, sessionId });

      // Load session data using GenericSessionManager with 'qry' prefix (matches query tool)
      const sessionManager = new GenericSessionManager<QuerySessionData>('qry');
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

      // Check for cached visualization - return immediately if available
      if (session.data.cachedVisualization) {
        this.logger.info('Returning cached visualization', {
          requestId,
          sessionId,
          generatedAt: session.data.cachedVisualization.generatedAt
        });

        const cachedResponse: RestApiResponse = {
          success: true,
          data: {
            title: session.data.cachedVisualization.title,
            visualizations: session.data.cachedVisualization.visualizations,
            insights: session.data.cachedVisualization.insights
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

      // Load system prompt with session context
      const systemPrompt = loadPrompt('visualize-query', {
        intent: session.data.intent,
        toolCallsData: JSON.stringify(session.data.toolCallsExecuted, null, 2)
      });

      // Tool executor - same as query tool
      const executeVisualizationTools = async (toolName: string, input: any): Promise<any> => {
        if (toolName.startsWith('search_capabilities') || toolName.startsWith('query_capabilities')) {
          return executeCapabilityTools(toolName, input);
        }
        if (toolName.startsWith('search_resources') || toolName.startsWith('query_resources')) {
          return executeResourceTools(toolName, input);
        }
        if (toolName.startsWith('kubectl_')) {
          return executeKubectlTools(toolName, input);
        }
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          message: `Tool '${toolName}' is not implemented in visualization`
        };
      };

      // Read-only kubectl tools for gathering additional data
      const KUBECTL_READONLY_TOOLS = [
        KUBECTL_API_RESOURCES_TOOL,
        KUBECTL_GET_TOOL,
        KUBECTL_DESCRIBE_TOOL,
        KUBECTL_LOGS_TOOL,
        KUBECTL_EVENTS_TOOL,
        KUBECTL_GET_CRD_SCHEMA_TOOL
      ];

      this.logger.info('Starting AI visualization generation with tools', { requestId, sessionId });

      // Execute tool loop - AI can gather additional data if needed
      const result = await aiProvider.toolLoop({
        systemPrompt,
        userMessage: 'Generate visualizations based on the query results provided. Use tools if you need additional information about any resources.',
        tools: [...CAPABILITY_TOOLS, ...RESOURCE_TOOLS, ...KUBECTL_READONLY_TOOLS],
        toolExecutor: executeVisualizationTools,
        maxIterations: 5,  // Limit iterations for visualization
        operation: 'visualize-query'
      });

      this.logger.info('AI visualization generation completed', {
        requestId,
        sessionId,
        iterations: result.iterations,
        toolsUsed: [...new Set(result.toolCallsExecuted.map(tc => tc.tool))]
      });

      // Parse AI response as JSON
      let visualizationResponse: VisualizationResponse;
      try {
        // Extract JSON from response - it may have text before/after the JSON block
        let jsonContent = result.finalMessage.trim();

        // Find JSON block in markdown code fence
        const jsonBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonBlockMatch) {
          jsonContent = jsonBlockMatch[1].trim();
        } else if (!jsonContent.startsWith('{')) {
          // Try to find raw JSON object if no code fence
          const jsonStart = jsonContent.indexOf('{');
          const jsonEnd = jsonContent.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
          }
        }

        const parsed = JSON.parse(jsonContent);

        // Validate required fields
        if (!parsed.title || !Array.isArray(parsed.visualizations) || !Array.isArray(parsed.insights)) {
          throw new Error('Invalid visualization response structure');
        }

        // Validate each visualization has required fields
        for (const viz of parsed.visualizations) {
          if (!viz.id || !viz.label || !viz.type || viz.content === undefined) {
            throw new Error(`Invalid visualization: missing required fields in ${JSON.stringify(viz)}`);
          }
          if (!['mermaid', 'cards', 'code', 'table'].includes(viz.type)) {
            throw new Error(`Invalid visualization type: ${viz.type}`);
          }
        }

        // Normalize insights to strings if they are objects
        const normalizedInsights = parsed.insights.map((insight: any) => {
          if (typeof insight === 'string') {
            return insight;
          }
          // Convert object insights to string format
          if (insight.title && insight.description) {
            const severity = insight.severity ? ` [${insight.severity}]` : '';
            return `${insight.title}${severity}: ${insight.description}`;
          }
          return String(insight);
        });

        visualizationResponse = {
          ...parsed,
          insights: normalizedInsights
        } as VisualizationResponse;
      } catch (parseError) {
        this.logger.error('Failed to parse AI visualization response', parseError instanceof Error ? parseError : new Error(String(parseError)), {
          requestId,
          sessionId,
          rawResponse: result.finalMessage.substring(0, 500)
        });

        // Fallback to basic visualization on parse error
        visualizationResponse = {
          title: `Query: ${session.data.intent}`,
          visualizations: [
            {
              id: 'raw-data',
              label: 'Query Results',
              type: 'code',
              content: {
                language: 'json',
                code: JSON.stringify(session.data.toolCallsExecuted, null, 2)
              }
            }
          ],
          insights: [
            'AI visualization generation failed - showing raw query results',
            `Query executed in ${session.data.iterations} iteration(s)`
          ]
        };
      }

      // Cache the visualization in the session for subsequent requests
      sessionManager.updateSession(sessionId, {
        cachedVisualization: {
          title: visualizationResponse.title,
          visualizations: visualizationResponse.visualizations,
          insights: visualizationResponse.insights,
          generatedAt: new Date().toISOString()
        }
      });

      this.logger.info('Visualization cached in session', { requestId, sessionId });

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
        sessionId,
        visualizationCount: visualizationResponse.visualizations.length,
        cached: true
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Visualization request failed', error instanceof Error ? error : new Error(String(error)), {
        requestId,
        sessionId
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