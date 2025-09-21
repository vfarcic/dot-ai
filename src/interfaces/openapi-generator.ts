/**
 * OpenAPI 3.0 Specification Generator
 * 
 * Automatically generates OpenAPI 3.0 documentation from the tool registry.
 * Creates comprehensive API documentation with proper schemas and examples.
 */

import { RestToolRegistry, ToolInfo } from './rest-registry';
import { Logger } from '../core/error-handling';

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
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
    responses?: Record<string, any>;
    securitySchemes?: Record<string, any>;
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
  private registry: RestToolRegistry;
  private logger: Logger;
  private config: OpenApiConfig;
  private specCache?: OpenApiSpec;
  private lastCacheUpdate: number = 0;
  private cacheValidityMs: number = 60000; // 1 minute

  constructor(registry: RestToolRegistry, logger: Logger, config: Partial<OpenApiConfig> = {}) {
    this.registry = registry;
    this.logger = logger;
    this.config = {
      title: 'DevOps AI Toolkit REST API',
      description: 'REST API gateway for DevOps AI Toolkit MCP tools - provides HTTP access to all AI-powered DevOps automation capabilities',
      version: '1.0.0',
      basePath: '/api',
      apiVersion: 'v1',
      serverUrl: 'http://localhost:3456',
      ...config
    };
  }

  /**
   * Generate complete OpenAPI 3.0 specification
   */
  generateSpec(): OpenApiSpec {
    // Check cache validity
    const now = Date.now();
    if (this.specCache && (now - this.lastCacheUpdate) < this.cacheValidityMs) {
      this.logger.debug('Returning cached OpenAPI specification');
      return this.specCache;
    }

    this.logger.info('Generating OpenAPI 3.0 specification', {
      toolCount: this.registry.getToolCount(),
      cacheExpired: !this.specCache || (now - this.lastCacheUpdate) >= this.cacheValidityMs
    });

    const tools = this.registry.getAllTools();
    const categories = this.registry.getCategories();

    const spec: OpenApiSpec = {
      openapi: '3.0.0',
      info: this.generateInfo(),
      servers: this.generateServers(),
      paths: this.generatePaths(tools),
      components: this.generateComponents(tools),
      tags: this.generateTags(categories)
    };

    // Cache the generated spec
    this.specCache = spec;
    this.lastCacheUpdate = now;

    this.logger.info('OpenAPI specification generated successfully', {
      pathCount: Object.keys(spec.paths).length,
      componentCount: Object.keys(spec.components?.schemas || {}).length,
      tagCount: spec.tags?.length || 0
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
   * Generate paths for all endpoints
   */
  private generatePaths(tools: ToolInfo[]): Record<string, any> {
    const paths: Record<string, any> = {};
    const basePath = `${this.config.basePath}/${this.config.apiVersion}`;

    // Tool discovery endpoint
    paths[`${basePath}/tools`] = {
      get: {
        summary: 'Discover available tools',
        description: 'Get a list of all available tools with their schemas and metadata',
        tags: ['Tool Discovery'],
        parameters: [
          {
            name: 'category',
            in: 'query',
            description: 'Filter tools by category',
            required: false,
            schema: { type: 'string' }
          },
          {
            name: 'tag',
            in: 'query',
            description: 'Filter tools by tag',
            required: false,
            schema: { type: 'string' }
          },
          {
            name: 'search',
            in: 'query',
            description: 'Search tools by name or description',
            required: false,
            schema: { type: 'string' }
          }
        ],
        responses: {
          200: {
            description: 'List of available tools',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ToolDiscoveryResponse' }
              }
            }
          }
        }
      }
    };

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
                example: this.generateExampleForTool(tool)
              }
            }
          },
          responses: {
            200: {
              description: 'Tool execution result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ToolExecutionResponse' }
                }
              }
            },
            400: {
              description: 'Bad request - invalid parameters',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            },
            404: {
              description: 'Tool not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            },
            500: {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' }
                }
              }
            }
          }
        }
      };
    }

    // OpenAPI specification endpoint
    paths[`${basePath}/openapi`] = {
      get: {
        summary: 'Get OpenAPI specification',
        description: 'Returns the complete OpenAPI 3.0 specification for this API',
        tags: ['Documentation'],
        responses: {
          200: {
            description: 'OpenAPI specification',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'OpenAPI 3.0 specification'
                }
              }
            }
          }
        }
      }
    };

    return paths;
  }

  /**
   * Generate component schemas
   */
  private generateComponents(tools: ToolInfo[]): OpenApiSpec['components'] {
    const schemas: Record<string, any> = {};

    // Base response schemas
    schemas.RestApiResponse = {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the request was successful' },
        data: { type: 'object', description: 'Response data' },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Error code' },
            message: { type: 'string', description: 'Error message' },
            details: { type: 'object', description: 'Additional error details' }
          }
        },
        meta: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time', description: 'Response timestamp' },
            requestId: { type: 'string', description: 'Unique request identifier' },
            version: { type: 'string', description: 'API version' }
          }
        }
      },
      required: ['success']
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
                result: { type: 'object', description: 'Tool execution result' },
                tool: { type: 'string', description: 'Name of the executed tool' },
                executionTime: { type: 'number', description: 'Execution time in milliseconds' }
              }
            }
          }
        }
      ]
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
                  items: { $ref: '#/components/schemas/ToolInfo' }
                },
                total: { type: 'number', description: 'Total number of tools' },
                categories: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Available tool categories'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Available tool tags'
                }
              }
            }
          }
        }
      ]
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
          description: 'Tool tags'
        }
      },
      required: ['name', 'description', 'schema']
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
                details: { type: 'object' }
              },
              required: ['code', 'message']
            }
          },
          required: ['error']
        }
      ]
    };

    // Individual tool request schemas
    for (const tool of tools) {
      schemas[`${tool.name}Request`] = tool.schema;
    }

    return {
      schemas
    };
  }

  /**
   * Generate tags for grouping endpoints
   */
  private generateTags(categories: string[]): OpenApiSpec['tags'] {
    const tags: OpenApiSpec['tags'] = [
      {
        name: 'Tool Discovery',
        description: 'Endpoints for discovering available tools and their capabilities'
      },
      {
        name: 'Documentation',
        description: 'API documentation and specification endpoints'
      }
    ];

    // Add category-based tags
    for (const category of categories) {
      tags.push({
        name: category,
        description: `${category} tools and operations`
      });
    }

    // Add generic tools tag for uncategorized tools
    if (this.registry.getAllTools().some(tool => !tool.category)) {
      tags.push({
        name: 'Tools',
        description: 'General purpose tools and utilities'
      });
    }

    return tags;
  }

  /**
   * Generate example request body for a tool
   */
  private generateExampleForTool(tool: ToolInfo): any {
    const example: any = {};
    
    try {
      const schema = tool.schema;
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          example[propName] = this.generateExampleValue(propSchema as any, propName);
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
  private generateExampleValue(propSchema: any, propName: string): any {
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
        return [this.generateExampleValue(propSchema.items, 'item')];
      
      case 'object': {
        const objExample: any = {};
        if (propSchema.properties) {
          for (const [subPropName, subPropSchema] of Object.entries(propSchema.properties)) {
            objExample[subPropName] = this.generateExampleValue(subPropSchema as any, subPropName);
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