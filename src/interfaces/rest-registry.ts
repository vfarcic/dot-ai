/**
 * REST API Tool Registry
 *
 * Central registry for all MCP tools exposed via REST API.
 * Manages tool metadata, schema conversion, and tool discovery capabilities.
 */

import { z } from 'zod';
import { Logger } from '../core/error-handling';

/**
 * Tool metadata stored in the registry
 */
export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodSchema>;
  handler: (...args: unknown[]) => Promise<unknown>;
  category?: string;
  tags?: string[];
}

/**
 * JSON Schema representation converted from Zod
 */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  description?: string;
  $ref?: string;
  definitions?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Tool information exposed via discovery endpoint
 */
export interface ToolInfo {
  name: string;
  description: string;
  schema: JsonSchema;
  category?: string;
  tags?: string[];
}

/**
 * Registry for managing all tools available via REST API
 */
export class RestToolRegistry {
  private tools: Map<string, ToolMetadata> = new Map();
  private logger: Logger;
  private schemaCache: Map<string, JsonSchema> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a tool in the registry
   */
  registerTool(metadata: ToolMetadata): void {
    this.tools.set(metadata.name, metadata);
    // Clear schema cache for this tool
    this.schemaCache.delete(metadata.name);

    this.logger.debug('Tool registered in REST registry', {
      name: metadata.name,
      description: metadata.description,
      category: metadata.category,
      tags: metadata.tags,
    });
  }

  /**
   * Get tool metadata by name
   */
  getTool(name: string): ToolMetadata | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys()).sort();
  }

  /**
   * Get all tools with their discovery information
   */
  getAllTools(): ToolInfo[] {
    return this.getToolNames().map(name => {
      const tool = this.tools.get(name)!;
      return {
        name: tool.name,
        description: tool.description,
        schema: this.convertZodSchemaToJsonSchema(tool.name, tool.inputSchema),
        category: tool.category,
        tags: tool.tags,
      };
    });
  }

  /**
   * Check if a tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
    this.schemaCache.clear();
    this.logger.debug('REST tool registry cleared');
  }

  /**
   * Convert Zod schema to JSON Schema using Zod v4 native toJSONSchema
   */
  private convertZodSchemaToJsonSchema(
    toolName: string,
    zodSchemas: Record<string, z.ZodSchema>
  ): JsonSchema {
    const cached = this.schemaCache.get(toolName);
    if (cached) {
      return cached;
    }

    try {
      const zodObjectSchema = z.object(zodSchemas);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JsonSchema index signature
      const result = z.toJSONSchema(zodObjectSchema) as any as JsonSchema;

      // Remove $schema and additionalProperties (not valid in OpenAPI component schemas)
      delete result.$schema;
      delete result.additionalProperties;

      this.schemaCache.set(toolName, result);

      this.logger.debug('Converted Zod schema to JSON Schema', {
        toolName,
        schemaKeys: Object.keys(zodSchemas),
        resultType: result.type,
      });

      return result;
    } catch (error) {
      this.logger.error(
        'Failed to convert Zod schema to JSON Schema',
        error instanceof Error ? error : new Error(String(error)),
        {
          toolName,
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      );

      const fallbackSchema: JsonSchema = {
        type: 'object',
        description: `Schema conversion failed for ${toolName} - using fallback`,
        properties: {},
        additionalProperties: true,
      };

      return fallbackSchema;
    }
  }

  /**
   * Get tool discovery information with filtering
   */
  getToolsFiltered(
    options: {
      category?: string;
      tag?: string;
      search?: string;
    } = {}
  ): ToolInfo[] {
    let tools = this.getAllTools();

    if (options.category) {
      tools = tools.filter(tool => tool.category === options.category);
    }

    if (options.tag) {
      tools = tools.filter(tool => tool.tags?.includes(options.tag!));
    }

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      tools = tools.filter(
        tool =>
          tool.name.toLowerCase().includes(searchLower) ||
          tool.description.toLowerCase().includes(searchLower)
      );
    }

    return tools;
  }

  /**
   * Get all unique categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const tool of this.tools.values()) {
      if (tool.category) {
        categories.add(tool.category);
      }
    }
    return Array.from(categories).sort();
  }

  /**
   * Get all unique tags
   */
  getTags(): string[] {
    const tags = new Set<string>();
    for (const tool of this.tools.values()) {
      if (tool.tags) {
        tool.tags.forEach(tag => tags.add(tag));
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalTools: number;
    categories: string[];
    tags: string[];
    cacheSize: number;
  } {
    return {
      totalTools: this.tools.size,
      categories: this.getCategories(),
      tags: this.getTags(),
      cacheSize: this.schemaCache.size,
    };
  }
}
