/**
 * Choose Solution Tool - Select a solution and return its questions
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import { GenericSessionManager } from '../core/generic-session-manager';
import type { SolutionData } from './recommend';

// Tool metadata for direct MCP registration
export const CHOOSESOLUTION_TOOL_NAME = 'chooseSolution';
export const CHOOSESOLUTION_TOOL_DESCRIPTION = 'Select a solution by ID and return its questions for configuration';

// Zod schema for MCP registration
export const CHOOSESOLUTION_TOOL_INPUT_SCHEMA = {
  solutionId: z.string().regex(/^sol-\d+-[a-f0-9]{8}$/).describe('The solution ID to choose (e.g., sol-1762983784617-9ddae2b8)')
};

// Session management now handled by GenericSessionManager

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

      // Initialize session manager
      const sessionManager = new GenericSessionManager<SolutionData>('sol');
      logger.debug('Session manager initialized', { requestId });

      // Load solution session
      const session = sessionManager.getSession(args.solutionId);

      if (!session) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Solution not found: ${args.solutionId}`,
          {
            operation: 'solution_loading',
            component: 'ChooseSolutionTool',
            requestId,
            input: { solutionId: args.solutionId },
            suggestedActions: [
              'Verify the solution ID is correct',
              'Ensure the solution was created by the recommend tool',
              'Check that the session has not expired'
            ]
          }
        );
      }

      const solution = session.data;

      // For Helm solutions, generate questions if not already present
      if (solution.type === 'helm' && solution.chart) {
        const hasQuestions = (solution.questions?.required?.length ?? 0) > 0 ||
                            (solution.questions?.basic?.length ?? 0) > 0 ||
                            (solution.questions?.advanced?.length ?? 0) > 0;

        if (!hasQuestions) {
          logger.info('Generating questions for Helm solution', {
            requestId,
            solutionId: args.solutionId,
            chart: solution.chart.chartName
          });

          const questions = await dotAI.schema.generateQuestionsForHelmChart(
            solution.intent,
            solution.chart,
            solution.description,
            `choose_solution_${args.solutionId}`
          );

          solution.questions = questions;

          // Update the session with generated questions
          sessionManager.updateSession(args.solutionId, solution);

          logger.info('Helm questions generated and saved', {
            requestId,
            solutionId: args.solutionId,
            questionCounts: {
              required: questions.required?.length || 0,
              basic: questions.basic?.length || 0,
              advanced: questions.advanced?.length || 0
            }
          });
        }
      }

      logger.debug('Solution file loaded successfully', {
        solutionId: args.solutionId,
        type: solution.type,
        hasQuestions: !!solution.questions,
        questionCategories: {
          required: solution.questions?.required?.length || 0,
          basic: solution.questions?.basic?.length || 0,
          advanced: solution.questions?.advanced?.length || 0,
          hasOpen: !!solution.questions?.open
        }
      });

      // Prepare response with solution details and questions
      const response = {
        status: 'stage_questions',
        solutionId: args.solutionId,
        currentStage: 'required',
        questions: solution.questions.required || [],
        nextStage: 'basic',
        message: 'Please provide the required configuration for your application.',
        nextAction: 'Call recommend tool with stage: answerQuestion:required',
        guidance: 'Answer questions in this stage or skip to proceed to the next stage. Do NOT try to generate manifests yet.',
        timestamp: new Date().toISOString()
      };
      
      logger.info('Choose solution completed successfully', {
        solutionId: args.solutionId,
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

