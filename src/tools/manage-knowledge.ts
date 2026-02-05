/**
 * Knowledge Base Management Tool
 *
 * MCP tool for managing the knowledge base: ingest documents, search, delete, and retrieve chunks.
 * Documents are chunked (via plugin), embedded, and stored in Qdrant for semantic search.
 *
 * PRD #356: Knowledge Base System
 */

import { z } from 'zod';
import { Logger } from '../core/error-handling';
import { DotAI } from '../core/index';
import { invokePluginTool, isPluginInitialized } from '../core/plugin-registry';
import { EmbeddingService } from '../core/embedding-service';
import {
  PluginChunkResult,
  IngestResponse,
  KnowledgeSearchResponse,
  KnowledgeSearchResultItem,
  DeleteByUriResponse,
} from '../core/knowledge-types';

/**
 * Collection name for knowledge base chunks in Qdrant
 */
const KNOWLEDGE_COLLECTION = 'knowledge-base';

// Tool metadata for MCP registration
export const MANAGE_KNOWLEDGE_TOOL_NAME = 'manageKnowledge';
export const MANAGE_KNOWLEDGE_TOOL_DESCRIPTION =
  'Manage the knowledge base: ingest documents, search with natural language, or delete chunks. ' +
  'Use "ingest" to store organizational documentation, "search" to find relevant content semantically, ' +
  'or "deleteByUri" to remove all chunks for a document. ' +
  'TIP: For complex questions, you can call search multiple times with different phrasings to gather ' +
  'comprehensive information before synthesizing your answer.';

// Input schema using Zod
export const MANAGE_KNOWLEDGE_TOOL_INPUT_SCHEMA = {
  operation: z
    .enum(['ingest', 'search', 'deleteByUri'])
    .describe(
      'Operation to perform: "ingest" to add documents, "search" for semantic search, "deleteByUri" to remove all chunks for a document.'
    ),
  content: z
    .string()
    .optional()
    .describe('Document content to ingest (required for ingest operation).'),
  uri: z
    .string()
    .optional()
    .describe(
      'Full URL identifying the document (required for ingest and deleteByUri). ' +
        'E.g., https://github.com/org/repo/blob/main/docs/guide.md'
    ),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional metadata to store with chunks'),
  query: z
    .string()
    .optional()
    .describe('Natural language search query (required for search operation).'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of results to return for search (default: 20).'),
  uriFilter: z
    .string()
    .optional()
    .describe('Optional URL prefix to filter search results (e.g., "https://github.com/org/repo/").'),
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate.'),
};

/**
 * Input type for knowledge management tool
 */
export interface ManageKnowledgeInput {
  operation: 'ingest' | 'search' | 'deleteByUri';
  content?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
  query?: string;
  limit?: number;
  uriFilter?: string;
  interaction_id?: string;
}

/**
 * Plugin name for agentic-tools
 */
const PLUGIN_NAME = 'agentic-tools';

/**
 * Create error response matching other tool patterns
 */
function createErrorResponse(message: string, details?: Record<string, unknown>) {
  return {
    success: false,
    error: { message, ...details },
  };
}

/**
 * Handle the ingest operation
 */
async function handleIngestOperation(
  args: ManageKnowledgeInput,
  logger: Logger,
  requestId: string
): Promise<unknown> {
  const { content, uri, metadata } = args;

  // Validate required parameters
  if (!content) {
    return createErrorResponse('Missing required parameter: content', {
      operation: 'ingest',
      hint: 'Provide the document content to ingest',
    });
  }

  if (!uri) {
    return createErrorResponse('Missing required parameter: uri', {
      operation: 'ingest',
      hint: 'Provide the full URL identifying the document (e.g., https://github.com/org/repo/blob/main/docs/guide.md)',
    });
  }

  // Check plugin availability
  if (!isPluginInitialized()) {
    return createErrorResponse('Plugin system not available', {
      operation: 'ingest',
      hint: 'The agentic-tools plugin must be running for knowledge base operations',
    });
  }

  // Check embedding service availability
  const embeddingService = new EmbeddingService();
  if (!embeddingService.isAvailable()) {
    const status = embeddingService.getStatus();
    return createErrorResponse('Embedding service not available', {
      operation: 'ingest',
      reason: status.reason,
      hint: 'Set OPENAI_API_KEY environment variable to enable embeddings',
    });
  }

  logger.info('Starting document ingestion', {
    requestId,
    uri,
    contentSize: Buffer.byteLength(content, 'utf8'),
    hasMetadata: !!metadata,
  });

  try {
    // Step 1: Delete any existing chunks for this URI (ensures clean replacement)
    const deletedCount = await deleteChunksByUri(uri, logger, requestId);
    if (deletedCount > 0) {
      logger.info('Deleted existing chunks before re-ingestion', {
        requestId,
        uri,
        chunksDeleted: deletedCount,
      });
    }

    // Step 2: Chunk the document
    logger.debug('Calling knowledge_chunk plugin tool', { requestId, uri });

    const chunkResponse = await invokePluginTool(PLUGIN_NAME, 'knowledge_chunk', {
      content,
      uri,
    });

    if (!chunkResponse.success) {
      const error = chunkResponse.error as { message?: string } | undefined;
      const errorMessage = error?.message || 'Chunking failed';
      logger.error('Plugin chunking failed', new Error(errorMessage), { requestId, uri });
      return createErrorResponse('Document chunking failed', {
        operation: 'ingest',
        error: errorMessage,
      });
    }

    // Extract chunk data from plugin response
    const chunkResult = chunkResponse.result as {
      success: boolean;
      data?: {
        chunks: PluginChunkResult[];
        totalChunks: number;
        uri: string;
      };
      error?: string;
      message: string;
    };

    if (!chunkResult.success || !chunkResult.data) {
      return createErrorResponse('Document chunking failed', {
        operation: 'ingest',
        error: chunkResult.error || chunkResult.message,
      });
    }

    const { chunks, totalChunks } = chunkResult.data;

    // Handle empty content (no chunks created)
    if (totalChunks === 0) {
      logger.info('Empty content - no chunks created', { requestId, uri });
      const response: IngestResponse = {
        success: true,
        operation: 'ingest',
        chunksCreated: 0,
        chunkIds: [],
        uri,
        message: 'Empty or whitespace-only content - no chunks created',
      };
      return response;
    }

    // Step 3: Initialize collection via plugin
    const vectorSize = embeddingService.getDimensions();
    logger.debug('Initializing knowledge collection via plugin', { requestId, vectorSize });

    const initResponse = await invokePluginTool(PLUGIN_NAME, 'collection_initialize', {
      collection: KNOWLEDGE_COLLECTION,
      vectorSize,
      createTextIndex: true,
    });

    if (!initResponse.success) {
      const error = initResponse.error as { message?: string } | undefined;
      const errorMessage = error?.message || 'Collection initialization failed';
      logger.error('Collection initialization failed', new Error(errorMessage), { requestId });
      return createErrorResponse('Failed to initialize knowledge collection', {
        operation: 'ingest',
        error: errorMessage,
      });
    }

    // Step 4: Store each chunk with embedding via plugin
    const chunkIds: string[] = [];
    const ingestedAt = new Date().toISOString();

    for (const chunk of chunks) {
      logger.debug('Generating embedding for chunk', {
        requestId,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
      });

      // Generate embedding for chunk content
      const embedding = await embeddingService.generateEmbedding(chunk.content);

      // Build payload for Qdrant
      const payload: Record<string, unknown> = {
        content: chunk.content,
        uri,
        metadata: metadata || {},
        checksum: chunk.checksum,
        ingestedAt,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        extractedPolicyIds: [],
      };

      logger.debug('Storing chunk via plugin', {
        requestId,
        chunkId: chunk.id,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
      });

      // Store via plugin
      const storeResponse = await invokePluginTool(PLUGIN_NAME, 'vector_store', {
        collection: KNOWLEDGE_COLLECTION,
        id: chunk.id,
        embedding,
        payload,
      });

      if (!storeResponse.success) {
        const error = storeResponse.error as { message?: string } | undefined;
        const errorMessage = error?.message || 'Store failed';
        logger.error('Failed to store chunk', new Error(errorMessage), {
          requestId,
          chunkId: chunk.id,
        });
        return createErrorResponse('Failed to store chunk', {
          operation: 'ingest',
          chunkId: chunk.id,
          error: errorMessage,
        });
      }

      chunkIds.push(chunk.id);
    }

    logger.info('Document ingestion completed', {
      requestId,
      uri,
      chunksCreated: chunkIds.length,
    });

    const response: IngestResponse = {
      success: true,
      operation: 'ingest',
      chunksCreated: chunkIds.length,
      chunkIds,
      uri,
      message: `Successfully ingested document into ${chunkIds.length} chunks`,
    };

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Document ingestion failed', error as Error, { requestId, uri });
    return createErrorResponse('Document ingestion failed', {
      operation: 'ingest',
      error: errorMessage,
    });
  }
}

/**
 * Default limit for search results
 */
const DEFAULT_SEARCH_LIMIT = 20;

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
  const embeddingService = new EmbeddingService();
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
  const queryEmbedding = await embeddingService.generateEmbedding(query);

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

  // Call vector_search plugin tool
  const searchResponse = await invokePluginTool(PLUGIN_NAME, 'vector_search', {
    collection: KNOWLEDGE_COLLECTION,
    embedding: queryEmbedding,
    limit,
    filter,
    scoreThreshold: 0, // Return all results up to limit, let consumer filter by score
  });

  if (!searchResponse.success) {
    const error = searchResponse.error as { message?: string; error?: string } | undefined;
    const errorMessage = error?.message || error?.error || 'Search failed';

    // If collection doesn't exist (Not Found), return empty result (not error)
    if (errorMessage.includes('Not Found') || errorMessage.includes('not found')) {
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
    success: boolean;
    data?: Array<{
      id: string;
      score: number;
      payload: Record<string, unknown>;
    }>;
    error?: string;
    message: string;
  };

  if (!searchResult.success) {
    const errorMessage = searchResult.error || searchResult.message;

    // If collection doesn't exist, return empty result (not error)
    if (errorMessage.includes('Not Found') || errorMessage.includes('not found')) {
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
    content: result.payload.content as string,
    score: result.score,
    matchType: 'semantic' as const, // Dense vector search only (BM25 deferred)
    uri: result.payload.uri as string,
    metadata: (result.payload.metadata as Record<string, unknown>) || {},
    chunkIndex: result.payload.chunkIndex as number,
    totalChunks: result.payload.totalChunks as number,
    extractedPolicies: undefined, // Populated by PRD #357
  }));

  return {
    success: true,
    chunks,
    totalMatches: chunks.length,
  };
}

/**
 * Handle the search operation (MCP tool handler)
 */
async function handleSearchOperation(
  args: ManageKnowledgeInput,
  logger: Logger,
  requestId: string
): Promise<unknown> {
  const { query, limit = DEFAULT_SEARCH_LIMIT, uriFilter } = args;

  // Validate required parameters
  if (!query) {
    return createErrorResponse('Missing required parameter: query', {
      operation: 'search',
      hint: 'Provide a natural language search query',
    });
  }

  logger.info('Starting knowledge base search', {
    requestId,
    queryLength: query.length,
    limit,
    hasUriFilter: !!uriFilter,
  });

  try {
    // Use the reusable search function
    const searchResult = await searchKnowledgeBase({ query, limit, uriFilter });

    if (!searchResult.success) {
      logger.error('Knowledge base search failed', new Error(searchResult.error), { requestId });
      return createErrorResponse('Search failed', {
        operation: 'search',
        error: searchResult.error,
      });
    }

    logger.info('Knowledge base search completed', {
      requestId,
      query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
      resultsFound: searchResult.chunks.length,
    });

    const response: KnowledgeSearchResponse = {
      success: true,
      operation: 'search',
      chunks: searchResult.chunks,
      totalMatches: searchResult.totalMatches,
      query,
      message:
        searchResult.chunks.length > 0
          ? `Found ${searchResult.chunks.length} matching chunks`
          : 'No matching documents found',
      agentInstructions: searchResult.chunks.length > 0
        ? `Use the chunks as source material to answer the user's question:
1. Extract and combine only the relevant information from the chunks
2. Synthesize a coherent answer that directly addresses the user's query
3. Discard irrelevant text - chunks may contain both relevant and irrelevant content
4. At the end, include a "Sources:" section listing the unique source URIs as clickable markdown links
5. Do NOT show raw chunks, scores, or chunk metadata to the user`
        : undefined,
    };

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Knowledge base search failed', error as Error, { requestId });
    return createErrorResponse('Search failed', {
      operation: 'search',
      error: errorMessage,
    });
  }
}

/**
 * Helper to delete all chunks for a URI.
 * Returns the number of chunks deleted, or throws an error.
 * Handles "collection not found" gracefully (returns 0).
 */
async function deleteChunksByUri(
  uri: string,
  logger: Logger,
  requestId: string
): Promise<number> {
  // Query all chunks matching the URI
  const queryResponse = await invokePluginTool(PLUGIN_NAME, 'vector_query', {
    collection: KNOWLEDGE_COLLECTION,
    filter: {
      must: [{ key: 'uri', match: { value: uri } }],
    },
    limit: 10000, // High limit to get all chunks for a document
  });

  if (!queryResponse.success) {
    const error = queryResponse.error as { message?: string; error?: string } | undefined;
    const errorMessage = error?.message || error?.error || 'Query failed';

    // If collection doesn't exist (Not Found), return 0 (no chunks to delete)
    if (errorMessage.includes('Not Found') || errorMessage.includes('not found')) {
      logger.debug('Collection not found - no chunks to delete', { requestId, uri });
      return 0;
    }

    throw new Error(`Failed to query chunks for deletion: ${errorMessage}`);
  }

  // Extract results from plugin response
  const queryResult = queryResponse.result as {
    success: boolean;
    data?: Array<{
      id: string;
      payload: Record<string, unknown>;
    }>;
    error?: string;
    message: string;
  };

  if (!queryResult.success) {
    const errorMessage = queryResult.error || queryResult.message;

    // If collection doesn't exist, return 0
    if (errorMessage.includes('Not Found') || errorMessage.includes('not found')) {
      logger.debug('Collection not found - no chunks to delete', { requestId, uri });
      return 0;
    }

    throw new Error(`Failed to query chunks for deletion: ${errorMessage}`);
  }

  const chunksToDelete = queryResult.data || [];

  // If no chunks found, return 0
  if (chunksToDelete.length === 0) {
    logger.debug('No existing chunks found for URI', { requestId, uri });
    return 0;
  }

  // Delete each chunk by ID
  let deletedCount = 0;
  for (const chunk of chunksToDelete) {
    logger.debug('Deleting chunk', { requestId, chunkId: chunk.id });

    const deleteResponse = await invokePluginTool(PLUGIN_NAME, 'vector_delete', {
      collection: KNOWLEDGE_COLLECTION,
      id: chunk.id,
    });

    if (!deleteResponse.success) {
      const error = deleteResponse.error as { message?: string } | undefined;
      const errorMessage = error?.message || 'Delete failed';
      throw new Error(`Failed to delete chunk ${chunk.id}: ${errorMessage}`);
    }

    deletedCount++;
  }

  return deletedCount;
}

/**
 * Handle the deleteByUri operation
 */
async function handleDeleteByUriOperation(
  args: ManageKnowledgeInput,
  logger: Logger,
  requestId: string
): Promise<unknown> {
  const { uri } = args;

  // Validate required parameters
  if (!uri) {
    return createErrorResponse('Missing required parameter: uri', {
      operation: 'deleteByUri',
      hint: 'Provide the URI of the document to delete all chunks for',
    });
  }

  // Check plugin availability
  if (!isPluginInitialized()) {
    return createErrorResponse('Plugin system not available', {
      operation: 'deleteByUri',
      hint: 'The agentic-tools plugin must be running for knowledge base operations',
    });
  }

  logger.info('Starting deleteByUri operation', { requestId, uri });

  try {
    const deletedCount = await deleteChunksByUri(uri, logger, requestId);

    logger.info('DeleteByUri operation completed', {
      requestId,
      uri,
      chunksDeleted: deletedCount,
    });

    const response: DeleteByUriResponse = {
      success: true,
      operation: 'deleteByUri',
      uri,
      chunksDeleted: deletedCount,
      message: deletedCount > 0
        ? `Successfully deleted ${deletedCount} chunks for URI`
        : 'No chunks found for URI',
    };

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('DeleteByUri operation failed', error as Error, { requestId, uri });
    return createErrorResponse('Delete operation failed', {
      operation: 'deleteByUri',
      error: errorMessage,
    });
  }
}

/**
 * MCP response format with content array
 */
interface McpToolResponse {
  content: Array<{ type: 'text'; text: string }>;
}

/**
 * Wrap response in MCP content format
 */
function wrapMcpResponse(response: unknown): McpToolResponse {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

/**
 * Main tool handler - routes to appropriate operation handler
 */
export async function handleManageKnowledgeTool(
  args: ManageKnowledgeInput,
  _dotAI: DotAI | null,
  logger: Logger,
  requestId: string
): Promise<McpToolResponse> {
  logger.info('Processing manageKnowledge tool request', {
    requestId,
    operation: args.operation,
  });

  // Route to appropriate handler based on operation
  let response: unknown;
  switch (args.operation) {
    case 'ingest':
      response = await handleIngestOperation(args, logger, requestId);
      break;

    case 'search':
      response = await handleSearchOperation(args, logger, requestId);
      break;

    case 'deleteByUri':
      response = await handleDeleteByUriOperation(args, logger, requestId);
      break;

    default:
      response = createErrorResponse(`Unsupported operation: ${args.operation}`, {
        supportedOperations: ['ingest', 'search', 'deleteByUri'],
        hint: 'Use "ingest" to add documents, "search" for semantic search, or "deleteByUri" to remove all chunks for a document',
      });
  }

  // Wrap response in MCP content format
  return wrapMcpResponse(response);
}
