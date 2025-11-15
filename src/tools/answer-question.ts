/**
 * Answer Question Tool - Process user answers and return remaining questions
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import { loadPrompt } from '../core/shared-prompt-loader';
import { GenericSessionManager } from '../core/generic-session-manager';
import type { SolutionData } from './recommend';
import { extractUserAnswers } from '../core/solution-utils';

// Tool metadata for direct MCP registration
export const ANSWERQUESTION_TOOL_NAME = 'answerQuestion';
export const ANSWERQUESTION_TOOL_DESCRIPTION = 'Process user answers and return remaining questions or completion status. For open stage, use "open" as the answer key.';

// Zod schema for MCP registration
export const ANSWERQUESTION_TOOL_INPUT_SCHEMA = {
  solutionId: z.string().regex(/^sol-\d+-[a-f0-9]{8}$/).describe('The solution ID to update (e.g., sol-1762983784617-9ddae2b8)'),
  stage: z.enum(['required', 'basic', 'advanced', 'open']).describe('The configuration stage being addressed'),
  answers: z.record(z.any()).describe('User answers to configuration questions for the specified stage. For required/basic/advanced stages, use questionId as key. For open stage, use "open" as key (e.g., {"open": "add persistent storage"})'),
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.')
};

// Session management now handled by GenericSessionManager

/**
 * Validate answer against question schema
 */
function validateAnswer(answer: any, question: any): string | null {
  // Check required validation
  if (question.validation?.required && (answer === undefined || answer === null || answer === '')) {
    return question.validation.message || `${question.question} is required`;
  }
  
  // Skip validation if answer is empty and not required
  if (answer === undefined || answer === null || answer === '') {
    return null;
  }
  
  // Type validation
  switch (question.type) {
    case 'number': {
      if (typeof answer !== 'number' && !(!isNaN(Number(answer)))) {
        return `${question.question} must be a number`;
      }
      const numValue = typeof answer === 'number' ? answer : Number(answer);
      if (question.validation?.min !== undefined && numValue < question.validation.min) {
        return `${question.question} must be at least ${question.validation.min}`;
      }
      if (question.validation?.max !== undefined && numValue > question.validation.max) {
        return `${question.question} must be at most ${question.validation.max}`;
      }
      break;
    }
      
    case 'text':
      if (typeof answer !== 'string') {
        return `${question.question} must be a string`;
      }
      if (question.validation?.pattern) {
        const pattern = new RegExp(question.validation.pattern);
        if (!pattern.test(answer)) {
          return question.validation.message || `${question.question} format is invalid`;
        }
      }
      break;
      
    case 'boolean':
      if (typeof answer !== 'boolean') {
        return `${question.question} must be true or false`;
      }
      break;
      
    case 'select':
      if (question.options && !question.options.includes(answer)) {
        return `${question.question} must be one of: ${question.options.join(', ')}`;
      }
      break;
  }
  
  return null;
}

/**
 * Get stage-specific instructions for different stages
 */
function getStageSpecificInstructions(stage: Stage): string {
  switch (stage) {
    case 'required':
      return 'STAGE: REQUIRED - All questions must be answered before proceeding. No skipping allowed.';
    case 'basic':
      return 'STAGE: BASIC - These questions can be skipped. User can provide answers or say "skip" to proceed to advanced stage.';
    case 'advanced':
      return 'STAGE: ADVANCED - These questions can be skipped. User can provide answers or say "skip" to proceed to open stage.';
    case 'open':
      return 'STAGE: OPEN - Final configuration stage. User can provide additional requirements or say "N/A" to proceed to manifest generation.';
    default:
      return 'STAGE: UNKNOWN - Present questions to the user and wait for their response.';
  }
}

/**
 * Get enhanced anti-cascade agent instructions for stage responses
 */
function getAgentInstructions(stage: Stage): string {
  const antiCascadeRule = 'CRITICAL ANTI-CASCADE RULE: When user says "skip" for ANY stage, only skip THAT specific stage and present the NEXT stage questions to the user. NEVER automatically skip multiple stages in sequence.';
  
  const mandatoryWorkflow = `
MANDATORY CLIENT AGENT WORKFLOW:
1. Present these questions to the user in natural language
2. Wait for explicit user response
3. If user provides answers: call answerQuestion with their specific answers
4. If user says "skip": call answerQuestion with empty answers object ({})
5. NEVER call answerQuestion without receiving user input first
6. NEVER assume what the user wants for subsequent stages`;

  const strictConstraints = `
STRICT BEHAVIORAL CONSTRAINTS:
- DO NOT call answerQuestion automatically
- DO NOT assume user wants to proceed to manifest generation
- DO NOT call answerQuestion with empty open stage answers unless user explicitly provides them
- DO NOT interpret "skip" as "automatically proceed to next stage"
- MUST present each stage's questions individually and wait for user response`;

  const stageSpecific = getStageSpecificInstructions(stage);
  
  return `${antiCascadeRule}\n${mandatoryWorkflow}\n${strictConstraints}\n\n${stageSpecific}`;
}

/**
 * Stage validation and progression logic
 */
type Stage = 'required' | 'basic' | 'advanced' | 'open';

interface StageState {
  currentStage: Stage;
  nextStage: Stage | null;
  hasQuestions: boolean;
  isComplete: boolean;
}

/**
 * Determine current stage based on solution state
 */
function getCurrentStage(solution: any): StageState {
  const hasRequired = solution.questions.required && solution.questions.required.length > 0;
  const hasBasic = solution.questions.basic && solution.questions.basic.length > 0;
  const hasAdvanced = solution.questions.advanced && solution.questions.advanced.length > 0;
  const hasOpen = !!solution.questions.open;

  // Check completion status
  const requiredComplete = !hasRequired || solution.questions.required.every((q: any) => q.answer !== undefined);
  const basicComplete = !hasBasic || solution.questions.basic.every((q: any) => q.answer !== undefined);
  const advancedComplete = !hasAdvanced || solution.questions.advanced.every((q: any) => q.answer !== undefined);
  const openComplete = !hasOpen || solution.questions.open.answer !== undefined;

  // Determine current stage
  if (!requiredComplete) {
    return {
      currentStage: 'required',
      nextStage: hasBasic ? 'basic' : 'open',
      hasQuestions: true,
      isComplete: false
    };
  }
  
  if (!basicComplete) {
    return {
      currentStage: 'basic',
      nextStage: hasAdvanced ? 'advanced' : 'open',
      hasQuestions: true,
      isComplete: false
    };
  }
  
  if (!advancedComplete) {
    return {
      currentStage: 'advanced', 
      nextStage: 'open',
      hasQuestions: true,
      isComplete: false
    };
  }
  
  if (!openComplete) {
    return {
      currentStage: 'open',
      nextStage: null,
      hasQuestions: hasOpen,
      isComplete: false
    };
  }

  // All stages complete
  return {
    currentStage: 'open',
    nextStage: null,
    hasQuestions: false,
    isComplete: true
  };
}

/**
 * Validate stage transition is allowed
 */
function validateStageTransition(currentStage: Stage, requestedStage: Stage, solution: any): { valid: boolean; error?: string } {
  // Allow processing the same stage (for answering or skipping)
  if (currentStage === requestedStage) {
    return { valid: true };
  }

  // Determine the next stage based on what questions exist
  let expectedNext: Stage | null = null;
  
  if (currentStage === 'required') {
    if (solution.questions.basic && solution.questions.basic.length > 0) {
      expectedNext = 'basic';
    } else if (solution.questions.advanced && solution.questions.advanced.length > 0) {
      expectedNext = 'advanced';
    } else {
      expectedNext = 'open';
    }
  } else if (currentStage === 'basic') {
    if (solution.questions.advanced && solution.questions.advanced.length > 0) {
      expectedNext = 'advanced';
    } else {
      expectedNext = 'open';
    }
  } else if (currentStage === 'advanced') {
    expectedNext = 'open';
  } else {
    expectedNext = null; // open stage is final
  }
  
  // If we're at the final stage, no transitions allowed
  if (expectedNext === null) {
    return {
      valid: false,
      error: `Cannot transition from '${currentStage}' stage. All stages completed.`
    };
  }

  // Only allow transition to the immediate next stage
  if (requestedStage !== expectedNext) {
    return {
      valid: false,
      error: `Cannot skip to '${requestedStage}' stage. Must process '${expectedNext}' stage next. Use empty answers to skip the current stage.`
    };
  }

  return { valid: true };
}

/**
 * Get questions for a specific stage
 */
function getQuestionsForStage(solution: any, stage: Stage): any[] {
  switch (stage) {
    case 'required':
      return solution.questions.required || [];
    case 'basic':
      return solution.questions.basic || [];
    case 'advanced':
      return solution.questions.advanced || [];
    case 'open':
      return solution.questions.open ? [solution.questions.open] : [];
    default:
      return [];
  }
}

/**
 * Get stage-specific message
 */
function getStageMessage(stage: Stage): string {
  switch (stage) {
    case 'required':
      return 'Please answer the required configuration questions.';
    case 'basic':
      return 'Would you like to configure basic settings?';
    case 'advanced':
      return 'Would you like to configure advanced features?';
    case 'open':
      return 'Any additional requirements or constraints?';
    default:
      return 'Configuration stage unknown.';
  }
}

/**
 * Get stage-specific guidance
 */
function getStageGuidance(stage: Stage): string {
  switch (stage) {
    case 'required':
      return 'All required questions must be answered to proceed.';
    case 'basic':
      return 'Answer questions in this stage or skip to proceed to the advanced stage. Do NOT try to generate manifests yet.';
    case 'advanced':
      return 'Answer questions in this stage or skip to proceed to the open stage. Do NOT try to generate manifests yet.';
    case 'open':
      return 'Use "N/A" if you have no additional requirements. Complete this stage before generating manifests.';
    default:
      return 'Please provide answers for this stage.';
  }
}



/**
 * Phase 1: Analyze what resources are needed for the user request
 */
async function analyzeResourceNeeds(
  currentSolution: any,
  openResponse: string,
  context: { requestId: string; logger: Logger; dotAI: DotAI },
  interaction_id?: string
): Promise<any> {
  // Get available resources from solution or use defaults
  const availableResources = currentSolution.availableResources || {
    resources: [],
    custom: []
  };

  // Extract resource types for analysis
  const availableResourceTypes = [
    ...(availableResources.resources || []),
    ...(availableResources.custom || [])
  ].map((r: any) => r.kind || r);

  const analysisPrompt = loadPrompt('resource-analysis', {
    current_solution: JSON.stringify(currentSolution, null, 2),
    user_request: openResponse,
    available_resource_types: JSON.stringify(availableResourceTypes, null, 2)
  });

  // Get AI provider from context
  const aiProvider = context.dotAI.ai;

  context.logger.info('Analyzing resource needs for open question', {
    openResponse,
    availableResourceCount: availableResourceTypes.length
  });

  try {
    const response = await aiProvider.sendMessage(analysisPrompt, 'answer-question-resource-analysis', {
      user_intent: openResponse,
      interaction_id: interaction_id
    });
    const analysisResult = parseEnhancementResponse(response.content);
    
    // Check for capability gap and throw specific error
    if (analysisResult.approach === 'capability_gap') {
      context.logger.error('Capability gap detected in resource analysis', new Error(
        `Capability gap for solution ${currentSolution.solutionId}: ${analysisResult.requestedCapability} - ${analysisResult.integrationIssue}`
      ));
      
      const capabilityGapError = new Error(
        `Enhancement capability gap: ${analysisResult.reasoning}. ${analysisResult.integrationIssue}. Suggested action: ${analysisResult.suggestedAction}`
      );
      capabilityGapError.name = 'CapabilityGapError';
      throw capabilityGapError;
    }
    
    return analysisResult;
  } catch (error) {
    // If it's already a capability gap error, re-throw it
    if (error instanceof Error && error.name === 'CapabilityGapError') {
      throw error;
    }
    
    context.logger.error('Resource analysis failed', error as Error);
    throw error;
  }
}

/**
 * Phase 2: Apply enhancements based on analysis result
 */
async function applySolutionEnhancement(
  solution: any,
  openResponse: string,
  analysisResult: any,
  context: { requestId: string; logger: Logger; dotAI: DotAI },
  interaction_id?: string
): Promise<any> {
  if (analysisResult.approach === 'capability_gap') {
    throw new Error(`Enhancement capability gap: ${analysisResult.reasoning}. ${analysisResult.suggestedAction}`);
  }
  
  if (analysisResult.approach === 'complete_existing_questions') {
    // Auto-populate existing questions based on user requirements
    context.logger.info('Auto-populating existing questions based on requirements', {
      approach: analysisResult.approach,
      reasoning: analysisResult.reasoning
    });

    return autoPopulateQuestions(solution, openResponse, analysisResult, context, interaction_id);
  }
  
  if (analysisResult.approach === 'add_resources') {
    // Add new resources and their questions
    context.logger.info('Adding new resources to solution', {
      approach: analysisResult.approach,
      suggestedResources: analysisResult.suggestedResources
    });
    
    return addResourcesAndQuestions(solution, openResponse, analysisResult, context);
  }
  
  // Default: no changes needed
  return solution;
}

/**
 * Auto-populate existing questions based on user requirements
 */
async function autoPopulateQuestions(
  solution: any,
  openResponse: string,
  analysisResult: any,
  context: { requestId: string; logger: Logger; dotAI: DotAI },
  interaction_id?: string
): Promise<any> {
  const enhancementPrompt = loadPrompt('solution-enhancement', {
    current_solution: JSON.stringify(solution, null, 2),
    detailed_schemas: JSON.stringify(solution.schemas || {}, null, 2),
    analysis_result: JSON.stringify(analysisResult, null, 2),
    open_response: openResponse
  });

  // Get AI provider from context
  const aiProvider = context.dotAI.ai;

  const response = await aiProvider.sendMessage(enhancementPrompt, 'answer-question-solution-enhancement', {
    user_intent: openResponse,
    interaction_id: interaction_id
  });
  const enhancementData = parseEnhancementResponse(response.content);
  
  if (enhancementData.enhancedSolution) {
    return enhancementData.enhancedSolution;
  }
  
  return solution;
}

/**
 * Add new resources and their questions to the solution
 */
async function addResourcesAndQuestions(
  solution: any,
  openResponse: string,
  analysisResult: any,
  context: { requestId: string; logger: Logger; dotAI: DotAI }
): Promise<any> {
  // For now, implement basic resource addition
  // This would need more sophisticated question generation for new resources
  context.logger.warn('Resource addition not fully implemented yet', {
    suggestedResources: analysisResult.suggestedResources
  });
  
  // TODO: Implement full resource addition with question generation
  return solution;
}

/**
 * Parse AI response (handles both JSON and text responses)
 */
function parseEnhancementResponse(content: string): any {
  try {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // If no JSON found, return error
    throw new Error('No valid JSON found in AI response');
  } catch (error) {
    throw new Error(`Failed to parse AI response: ${error}`);
  }
}

/**
 * Enhance solution with AI analysis of open question
 */
async function enhanceSolutionWithOpenAnswer(
  solution: any,
  openAnswer: string,
  context: { requestId: string; logger: Logger; dotAI: DotAI },
  interaction_id?: string
): Promise<any> {
  try {
    context.logger.info('Starting AI enhancement of solution', {
      solutionId: solution.solutionId,
      openAnswer
    });
    
    // Phase 1: Analyze what resources are needed
    const analysisResult = await analyzeResourceNeeds(solution, openAnswer, context, interaction_id);
    
    // Phase 2: Apply enhancements based on analysis
    const enhancedSolution = await applySolutionEnhancement(solution, openAnswer, analysisResult, context, interaction_id);
    
    context.logger.info('AI enhancement completed', {
      approach: analysisResult.approach,
      changed: enhancedSolution !== solution
    });
    
    return enhancedSolution;
  } catch (error) {
    context.logger.error('Solution enhancement failed', error as Error);
    throw error;
  }
}


/**
 * Direct MCP tool handler for answerQuestion functionality
 */
export async function handleAnswerQuestionTool(
  args: { solutionId: string; stage: 'required' | 'basic' | 'advanced' | 'open'; answers: Record<string, any>; interaction_id?: string },
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Handling answerQuestion request', { 
        requestId, 
        solutionId: args?.solutionId,
        stage: args?.stage,
        answerCount: Object.keys(args?.answers || {}).length
      });

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
            component: 'AnswerQuestionTool',
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

      let solution = session.data;
      logger.debug('Solution loaded successfully', {
        solutionId: args.solutionId,
        hasQuestions: !!solution.questions
      });
      
      // Stage-based validation and workflow
      const stageState = getCurrentStage(solution);
      
      // Validate stage transition
      const transitionResult = validateStageTransition(stageState.currentStage, args.stage as Stage, solution);
      if (!transitionResult.valid) {
        const response = {
          status: 'stage_error',
          solutionId: args.solutionId,
          error: 'invalid_transition',
          expected: stageState.currentStage,
          received: args.stage,
          message: transitionResult.error,
          nextStage: stageState.nextStage,
          timestamp: new Date().toISOString()
        };
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      }

      // Validate answers against questions for the requested stage
      const stageQuestions = getQuestionsForStage(solution, args.stage as Stage);
      const validationErrors: string[] = [];
      
      for (const [questionId, answer] of Object.entries(args.answers)) {
        // For open stage, handle special case since open question doesn't have 'id' property
        if (args.stage === 'open') {
          // Only allow 'open' as the question ID for open stage
          if (questionId !== 'open') {
            validationErrors.push(`Invalid question ID '${questionId}' for open stage. Use "open" as the key, e.g., {"open": "add persistent storage"}.`);
            continue;
          }
          // Skip further validation for open stage as it doesn't follow Question interface
          continue;
        }
        
        const question = stageQuestions.find(q => q.id === questionId);
        if (!question) {
          validationErrors.push(`Unknown question ID '${questionId}' for stage '${args.stage}'`);
          continue;
        }
        
        const error = validateAnswer(answer, question);
        if (error) {
          validationErrors.push(error);
        }
      }
      
      if (validationErrors.length > 0) {
        const response = {
          status: 'stage_error',
          solutionId: args.solutionId,
          error: 'validation_failed',
          validationErrors,
          currentStage: args.stage,
          message: 'Answer validation failed for stage questions',
          timestamp: new Date().toISOString()
        };
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      }
      
      // Update solution with answers for the current stage
      if (args.stage === 'open') {
        // Handle open question
        const openAnswer = args.answers.open;
        if (openAnswer && solution.questions.open) {
          solution.questions.open.answer = openAnswer;
        }
      } else {
        // Handle structured questions
        for (const [questionId, answer] of Object.entries(args.answers)) {
          const question = stageQuestions.find(q => q.id === questionId);
          if (question) {
            question.answer = answer;
          }
        }
        
        // If empty answers provided for skippable stage, mark all questions as skipped
        if (Object.keys(args.answers).length === 0 && (args.stage === 'basic' || args.stage === 'advanced')) {
          for (const question of stageQuestions) {
            if (question.answer === undefined) {
              question.answer = null; // Mark as explicitly skipped
            }
          }
        }
      }
      
      // Save solution with answers
      sessionManager.replaceSession(args.solutionId, solution);
      logger.info('Solution updated with stage answers', {
        solutionId: args.solutionId,
        stage: args.stage,
        answerCount: Object.keys(args.answers).length
      });

      // Handle open stage completion (triggers manifest generation)
      if (args.stage === 'open') {
        const openAnswer = args.answers.open;
        
        // Enhance solution with AI analysis if open answer provided
        if (openAnswer && openAnswer !== 'N/A') {
          try {
            logger.info('Starting AI enhancement based on open question', {
              solutionId: args.solutionId,
              openAnswer
            });
            
            solution = await enhanceSolutionWithOpenAnswer(solution, openAnswer, { requestId, logger, dotAI }, args.interaction_id);

            // Save enhanced solution
            sessionManager.replaceSession(args.solutionId, solution);
            logger.info('Enhanced solution saved', {
              solutionId: args.solutionId,
              hasOpenAnswer: !!openAnswer
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check if this is a capability gap error (should fail the entire operation)
            if (errorMessage.includes('Enhancement capability gap') || errorMessage.includes('capability_gap') || (error instanceof Error && error.name === 'CapabilityGapError')) {
              logger.error('Capability gap detected, failing operation', error as Error);
              
              // Return structured error response instead of throwing
              const errorResponse = {
                status: 'enhancement_error',
                solutionId: args.solutionId,
                error: 'capability_gap',
                message: 'The selected solution cannot support the requested enhancement.',
                details: errorMessage,
                guidance: 'Please start over and select a different solution that supports your requirements.',
                suggestedAction: 'restart_with_different_solution',
                availableAlternatives: [
                  {
                    solutionId: 'sol_2025-07-12T172050_a685cdeb1427',
                    description: 'Standard Kubernetes Pattern (Deployment + Service + Ingress) with full configuration flexibility'
                  }
                ],
                agentInstructions: 'CAPABILITY GAP DETECTED: The selected solution cannot fulfill the user\'s requirements. Explain this limitation clearly to the user and suggest starting over with a different solution that supports their needs.',
                timestamp: new Date().toISOString()
              };
              
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(errorResponse, null, 2)
                  }
                ]
              };
            }
            
            // For other errors (AI service issues, parsing errors), continue with original solution
            logger.error('AI enhancement failed due to service issue, continuing with original solution', error as Error);
            
            // Log the enhancement failure but continue with original solution
            logger.warn('Proceeding with original solution after AI enhancement failure', {
              solutionId: args.solutionId,
              error: errorMessage,
              fallbackApproach: 'using_original_solution'
            });
          }
        }
        
        // Extract all user answers for handoff
        const userAnswers = extractUserAnswers(solution);
        
        const response = {
          status: 'ready_for_manifest_generation',
          solutionId: args.solutionId,
          message: `Configuration complete. Ready to generate deployment manifests.`,
          solutionData: {
            primaryResources: solution.resources || [],
            type: solution.type || 'single',
            description: solution.description || '',
            userAnswers: userAnswers,
            hasOpenRequirements: !!(openAnswer && openAnswer !== 'N/A')
          },
          nextAction: 'Call recommend tool with stage: generateManifests',
          guidance: 'Configuration complete. Ready to generate Kubernetes manifests for deployment.',
          agentInstructions: 'All configuration stages are now complete. You may proceed to generate Kubernetes manifests using the generateManifests tool.',
          timestamp: new Date().toISOString()
        };
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      }
      
      // Regular stage flow: determine next stage and return questions
      const newStageState = getCurrentStage(solution);
      
      // If stage is complete, move to next stage
      const nextStageQuestions = getQuestionsForStage(solution, newStageState.currentStage);
      
      const response = {
        status: 'stage_questions',
        solutionId: args.solutionId,
        currentStage: newStageState.currentStage,
        questions: nextStageQuestions,
        nextStage: newStageState.nextStage,
        message: getStageMessage(newStageState.currentStage),
        guidance: getStageGuidance(newStageState.currentStage),
        agentInstructions: getAgentInstructions(newStageState.currentStage),
        nextAction: `Call recommend tool with stage: answerQuestion:${newStageState.currentStage}`,
        timestamp: new Date().toISOString()
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    },
    {
      operation: 'answer_question',
      component: 'AnswerQuestionTool',
      requestId,
      input: args
    }
  );
}

