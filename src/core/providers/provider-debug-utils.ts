/**
 * Shared debugging utilities for AI providers
 *
 * Common functions for logging metrics and debugging AI interactions
 * when DEBUG_DOT_AI=true
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AIResponse, AgenticResult } from '../ai-provider.interface';

/**
 * Create debug directory if it doesn't exist
 */
export function ensureDebugDirectory(): string {
  const debugDir = path.join(process.cwd(), 'tmp', 'debug-ai');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  return debugDir;
}

/**
 * Generate unique identifier for debug files with operation context
 */
export function generateDebugId(operation: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').split('T');
  const dateTime = timestamp[0] + 'T' + timestamp[1].substring(0, 6);
  const randomHex = crypto.randomBytes(4).toString('hex');
  return `${dateTime}_${randomHex}_${operation}`;
}

/**
 * Unified evaluation metrics entry for AI quality assessment and performance tracking
 * PRD #154: Single interface for all metrics and evaluation data
 */
export interface EvaluationMetrics {
  // Core execution data
  operation: string;
  sdk: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  
  // Optional performance data
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cacheHitRate?: number;
  iterationCount?: number;
  toolCallCount?: number;
  uniqueToolsUsed?: string[];
  status?: string;
  completionReason?: string;
  modelVersion?: string;
  
  // Evaluation context for AI quality assessment
  test_scenario?: string;
  input_issue?: string;
  ai_response_summary?: string;
  debug_files?: {
    full_prompt: string;
    full_response: string;
  };
  cluster_context?: {
    namespace?: string;
    pod_restart_count?: number;
    deployment_name?: string;
    [key: string]: any;
  };
  expected_outcome?: {
    root_cause: string;
    solution_category: string;
    diagnostic_commands: string[];
    remediation_actions: string[];
  };
}

/**
 * Log unified evaluation metrics when DEBUG_DOT_AI=true
 * Single function for all metrics and evaluation data capture
 */
export function logEvaluationMetrics(
  metrics: EvaluationMetrics,
  debugMode: boolean = false
): void {
  if (!debugMode) return;

  try {
    const debugDir = ensureDebugDirectory();
    const metricsFile = path.join(debugDir, 'metrics.jsonl');

    // Create unified entry with timestamp
    const entry = {
      timestamp: new Date().toISOString(),
      ...metrics
    };

    fs.appendFileSync(metricsFile, JSON.stringify(entry) + '\n');
    
    console.log(`📊 Logged evaluation metrics: ${metrics.operation} (${metrics.durationMs}ms, ${metrics.inputTokens}+${metrics.outputTokens} tokens)`);
  } catch (error) {
    console.warn('Failed to log evaluation metrics:', error);
  }
}

/**
 * Backward-compatible logMetrics function 
 * Converts old format to new unified EvaluationMetrics
 */
export function logMetrics(
  operation: string,
  sdk: string,
  result: {
    totalTokens: {
      input: number;
      output: number;
      cacheCreation?: number;
      cacheRead?: number;
    };
    iterations?: number;
    toolCallsExecuted?: Array<{ tool: string; input: any; output: any }>;
    status?: string;
    completionReason?: string;
    modelVersion?: string;
    finalMessage?: string; // AI response for evaluation context
    debugFiles?: { // Debug file references for evaluation
      full_prompt: string;
      full_response: string;
    };
  },
  durationMs: number,
  debugMode: boolean,
  debugFiles?: { promptFile: string; responseFile: string } | null
): void {
  const metrics: EvaluationMetrics = {
    operation,
    sdk,
    inputTokens: result.totalTokens.input,
    outputTokens: result.totalTokens.output,
    durationMs,
    ...(result.totalTokens.cacheCreation !== undefined && { cacheCreationTokens: result.totalTokens.cacheCreation }),
    ...(result.totalTokens.cacheRead !== undefined && { cacheReadTokens: result.totalTokens.cacheRead }),
    ...(result.iterations !== undefined && { iterationCount: result.iterations }),
    ...(result.toolCallsExecuted && { 
      toolCallCount: result.toolCallsExecuted.length,
      uniqueToolsUsed: [...new Set(result.toolCallsExecuted.map(tc => tc.tool))]
    }),
    ...(result.status && { status: result.status }),
    ...(result.completionReason && { completionReason: result.completionReason }),
    ...(result.modelVersion && { modelVersion: result.modelVersion })
  };

  // Calculate cache hit rate if applicable
  if (result.totalTokens.cacheRead !== undefined && result.totalTokens.input > 0) {
    metrics.cacheHitRate = Math.round((result.totalTokens.cacheRead / result.totalTokens.input) * 100);
  }

  // Add evaluation context for summary operations (PRD #154)
  if (result.finalMessage && operation.includes('remediate')) {
    try {
      // Extract AI response summary from the final message
      const aiResponseSummary = result.finalMessage.length > 200 
        ? result.finalMessage.substring(0, 200) + '...'
        : result.finalMessage;
      
      // Extract test scenario from operation name
      const testScenario = operation.replace('-summary', '').replace('-', '_');
      
      // Add evaluation context
      metrics.test_scenario = testScenario;
      metrics.ai_response_summary = aiResponseSummary;
      
      // Set debug file references for summary operations (files created by logDebugIfEnabled)
      if (operation.endsWith('-summary') && debugFiles) {
        metrics.debug_files = {
          full_prompt: debugFiles.promptFile,
          full_response: debugFiles.responseFile
        };
      }
    } catch (error) {
      console.warn('Failed to extract evaluation context:', error);
    }
  }

  logEvaluationMetrics(metrics, debugMode);
}

/**
 * Create AgenticResult and log metrics in one step
 * Reduces code duplication across providers
 *
 * PRD #154: Updated to use unified evaluation metrics
 */
export function createAndLogAgenticResult(config: {
  finalMessage: string;
  iterations: number;
  toolCallsExecuted: Array<{ tool: string; input: any; output: any }>;
  totalTokens: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
  status: 'success' | 'failed' | 'timeout' | 'parse_error';
  completionReason: 'investigation_complete' | 'max_iterations' | 'parse_failure' | 'model_stopped' | 'error';
  modelVersion: string;
  operation: string;
  sdk: string;
  startTime: number;
  debugMode: boolean;
  debugFiles?: { promptFile: string; responseFile: string } | null;
}): AgenticResult {
  const result: AgenticResult = {
    finalMessage: config.finalMessage,
    iterations: config.iterations,
    toolCallsExecuted: config.toolCallsExecuted,
    totalTokens: config.totalTokens,
    status: config.status,
    completionReason: config.completionReason,
    modelVersion: config.modelVersion
  };

  const durationMs = Date.now() - config.startTime;
  if (config.debugMode) {    
    // Enhanced metrics logging with evaluation context
    const enhancedResult = {
      ...result,
      finalMessage: config.finalMessage // Pass the final AI response for evaluation context
    };
    logMetrics(config.operation, config.sdk, enhancedResult, durationMs, config.debugMode, config.debugFiles);
  }

  return result;
}

/**
 * Save AI interaction for debugging when DEBUG_DOT_AI=true
 */
export function debugLogInteraction(
  debugId: string,
  prompt: string,
  response: AIResponse,
  operation: string,
  provider: string,
  model: string,
  debugMode: boolean
): void {
  if (!debugMode) return;

  try {
    const debugDir = ensureDebugDirectory();

    // Save prompt with descriptive naming
    const promptFile = path.join(debugDir, `${debugId}_prompt.md`);
    fs.writeFileSync(
      promptFile,
      `# AI Prompt - ${operation}\n\nTimestamp: ${new Date().toISOString()}\nProvider: ${provider}\nModel: ${model}\nOperation: ${operation}\n\n---\n\n${prompt}`
    );

    // Save response with matching naming
    const responseFile = path.join(debugDir, `${debugId}_response.md`);
    const responseContent = `# AI Response - ${operation}

Timestamp: ${new Date().toISOString()}
Provider: ${provider}
Model: ${model}
Operation: ${operation}
Input Tokens: ${response.usage.input_tokens}
Output Tokens: ${response.usage.output_tokens}

---

${response.content}`;

    fs.writeFileSync(responseFile, responseContent);

    console.log(`🐛 DEBUG: AI interaction logged to tmp/debug-ai/${debugId}_*.md`);
  } catch (error) {
    console.warn('Failed to log AI debug interaction:', error);
  }
}
