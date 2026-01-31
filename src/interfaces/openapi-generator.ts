/**
 * OpenAPI 3.0 Specification Generator
 *
 * Automatically generates OpenAPI 3.0 documentation from the tool registry
 * and REST route registry.
 *
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 * - Generates paths from RestRouteRegistry for all REST endpoints
 * - Converts Zod schemas to JSON Schema for complete API documentation
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { RestToolRegistry, ToolInfo } from './rest-registry';
import { RestRouteRegistry, RouteDefinition } from './rest-route-registry';
import { Logger } from '../core/error-handling';

/**
 * JSON Schema object type for OpenAPI schemas
 */
type JsonSchemaObject = {
  type?: string;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  required?: string[];
  description?: string;
  enum?: unknown[];
  [key: string]: unknown;
};

/**
 * OpenAPI path item structure
 */
type OpenApiPathItem = {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: unknown[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema: JsonSchemaObject }>;
  };
  responses?: Record<string, {
    description: string;
    content?: Record<string, { schema: JsonSchemaObject }>;
  }>;
  [key: string]: unknown;
};

/**
 * OpenAPI 3.0 specification structure
 */
export interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact?: {
      name: string;
      url: string;
      email: string;
    };
    license?: {
      name: string;
      url: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, Record<string, OpenApiPathItem>>;
  components?: {
    schemas?: Record<string, JsonSchemaObject>;
    responses?: Record<string, { description: string; content?: Record<string, { schema: JsonSchemaObject }> }>;
    securitySchemes?: Record<string, { type: string; scheme?: string; bearerFormat?: string; description?: string }>;
  };
  tags?: Array<{
    name: string;
    description: string;
  }>;
}

/**
 * OpenAPI generator configuration
 */
export interface OpenApiConfig {
  title: string;
  description: string;
  version: string;
  basePath: string;
  apiVersion: string;
  serverUrl?: string;
}

/**
 * OpenAPI 3.0 specification generator
 */
export class OpenApiGenerator {
  private toolRegistry: RestToolRegistry;
  private routeRegistry?: RestRouteRegistry;
  private logger: Logger;
  private config: OpenApiConfig;
  private specCache?: OpenApiSpec;
  private lastCacheUpdate: number = 0;
  private cacheValidityMs: number = 60000; // 1 minute
  private schemaCache: Map<string, JsonSchemaObject> = new Map();

  constructor(
    toolRegistry: RestToolRegistry,
    logger: Logger,
    config: Partial<OpenApiConfig> = {},
    routeRegistry?: RestRouteRegistry
  ) {
    this.toolRegistry = toolRegistry;
    this.routeRegistry = routeRegistry;
    this.logger = logger;
    this.config = {
      title: 'DevOps AI Toolkit REST API',
      description:
        'REST API gateway for DevOps AI Toolkit MCP tools - provides HTTP access to all AI-powered DevOps automation capabilities',
      version: '1.0.0',
      basePath: '/api',
      apiVersion: 'v1',
      serverUrl: 'http://localhost:3456',
      ...config,
    };
  }

  /**
   * Generate complete OpenAPI 3.0 specification
   */
  generateSpec(): OpenApiSpec {
    // Check cache validity
    const now = Date.now();
    if (this.specCache && now - this.lastCacheUpdate < this.cacheValidityMs) {
      this.logger.debug('Returning cached OpenAPI specification');
      return this.specCache;
    }

    this.logger.info('Generating OpenAPI 3.0 specification', {
      toolCount: this.toolRegistry.getToolCount(),
      routeCount: this.routeRegistry?.getRouteCount() ?? 0,
      cacheExpired:
        !this.specCache || now - this.lastCacheUpdate >= this.cacheValidityMs,
    });

    const tools = this.toolRegistry.getAllTools();
    const categories = this.toolRegistry.getCategories();

    // Generate paths from tool registry (MCP tools)
    const toolPaths = this.generateToolPaths(tools);

    // Generate paths from route registry (REST endpoints) - PRD #354
    const routePaths = this.routeRegistry
      ? this.generateRoutePaths()
      : {};

    // Generate component schemas
    const toolSchemas = this.generateToolSchemas(tools);
    const routeSchemas = this.routeRegistry
      ? this.generateRouteSchemas()
      : {};

    const spec: OpenApiSpec = {
      openapi: '3.0.0',
      info: this.generateInfo(),
      servers: this.generateServers(),
      paths: {
        ...this.generateBasePaths(),
        ...toolPaths,
        ...routePaths,
      } as Record<string, Record<string, OpenApiPathItem>>,
      components: {
        schemas: {
          ...this.generateBaseSchemas(),
          ...toolSchemas,
          ...routeSchemas,
        } as Record<string, JsonSchemaObject>,
      },
      tags: this.generateTags(categories),
    };

    // Cache the generated spec
    this.specCache = spec;
    this.lastCacheUpdate = now;

    this.logger.info('OpenAPI specification generated successfully', {
      pathCount: Object.keys(spec.paths).length,
      componentCount: Object.keys(spec.components?.schemas || {}).length,
      tagCount: spec.tags?.length || 0,
    });

    return spec;
  }

  /**
   * Generate API info section
   */
  private generateInfo(): OpenApiSpec['info'] {
    const info: OpenApiSpec['info'] = {
      title: this.config.title,
      description: this.config.description,
      version: this.config.version,
      contact: {
        name: 'Viktor Farcic',
        url: 'https://devopstoolkit.live/',
        email: 'viktor@farcic.com'
      },
      license: {
        name: 'MIT',
        url: 'https://github.com/vfarcic/dot-ai/blob/main/LICENSE'
      }
    };

    return info;
  }

  /**
   * Generate server definitions
   */
  private generateServers(): OpenApiSpec['servers'] {
    return [
      {
        url: this.config.serverUrl || 'http://localhost:3456',
        description: 'DevOps AI Toolkit MCP Server'
      }
    ];
  }

  /**
   * Generate base paths (MCP Protocol endpoints)
   */
  private generateBasePaths(): Record<string, unknown> {
    const paths: Record<string, unknown> = {};

    // MCP Protocol Endpoints
    paths['/'] = {
      get: {
        summary: 'Open MCP SSE stream',
        description:
          'Opens a Server-Sent Events (SSE) stream for Model Context Protocol communication. This endpoint allows the server to push messages to the client without the client first sending data.',
        tags: ['MCP Protocol'],
        parameters: [],
        responses: {
          200: {
            description: 'SSE stream opened successfully',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  description: 'Server-Sent Events stream',
                },
              },
            },
          },
          405: {
            description: 'Method not allowed - server does not support SSE',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
      post: {
        summary: 'Send MCP JSON-RPC message',
        description:
          'Send a JSON-RPC message using Model Context Protocol. Used for tool calls, initialization, and other MCP operations. The server may respond with either a JSON object or open an SSE stream.',
        tags: ['MCP Protocol'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/McpJsonRpcRequest' },
              examples: {
                initialize: {
                  summary: 'Initialize MCP session',
                  value: {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                      protocolVersion: '2024-11-05',
                      capabilities: {},
                      clientInfo: {
                        name: 'example-client',
                        version: '1.0.0',
                      },
                    },
                  },
                },
                toolCall: {
                  summary: 'Call a tool',
                  value: {
                    jsonrpc: '2.0',
                    id: 2,
                    method: 'tools/call',
                    params: {
                      name: 'version',
                      arguments: {},
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'JSON-RPC response or SSE stream',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/McpJsonRpcResponse' },
              },
              'text/event-stream': {
                schema: {
                  type: 'string',
                  description:
                    'Server-Sent Events stream with JSON-RPC messages',
                },
              },
            },
          },
          400: {
            description: 'Bad request - invalid JSON-RPC message',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/McpJsonRpcError' },
              },
            },
          },
        },
      },
    };

    return paths;
  }

  /**
   * Generate paths for MCP tool endpoints
   */
  private generateToolPaths(tools: ToolInfo[]): Record<string, unknown> {
    const paths: Record<string, unknown> = {};
    const basePath = `${this.config.basePath}/${this.config.apiVersion}`;

    // Individual tool execution endpoints
    for (const tool of tools) {
      paths[`${basePath}/tools/${tool.name}`] = {
        post: {
          summary: `Execute ${tool.name} tool`,
          description: tool.description,
          tags: [tool.category || 'Tools'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${tool.name}Request` },
                example: this.generateExampleForTool(tool),
              },
            },
          },
          responses: {
            200: {
              description: 'Tool execution result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ToolExecutionResponse' },
                },
              },
            },
            400: {
              description: 'Bad request - invalid parameters',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            404: {
              description: 'Tool not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            500: {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      };
    }

    return paths;
  }

  /**
   * Generate paths from REST route registry
   * PRD #354: Auto-generates OpenAPI paths from registered routes
   */
  private generateRoutePaths(): Record<string, unknown> {
    if (!this.routeRegistry) {
      return {};
    }

    const paths: Record<string, unknown> = {};
    const routes = this.routeRegistry.getAllRoutes();

    for (const route of routes) {
      const openApiPath = this.convertPathToOpenApi(route.path);
      const method = route.method.toLowerCase();

      // Initialize path object if not exists
      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }

      (paths[openApiPath] as Record<string, OpenApiPathItem>)[method] = this.routeToOpenApiOperation(route);
    }

    return paths;
  }

  /**
   * Convert Express-style path to OpenAPI path format
   * Example: "/api/v1/visualize/:sessionId" -> "/api/v1/visualize/{sessionId}"
   */
  private convertPathToOpenApi(path: string): string {
    return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
  }

  /**
   * Convert a route definition to an OpenAPI operation object
   */
  private routeToOpenApiOperation(
    route: RouteDefinition<unknown, unknown, unknown, unknown>
  ): OpenApiPathItem {
    const operation: OpenApiPathItem = {
      summary: route.description,
      description: route.description,
      tags: route.tags,
      responses: {},
    };

    // Add path parameters
    const pathParams = this.extractPathParams(route.path);
    if (pathParams.length > 0 || route.query) {
      operation.parameters = [];

      // Add path parameters
      for (const paramName of pathParams) {
        const paramSchema = this.getParamSchemaFromRoute(route, paramName);
        operation.parameters.push({
          name: paramName,
          in: 'path',
          required: true,
          description: paramSchema?.description || `${paramName} parameter`,
          schema: paramSchema || { type: 'string' },
        });
      }

      // Add query parameters from Zod schema
      if (route.query) {
        const queryParams = this.zodSchemaToParameters(route.query, 'query');
        operation.parameters.push(...queryParams);
      }
    }

    // Add request body for POST/PUT/DELETE with body schema
    if (route.body && ['POST', 'PUT', 'DELETE'].includes(route.method)) {
      const schemaName = this.getSchemaName(route, 'Request');
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${schemaName}` },
          },
        },
      };
    }

    // Add success response
    const responseSchemaName = this.getSchemaName(route, 'Response');
    operation.responses!['200'] = {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${responseSchemaName}` },
        },
      },
    };

    // Add error responses
    if (route.errorResponses) {
      for (const statusCode of Object.keys(route.errorResponses)) {
        const errorSchemaName = this.getSchemaName(
          route,
          `Error${statusCode}`
        );
        operation.responses![statusCode] = {
          description: this.getErrorDescription(Number(statusCode)),
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${errorSchemaName}` },
            },
          },
        };
      }
    }

    return operation;
  }

  /**
   * Extract path parameter names from a route path
   */
  private extractPathParams(path: string): string[] {
    const params: string[] = [];
    const regex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;
    while ((match = regex.exec(path)) !== null) {
      params.push(match[1]);
    }
    return params;
  }

  /**
   * Get parameter schema from route's params Zod schema
   */
  private getParamSchemaFromRoute(
    route: RouteDefinition<unknown, unknown, unknown, unknown>,
    paramName: string
  ): JsonSchemaObject {
    if (!route.params) {
      return { type: 'string' };
    }

    try {
      const jsonSchema = this.zodSchemaToJsonSchema(route.params);
      return jsonSchema.properties?.[paramName] || { type: 'string' };
    } catch {
      return { type: 'string' };
    }
  }

  /**
   * Convert Zod schema to OpenAPI parameters array
   */
  private zodSchemaToParameters(
    schema: z.ZodSchema<unknown>,
    location: 'query' | 'path'
  ): Array<{ name: string; in: string; required: boolean; description: string; schema: JsonSchemaObject }> {
    const parameters: Array<{ name: string; in: string; required: boolean; description: string; schema: JsonSchemaObject }> = [];

    try {
      const jsonSchema = this.zodSchemaToJsonSchema(schema);
      const properties = jsonSchema.properties || {};
      const required = jsonSchema.required || [];

      for (const [name, propSchema] of Object.entries(properties)) {
        const propObj = propSchema as JsonSchemaObject;
        parameters.push({
          name,
          in: location,
          required: required.includes(name),
          description: propObj.description || `${name} parameter`,
          schema: propObj,
        });
      }
    } catch (error) {
      this.logger.warn('Failed to convert Zod schema to parameters', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return parameters;
  }

  /**
   * Generate unique schema name for a route
   */
  private getSchemaName(
    route: RouteDefinition<unknown, unknown, unknown, unknown>,
    suffix: string
  ): string {
    // Convert path to PascalCase name
    // e.g., "/api/v1/visualize/:sessionId" -> "VisualizeSessionId"
    const pathParts = route.path
      .replace(/^\/api\/v\d+\//, '') // Remove /api/v1/ prefix
      .split('/')
      .filter((part) => part.length > 0)
      .map((part) => {
        // Remove : prefix for params and capitalize
        const cleaned = part.replace(/^:/, '');
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      });

    const baseName = pathParts.join('');
    return `${baseName}${route.method.charAt(0)}${route.method.slice(1).toLowerCase()}${suffix}`;
  }

  /**
   * Get human-readable error description for status code
   */
  private getErrorDescription(statusCode: number): string {
    const descriptions: Record<number, string> = {
      400: 'Bad request - invalid parameters',
      401: 'Unauthorized - authentication required',
      403: 'Forbidden - insufficient permissions',
      404: 'Not found',
      405: 'Method not allowed',
      409: 'Conflict',
      422: 'Unprocessable entity',
      500: 'Internal server error',
      502: 'Bad gateway',
      503: 'Service unavailable',
    };
    return descriptions[statusCode] || `Error ${statusCode}`;
  }

  /**
   * Convert Zod schema to JSON Schema with caching
   */
  private zodSchemaToJsonSchema(schema: z.ZodSchema<unknown>): JsonSchemaObject {
    const cacheKey = JSON.stringify(schema);
    if (this.schemaCache.has(cacheKey)) {
      return this.schemaCache.get(cacheKey)!;
    }

    try {
      // The zodToJsonSchema function accepts ZodSchema but TypeScript needs a cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod type compatibility workaround
      const jsonSchema = zodToJsonSchema(schema as any, {
        target: 'openApi3',
        $refStrategy: 'none', // Inline all schemas
      }) as JsonSchemaObject;

      // Remove $schema property if present (not valid in OpenAPI component schemas)
      const result = { ...jsonSchema };
      delete result.$schema;

      this.schemaCache.set(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.warn('Failed to convert Zod schema to JSON Schema', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { type: 'object' };
    }
  }

  /**
   * Generate base component schemas (shared across all endpoints)
   */
  private generateBaseSchemas(): Record<string, unknown> {
    const schemas: Record<string, unknown> = {};

    // Base response schemas
    schemas.RestApiResponse = {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the request was successful',
        },
        data: { type: 'object', description: 'Response data' },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Error code' },
            message: { type: 'string', description: 'Error message' },
            details: { type: 'object', description: 'Additional error details' },
          },
        },
        meta: {
          type: 'object',
          properties: {
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Response timestamp',
            },
            requestId: {
              type: 'string',
              description: 'Unique request identifier',
            },
            version: { type: 'string', description: 'API version' },
          },
        },
      },
      required: ['success'],
    };

    schemas.ToolExecutionResponse = {
      allOf: [
        { $ref: '#/components/schemas/RestApiResponse' },
        {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                result: {
                  type: 'object',
                  description: 'Tool execution result',
                },
                tool: {
                  type: 'string',
                  description: 'Name of the executed tool',
                },
                executionTime: {
                  type: 'number',
                  description: 'Execution time in milliseconds',
                },
              },
            },
          },
        },
      ],
    };

    schemas.ToolDiscoveryResponse = {
      allOf: [
        { $ref: '#/components/schemas/RestApiResponse' },
        {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                tools: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ToolInfo' },
                },
                total: {
                  type: 'number',
                  description: 'Total number of tools',
                },
                categories: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Available tool categories',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Available tool tags',
                },
              },
            },
          },
        },
      ],
    };

    schemas.ToolInfo = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tool name' },
        description: { type: 'string', description: 'Tool description' },
        schema: { type: 'object', description: 'Tool input schema' },
        category: { type: 'string', description: 'Tool category' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tool tags',
        },
      },
      required: ['name', 'description', 'schema'],
    };

    schemas.ErrorResponse = {
      allOf: [
        { $ref: '#/components/schemas/RestApiResponse' },
        {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [false] },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
              required: ['code', 'message'],
            },
          },
          required: ['error'],
        },
      ],
    };

    // MCP JSON-RPC schemas
    schemas.McpJsonRpcRequest = {
      type: 'object',
      description: 'JSON-RPC 2.0 request message for MCP protocol',
      properties: {
        jsonrpc: {
          type: 'string',
          enum: ['2.0'],
          description: 'JSON-RPC version',
        },
        id: {
          type: ['number', 'string', 'null'],
          description: 'Request identifier',
        },
        method: {
          type: 'string',
          description:
            'Method name (e.g., initialize, tools/call, tools/list)',
        },
        params: { type: 'object', description: 'Method parameters' },
      },
      required: ['jsonrpc', 'method'],
    };

    schemas.McpJsonRpcResponse = {
      type: 'object',
      description: 'JSON-RPC 2.0 response message',
      properties: {
        jsonrpc: {
          type: 'string',
          enum: ['2.0'],
          description: 'JSON-RPC version',
        },
        id: {
          type: ['number', 'string', 'null'],
          description: 'Request identifier',
        },
        result: { type: 'object', description: 'Method result' },
        error: {
          type: 'object',
          properties: {
            code: { type: 'number', description: 'Error code' },
            message: { type: 'string', description: 'Error message' },
            data: { type: 'object', description: 'Additional error data' },
          },
        },
      },
      required: ['jsonrpc', 'id'],
    };

    schemas.McpJsonRpcError = {
      type: 'object',
      description: 'JSON-RPC 2.0 error response',
      properties: {
        jsonrpc: {
          type: 'string',
          enum: ['2.0'],
          description: 'JSON-RPC version',
        },
        id: {
          type: ['number', 'string', 'null'],
          description: 'Request identifier',
        },
        error: {
          type: 'object',
          properties: {
            code: { type: 'number', description: 'Error code' },
            message: { type: 'string', description: 'Error message' },
            data: { type: 'object', description: 'Additional error data' },
          },
          required: ['code', 'message'],
        },
      },
      required: ['jsonrpc', 'id', 'error'],
    };

    return schemas;
  }

  /**
   * Generate schemas for MCP tool endpoints
   */
  private generateToolSchemas(tools: ToolInfo[]): Record<string, unknown> {
    const schemas: Record<string, unknown> = {};

    // Individual tool request schemas
    for (const tool of tools) {
      schemas[`${tool.name}Request`] = tool.schema;
    }

    return schemas;
  }

  /**
   * Generate schemas from REST route registry
   * PRD #354: Auto-generates OpenAPI schemas from route Zod schemas
   */
  private generateRouteSchemas(): Record<string, unknown> {
    if (!this.routeRegistry) {
      return {};
    }

    const schemas: Record<string, unknown> = {};
    const routes = this.routeRegistry.getAllRoutes();

    for (const route of routes) {
      // Add response schema
      const responseSchemaName = this.getSchemaName(route, 'Response');
      schemas[responseSchemaName] = this.zodSchemaToJsonSchema(route.response);

      // Add request body schema if present
      if (route.body) {
        const requestSchemaName = this.getSchemaName(route, 'Request');
        schemas[requestSchemaName] = this.zodSchemaToJsonSchema(route.body);
      }

      // Add error response schemas
      if (route.errorResponses) {
        for (const [statusCode, errorSchema] of Object.entries(
          route.errorResponses
        )) {
          const errorSchemaName = this.getSchemaName(
            route,
            `Error${statusCode}`
          );
          schemas[errorSchemaName] = this.zodSchemaToJsonSchema(errorSchema);
        }
      }
    }

    return schemas;
  }

  /**
   * Generate tags for grouping endpoints
   */
  private generateTags(categories: string[]): OpenApiSpec['tags'] {
    const tags: OpenApiSpec['tags'] = [
      {
        name: 'MCP Protocol',
        description:
          'Model Context Protocol endpoints for AI assistant integration via JSON-RPC and Server-Sent Events',
      },
      {
        name: 'Tool Discovery',
        description:
          'Endpoints for discovering available tools and their capabilities',
      },
      {
        name: 'Documentation',
        description: 'API documentation and specification endpoints',
      },
    ];

    // Track tag names to avoid duplicates
    const tagNames = new Set(tags.map((t) => t.name));

    // Add category-based tags from tool registry
    for (const category of categories) {
      if (!tagNames.has(category)) {
        tags.push({
          name: category,
          description: `${category} tools and operations`,
        });
        tagNames.add(category);
      }
    }

    // Add generic tools tag for uncategorized tools
    if (this.toolRegistry.getAllTools().some((tool) => !tool.category)) {
      if (!tagNames.has('Tools')) {
        tags.push({
          name: 'Tools',
          description: 'General purpose tools and utilities',
        });
        tagNames.add('Tools');
      }
    }

    // PRD #354: Add tags from route registry
    if (this.routeRegistry) {
      const routeTags = this.routeRegistry.getTags();
      for (const routeTag of routeTags) {
        if (!tagNames.has(routeTag)) {
          tags.push({
            name: routeTag,
            description: `${routeTag} endpoints`,
          });
          tagNames.add(routeTag);
        }
      }
    }

    return tags;
  }

  /**
   * Generate example request body for a tool
   */
  private generateExampleForTool(tool: ToolInfo): Record<string, unknown> {
    const example: Record<string, unknown> = {};

    try {
      const schema = tool.schema;
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          example[propName] = this.generateExampleValue(propSchema as JsonSchemaObject, propName);
        }
      }
    } catch (error) {
      this.logger.warn('Failed to generate example for tool', {
        toolName: tool.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return example;
  }

  /**
   * Generate example value for a property schema
   */
  private generateExampleValue(propSchema: JsonSchemaObject, propName: string): unknown {
    if (propSchema.example !== undefined) {
      return propSchema.example;
    }

    switch (propSchema.type) {
      case 'string':
        if (propSchema.enum) {
          return propSchema.enum[0];
        }
        if (propName.toLowerCase().includes('email')) {
          return 'user@example.com';
        }
        if (propName.toLowerCase().includes('url')) {
          return 'https://example.com';
        }
        if (propName.toLowerCase().includes('name')) {
          return `example ${propName}`;
        }
        if (propName.toLowerCase().includes('intent')) {
          return 'deploy web application with PostgreSQL database';
        }
        return `example ${propName}`;

      case 'number':
      case 'integer':
        if (propName.toLowerCase().includes('port')) {
          return 8080;
        }
        if (propName.toLowerCase().includes('timeout')) {
          return 30;
        }
        return 42;

      case 'boolean':
        return false;

      case 'array':
        return [this.generateExampleValue(propSchema.items as JsonSchemaObject, 'item')];

      case 'object': {
        const objExample: Record<string, unknown> = {};
        if (propSchema.properties) {
          for (const [subPropName, subPropSchema] of Object.entries(propSchema.properties)) {
            objExample[subPropName] = this.generateExampleValue(subPropSchema as JsonSchemaObject, subPropName);
          }
        }
        return objExample;
      }

      default:
        return `example ${propName}`;
    }
  }

  /**
   * Invalidate the specification cache
   */
  invalidateCache(): void {
    this.specCache = undefined;
    this.lastCacheUpdate = 0;
    this.logger.debug('OpenAPI specification cache invalidated');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OpenApiConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.invalidateCache();
    this.logger.info('OpenAPI generator configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): OpenApiConfig {
    return { ...this.config };
  }
}