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
        description: 'Set to true ONLY when user explicitly signals completion (e.g., "proceed", "ready to generate", "that\'s all my requirements"). Do NOT set to true based on technical details alone.'
      }
    },
    required: ['solutionId', 'answers']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'configuration', 'answers', 'deployment'],
  instructions: `Process user answers to solution questions using GROUP-BY-GROUP flow. Session directory is configured via APP_AGENT_SESSION_DIR environment variable.

🛑 CRITICAL AGENT INSTRUCTIONS - NEVER OVERRIDE:
• NEVER auto-fill answers with assumed values or defaults
• NEVER answer questions on behalf of the user
• ALWAYS present questions to the user and wait for their responses
• ONLY call this tool with answers the user explicitly provided
• Present questions one group at a time, wait for user input before proceeding

USAGE:
• Structure answers by question ID: {"port": 8080, "namespace": "default"}
• Use "open" field for additional requirements: {"open": "need SSL certificates"}  
• Set done=true only when user explicitly says "proceed" or "ready"
• If open question exists, it MUST be answered before completion (use "N/A" if no requirements)

GROUP-BY-GROUP FLOW:
• Tool now returns questions ONE GROUP AT A TIME to enforce proper progression
• Response status "group_questions" = Present current group questions to user
• Check "currentGroup" field: "required", "basic", "advanced", or "open"
• Required questions MUST be completed before basic questions are shown
• Basic and advanced groups are optional - user can skip
• Progress through: required → basic → advanced → open → complete

AGENT WORKFLOW ENFORCEMENT:
• Present questions from current group only (don't overwhelm user)
• ASK user for each answer - DO NOT assume or auto-fill values
• For optional groups (basic/advanced): Ask user if they want to configure or skip
• Guide user through one group at a time for better UX
• Use progress field to show completion status to user
• WAIT for user responses before calling answerQuestion tool

The server validates completeness and will return errors for invalid patterns.`
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
        description: 'Set to true ONLY when user explicitly signals completion (e.g., "proceed", "ready to generate", "that\'s all my requirements"). Do NOT set to true based on technical details alone.'
      }
    },
    required: ['solutionId', 'sessionDir', 'answers']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'configuration', 'answers', 'deployment'],
  instructions: `Process user answers to solution questions using GROUP-BY-GROUP flow. Both solutionId and sessionDir are required parameters.

🛑 CRITICAL AGENT INSTRUCTIONS - NEVER OVERRIDE:
• NEVER auto-fill answers with assumed values or defaults
• NEVER answer questions on behalf of the user
• ALWAYS present questions to the user and wait for their responses
• ONLY call this tool with answers the user explicitly provided
• Present questions one group at a time, wait for user input before proceeding

USAGE:
• Structure answers by question ID: {"port": 8080, "namespace": "default"}
• Use "open" field for additional requirements: {"open": "need SSL certificates"}  
• Set done=true only when user explicitly says "proceed" or "ready"
• If open question exists, it MUST be answered before completion (use "N/A" if no requirements)

GROUP-BY-GROUP FLOW:
• Tool now returns questions ONE GROUP AT A TIME to enforce proper progression
• Response status "group_questions" = Present current group questions to user
• Check "currentGroup" field: "required", "basic", "advanced", or "open"
• Required questions MUST be completed before basic questions are shown
• Basic and advanced groups are optional - user can skip
• Progress through: required → basic → advanced → open → complete

AGENT WORKFLOW ENFORCEMENT:
• Present questions from current group only (don't overwhelm user)
• ASK user for each answer - DO NOT assume or auto-fill values
• For optional groups (basic/advanced): Ask user if they want to configure or skip
• Guide user through one group at a time for better UX
• Use progress field to show completion status to user
• WAIT for user responses before calling answerQuestion tool

The server validates completeness and will return errors for invalid patterns.`
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
 * Get current question group state and determine next group to present
 */
function getQuestionGroupState(solution: any): {
  hasRequired: boolean;
  hasBasic: boolean;
  hasAdvanced: boolean;
  hasOpen: boolean;
  requiredComplete: boolean;
  basicComplete: boolean;
  advancedComplete: boolean;
  openComplete: boolean;
  currentGroup: 'required' | 'basic' | 'advanced' | 'open' | 'complete';
  nextGroup?: 'required' | 'basic' | 'advanced' | 'open' | 'complete';
  completedGroups: string[];
  progress: string;
} {
  // Check what groups exist
  const hasRequired = solution.questions.required && solution.questions.required.length > 0;
  const hasBasic = solution.questions.basic && solution.questions.basic.length > 0;
  const hasAdvanced = solution.questions.advanced && solution.questions.advanced.length > 0;
  const hasOpen = !!solution.questions.open;

  // Check completion status
  const requiredComplete = !hasRequired || solution.questions.required.every((q: any) => q.answer !== undefined);
  const basicComplete = !hasBasic || solution.questions.basic.every((q: any) => q.answer !== undefined);
  const advancedComplete = !hasAdvanced || solution.questions.advanced.every((q: any) => q.answer !== undefined);
  const openComplete = !hasOpen || solution.questions.open.answer !== undefined;

  // Determine current group based on what's incomplete
  let currentGroup: 'required' | 'basic' | 'advanced' | 'open' | 'complete';
  let nextGroup: 'required' | 'basic' | 'advanced' | 'open' | 'complete' | undefined;
  
  if (!requiredComplete) {
    currentGroup = 'required';
    nextGroup = hasBasic ? 'basic' : (hasAdvanced ? 'advanced' : (hasOpen ? 'open' : 'complete'));
  } else if (!basicComplete) {
    currentGroup = 'basic';
    nextGroup = hasAdvanced ? 'advanced' : (hasOpen ? 'open' : 'complete');
  } else if (!advancedComplete) {
    currentGroup = 'advanced';
    nextGroup = hasOpen ? 'open' : 'complete';
  } else if (!openComplete) {
    currentGroup = 'open';
    nextGroup = 'complete';
  } else {
    currentGroup = 'complete';
  }

  // Build completed groups list
  const completedGroups: string[] = [];
  if (requiredComplete && hasRequired) completedGroups.push('required');
  if (basicComplete && hasBasic) completedGroups.push('basic');
  if (advancedComplete && hasAdvanced) completedGroups.push('advanced');
  if (openComplete && hasOpen) completedGroups.push('open');

  // Calculate progress
  const totalGroups = [hasRequired, hasBasic, hasAdvanced, hasOpen].filter(Boolean).length;
  const progress = `${completedGroups.length} of ${totalGroups} groups complete`;

  return {
    hasRequired,
    hasBasic,
    hasAdvanced,
    hasOpen,
    requiredComplete,
    basicComplete,
    advancedComplete,
    openComplete,
    currentGroup,
    nextGroup,
    completedGroups,
    progress
  };
}

/**
 * Validate staged completion - ensures progression through all question groups
 */
function validateStagedCompletion(solution: any, answers: any): {
  hasError: boolean;
  error?: string;
  message?: string;
  guidance?: string;
  currentStage?: string;
  nextStage?: string;
} {
  // Check what groups have questions
  const hasRequired = solution.questions.required && solution.questions.required.length > 0;
  const hasBasic = solution.questions.basic && solution.questions.basic.length > 0;
  const hasAdvanced = solution.questions.advanced && solution.questions.advanced.length > 0;
  const hasOpen = solution.questions.open;

  // Check what groups have been addressed
  const requiredAnswered = hasRequired ? solution.questions.required.some((q: any) => q.answer !== undefined) : true;
  const basicAnswered = hasBasic ? solution.questions.basic.some((q: any) => q.answer !== undefined) : true;
  const advancedAnswered = hasAdvanced ? solution.questions.advanced.some((q: any) => q.answer !== undefined) : true;
  const openAnswered = hasOpen ? (answers.open || answers.openResponse) : true;

  // Check if trying to skip groups by answering multiple at once without progression
  const answerIds = Object.keys(answers).filter(k => k !== 'open' && k !== 'openResponse');
  const requiredIds = (solution.questions.required || []).map((q: any) => q.id);
  const basicIds = (solution.questions.basic || []).map((q: any) => q.id);
  const advancedIds = (solution.questions.advanced || []).map((q: any) => q.id);

  const answeringRequired = answerIds.some(id => requiredIds.includes(id));
  const answeringBasic = answerIds.some(id => basicIds.includes(id));
  const answeringAdvanced = answerIds.some(id => advancedIds.includes(id));

  // Enforce staged progression during active answering
  if (!requiredAnswered && (answeringBasic || answeringAdvanced)) {
    return {
      hasError: true,
      error: 'Must complete required questions before proceeding to basic or advanced questions.',
      message: 'Required questions must be addressed first.',
      guidance: 'Answer at least one required question, then proceed to basic questions, or set done=false to continue configuration.',
      currentStage: 'required',
      nextStage: 'basic'
    };
  }

  if (hasBasic && !basicAnswered && answeringAdvanced) {
    return {
      hasError: true,
      error: 'Must address basic questions before proceeding to advanced questions.',
      message: 'Basic questions must be considered before advanced questions.',
      guidance: 'Answer at least one basic question or explicitly skip basic questions by setting done=false and proceeding.',
      currentStage: 'basic',
      nextStage: 'advanced'
    };
  }

  // Check completion requirements - only required questions are mandatory
  if (hasRequired && !requiredAnswered) {
    return {
      hasError: true,
      error: 'Required questions must be addressed before completion.',
      message: 'Cannot complete without addressing required questions.',
      guidance: 'Answer at least one required question or set done=false to continue configuration.',
      currentStage: 'required',
      nextStage: hasBasic ? 'basic' : (hasAdvanced ? 'advanced' : 'open')
    };
  }

  // Basic and advanced questions are optional for completion
  // But we enforce that if you provide an open answer without addressing optional groups,
  // it should be intentional (either N/A for defaults, or a real requirement that explains the skip)
  // This maintains the original flexibility while encouraging consideration of all options

  if (hasOpen && !openAnswered) {
    return {
      hasError: true,
      error: 'Open question must be answered before completion. Use "N/A" if no additional requirements.',
      message: 'Cannot complete without answering the open question.',
      guidance: 'Provide an answer to the open question, use "N/A" if no additional requirements, or set done=false to continue configuration.',
      currentStage: 'open',
      nextStage: 'completion'
    };
  }

  // All validations passed
  return { hasError: false };
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
        // Staged validation: ensure progression through all question groups
        const stagedValidationResult = validateStagedCompletion(solution, args.answers);
        if (stagedValidationResult.hasError) {
          const remainingQuestions = getRemainingQuestions(solution);
          const response = {
            status: 'validation_error',
            solutionId: args.solutionId,
            error: stagedValidationResult.error,
            questions: {
              required: remainingQuestions.filter(q => 
                solution.questions.required?.some((rq: any) => rq.id === q.id)
              ),
              basic: remainingQuestions.filter(q => 
                solution.questions.basic?.some((bq: any) => bq.id === q.id)
              ),
              advanced: remainingQuestions.filter(q => 
                solution.questions.advanced?.some((aq: any) => aq.id === q.id)
              ),
              open: solution.questions.open
            },
            message: stagedValidationResult.message,
            guidance: stagedValidationResult.guidance,
            currentStage: stagedValidationResult.currentStage,
            nextStage: stagedValidationResult.nextStage,
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
          message: `${solution.primaryResources?.join(' + ') || 'Application'} configuration complete. Ready to generate deployment manifests.`,
          solutionData: {
            primaryResources: solution.resources || [],
            type: solution.type || 'single',
            description: solution.description || '',
            userAnswers: userAnswers,
            hasOpenRequirements: !!openAnswer
          },
          nextAction: 'generateManifests',
          guidance: 'Configuration complete. Ready to generate Kubernetes manifests for deployment.',
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
      
      // Use group-by-group flow logic
      const groupState = getQuestionGroupState(solution);
      
      // Return group-based response
      if (groupState.currentGroup === 'complete') {
        // All groups complete - this shouldn't happen here as completion is handled earlier
        const response = {
          status: 'ready_for_manifest_generation',
          solutionId: args.solutionId,
          message: 'All configuration complete. Ready to generate manifests.',
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
      
      // Return current group questions
      let currentQuestions: any[];
      let groupName: string;
      let message: string;
      let nextAction: string;
      
      switch (groupState.currentGroup) {
        case 'required':
          currentQuestions = solution.questions.required || [];
          groupName = 'Required';
          message = 'Please answer the required configuration questions.';
          nextAction = groupState.nextGroup ? `continue_to_${groupState.nextGroup}` : 'complete';
          break;
        case 'basic':
          currentQuestions = solution.questions.basic || [];
          groupName = 'Basic';
          message = 'Would you like to configure basic settings (port, hostname)?';
          nextAction = groupState.nextGroup ? `continue_to_${groupState.nextGroup}_or_skip` : 'complete_or_skip';
          break;
        case 'advanced':
          currentQuestions = solution.questions.advanced || [];
          groupName = 'Advanced';
          message = 'Would you like to configure advanced features (scaling, CI/CD)?';
          nextAction = groupState.nextGroup ? `continue_to_${groupState.nextGroup}_or_skip` : 'complete_or_skip';
          break;
        case 'open':
          currentQuestions = [];
          groupName = 'Requirements';
          message = 'Any additional requirements or constraints?';
          nextAction = 'complete';
          break;
        default:
          currentQuestions = [];
          groupName = 'Unknown';
          message = 'Configuration state unclear.';
          nextAction = 'complete';
      }
      
      const response = {
        status: 'group_questions',
        solutionId: args.solutionId,
        currentGroup: groupState.currentGroup,
        groupName,
        completedGroups: groupState.completedGroups,
        progress: groupState.progress,
        questions: currentQuestions,
        open: groupState.currentGroup === 'open' ? solution.questions.open : undefined,
        message,
        nextAction,
        guidance: groupState.currentGroup === 'required' 
          ? 'All required questions must be answered to proceed.'
          : groupState.currentGroup === 'open'
          ? 'Use "N/A" if you have no additional requirements.'
          : 'Answer questions in this group or skip to proceed to the next group.',
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
      
      // Legacy first call handling (keeping for reference but shouldn't be reached)
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
          message: `Setting up ${solution.primaryResources?.[0] || 'application'} deployment. Any additional requirements (storage, security, networking, etc.)?`,
          guidance: 'You can provide additional requirements or constraints, or proceed with current defaults.',
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
            message: `Core ${solution.primaryResources?.[0] || 'application'} setup complete! ${remainingQuestions.length} optional settings available for fine-tuning.`,
            guidance: 'You can: (1) Answer specific optional questions, (2) Provide additional requirements, (3) Proceed with current configuration, or (4) Do both optional questions and requirements.',
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
            message: `${solution.primaryResources?.[0] || 'Application'} configuration ready! Any final requirements before generating manifests?`,
            guidance: 'You can provide additional requirements or constraints, or proceed directly to manifest generation.',
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
            message: `${remainingQuestions.length} required settings need values to complete ${solution.primaryResources?.[0] || 'application'} configuration.`,
            guidance: 'Please answer the remaining questions to continue configuration.',
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