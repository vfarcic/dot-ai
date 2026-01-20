/**
 * PostHog Telemetry Type Definitions
 *
 * Defines types for anonymous usage telemetry.
 */

/**
 * Telemetry configuration loaded from environment
 */
export interface TelemetryConfig {
  /** Whether telemetry is enabled (default: true, can be disabled via DOT_AI_TELEMETRY=false) */
  enabled: boolean;
  /** PostHog API key (public, safe to expose) */
  posthogKey: string;
  /** PostHog host URL */
  posthogHost: string;
  /** dot-ai version from package.json */
  dotAiVersion: string;
  /** AI provider being used */
  aiProvider: string;
  /** Enable debug logging */
  debug: boolean;
}

/**
 * Base properties included in all telemetry events
 */
export interface BaseEventProperties {
  /** dot-ai version */
  dot_ai_version: string;
  /** AI provider (anthropic, openai, etc.) */
  ai_provider: string;
}

/**
 * Properties for tool_executed event
 */
export interface ToolExecutedEventProperties extends BaseEventProperties {
  /** Name of the tool that was executed */
  tool: string;
  /** Whether the execution was successful */
  success: boolean;
  /** Execution duration in milliseconds */
  duration_ms: number;
  /** MCP client name (e.g., "claude-code", "cursor") */
  mcp_client?: string;
  /** MCP client version */
  mcp_client_version?: string;
}

/**
 * Properties for tool_error event
 */
export interface ToolErrorEventProperties extends BaseEventProperties {
  /** Name of the tool that errored */
  tool: string;
  /** Error type/class name (not the message, for privacy) */
  error_type: string;
  /** MCP client name (e.g., "claude-code", "cursor") */
  mcp_client?: string;
  /** MCP client version */
  mcp_client_version?: string;
}

/**
 * Properties for client_connected event
 */
export interface ClientConnectedEventProperties extends BaseEventProperties {
  /** MCP client name (e.g., "claude-code", "cursor", "windsurf") */
  mcp_client: string;
  /** MCP client version */
  mcp_client_version: string;
  /** Transport type (stdio, http) */
  transport: string;
}

/**
 * Properties for server_started event
 */
export interface ServerStartedEventProperties extends BaseEventProperties {
  /** Kubernetes version if available */
  k8s_version?: string;
  /** Deployment method (helm, docker, local) */
  deployment_method?: string;
}

/**
 * Properties for server_stopped event
 */
export interface ServerStoppedEventProperties extends BaseEventProperties {
  /** Server uptime in seconds */
  uptime_seconds: number;
}

/**
 * Union of all event property types
 */
export type TelemetryEventProperties =
  | ToolExecutedEventProperties
  | ToolErrorEventProperties
  | ServerStartedEventProperties
  | ServerStoppedEventProperties
  | ClientConnectedEventProperties;

/**
 * Telemetry event names
 */
export type TelemetryEventName =
  | 'tool_executed'
  | 'tool_error'
  | 'server_started'
  | 'server_stopped'
  | 'client_connected';

/**
 * MCP client info for telemetry
 */
export interface McpClientInfo {
  name: string;
  version: string;
}

/**
 * Telemetry service interface
 */
export interface TelemetryService {
  /** Check if telemetry is enabled */
  isEnabled(): boolean;

  /** Track a telemetry event */
  trackEvent(event: TelemetryEventName, properties: TelemetryEventProperties): void;

  /** Track tool execution */
  trackToolExecution(tool: string, success: boolean, durationMs: number, mcpClient?: McpClientInfo): void;

  /** Track tool error */
  trackToolError(tool: string, errorType: string, mcpClient?: McpClientInfo): void;

  /** Track server start */
  trackServerStart(k8sVersion?: string, deploymentMethod?: string): void;

  /** Track server stop */
  trackServerStop(uptimeSeconds: number): void;

  /** Track MCP client connection */
  trackClientConnected(mcpClient: McpClientInfo, transport: string): void;

  /** Flush pending events and shutdown */
  shutdown(): Promise<void>;
}
