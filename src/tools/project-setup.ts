/**
 * Project Setup Tool - AI-powered project governance and infrastructure setup
 * PRD #177 - GitHub Issue #178
 */

import { z } from 'zod';
import { Logger } from '../core/error-handling';
import { ProjectSetupParams, ErrorResponse } from './project-setup/types';
import { handleDiscovery } from './project-setup/discovery';
import { handleReportScan } from './project-setup/report-scan';
import { handleGenerateScope } from './project-setup/generate-scope';
import { randomUUID } from 'crypto';
import { maybeGetFeedbackMessage, buildAgentDisplayBlock } from '../core/index';

// Tool metadata for MCP registration
export const PROJECT_SETUP_TOOL_NAME = 'projectSetup';
export const PROJECT_SETUP_TOOL_DESCRIPTION = 'Setup project, audit repository, or generate repository files. Use this when user wants to: setup project, audit repo, check missing files, create README, add LICENSE, generate CONTRIBUTING.md, add CI/CD workflows, initialize documentation, setup governance files. Analyzes local repositories and generates missing configuration, documentation, and governance files. Does NOT handle Kubernetes deployments - use recommend for those.';

// Zod schema for MCP registration
export const PROJECT_SETUP_TOOL_INPUT_SCHEMA = {
  step: z.enum(['discover', 'reportScan', 'generateScope']).optional().describe('Workflow step: "discover" (default) starts new session and returns file list, "reportScan" analyzes scan results, "generateScope" generates all files in a scope. Defaults to "discover" if omitted.'),
  sessionId: z.string().optional().describe('Session ID from previous step (required for reportScan and generateScope steps)'),
  existingFiles: z.array(z.string()).optional().describe('List of files that exist in the repository (required for first reportScan call, optional for subsequent calls with selectedScopes)'),
  selectedScopes: z.array(z.string()).optional().describe('Scopes user chose to setup (e.g., ["readme", "legal", "github-community"]) (required for reportScan step after initial scan)'),
  scope: z.string().optional().describe('Scope to generate (e.g., "github-community") (required for generateScope step)'),
  answers: z.record(z.string(), z.any()).optional().describe('Answers to ALL questions for the scope (required for generateScope step)')
};

/**
 * Main handler for Project Setup Tool
 * Routes to appropriate handler based on step parameter
 */
export async function handleProjectSetupTool(
  args: ProjectSetupParams,
  logger: Logger
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const requestId = randomUUID();

  try {
    logger.info('Project setup tool invoked', {
      requestId,
      step: args.step || 'discover',
      sessionId: args.sessionId
    });

    // Route based on step
    const step = args.step || 'discover';

    switch (step) {
      case 'discover':
        return await handleDiscoverStep(logger, requestId);

      case 'reportScan':
        return await handleReportScanStep(args, logger, requestId);

      case 'generateScope':
        return await handleGenerateScopeStep(args, logger, requestId);

      default:
        return createErrorResponse({
          success: false,
          error: {
            message: `Unknown step: ${step}`,
            details: 'Valid steps are: discover, reportScan, generateScope'
          }
        });
    }
  } catch (error) {
    logger.error('Project setup tool request failed', error as Error, { requestId });

    return createErrorResponse({
      success: false,
      error: {
        message: 'Tool execution failed',
        details: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

/**
 * Handle discover step - Start new session and return file list
 */
async function handleDiscoverStep(
  logger: Logger,
  requestId: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const response = await handleDiscovery(logger, requestId);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2)
    }]
  };
}

/**
 * Handle reportScan step - Analyze scan results and identify gaps
 */
async function handleReportScanStep(
  args: ProjectSetupParams,
  logger: Logger,
  requestId: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Validate required parameters
  if (!args.sessionId) {
    return createErrorResponse({
      success: false,
      error: {
        message: 'sessionId is required for reportScan step',
        details: 'Please provide the sessionId from the discover step'
      }
    });
  }

  const response = await handleReportScan(
    args.sessionId,
    args.existingFiles,
    args.selectedScopes,
    logger,
    requestId
  );

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2)
    }]
  };
}

/**
 * Handle generateScope step - Generate all files in a scope
 */
async function handleGenerateScopeStep(
  args: ProjectSetupParams,
  logger: Logger,
  requestId: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Validate required parameters
  if (!args.sessionId) {
    return createErrorResponse({
      success: false,
      error: {
        message: 'sessionId is required for generateScope step',
        details: 'Please provide the sessionId from previous steps'
      }
    });
  }

  const response = await handleGenerateScope(
    args.sessionId,
    args.scope,
    args.answers,
    logger,
    requestId
  );

  // Get feedback message for successful responses
  const feedbackMessage = response.success ? maybeGetFeedbackMessage() : '';

  // Build response with optional feedback message in JSON
  const responseData = {
    ...response,
    ...(feedbackMessage ? { feedbackMessage } : {})
  };

  // Build content blocks - JSON for REST API, agent instruction for MCP agents
  const content: Array<{ type: string; text: string }> = [{
    type: 'text',
    text: JSON.stringify(responseData, null, 2)
  }];

  // Add agent instruction block if feedback message is present
  const agentDisplayBlock = buildAgentDisplayBlock({ feedbackMessage });
  if (agentDisplayBlock) {
    content.push(agentDisplayBlock);
  }

  return { content };
}

/**
 * Helper to create error response
 */
function createErrorResponse(error: ErrorResponse): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(error, null, 2)
    }]
  };
}
