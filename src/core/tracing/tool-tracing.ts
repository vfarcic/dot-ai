/**
 * Tool Execution Tracing for MCP Tools
 *
 * Provides generic tracing wrapper for all MCP tool executions,
 * creating INTERNAL spans with GenAI semantic conventions.
 *
 * Supports both STDIO (MCP) and HTTP (REST) transports transparently.
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { getTelemetry, McpClientInfo } from '../telemetry';

/**
 * Options for tool tracing
 */
export interface ToolTracingOptions {
  /** MCP client info for telemetry attribution */
  mcpClient?: McpClientInfo;
}

/**
 * Wraps a tool handler with OpenTelemetry tracing
 *
 * Creates an INTERNAL span for tool execution with:
 * - Tool name and input arguments
 * - Execution duration and success status
 * - Exception tracking for errors
 * - GenAI semantic conventions (gen_ai.tool.*)
 *
 * @param toolName - Name of the MCP tool being executed
 * @param args - Tool input arguments (will be serialized to JSON)
 * @param handler - Async function that implements the tool logic
 * @param options - Optional tracing options (e.g., MCP client info)
 * @returns Promise resolving to the tool handler result
 *
 * @example
 * ```typescript
 * const result = await withToolTracing('recommend', { intent: 'deploy postgres' }, async (args) => {
 *   return await handleRecommendTool(args);
 * }, { mcpClient: { name: 'claude-code', version: '1.0.0' } });
 * ```
 */
export async function withToolTracing<T, A = unknown>(
  toolName: string,
  args: A,
  handler: (args: A) => Promise<T>,
  options?: ToolTracingOptions
): Promise<T> {
  const tracer = trace.getTracer('dot-ai-mcp');

  // Create INTERNAL span for tool execution
  // Using INTERNAL kind since this is business logic within the server process
  const span = tracer.startSpan(
    `execute_tool ${toolName}`,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        // GenAI semantic conventions for tool execution
        'gen_ai.tool.name': toolName,
        'gen_ai.tool.input': JSON.stringify(args, null, 2),
        // MCP client info (if available)
        ...(options?.mcpClient && {
          'mcp.client.name': options.mcpClient.name,
          'mcp.client.version': options.mcpClient.version,
        }),
      },
    }
  );

  // Execute handler within active span context
  // This ensures any child spans (AI calls, K8s operations) become children of this span
  return await context.with(trace.setSpan(context.active(), span), async () => {
    const startTime = Date.now();
    try {
      const result = await handler(args);
      const duration = Date.now() - startTime;

      // Record success metrics
      span.setAttributes({
        'gen_ai.tool.duration_ms': duration,
        'gen_ai.tool.success': true,
      });
      span.setStatus({ code: SpanStatusCode.OK });

      // Track telemetry (fire-and-forget, async)
      getTelemetry().trackToolExecution(toolName, true, duration, options?.mcpClient);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorType = (error as Error).constructor?.name || 'Error';

      // Record error details without disrupting original error flow
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });

      // Track telemetry for failed execution (fire-and-forget, async)
      getTelemetry().trackToolExecution(toolName, false, duration, options?.mcpClient);
      getTelemetry().trackToolError(toolName, errorType, options?.mcpClient);

      // Re-throw to preserve original error handling behavior
      throw error;
    } finally {
      // Always end span regardless of success/failure
      span.end();
    }
  });
}
