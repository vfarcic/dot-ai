/**
 * MCP Client Manager for dot-ai MCP Server Integration
 *
 * Connects to external MCP servers running in the cluster, discovers their tools,
 * and makes them available to dot-ai operations (remediate, operate, query) via
 * the attachTo routing mechanism.
 *
 * PRD #358: MCP Server Integration
 */

import { existsSync, readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  McpServerConfig,
  McpToolDefinition,
  DiscoveredMcpServer,
  McpServerStats,
  McpDiscoveryError,
  McpAttachableOperation,
} from './mcp-client-types';
import { Logger } from './error-handling';
import { AITool, ToolExecutor } from './ai-provider.interface';

/** Path for MCP servers config file (mounted from ConfigMap in K8s) */
const MCP_SERVERS_CONFIG_PATH = '/etc/dot-ai-mcp/mcp-servers.json';

/** Separator used to namespace MCP tools: {serverName}__{toolName} */
const TOOL_NAME_SEPARATOR = '__';

/** Default timeout for MCP requests in milliseconds */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Manages MCP server connections, tool discovery, and tool routing.
 *
 * Follows the same structural patterns as PluginManager but uses
 * the MCP SDK (Client + StreamableHTTPClientTransport) instead of HTTP REST.
 */
export class McpClientManager {
  private readonly logger: Logger;

  /** MCP SDK Client instances keyed by server name */
  private readonly clients: Map<string, Client> = new Map();

  /** Transport instances keyed by server name (needed for cleanup) */
  private readonly transports: Map<string, StreamableHTTPClientTransport> = new Map();

  /** Discovered server metadata keyed by server name */
  private readonly discoveredServers: Map<string, DiscoveredMcpServer> = new Map();

  /** Maps namespaced tool name → server name for routing */
  private readonly toolToServer: Map<string, string> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Parse MCP server configuration from file.
   *
   * Reads from /etc/dot-ai-mcp/mcp-servers.json (mounted from ConfigMap in K8s).
   * Returns empty array if file doesn't exist (MCP servers only work in-cluster).
   * Throws on invalid JSON or malformed configuration.
   */
  static parseMcpServerConfig(): McpServerConfig[] {
    if (!existsSync(MCP_SERVERS_CONFIG_PATH)) {
      return [];
    }

    let content: string;
    try {
      content = readFileSync(MCP_SERVERS_CONFIG_PATH, 'utf-8');
    } catch (err) {
      throw new Error(
        `Failed to read MCP server config at ${MCP_SERVERS_CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error(
        `Invalid JSON in MCP server config at ${MCP_SERVERS_CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        `MCP server config at ${MCP_SERVERS_CONFIG_PATH} must be an array, got ${typeof parsed}`
      );
    }

    const validOperations: McpAttachableOperation[] = ['remediate', 'operate', 'query'];

    return parsed.map((s, index) => {
      if (!s || typeof s !== 'object') {
        throw new Error(`MCP server at index ${index} must be an object`);
      }
      if (!s.endpoint || typeof s.endpoint !== 'string') {
        throw new Error(
          `MCP server at index ${index} (${s.name || 'unnamed'}) is missing required 'endpoint' field`
        );
      }
      if (!Array.isArray(s.attachTo) || s.attachTo.length === 0) {
        throw new Error(
          `MCP server at index ${index} (${s.name || 'unnamed'}) must have a non-empty 'attachTo' array`
        );
      }
      for (const op of s.attachTo) {
        if (!validOperations.includes(op)) {
          throw new Error(
            `MCP server at index ${index} (${s.name || 'unnamed'}) has invalid attachTo value '${op}'. Must be one of: ${validOperations.join(', ')}`
          );
        }
      }
      return {
        name: s.name || `mcp-server-${index}`,
        endpoint: s.endpoint,
        attachTo: s.attachTo as McpAttachableOperation[],
        timeout: s.timeout,
      };
    });
  }

  /**
   * Discover all configured MCP servers.
   *
   * Connects to each server, performs MCP handshake, and discovers available tools.
   * All servers must connect successfully — any failure throws McpDiscoveryError.
   */
  async discoverMcpServers(configs: McpServerConfig[]): Promise<void> {
    if (configs.length === 0) {
      this.logger.debug('No MCP servers configured for discovery');
      return;
    }

    this.logger.info('Starting MCP server discovery', {
      serverCount: configs.length,
      servers: configs.map(c => c.name),
    });

    const results = await Promise.allSettled(
      configs.map(config => this.connectAndDiscover(config))
    );

    const failed: Array<{ name: string; error: string }> = [];

    results.forEach((result, index) => {
      const config = configs[index];
      if (result.status === 'rejected') {
        const error = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
        failed.push({ name: config.name, error });
      }
    });

    if (failed.length > 0) {
      throw new McpDiscoveryError(
        `MCP server discovery failed: ${failed.map(f => `${f.name} (${f.error})`).join(', ')}`,
        failed
      );
    }

    this.logger.info('MCP server discovery complete', {
      discovered: this.discoveredServers.size,
      totalTools: this.toolToServer.size,
    });
  }

  /**
   * Connect to a single MCP server and discover its tools.
   */
  private async connectAndDiscover(config: McpServerConfig): Promise<void> {
    const timeout = config.timeout || DEFAULT_TIMEOUT_MS;

    this.logger.debug('Connecting to MCP server', {
      name: config.name,
      endpoint: config.endpoint,
      attachTo: config.attachTo,
    });

    const transport = new StreamableHTTPClientTransport(
      new URL(config.endpoint),
      {
        reconnectionOptions: {
          maxReconnectionDelay: 30_000,
          initialReconnectionDelay: 1_000,
          reconnectionDelayGrowFactor: 1.5,
          maxRetries: 2,
        },
      }
    );

    const client = new Client(
      { name: 'dot-ai', version: '1.0.0' },
      { capabilities: {} }
    );

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Connection timed out after ${timeout}ms`)), timeout)
    );

    try {
      await Promise.race([connectPromise, timeoutPromise]);
    } catch (err) {
      // Clean up transport on failure
      try { await transport.close(); } catch { /* ignore cleanup errors */ }
      throw new Error(
        `Failed to connect to MCP server '${config.name}' at ${config.endpoint}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Discover tools
    let tools: McpToolDefinition[];
    try {
      const result = await client.listTools();
      tools = result.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: {
          type: t.inputSchema.type,
          properties: t.inputSchema.properties as Record<string, unknown> | undefined,
          required: t.inputSchema.required,
        },
      }));
    } catch (err) {
      try { await transport.close(); } catch { /* ignore cleanup errors */ }
      throw new Error(
        `Failed to list tools from MCP server '${config.name}': ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Store client and transport
    this.clients.set(config.name, client);
    this.transports.set(config.name, transport);

    // Store discovered server metadata
    this.discoveredServers.set(config.name, {
      name: config.name,
      endpoint: config.endpoint,
      attachTo: config.attachTo,
      version: client.getServerVersion()?.version,
      tools,
      discoveredAt: new Date(),
    });

    // Map namespaced tools to server
    for (const tool of tools) {
      const namespacedName = `${config.name}${TOOL_NAME_SEPARATOR}${tool.name}`;
      if (this.toolToServer.has(namespacedName)) {
        this.logger.warn('Namespaced tool name conflict - overwriting', {
          tool: namespacedName,
          existingServer: this.toolToServer.get(namespacedName),
          newServer: config.name,
        });
      }
      this.toolToServer.set(namespacedName, config.name);
    }

    this.logger.info('MCP server discovered', {
      name: config.name,
      version: client.getServerVersion()?.version,
      tools: tools.map(t => t.name),
      namespacedTools: tools.map(t => `${config.name}${TOOL_NAME_SEPARATOR}${t.name}`),
    });
  }

  /**
   * Get tools available for a specific dot-ai operation, filtered by attachTo.
   *
   * Returns tools as AITool[] with namespaced names ({serverName}__{toolName}).
   */
  getToolsForOperation(operation: McpAttachableOperation): AITool[] {
    const tools: AITool[] = [];

    for (const server of this.discoveredServers.values()) {
      if (!server.attachTo.includes(operation)) {
        continue;
      }

      for (const tool of server.tools) {
        const namespacedName = `${server.name}${TOOL_NAME_SEPARATOR}${tool.name}`;
        // Only include if this server owns the routing
        if (this.toolToServer.get(namespacedName) === server.name) {
          tools.push(this.convertToAITool(server.name, tool));
        }
      }
    }

    return tools;
  }

  /**
   * Get all discovered tools across all servers.
   */
  getAllDiscoveredTools(): AITool[] {
    const tools: AITool[] = [];

    for (const server of this.discoveredServers.values()) {
      for (const tool of server.tools) {
        const namespacedName = `${server.name}${TOOL_NAME_SEPARATOR}${tool.name}`;
        if (this.toolToServer.get(namespacedName) === server.name) {
          tools.push(this.convertToAITool(server.name, tool));
        }
      }
    }

    return tools;
  }

  /**
   * Check if a tool name belongs to an MCP server (is namespaced).
   */
  isMcpTool(toolName: string): boolean {
    return this.toolToServer.has(toolName);
  }

  /**
   * Create a ToolExecutor that routes MCP tools to their servers.
   *
   * Returns a function compatible with toolLoop's toolExecutor parameter.
   * MCP tools (namespaced) are routed to their MCP servers; non-MCP tools
   * are routed to the optional fallback executor.
   */
  createToolExecutor(fallbackExecutor?: ToolExecutor): ToolExecutor {
    return async (toolName: string, input: unknown): Promise<unknown> => {
      if (this.isMcpTool(toolName)) {
        this.logger.debug('Routing tool to MCP server', {
          tool: toolName,
          server: this.toolToServer.get(toolName),
        });

        try {
          const serverName = this.toolToServer.get(toolName)!;
          const originalToolName = toolName.substring(
            serverName.length + TOOL_NAME_SEPARATOR.length
          );

          const client = this.clients.get(serverName);
          if (!client) {
            return `Error: MCP server '${serverName}' is not connected`;
          }

          const result = await client.callTool({
            name: originalToolName,
            arguments: input as Record<string, unknown>,
          });

          // Extract text content from MCP response
          if (result.isError) {
            const errorText = result.content
              ?.filter((c: { type: string }) => c.type === 'text')
              .map((c: { type: string; text?: string }) => c.text)
              .join('\n') || 'Unknown MCP tool error';
            return `Error: ${errorText}`;
          }

          // Return text content for AI consumption
          const textContent = result.content
            ?.filter((c: { type: string }) => c.type === 'text')
            .map((c: { type: string; text?: string }) => c.text)
            .join('\n');

          return textContent || '';
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            'MCP tool invocation failed',
            new Error(message),
            { tool: toolName, server: this.toolToServer.get(toolName) }
          );
          return `Error: ${message}`;
        }
      }

      // Fall back to provided executor for non-MCP tools
      if (fallbackExecutor) {
        return fallbackExecutor(toolName, input);
      }

      return `Error: Tool '${toolName}' not found in MCP servers or fallback executor`;
    };
  }

  /**
   * Get statistics about MCP server connections.
   */
  getStats(): McpServerStats {
    return {
      serverCount: this.discoveredServers.size,
      toolCount: this.toolToServer.size,
      servers: Array.from(this.discoveredServers.keys()),
    };
  }

  /**
   * Get discovered server metadata.
   */
  getDiscoveredServers(): DiscoveredMcpServer[] {
    return Array.from(this.discoveredServers.values());
  }

  /**
   * Close all MCP server connections.
   */
  async close(): Promise<void> {
    for (const [name, transport] of this.transports.entries()) {
      try {
        await transport.close();
        this.logger.debug('Closed MCP server connection', { name });
      } catch (err) {
        this.logger.warn('Error closing MCP server connection', {
          name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.clients.clear();
    this.transports.clear();
    this.discoveredServers.clear();
    this.toolToServer.clear();
  }

  /**
   * Convert an MCP tool definition to AITool format with namespaced name.
   */
  private convertToAITool(serverName: string, tool: McpToolDefinition): AITool {
    const namespacedName = `${serverName}${TOOL_NAME_SEPARATOR}${tool.name}`;
    return {
      name: namespacedName,
      description: `[${serverName}] ${tool.description || tool.name}`,
      inputSchema: {
        type: 'object',
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required,
      },
    };
  }
}
