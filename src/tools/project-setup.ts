/**
 * Project Setup Tool - AI-powered project governance and infrastructure setup
 * PRD #177 - GitHub Issue #178
 */

import { z } from 'zod';
import { Logger } from '../core/error-handling';
import { ProjectSetupParams, ErrorResponse } from './project-setup/types';
import { handleDiscovery } from './project-setup/discovery';
import { handleReportScan } from './project-setup/report-scan';
import { handleGenerateFile } from './project-setup/generate-file';
import { randomUUID } from 'crypto';

// Tool metadata for MCP registration
export const PROJECT_SETUP_TOOL_NAME = 'projectSetup';
export const PROJECT_SETUP_TOOL_DESCRIPTION = 'Setup project, audit repository, or generate repository files. Use this when user wants to: setup project, audit repo, check missing files, create README, add LICENSE, generate CONTRIBUTING.md, add CI/CD workflows, initialize documentation, setup governance files. Analyzes local repositories and generates missing configuration, documentation, and governance files. Does NOT handle Kubernetes deployments - use recommend for those.';

// Zod schema for MCP registration
export const PROJECT_SETUP_TOOL_INPUT_SCHEMA = {
  step: z.enum(['discover', 'reportScan', 'generateFile']).optional().describe('Workflow step: "discover" (default) starts new session and returns file list, "reportScan" analyzes scan results, "generateFile" generates specific file. Defaults to "discover" if omitted.'),
  sessionId: z.string().optional().describe('Session ID from previous step (required for reportScan and generateFile steps)'),
  existingFiles: z.array(z.string()).optional().describe('List of files that exist in the repository (required for reportScan step)'),
  selectedFiles: z.array(z.string()).optional().describe('Files user chose to generate (optional for reportScan step)'),
  fileName: z.string().optional().describe('Name of file to generate (required for generateFile step)'),
  answers: z.record(z.string()).optional().describe('Answers to questions for file generation (required for generateFile step with fileName)'),
  completedFileName: z.string().optional().describe('Confirmation that file was created (for generateFile step)')
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

      case 'generateFile':
        return await handleGenerateFileStep(args, logger, requestId);

      default:
        return createErrorResponse({
          success: false,
          error: {
            message: `Unknown step: ${step}`,
            details: 'Valid steps are: discover, reportScan, generateFile'
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

  if (!args.existingFiles) {
    return createErrorResponse({
      success: false,
      error: {
        message: 'existingFiles is required for reportScan step',
        details: 'Please provide an array of files that exist in the repository'
      }
    });
  }

  const response = await handleReportScan(
    args.sessionId,
    args.existingFiles,
    args.selectedFiles,
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
 * Handle generateFile step - Generate specific file content
 */
async function handleGenerateFileStep(
  args: ProjectSetupParams,
  logger: Logger,
  requestId: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Validate required parameters
  if (!args.sessionId) {
    return createErrorResponse({
      success: false,
      error: {
        message: 'sessionId is required for generateFile step',
        details: 'Please provide the sessionId from previous steps'
      }
    });
  }

  const response = await handleGenerateFile(
    args.sessionId,
    args.fileName,
    args.answers,
    args.completedFileName,
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
