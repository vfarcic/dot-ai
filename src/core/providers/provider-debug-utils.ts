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
  
  // Required performance data for evaluation
  iterationCount: number;
  toolCallCount: number;
  status: string;
  completionReason: string;
  modelVersion: string;
  
  // Optional performance data (not all providers support)
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cacheHitRate?: number;
  uniqueToolsUsed?: string[];
  
  // Required evaluation context for AI quality assessment
  test_scenario: string;
  ai_response_summary: string;
  debug_files?: {
    full_prompt: string;
    full_response: string;
  };
  
  // PRD #154: Required evaluation fields for dataset generation
  user_intent: string;        // Required: Original user request (e.g., "my app in namespace is crashing")
  interaction_id: string;     // Required: Unique identifier for this interaction (e.g., "interaction1")
  
  // Optional test context (not always available)
  failure_analysis?: string | {  // String for legacy, object for new format
    failure_type: "timeout" | "error" | "infrastructure";
    failure_reason: string;
    time_to_failure: number;
  };
}

/**
 * Determine if dataset generation should be skipped for specific operations
 */
export function shouldSkipDatasetGeneration(operation: string): boolean {
  const skipDatasetOperations = ['version-connectivity-check', 'generic'];
  return skipDatasetOperations.includes(operation);
}

/**
 * Log unified evaluation metrics when DEBUG_DOT_AI=true
 * Single function for all metrics and evaluation data capture
 */
/**
 * Generate eval dataset entry in standard OpenAI Evals format
 * Logs evaluation metrics to JSONL dataset files for AI quality assessment
 */
export function logEvaluationDataset(
  metrics: EvaluationMetrics,
  debugMode: boolean = false
): void {
  if (!debugMode) return;
  
  // Skip dataset generation for non-evaluable operations
  if (shouldSkipDatasetGeneration(metrics.test_scenario)) return;

  try {
    const evalDir = path.join(process.cwd(), 'eval', 'datasets');
    
    // Ensure eval datasets directory exists
    if (!fs.existsSync(evalDir)) {
      fs.mkdirSync(evalDir, { recursive: true });
    }

    // Parse operation for tool name
    const operationParts = metrics.operation.split('-');
    const toolName = operationParts[0]; // e.g., "remediate"
    
    // Check if this is a comparative evaluation
    const isComparativeEvaluation = metrics.operation.includes('-comparative-');
    
    let datasetFile: string;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').split('T').join('_');
    
    if (isComparativeEvaluation) {
      // For comparative evaluations, don't include single model name since it compares multiple models
      datasetFile = path.join(evalDir, `${toolName}_comparative_evaluation_${timestamp}.jsonl`);
    } else {
      // Use modelVersion directly for accurate model identification
      const modelName = metrics.modelVersion || 'unknown';
      
      // Create filename with interaction ID, SDK, model, and timestamp for single-model datasets
      datasetFile = path.join(evalDir, `${toolName}_${metrics.interaction_id}_${metrics.sdk}_${modelName}_${timestamp}.jsonl`);
    }

    // Transform metrics into OpenAI Evals format (no ideal field - using model-graded evaluation)
    const evalEntry = {
      input: {
        issue: metrics.user_intent || "Tool execution scenario"
      },
      output: metrics.ai_response_summary || "",
      performance: {
        duration_ms: metrics.durationMs,
        input_tokens: metrics.inputTokens,
        output_tokens: metrics.outputTokens, 
        total_tokens: metrics.inputTokens + metrics.outputTokens,
        sdk: metrics.sdk,
        model_version: metrics.modelVersion,
        iterations: metrics.iterationCount,
        tool_calls_executed: metrics.toolCallCount,
        cache_read_tokens: metrics.cacheReadTokens || 0,
        cache_creation_tokens: metrics.cacheCreationTokens || 0
      },
      metadata: {
        timestamp: new Date().toISOString(),
        complexity: "medium",
        tags: ["troubleshooting"],
        source: "integration_test",
        tool: toolName,
        test_scenario: metrics.test_scenario || `${toolName}_test`,
        failure_analysis: metrics.failure_analysis || ""
      }
    };

    fs.writeFileSync(datasetFile, JSON.stringify(evalEntry) + '\n');
    
    console.log(`📊 Generated eval dataset: ${path.basename(datasetFile)} (${metrics.interaction_id}, ${metrics.durationMs}ms, ${metrics.inputTokens}+${metrics.outputTokens} tokens)`);
  } catch (error) {
    console.error(`❌ Failed to generate eval dataset for ${metrics.interaction_id} (${metrics.test_scenario}):`, error);
  }
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
  
  // PRD #154: Evaluation context for dataset generation
  evaluationContext?: {
    user_intent?: string;
    failure_analysis?: string;
  };
  
  // PRD #154: Interaction ID for dataset generation pairing
  interaction_id?: string;
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
    // PRD #154: Use unified evaluation metrics system
    const evaluationMetrics: EvaluationMetrics = {
      // Core execution data
      operation: config.operation,
      sdk: config.sdk,
      inputTokens: config.totalTokens.input,
      outputTokens: config.totalTokens.output,
      durationMs,
      
      // Required fields
      iterationCount: config.iterations,
      toolCallCount: config.toolCallsExecuted.length,
      status: config.status,
      completionReason: config.completionReason,
      modelVersion: config.modelVersion,
      
      // Required evaluation context - NO DEFAULTS, must be provided
      test_scenario: config.operation,
      ai_response_summary: config.finalMessage,
      user_intent: config.evaluationContext?.user_intent || '', // Will be enhanced later by EvalDatasetEnhancer
      interaction_id: config.interaction_id || '', // Will be enhanced later if missing
      
      // Optional performance data
      ...(config.totalTokens.cacheCreation !== undefined && { cacheCreationTokens: config.totalTokens.cacheCreation }),
      ...(config.totalTokens.cacheRead !== undefined && { cacheReadTokens: config.totalTokens.cacheRead }),
      ...(config.toolCallsExecuted.length > 0 && { 
        uniqueToolsUsed: [...new Set(config.toolCallsExecuted.map(tc => tc.tool))]
      }),
      ...(config.debugFiles && { debug_files: { full_prompt: config.debugFiles.promptFile, full_response: config.debugFiles.responseFile } }),
      ...(config.evaluationContext?.failure_analysis && { failure_analysis: config.evaluationContext.failure_analysis })
    };

    // Calculate cache hit rate if applicable
    if (config.totalTokens.cacheRead !== undefined && config.totalTokens.input > 0) {
      evaluationMetrics.cacheHitRate = Math.round((config.totalTokens.cacheRead / config.totalTokens.input) * 100);
    }

    logEvaluationDataset(evaluationMetrics, config.debugMode);
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
