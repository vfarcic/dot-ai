/**
 * Plugin Types for dot-ai Plugin System
 *
 * Defines the interface contract between dot-ai core and agentic plugins.
 * These types match the HTTP interface implemented by plugins like agentic-tools.
 *
 * PRD #343: kubectl Plugin Migration
 */

/**
 * Plugin configuration for discovery
 */
export interface PluginConfig {
  /** Unique plugin name */
  name: string;
  /** Plugin HTTP endpoint URL (e.g., "http://localhost:8080") */
  url: string;
  /** Optional timeout in milliseconds for plugin requests (default: 30000) */
  timeout?: number;
  /** Optional: Whether plugin is required (fail startup if unavailable) */
  required?: boolean;
}

/**
 * Request body for POST /execute
 */
export interface ExecuteRequest {
  hook: 'describe' | 'invoke';
  sessionId?: string;
  payload?: InvokePayload;
}

/**
 * Payload for invoke hook
 */
export interface InvokePayload {
  tool: string;
  args: Record<string, unknown>;
  state: Record<string, unknown>;
}

/**
 * Tool definition returned by describe hook
 */
export interface PluginToolDefinition {
  name: string;
  type: 'agentic';
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Response from describe hook
 */
export interface DescribeResponse {
  name: string;
  version: string;
  tools: PluginToolDefinition[];
}

/**
 * Successful response from invoke hook
 */
export interface InvokeSuccessResponse {
  sessionId: string;
  success: true;
  result: unknown;
  state: Record<string, unknown>;
}

/**
 * Error response from invoke hook
 */
export interface InvokeErrorResponse {
  sessionId: string;
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  state: Record<string, unknown>;
}

/**
 * Response from invoke hook (success or error)
 */
export type InvokeResponse = InvokeSuccessResponse | InvokeErrorResponse;

/**
 * Plugin metadata after successful discovery
 */
export interface DiscoveredPlugin {
  /** Plugin name from config */
  name: string;
  /** Plugin URL */
  url: string;
  /** Plugin version from describe response */
  version: string;
  /** Tools provided by this plugin */
  tools: PluginToolDefinition[];
  /** Discovery timestamp */
  discoveredAt: Date;
}
