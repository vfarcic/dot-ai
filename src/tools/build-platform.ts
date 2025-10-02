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
import { ClaudeIntegration } from '../core/claude';
import { discoverOperations } from '../core/platform-operations';
import { DotAI } from '../core/index';
import { randomUUID } from 'crypto';

// Tool metadata for MCP registration
export const BUILD_PLATFORM_TOOL_NAME = 'buildPlatform';
export const BUILD_PLATFORM_TOOL_DESCRIPTION = 'AI-powered platform operations tool for building and managing Kubernetes platforms. Use this to: (1) LIST/DISCOVER what tools and operations are available - use stage="list" when user asks "what can I install", "show available tools", "list platform capabilities", (2) INSTALL/CREATE platform components like Argo CD, Crossplane, cert-manager, Kubernetes clusters through natural language intent. Handles tool installation, cluster creation, and platform configuration conversationally.';

// Tool input schema
export const BUILD_PLATFORM_TOOL_INPUT_SCHEMA = {
  stage: z.string().optional()
    .describe('Workflow stage - "list" to discover all available operations'),

  intent: z.string().optional()
    .describe('Natural language intent describing what platform operation to perform (e.g., "Install Argo CD", "Create AWS cluster")'),

  sessionId: z.string().optional()
    .describe('Session ID for continuing a multi-step workflow'),

  response: z.string().optional()
    .describe('User response to a workflow question (parameter value)')
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
    const { stage, intent, sessionId, response } = args;

    logger.info('Processing buildPlatform tool request', {
      requestId,
      stage,
      hasIntent: !!intent,
      hasSessionId: !!sessionId,
      hasResponse: !!response
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

      // Create Claude integration instance
      const claudeApiKey = process.env.ANTHROPIC_API_KEY;
      if (!claudeApiKey) {
        logger.warn('ANTHROPIC_API_KEY not set', { requestId });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: {
                message: 'ANTHROPIC_API_KEY environment variable is required for AI-powered script discovery'
              }
            }, null, 2)
          }]
        };
      }

      const claudeIntegration = new ClaudeIntegration(claudeApiKey);
      const operations = await discoverOperations(claudeIntegration, logger);

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

    // Phase 1: Intent-based workflow (to be enhanced in future phases)
    const workflowSessionId = sessionId || `platform-${Date.now()}-${randomUUID()}`;

    logger.info('Nushell runtime validated, starting workflow', {
      requestId,
      sessionId: workflowSessionId,
      intent
    });

    const result = {
      success: true,
      workflow: {
        sessionId: workflowSessionId,
        intent: intent,
        nextStep: 'discover'
      },
      message: 'Workflow started - intent mapping not yet implemented'
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
