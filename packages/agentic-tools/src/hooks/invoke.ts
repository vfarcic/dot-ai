/**
 * Invoke Hook
 *
 * Routes tool invocations to the appropriate handler.
 * Called by dot-ai when the LLM requests a tool execution.
 */

import { InvokePayload, InvokeResponse } from '../types';
import { TOOL_HANDLERS } from '../tools';

/**
 * Handle invoke hook request
 * Routes to the appropriate tool handler and returns result
 */
export async function handleInvoke(
  sessionId: string,
  payload: InvokePayload
): Promise<InvokeResponse> {
  const { tool, args, state } = payload;

  const handler = TOOL_HANDLERS[tool];

  if (!handler) {
    return {
      sessionId,
      success: false,
      error: {
        code: 'UNKNOWN_TOOL',
        message: `Tool '${tool}' is not implemented`,
        details: {
          availableTools: Object.keys(TOOL_HANDLERS)
        }
      },
      state
    };
  }

  try {
    const result = await handler(args);
    return {
      sessionId,
      success: true,
      result,
      state
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      sessionId,
      success: false,
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: errorMessage,
        details: {
          tool,
          args
        }
      },
      state
    };
  }
}
