/**
 * AI Provider Tracing Utilities
 *
 * Generic wrapper for instrumenting AI provider calls with OpenTelemetry.
 * Uses official GenAI semantic conventions for AI/LLM operations.
 *
 * Supports:
 * - chat operations (sendMessage)
 * - tool_loop operations (toolLoop with agentic tool calling)
 * - embeddings operations (generateEmbedding, generateEmbeddings)
 *
 * Reference: https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';

/**
 * Configuration for AI operation tracing
 */
export interface AITracingOptions {
  /** AI provider name (e.g., 'anthropic', 'openai', 'google') */
  provider: string;

  /** Model identifier (e.g., 'claude-3-5-sonnet', 'gpt-4o', 'text-embedding-3-small') */
  model: string;

  /** Operation type: 'chat', 'tool_loop', 'embeddings' */
  operation: 'chat' | 'tool_loop' | 'embeddings';

  /** Optional max tokens parameter (only for chat/tool_loop operations) */
  maxTokens?: number;
}

/**
 * Metrics extracted from AI operation result
 * Fields vary by operation type:
 * - chat/tool_loop: inputTokens, outputTokens, cache tokens
 * - embeddings: embeddingCount, embeddingDimensions
 */
export interface AITracingResult {
  /** Input tokens consumed (chat/tool_loop only) */
  inputTokens?: number;

  /** Output tokens generated (chat/tool_loop only) */
  outputTokens?: number;

  /** Cache read tokens (if provider supports caching) */
  cacheReadTokens?: number;

  /** Cache creation tokens (if provider supports caching) */
  cacheCreationTokens?: number;

  /** Number of embeddings generated (embeddings only) */
  embeddingCount?: number;

  /** Dimension size of embeddings (embeddings only) */
  embeddingDimensions?: number;
}

/**
 * Generic wrapper for AI provider calls
 *
 * Creates CLIENT spans with official gen_ai.* semantic conventions.
 * The auto-instrumented HTTP span becomes a child of this span.
 *
 * @param options AI operation configuration
 * @param handler Function that performs the actual AI call
 * @param extractMetrics Function to extract metrics from the result
 * @returns Result from the handler function
 *
 * @example Chat operation
 * const response = await withAITracing(
 *   { provider: 'anthropic', model: 'claude-3-5-sonnet', operation: 'chat' },
 *   async () => await client.messages.create(...),
 *   (result) => ({ inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens })
 * );
 *
 * @example Tool loop operation
 * const result = await withAITracing(
 *   { provider: 'anthropic', model: 'claude-3-5-sonnet', operation: 'tool_loop' },
 *   async () => await provider.toolLoop(...),
 *   (result) => ({ inputTokens: result.totalTokens.input, outputTokens: result.totalTokens.output })
 * );
 *
 * @example Embeddings operation
 * const embedding = await withAITracing(
 *   { provider: 'openai', model: 'text-embedding-3-small', operation: 'embeddings' },
 *   async () => await client.embeddings.create(...),
 *   (result) => ({ embeddingCount: 1, embeddingDimensions: 1536 })
 * );
 */
export async function withAITracing<T>(
  options: AITracingOptions,
  handler: () => Promise<T>,
  extractMetrics: (result: T) => AITracingResult
): Promise<T> {
  // Get tracer (returns no-op if tracing disabled)
  const tracer = trace.getTracer('dot-ai-mcp');

  // Span name format: "{operation} {model}"
  // Examples: "chat claude-3-5-sonnet", "tool_loop claude-3-5-sonnet", "embeddings text-embedding-3-small"
  const spanName = `${options.operation} ${options.model}`;

  return await tracer.startActiveSpan(
    spanName,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        // Required GenAI attributes (per OpenTelemetry spec)
        'gen_ai.operation.name': options.operation,
        'gen_ai.provider.name': options.provider,
        'gen_ai.request.model': options.model,

        // Optional request parameters (only for chat/tool_loop)
        ...(options.maxTokens !== undefined && {
          'gen_ai.request.max_tokens': options.maxTokens,
        }),
      },
    },
    async (span) => {
      const startTime = Date.now();

      try {
        // Execute the actual AI call within this span's context
        // Auto-instrumented HTTP spans will be children of this span
        const result = await context.with(
          trace.setSpan(context.active(), span),
          handler
        );

        // Extract metrics from the result
        const metrics = extractMetrics(result);

        // Add response model (usually same as request)
        span.setAttribute('gen_ai.response.model', options.model);
        span.setAttribute('gen_ai.ai.duration_ms', Date.now() - startTime);

        // Add operation-specific metrics
        if (options.operation === 'chat' || options.operation === 'tool_loop') {
          // Token-based metrics for chat/tool_loop operations
          if (metrics.inputTokens !== undefined) {
            span.setAttribute('gen_ai.usage.input_tokens', metrics.inputTokens);
          }
          if (metrics.outputTokens !== undefined) {
            span.setAttribute('gen_ai.usage.output_tokens', metrics.outputTokens);
          }

          // Cache metrics (Anthropic-specific for chat operations)
          if (metrics.cacheReadTokens !== undefined && metrics.cacheReadTokens > 0) {
            span.setAttribute('gen_ai.usage.cache_read_tokens', metrics.cacheReadTokens);
          }
          if (metrics.cacheCreationTokens !== undefined && metrics.cacheCreationTokens > 0) {
            span.setAttribute('gen_ai.usage.cache_creation_tokens', metrics.cacheCreationTokens);
          }
        } else if (options.operation === 'embeddings') {
          // Embedding-specific metrics
          if (metrics.embeddingCount !== undefined) {
            span.setAttribute('gen_ai.embeddings.count', metrics.embeddingCount);
          }
          if (metrics.embeddingDimensions !== undefined) {
            span.setAttribute('gen_ai.embeddings.dimensions', metrics.embeddingDimensions);
          }
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        // Record exception with full details
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.setAttribute(
          'error.type',
          error instanceof Error ? error.constructor.name : 'unknown'
        );
        throw error;
      } finally {
        span.end();
      }
    }
  );
}
