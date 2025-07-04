/**
 * Dynamic Tool Registration System for MCP Server
 * 
 * Provides a flexible system for registering and managing MCP tools
 * without hardcoding them in the server implementation.
 */

// Use the existing JSONSchema from validation module
import { JSONSchema } from './validation';
import { Logger } from './error-handling';

/**
 * Complete tool metadata for MCP registration
 */
export interface ToolDefinition {
  name: string;
  description: string; // Concise user-facing description
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  version?: string;
  category?: string;
  tags?: string[];
  instructions?: string; // Detailed agent instructions (not shown to users)
}

/**
 * Context provided to tool handlers
 */
export interface ToolContext {
  requestId: string;
  logger: Logger;
  dotAI: any; // Will be properly typed later
  userId?: string;
  sessionId?: string;
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  args: any,
  context: ToolContext
) => Promise<{ content: { type: string; text: string }[] }>;

/**
 * Complete tool registration including handler
 */
export interface ToolRegistration {
  definition: ToolDefinition;
  handler: ToolHandler;
  enabled: boolean;
  registeredAt: Date;
}

/**
 * Tool registry configuration
 */
export interface ToolRegistryConfig {
  logger?: Logger;
  enabledByDefault?: boolean;
  validateSchemas?: boolean;
}

/**
 * Dynamic tool registry for MCP server
 */
export class ToolRegistry {
  private tools: Map<string, ToolRegistration> = new Map();
  private logger: Logger;
  private config: Required<ToolRegistryConfig>;

  constructor(config: ToolRegistryConfig = {}) {
    this.config = {
      enabledByDefault: true,
      validateSchemas: true,
      ...config,
      logger: config.logger || console as any // Fallback logger
    };
    this.logger = this.config.logger;
  }

  /**
   * Register a new tool with the registry
   */
  registerTool(
    definition: ToolDefinition, 
    handler: ToolHandler,
    options: { enabled?: boolean } = {}
  ): void {
    const { name } = definition;

    // Validate tool name
    if (!name || typeof name !== 'string') {
      throw new Error('Tool name must be a non-empty string');
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error('Tool name must start with a letter and contain only letters, numbers, and underscores');
    }

    // Check for conflicts
    if (this.tools.has(name)) {
      this.logger.warn(`Overwriting existing tool: ${name}`);
    }

    // Validate schemas if enabled
    if (this.config.validateSchemas) {
      this.validateSchema(definition.inputSchema, `${name} input schema`);
      if (definition.outputSchema) {
        this.validateSchema(definition.outputSchema, `${name} output schema`);
      }
    }

    // Create registration
    const registration: ToolRegistration = {
      definition,
      handler,
      enabled: options.enabled ?? this.config.enabledByDefault,
      registeredAt: new Date()
    };

    this.tools.set(name, registration);

    this.logger.info(`Registered tool: ${name}`, {
      category: definition.category,
      version: definition.version,
      enabled: registration.enabled
    });
  }

  /**
   * Unregister a tool from the registry
   */
  unregisterTool(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      this.logger.info(`Unregistered tool: ${name}`);
    } else {
      this.logger.warn(`Attempted to unregister unknown tool: ${name}`);
    }
    return removed;
  }

  /**
   * Get a registered tool
   */
  getTool(name: string): ToolRegistration | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolRegistration[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get enabled tools only
   */
  getEnabledTools(): ToolRegistration[] {
    return this.getAllTools().filter(tool => tool.enabled);
  }

  /**
   * Get tool definitions for MCP list_tools response
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.getEnabledTools().map(reg => reg.definition);
  }

  /**
   * Check if a tool exists and is enabled
   */
  isToolAvailable(name: string): boolean {
    const tool = this.tools.get(name);
    return tool ? tool.enabled : false;
  }

  /**
   * Enable or disable a tool
   */
  setToolEnabled(name: string, enabled: boolean): boolean {
    const tool = this.tools.get(name);
    if (!tool) {
      return false;
    }

    tool.enabled = enabled;
    this.logger.info(`Tool ${name} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Execute a tool handler with proper context
   */
  async executeTool(
    name: string, 
    args: any, 
    context: ToolContext
  ): Promise<{ content: { type: string; text: string }[] }> {
    const tool = this.tools.get(name);
    
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    if (!tool.enabled) {
      throw new Error(`Tool disabled: ${name}`);
    }

    context.logger.debug(`Executing tool: ${name}`, {
      requestId: context.requestId,
      hasArgs: !!args
    });

    try {
      return await tool.handler(args, context);
    } catch (error) {
      context.logger.error(`Tool execution failed: ${name}`, error as Error, {
        requestId: context.requestId,
        args
      });
      throw error;
    }
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalTools: number;
    enabledTools: number;
    disabledTools: number;
    categories: Record<string, number>;
  } {
    const tools = this.getAllTools();
    const enabled = tools.filter(t => t.enabled);
    const categories: Record<string, number> = {};

    tools.forEach(tool => {
      const category = tool.definition.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
    });

    return {
      totalTools: tools.length,
      enabledTools: enabled.length,
      disabledTools: tools.length - enabled.length,
      categories
    };
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    const count = this.tools.size;
    this.tools.clear();
    this.logger.info(`Cleared ${count} tools from registry`);
  }

  /**
   * Basic JSON schema validation
   */
  private validateSchema(schema: JSONSchema, context: string): void {
    if (!schema || typeof schema !== 'object') {
      throw new Error(`Invalid schema for ${context}: must be an object`);
    }

    if (!schema.type) {
      throw new Error(`Invalid schema for ${context}: missing type property`);
    }

    // Additional validation could be added here
  }
}

/**
 * Default global tool registry instance
 */
export const defaultToolRegistry = new ToolRegistry();