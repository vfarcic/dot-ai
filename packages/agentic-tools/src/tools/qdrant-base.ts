/**
 * Base utilities for Qdrant tools
 *
 * Provides common types, validation, and result handling for all Qdrant tool implementations.
 * Mirrors the pattern from base.ts for kubectl tools.
 */

import { ToolDefinition } from '../types';

/**
 * Result returned by Qdrant tool handlers
 */
export interface QdrantToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message: string;
}

/**
 * Self-contained Qdrant tool definition
 * Combines the tool definition (for describe hook) with its handler (for invoke hook)
 */
export interface QdrantTool {
  /** Tool definition for the describe hook */
  definition: ToolDefinition;
  /** Handler function for the invoke hook */
  handler: (args: Record<string, unknown>) => Promise<QdrantToolResult>;
}

/**
 * Validation error thrown when required parameters are missing
 */
export class QdrantValidationError extends Error {
  constructor(
    public readonly param: string,
    public readonly toolName: string
  ) {
    super(`${toolName} requires parameter: ${param}`);
    this.name = 'QdrantValidationError';
  }
}

/**
 * Require a parameter, throwing QdrantValidationError if missing
 */
export function requireQdrantParam<T>(args: Record<string, unknown>, param: string, toolName: string): T {
  const value = args[param];
  if (value === undefined || value === null || value === '') {
    throw new QdrantValidationError(param, toolName);
  }
  return value as T;
}

/**
 * Require a numeric array parameter (for embeddings)
 */
export function requireEmbeddingParam(args: Record<string, unknown>, param: string, toolName: string): number[] {
  const value = args[param];
  if (!Array.isArray(value) || value.length === 0) {
    throw new QdrantValidationError(param, toolName);
  }
  // Validate all elements are numbers
  if (!value.every((v) => typeof v === 'number')) {
    throw new QdrantValidationError(param, toolName);
  }
  return value as number[];
}

/**
 * Get an optional parameter with a default value
 */
export function optionalQdrantParam<T>(args: Record<string, unknown>, param: string, defaultValue: T): T {
  const value = args[param];
  if (value === undefined || value === null) {
    return defaultValue;
  }
  return value as T;
}

/**
 * Create a successful tool result
 */
export function qdrantSuccessResult(data: unknown, message: string): QdrantToolResult {
  return { success: true, data, message };
}

/**
 * Create an error tool result
 */
export function qdrantErrorResult(error: string, message: string): QdrantToolResult {
  return { success: false, error, message };
}

/**
 * Wrap a tool handler to catch QdrantValidationError and return proper error results
 */
export function withQdrantValidation(
  handler: (args: Record<string, unknown>) => Promise<QdrantToolResult>
): (args: Record<string, unknown>) => Promise<QdrantToolResult> {
  return async (args: Record<string, unknown>): Promise<QdrantToolResult> => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof QdrantValidationError) {
        return qdrantErrorResult(
          `Missing required parameter: ${error.param}`,
          `${error.toolName} requires parameter: ${error.param}`
        );
      }
      // Re-throw other errors to be handled by the invoke hook
      throw error;
    }
  };
}
