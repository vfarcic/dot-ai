/**
 * Answer Question Tool - Process user answers and return remaining questions
 */

import { ToolDefinition, ToolHandler, ToolContext } from '../core/tool-registry';
import { MCPToolSchemas, SchemaValidator } from '../core/validation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { ClaudeIntegration } from '../core/claude';
import * as fs from 'fs';
import * as path from 'path';

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
      answers: {
        type: 'object',
        description: 'User answers to configuration questions',
      },
      done: {
        type: 'boolean',
        description: 'Set to true when providing final open question answer'
      }
    },
    required: ['solutionId', 'answers']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'configuration', 'answers', 'deployment'],
  instructions: 'Process user answers to solution questions. Session directory is configured via APP_AGENT_SESSION_DIR environment variable.'
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
      answers: {
        type: 'object',
        description: 'User answers to configuration questions',
      },
      done: {
        type: 'boolean',
        description: 'Set to true when providing final open question answer'
      }
    },
    required: ['solutionId', 'sessionDir', 'answers']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'configuration', 'answers', 'deployment'],
  instructions: 'Process user answers to solution questions. Both solutionId and sessionDir are required parameters.'
};

/**
 * Validate session directory exists and is writable
 */
function validateSessionDirectory(sessionDir: string): void {
  try {
    // Check if directory exists
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session directory does not exist: ${sessionDir}`);
    }
    
    // Check if it's actually a directory
    const stat = fs.statSync(sessionDir);
    if (!stat.isDirectory()) {
      throw new Error(`Session directory path is not a directory: ${sessionDir}`);
    }
    
    // Check read permissions by attempting to read directory contents
    fs.readdirSync(sessionDir);
    
    // Check write permissions by creating a temporary file
    const testFile = path.join(sessionDir, '.write-test-' + Date.now());
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('EACCES')) {
      throw new Error(`Session directory is not readable/writable: ${sessionDir}`);
    }
    throw error;
  }
}

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
 * Get session directory from environment or arguments
 */
function getSessionDirectory(args: any, context: ToolContext): string {
  // For CLI interface, sessionDir is required as parameter
  if (args.sessionDir) {
    return args.sessionDir;
  }
  
  // For MCP interface, sessionDir comes from environment
  const envSessionDir = process.env.APP_AGENT_SESSION_DIR;
  if (!envSessionDir) {
    throw ErrorHandler.createError(
      ErrorCategory.CONFIGURATION,
      ErrorSeverity.CRITICAL,
      'Session directory not configured. Set APP_AGENT_SESSION_DIR environment variable.',
      {
        operation: 'session_directory_configuration',
        component: 'AnswerQuestionTool',
        requestId: context.requestId,
        suggestedActions: [
          'Set APP_AGENT_SESSION_DIR environment variable in MCP configuration (.mcp.json)',
          'Example: "APP_AGENT_SESSION_DIR": "/tmp/app-agent-sessions"',
          'Ensure the directory exists and is writable',
          'For CLI usage, provide --session-dir parameter'
        ]
      }
    );
  }
  
  return envSessionDir;
}

/**
 * Check if this is the first call (no existing answers)
 */
function isFirstCall(solution: any): boolean {
  const allQuestions = [
    ...(solution.questions.required || []),
    ...(solution.questions.basic || []),
    ...(solution.questions.advanced || [])
  ];
  
  return !allQuestions.some(q => q.answer !== undefined);
}

/**
 * Get remaining unanswered questions
 */
function getRemainingQuestions(solution: any): any[] {
  const allQuestions = [
    ...(solution.questions.required || []),
    ...(solution.questions.basic || []),
    ...(solution.questions.advanced || [])
  ];
  
  return allQuestions.filter(q => q.answer === undefined);
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
        answerCount: Object.keys(args?.answers || {}).length,
        done: args?.done
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
        sessionDir = getSessionDirectory(args, context);
        logger.debug('Session directory resolved', { sessionDir, interface: isCLI ? 'CLI' : 'MCP' });
      } catch (error) {
        throw error; // Re-throw the properly formatted error from getSessionDirectory
      }
      
      // Validate session directory
      try {
        validateSessionDirectory(sessionDir);
        logger.debug('Session directory validated', { sessionDir });
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
          hasQuestions: !!solution.questions,
          isFirstCall: isFirstCall(solution)
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
      
      // Validate answers against question schemas
      const validationErrors: string[] = [];
      const allQuestions = [
        ...(solution.questions.required || []),
        ...(solution.questions.basic || []),
        ...(solution.questions.advanced || [])
      ];
      
      for (const [questionId, answer] of Object.entries(args.answers)) {
        // Skip open question validation (handled separately)
        if (questionId === 'open' || questionId === 'openResponse') {
          continue;
        }
        
        const question = allQuestions.find(q => q.id === questionId);
        if (!question) {
          validationErrors.push(`Unknown question ID: ${questionId}`);
          continue;
        }
        
        const error = validateAnswer(answer, question);
        if (error) {
          validationErrors.push(error);
        }
      }
      
      if (validationErrors.length > 0) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Answer validation failed',
          {
            operation: 'answer_validation',
            component: 'AnswerQuestionTool',
            requestId,
            input: { validationErrors },
            suggestedActions: [
              'Fix the validation errors listed above',
              'Check question requirements and constraints',
              'Ensure answer types match question types (string, number, boolean)',
              'Verify required questions have non-empty values'
            ]
          }
        );
      }
      
      // Update solution with answers
      for (const [questionId, answer] of Object.entries(args.answers)) {
        // Skip open question (handled separately)
        if (questionId === 'open' || questionId === 'openResponse') {
          continue;
        }
        
        const question = allQuestions.find(q => q.id === questionId);
        if (question) {
          question.answer = answer;
        }
      }
      
      // Save solution with structured answers first
      try {
        saveSolutionFile(solution, args.solutionId, sessionDir);
        logger.info('Solution updated with structured answers', { 
          solutionId: args.solutionId,
          structuredAnswers: Object.keys(args.answers).filter(k => k !== 'open' && k !== 'openResponse')
        });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.STORAGE,
          ErrorSeverity.HIGH,
          'Failed to save solution file with structured answers',
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

      // Handle completion flow (done=true)
      if (args.done) {
        // Save open question answer if provided
        const openAnswer = args.answers.open || args.answers.openResponse;
        if (openAnswer && solution.questions.open) {
          solution.questions.open.answer = openAnswer;
          
          // Save solution with open answer first, before AI enhancement
          saveSolutionFile(solution, args.solutionId, sessionDir);
          logger.info('Solution saved with open answer', { 
            solutionId: args.solutionId,
            hasOpenAnswer: !!openAnswer
          });
          
          // Enhance solution with AI analysis of open question
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
            // Continue with solution that has the open answer saved
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
          message: 'Solution configuration complete. All resources and answers assembled.',
          solutionData: {
            primaryResources: solution.resources || [],
            type: solution.type || 'single',
            description: solution.description || '',
            userAnswers: userAnswers,
            hasOpenRequirements: !!openAnswer
          },
          nextAction: 'generateManifests',
          guidance: `AGENT INSTRUCTIONS: Solution configuration is complete. Now call the generateManifests tool with solutionId "${args.solutionId}" to generate the final Kubernetes manifests. This will process any open requirements and create deployment-ready YAML.`,
          answeredQuestions: allQuestions.filter(q => q.answer !== undefined).length,
          totalQuestions: allQuestions.length,
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
      
      // Regular flow: save answers and return remaining questions
      try {
        saveSolutionFile(solution, args.solutionId, sessionDir);
        logger.debug('Solution updated with new answers', { 
          solutionId: args.solutionId,
          answeredCount: Object.keys(args.answers).length
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
      
      // Determine what to return based on call sequence
      const firstCall = isFirstCall(solution) && !Object.keys(args.answers).some(key => 
        allQuestions.find(q => q.id === key)?.answer !== undefined
      );
      
      if (firstCall) {
        // First call: always return open question regardless of completeness
        const response = {
          status: 'questions_remaining',
          solutionId: args.solutionId,
          questions: {
            open: solution.questions.open
          },
          message: 'Please provide any additional requirements or constraints for your deployment.',
          guidance: 'AGENT INSTRUCTIONS: Ask the user for additional requirements or constraints. User can provide specific needs or say they want to proceed with defaults. Use done=true when user provides their answer or chooses to skip.',
          answeredQuestions: allQuestions.filter(q => q.answer !== undefined).length,
          totalQuestions: allQuestions.length,
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
      } else {
        // Subsequent calls: return remaining questions
        const remainingQuestions = getRemainingQuestions(solution);
        
        // Check if only required questions need to be answered for open question
        const requiredQuestions = solution.questions.required || [];
        const unansweredRequired = requiredQuestions.filter((q: any) => q.answer === undefined);
        
        if (unansweredRequired.length === 0 && remainingQuestions.length > 0) {
          // All required questions answered, but optional questions remain
          // Show open question alongside remaining optional questions
          const remainingByCategory = {
            required: [],
            basic: remainingQuestions.filter((q: any) => 
              (solution.questions.basic || []).some((bq: any) => bq.id === q.id)
            ),
            advanced: remainingQuestions.filter((q: any) => 
              (solution.questions.advanced || []).some((aq: any) => aq.id === q.id)
            ),
            open: solution.questions.open
          };
          
          const response = {
            status: 'questions_remaining',
            solutionId: args.solutionId,
            questions: remainingByCategory,
            message: `All required questions answered. ${remainingQuestions.length} optional questions remaining.`,
            guidance: 'AGENT INSTRUCTIONS: Present user with clear options: (1) Answer specific optional questions they care about, (2) Provide additional requirements via the open question, (3) Skip to completion with done=true, or (4) Do both optional questions AND open question. List a few key optional questions with "...plus X more available" to show there are more choices.',
            answeredQuestions: allQuestions.filter(q => q.answer !== undefined).length,
            totalQuestions: allQuestions.length,
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
        } else if (remainingQuestions.length === 0) {
          // All structured questions answered, return only open question
          const response = {
            status: 'questions_remaining',
            solutionId: args.solutionId,
            questions: {
              open: solution.questions.open
            },
            message: 'All structured questions answered. Please provide any additional requirements.',
            guidance: 'AGENT INSTRUCTIONS: Ask the user for any additional requirements or constraints via the open question. User can also choose to skip this and proceed directly. Use done=true when user provides their final answer or chooses to skip.',
            answeredQuestions: allQuestions.length,
            totalQuestions: allQuestions.length,
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
        } else {
          // Return remaining questions grouped by category
          const remainingByCategory = {
            required: remainingQuestions.filter(q => 
              solution.questions.required?.some((rq: any) => rq.id === q.id)
            ),
            basic: remainingQuestions.filter(q => 
              solution.questions.basic?.some((bq: any) => bq.id === q.id)
            ),
            advanced: remainingQuestions.filter(q => 
              solution.questions.advanced?.some((aq: any) => aq.id === q.id)
            )
          };
          
          const response = {
            status: 'questions_remaining',
            solutionId: args.solutionId,
            questions: remainingByCategory,
            message: `${remainingQuestions.length} questions remaining. Please provide answers to continue.`,
            guidance: 'Answer remaining questions. Use done=true after providing final answers.',
            answeredQuestions: allQuestions.length - remainingQuestions.length,
            totalQuestions: allQuestions.length,
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
      }
    },
    {
      operation: 'answer_question',
      component: 'AnswerQuestionTool',
      requestId,
      input: args
    }
  );
};