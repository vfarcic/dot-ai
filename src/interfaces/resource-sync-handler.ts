/**
 * Resource Sync Handler
 *
 * Handles POST /api/v1/resources/sync requests from dot-ai-controller.
 * Receives cluster resource data, generates embeddings, and stores in Qdrant.
 */

import { Logger } from '../core/error-handling';
import { ResourceVectorService, ClusterResource, ResourceSyncRequest, generateResourceId } from '../core/resource-vector-service';
import { RestApiResponse } from './rest-api';

// Global flag to track if resources collection has been initialized
let resourcesCollectionInitialized = false;

/**
 * Reset initialization state (for testing or recovery)
 * Call this to force re-initialization on the next request
 */
export function resetResourcesCollectionState(): void {
  resourcesCollectionInitialized = false;
}

/**
 * Validate a single cluster resource object
 */
function validateClusterResource(resource: unknown, index: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!resource || typeof resource !== 'object') {
    return { valid: false, errors: [`upserts[${index}]: must be an object`] };
  }

  const r = resource as Record<string, unknown>;

  if (!r.namespace || typeof r.namespace !== 'string' || r.namespace.length === 0) {
    errors.push(`upserts[${index}].namespace: required string field`);
  }
  if (!r.name || typeof r.name !== 'string' || r.name.length === 0) {
    errors.push(`upserts[${index}].name: required string field`);
  }
  if (!r.kind || typeof r.kind !== 'string' || r.kind.length === 0) {
    errors.push(`upserts[${index}].kind: required string field`);
  }
  if (!r.apiVersion || typeof r.apiVersion !== 'string' || r.apiVersion.length === 0) {
    errors.push(`upserts[${index}].apiVersion: required string field`);
  }
  if (!r.createdAt || typeof r.createdAt !== 'string') {
    errors.push(`upserts[${index}].createdAt: required string field`);
  }
  if (!r.updatedAt || typeof r.updatedAt !== 'string') {
    errors.push(`upserts[${index}].updatedAt: required string field`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate the sync request body
 */
function validateSyncRequest(body: unknown): { valid: boolean; errors: string[]; data?: ResourceSyncRequest } {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be an object'] };
  }

  const b = body as Record<string, unknown>;

  // Default values
  const upserts: ClusterResource[] = [];
  const deletes: string[] = [];
  const isResync = b.isResync === true;

  // Validate upserts array
  if (b.upserts !== undefined) {
    if (!Array.isArray(b.upserts)) {
      errors.push('upserts: must be an array');
    } else {
      for (let i = 0; i < b.upserts.length; i++) {
        const resourceValidation = validateClusterResource(b.upserts[i], i);
        if (!resourceValidation.valid) {
          errors.push(...resourceValidation.errors);
        } else {
          const r = b.upserts[i] as Record<string, unknown>;
          upserts.push({
            namespace: r.namespace as string,
            name: r.name as string,
            kind: r.kind as string,
            apiVersion: r.apiVersion as string,
            apiGroup: r.apiGroup as string | undefined,
            labels: (r.labels as Record<string, string>) || {},
            annotations: r.annotations as Record<string, string> | undefined,
            createdAt: r.createdAt as string,
            updatedAt: r.updatedAt as string
          });
        }
      }
    }
  }

  // Validate deletes array (objects with namespace, apiVersion, kind, name)
  if (b.deletes !== undefined) {
    if (!Array.isArray(b.deletes)) {
      errors.push('deletes: must be an array');
    } else {
      for (let i = 0; i < b.deletes.length; i++) {
        const del = b.deletes[i];
        if (!del || typeof del !== 'object') {
          errors.push(`deletes[${i}]: must be an object`);
          continue;
        }
        const d = del as Record<string, unknown>;
        const delErrors: string[] = [];
        if (!d.namespace || typeof d.namespace !== 'string') {
          delErrors.push(`deletes[${i}].namespace: required string field`);
        }
        if (!d.name || typeof d.name !== 'string') {
          delErrors.push(`deletes[${i}].name: required string field`);
        }
        if (!d.kind || typeof d.kind !== 'string') {
          delErrors.push(`deletes[${i}].kind: required string field`);
        }
        if (!d.apiVersion || typeof d.apiVersion !== 'string') {
          delErrors.push(`deletes[${i}].apiVersion: required string field`);
        }
        if (delErrors.length > 0) {
          errors.push(...delErrors);
        } else {
          // Construct ID from components
          const deleteId = generateResourceId(
            d.namespace as string,
            d.apiVersion as string,
            d.kind as string,
            d.name as string
          );
          deletes.push(deleteId);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    data: { upserts, deletes, isResync }
  };
}

/**
 * Response data for successful sync operations
 */
export interface ResourceSyncResponseData {
  upserted: number;
  deleted: number;
}

/**
 * Response data for partial failures
 */
export interface ResourceSyncFailureDetails {
  upserted: number;
  deleted: number;
  failures: Array<{ id: string; error: string }>;
}

/**
 * Handle resource sync requests from the controller
 *
 * @param body - The request body containing upserts, deletes, and isResync flag
 * @param logger - Logger instance for request tracking
 * @param requestId - Unique request identifier for correlation
 * @returns RestApiResponse with sync results
 */
export async function handleResourceSync(
  body: unknown,
  logger: Logger,
  requestId: string
): Promise<RestApiResponse> {
  const startTime = Date.now();

  // Validate request body using manual validation
  const validation = validateSyncRequest(body);

  if (!validation.valid) {
    logger.warn('Resource sync request validation failed', {
      requestId,
      errors: validation.errors
    });

    return {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: validation.errors.map(e => ({
          path: e.split(':')[0] || 'unknown',
          message: e.split(':').slice(1).join(':').trim() || e
        }))
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: 'v1'
      }
    };
  }

  const syncRequest: ResourceSyncRequest = validation.data!;
  const { upserts = [], deletes = [], isResync = false } = syncRequest;

  logger.info('Processing resource sync request', {
    requestId,
    upsertCount: upserts.length,
    deleteCount: deletes.length,
    isResync
  });

  // Initialize the resource vector service
  let resourceService;
  try {
    resourceService = new ResourceVectorService();
  } catch (error) {
    logger.error('Failed to create ResourceVectorService', error as Error, { requestId });
    return {
      success: false,
      error: {
        code: 'SERVICE_INIT_FAILED',
        message: 'Failed to create resource vector service',
        details: { error: error instanceof Error ? error.message : String(error) }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: 'v1'
      }
    };
  }

  // Check Vector DB health
  let isHealthy;
  try {
    isHealthy = await resourceService.healthCheck();
  } catch (error) {
    logger.error('Health check threw exception', error as Error, { requestId });
    return {
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Vector DB health check threw exception',
        details: { error: error instanceof Error ? error.message : String(error) }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: 'v1'
      }
    };
  }

  if (!isHealthy) {
    logger.error('Vector DB health check failed', new Error('Qdrant unavailable'), { requestId });
    return {
      success: false,
      error: {
        code: 'VECTOR_DB_UNAVAILABLE',
        message: 'Vector database is not available',
        details: {
          recommendation: 'Ensure Qdrant is running and accessible'
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: 'v1'
      }
    };
  }

  // Initialize the collection (only on first request, skip thereafter for performance)
  if (!resourcesCollectionInitialized) {
    try {
      await resourceService.initialize();
      resourcesCollectionInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize resources collection', error as Error, { requestId });
      return {
        success: false,
        error: {
          code: 'COLLECTION_INIT_FAILED',
          message: 'Failed to initialize resources collection',
          details: {
            error: error instanceof Error ? error.message : String(error)
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: 'v1'
        }
      };
    }
  }

  let upserted = 0;
  let deleted = 0;
  const failures: Array<{ id: string; error: string }> = [];

  // Handle resync mode - use diffAndSync for full reconciliation
  if (isResync && upserts.length > 0) {
    logger.info('Processing resync with diff', {
      requestId,
      incomingResourceCount: upserts.length
    });

    try {
      const diffResult = await resourceService.diffAndSync(upserts as ClusterResource[]);

      logger.info('Resync diff completed', {
        requestId,
        inserted: diffResult.inserted,
        updated: diffResult.updated,
        deleted: diffResult.deleted
      });

      return {
        success: true,
        data: {
          upserted: diffResult.inserted + diffResult.updated,
          deleted: diffResult.deleted,
          resync: {
            inserted: diffResult.inserted,
            updated: diffResult.updated,
            deleted: diffResult.deleted
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: 'v1'
        }
      };
    } catch (error) {
      logger.error('Resync diff failed', error as Error, { requestId });
      return {
        success: false,
        error: {
          code: 'RESYNC_FAILED',
          message: 'Failed to perform resync diff',
          details: {
            error: error instanceof Error ? error.message : String(error)
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          version: 'v1'
        }
      };
    }
  }

  // Handle upserts - process each resource
  for (const resource of upserts) {
    const resourceId = generateResourceId(resource.namespace, resource.apiVersion, resource.kind, resource.name);
    try {
      await resourceService.upsertResource(resource);
      upserted++;

      logger.debug('Resource upserted', {
        requestId,
        resourceId,
        kind: resource.kind,
        namespace: resource.namespace
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      failures.push({ id: resourceId, error: errorMessage });

      logger.warn('Failed to upsert resource', {
        requestId,
        resourceId,
        error: errorMessage
      });
    }
  }

  // Handle deletes - idempotent (ignore not found)
  for (const id of deletes) {
    try {
      await resourceService.deleteResource(id);
      deleted++;

      logger.debug('Resource deleted', {
        requestId,
        resourceId: id
      });
    } catch (error) {
      // deleteResource is already idempotent, but handle any other errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      failures.push({ id, error: errorMessage });

      logger.warn('Failed to delete resource', {
        requestId,
        resourceId: id,
        error: errorMessage
      });
    }
  }

  const executionTime = Date.now() - startTime;

  // Return appropriate response based on failures
  if (failures.length > 0) {
    logger.warn('Resource sync completed with failures', {
      requestId,
      upserted,
      deleted,
      failureCount: failures.length,
      executionTime
    });

    return {
      success: false,
      error: {
        code: 'SYNC_PARTIAL_FAILURE',
        message: `Failed to process ${failures.length} resource(s)`,
        details: {
          upserted,
          deleted,
          failures
        } as ResourceSyncFailureDetails
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        version: 'v1'
      }
    };
  }

  logger.info('Resource sync completed successfully', {
    requestId,
    upserted,
    deleted,
    executionTime
  });

  return {
    success: true,
    data: {
      upserted,
      deleted
    } as ResourceSyncResponseData,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
      version: 'v1'
    }
  };
}
