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
import { discoverOperations, mapIntentToOperation, getOperationParameters, createSession, loadSession, executeOperation } from '../core/platform-operations';
import { DotAI } from '../core/index';

// Tool metadata for MCP registration
export const BUILD_PLATFORM_TOOL_NAME = 'buildPlatform';
export const BUILD_PLATFORM_TOOL_DESCRIPTION = 'AI-powered platform operations tool for building and managing Kubernetes platforms. Use this to: (1) LIST/DISCOVER what tools and operations are available - use stage="list" when user asks "what can I install", "show available tools", "list platform capabilities", (2) INSTALL/CREATE platform components like Argo CD, Crossplane, cert-manager, Kubernetes clusters through natural language intent. Handles tool installation, cluster creation, and platform configuration conversationally.';

/**
 * Create execution started response (terminal state - no further MCP calls needed)
 */
function createExecutionResponse(tool: string, operation: string): any {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: true,
        execution: {
          tool,
          operation,
          status: 'started',
          message: `${tool} ${operation} execution started. Monitor progress using kubectl or other cluster tools. No further action required.`
        }
      }, null, 2)
    }]
  };
}

// Tool input schema
export const BUILD_PLATFORM_TOOL_INPUT_SCHEMA = {
  stage: z.string().optional()
    .describe('Workflow stage: "list" (discover all operations) or "submitAnswers" (submit answers and execute). Omit when providing intent for the first time.'),

  intent: z.string().optional()
    .describe('Natural language intent describing what platform operation to perform (e.g., "Install Argo CD", "Create AWS cluster"). Used when stage is omitted.'),

  sessionId: z.string().optional()
    .describe('Session ID for continuing a multi-step workflow (required for submitAnswers stage)'),

  answers: z.record(z.any()).optional()
    .describe('Parameter answers for submitAnswers stage (e.g., {"host-name": "example.com", "apply-apps": true})')
};

/**
 * Main tool handler - Phase 1 & 2: Script discovery and intent mapping
 */
export async function handleBuildPlatformTool(
  args: any,
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    const { stage, intent, sessionId, answers } = args;

    logger.info('Processing buildPlatform tool request', {
      requestId,
      stage,
      hasIntent: !!intent,
      hasSessionId: !!sessionId,
      hasAnswers: !!answers
    });

    // Validate required parameters - either stage or intent must be provided
    if (!stage && !intent) {
      logger.warn('buildPlatform request missing both stage and intent parameters', { requestId });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: {
              message: 'Either stage or intent parameter is required. Use stage: "list" to discover operations, or provide intent like "Install Argo CD"'
            }
          }, null, 2)
        }]
      };
    }

    // Validate Nushell runtime availability
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

    // Phase 2: Handle stage: 'list' - discover all operations
    if (stage === 'list') {
      logger.info('Discovering available operations', { requestId });

      const operations = await discoverOperations(dotAI.ai, logger);

      const result = {
        success: true,
        operations,
        message: `Found ${operations.length} platform tools. Present to user as numbered list showing each tool's available operations (install/delete/create/etc). When user selects (by number or name), convert their selection to natural language intent and call this tool again with the 'intent' parameter (e.g., intent: 'Install Crossplane' or 'Delete ACK').`
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2)
        }]
      };
    }

    // Phase 3: Handle stage: 'submitAnswers' - execute with collected parameters
    if (stage === 'submitAnswers') {
      if (!sessionId) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                message: 'sessionId is required for submitAnswers stage'
              }
            }, null, 2)
          }]
        };
      }

      logger.info('Processing submitAnswers stage', { requestId, sessionId });

      // Load session
      const session = loadSession(sessionId, logger);
      if (!session) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                message: `Session ${sessionId} not found`
              }
            }, null, 2)
          }]
        };
      }

      // Execute operation with answers
      const executionResult = await executeOperation(session, answers || {}, logger);

      if (!executionResult.success) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                message: executionResult.error,
                missingParameters: executionResult.missingParameters
              }
            }, null, 2)
          }]
        };
      }

      return createExecutionResponse(session.data.matchedOperation.tool, session.data.matchedOperation.operation);
    }

    // Phase 3: Intent-based workflow with AI mapping and parameter discovery
    logger.info('Nushell runtime validated, starting intent mapping', {
      requestId,
      intent
    });

    // Discover operations for intent mapping
    const operations = await discoverOperations(dotAI.ai, logger);

    // Map intent to operation using AI
    const mapping = await mapIntentToOperation(intent!, operations, dotAI.ai, logger);

    // Handle no match case
    if (!mapping.matched) {
      logger.info('No matching operation found for intent', {
        requestId,
        intent,
        reason: mapping.reason
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: {
              message: mapping.reason || 'No matching operation found for the given intent',
              suggestion: 'Use stage: \'list\' to see all available operations'
            }
          }, null, 2)
        }]
      };
    }

    // Get parameters for the matched operation
    const parameters = await getOperationParameters(mapping.operation!.command, logger);

    logger.info('Intent mapped and parameters retrieved', {
      requestId,
      tool: mapping.operation!.tool,
      parameterCount: parameters.length
    });

    // Create and persist session (GenericSessionManager generates sessionId)
    const session = await createSession(intent!, mapping.operation!, parameters, logger);

    // If no parameters, execute immediately (skip to submitAnswers stage)
    if (parameters.length === 0) {
      logger.info('No parameters required, executing immediately', {
        requestId,
        sessionId: session.sessionId
      });

      const executionResult = await executeOperation(session, {}, logger);

      if (!executionResult.success) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                message: executionResult.error
              }
            }, null, 2)
          }]
        };
      }

      return createExecutionResponse(session.data.matchedOperation.tool, session.data.matchedOperation.operation);
    }

    const result = {
      success: true,
      workflow: {
        sessionId: session.sessionId,
        intent: intent,
        matchedOperation: mapping.operation,
        parameters,
        nextStep: 'collectParameters',
        message: `Found ${parameters.length} parameters for ${mapping.operation!.tool} ${mapping.operation!.operation}. Collect answers from user (one at a time or all at once - user decides via client agent), then call this tool again with stage: "submitAnswers", sessionId: "${session.sessionId}", and answers: {param1: value1, ...}`
      }
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
