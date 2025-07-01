/**
 * Answer Question Tool - Process user answers and return remaining questions
 */

import { ToolDefinition, ToolHandler, ToolContext } from '../core/tool-registry';
import { MCPToolSchemas, SchemaValidator } from '../core/validation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
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
      
      // Handle completion flow (done=true)
      if (args.done) {
        // Save open question answer if provided
        const openAnswer = args.answers.open || args.answers.openResponse;
        if (openAnswer && solution.questions.open) {
          solution.questions.open.answer = openAnswer;
        }
        
        // Save solution and return completion status
        try {
          saveSolutionFile(solution, args.solutionId, sessionDir);
          logger.info('Solution completed and saved', { 
            solutionId: args.solutionId,
            hasOpenAnswer: !!openAnswer
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
        
        const response = {
          status: 'ready_for_enhancement',
          solutionId: args.solutionId,
          message: openAnswer 
            ? 'Solution configuration complete with additional requirements. Ready for enhancement processing.'
            : 'Solution configuration complete. Ready for manifest generation.',
          answeredQuestions: allQuestions.filter(q => q.answer !== undefined).length,
          totalQuestions: allQuestions.length,
          hasOpenAnswer: !!openAnswer,
          nextAction: openAnswer
            ? 'Additional requirements will be processed to enhance the solution'
            : 'Solution is ready for manifest generation',
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