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
 * Log metrics for token usage and execution time when DEBUG_DOT_AI=true
 *
 * PRD #143 Decision 5: Extended metrics for model comparison analysis
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
  },
  durationMs: number,
  debugMode: boolean
): void {
  if (!debugMode) return;

  try {
    const debugDir = ensureDebugDirectory();
    const metricsFile = path.join(debugDir, 'metrics.jsonl');

    const entry: any = {
      timestamp: new Date().toISOString(),
      sdk,
      operation,
      inputTokens: result.totalTokens.input,
      outputTokens: result.totalTokens.output,
      durationMs
    };

    // Add cache metrics if present
    if (result.totalTokens.cacheCreation) {
      entry.cacheCreationTokens = result.totalTokens.cacheCreation;
    }
    if (result.totalTokens.cacheRead) {
      entry.cacheReadTokens = result.totalTokens.cacheRead;
    }

    // Calculate cache hit rate (percentage)
    if (result.totalTokens.cacheRead && result.totalTokens.input > 0) {
      entry.cacheHitRate = Math.round((result.totalTokens.cacheRead / result.totalTokens.input) * 100);
    }

    // Add extended metrics (PRD #143 Decision 5)
    if (result.iterations !== undefined) {
      entry.iterationCount = result.iterations;
    }
    if (result.toolCallsExecuted) {
      entry.toolCallCount = result.toolCallsExecuted.length;
      // Extract unique tool names
      const uniqueTools = [...new Set(result.toolCallsExecuted.map(tc => tc.tool))];
      entry.uniqueToolsUsed = uniqueTools;
    }
    if (result.status) {
      entry.status = result.status;
    }
    if (result.completionReason) {
      entry.completionReason = result.completionReason;
    }
    if (result.modelVersion) {
      entry.modelVersion = result.modelVersion;
    }

    // Manual annotation placeholders (populate after test analysis)
    entry.manualNotes = '';
    entry.failureReason = '';
    entry.qualityIssues = [];
    entry.comparisonNotes = '';

    fs.appendFileSync(metricsFile, JSON.stringify(entry) + '\n');
  } catch (error) {
    console.warn('Failed to log metrics:', error);
  }
}

/**
 * Create AgenticResult and log metrics in one step
 * Reduces code duplication across providers
 *
 * PRD #143 Decision 5: Standardized metrics logging
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
    logMetrics(config.operation, config.sdk, result, durationMs, config.debugMode);
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
