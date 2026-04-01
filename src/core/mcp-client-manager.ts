/**
 * MCP Client Manager for dot-ai MCP Server Integration
 *
 * Connects to external MCP servers running in the cluster, discovers their tools,
 * and makes them available to dot-ai operations (remediate, operate, query) via
 * the attachTo routing mechanism.
 *
 * PRD #358: MCP Server Integration
 * PRD #414: MCP Client Outbound Authentication
 */

import { existsSync, readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider, OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import { ClientCredentialsProvider } from '@modelcontextprotocol/sdk/client/auth-extensions.js';
import type { OAuthTokens, OAuthClientMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  McpServerConfig,
  McpServerAuthConfig,
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
 * Minimal OAuthClientProvider that returns a static bearer token.
 *
 * Used when the MCP server expects MCP-spec-compliant auth (authProvider)
 * but the token is a pre-provisioned service account JWT or API key
 * rather than an interactive OAuth flow.
 *
 * PRD #414: MCP Client Outbound Authentication (M1)
 */
export class StaticTokenAuthProvider implements OAuthClientProvider {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  get redirectUrl(): undefined { return undefined; }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [],
      client_name: 'dot-ai',
    };
  }

  clientInformation() { return undefined; }

  async tokens(): Promise<OAuthTokens> {
    return {
      access_token: this.token,
      token_type: 'bearer',
    };
  }

  async saveTokens(): Promise<void> { /* static token — nothing to save */ }
  async redirectToAuthorization(): Promise<void> { /* non-interactive — no redirect */ }
  async saveCodeVerifier(): Promise<void> { /* no PKCE for static tokens */ }
  // Returns empty string because the SDK type requires string (not undefined).
  // Static tokens do not use PKCE, so the verifier is never meaningful.
  async codeVerifier(): Promise<string> { return ''; }

  async invalidateCredentials(_scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    // No-op for all scopes: static tokens are pre-provisioned and cannot be refreshed.
    // 'client'/'verifier' are for interactive OAuth (authorization_code + PKCE).
    // 'tokens'/'discovery' have no effect since the token is fixed at construction.
  }

  async saveDiscoveryState(_state: OAuthDiscoveryState): Promise<void> { /* no-op for static tokens */ }
  async discoveryState(): Promise<OAuthDiscoveryState | undefined> { return undefined; }
}

/**
 * Resolve transport options (authProvider and/or requestInit) from auth config.
 *
 * Reads token/header values from environment variables (sourced from K8s Secrets).
 * Returns partial options to merge into StreamableHTTPClientTransportOptions.
 *
 * PRD #414: MCP Client Outbound Authentication (M1 + M2 + M4)
 */
export function resolveTransportAuth(
  auth: McpServerAuthConfig | undefined,
  serverName: string,
  logger: Logger
): Pick<StreamableHTTPClientTransportOptions, 'authProvider' | 'requestInit'> {
  if (!auth) return {};

  const result: Pick<StreamableHTTPClientTransportOptions, 'authProvider' | 'requestInit'> = {};

  // M1: Static token → authProvider
  if (auth.tokenEnvVar) {
    const token = process.env[auth.tokenEnvVar];
    if (token) {
      result.authProvider = new StaticTokenAuthProvider(token);
      logger.info('MCP server auth configured via authProvider (static token)', {
        server: serverName,
        envVar: auth.tokenEnvVar,
      });
    } else {
      throw new Error(
        `MCP server '${serverName}' auth.tokenEnvVar references env var '${auth.tokenEnvVar}' but it is empty or unset — fix the K8s Secret or remove the auth config`
      );
    }
  }

  // M2: Custom headers → requestInit
  if (auth.headersEnvVar) {
    const headersJson = process.env[auth.headersEnvVar];
    if (headersJson) {
      try {
        const headers = JSON.parse(headersJson);
        if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
          throw new Error('Headers must be a JSON object of key-value pairs');
        }
        // Validate all header values are strings — non-string values cause HTTP errors
        for (const [key, value] of Object.entries(headers)) {
          if (typeof value !== 'string') {
            throw new Error(`Header "${key}" value must be a string, got ${typeof value}`);
          }
        }
        result.requestInit = { headers };
        logger.info('MCP server auth configured via requestInit headers', {
          server: serverName,
          envVar: auth.headersEnvVar,
          headerCount: Object.keys(headers).length,
        });
      } catch (err) {
        throw new Error(
          `MCP server '${serverName}' auth.headersEnvVar env var '${auth.headersEnvVar}' contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err }
        );
      }
    } else {
      throw new Error(
        `MCP server '${serverName}' auth.headersEnvVar references env var '${auth.headersEnvVar}' but it is empty or unset — fix the K8s Secret or remove the auth config`
      );
    }
  }

  // M4: OAuth client_credentials → authProvider (takes precedence over tokenEnvVar)
  // Uses SDK built-in ClientCredentialsProvider (@modelcontextprotocol/sdk ^1.27.1)
  // instead of custom implementation. The SDK handles:
  //   - prepareTokenRequest() → sets grant_type=client_credentials + scope
  //   - client_secret_basic auth method (RFC 6749 §2.3.1)
  //   - Token caching and automatic refresh on 401
  // No PKCE: client_credentials is non-interactive (RFC 6749 §4.4), PKCE is for
  // authorization_code grants only (RFC 7636 §1).
  if (auth.oauth) {
    const clientSecret = process.env[auth.oauth.clientSecretEnvVar];
    if (clientSecret) {
      result.authProvider = new ClientCredentialsProvider({
        clientId: auth.oauth.clientId,
        clientSecret,
        clientName: 'dot-ai',
        scope: auth.oauth.scope,
      });
      logger.info('MCP server auth configured via authProvider (OAuth client_credentials)', {
        server: serverName,
        clientId: auth.oauth.clientId,
        clientSecretEnvVar: auth.oauth.clientSecretEnvVar,
        scope: auth.oauth.scope,
      });
    } else {
      throw new Error(
        `MCP server '${serverName}' auth.oauth.clientSecretEnvVar references env var '${auth.oauth.clientSecretEnvVar}' but it is empty or unset — fix the K8s Secret or remove the auth config`
      );
    }
  }

  return result;
}

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
      // Parse optional auth config (PRD #414)
      // Fail-fast on malformed auth — silent degradation to unauthenticated is a security risk
      let auth: McpServerAuthConfig | undefined;
      const serverLabel = s.name || 'unnamed';
      if (s.auth !== undefined) {
        if (!s.auth || typeof s.auth !== 'object' || Array.isArray(s.auth)) {
          throw new Error(
            `MCP server at index ${index} (${serverLabel}) auth must be an object`
          );
        }
        const rawAuth = s.auth as Record<string, unknown>;
        auth = {};
        if ('tokenEnvVar' in rawAuth) {
          if (typeof rawAuth.tokenEnvVar !== 'string' || rawAuth.tokenEnvVar.trim() === '') {
            throw new Error(
              `MCP server at index ${index} (${serverLabel}) auth.tokenEnvVar must be a non-empty string`
            );
          }
          auth.tokenEnvVar = rawAuth.tokenEnvVar;
        }
        if ('headersEnvVar' in rawAuth) {
          if (typeof rawAuth.headersEnvVar !== 'string' || rawAuth.headersEnvVar.trim() === '') {
            throw new Error(
              `MCP server at index ${index} (${serverLabel}) auth.headersEnvVar must be a non-empty string`
            );
          }
          auth.headersEnvVar = rawAuth.headersEnvVar;
        }
        // M4: OAuth client_credentials config
        if ('oauth' in rawAuth) {
          if (!rawAuth.oauth || typeof rawAuth.oauth !== 'object' || Array.isArray(rawAuth.oauth)) {
            throw new Error(
              `MCP server at index ${index} (${serverLabel}) auth.oauth must be an object`
            );
          }
          const rawOAuth = rawAuth.oauth as Record<string, unknown>;
          if (!rawOAuth.clientId || typeof rawOAuth.clientId !== 'string') {
            throw new Error(
              `MCP server at index ${index} (${serverLabel}) auth.oauth is missing required 'clientId' field`
            );
          }
          if (!rawOAuth.clientSecretEnvVar || typeof rawOAuth.clientSecretEnvVar !== 'string') {
            throw new Error(
              `MCP server at index ${index} (${serverLabel}) auth.oauth is missing required 'clientSecretEnvVar' field`
            );
          }
          if ('scope' in rawOAuth && (typeof rawOAuth.scope !== 'string' || rawOAuth.scope.trim() === '')) {
            throw new Error(
              `MCP server at index ${index} (${serverLabel}) auth.oauth.scope must be a non-empty string`
            );
          }
          auth.oauth = {
            clientId: rawOAuth.clientId,
            clientSecretEnvVar: rawOAuth.clientSecretEnvVar,
            scope: typeof rawOAuth.scope === 'string' ? rawOAuth.scope : undefined,
          };
        }
        // Fail-fast: auth block present but no valid fields configured
        if (!auth.tokenEnvVar && !auth.headersEnvVar && !auth.oauth) {
          throw new Error(
            `MCP server at index ${index} (${serverLabel}) auth is present but contains no valid auth fields (tokenEnvVar, headersEnvVar, or oauth)`
          );
        }
        // Mutual exclusivity: tokenEnvVar and oauth cannot both be specified
        // because both set authProvider — oauth would silently overwrite the static token
        if (auth.tokenEnvVar && auth.oauth) {
          throw new Error(
            `MCP server at index ${index} (${serverLabel}) auth specifies both 'tokenEnvVar' and 'oauth' — these are mutually exclusive (both set authProvider)`
          );
        }
      }

      return {
        name: s.name || `mcp-server-${index}`,
        endpoint: s.endpoint,
        attachTo: s.attachTo as McpAttachableOperation[],
        timeout: s.timeout,
        auth,
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
      hasAuth: !!config.auth,
    });

    // Resolve authentication options from config + env vars (PRD #414)
    const authOptions = resolveTransportAuth(config.auth, config.name, this.logger);

    const transport = new StreamableHTTPClientTransport(
      new URL(config.endpoint),
      {
        reconnectionOptions: {
          maxReconnectionDelay: 30_000,
          initialReconnectionDelay: 1_000,
          reconnectionDelayGrowFactor: 1.5,
          maxRetries: 2,
        },
        ...authOptions,
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
        `Failed to connect to MCP server '${config.name}' at ${config.endpoint}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
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
        `Failed to list tools from MCP server '${config.name}': ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
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
          const contentArray = result.content as Array<{ type: string; text?: string }>;
          if (result.isError) {
            const errorText = contentArray
              ?.filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n') || 'Unknown MCP tool error';
            return `Error: ${errorText}`;
          }

          // Return text content for AI consumption
          const textContent = contentArray
            ?.filter(c => c.type === 'text')
            .map(c => c.text)
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
