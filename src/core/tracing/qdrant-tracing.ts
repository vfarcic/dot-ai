/**
 * Qdrant Vector Database Tracing
 *
 * Provides distributed tracing instrumentation for Qdrant vector database operations.
 * Creates CLIENT spans with database semantic conventions and vector-specific attributes.
 */

import { trace, SpanStatusCode, Span } from '@opentelemetry/api';

const tracer = trace.getTracer('dot-ai-mcp-qdrant');

/**
 * Vector database operation types
 */
export type VectorDBOperation =
  | 'collection.create'
  | 'collection.get'
  | 'collection.list'
  | 'collection.delete'
  | 'collection.initialize'
  | 'vector.upsert'
  | 'vector.search'
  | 'vector.search_keywords'
  | 'vector.retrieve'
  | 'vector.delete'
  | 'vector.delete_all'
  | 'vector.list'
  | 'health_check';

/**
 * Qdrant operation metadata for tracing
 */
export interface QdrantOperationContext {
  /** Operation type */
  operation: VectorDBOperation;
  /** Collection name */
  collectionName: string;
  /** Vector dimensions (for upsert, search operations) */
  vectorSize?: number;
  /** Search limit (for search operations) */
  limit?: number;
  /** Score threshold (for similarity search) */
  scoreThreshold?: number;
  /** Number of keywords (for keyword search) */
  keywordCount?: number;
  /** Document ID (for single document operations) */
  documentId?: string;
  /** Qdrant server URL */
  serverUrl?: string;
}

/**
 * Generic Qdrant operation tracing wrapper
 *
 * @param operationContext - Qdrant operation metadata
 * @param handler - Async operation to trace
 * @returns Result from handler
 *
 * @example
 * ```typescript
 * // Trace vector search
 * const results = await withQdrantTracing(
 *   {
 *     operation: 'vector.search',
 *     collectionName: 'capabilities',
 *     vectorSize: 1536,
 *     limit: 10,
 *     scoreThreshold: 0.5,
 *     serverUrl: 'http://localhost:6333'
 *   },
 *   async () => await this.client.search(...)
 * );
 *
 * // Trace document upsert
 * await withQdrantTracing(
 *   {
 *     operation: 'vector.upsert',
 *     collectionName: 'patterns',
 *     documentId: 'pattern-123',
 *     vectorSize: 384,
 *     serverUrl: 'http://localhost:6333'
 *   },
 *   async () => await this.client.upsert(...)
 * );
 * ```
 */
export async function withQdrantTracing<T>(
  operationContext: QdrantOperationContext,
  handler: () => Promise<T>
): Promise<T> {
  const { operation, collectionName, ...metadata } = operationContext;

  // Create span name: "qdrant.{operation} {collection}"
  // Examples: "qdrant.vector.search capabilities", "qdrant.vector.upsert patterns"
  const spanName = `qdrant.${operation} ${collectionName}`;

  return tracer.startActiveSpan(
    spanName,
    {
      kind: 2, // CLIENT span
      attributes: {
        // Database semantic conventions
        'db.system': 'qdrant',
        'db.operation.name': operation,
        'db.collection.name': collectionName,

        // Vector-specific attributes
        ...(metadata.vectorSize && { 'db.vector.dimensions': metadata.vectorSize }),
        ...(metadata.limit && { 'db.query.limit': metadata.limit }),
        ...(metadata.scoreThreshold && { 'db.vector.score_threshold': metadata.scoreThreshold }),
        ...(metadata.keywordCount && { 'db.query.keyword_count': metadata.keywordCount }),
        ...(metadata.documentId && { 'db.document.id': metadata.documentId }),
        ...(metadata.serverUrl && { 'server.address': metadata.serverUrl })
      }
    },
    async (span: Span) => {
      try {
        // Execute operation
        const result = await handler();

        // Add result metadata for search operations
        if (operation === 'vector.search' || operation === 'vector.search_keywords') {
          if (Array.isArray(result)) {
            span.setAttribute('db.query.result_count', result.length);

            // For search results with scores, track top score
            if (result.length > 0 && 'score' in result[0]) {
              span.setAttribute('db.vector.top_score', (result[0] as any).score);
            }
          }
        }

        // Add result metadata for list operations
        if (operation === 'vector.list' && Array.isArray(result)) {
          span.setAttribute('db.query.result_count', result.length);
        }

        // Mark span as successful
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        // Record error in span
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error)
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        span.end();
      }
    }
  );
}
