/**
 * Remediate Tool - AI-powered Kubernetes issue analysis and remediation
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity, ConsoleLogger, Logger } from '../core/error-handling';
import { ClaudeIntegration } from '../core/claude';
import { getAndValidateSessionDirectory } from '../core/session-utils';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Tool metadata for direct MCP registration
export const REMEDIATE_TOOL_NAME = 'remediate';
export const REMEDIATE_TOOL_DESCRIPTION = 'Receive Kubernetes issues and events, analyze them using AI, and provide remediation recommendations or execute fixes. This tool can be called from controllers, human agents, or CI/CD pipelines.';

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
  policy: z.string().optional().describe('Reference to calling policy or controller')
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
  policy?: string;
}

export interface DataRequest {
  type: 'get' | 'describe' | 'logs' | 'events' | 'top';
  resource: string;
  namespace?: string;
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
  policy?: string;
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

export interface RemediateOutput {
  status: 'success' | 'failed';
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
  executed?: boolean;
  results?: ExecutionResult[];
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
      const { dataRequests, isComplete, parsedResponse } = parseAIResponse(aiAnalysis);
      
      // TODO: Implement safe data gathering
      // This is scaffolding - actual K8s API integration will be implemented
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
      .replace('{previousIterations}', previousIterationsJson);
    
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
}

/**
 * Parse AI response for data requests and investigation status
 */
export function parseAIResponse(aiResponse: string): { dataRequests: DataRequest[], isComplete: boolean, parsedResponse?: AIInvestigationResponse } {
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
      if (!['get', 'describe', 'logs', 'events', 'top'].includes(request.type)) {
        throw new Error(`Invalid data request type: ${request.type}`);
      }
      if (!request.resource || !request.rationale) {
        throw new Error('Data request missing required fields: resource, rationale');
      }
    }
    
    return {
      dataRequests: parsed.dataRequests,
      isComplete: parsed.investigationComplete,
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
 * Gather safe data from Kubernetes (scaffolding)
 * TODO: Implement actual safe K8s API integration
 */
async function gatherSafeData(
  dataRequests: DataRequest[],
  logger: Logger,
  requestId: string
): Promise<{ [key: string]: any }> {
  // Scaffolding implementation
  logger.debug('Gathering safe data', { requestId, requestCount: dataRequests.length });
  
  const gatheredData: { [key: string]: any } = {};
  
  for (const request of dataRequests) {
    // TODO: Implement actual K8s API calls with safety validation
    gatheredData[`${request.type}_${request.resource}`] = {
      mock: true,
      request: request,
      data: 'Mock data - to be replaced with actual K8s API calls'
    };
  }
  
  return gatheredData;
}


/**
 * Generate final analysis and remediation recommendations (scaffolding)
 * TODO: Implement actual final analysis generation with AI
 */
async function generateFinalAnalysis(
  session: RemediateSession,
  logger: Logger,
  requestId: string
): Promise<RemediateOutput> {
  logger.debug('Generating final analysis', { requestId, sessionId: session.sessionId });

  // Scaffolding implementation
  return {
    status: 'success',
    sessionId: session.sessionId,
    investigation: {
      iterations: session.iterations.length,
      dataGathered: session.iterations.flatMap(iter => Object.keys(iter.gatheredData)),
      analysisPath: session.iterations.map(iter => `Step ${iter.step}: ${iter.aiAnalysis.substring(0, 100)}...`)
    },
    analysis: {
      rootCause: `Analysis of issue: ${session.issue}`,
      confidence: 0.8,
      factors: ['Factor 1', 'Factor 2', 'Factor 3']
    },
    remediation: {
      summary: 'Recommended remediation steps based on investigation',
      actions: [
        {
          description: 'Restart affected pods',
          risk: 'low',
          rationale: 'Common fix for temporary issues'
        }
      ],
      risk: 'low'
    },
    executed: false
  };
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
      policy: validatedInput.policy,
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

    // Return MCP-compliant response
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(finalAnalysis, null, 2)
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
 * Validate remediate input according to schema
 */
function validateRemediateInput(args: any): RemediateInput {
  try {
    // Basic validation using our schema
    const validated = {
      issue: REMEDIATE_TOOL_INPUT_SCHEMA.issue.parse(args.issue),
      context: args.context ? REMEDIATE_TOOL_INPUT_SCHEMA.context.parse(args.context) : undefined,
      mode: args.mode ? REMEDIATE_TOOL_INPUT_SCHEMA.mode.parse(args.mode) : 'manual',
      policy: args.policy ? REMEDIATE_TOOL_INPUT_SCHEMA.policy.parse(args.policy) : undefined
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