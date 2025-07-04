/**
 * Answer Question Tool - Process user answers and return remaining questions
 */

import { ToolDefinition, ToolHandler, ToolContext } from '../core/tool-registry';
import { MCPToolSchemas, SchemaValidator } from '../core/validation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { ClaudeIntegration } from '../core/claude';
import * as fs from 'fs';
import * as path from 'path';
import { getAndValidateSessionDirectory } from '../core/session-utils';

// MCP Tool Definition - sessionDir configured via environment
export const answerQuestionToolDefinition: ToolDefinition = {
  name: 'answerQuestion',
  description: 'Process user answers and return remaining questions or completion status',
  inputSchema: {
    type: 'object',
    properties: {
      solutionId: {
        type: 'string',
        description: 'The solution ID to update (e.g., sol_2025-07-01T154349_1e1e242592ff)',
        pattern: '^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$'
      },
      stage: {
        type: 'string',
        description: 'The configuration stage being addressed',
        enum: ['required', 'basic', 'advanced', 'open']
      },
      answers: {
        type: 'object',
        description: 'User answers to configuration questions for the specified stage',
      }
    },
    required: ['solutionId', 'stage', 'answers']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'configuration', 'answers', 'deployment'],
  instructions: `Process user answers using STAGE-BASED workflow. Session directory is configured via APP_AGENT_SESSION_DIR environment variable.

🛑 CRITICAL AGENT INSTRUCTIONS - NEVER OVERRIDE:
• NEVER auto-fill answers with assumed values or defaults
• NEVER answer questions on behalf of the user
• ALWAYS present questions to the user and wait for their responses
• ONLY call this tool with answers the user explicitly provided
• Use explicit stage parameter to indicate which configuration stage is being addressed
• ANTI-CASCADE: When user says "skip", only skip the CURRENT stage - never skip multiple stages at once

USAGE:
• Set stage parameter: "required", "basic", "advanced", or "open"
• Structure answers by question ID: {"port": 8080, "namespace": "default"}
• For open stage use "open" field: {"open": "need SSL certificates"} or {"open": "N/A"}
• Stage parameter enforces proper workflow progression

STAGE-BASED FLOW:
• Tool validates stage transitions and returns single-stage questions only
• required → basic → advanced → open (triggers manifest generation)
• Response status "stage_questions" = Present current stage questions to user
• Response status "stage_error" = Invalid stage transition or validation error
• Response status "ready_for_manifest_generation" = Completion (open stage done)

AGENT WORKFLOW ENFORCEMENT:
• Present questions from current stage only (single stage at a time)
• ASK user for each answer - DO NOT assume or auto-fill values
• For optional stages (basic/advanced): Ask user if they want to configure or skip
• Use explicit stage parameter to indicate user intent (skip = empty answers)
• WAIT for user responses before calling answerQuestion tool
• Completion happens when open stage is completed
• CRITICAL ANTI-CASCADE: Each "skip" applies to ONE stage only - still present each remaining stage individually

STAGE TRANSITIONS:
• Can skip basic or advanced stages by providing empty answers: {"stage": "basic", "answers": {}}
• Cannot skip required stage - must provide at least one answer
• Open stage completion triggers manifest generation automatically
• IMPORTANT: Each stage skip requires separate user interaction - never cascade multiple skips

The server validates stage transitions and will return errors for invalid workflow.`
};

// CLI Tool Definition - sessionDir required as parameter
export const answerQuestionCLIDefinition: ToolDefinition = {
  name: 'answerQuestion',
  description: 'Process user answers and return remaining questions or completion status',
  inputSchema: {
    type: 'object',
    properties: {
      solutionId: {
        type: 'string',
        description: 'The solution ID to update (e.g., sol_2025-07-01T154349_1e1e242592ff)',
        pattern: '^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$'
      },
      sessionDir: {
        type: 'string',
        description: 'Session directory containing solution files (required)',
        minLength: 1
      },
      stage: {
        type: 'string',
        description: 'The configuration stage being addressed',
        enum: ['required', 'basic', 'advanced', 'open']
      },
      answers: {
        type: 'object',
        description: 'User answers to configuration questions for the specified stage',
      }
    },
    required: ['solutionId', 'sessionDir', 'stage', 'answers']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'configuration', 'answers', 'deployment'],
  instructions: `Process user answers using STAGE-BASED workflow. Both solutionId and sessionDir are required parameters.

🛑 CRITICAL AGENT INSTRUCTIONS - NEVER OVERRIDE:
• NEVER auto-fill answers with assumed values or defaults
• NEVER answer questions on behalf of the user
• ALWAYS present questions to the user and wait for their responses
• ONLY call this tool with answers the user explicitly provided
• Use explicit stage parameter to indicate which configuration stage is being addressed
• ANTI-CASCADE: When user says "skip", only skip the CURRENT stage - never skip multiple stages at once

USAGE:
• Set stage parameter: "required", "basic", "advanced", or "open"
• Structure answers by question ID: {"port": 8080, "namespace": "default"}
• For open stage use "open" field: {"open": "need SSL certificates"} or {"open": "N/A"}
• Stage parameter enforces proper workflow progression

STAGE-BASED FLOW:
• Tool validates stage transitions and returns single-stage questions only
• required → basic → advanced → open (triggers manifest generation)
• Response status "stage_questions" = Present current stage questions to user
• Response status "stage_error" = Invalid stage transition or validation error
• Response status "ready_for_manifest_generation" = Completion (open stage done)

AGENT WORKFLOW ENFORCEMENT:
• Present questions from current stage only (single stage at a time)
• ASK user for each answer - DO NOT assume or auto-fill values
• For optional stages (basic/advanced): Ask user if they want to configure or skip
• Use explicit stage parameter to indicate user intent (skip = empty answers)
• WAIT for user responses before calling answerQuestion tool
• Completion happens when open stage is completed
• CRITICAL ANTI-CASCADE: Each "skip" applies to ONE stage only - still present each remaining stage individually

STAGE TRANSITIONS:
• Can skip basic or advanced stages by providing empty answers: {"stage": "basic", "answers": {}}
• Cannot skip required stage - must provide at least one answer
• Open stage completion triggers manifest generation automatically
• IMPORTANT: Each stage skip requires separate user interaction - never cascade multiple skips

The server validates stage transitions and will return errors for invalid workflow.`
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
      throw new Error(`Invalid JSON in solution file: ${solutionId}`);
    }
    throw error;
  }
}

/**
 * Save solution file with atomic operations
 */
function saveSolutionFile(solution: any, solutionId: string, sessionDir: string): void {
  const solutionPath = path.join(sessionDir, `${solutionId}.json`);
  const tempPath = solutionPath + '.tmp';
  
  try {
    // Write to temporary file first
    fs.writeFileSync(tempPath, JSON.stringify(solution, null, 2), 'utf8');
    
    // Atomically rename to final path
    fs.renameSync(tempPath, solutionPath);
  } catch (error) {
    // Clean up temporary file if it exists
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

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
    case 'number':
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
 * Get anti-cascade agent instructions for stage responses
 */
function getAgentInstructions(stage: Stage): string {
  switch (stage) {
    case 'required':
      return 'CRITICAL: Present these required questions to the user. All must be answered before proceeding.';
    case 'basic':
      return 'CRITICAL: Present these questions to the user and wait for their response. Do NOT skip this stage unless the user explicitly says to skip THIS specific stage.';
    case 'advanced':
      return 'CRITICAL: Present these questions to the user and wait for their response. Do NOT skip this stage unless the user explicitly says to skip THIS specific stage.';
    case 'open':
      return 'CRITICAL: This is the final configuration stage. Present these questions to the user. Use "N/A" only if user explicitly states no additional requirements.';
    default:
      return 'Present questions to the user and wait for their response.';
  }
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
function validateStageTransition(currentStage: Stage, requestedStage: Stage): { valid: boolean; error?: string } {
  const validTransitions: Record<Stage, Stage[]> = {
    'required': ['basic', 'open'],
    'basic': ['advanced', 'open'],
    'advanced': ['open'],
    'open': []
  };

  if (currentStage === requestedStage) {
    return { valid: true }; // Same stage is always valid
  }

  const allowedNext = validTransitions[currentStage] || [];
  if (!allowedNext.includes(requestedStage)) {
    return {
      valid: false,
      error: `Cannot transition from '${currentStage}' to '${requestedStage}'. Valid options: ${allowedNext.join(', ')}`
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
      return 'Use "N/A" if you have no additional requirements. Complete this stage before generating manifests. IMPORTANT: This is the final configuration stage - do not skip.';
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
  context: ToolContext
): Promise<any> {
  const promptPath = path.join(process.cwd(), 'prompts', 'resource-analysis.md');
  const template = fs.readFileSync(promptPath, 'utf8');
  
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
  
  const analysisPrompt = template
    .replace('{current_solution}', JSON.stringify(currentSolution, null, 2))
    .replace('{user_request}', openResponse)
    .replace('{available_resource_types}', JSON.stringify(availableResourceTypes, null, 2));

  // Initialize Claude integration
  const apiKey = process.env.ANTHROPIC_API_KEY || 'test-key';
  const claudeIntegration = new ClaudeIntegration(apiKey);
  
  context.logger.info('Analyzing resource needs for open question', {
    openResponse,
    availableResourceCount: availableResourceTypes.length
  });
  
  const response = await claudeIntegration.sendMessage(analysisPrompt);
  return parseEnhancementResponse(response.content);
}

/**
 * Phase 2: Apply enhancements based on analysis result
 */
async function applySolutionEnhancement(
  solution: any,
  openResponse: string,
  analysisResult: any,
  context: ToolContext
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
    
    return autoPopulateQuestions(solution, openResponse, analysisResult, context);
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
  context: ToolContext
): Promise<any> {
  const promptPath = path.join(process.cwd(), 'prompts', 'solution-enhancement.md');
  const template = fs.readFileSync(promptPath, 'utf8');
  
  const enhancementPrompt = template
    .replace('{current_solution}', JSON.stringify(solution, null, 2))
    .replace('{detailed_schemas}', JSON.stringify(solution.schemas || {}, null, 2))
    .replace('{analysis_result}', JSON.stringify(analysisResult, null, 2))
    .replace('{open_response}', openResponse);

  const apiKey = process.env.ANTHROPIC_API_KEY || 'test-key';
  const claudeIntegration = new ClaudeIntegration(apiKey);
  
  const response = await claudeIntegration.sendMessage(enhancementPrompt);
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
  context: ToolContext
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
  context: ToolContext
): Promise<any> {
  try {
    context.logger.info('Starting AI enhancement of solution', {
      solutionId: solution.solutionId,
      openAnswer
    });
    
    // Phase 1: Analyze what resources are needed
    const analysisResult = await analyzeResourceNeeds(solution, openAnswer, context);
    
    // Phase 2: Apply enhancements based on analysis
    const enhancedSolution = await applySolutionEnhancement(solution, openAnswer, analysisResult, context);
    
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
 * Answer Question Tool Handler
 */
export const answerQuestionToolHandler: ToolHandler = async (args: any, context: ToolContext) => {
  const { requestId, logger } = context;

  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Handling answerQuestion request', { 
        requestId, 
        solutionId: args?.solutionId,
        stage: args?.stage,
        answerCount: Object.keys(args?.answers || {}).length
      });

      // Determine interface type and validate accordingly
      const isCLI = !!args.sessionDir;
      const schema = isCLI ? answerQuestionCLIDefinition.inputSchema : answerQuestionToolDefinition.inputSchema;
      
      // Validate input parameters using appropriate schema
      try {
        SchemaValidator.validateToolInput('answerQuestion', args, schema);
      } catch (validationError) {
        const baseActions = [
          'Ensure solutionId parameter matches format: sol_YYYY-MM-DDTHHMMSS_hexstring',
          'Ensure answers parameter is a valid object with question ID keys'
        ];
        const cliActions = [
          'Ensure sessionDir parameter is provided and points to existing directory'
        ];
        const mcpActions = [
          'Ensure APP_AGENT_SESSION_DIR environment variable is set in MCP configuration'
        ];
        
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Invalid input parameters for answerQuestion tool',
          {
            operation: 'input_validation',
            component: 'AnswerQuestionTool',
            requestId,
            input: args,
            suggestedActions: isCLI ? [...baseActions, ...cliActions] : [...baseActions, ...mcpActions]
          },
          validationError as Error
        );
      }
      
      // Validate solution ID format
      try {
        validateSolutionId(args.solutionId);
        logger.debug('Solution ID format validated', { solutionId: args.solutionId });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          error instanceof Error ? error.message : 'Invalid solution ID format',
          {
            operation: 'solution_id_validation',
            component: 'AnswerQuestionTool',
            requestId,
            suggestedActions: [
              'Use a valid solution ID from the chooseSolution tool response',
              'Check the solution ID format: sol_YYYY-MM-DDTHHMMSS_hexstring',
              'Ensure you have the complete solution ID including the timestamp and hex suffix'
            ]
          }
        );
      }
      
      // Get session directory from environment or arguments
      let sessionDir: string;
      try {
        sessionDir = getAndValidateSessionDirectory(args, context, false); // requireWrite=false for reading
        logger.debug('Session directory resolved and validated', { sessionDir, interface: isCLI ? 'CLI' : 'MCP' });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          error instanceof Error ? error.message : 'Session directory validation failed',
          {
            operation: 'session_directory_validation',
            component: 'AnswerQuestionTool',
            requestId,
            suggestedActions: [
              'Ensure session directory exists and is writable',
              'Check directory permissions',
              'Verify the directory path is correct',
              isCLI ? 'Use the same sessionDir that was used with chooseSolution' : 'Verify APP_AGENT_SESSION_DIR environment variable is correctly set'
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
          hasQuestions: !!solution.questions
        });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          error instanceof Error ? error.message : 'Failed to load solution file',
          {
            operation: 'solution_file_loading',
            component: 'AnswerQuestionTool',
            requestId,
            suggestedActions: [
              'Verify the solution ID exists in the session directory',
              'Check that the solution file is valid JSON',
              'Ensure the solution was selected by chooseSolution tool',
              'List available solution files in the session directory'
            ]
          }
        );
      }
      
      // Stage-based validation and workflow
      const stageState = getCurrentStage(solution);
      
      // Validate stage transition
      const transitionResult = validateStageTransition(stageState.currentStage, args.stage as Stage);
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
            validationErrors.push(`Unknown question ID '${questionId}' for stage '${args.stage}'. Open stage only accepts 'open' as question ID.`);
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
      try {
        saveSolutionFile(solution, args.solutionId, sessionDir);
        logger.info('Solution updated with stage answers', { 
          solutionId: args.solutionId,
          stage: args.stage,
          answerCount: Object.keys(args.answers).length
        });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.STORAGE,
          ErrorSeverity.HIGH,
          'Failed to save solution file',
          {
            operation: 'solution_file_saving',
            component: 'AnswerQuestionTool',
            requestId,
            suggestedActions: [
              'Check session directory write permissions',
              'Ensure adequate disk space',
              'Verify solution JSON is valid'
            ]
          }
        );
      }

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
            
            solution = await enhanceSolutionWithOpenAnswer(solution, openAnswer, context);
            
            // Save enhanced solution
            saveSolutionFile(solution, args.solutionId, sessionDir);
            logger.info('Enhanced solution saved', { 
              solutionId: args.solutionId,
              hasOpenAnswer: !!openAnswer
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check if this is a capability gap error (should fail the entire operation)
            if (errorMessage.includes('Enhancement capability gap') || errorMessage.includes('capability_gap')) {
              logger.error('Capability gap detected, failing operation', error as Error);
              throw error; // Re-throw capability gap errors to fail the entire operation
            }
            
            // For other errors (AI service issues, parsing errors), continue with original solution
            logger.error('AI enhancement failed due to service issue, continuing with original solution', error as Error);
          }
        }
        
        // Extract all user answers for handoff
        const userAnswers: Record<string, any> = {};
        
        // Extract from all question categories
        const questionCategories = ['required', 'basic', 'advanced'];
        for (const category of questionCategories) {
          const questions = solution.questions[category] || [];
          for (const question of questions) {
            if (question.answer !== undefined && question.answer !== null) {
              userAnswers[question.id] = question.answer;
            }
          }
        }
        
        // Include open answer if provided
        if (openAnswer) {
          userAnswers.open = openAnswer;
        }
        
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
          nextAction: 'generateManifests',
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
        nextAction: 'answerQuestion',
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
};