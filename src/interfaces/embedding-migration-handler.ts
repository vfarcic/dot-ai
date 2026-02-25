/**
 * Embedding Migration Handler
 *
 * Handles POST /api/v1/embeddings/migrate requests.
 * Re-embeds all data in vector collections when switching embedding providers
 * (e.g., OpenAI 1536-dim → local TEI 384-dim).
 *
 * PRD #384: Optional Local Embedding Service
 */

import { Logger } from '../core/error-handling';
import { EmbeddingService } from '../core/embedding-service';
import { invokePluginTool, isPluginInitialized } from '../core/plugin-registry';
import { RestApiResponse } from './rest-api';
import type { CollectionMigrationResult } from './schemas/embeddings';

const PLUGIN_NAME = 'agentic-tools';
const BATCH_SIZE = 50;

interface CollectionStats {
  pointsCount: number;
  vectorSize: number;
  status: string;
  exists: boolean;
  url: string;
}

interface VectorDocument {
  id: string;
  payload: Record<string, unknown>;
}

/**
 * Invoke a plugin tool and extract the result data
 */
async function invokePlugin<R>(
  tool: string,
  args: Record<string, unknown>
): Promise<R> {
  const response = await invokePluginTool(PLUGIN_NAME, tool, args);

  if (!response.success) {
    const error = response.error as { message?: string } | string | undefined;
    const message =
      typeof error === 'object' && error?.message
        ? error.message
        : String(error || `Plugin tool ${tool} failed`);
    throw new Error(message);
  }

  const toolResult = response.result as
    | { success?: boolean; data?: R; error?: string; message?: string }
    | null
    | undefined;

  if (!toolResult || typeof toolResult !== 'object') {
    throw new Error(`Plugin tool ${tool} returned invalid result`);
  }

  if (toolResult.success === false) {
    throw new Error(
      toolResult.error || toolResult.message || `Plugin tool ${tool} failed`
    );
  }

  return toolResult.data as R;
}

/**
 * Migrate a single collection: read all points, re-embed, recreate collection, store
 */
async function migrateCollection(
  collectionName: string,
  embeddingService: EmbeddingService,
  targetDimensions: number,
  logger: Logger,
  requestId: string
): Promise<CollectionMigrationResult> {
  // Get current collection stats
  const stats = await invokePlugin<CollectionStats>('collection_stats', {
    collection: collectionName,
  });

  if (!stats.exists) {
    return {
      collection: collectionName,
      status: 'failed',
      previousDimensions: 0,
      newDimensions: targetDimensions,
      total: 0,
      processed: 0,
      failed: 0,
      error: `Collection '${collectionName}' does not exist`,
    };
  }

  const previousDimensions = stats.vectorSize;

  // Skip if dimensions already match
  if (previousDimensions === targetDimensions) {
    return {
      collection: collectionName,
      status: 'skipped',
      previousDimensions,
      newDimensions: targetDimensions,
      total: stats.pointsCount,
      processed: 0,
      failed: 0,
    };
  }

  logger.info('Starting collection migration', {
    requestId,
    collection: collectionName,
    previousDimensions,
    targetDimensions,
    pointsCount: stats.pointsCount,
  });

  // List all points (payload only, no vectors)
  const documents = await invokePlugin<VectorDocument[]>('vector_list', {
    collection: collectionName,
    limit: 10000,
  });

  const total = documents.length;

  // Extract searchText from each document
  const pointsWithText = documents.map(doc => ({
    id: doc.id,
    payload: doc.payload,
    searchText: (doc.payload.searchText as string) || '',
  }));

  // Filter out points without searchText
  const migrateablePoints = pointsWithText.filter(p => p.searchText.length > 0);
  const skippedNoText = total - migrateablePoints.length;

  if (skippedNoText > 0) {
    logger.warn('Some points have no searchText and will be skipped', {
      requestId,
      collection: collectionName,
      skippedNoText,
    });
  }

  // Batch re-embed all texts
  const allTexts = migrateablePoints.map(p => p.searchText);
  const allEmbeddings: number[][] = [];
  let failedEmbeddings = 0;

  for (let i = 0; i < allTexts.length; i += BATCH_SIZE) {
    const batch = allTexts.slice(i, i + BATCH_SIZE);
    try {
      const embeddings = await embeddingService.generateEmbeddings(batch);
      allEmbeddings.push(...embeddings);
    } catch (error) {
      logger.error(
        'Batch embedding failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          collection: collectionName,
          batchStart: i,
          batchSize: batch.length,
        }
      );
      // Fill with empty arrays to track failures
      for (let j = 0; j < batch.length; j++) {
        allEmbeddings.push([]);
      }
      failedEmbeddings += batch.length;
    }
  }

  // Recreate collection with new dimensions (initializeCollection auto-deletes on mismatch)
  await invokePlugin<void>('collection_initialize', {
    collection: collectionName,
    vectorSize: targetDimensions,
    createTextIndex: true,
  });

  // Store all re-embedded points
  let processed = 0;
  let failed = failedEmbeddings + skippedNoText;

  for (let i = 0; i < migrateablePoints.length; i++) {
    const point = migrateablePoints[i];
    const embedding = allEmbeddings[i];

    // Skip points where embedding failed
    if (!embedding || embedding.length === 0) {
      continue;
    }

    try {
      await invokePlugin<void>('vector_store', {
        collection: collectionName,
        id: point.id,
        embedding,
        payload: point.payload,
      });
      processed++;
    } catch (error) {
      logger.error(
        'Failed to store re-embedded point',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId,
          collection: collectionName,
          pointId: point.id,
        }
      );
      failed++;
    }
  }

  logger.info('Collection migration complete', {
    requestId,
    collection: collectionName,
    total,
    processed,
    failed,
  });

  return {
    collection: collectionName,
    status: 'migrated',
    previousDimensions,
    newDimensions: targetDimensions,
    total,
    processed,
    failed,
  };
}

/**
 * Handle embedding migration request
 */
export async function handleEmbeddingMigration(
  body: unknown,
  logger: Logger,
  requestId: string
): Promise<RestApiResponse> {
  // Check plugin availability
  if (!isPluginInitialized()) {
    return {
      success: false,
      error: {
        code: 'PLUGIN_UNAVAILABLE',
        message:
          'Plugin system is not initialized. Vector database operations are unavailable.',
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: 'v1',
      },
    };
  }

  // Check embedding service availability
  const embeddingService = new EmbeddingService();
  if (!embeddingService.isAvailable()) {
    const status = embeddingService.getStatus();
    return {
      success: false,
      error: {
        code: 'EMBEDDING_SERVICE_UNAVAILABLE',
        message: `Embedding service is not available: ${status.reason || 'No embedding provider configured'}`,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: 'v1',
      },
    };
  }

  const targetDimensions = embeddingService.getDimensions();

  // Parse request body
  const parsedBody =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const requestedCollection =
    typeof parsedBody.collection === 'string'
      ? parsedBody.collection
      : undefined;

  // Discover collections
  let collectionsToMigrate: string[];

  if (requestedCollection) {
    collectionsToMigrate = [requestedCollection];
  } else {
    try {
      collectionsToMigrate = await invokePlugin<string[]>(
        'collection_list',
        {}
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: {
          code: 'MIGRATION_ERROR',
          message: `Failed to list collections: ${message}`,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: 'v1',
        },
      };
    }
  }

  logger.info('Starting embedding migration', {
    requestId,
    targetDimensions,
    collections: collectionsToMigrate,
    requestedCollection: requestedCollection || 'all',
  });

  // Migrate each collection
  const results: CollectionMigrationResult[] = [];

  for (const collectionName of collectionsToMigrate) {
    try {
      const result = await migrateCollection(
        collectionName,
        embeddingService,
        targetDimensions,
        logger,
        requestId
      );
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        'Collection migration failed',
        error instanceof Error ? error : new Error(message),
        {
          requestId,
          collection: collectionName,
        }
      );
      results.push({
        collection: collectionName,
        status: 'failed',
        previousDimensions: 0,
        newDimensions: targetDimensions,
        total: 0,
        processed: 0,
        failed: 0,
        error: message,
      });
    }
  }

  // Build summary
  const summary = {
    totalCollections: results.length,
    migrated: results.filter(r => r.status === 'migrated').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
  };

  logger.info('Embedding migration complete', {
    requestId,
    summary,
  });

  return {
    success: true,
    data: {
      collections: results,
      summary,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
      version: 'v1',
    },
  };
}
