/**
 * Build Platform Tool for MCP Server
 *
 * AI-powered tool that enables users to build and manage Kubernetes platforms
 * through natural language intent. Handles script discovery, parameter collection,
 * and execution transparently.
 *
 * Phase 1: Basic invocation and Nushell runtime validation
 */

import { z } from 'zod';
import { Logger } from '../core/error-handling';
import { NushellRuntime } from '../core/nushell-runtime';
import { randomUUID } from 'crypto';

// Tool metadata for MCP registration
export const BUILD_PLATFORM_TOOL_NAME = 'buildPlatform';
export const BUILD_PLATFORM_TOOL_DESCRIPTION = 'AI-powered platform operations tool that enables building and managing internal developer platforms (IDPs) through natural language intent. Handles tool installation, cluster creation, and platform configuration conversationally.';

// Tool input schema
export const BUILD_PLATFORM_TOOL_INPUT_SCHEMA = {
  intent: z.string()
    .describe('Natural language intent describing what platform operation to perform (e.g., "Install Argo CD", "Create AWS cluster")'),

  sessionId: z.string().optional()
    .describe('Session ID for continuing a multi-step workflow'),

  response: z.string().optional()
    .describe('User response to a workflow question (parameter value)')
};

/**
 * Main tool handler - Phase 1: Basic invocation and Nushell validation
 */
export async function handleBuildPlatformTool(
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    const { intent, sessionId, response } = args;

    logger.info('Processing buildPlatform tool request', {
      requestId,
      hasIntent: !!intent,
      hasSessionId: !!sessionId,
      hasResponse: !!response
    });

    // Phase 1: Validate required parameters
    if (!intent) {
      logger.warn('buildPlatform request missing required intent parameter', { requestId });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: {
              message: 'Intent parameter is required. Provide natural language intent like "Install Argo CD" or "Create Kubernetes cluster"'
            }
          }, null, 2)
        }]
      };
    }

    // Phase 1: Validate Nushell runtime availability
    const runtime = new NushellRuntime();
    const validation = await runtime.validateRuntime();

    if (!validation.ready) {
      logger.warn('Nushell runtime not available', {
        requestId,
        error: validation.message
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: {
              message: 'Nushell runtime required for platform operations',
              details: validation.message,
              installationUrl: validation.installationUrl
            }
          }, null, 2)
        }]
      };
    }

    // Phase 1: Nushell available - create workflow session
    const workflowSessionId = sessionId || `platform-${Date.now()}-${randomUUID()}`;

    logger.info('Nushell runtime validated, starting workflow', {
      requestId,
      sessionId: workflowSessionId,
      intent
    });

    // Phase 1: Return workflow started response
    // (Later phases will add: script discovery, parameter collection, execution)
    const result = {
      success: true,
      workflow: {
        sessionId: workflowSessionId,
        intent: intent,
        nextStep: 'discover' // Phase 2 will implement script discovery
      },
      message: 'Workflow started - script discovery not yet implemented'
    };

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2)
      }]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('buildPlatform tool request failed', error as Error, { requestId });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: {
            message: 'Tool execution failed',
            details: errorMessage
          }
        }, null, 2)
      }]
    };
  }
}
