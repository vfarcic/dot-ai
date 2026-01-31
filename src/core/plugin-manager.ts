/**
 * Plugin Manager for dot-ai Plugin System
 *
 * Discovers plugins at startup and manages tool routing.
 * Provides discovered tools to the MCP server for registration.
 *
 * PRD #343: kubectl Plugin Migration
 *
 * Background Retry: If plugins aren't ready at startup, discovery continues
 * in the background every 30 seconds. MCP server starts immediately and
 * remains observable via the version tool.
 */

import { existsSync, readFileSync } from 'node:fs';
import {
  PluginConfig,
  PluginToolDefinition,
  DiscoveredPlugin,
  InvokeResponse,
} from './plugin-types';
import { PluginClient } from './plugin-client';
import { Logger } from './error-handling';
import { AITool, ToolExecutor } from './ai-provider.interface';

/** Path for plugins config file (mounted from ConfigMap in K8s) */
const PLUGINS_CONFIG_PATH = '/etc/dot-ai/plugins.json';

/** Background retry interval in milliseconds */
const BACKGROUND_RETRY_INTERVAL_MS = 30_000;

/** Maximum time to keep retrying in background (10 minutes) */
const BACKGROUND_RETRY_MAX_DURATION_MS = 10 * 60 * 1000;

/**
 * Callback invoked when a plugin is discovered in the background
 */
export type PluginDiscoveredCallback = (plugin: DiscoveredPlugin) => void;

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

  /** Plugins pending background discovery */
  private pendingPlugins: PluginConfig[] = [];

  /** Background retry timer */
  private backgroundRetryTimer: ReturnType<typeof setTimeout> | null = null;

  /** When background retry started */
  private backgroundRetryStartTime: number | null = null;

  /** Callback for background discovery */
  private onPluginDiscovered: PluginDiscoveredCallback | null = null;

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
   * Set callback for when plugins are discovered in the background
   *
   * This allows the MCP server to register new tools when plugins
   * become available after initial startup.
   */
  setOnPluginDiscovered(callback: PluginDiscoveredCallback): void {
    this.onPluginDiscovered = callback;
  }

  /**
   * Discover all configured plugins
   *
   * Does a quick initial discovery attempt (2 retries, 1s apart).
   * Plugins that fail are queued for background retry.
   * Required plugins that fail will throw PluginDiscoveryError.
   *
   * Call startBackgroundDiscovery() after this to enable background retries.
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
      configs.map((config) => this.discoverPluginQuick(config))
    );

    const failed: Array<{ name: string; error: string }> = [];
    const requiredFailed: Array<{ name: string; error: string }> = [];

    results.forEach((result, index) => {
      const config = configs[index];
      if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value)) {
        const error =
          result.status === 'rejected'
            ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
            : 'Discovery failed';
        failed.push({ name: config.name, error });

        if (config.required) {
          requiredFailed.push({ name: config.name, error });
        } else {
          // Queue for background retry
          this.pendingPlugins.push(config);
        }
      }
    });

    if (failed.length > 0) {
      this.logger.warn('Some plugins failed initial discovery', {
        failed: failed.map((f) => f.name),
        willRetryInBackground: this.pendingPlugins.map((p) => p.name),
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
      pendingBackgroundRetry: this.pendingPlugins.length,
    });
  }

  /**
   * Start background discovery for plugins that failed initial discovery
   *
   * Retries every 30 seconds for up to 10 minutes.
   * When a plugin is discovered, calls the onPluginDiscovered callback.
   */
  startBackgroundDiscovery(): void {
    if (this.pendingPlugins.length === 0) {
      this.logger.debug('No pending plugins for background discovery');
      return;
    }

    this.backgroundRetryStartTime = Date.now();
    this.logger.info('Starting background plugin discovery', {
      pendingPlugins: this.pendingPlugins.map((p) => p.name),
      retryIntervalMs: BACKGROUND_RETRY_INTERVAL_MS,
      maxDurationMs: BACKGROUND_RETRY_MAX_DURATION_MS,
    });

    this.scheduleBackgroundRetry();
  }

  /**
   * Stop background discovery
   */
  stopBackgroundDiscovery(): void {
    if (this.backgroundRetryTimer) {
      clearTimeout(this.backgroundRetryTimer);
      this.backgroundRetryTimer = null;
      this.logger.info('Stopped background plugin discovery', {
        remainingPending: this.pendingPlugins.map((p) => p.name),
      });
    }
    this.backgroundRetryStartTime = null;
  }

  /**
   * Get pending plugins that are still awaiting discovery
   */
  getPendingPlugins(): string[] {
    return this.pendingPlugins.map((p) => p.name);
  }

  /**
   * Check if background discovery is active
   */
  isBackgroundDiscoveryActive(): boolean {
    return this.backgroundRetryTimer !== null;
  }

  /**
   * Schedule the next background retry attempt
   */
  private scheduleBackgroundRetry(): void {
    this.backgroundRetryTimer = setTimeout(async () => {
      await this.runBackgroundRetry();
    }, BACKGROUND_RETRY_INTERVAL_MS);
  }

  /**
   * Run a background retry attempt for all pending plugins
   */
  private async runBackgroundRetry(): Promise<void> {
    // Check if we've exceeded max duration
    if (this.backgroundRetryStartTime) {
      const elapsed = Date.now() - this.backgroundRetryStartTime;
      if (elapsed >= BACKGROUND_RETRY_MAX_DURATION_MS) {
        this.logger.warn('Background plugin discovery timed out', {
          elapsedMs: elapsed,
          remainingPending: this.pendingPlugins.map((p) => p.name),
        });
        this.stopBackgroundDiscovery();
        return;
      }
    }

    this.logger.debug('Running background plugin discovery attempt', {
      pendingCount: this.pendingPlugins.length,
    });

    // Try each pending plugin
    const stillPending: PluginConfig[] = [];

    for (const config of this.pendingPlugins) {
      const discovered = await this.discoverPluginQuick(config);
      if (discovered) {
        // Plugin discovered - notify callback
        const plugin = this.discoveredPlugins.get(config.name);
        if (plugin && this.onPluginDiscovered) {
          this.logger.info('Plugin discovered in background', {
            name: plugin.name,
            version: plugin.version,
            toolCount: plugin.tools.length,
          });
          this.onPluginDiscovered(plugin);
        }
      } else {
        stillPending.push(config);
      }
    }

    this.pendingPlugins = stillPending;

    // If all discovered, stop background retry
    if (this.pendingPlugins.length === 0) {
      this.logger.info('All plugins discovered, stopping background discovery');
      this.stopBackgroundDiscovery();
      return;
    }

    // Schedule next retry
    this.scheduleBackgroundRetry();
  }

  /**
   * Quick discovery attempt for a single plugin
   *
   * Does 2 retries with 1 second delay. Returns true if discovered,
   * false if should be queued for background retry.
   */
  private async discoverPluginQuick(config: PluginConfig): Promise<boolean> {
    const client = new PluginClient(config, this.logger);
    const maxRetries = 2;
    const retryDelayMs = 1000;

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
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt < maxRetries) {
          this.logger.debug('Plugin discovery attempt failed, retrying', {
            plugin: config.name,
            attempt,
            error: errorMessage,
          });
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        } else {
          this.logger.debug('Plugin discovery failed, will retry in background', {
            plugin: config.name,
            attempts: maxRetries,
            error: errorMessage,
          });
        }
      }
    }

    return false;
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
   * Invoke a tool on its plugin (auto-routing by tool name)
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
   * Invoke a tool on a specific plugin (explicit routing)
   *
   * PRD #359: Unified plugin invocation with explicit plugin specification.
   * Use this when you know which plugin provides the tool, avoiding
   * ambiguity when multiple plugins might have tools with the same name.
   */
  async invokeToolOnPlugin(
    pluginName: string,
    toolName: string,
    args: Record<string, unknown>,
    state: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<InvokeResponse> {
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
              const result = response.result as { success?: boolean; data?: unknown; message?: string; error?: string };
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
    pendingDiscovery: string[];
    backgroundDiscoveryActive: boolean;
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
      pendingDiscovery: this.pendingPlugins.map((p) => p.name),
      backgroundDiscoveryActive: this.isBackgroundDiscoveryActive(),
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
