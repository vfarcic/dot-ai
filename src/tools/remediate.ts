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
  issue: z.string().min(1).max(2000).describe('Issue description that needs to be analyzed and remediated'),
  context: z.object({
    event: z.any().optional().describe('Kubernetes event object'),
    logs: z.array(z.string()).optional().describe('Relevant log entries'),
    metrics: z.any().optional().describe('Relevant metrics data'),
    podSpec: z.any().optional().describe('Pod specification if relevant'),
    relatedEvents: z.array(z.any()).optional().describe('Related Kubernetes events')
  }).optional().describe('Optional initial context to help with analysis'),
  mode: z.enum(['manual', 'automatic']).optional().default('manual').describe('Execution mode: manual returns recommendations only, automatic executes approved remediations'),
  confidenceThreshold: z.number().min(0).max(1).optional().default(0.8).describe('Automatic execution only if confidence above this threshold (default: 0.8)'),
  maxRiskLevel: z.enum(['low', 'medium', 'high']).optional().default('low').describe('Automatic execution only if risk at or below this level (default: low)')
};

// Core interfaces matching PRD specification
export interface RemediateInput {
  issue: string;
  context?: {
    event?: any; // K8sEvent
    logs?: string[];
    metrics?: any; // Metrics
    podSpec?: any;
    relatedEvents?: any[]; // K8sEvent[]
  };
  mode?: 'manual' | 'automatic';
  confidenceThreshold?: number;  // Default: 0.8 - automatic execution only if confidence above
  maxRiskLevel?: 'low' | 'medium' | 'high';  // Default: 'low' - automatic execution only if risk at or below
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
  status: 'investigating' | 'analysis_complete' | 'failed';
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
    analysisPath: string[];
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
  // Client-friendly instructions (maintain backward compatibility)
  instructions: {
    summary: string;
    nextSteps: string[];
    riskConsiderations: string[];
  };
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
    if (!parsed.rootCause || !parsed.confidence || !Array.isArray(parsed.factors) || !parsed.remediation) {
      throw new Error('Invalid AI final analysis response structure');
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
    const analysisPath = session.iterations.map(iter => 
      `Iteration ${iter.step}: ${iter.aiAnalysis.substring(0, 100)}${iter.aiAnalysis.length > 100 ? '...' : ''}`
    );
    
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
      .replace('{analysisPath}', analysisPath.join('\n'))
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

    // Generate client-friendly instructions
    const highRiskActions = finalAnalysis.remediation.actions.filter(a => a.risk === 'high');
    const mediumRiskActions = finalAnalysis.remediation.actions.filter(a => a.risk === 'medium');
    
    const instructions = {
      summary: `AI analysis identified the root cause with ${Math.round(finalAnalysis.confidence * 100)}% confidence. ${finalAnalysis.remediation.actions.length} remediation actions are recommended.`,
      nextSteps: [
        "1. Review the root cause analysis and confidence level below",
        "2. Display each remediation action with its kubectl command, risk level, and rationale",
        "3. Execute remediation actions in the order provided",
        "4. Stop if any action fails and investigate the error",
        ...(finalAnalysis.validationIntent 
          ? [`5. After execution, run the remediation tool again with: '${finalAnalysis.validationIntent}'`,
             "6. Verify the tool reports no issues or identifies any new problems"]
          : [finalAnalysis.remediation.actions.length > 1 ? "5. Verify the final solution by checking the original issue is resolved" : "5. Verify the solution resolved the original issue"]
        )
      ],
      riskConsiderations: [
        ...(highRiskActions.length > 0 ? [`${highRiskActions.length} HIGH RISK actions require careful review and may need user confirmation`] : []),
        ...(mediumRiskActions.length > 0 ? [`${mediumRiskActions.length} MEDIUM RISK actions should be executed with monitoring`] : []),
        "All actions are designed to be safe kubectl operations (no destructive commands)",
        "Each action includes a detailed rationale for why it's recommended"
      ]
    };

    // Convert data sources to human-readable format
    const humanReadableDataSources = dataSources.length > 0 
      ? [`Analyzed ${dataSources.length} data sources from ${session.iterations.length} investigation iterations`]
      : ['cluster-resources', 'pod-status', 'node-capacity'];

    // Return structured response
    return {
      status: 'success',
      instructions,
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
      sessionId: session.sessionId,
      investigation: {
        iterations: session.iterations.length,
        dataGathered: humanReadableDataSources,
        analysisPath: session.iterations.map((iter, index) => 
          `Iteration ${index + 1}: ${iter.aiAnalysis.split('\n')[0] || 'Analysis performed'}`
        )
      },
      executed: false
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
 * Main tool handler for remediate tool
 */
export async function handleRemediateTool(args: any): Promise<any> {
  const requestId = `remediate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logger = new ConsoleLogger('RemediateTool');

  logger.info('Remediate tool invoked', { requestId, issue: args.issue, mode: args.mode || 'manual' });

  try {
    // Validate and get session directory
    const sessionDir = getAndValidateSessionDirectory(args, true);
    logger.debug('Session directory validated', { requestId, sessionDir });

    // Validate input
    const validatedInput = validateRemediateInput(args);
    
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
          description: "Run the kubectl commands shown above automatically via MCP",
          risk: finalAnalysis.remediation.risk
        },
        {
          id: 2,
          label: "Copy commands to run manually", 
          description: "I'll copy and run the kubectl commands shown above myself",
          risk: finalAnalysis.remediation.risk  // Same risk - same commands being executed
        },
        {
          id: 3,
          label: "Cancel this operation",
          description: "Don't execute any remediation actions",
          // No risk - safe option
        }
      ];
    }

    // TODO Milestone 2b: If shouldExecute is true, execute the remediation actions here
    // For now, we only make execution decisions without actual execution

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
    logger.error('Remediate tool failed', error as Error, { 
      requestId
    });

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
      finalStatus: 'failed',
      fallbackReason: `Analysis confidence (${Math.round(confidence * 100)}%) is below the required threshold (${Math.round(confidenceThreshold * 100)}%). Manual review recommended.`
    };
  }

  // Check risk level
  if (actualRiskLevel > maxRiskLevelNum) {
    return {
      shouldExecute: false,
      reason: `Risk level ${risk} exceeds maximum ${maxRiskLevel}`,
      finalStatus: 'failed',
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
      issue: REMEDIATE_TOOL_INPUT_SCHEMA.issue.parse(args.issue),
      context: args.context ? REMEDIATE_TOOL_INPUT_SCHEMA.context.parse(args.context) : undefined,
      mode: args.mode ? REMEDIATE_TOOL_INPUT_SCHEMA.mode.parse(args.mode) : 'manual',
      confidenceThreshold: args.confidenceThreshold !== undefined ? 
        REMEDIATE_TOOL_INPUT_SCHEMA.confidenceThreshold.parse(args.confidenceThreshold) : 0.8,
      maxRiskLevel: args.maxRiskLevel ? 
        REMEDIATE_TOOL_INPUT_SCHEMA.maxRiskLevel.parse(args.maxRiskLevel) : 'low'
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