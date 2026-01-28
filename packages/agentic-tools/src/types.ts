/**
 * Shared types for the agentic-tools plugin
 *
 * Defines the HTTP interface contract between dot-ai core and this plugin.
 */

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
export interface ToolDefinition {
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
  tools: ToolDefinition[];
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
