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
  KnowledgeChunk,
  PluginChunkResult,
  IngestResponse,
  GetByUriResponse,
} from '../core/knowledge-types';

/**
 * Collection name for knowledge base chunks in Qdrant
 */
const KNOWLEDGE_COLLECTION = 'knowledge-base';

// Tool metadata for MCP registration
export const MANAGE_KNOWLEDGE_TOOL_NAME = 'manageKnowledge';
export const MANAGE_KNOWLEDGE_TOOL_DESCRIPTION =
  'Ingest documents into the knowledge base for semantic search. ' +
  'Use this to store organizational documentation, guides, and policies ' +
  'that can later be searched with natural language queries.';

// Input schema using Zod
export const MANAGE_KNOWLEDGE_TOOL_INPUT_SCHEMA = {
  operation: z
    .enum(['ingest', 'getByUri'])
    .describe('Operation to perform: "ingest" to add documents, "getByUri" to retrieve chunks.'),
  content: z
    .string()
    .optional()
    .describe('Document content to ingest (required for ingest operation). Max 1MB.'),
  uri: z
    .string()
    .optional()
    .describe(
      'Full URI identifying the document (required for ingest and getByUri). ' +
        'E.g., git://org/repo/docs/guide.md'
    ),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional metadata to store with chunks'),
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate.'),
};

/**
 * Input type for knowledge management tool
 */
export interface ManageKnowledgeInput {
  operation: 'ingest' | 'getByUri';
  content?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
  interaction_id?: string;
}

/**
 * Maximum document size in bytes (1MB)
 */
const MAX_DOCUMENT_SIZE = 1_048_576;

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
      hint: 'Provide the full URI identifying the document (e.g., git://org/repo/docs/guide.md)',
    });
  }

  // Check document size limit
  const contentSize = Buffer.byteLength(content, 'utf8');
  if (contentSize > MAX_DOCUMENT_SIZE) {
    return createErrorResponse('Document exceeds maximum size limit', {
      operation: 'ingest',
      maxSize: '1MB',
      actualSize: `${(contentSize / 1_048_576).toFixed(2)}MB`,
      hint: 'Split the document into smaller parts before ingesting',
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
    contentSize,
    hasMetadata: !!metadata,
  });

  try {
    // Step 1: Call plugin to chunk the document
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

    // Step 2: Initialize collection via plugin
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

    // Step 3: Store each chunk with embedding via plugin
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
 * Handle the getByUri operation
 */
async function handleGetByUriOperation(
  args: ManageKnowledgeInput,
  logger: Logger,
  requestId: string
): Promise<unknown> {
  const { uri } = args;

  // Validate required parameters
  if (!uri) {
    return createErrorResponse('Missing required parameter: uri', {
      operation: 'getByUri',
      hint: 'Provide the URI of the document to retrieve chunks for',
    });
  }

  // Check plugin availability
  if (!isPluginInitialized()) {
    return createErrorResponse('Plugin system not available', {
      operation: 'getByUri',
      hint: 'The agentic-tools plugin must be running for knowledge base operations',
    });
  }

  logger.info('Retrieving chunks by URI via plugin', { requestId, uri });

  try {
    // Query chunks by URI filter via plugin
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

      // If collection doesn't exist (Not Found), return empty result instead of error
      if (errorMessage.includes('Not Found') || errorMessage.includes('not found')) {
        logger.info('Collection not found - returning empty result', { requestId, uri });
        const response: GetByUriResponse = {
          success: true,
          operation: 'getByUri',
          uri,
          chunks: [],
          totalChunks: 0,
          message: 'No chunks found for URI',
        };
        return response;
      }

      logger.error('Plugin query failed', new Error(errorMessage), { requestId, uri });
      return createErrorResponse('Failed to retrieve chunks', {
        operation: 'getByUri',
        error: errorMessage,
      });
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

      // If collection doesn't exist (Not Found), return empty result instead of error
      if (errorMessage.includes('Not Found') || errorMessage.includes('not found')) {
        logger.info('Collection not found - returning empty result', { requestId, uri });
        const response: GetByUriResponse = {
          success: true,
          operation: 'getByUri',
          uri,
          chunks: [],
          totalChunks: 0,
          message: 'No chunks found for URI',
        };
        return response;
      }

      return createErrorResponse('Failed to retrieve chunks', {
        operation: 'getByUri',
        error: errorMessage,
      });
    }

    // Convert plugin results to KnowledgeChunk format
    const results = queryResult.data || [];
    const chunks: KnowledgeChunk[] = results.map((result) => ({
      id: result.id,
      content: result.payload.content as string,
      uri: result.payload.uri as string,
      metadata: (result.payload.metadata as Record<string, unknown>) || {},
      checksum: result.payload.checksum as string,
      ingestedAt: result.payload.ingestedAt as string,
      chunkIndex: result.payload.chunkIndex as number,
      totalChunks: result.payload.totalChunks as number,
      extractedPolicyIds: result.payload.extractedPolicyIds as string[] | undefined,
    }));

    // Sort by chunkIndex for consistent ordering
    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    logger.info('Retrieved chunks by URI', {
      requestId,
      uri,
      chunksFound: chunks.length,
    });

    const response: GetByUriResponse = {
      success: true,
      operation: 'getByUri',
      uri,
      chunks,
      totalChunks: chunks.length,
      message: chunks.length > 0
        ? `Retrieved ${chunks.length} chunks for URI`
        : 'No chunks found for URI',
    };

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to retrieve chunks by URI', error as Error, { requestId, uri });
    return createErrorResponse('Failed to retrieve chunks', {
      operation: 'getByUri',
      error: errorMessage,
    });
  }
}

/**
 * Main tool handler - routes to appropriate operation handler
 */
export async function handleManageKnowledgeTool(
  args: ManageKnowledgeInput,
  _dotAI: DotAI | null,
  logger: Logger,
  requestId: string
): Promise<unknown> {
  logger.info('Processing manageKnowledge tool request', {
    requestId,
    operation: args.operation,
  });

  // Route to appropriate handler based on operation
  switch (args.operation) {
    case 'ingest':
      return handleIngestOperation(args, logger, requestId);

    case 'getByUri':
      return handleGetByUriOperation(args, logger, requestId);

    default:
      return createErrorResponse(`Unsupported operation: ${args.operation}`, {
        supportedOperations: ['ingest', 'getByUri'],
        hint: 'Use operation "ingest" to add documents or "getByUri" to retrieve chunks',
      });
  }
}
