/**
 * Choose Solution Tool - Select a solution and return its questions
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import * as fs from 'fs';
import * as path from 'path';
import { getAndValidateSessionDirectory } from '../core/session-utils';

// Tool metadata for direct MCP registration
export const CHOOSESOLUTION_TOOL_NAME = 'chooseSolution';
export const CHOOSESOLUTION_TOOL_DESCRIPTION = 'Select a solution by ID and return its questions for configuration';

// Zod schema for MCP registration
export const CHOOSESOLUTION_TOOL_INPUT_SCHEMA = {
  solutionId: z.string().regex(/^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$/).describe('The solution ID to choose (e.g., sol_2025-07-01T154349_1e1e242592ff)')
};


/**
 * Validate solution ID format
 */
function validateSolutionId(solutionId: string): void {
  const pattern = /^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$/;
  if (!pattern.test(solutionId)) {
    throw new Error(`Invalid solution ID format: ${solutionId}. Expected format: sol_YYYY-MM-DDTHHMMSS_hexstring`);
  }
}

/**
 * Load solution file by ID
 */
function loadSolutionFile(solutionId: string, sessionDir: string): any {
  const solutionPath = path.join(sessionDir, `${solutionId}.json`);
  
  if (!fs.existsSync(solutionPath)) {
    throw new Error(`Solution file not found: ${solutionPath}. Available files: ${fs.readdirSync(sessionDir).filter(f => f.endsWith('.json')).join(', ')}`);
  }
  
  try {
    const content = fs.readFileSync(solutionPath, 'utf8');
    const solution = JSON.parse(content);
    
    // Validate solution structure
    if (!solution.solutionId || !solution.questions) {
      throw new Error(`Invalid solution file structure: ${solutionId}. Missing required fields: solutionId or questions`);
    }
    
    return solution;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in solution file: ${solutionId}. ${error.message}`);
    }
    throw error;
  }
}

/**
 * Direct MCP tool handler for chooseSolution functionality
 */
export async function handleChooseSolutionTool(
  args: { solutionId: string },
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Handling chooseSolution request', { requestId, solutionId: args?.solutionId });

      // Input validation is handled automatically by MCP SDK with Zod schema
      // args are already validated and typed when we reach this point
      
      // Get session directory from environment
      let sessionDir: string;
      try {
        sessionDir = getAndValidateSessionDirectory(args, false); // requireWrite=false
        logger.debug('Session directory resolved and validated', { sessionDir });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          error instanceof Error ? error.message : 'Session directory validation failed',
          {
            operation: 'session_directory_validation',
            component: 'ChooseSolutionTool',
            requestId,
            suggestedActions: [
              'Ensure session directory exists and is readable',
              'Check directory permissions',
              'Verify the directory path is correct',
              'Verify DOT_AI_SESSION_DIR environment variable is correctly set'
            ]
          }
        );
      }
      
      // Load solution file
      let solution: any;
      try {
        solution = loadSolutionFile(args.solutionId, sessionDir);
        logger.debug('Solution file loaded successfully', { 
          solutionId: args.solutionId,
          hasQuestions: !!solution.questions,
          questionCategories: {
            required: solution.questions?.required?.length || 0,
            basic: solution.questions?.basic?.length || 0,
            advanced: solution.questions?.advanced?.length || 0,
            hasOpen: !!solution.questions?.open
          }
        });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.STORAGE,
          ErrorSeverity.HIGH,
          error instanceof Error ? error.message : 'Failed to load solution file',
          {
            operation: 'solution_file_load',
            component: 'ChooseSolutionTool',
            requestId,
            input: { solutionId: args.solutionId, sessionDir },
            suggestedActions: [
              'Check that the solution ID is correct',
              'Verify the solution file exists in the session directory',
              'Ensure the solution was created by a recent recommend tool call',
              'List available solution files in the session directory'
            ]
          }
        );
      }
      
      // Prepare response with solution details and questions
      const response = {
        status: 'stage_questions',
        solutionId: solution.solutionId,
        currentStage: 'required',
        questions: solution.questions.required || [],
        nextStage: 'basic',
        message: 'Please provide the required configuration for your application.',
        nextAction: 'answerQuestion',
        guidance: 'Answer questions in this stage or skip to proceed to the next stage. Do NOT try to generate manifests yet.',
        timestamp: new Date().toISOString()
      };
      
      logger.info('Choose solution completed successfully', {
        solutionId: args.solutionId,
        sessionDir,
        questionCategories: {
          required: solution.questions.required?.length || 0,
          basic: solution.questions.basic?.length || 0,
          advanced: solution.questions.advanced?.length || 0,
          hasOpen: !!solution.questions.open
        },
        totalQuestions: (solution.questions.required?.length || 0) + 
                       (solution.questions.basic?.length || 0) + 
                       (solution.questions.advanced?.length || 0) + 
                       (solution.questions.open ? 1 : 0)
      });
      
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(response, null, 2)
        }]
      };
    },
    {
      operation: 'choose_solution',
      component: 'ChooseSolutionTool',
      requestId,
      input: args
    }
  );
}

