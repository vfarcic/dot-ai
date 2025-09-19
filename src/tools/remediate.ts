/**
 * Remediate Tool - AI-powered Kubernetes issue analysis and remediation
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity, ConsoleLogger, Logger } from '../core/error-handling';
import { ClaudeIntegration } from '../core/claude';
import { getAndValidateSessionDirectory } from '../core/session-utils';
import { executeKubectl } from '../core/kubernetes-utils';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Tool metadata for direct MCP registration
export const REMEDIATE_TOOL_NAME = 'remediate';
export const REMEDIATE_TOOL_DESCRIPTION = 'AI-powered Kubernetes issue analysis that provides root cause identification and actionable remediation steps. Unlike basic kubectl commands, this tool performs multi-step investigation, correlates cluster data, and generates intelligent solutions. Use when users want to understand WHY something is broken, not just see raw status. Ideal for: troubleshooting failures, diagnosing performance issues, analyzing pod problems, investigating networking/storage issues, or any "what\'s wrong" questions.';

// Safety: Whitelist of allowed read-only operations
export const SAFE_OPERATIONS = ['get', 'describe', 'logs', 'events', 'top', 'explain'] as const;
export type SafeOperation = typeof SAFE_OPERATIONS[number];

/**
 * Check if command arguments contain dry-run flag (making any operation safe)
 */
function hasDryRunFlag(args?: string[]): boolean {
  if (!args) return false;
  return args.some(arg => 
    arg === '--dry-run=client' || 
    arg === '--dry-run=server' || 
    arg === '--dry-run' ||
    arg.startsWith('--dry-run=')
  );
}

// Zod schema for MCP registration
export const REMEDIATE_TOOL_INPUT_SCHEMA = {
  issue: z.string().min(1).max(2000).describe('Issue description that needs to be analyzed and remediated').optional(),
  context: z.object({
    event: z.any().optional().describe('Kubernetes event object'),
    logs: z.array(z.string()).optional().describe('Relevant log entries'),
    metrics: z.any().optional().describe('Relevant metrics data'),
    podSpec: z.any().optional().describe('Pod specification if relevant'),
    relatedEvents: z.array(z.any()).optional().describe('Related Kubernetes events')
  }).optional().describe('Optional initial context to help with analysis'),
  mode: z.enum(['manual', 'automatic']).optional().default('manual').describe('Execution mode: manual requires user approval, automatic executes based on thresholds'),
  confidenceThreshold: z.number().min(0).max(1).optional().default(0.8).describe('For automatic mode: minimum confidence required for execution (default: 0.8)'),
  maxRiskLevel: z.enum(['low', 'medium', 'high']).optional().default('low').describe('For automatic mode: maximum risk level allowed for execution (default: low)'),
  executeChoice: z.number().min(1).max(2).optional().describe('Execute a previously generated choice (1=Execute via MCP, 2=Execute via agent)'),
  sessionId: z.string().optional().describe('Session ID from previous remediate call when executing a choice'),
  executedCommands: z.array(z.string()).optional().describe('Commands that were executed to remediate the issue')
};

// Core interfaces matching PRD specification
export interface RemediateInput {
  issue?: string;  // Optional when executing a choice from previous session
  context?: {
    event?: any; // K8sEvent
    logs?: string[];
    metrics?: any; // Metrics
    podSpec?: any;
    relatedEvents?: any[]; // K8sEvent[]
  };
  mode?: 'manual' | 'automatic';
  confidenceThreshold?: number;  // For automatic mode: minimum confidence required for execution
  maxRiskLevel?: 'low' | 'medium' | 'high';  // For automatic mode: maximum risk level allowed for execution
  executeChoice?: number;  // Execute a previously generated choice (1=Execute via MCP, 2=Execute via agent)
  sessionId?: string;      // Session ID from previous remediate call when executing a choice
  executedCommands?: string[];  // Commands that were executed to remediate the issue
}

export interface DataRequest {
  type: string;  // Allow any kubectl operation
  resource: string;
  namespace?: string;
  args?: string[];  // Additional arguments like --dry-run=client
  rationale: string;
}

export interface InvestigationIteration {
  step: number;
  aiAnalysis: string;
  dataRequests: DataRequest[];
  gatheredData: { [key: string]: any };
  complete: boolean;
  timestamp: Date;
}

export interface RemediateSession {
  sessionId: string;
  issue: string;
  initialContext: any;
  mode: 'manual' | 'automatic';
  iterations: InvestigationIteration[];
  finalAnalysis?: RemediateOutput;
  created: Date;
  updated: Date;
  status: 'investigating' | 'analysis_complete' | 'failed' | 'executed_successfully' | 'executed_with_errors' | 'cancelled';
  executionResults?: ExecutionResult[];
}

export interface RemediationAction {
  description: string;
  command?: string;
  risk: 'low' | 'medium' | 'high';
  rationale: string;
}

export interface ExecutionResult {
  action: string;
  success: boolean;
  output?: string;
  error?: string;
  timestamp: Date;
}

export interface ExecutionChoice {
  id: number;
  label: string;
  description: string;
  risk?: 'low' | 'medium' | 'high';  // Informative only - helps users understand implications
}

export interface RemediateOutput {
  status: 'success' | 'failed' | 'awaiting_user_approval';
  sessionId: string;
  investigation: {
    iterations: number;
    dataGathered: string[];
  };
  analysis: {
    rootCause: string;
    confidence: number;
    factors: string[];
  };
  remediation: {
    summary: string;
    actions: RemediationAction[];
    risk: 'low' | 'medium' | 'high';
  };
  // Validation intent for automatic post-execution validation
  validationIntent?: string;
  // Standard agent instruction fields (following project patterns)
  guidance?: string;            // Critical instructions for agent behavior
  agentInstructions?: string;   // Step-by-step instructions for the agent
  nextAction?: string;          // What MCP tool to call next
  message?: string;             // Summary message for display
  // Numbered execution choices for user interaction (manual mode only)
  executionChoices?: ExecutionChoice[];
  executed?: boolean;           // true if automatic mode executed actions
  results?: ExecutionResult[];  // execution results if executed
  fallbackReason?: string;      // why automatic mode chose not to execute
}

/**
 * Generate unique session ID for investigation tracking
 */
function generateSessionId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const random = crypto.randomBytes(8).toString('hex');
  return `rem_${timestamp}_${random}`;
}

/**
 * Write session file to session directory
 */
function writeSessionFile(sessionDir: string, sessionId: string, sessionData: RemediateSession): void {
  const sessionPath = path.join(sessionDir, `${sessionId}.json`);
  const sessionJson = JSON.stringify(sessionData, null, 2);
  fs.writeFileSync(sessionPath, sessionJson, 'utf8');
}

/**
 * Read session file from session directory
 */
function readSessionFile(sessionDir: string, sessionId: string): RemediateSession {
  const sessionPath = path.join(sessionDir, `${sessionId}.json`);
  
  if (!fs.existsSync(sessionPath)) {
    throw new Error(`Session file not found: ${sessionId}`);
  }
  
  const sessionJson = fs.readFileSync(sessionPath, 'utf8');
  return JSON.parse(sessionJson) as RemediateSession;
}

/**
 * Update existing session file
 */
function updateSessionFile(sessionDir: string, sessionId: string, updates: Partial<RemediateSession>): void {
  const session = readSessionFile(sessionDir, sessionId);
  const updatedSession = {
    ...session,
    ...updates,
    updated: new Date()
  };
  writeSessionFile(sessionDir, sessionId, updatedSession);
}

/**
 * AI-driven investigation loop - iteratively gather data and analyze until complete
 */
async function conductInvestigation(
  session: RemediateSession,
  sessionDir: string,
  claudeIntegration: ClaudeIntegration,
  logger: Logger,
  requestId: string
): Promise<RemediateOutput> {
  const maxIterations = 20; // Allow more comprehensive investigations
  let currentIteration = session.iterations.length;

  logger.info('Starting AI investigation loop', { 
    requestId, 
    sessionId: session.sessionId, 
    currentIterations: currentIteration 
  });

  while (currentIteration < maxIterations) {
    logger.debug(`Starting investigation iteration ${currentIteration + 1}`, { requestId, sessionId: session.sessionId });

    try {
      // Get AI analysis with investigation prompts
      const aiAnalysis = await analyzeCurrentState(session, claudeIntegration, logger, requestId);
      
      // Parse AI response for data requests and completion status
      const { dataRequests, isComplete, needsMoreSpecificInfo, parsedResponse } = parseAIResponse(aiAnalysis);
      
      // Handle early termination when issue description is too vague
      if (needsMoreSpecificInfo) {
        logger.info('Investigation terminated: needs more specific information', {
          requestId,
          sessionId: session.sessionId,
          iteration: currentIteration + 1
        });
        
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Unable to find relevant resources for the reported issue. Please be more specific about which resource type or component is having problems (e.g., "my sqls.devopstoolkit.live resource named test-db" instead of "my database").',
          {
            operation: 'investigation_early_termination',
            component: 'RemediateTool',
            input: { sessionId: session.sessionId, issue: session.issue }
          }
        );
      }
      
      // Gather safe data from Kubernetes using kubectl
      const gatheredData = await gatherSafeData(dataRequests, logger, requestId);
      
      // Create iteration record
      const iteration: InvestigationIteration = {
        step: currentIteration + 1,
        aiAnalysis,
        dataRequests,
        gatheredData,
        complete: isComplete,
        timestamp: new Date()
      };
      
      // Store parsed response data if available
      if (parsedResponse) {
        logger.debug('AI investigation analysis', {
          requestId,
          sessionId: session.sessionId,
          confidence: parsedResponse.confidence,
          reasoning: parsedResponse.reasoning,
          dataRequestCount: parsedResponse.dataRequests.length
        });
      }

      // Update session with new iteration
      session.iterations.push(iteration);
      updateSessionFile(sessionDir, session.sessionId, { iterations: session.iterations });

      logger.debug('Investigation iteration completed', { 
        requestId, 
        sessionId: session.sessionId, 
        step: iteration.step,
        dataRequestCount: dataRequests.length,
        complete: iteration.complete
      });

      // Check if analysis is complete
      if (iteration.complete) {
        logger.info('Investigation completed by AI decision', { 
          requestId, 
          sessionId: session.sessionId, 
          totalIterations: iteration.step,
          confidence: parsedResponse?.confidence,
          reasoning: parsedResponse?.reasoning 
        });
        break;
      }

      currentIteration++;
    } catch (error) {
      logger.error('Investigation iteration failed', error as Error, { 
        requestId, 
        sessionId: session.sessionId, 
        iteration: currentIteration + 1
      });
      
      // Mark session as failed
      updateSessionFile(sessionDir, session.sessionId, { status: 'failed' });
      
      throw ErrorHandler.createError(
        ErrorCategory.AI_SERVICE,
        ErrorSeverity.HIGH,
        `Investigation failed at iteration ${currentIteration + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          operation: 'investigation_loop',
          component: 'RemediateTool',
          input: { sessionId: session.sessionId, iteration: currentIteration + 1 }
        }
      );
    }
  }

  // Generate final analysis
  const finalAnalysis = await generateFinalAnalysis(session, logger, requestId);
  
  // Update session with final analysis
  updateSessionFile(sessionDir, session.sessionId, { 
    finalAnalysis, 
    status: 'analysis_complete' 
  });

  logger.info('Investigation and analysis completed', { 
    requestId, 
    sessionId: session.sessionId, 
    rootCause: finalAnalysis.analysis.rootCause,
    recommendedActions: finalAnalysis.remediation.actions.length
  });

  return finalAnalysis;
}

/**
 * Analyze current state using AI with investigation prompts
 */
async function analyzeCurrentState(
  session: RemediateSession,
  claudeIntegration: ClaudeIntegration,
  logger: Logger,
  requestId: string
): Promise<string> {
  logger.debug('Analyzing current state with AI', { requestId, sessionId: session.sessionId });
  
  try {
    // Load investigation prompt template
    const promptPath = path.join(process.cwd(), 'prompts', 'remediate-investigation.md');
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');
    
    // Discover cluster API resources for complete visibility - REQUIRED for quality remediation
    let clusterApiResources = '';
    try {
      // Use kubectl api-resources directly - simple and reliable
      clusterApiResources = await executeKubectl(['api-resources']);
      
      logger.debug('Discovered cluster API resources', { 
        requestId, 
        sessionId: session.sessionId,
        outputLength: clusterApiResources.length
      });
    } catch (error) {
      const errorMessage = `Failed to discover cluster API resources: ${error instanceof Error ? error.message : String(error)}. Complete API visibility is required for quality remediation recommendations.`;
      logger.error('API discovery failed - aborting remediation', error as Error, { 
        requestId, 
        sessionId: session.sessionId
      });
      throw new Error(errorMessage);
    }

    // Prepare template variables
    const currentIteration = session.iterations.length + 1;
    const maxIterations = 20;
    const initialContextJson = JSON.stringify(session.initialContext, null, 2);
    const previousIterationsJson = JSON.stringify(
      session.iterations.map(iter => ({
        step: iter.step,
        analysis: iter.aiAnalysis,
        dataRequests: iter.dataRequests,
        gatheredData: iter.gatheredData
      })), 
      null, 
      2
    );
    
    // Replace template variables
    const investigationPrompt = promptTemplate
      .replace('{issue}', session.issue)
      .replace('{initialContext}', initialContextJson)
      .replace('{currentIteration}', currentIteration.toString())
      .replace('{maxIterations}', maxIterations.toString())
      .replace('{previousIterations}', previousIterationsJson)
      .replace('{clusterApiResources}', clusterApiResources);
    
    logger.debug('Sending investigation prompt to Claude', { 
      requestId, 
      sessionId: session.sessionId,
      promptLength: investigationPrompt.length,
      iteration: currentIteration
    });
    
    // Send to Claude AI
    const aiResponse = await claudeIntegration.sendMessage(investigationPrompt);
    
    logger.debug('Received AI analysis response', { 
      requestId, 
      sessionId: session.sessionId,
      responseLength: aiResponse.content.length
    });
    
    return aiResponse.content;
    
  } catch (error) {
    logger.error('Failed to analyze current state with AI', error as Error, { requestId, sessionId: session.sessionId });
    
    throw ErrorHandler.createError(
      ErrorCategory.AI_SERVICE,
      ErrorSeverity.HIGH,
      `AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        operation: 'ai_analysis',
        component: 'RemediateTool',
        requestId,
        sessionId: session.sessionId,
        suggestedActions: [
          'Check ANTHROPIC_API_KEY is set correctly',
          'Verify prompts/remediate-investigation.md exists',
          'Check network connectivity to Anthropic API'
        ]
      }
    );
  }
}

/**
 * AI Response interface matching our prompt format
 */
interface AIInvestigationResponse {
  analysis: string;
  dataRequests: DataRequest[];
  investigationComplete: boolean;
  confidence: number;
  reasoning: string;
  needsMoreSpecificInfo?: boolean;
}

/**
 * AI Final Analysis Response interface matching final analysis prompt format
 */
interface AIFinalAnalysisResponse {
  issueStatus: 'active' | 'resolved' | 'non_existent';
  rootCause: string;
  confidence: number;
  factors: string[];
  remediation: {
    summary: string;
    actions: RemediationAction[];
    risk: 'low' | 'medium' | 'high';
  };
  validationIntent?: string;
}

/**
 * Parse AI final analysis response
 */
export function parseAIFinalAnalysis(aiResponse: string): AIFinalAnalysisResponse {
  try {
    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI final analysis response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as AIFinalAnalysisResponse;
    
    // Validate required fields
    if (!parsed.issueStatus || !parsed.rootCause || !parsed.confidence || !Array.isArray(parsed.factors) || !parsed.remediation) {
      throw new Error('Invalid AI final analysis response structure');
    }
    
    // Validate issueStatus field
    if (!['active', 'resolved', 'non_existent'].includes(parsed.issueStatus)) {
      throw new Error(`Invalid issue status: ${parsed.issueStatus}. Must be 'active', 'resolved', or 'non_existent'`);
    }
    
    if (!parsed.remediation.summary || !Array.isArray(parsed.remediation.actions) || !parsed.remediation.risk) {
      throw new Error('Invalid remediation structure in AI final analysis response');
    }
    
    // Validate each remediation action
    for (const action of parsed.remediation.actions) {
      if (!action.description || !action.risk || !action.rationale) {
        throw new Error('Invalid remediation action structure');
      }
      if (!['low', 'medium', 'high'].includes(action.risk)) {
        throw new Error(`Invalid risk level: ${action.risk}`);
      }
    }
    
    // Validate overall risk level
    if (!['low', 'medium', 'high'].includes(parsed.remediation.risk)) {
      throw new Error(`Invalid overall risk level: ${parsed.remediation.risk}`);
    }
    
    // Validate confidence is between 0 and 1
    if (parsed.confidence < 0 || parsed.confidence > 1) {
      throw new Error(`Invalid confidence value: ${parsed.confidence}. Must be between 0 and 1`);
    }
    
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse AI final analysis response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse AI response for data requests and investigation status
 */
export function parseAIResponse(aiResponse: string): { dataRequests: DataRequest[], isComplete: boolean, needsMoreSpecificInfo?: boolean, parsedResponse?: AIInvestigationResponse } {
  try {
    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as AIInvestigationResponse;
    
    // Validate required fields
    if (typeof parsed.investigationComplete !== 'boolean') {
      throw new Error('Missing or invalid investigationComplete field');
    }
    
    if (!Array.isArray(parsed.dataRequests)) {
      throw new Error('Missing or invalid dataRequests field');
    }
    
    // Validate data requests format
    for (const request of parsed.dataRequests) {
      // Check if operation is safe (read-only) or has dry-run flag
      const isDryRun = hasDryRunFlag(request.args);
      const isSafeOperation = SAFE_OPERATIONS.includes(request.type as SafeOperation);
      
      if (!isSafeOperation && !isDryRun) {
        throw new Error(`Invalid data request type: ${request.type}. Allowed: ${SAFE_OPERATIONS.join(', ')} or any operation with --dry-run flag`);
      }
      if (!request.resource || !request.rationale) {
        throw new Error('Data request missing required fields: resource, rationale');
      }
    }
    
    return {
      dataRequests: parsed.dataRequests,
      isComplete: parsed.investigationComplete,
      needsMoreSpecificInfo: parsed.needsMoreSpecificInfo,
      parsedResponse: parsed
    };
    
  } catch (error) {
    // Fallback: try to extract data requests from text patterns
    console.warn('Failed to parse AI JSON response, using fallback parsing:', error instanceof Error ? error.message : 'Unknown error');
    
    // Simple fallback - assume investigation needs to continue and no data requests
    return {
      dataRequests: [],
      isComplete: false
    };
  }
}

/**
 * Data gathering result for a single kubectl request
 */
interface DataGatheringResult {
  successful: { [requestId: string]: any };
  failed: { 
    [requestId: string]: {
      error: string;
      command: string;  
      suggestion?: string;
    }
  };
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

/**
 * Gather safe data from Kubernetes using kubectl
 * Implements resilient error handling - failed requests don't kill the investigation
 */
async function gatherSafeData(
  dataRequests: DataRequest[],
  logger: Logger,
  requestId: string
): Promise<DataGatheringResult> {
  logger.debug('Gathering safe data from Kubernetes', { requestId, requestCount: dataRequests.length });
  
  const result: DataGatheringResult = {
    successful: {},
    failed: {},
    summary: {
      total: dataRequests.length,
      successful: 0,
      failed: 0
    }
  };
  
  // Process each data request independently
  for (let i = 0; i < dataRequests.length; i++) {
    const request = dataRequests[i];
    const dataRequestId = `${requestId}-req-${i}`;
    
    try {
      // Safety validation - allow read-only operations OR operations with dry-run flag
      const isDryRun = hasDryRunFlag(request.args);
      const isReadOnlyOperation = SAFE_OPERATIONS.includes(request.type as SafeOperation);
      
      if (!isReadOnlyOperation && !isDryRun) {
        const error = `Unsafe operation '${request.type}' - only allowed: ${SAFE_OPERATIONS.join(', ')} or any operation with --dry-run flag`;
        result.failed[dataRequestId] = {
          error,
          command: `kubectl ${request.type} ${request.resource}${request.args ? ' ' + request.args.join(' ') : ''}`,
          suggestion: 'Use read-only operations (get, describe, logs, events, top) or add --dry-run=client to validate commands safely'
        };
        result.summary.failed++;
        logger.warn('Rejected unsafe kubectl operation', { requestId, dataRequestId, operation: request.type, isDryRun });
        continue;
      }
      
      // Build kubectl command
      const args: string[] = [request.type, request.resource];
      if (request.namespace) {
        args.push('-n', request.namespace);
      }
      
      // Add any additional arguments (like --dry-run=client)
      if (request.args && request.args.length > 0) {
        args.push(...request.args);
      }
      
      // Add output format for structured data (only for read-only commands that support it)
      if ((request.type === 'get' || request.type === 'events' || request.type === 'top') && !isDryRun) {
        args.push('-o', 'yaml');
      }
      
      logger.debug('Executing kubectl command', { 
        requestId, 
        dataRequestId, 
        command: `kubectl ${args.join(' ')}`,
        rationale: request.rationale 
      });
      
      // Execute kubectl command
      const output = await executeKubectl(args, { timeout: 30000 });
      
      // Store successful result
      result.successful[dataRequestId] = {
        request,
        output,
        command: `kubectl ${args.join(' ')}`,
        timestamp: new Date().toISOString()
      };
      result.summary.successful++;
      
      logger.debug('kubectl command successful', { 
        requestId, 
        dataRequestId, 
        outputLength: output.length 
      });
      
    } catch (error) {
      // Store failed result with error details
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const command = `kubectl ${request.type} ${request.resource}${request.namespace ? ` -n ${request.namespace}` : ''}`;
      
      result.failed[dataRequestId] = {
        error: errorMessage,
        command,
        suggestion: generateErrorSuggestion(errorMessage)
      };
      result.summary.failed++;
      
      logger.warn('kubectl command failed', { 
        requestId, 
        dataRequestId, 
        command,
        error: errorMessage,
        rationale: request.rationale
      });
    }
  }
  
  logger.info('Data gathering completed', {
    requestId,
    successful: result.summary.successful,
    failed: result.summary.failed,
    total: result.summary.total
  });
  
  return result;
}

/**
 * Generate helpful suggestions based on kubectl error messages
 */
function generateErrorSuggestion(errorMessage: string): string | undefined {
  const lowerError = errorMessage.toLowerCase();
  
  if (lowerError.includes('not found')) {
    return 'Resource may not exist or may be in a different namespace. Try listing available resources first.';
  }
  
  if (lowerError.includes('forbidden')) {
    return 'Insufficient permissions. Check RBAC configuration for read access to this resource.';
  }
  
  if (lowerError.includes('namespace') && lowerError.includes('not found')) {
    return 'Namespace does not exist. Try listing available namespaces first.';
  }
  
  if (lowerError.includes('connection refused') || lowerError.includes('timeout')) {
    return 'Cannot connect to Kubernetes cluster. Verify cluster connectivity and kubectl configuration.';
  }
  
  return undefined;
}


/**
 * Generate final analysis and remediation recommendations using AI
 */
async function generateFinalAnalysis(
  session: RemediateSession,
  logger: Logger,
  requestId: string
): Promise<RemediateOutput> {
  logger.debug('Generating final analysis with AI', { requestId, sessionId: session.sessionId });

  try {
    // Initialize Claude integration
    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeApiKey) {
      throw ErrorHandler.createError(
        ErrorCategory.CONFIGURATION,
        ErrorSeverity.HIGH,
        'ANTHROPIC_API_KEY environment variable not set for final analysis',
        {
          operation: 'generateFinalAnalysis',
          component: 'RemediateTool',
          requestId,
          sessionId: session.sessionId
        }
      );
    }

    const claudeIntegration = new ClaudeIntegration(claudeApiKey);

    // Load final analysis prompt template
    const promptPath = path.join(process.cwd(), 'prompts', 'remediate-final-analysis.md');
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');
    
    // Prepare template variables - extract actual data source identifiers
    const dataSources = session.iterations.flatMap(iter => {
      if (iter.gatheredData && iter.gatheredData.successful) {
        return Object.keys(iter.gatheredData.successful);
      }
      return [];
    });
    // Compile complete investigation data for AI analysis
    const completeInvestigationData = session.iterations.map(iter => ({
      iteration: iter.step,
      analysis: iter.aiAnalysis,
      dataGathered: Object.entries(iter.gatheredData).map(([key, value]) => ({
        source: key,
        data: typeof value === 'string' ? value.substring(0, 1000) : JSON.stringify(value).substring(0, 1000)
      }))
    }));

    // Replace template variables
    const finalAnalysisPrompt = promptTemplate
      .replace('{issue}', session.issue)
      .replace('{iterations}', session.iterations.length.toString())
      .replace('{dataSources}', dataSources.join(', '))
      .replace('{completeInvestigationData}', JSON.stringify(completeInvestigationData, null, 2));

    logger.debug('Sending final analysis request to Claude AI', { 
      requestId, 
      sessionId: session.sessionId,
      promptLength: finalAnalysisPrompt.length
    });
    
    // Send to Claude AI
    const aiResponse = await claudeIntegration.sendMessage(finalAnalysisPrompt);
    
    logger.debug('Received AI final analysis response', { 
      requestId, 
      sessionId: session.sessionId,
      responseLength: aiResponse.content.length
    });

    // Parse AI response
    const finalAnalysis = parseAIFinalAnalysis(aiResponse.content);

    logger.info('Final analysis generated successfully', { 
      requestId, 
      sessionId: session.sessionId,
      confidence: finalAnalysis.confidence,
      actionCount: finalAnalysis.remediation.actions.length,
      overallRisk: finalAnalysis.remediation.risk
    });

    // Convert data sources to human-readable format
    const humanReadableDataSources = dataSources.length > 0 
      ? [`Analyzed ${dataSources.length} data sources from ${session.iterations.length} investigation iterations`]
      : ['cluster-resources', 'pod-status', 'node-capacity'];

    // Handle different issue statuses
    if (finalAnalysis.issueStatus === 'resolved' || finalAnalysis.issueStatus === 'non_existent') {
      // Issue is resolved or doesn't exist - return success status
      const statusMessage = finalAnalysis.issueStatus === 'resolved' 
        ? 'Issue has been successfully resolved'
        : 'No issues found - system is healthy';
        
      return {
        status: 'success',
        analysis: {
          rootCause: finalAnalysis.rootCause,
          confidence: finalAnalysis.confidence,
          factors: finalAnalysis.factors
        },
        remediation: {
          summary: finalAnalysis.remediation.summary,
          actions: finalAnalysis.remediation.actions,
          risk: finalAnalysis.remediation.risk
        },
        validationIntent: finalAnalysis.validationIntent,
        sessionId: session.sessionId,
        investigation: {
          iterations: session.iterations.length,
          dataGathered: humanReadableDataSources
        },
        executed: false,
        // Success state guidance
        guidance: `✅ ${statusMessage.toUpperCase()}: ${finalAnalysis.remediation.summary}`,
        agentInstructions: `1. Show user that the ${finalAnalysis.issueStatus === 'resolved' ? 'issue has been resolved' : 'no issues were found'}\n2. Display the analysis and confidence level\n3. Explain the current healthy state\n4. No further action required`,
        nextAction: undefined,
        message: `${statusMessage} with ${Math.round(finalAnalysis.confidence * 100)}% confidence.`
      };
    }

    // Issue is active - generate execution options
    const commandsSummary = finalAnalysis.remediation.actions.length === 1 
      ? `The following kubectl command will be executed:\n${finalAnalysis.remediation.actions[0].command}`
      : `The following ${finalAnalysis.remediation.actions.length} kubectl commands will be executed:\n${finalAnalysis.remediation.actions.map((action, i) => `${i + 1}. ${action.command}`).join('\n')}`;

    // Generate risk summary  
    const highRiskActions = finalAnalysis.remediation.actions.filter(a => a.risk === 'high');
    const mediumRiskActions = finalAnalysis.remediation.actions.filter(a => a.risk === 'medium');
    const riskSummary = [
      ...(highRiskActions.length > 0 ? [`${highRiskActions.length} HIGH RISK actions require careful review`] : []),
      ...(mediumRiskActions.length > 0 ? [`${mediumRiskActions.length} MEDIUM RISK actions should be executed with monitoring`] : []),
      "All actions are designed to be safe kubectl operations (no destructive commands)"
    ].join('. ');

    // Return active issue response with execution choices
    return {
      status: 'awaiting_user_approval',
      analysis: {
        rootCause: finalAnalysis.rootCause,
        confidence: finalAnalysis.confidence,
        factors: finalAnalysis.factors
      },
      remediation: {
        summary: finalAnalysis.remediation.summary,
        actions: finalAnalysis.remediation.actions,
        risk: finalAnalysis.remediation.risk
      },
      validationIntent: finalAnalysis.validationIntent,
      sessionId: session.sessionId,
      investigation: {
        iterations: session.iterations.length,
        dataGathered: humanReadableDataSources
      },
      executed: false,
      // Active issue guidance
      guidance: `🔴 CRITICAL: Present the kubectl commands to the user and ask them to choose execution method. DO NOT execute commands without user approval.\n\n${commandsSummary}\n\nRisk Assessment: ${riskSummary}`,
      agentInstructions: `1. Show the user the root cause analysis and confidence level\n2. Display the kubectl commands that will be executed\n3. Explain the risk assessment\n4. Present the two execution choices and wait for user selection\n5. Do NOT automatically execute any commands`,
      nextAction: 'remediate',
      message: `AI analysis identified the root cause with ${Math.round(finalAnalysis.confidence * 100)}% confidence. ${finalAnalysis.remediation.actions.length} remediation actions are recommended.`
    };
    
  } catch (error) {
    logger.error('Failed to generate final analysis', error as Error, { 
      requestId, 
      sessionId: session.sessionId 
    });
    
    throw ErrorHandler.createError(
      ErrorCategory.AI_SERVICE,
      ErrorSeverity.HIGH,
      `Final analysis generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        operation: 'generateFinalAnalysis',
        component: 'RemediateTool',
        requestId,
        sessionId: session.sessionId,
        suggestedActions: [
          'Check ANTHROPIC_API_KEY is set correctly',
          'Verify prompts/remediate-final-analysis.md exists',
          'Check network connectivity to Anthropic API',
          'Review AI response format for parsing issues'
        ]
      }
    );
  }
}

/**
 * Execute user choice from previous session
 */
async function executeUserChoice(
  sessionDir: string,
  sessionId: string,
  choice: number,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    // Load previous session
    const session = readSessionFile(sessionDir, sessionId);
    
    if (!session.finalAnalysis) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        'Session does not have final analysis - cannot execute choice',
        { operation: 'choice_execution', component: 'RemediateTool', sessionId }
      );
    }

    logger.info('Loaded session for choice execution', { 
      requestId, 
      sessionId, 
      choice,
      actionCount: session.finalAnalysis.remediation.actions.length 
    });

    // Handle different choices
    switch (choice) {
      case 1: // Execute automatically via MCP
        return await executeRemediationCommands(session, sessionDir, logger, requestId);
        
      case 2: { // Execute via agent
        // Use validation intent directly from final analysis
        const validationIntent = session.finalAnalysis.validationIntent || 'Check the status of the affected resources to verify the issue has been resolved';

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'success',
                sessionId: sessionId,
                message: 'Ready for agent execution',
                remediation: session.finalAnalysis.remediation,
                instructions: {
                  nextSteps: [
                    'STEP 1: Execute the kubectl commands shown in the remediation section using your Bash tool',
                    'STEP 2: After successful execution, call the remediation tool again WITHOUT the sessionId (fresh validation) using this exact message:',
                    `"${validationIntent}"`,
                    'IMPORTANT: Do not include the sessionId in the new call - this ensures fresh post-execution validation',
                    'The MCP will then perform a new investigation to validate the results and confirm the issue is resolved'
                  ]
                }
              }, null, 2)
            }
          ]
        };
      }
        
      default:
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Invalid choice: ${choice}. Must be 1 or 2`,
          { operation: 'choice_validation', component: 'RemediateTool' }
        );
    }
    
  } catch (error) {
    logger.error('Choice execution failed', error as Error, { requestId, sessionId, choice });
    
    if (error instanceof Error && error.message.includes('Session file not found')) {
      throw ErrorHandler.createError(
        ErrorCategory.OPERATION,
        ErrorSeverity.HIGH,
        `Session not found: ${sessionId}. The session may have expired or been deleted.`,
        { operation: 'session_loading', component: 'RemediateTool' }
      );
    }
    
    throw error;
  }
}

/**
 * Execute remediation commands via kubectl
 */
async function executeRemediationCommands(
  session: RemediateSession,
  sessionDir: string,
  logger: Logger,
  requestId: string
): Promise<any> {
  const results: ExecutionResult[] = [];
  const finalAnalysis = session.finalAnalysis!;
  let overallSuccess = true;

  logger.info('Starting remediation command execution', { 
    requestId, 
    sessionId: session.sessionId,
    commandCount: finalAnalysis.remediation.actions.length 
  });

  // Execute each remediation action
  for (let i = 0; i < finalAnalysis.remediation.actions.length; i++) {
    const action = finalAnalysis.remediation.actions[i];
    const actionId = `action_${i + 1}`;
    
    try {
      logger.info('Executing remediation action', { 
        requestId, 
        sessionId: session.sessionId, 
        actionId,
        command: action.command 
      });

      // Execute the command as-is using shell
      const fullCommand = action.command || '';
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync(fullCommand);
      const output = stdout;
      
      results.push({
        action: `${actionId}: ${action.description}`,
        success: true,
        output: output,
        timestamp: new Date()
      });
      
      logger.info('Remediation action succeeded', { 
        requestId, 
        sessionId: session.sessionId, 
        actionId 
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      overallSuccess = false;
      
      results.push({
        action: `${actionId}: ${action.description}`,
        success: false,
        error: errorMessage,
        timestamp: new Date()
      });
      
      logger.error('Remediation action failed', error as Error, { 
        requestId, 
        sessionId: session.sessionId, 
        actionId,
        command: action.command 
      });
    }
  }

  // Run automatic post-execution validation if all commands succeeded
  let validationResult = null;
  if (overallSuccess && finalAnalysis.validationIntent) {
    const validationIntent = finalAnalysis.validationIntent;
    
    try {
          logger.info('Running post-execution validation', { 
            requestId, 
            sessionId: session.sessionId,
            validationIntent: validationIntent
          });

          // Run validation by calling main function recursively with validation intent
          const executedCommands = results.map(r => r.action);
          const validationInput = {
            issue: validationIntent,
            sessionDir: sessionDir,
            executedCommands: executedCommands
          };
      
          // Recursive call to main function for validation
          const validationResponse = await handleRemediateTool(validationInput);
          const validationData = JSON.parse(validationResponse.content[0].text);
          
          // If validation discovered new issues, enhance with execution context
          if (validationData.status === 'awaiting_user_approval') {
            logger.info('Validation discovered new issues, enhancing response with execution context', {
              requestId,
              sessionId: session.sessionId,
              newIssueConfidence: validationData.analysis?.confidence
            });
            
            // Enhance validation response with execution context
            validationData.executed = true;
            validationData.results = results;
            validationData.executedCommands = results.map(r => r.action);
            validationData.previousExecution = {
              sessionId: session.sessionId,
              summary: `Previously executed ${results.length} remediation actions`,
              actions: finalAnalysis.remediation.actions
            };
            
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(validationData, null, 2)
                }
              ]
            };
          }
          
          // Validation confirmed issue is resolved - create success response
          logger.info('Validation confirmed issue is resolved, creating success response', {
            requestId,
            sessionId: session.sessionId,
            validationStatus: validationData.status
          });
          
          // Create success response with execution context
          const successResponse = {
            status: 'success',
            sessionId: session.sessionId,
            executed: true,
            results: results,
            executedCommands: results.map(r => r.action),
            analysis: validationData.analysis,
            remediation: {
              summary: `Successfully executed ${results.length} remediation actions. ${validationData.remediation.summary}`,
              actions: finalAnalysis.remediation.actions,
              risk: finalAnalysis.remediation.risk
            },
            investigation: validationData.investigation,
            validationIntent: validationData.validationIntent,
            guidance: `✅ REMEDIATION COMPLETE: Issue has been successfully resolved through executed commands.`,
            agentInstructions: `1. Show user that the issue has been successfully resolved\n2. Display the actual kubectl commands that were executed (from remediation.actions[].command field)\n3. Show execution results with success/failure status for each command\n4. Show the validation results confirming the fix worked\n5. No further action required`,
            message: `Issue successfully resolved. Executed ${results.length} remediation actions and validated the fix.`,
            validation: {
              success: true,
              summary: 'Validation confirmed issue resolution'
            }
          };
          
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(successResponse, null, 2)
              }
            ]
          };

        } catch (error) {
          logger.warn('Post-execution validation failed', { 
            requestId, 
            sessionId: session.sessionId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          validationResult = {
            success: false,
            error: error instanceof Error ? error.message : 'Validation failed',
            summary: 'Validation could not be completed automatically'
          };
        }
    }

  // Update session with execution results
  updateSessionFile(sessionDir, session.sessionId, { 
    status: overallSuccess ? 'executed_successfully' : 'executed_with_errors',
    executionResults: results
  });

  const response = {
    status: overallSuccess ? 'success' : 'failed',
    sessionId: session.sessionId,
    executed: true,
    results: results,
    executedCommands: results.map(r => r.action),
    message: overallSuccess 
      ? `Successfully executed ${results.length} remediation actions`
      : `Executed ${results.length} actions with ${results.filter(r => !r.success).length} failures`,
    validation: validationResult,
    instructions: {
      showExecutedCommands: true,
      showActualKubectlCommands: true,
      nextSteps: overallSuccess 
        ? validationResult 
          ? [
              'The following kubectl commands were executed to remediate the issue:',
              ...finalAnalysis.remediation.actions.map((action, index) => 
                `  ${index + 1}. ${action.command} ${results[index]?.success ? '✓' : '✗'}`
              ),
              'Automatic validation has been completed - see validation results above',
              'Monitor your cluster to ensure the issue remains resolved'
            ]
          : [
              'The following kubectl commands were executed to remediate the issue:',
              ...finalAnalysis.remediation.actions.map((action, index) => 
                `  ${index + 1}. ${action.command} ${results[index]?.success ? '✓' : '✗'}`
              ),
              `You can verify the fix by running: remediate("Verify that ${finalAnalysis.analysis.rootCause.toLowerCase()} has been resolved")`,
              'Monitor your cluster to ensure the issue is fully resolved'
            ]
        : [
            'The following kubectl commands were attempted:',
            ...finalAnalysis.remediation.actions.map((action, index) => 
              `  ${index + 1}. ${action.command} ${results[index]?.success ? '✓' : '✗'}`
            ),
            'Some remediation commands failed - check the results above',
            'Review the error messages and address any underlying issues',
            'You may need to run additional commands or investigate further'
          ]
    },
    investigation: finalAnalysis.investigation,
    analysis: finalAnalysis.analysis,
    remediation: finalAnalysis.remediation
  };

  logger.info('Remediation execution completed', { 
    requestId, 
    sessionId: session.sessionId,
    overallSuccess,
    successfulActions: results.filter(r => r.success).length,
    failedActions: results.filter(r => !r.success).length
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(response, null, 2)
      }
    ]
  };
}

/**
 * Main tool handler for remediate tool
 */
export async function handleRemediateTool(args: any): Promise<any> {
  const requestId = `remediate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logger = new ConsoleLogger('RemediateTool');

  try {
    // Validate and get session directory
    const sessionDir = getAndValidateSessionDirectory(args, true);
    logger.debug('Session directory validated', { requestId, sessionDir });

    // Validate input
    const validatedInput = validateRemediateInput(args);
    
    // Handle choice execution if provided
    if (validatedInput.executeChoice && validatedInput.sessionId) {
      logger.info('Executing user choice from previous session', { 
        requestId, 
        choice: validatedInput.executeChoice, 
        sessionId: validatedInput.sessionId 
      });
      
      return await executeUserChoice(
        sessionDir,
        validatedInput.sessionId,
        validatedInput.executeChoice,
        logger,
        requestId
      );
    }
    
    // Validate that we have an issue for new investigations
    if (!validatedInput.issue) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        'Issue description is required for new investigations',
        { operation: 'input_validation', component: 'RemediateTool' }
      );
    }
    
    // Generate session ID and create initial session
    const sessionId = generateSessionId();
    const session: RemediateSession = {
      sessionId,
      issue: validatedInput.issue,
      initialContext: validatedInput.context || {},
      mode: validatedInput.mode || 'manual',
      iterations: [],
      created: new Date(),
      updated: new Date(),
      status: 'investigating'
    };

    // Write initial session file
    writeSessionFile(sessionDir, sessionId, session);
    logger.info('Investigation session created', { requestId, sessionId });

    // Initialize Claude integration
    const claudeApiKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeApiKey) {
      throw ErrorHandler.createError(
        ErrorCategory.CONFIGURATION,
        ErrorSeverity.HIGH,
        'ANTHROPIC_API_KEY environment variable not set',
        {
          operation: 'claude_initialization',
          component: 'RemediateTool',
          requestId,
          suggestedActions: ['Set ANTHROPIC_API_KEY environment variable']
        }
      );
    }

    const claudeIntegration = new ClaudeIntegration(claudeApiKey);

    // Conduct AI-driven investigation
    const finalAnalysis = await conductInvestigation(
      session,
      sessionDir,
      claudeIntegration,
      logger,
      requestId
    );

    logger.info('Remediation analysis completed', {
      requestId,
      sessionId,
      rootCause: finalAnalysis.analysis.rootCause,
      actionCount: finalAnalysis.remediation.actions.length,
      riskLevel: finalAnalysis.remediation.risk
    });

    // For resolved/non-existent issues, return success immediately without execution decision
    if (finalAnalysis.status === 'success') {
      logger.info('Issue resolved/non-existent - returning success without execution decision', {
        requestId,
        sessionId,
        status: finalAnalysis.status
      });
      
      // Return MCP-compliant response for resolved issues
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(finalAnalysis, null, 2)
          }
        ]
      };
    }

    // Make execution decision based on mode and thresholds
    const executionDecision = makeExecutionDecision(
      validatedInput.mode || 'manual',
      finalAnalysis.analysis.confidence,
      finalAnalysis.remediation.risk,
      validatedInput.confidenceThreshold,
      validatedInput.maxRiskLevel
    );

    logger.info('Execution decision made', {
      requestId,
      sessionId,
      mode: validatedInput.mode,
      shouldExecute: executionDecision.shouldExecute,
      reason: executionDecision.reason,
      finalStatus: executionDecision.finalStatus
    });

    // Update the final analysis with execution decision results
    const finalResult: RemediateOutput = {
      ...finalAnalysis,
      status: executionDecision.finalStatus,
      executed: executionDecision.shouldExecute,
      fallbackReason: executionDecision.fallbackReason
    };

    // Add execution choices for manual mode (awaiting_user_approval status)
    if (executionDecision.finalStatus === 'awaiting_user_approval') {
      finalResult.executionChoices = [
        {
          id: 1,
          label: "Execute automatically via MCP",
          description: "Run the kubectl commands shown above automatically via MCP\n",
          risk: finalAnalysis.remediation.risk
        },
        {
          id: 2,
          label: "Execute via agent", 
          description: "STEP 1: Execute the kubectl commands using your Bash tool\nSTEP 2: Call the remediate tool again for validation with the provided validation message\n",
          risk: finalAnalysis.remediation.risk  // Same risk - same commands being executed
        }
      ];
    }

    // Execute remediation actions if automatic mode approves it
    if (executionDecision.shouldExecute) {
      // Update session object with final analysis for execution
      session.finalAnalysis = finalAnalysis;
      
      // Execute commands and return the complete result (includes post-execution validation)
      return await executeRemediationCommands(
        session,
        sessionDir,
        logger,
        requestId
      );
    }

    // Return MCP-compliant response
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(finalResult, null, 2)
        }
      ]
    };

  } catch (error) {

    if (error instanceof Error && 'category' in error) {
      // Re-throw ErrorHandler errors
      throw error;
    }

    // Wrap unexpected errors
    throw ErrorHandler.createError(
      ErrorCategory.UNKNOWN,
      ErrorSeverity.HIGH,
      `Remediate tool failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        operation: 'remediate_tool_execution',
        component: 'RemediateTool',
        requestId,
        input: { issue: args.issue, mode: args.mode }
      }
    );
  }
}

/**
 * Execution decision interface
 */
interface ExecutionDecision {
  shouldExecute: boolean;
  reason: string;
  finalStatus: 'success' | 'failed' | 'awaiting_user_approval';
  fallbackReason?: string;
}

/**
 * Make execution decision based on mode and thresholds
 */
function makeExecutionDecision(
  mode: 'manual' | 'automatic',
  confidence: number,
  risk: 'low' | 'medium' | 'high',
  confidenceThreshold: number = 0.8,
  maxRiskLevel: 'low' | 'medium' | 'high' = 'low'
): ExecutionDecision {
  // Manual mode always requires approval
  if (mode === 'manual') {
    return {
      shouldExecute: false,
      reason: 'Manual mode selected - requiring user approval',
      finalStatus: 'awaiting_user_approval'
    };
  }

  // Automatic mode: check thresholds
  const riskLevels = { low: 1, medium: 2, high: 3 };
  const actualRiskLevel = riskLevels[risk];
  const maxRiskLevelNum = riskLevels[maxRiskLevel];
  
  // Check confidence threshold
  if (confidence < confidenceThreshold) {
    return {
      shouldExecute: false,
      reason: `Confidence ${confidence.toFixed(2)} below threshold ${confidenceThreshold.toFixed(2)}`,
      finalStatus: 'success',
      fallbackReason: `Analysis confidence (${Math.round(confidence * 100)}%) is below the required threshold (${Math.round(confidenceThreshold * 100)}%). Manual review recommended.`
    };
  }

  // Check risk level
  if (actualRiskLevel > maxRiskLevelNum) {
    return {
      shouldExecute: false,
      reason: `Risk level ${risk} exceeds maximum ${maxRiskLevel}`,
      finalStatus: 'success',
      fallbackReason: `Remediation risk level (${risk}) exceeds the maximum allowed level (${maxRiskLevel}). Manual approval required.`
    };
  }

  // All conditions met for automatic execution
  return {
    shouldExecute: true,
    reason: `Automatic execution approved - confidence ${confidence.toFixed(2)} >= ${confidenceThreshold.toFixed(2)}, risk ${risk} <= ${maxRiskLevel}`,
    finalStatus: 'success'
  };
}

/**
 * Validate remediate input according to schema
 */
function validateRemediateInput(args: any): RemediateInput {
  try {
    // Basic validation using our schema
    const validated = {
      issue: args.issue ? REMEDIATE_TOOL_INPUT_SCHEMA.issue.parse(args.issue) : undefined,
      context: args.context ? REMEDIATE_TOOL_INPUT_SCHEMA.context.parse(args.context) : undefined,
      mode: args.mode ? REMEDIATE_TOOL_INPUT_SCHEMA.mode.parse(args.mode) : 'manual',
      confidenceThreshold: args.confidenceThreshold !== undefined ? 
        REMEDIATE_TOOL_INPUT_SCHEMA.confidenceThreshold.parse(args.confidenceThreshold) : 0.8,
      maxRiskLevel: args.maxRiskLevel ? 
        REMEDIATE_TOOL_INPUT_SCHEMA.maxRiskLevel.parse(args.maxRiskLevel) : 'low',
      executeChoice: args.executeChoice !== undefined ?
        REMEDIATE_TOOL_INPUT_SCHEMA.executeChoice.parse(args.executeChoice) : undefined,
      sessionId: args.sessionId ? REMEDIATE_TOOL_INPUT_SCHEMA.sessionId.parse(args.sessionId) : undefined
    } as RemediateInput;

    return validated;
  } catch (error) {
    throw ErrorHandler.createError(
      ErrorCategory.VALIDATION,
      ErrorSeverity.MEDIUM,
      `Invalid input: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
      {
        operation: 'input_validation',
        component: 'RemediateTool',
        input: args,
        suggestedActions: [
          'Check that issue is a non-empty string',
          'Verify mode is either "manual" or "automatic"',
          'Ensure context follows expected structure if provided'
        ]
      }
    );
  }
}