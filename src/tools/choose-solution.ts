/**
 * Choose Solution Tool - Select a solution and return its questions
 */

import { ToolDefinition, ToolHandler, ToolContext } from '../core/tool-registry';
import { MCPToolSchemas, SchemaValidator } from '../core/validation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { InstructionLoader } from '../core/instruction-loader';
import * as fs from 'fs';
import * as path from 'path';

// MCP Tool Definition - sessionDir configured via environment
export const chooseSolutionToolDefinition: ToolDefinition = {
  name: 'chooseSolution',
  description: 'Select a solution by ID and return its questions for configuration',
  inputSchema: {
    type: 'object',
    properties: {
      solutionId: {
        type: 'string',
        description: 'The solution ID to choose (e.g., sol_2025-07-01T154349_1e1e242592ff)',
        pattern: '^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$'
      }
    },
    required: ['solutionId']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'configuration', 'questions', 'deployment'],
  instructions: 'Select a solution by providing its solutionId to receive the configuration questions. Session directory is configured via APP_AGENT_SESSION_DIR environment variable.'
};

// CLI Tool Definition - sessionDir required as parameter
export const chooseSolutionCLIDefinition: ToolDefinition = {
  name: 'chooseSolution',
  description: 'Select a solution by ID and return its questions for configuration',
  inputSchema: {
    type: 'object',
    properties: {
      solutionId: {
        type: 'string',
        description: 'The solution ID to choose (e.g., sol_2025-07-01T154349_1e1e242592ff)',
        pattern: '^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$'
      },
      sessionDir: {
        type: 'string',
        description: 'Session directory containing solution files (required)',
        minLength: 1
      }
    },
    required: ['solutionId', 'sessionDir']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'configuration', 'questions', 'deployment'],
  instructions: 'Select a solution by providing its solutionId and sessionDir to receive the configuration questions. Both solutionId and sessionDir are required parameters.'
};

/**
 * Validate session directory exists and is readable
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
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('EACCES')) {
      throw new Error(`Session directory is not readable: ${sessionDir}`);
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
        component: 'ChooseSolutionTool',
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
 * Choose Solution Tool Handler
 */
export const chooseSolutionToolHandler: ToolHandler = async (args: any, context: ToolContext) => {
  const { requestId, logger } = context;

  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Handling chooseSolution request', { requestId, solutionId: args?.solutionId });

      // Determine interface type and validate accordingly
      const isCLI = !!args.sessionDir;
      const schema = isCLI ? chooseSolutionCLIDefinition.inputSchema : chooseSolutionToolDefinition.inputSchema;
      
      // Validate input parameters using appropriate schema
      try {
        SchemaValidator.validateToolInput('chooseSolution', args, schema);
      } catch (validationError) {
        const baseActions = [
          'Ensure solutionId parameter matches format: sol_YYYY-MM-DDTHHMMSS_hexstring',
          'Check that solutionId is a non-empty string'
        ];
        const cliActions = [
          'Ensure sessionDir parameter is provided and points to existing directory',
          'Check that sessionDir is a non-empty string'
        ];
        const mcpActions = [
          'Ensure APP_AGENT_SESSION_DIR environment variable is set in MCP configuration',
          'Check that APP_AGENT_SESSION_DIR points to existing directory'
        ];
        
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Invalid input parameters for chooseSolution tool',
          {
            operation: 'input_validation',
            component: 'ChooseSolutionTool',
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
            component: 'ChooseSolutionTool',
            requestId,
            suggestedActions: [
              'Use a valid solution ID from the recommend tool response',
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
            component: 'ChooseSolutionTool',
            requestId,
            suggestedActions: [
              'Ensure session directory exists and is readable',
              'Check directory permissions',
              'Verify the directory path is correct',
              isCLI ? 'Use the same sessionDir that was used with the recommend tool' : 'Verify APP_AGENT_SESSION_DIR environment variable is correctly set'
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
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          error instanceof Error ? error.message : 'Failed to load solution file',
          {
            operation: 'solution_file_loading',
            component: 'ChooseSolutionTool',
            requestId,
            suggestedActions: [
              'Verify the solution ID exists in the session directory',
              'Check that the solution file is valid JSON',
              'Ensure the solution was created by a recent recommend tool call',
              'List available solution files in the session directory'
            ]
          }
        );
      }
      
      // Prepare response with solution details and questions
      const nextAction = isCLI 
        ? 'Call answerQuestion with solutionId, sessionDir, and answers to configure the solution'
        : 'Call answerQuestion with solutionId and answers to configure the solution';
      
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
        interface: isCLI ? 'CLI' : 'MCP',
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
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    },
    {
      operation: 'choose_solution',
      component: 'ChooseSolutionTool',
      requestId,
      input: args
    }
  );
};