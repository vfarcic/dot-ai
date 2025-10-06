/**
 * Shared debugging utilities for AI providers
 *
 * Common functions for logging metrics and debugging AI interactions
 * when DEBUG_DOT_AI=true
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AIResponse } from '../ai-provider.interface';

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
 */
export function logMetrics(
  operation: string,
  provider: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
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
      provider,
      operation,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      durationMs
    };

    // Add cache metrics if present
    if (usage.cache_creation_input_tokens) {
      entry.cacheCreationTokens = usage.cache_creation_input_tokens;
    }
    if (usage.cache_read_input_tokens) {
      entry.cacheReadTokens = usage.cache_read_input_tokens;
    }

    fs.appendFileSync(metricsFile, JSON.stringify(entry) + '\n');
  } catch (error) {
    console.warn('Failed to log metrics:', error);
  }
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
