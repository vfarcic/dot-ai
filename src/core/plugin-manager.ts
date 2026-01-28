/**
 * Plugin Manager for dot-ai Plugin System
 *
 * Discovers plugins at startup and manages tool routing.
 * Provides discovered tools to the MCP server for registration.
 *
 * PRD #343: kubectl Plugin Migration
 */

import { existsSync, readFileSync } from 'node:fs';
import {
  PluginConfig,
  PluginToolDefinition,
  DiscoveredPlugin,
  InvokeResponse,
} from './plugin-types';
import { PluginClient, PluginClientError } from './plugin-client';
import { Logger } from './error-handling';
import { AITool, ToolExecutor } from './ai-provider.interface';

/** Path for plugins config file (mounted from ConfigMap in K8s) */
const PLUGINS_CONFIG_PATH = '/etc/dot-ai/plugins.json';

/**
 * Error thrown when plugin discovery fails
 */
export class PluginDiscoveryError extends Error {
  constructor(
    message: string,
    public readonly failedPlugins: Array<{ name: string; error: string }>
  ) {
    super(message);
    this.name = 'PluginDiscoveryError';
  }
}

/**
 * Manages plugin discovery, registration, and tool routing
 */
export class PluginManager {
  private readonly logger: Logger;
  private readonly plugins: Map<string, PluginClient> = new Map();
  private readonly discoveredPlugins: Map<string, DiscoveredPlugin> = new Map();
  private readonly toolToPlugin: Map<string, string> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Parse plugin configuration from file
   *
   * Reads from /etc/dot-ai/plugins.json (mounted from ConfigMap in K8s).
   * Returns empty array if file doesn't exist (plugins only work in-cluster).
   * Throws on invalid JSON or malformed plugin configuration.
   */
  static parsePluginConfig(): PluginConfig[] {
    if (!existsSync(PLUGINS_CONFIG_PATH)) {
      return [];
    }

    let content: string;
    try {
      content = readFileSync(PLUGINS_CONFIG_PATH, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read plugin config at ${PLUGINS_CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error(`Invalid JSON in plugin config at ${PLUGINS_CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`Plugin config at ${PLUGINS_CONFIG_PATH} must be an array, got ${typeof parsed}`);
    }

    return parsed.map((p, index) => {
      if (!p || typeof p !== 'object') {
        throw new Error(`Plugin at index ${index} must be an object`);
      }
      if (!p.url || typeof p.url !== 'string') {
        throw new Error(`Plugin at index ${index} (${p.name || 'unnamed'}) is missing required 'url' field`);
      }
      return {
        name: p.name || `plugin-${index}`,
        url: p.url,
        timeout: p.timeout,
        required: p.required,
      };
    });
  }

  /**
   * Discover all configured plugins
   *
   * Calls describe hook on each plugin and registers their tools.
   * Non-required plugins that fail to respond are logged but don't fail startup.
   */
  async discoverPlugins(configs: PluginConfig[]): Promise<void> {
    if (configs.length === 0) {
      this.logger.debug('No plugins configured for discovery');
      return;
    }

    this.logger.info('Starting plugin discovery', {
      pluginCount: configs.length,
      plugins: configs.map((c) => c.name),
    });

    const results = await Promise.allSettled(
      configs.map((config) => this.discoverPlugin(config))
    );

    const failed: Array<{ name: string; error: string }> = [];
    const requiredFailed: Array<{ name: string; error: string }> = [];

    results.forEach((result, index) => {
      const config = configs[index];
      if (result.status === 'rejected') {
        const error =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        failed.push({ name: config.name, error });
        if (config.required) {
          requiredFailed.push({ name: config.name, error });
        }
      }
    });

    if (failed.length > 0) {
      this.logger.warn('Some plugins failed to discover', {
        failed: failed.map((f) => f.name),
      });
    }

    if (requiredFailed.length > 0) {
      throw new PluginDiscoveryError(
        `Required plugins failed to discover: ${requiredFailed.map((f) => f.name).join(', ')}`,
        requiredFailed
      );
    }

    this.logger.info('Plugin discovery complete', {
      discovered: this.discoveredPlugins.size,
      totalTools: this.toolToPlugin.size,
    });
  }

  /**
   * Discover a single plugin with retry logic
   *
   * Retries with exponential backoff to handle Kubernetes startup ordering
   * where plugin service may not be ready when MCP server starts.
   */
  private async discoverPlugin(config: PluginConfig): Promise<void> {
    const client = new PluginClient(config, this.logger);
    const maxRetries = 5;
    const baseDelayMs = 1000;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await client.describe();

        // Store client for later invocation
        this.plugins.set(config.name, client);

        // Store discovered plugin metadata
        this.discoveredPlugins.set(config.name, {
          name: config.name,
          url: config.url,
          version: response.version,
          tools: response.tools,
          discoveredAt: new Date(),
        });

        // Map tools to plugin
        for (const tool of response.tools) {
          if (this.toolToPlugin.has(tool.name)) {
            this.logger.warn('Tool name conflict - overwriting', {
              tool: tool.name,
              existingPlugin: this.toolToPlugin.get(tool.name),
              newPlugin: config.name,
            });
          }
          this.toolToPlugin.set(tool.name, config.name);
        }

        this.logger.info('Plugin discovered', {
          name: config.name,
          version: response.version,
          tools: response.tools.map((t) => t.name),
          attempts: attempt,
        });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          this.logger.warn('Plugin discovery failed, retrying', {
            plugin: config.name,
            attempt,
            maxRetries,
            delayMs,
            error: lastError.message,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retries exhausted - throw the last error
    const message =
      lastError instanceof PluginClientError
        ? lastError.message
        : lastError?.message || 'Unknown error';

    this.logger.error('Failed to discover plugin after retries', new Error(message), {
      plugin: config.name,
      url: config.url,
      attempts: maxRetries,
    });

    throw lastError;
  }

  /**
   * Get all discovered tools as AITool format for registration
   *
   * Only returns tools where the tool-to-plugin mapping is canonical.
   * This filters out duplicate tools when multiple plugins define the same tool name.
   */
  getDiscoveredTools(): AITool[] {
    const tools: AITool[] = [];

    for (const plugin of this.discoveredPlugins.values()) {
      for (const tool of plugin.tools) {
        // Only include tool if this plugin owns it in the routing map
        // This handles conflicts where multiple plugins define the same tool
        if (this.toolToPlugin.get(tool.name) === plugin.name) {
          tools.push(this.convertToAITool(tool));
        }
      }
    }

    return tools;
  }

  /**
   * Get tools from a specific plugin
   */
  getPluginTools(pluginName: string): AITool[] {
    const plugin = this.discoveredPlugins.get(pluginName);
    if (!plugin) {
      return [];
    }
    return plugin.tools.map((t) => this.convertToAITool(t));
  }

  /**
   * Check if a tool is provided by a plugin
   */
  isPluginTool(toolName: string): boolean {
    return this.toolToPlugin.has(toolName);
  }

  /**
   * Get the plugin name for a tool
   */
  getToolPlugin(toolName: string): string | undefined {
    return this.toolToPlugin.get(toolName);
  }

  /**
   * Invoke a tool on its plugin
   */
  async invokeTool(
    toolName: string,
    args: Record<string, unknown>,
    state: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<InvokeResponse> {
    const pluginName = this.toolToPlugin.get(toolName);
    if (!pluginName) {
      return {
        sessionId: sessionId || '',
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool '${toolName}' not found in any plugin`,
        },
        state,
      };
    }

    const client = this.plugins.get(pluginName);
    if (!client) {
      return {
        sessionId: sessionId || '',
        success: false,
        error: {
          code: 'PLUGIN_NOT_AVAILABLE',
          message: `Plugin '${pluginName}' is not available`,
        },
        state,
      };
    }

    return client.invoke(toolName, args, state, sessionId);
  }

  /**
   * Create a ToolExecutor that routes plugin tools to plugins
   *
   * Returns a function compatible with toolLoop's toolExecutor parameter.
   * Plugin tools are routed to their plugins via HTTP; non-plugin tools
   * are routed to the optional fallback executor.
   *
   * @param fallbackExecutor Optional executor for non-plugin tools
   * @returns ToolExecutor function for use in agentic tool loops
   */
  createToolExecutor(fallbackExecutor?: ToolExecutor): ToolExecutor {
    return async (toolName: string, input: unknown): Promise<unknown> => {
      // Route to plugin if this is a plugin tool
      if (this.isPluginTool(toolName)) {
        this.logger.debug('Routing tool to plugin', {
          tool: toolName,
          plugin: this.getToolPlugin(toolName),
        });

        try {
          const response = await this.invokeTool(
            toolName,
            input as Record<string, unknown>
          );

          if (response.success) {
            // PRD #343: Return only the data field to AI, not the full JSON wrapper
            // This saves tokens and provides cleaner output matching raw command output
            if (typeof response.result === 'object' && response.result !== null) {
              const result = response.result as any;
              if ('success' in result && 'data' in result) {
                // Return just the data (raw command output) for successful results
                // Return error message string for failed results
                return result.success ? result.data : `Error: ${result.message || result.error || 'Command failed'}`;
              }
            }
            // Fallback for non-standard responses - return result directly
            return response.result;
          } else {
            // Return error as simple string, not JSON
            return `Error: ${response.error?.message || 'Unknown error'}`;
          }
        } catch (err) {
          // Catch invoke exceptions to prevent tool-loop crashes
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error('Plugin invokeTool failed with exception', new Error(message), {
            tool: toolName,
            plugin: this.getToolPlugin(toolName),
          });
          return `Error: ${message}`;
        }
      }

      // Fall back to provided executor for non-plugin tools
      if (fallbackExecutor) {
        return fallbackExecutor(toolName, input);
      }

      // No handler for this tool
      return `Error: Tool '${toolName}' not found in plugins or fallback executor`;
    };
  }

  /**
   * Get list of discovered plugin names
   */
  getDiscoveredPluginNames(): string[] {
    return Array.from(this.discoveredPlugins.keys());
  }

  /**
   * Get discovered plugin metadata
   */
  getDiscoveredPlugin(name: string): DiscoveredPlugin | undefined {
    return this.discoveredPlugins.get(name);
  }

  /**
   * Get all discovered plugins
   */
  getAllDiscoveredPlugins(): DiscoveredPlugin[] {
    return Array.from(this.discoveredPlugins.values());
  }

  /**
   * Get plugin statistics
   */
  getStats(): {
    pluginCount: number;
    toolCount: number;
    plugins: Array<{ name: string; version: string; toolCount: number }>;
  } {
    const plugins = Array.from(this.discoveredPlugins.values()).map((p) => ({
      name: p.name,
      version: p.version,
      toolCount: p.tools.length,
    }));

    return {
      pluginCount: this.discoveredPlugins.size,
      toolCount: this.toolToPlugin.size,
      plugins,
    };
  }

  /**
   * Convert PluginToolDefinition to AITool format
   */
  private convertToAITool(tool: PluginToolDefinition): AITool {
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
  }
}
