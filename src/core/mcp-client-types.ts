/**
 * MCP Client Types for dot-ai MCP Server Integration
 *
 * Defines the interface contract for connecting to external MCP servers.
 * MCP servers provide additional tools (e.g., Prometheus metrics, tracing)
 * that augment dot-ai's built-in kubectl/helm tools.
 *
 * PRD #358: MCP Server Integration
 */

/**
 * Valid dot-ai operations that MCP servers can attach to
 */
export type McpAttachableOperation = 'remediate' | 'operate' | 'query';

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
