/**
 * Plugin Manager for dot-ai Plugin System
 *
 * Discovers plugins at startup and manages tool routing.
 * Provides discovered tools to the MCP server for registration.
 *
 * PRD #343: kubectl Plugin Migration
 */

import {
  PluginConfig,
  PluginToolDefinition,
  DiscoveredPlugin,
  InvokeResponse,
} from './plugin-types';
import { PluginClient, PluginClientError } from './plugin-client';
import { Logger } from './error-handling';
import { AITool } from './ai-provider.interface';

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
   * Parse plugin configuration from environment variable
   *
   * Supports two formats:
   * 1. Simple URL list: DOT_AI_PLUGINS=http://localhost:8080,http://other:8080
   * 2. JSON config: DOT_AI_PLUGINS_CONFIG=[{"name":"agentic-tools","url":"http://localhost:8080"}]
   */
  static parsePluginConfig(): PluginConfig[] {
    // Try JSON config first
    const jsonConfig = process.env.DOT_AI_PLUGINS_CONFIG;
    if (jsonConfig) {
      try {
        const parsed = JSON.parse(jsonConfig);
        if (Array.isArray(parsed)) {
          return parsed.map((p, index) => ({
            name: p.name || `plugin-${index}`,
            url: p.url,
            timeout: p.timeout,
            required: p.required,
          }));
        }
      } catch {
        // Fall through to URL parsing
      }
    }

    // Try simple URL list
    const urlList = process.env.DOT_AI_PLUGINS;
    if (urlList) {
      return urlList
        .split(',')
        .map((url) => url.trim())
        .filter((url) => url.length > 0)
        .map((url, index) => ({
          name: `plugin-${index}`,
          url,
        }));
    }

    return [];
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
   * Discover a single plugin
   */
  private async discoverPlugin(config: PluginConfig): Promise<void> {
    const client = new PluginClient(config, this.logger);

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
      });
    } catch (error) {
      const message =
        error instanceof PluginClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);

      this.logger.error('Failed to discover plugin', new Error(message), {
        plugin: config.name,
        url: config.url,
      });

      throw error;
    }
  }

  /**
   * Get all discovered tools as AITool format for registration
   */
  getDiscoveredTools(): AITool[] {
    const tools: AITool[] = [];

    for (const plugin of this.discoveredPlugins.values()) {
      for (const tool of plugin.tools) {
        tools.push(this.convertToAITool(tool));
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
