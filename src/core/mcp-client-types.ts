/**
 * MCP Client Types for dot-ai MCP Server Integration
 *
 * Defines the interface contract for connecting to external MCP servers.
 * MCP servers provide additional tools (e.g., Prometheus metrics, tracing)
 * that augment dot-ai's built-in kubectl/helm tools.
 *
 * PRD #358: MCP Server Integration
 * PRD #414: MCP Client Outbound Authentication
 */

/**
 * Valid dot-ai operations that MCP servers can attach to
 */
export type McpAttachableOperation = 'remediate' | 'operate' | 'query';

/**
 * Authentication configuration for an MCP server connection.
 *
 * Three modes are supported:
 * 1. Static token via `tokenEnvVar` — reads bearer token from env var, passed as authProvider
 * 2. Custom headers via `headersEnvVar` — reads JSON headers from env var, passed as requestInit
 * 3. No auth (omit `auth`) — current behavior, backward compatible
 *
 * Credentials are injected via environment variables sourced from K8s Secrets.
 * Never store tokens in ConfigMaps or Helm values.
 *
 * PRD #414: MCP Client Outbound Authentication
 */
export interface McpServerAuthConfig {
  /**
   * Environment variable name containing a bearer token for authProvider.
   * The token is passed to StreamableHTTPClientTransport via a static authProvider
   * that returns `{ access_token: tokenValue, token_type: 'bearer' }`.
   *
   * Example env var: MCP_AUTH_CONTEXT_FORGE=eyJhbGciOi...
   */
  tokenEnvVar?: string;

  /**
   * Environment variable name containing JSON-encoded HTTP headers for requestInit.
   * Used for non-MCP-spec-compliant servers that require custom auth headers.
   * The value must be a JSON object of header name → value pairs.
   *
   * Example env var: MCP_HEADERS_LEGACY_SERVER={"X-API-Key":"abc123"}
   */
  headersEnvVar?: string;
}

/**
 * Configuration for an MCP server connection.
 * Loaded from /etc/dot-ai-mcp/mcp-servers.json (mounted via Helm ConfigMap).
 */
export interface McpServerConfig {
  /** Unique server name (e.g., "prometheus", "jaeger") */
  name: string;
  /** MCP server HTTP endpoint URL (e.g., "http://prometheus-mcp.monitoring.svc:3000") */
  endpoint: string;
  /** Which dot-ai operations this server's tools should be available to */
  attachTo: McpAttachableOperation[];
  /** Optional timeout in milliseconds for MCP requests (default: 30000) */
  timeout?: number;
  /**
   * Optional authentication configuration for this MCP server.
   * When omitted, no authentication is used (backward compatible).
   * PRD #414: MCP Client Outbound Authentication
   */
  auth?: McpServerAuthConfig;
}

/**
 * Tool definition discovered from an MCP server via client.listTools()
 */
export interface McpToolDefinition {
  /** Original tool name from MCP server */
  name: string;
  /** Tool description */
  description?: string;
  /** JSON Schema for tool input */
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP server metadata after successful discovery
 */
export interface DiscoveredMcpServer {
  /** Server name from config */
  name: string;
  /** Server endpoint URL */
  endpoint: string;
  /** Which operations this server is attached to */
  attachTo: McpAttachableOperation[];
  /** Server version from MCP protocol (if available) */
  version?: string;
  /** Tools provided by this server */
  tools: McpToolDefinition[];
  /** Discovery timestamp */
  discoveredAt: Date;
}

/**
 * Stats about MCP server connections
 */
export interface McpServerStats {
  /** Number of connected servers */
  serverCount: number;
  /** Total number of discovered tools across all servers */
  toolCount: number;
  /** Names of connected servers */
  servers: string[];
}

/**
 * Error thrown when MCP server discovery fails
 */
export class McpDiscoveryError extends Error {
  constructor(
    message: string,
    public readonly failedServers: Array<{ name: string; error: string }>
  ) {
    super(message);
    this.name = 'McpDiscoveryError';
  }
}
