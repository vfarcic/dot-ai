/**
 * Knowledge Base Search Service (core layer)
 *
 * Provides the reusable `searchKnowledgeBase()` helper used by both the
 * `manageKnowledge` MCP tool and core consumers (schema recommendation,
 * operate analysis, REST API). Lives in `core/` so that core modules do not
 * need to import from the `tools/` layer (avoids a core → tools → core cycle).
 *
 * PRD #356: Knowledge Base System
 * PRD #375: Unified Knowledge Base
 */

import { invokePluginTool, isPluginInitialized } from './plugin-registry';
import { EmbeddingService } from './embedding-service';
import { KnowledgeSearchResultItem } from './knowledge-types';

/**
 * Plugin providing the vector store operations
 */
export const PLUGIN_NAME = 'agentic-tools';

/**
 * Collection name for knowledge base chunks in Qdrant
 */
export const KNOWLEDGE_COLLECTION = 'knowledge-base';

/**
 * Default limit for search results
 */
export const DEFAULT_SEARCH_LIMIT = 20;

/**
 * A missing target collection surfaces as a "Not Found" error from the vector
 * store; callers treat that as an empty result rather than a failure.
 */
function isCollectionNotFoundError(message: string): boolean {
  return message.includes('Not Found') || message.includes('not found');
}

let embeddingServiceInstance: EmbeddingService | null = null;
function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
}

/**
 * Result type for the reusable search function
 */
export interface SearchKnowledgeBaseResult {
  success: boolean;
  chunks: KnowledgeSearchResultItem[];
  totalMatches: number;
  error?: string;
}

/**
 * Reusable knowledge base search function.
 * Can be called from MCP tool handler or HTTP endpoints.
 *
 * @param params Search parameters
 * @returns Search results with chunks or error
 */
export async function searchKnowledgeBase(params: {
  query: string;
  limit?: number;
  uriFilter?: string;
}): Promise<SearchKnowledgeBaseResult> {
  const { query, limit = DEFAULT_SEARCH_LIMIT, uriFilter } = params;

  // Check plugin availability
  if (!isPluginInitialized()) {
    return {
      success: false,
      chunks: [],
      totalMatches: 0,
      error: 'Plugin system not available',
    };
  }

  // Check embedding service availability
  const embeddingService = getEmbeddingService();
  if (!embeddingService.isAvailable()) {
    const status = embeddingService.getStatus();
    return {
      success: false,
      chunks: [],
      totalMatches: 0,
      error: `Embedding service not available: ${status.reason}`,
    };
  }

  // Generate embedding for the search query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embeddingService.generateEmbedding(query);
  } catch (err) {
    return {
      success: false,
      chunks: [],
      totalMatches: 0,
      error: `Failed to generate query embedding: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Build filter if uriFilter is provided
  let filter: Record<string, unknown> | undefined;
  if (uriFilter) {
    filter = {
      must: [
        {
          key: 'uri',
          match: {
            value: uriFilter,
          },
        },
      ],
    };
  }

  // Call vector_search plugin tool. Wrap in try/catch so a transport/plugin throw
  // is returned as a structured error (matching the generateEmbedding path above)
  // instead of escaping this function's {success, error} contract.
  let searchResponse: Awaited<ReturnType<typeof invokePluginTool>>;
  try {
    searchResponse = await invokePluginTool(PLUGIN_NAME, 'vector_search', {
      collection: KNOWLEDGE_COLLECTION,
      embedding: queryEmbedding,
      limit,
      filter,
      scoreThreshold: 0, // Return all results up to limit, let consumer filter by score
    });
  } catch (err) {
    return {
      success: false,
      chunks: [],
      totalMatches: 0,
      error: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!searchResponse.success) {
    const error = searchResponse.error as { message?: string; error?: string } | undefined;
    const errorMessage = error?.message || error?.error || 'Search failed';

    // If collection doesn't exist (Not Found), return empty result (not error)
    if (isCollectionNotFoundError(errorMessage)) {
      return {
        success: true,
        chunks: [],
        totalMatches: 0,
      };
    }

    return {
      success: false,
      chunks: [],
      totalMatches: 0,
      error: errorMessage,
    };
  }

  // Extract results from plugin response
  const searchResult = searchResponse.result as {
    success?: boolean;
    data?: Array<{
      id: string;
      score: number;
      payload: Record<string, unknown>;
    }>;
    error?: string;
    message?: string;
  } | null;

  if (!searchResult || typeof searchResult !== 'object') {
    return {
      success: false,
      chunks: [],
      totalMatches: 0,
      error: 'Search returned an invalid response',
    };
  }

  if (!searchResult.success) {
    const errorMessage = searchResult.error || searchResult.message || 'Search failed';

    // If collection doesn't exist, return empty result (not error)
    if (isCollectionNotFoundError(errorMessage)) {
      return {
        success: true,
        chunks: [],
        totalMatches: 0,
      };
    }

    return {
      success: false,
      chunks: [],
      totalMatches: 0,
      error: errorMessage,
    };
  }

  // Transform results to KnowledgeSearchResultItem format
  const results = searchResult.data || [];
  const chunks: KnowledgeSearchResultItem[] = results.map((result) => ({
    id: result.id,
    content: (result.payload.content as string) || '',
    score: result.score,
    matchType: 'semantic' as const, // Dense vector search only (BM25 deferred)
    uri: (result.payload.uri as string) || '',
    metadata: (result.payload.metadata as Record<string, unknown>) || {},
    chunkIndex: (result.payload.chunkIndex as number) ?? 0,
    totalChunks: (result.payload.totalChunks as number) ?? 0,
    tags: (result.payload.tags as string[]) || [], // PRD #375: AI classification tags
    extractedPolicies: undefined, // Populated by PRD #357
  }));

  return {
    success: true,
    chunks,
    totalMatches: chunks.length,
  };
}
