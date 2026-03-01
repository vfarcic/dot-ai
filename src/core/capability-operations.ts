/**
 * Core Capability Operations
 *
 * Handles resource capability management operations including CRUD operations
 * and capability discovery workflow management
 */

import { Logger } from './error-handling';
import { CapabilityVectorService } from './capability-vector-service';
import { CapabilityInferenceEngine } from './capabilities';
import { getAndValidateSessionDirectory } from './session-utils';
import { VALIDATION_MESSAGES } from './constants/validation';
import * as fs from 'fs';
import * as path from 'path';

// Note: validateVectorDBConnection and validateEmbeddingService are shared utilities
// that remain in the main organizational-data.ts file as they're used by multiple domains

/**
 * Common args interface for capability operations
 */
interface CapabilityOperationArgs {
  id?: string;
  limit?: number;
  sessionId?: string;
  collection?: string;
}

/**
 * Common response structure for capability operations
 */
interface CapabilityOperationResponse {
  success: boolean;
  operation: string;
  dataType: string;
  data?: unknown;
  message?: string;
  error?: {
    message: string;
    details?: string;
    example?: Record<string, unknown>;
    alternativeFormat?: Record<string, unknown>;
    suggestion?: string;
    help?: string;
    setup?: Record<string, string>;
    sessionDirectory?: string;
  };
  deletedCapability?: { id: string; resourceName: string };
  deletedCount?: number;
  totalCount?: number;
  errorCount?: number;
  confirmation?: string;
  method?: string;
  sessionId?: string;
  status?: string;
  currentStep?: string;
  startedAt?: string;
  lastActivity?: string;
  progress?: Record<string, unknown>;
  sessionInfo?: Record<string, unknown>;
  display?: Record<string, unknown>;
  clientInstructions?: Record<string, unknown>;
}

/**
 * Get initialized capability service
 * @param collection - Collection name (default: 'capabilities')
 */
export async function getCapabilityService(
  collection?: string
): Promise<CapabilityVectorService> {
  const capabilityService = new CapabilityVectorService(collection);

  // Always ensure proper collection initialization
  try {
    await capabilityService.initialize();
  } catch (error) {
    // If initialization fails, try to provide helpful error context
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Vector DB collection initialization failed: ${errorMessage}. This may be due to dimension mismatch or collection configuration issues.`,
      { cause: error }
    );
  }

  return capabilityService;
}

/**
 * Handle capability list operation
 */
export async function handleCapabilityList(
  args: CapabilityOperationArgs,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<CapabilityOperationResponse> {
  try {
    // Get all capabilities with validated limit
    const rawLimit = Number(args.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 10;
    const capabilities = await capabilityService.getAllCapabilities(limit);
    const count = await capabilityService.getCapabilitiesCount();

    logger.info('Capabilities listed successfully', {
      requestId,
      count: capabilities.length,
      totalCount: count,
      limit,
    });

    return {
      success: true,
      operation: 'list',
      dataType: 'capabilities',
      data: {
        capabilities: capabilities.map(cap => {
          const desc =
            typeof cap.description === 'string' ? cap.description : '';
          return {
            id:
              (cap as { id?: string }).id ??
              CapabilityInferenceEngine.generateCapabilityId(cap.resourceName),
            resourceName: cap.resourceName,
            apiVersion: cap.apiVersion,
            version: cap.version,
            group: cap.group,
            capabilities: cap.capabilities,
            description: desc.length > 100 ? desc.slice(0, 100) + '...' : desc,
            complexity: cap.complexity,
            confidence: cap.confidence,
            analyzedAt: cap.analyzedAt,
          };
        }),
        totalCount: count,
        returnedCount: capabilities.length,
        limit,
      },
      message: `Retrieved ${capabilities.length} capabilities (${count} total)`,
      clientInstructions: {
        behavior:
          'Display capability list with IDs prominently visible for user reference',
        requirement:
          'Each capability must show: ID, resource name, main capabilities, and description',
        format:
          'List format with ID clearly labeled (e.g., "ID: abc123") so users can reference specific capabilities',
        prohibit:
          'Do not hide or omit capability IDs from the display - users need them for get operations',
      },
    };
  } catch (error) {
    logger.error('Failed to list capabilities', error as Error, {
      requestId,
    });

    return {
      success: false,
      operation: 'list',
      dataType: 'capabilities',
      error: {
        message: 'Failed to list capabilities',
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Handle capability get operation
 * Supports two ID formats:
 * - Hashed ID: "a1b2c3d4-..." (existing format)
 * - JSON format: '{"kind":"Deployment","apiVersion":"apps/v1"}' (new format for dashboard UI)
 */
export async function handleCapabilityGet(
  args: CapabilityOperationArgs,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<CapabilityOperationResponse> {
  try {
    // Validate required parameters
    if (!args.id) {
      return {
        success: false,
        operation: 'get',
        dataType: 'capabilities',
        error: {
          message: VALIDATION_MESSAGES.MISSING_PARAMETER('id'),
          details: 'Specify id to retrieve capability data',
          example: { id: 'capability-id-example' },
          alternativeFormat: {
            description:
              'You can also use JSON format for kind/apiVersion lookup',
            example: '{"kind":"Deployment","apiVersion":"apps/v1"}',
          },
        },
      };
    }

    let capability = null;

    // Check if id is JSON format for kind/apiVersion lookup
    if (typeof args.id === 'string' && args.id.trim().startsWith('{')) {
      try {
        const lookup = JSON.parse(args.id);
        if (!lookup.kind || !lookup.apiVersion) {
          return {
            success: false,
            operation: 'get',
            dataType: 'capabilities',
            error: {
              message: 'Invalid JSON lookup format',
              details:
                'JSON format requires both "kind" and "apiVersion" fields',
              example: { id: '{"kind":"Deployment","apiVersion":"apps/v1"}' },
            },
          };
        }

        logger.info('Looking up capability by kind/apiVersion', {
          requestId,
          kind: lookup.kind,
          apiVersion: lookup.apiVersion,
        });

        capability = await capabilityService.getCapabilityByKindApiVersion(
          lookup.kind,
          lookup.apiVersion
        );
      } catch (parseError) {
        return {
          success: false,
          operation: 'get',
          dataType: 'capabilities',
          error: {
            message: 'Invalid JSON format in id parameter',
            details:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
            example: { id: '{"kind":"Deployment","apiVersion":"apps/v1"}' },
          },
        };
      }
    } else {
      // Existing hashed ID lookup
      capability = await capabilityService.getCapability(args.id);
    }

    if (!capability) {
      logger.warn('Capability not found', {
        requestId,
        capabilityId: args.id,
      });

      return {
        success: false,
        operation: 'get',
        dataType: 'capabilities',
        error: {
          message: `Capability not found for ID: ${args.id}`,
          details: 'Resource capability may not have been scanned yet',
          suggestion: 'Use scan operation to analyze this resource first',
        },
      };
    }

    logger.info('Capability retrieved successfully', {
      requestId,
      capabilityId: args.id,
      resourceName: capability.resourceName,
      capabilitiesFound: capability.capabilities.length,
      confidence: capability.confidence,
    });

    return {
      success: true,
      operation: 'get',
      dataType: 'capabilities',
      data: capability,
      message: `Retrieved capability data for ${capability.resourceName} (ID: ${args.id})`,
      clientInstructions: {
        behavior:
          'Display comprehensive capability details in organized sections',
        requirement:
          'Show resource name, capabilities, providers, complexity, use case, and confidence prominently',
        format:
          'Structured display with clear sections: Resource Info, Capabilities, Technical Details, and Analysis Results',
        sections: {
          resourceInfo: 'Resource name and description with use case',
          capabilities:
            'List all capabilities, providers, and abstractions clearly',
          technicalDetails: 'Complexity level and provider information',
          analysisResults:
            'Confidence score, analysis timestamp, and ID for reference',
        },
      },
    };
  } catch (error) {
    logger.error('Failed to get capability', error as Error, {
      requestId,
      capabilityId: args.id,
    });

    return {
      success: false,
      operation: 'get',
      dataType: 'capabilities',
      error: {
        message: 'Failed to retrieve capability',
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Handle capability delete operation
 */
export async function handleCapabilityDelete(
  args: CapabilityOperationArgs,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<CapabilityOperationResponse> {
  try {
    // Validate required parameters
    if (!args.id) {
      return {
        success: false,
        operation: 'delete',
        dataType: 'capabilities',
        error: {
          message: VALIDATION_MESSAGES.MISSING_PARAMETER('id'),
          details: 'Specify id to delete capability data',
          example: { id: 'capability-id-example' },
        },
      };
    }

    // Check if capability exists before deletion
    const capability = await capabilityService.getCapability(args.id);

    if (!capability) {
      logger.warn('Capability not found for deletion', {
        requestId,
        capabilityId: args.id,
      });

      return {
        success: false,
        operation: 'delete',
        dataType: 'capabilities',
        error: {
          message: `Capability not found for ID: ${args.id}`,
          details: 'Cannot delete capability that does not exist',
        },
      };
    }

    // Delete capability by ID
    await capabilityService.deleteCapabilityById(args.id);

    logger.info('Capability deleted successfully', {
      requestId,
      capabilityId: args.id,
      resourceName: capability.resourceName,
    });

    return {
      success: true,
      operation: 'delete',
      dataType: 'capabilities',
      deletedCapability: {
        id: args.id,
        resourceName: capability.resourceName,
      },
      message: `Capability deleted: ${capability.resourceName}`,
    };
  } catch (error) {
    logger.error('Failed to delete capability', error as Error, {
      requestId,
      capabilityId: args.id,
    });

    return {
      success: false,
      operation: 'delete',
      dataType: 'capabilities',
      error: {
        message: 'Failed to delete capability',
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Handle capability delete all operation
 */
export async function handleCapabilityDeleteAll(
  _args: CapabilityOperationArgs,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<CapabilityOperationResponse> {
  try {
    // Get count first to provide feedback (but don't retrieve all data)
    const totalCount = await capabilityService.getCapabilitiesCount();

    if (totalCount === 0) {
      logger.info('No capabilities found to delete', { requestId });

      return {
        success: true,
        operation: 'deleteAll',
        dataType: 'capabilities',
        deletedCount: 0,
        totalCount: 0,
        message: 'No capabilities found to delete',
      };
    }

    logger.info('Starting efficient bulk capability deletion', {
      requestId,
      totalCapabilities: totalCount,
      method: 'collection recreation',
    });

    // Efficiently delete all capabilities by recreating collection
    await capabilityService.deleteAllCapabilities();

    logger.info('Bulk capability deletion completed successfully', {
      requestId,
      deleted: totalCount,
      method: 'collection recreation',
    });

    return {
      success: true,
      operation: 'deleteAll',
      dataType: 'capabilities',
      deletedCount: totalCount,
      totalCount,
      errorCount: 0,
      message: `Successfully deleted all ${totalCount} capabilities`,
      confirmation:
        'All capability data has been permanently removed from the Vector DB',
      method:
        'Efficient collection recreation (no individual record retrieval)',
    };
  } catch (error) {
    logger.error('Failed to delete all capabilities', error as Error, {
      requestId,
    });

    return {
      success: false,
      operation: 'deleteAll',
      dataType: 'capabilities',
      error: {
        message: 'Failed to delete all capabilities',
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// Types and interfaces for capability scanning workflow
interface ProgressData {
  status: 'processing' | 'completed';
  current: number;
  total: number;
  percentage: number;
  currentResource: string;
  startedAt: string;
  lastUpdated: string;
  completedAt?: string;
  estimatedTimeRemaining?: string;
  totalProcessingTime?: string;
  successfulResources: number;
  failedResources: number;
  errors: Array<{
    resource: string;
    error: string;
    index: number;
    timestamp: string;
  }>;
}

interface CapabilityScanSession {
  sessionId: string;
  currentStep:
    | 'resource-selection'
    | 'resource-specification'
    | 'processing-mode'
    | 'scanning'
    | 'complete';
  selectedResources?: string[] | 'all';
  resourceList?: string;
  processingMode?: 'auto' | 'manual';
  currentResourceIndex?: number;
  progress?: ProgressData;
  startedAt: string;
  lastActivity: string;
}

/**
 * Handle capability progress query (check progress of running scan)
 */
export async function handleCapabilityProgress(
  args: CapabilityOperationArgs,
  logger: Logger,
  requestId: string
): Promise<CapabilityOperationResponse> {
  try {
    logger.info('Capability progress query requested', {
      requestId,
      sessionId: args.sessionId,
    });

    // Get session directory first
    const sessionDir = getAndValidateSessionDirectory(false);
    let sessionId = args.sessionId;
    let sessionFilePath: string;

    // If no sessionId provided, auto-discover the latest session
    if (!sessionId) {
      logger.info('No sessionId provided, searching for latest session file', {
        requestId,
      });

      try {
        // Check if capability-sessions subdirectory exists
        const sessionSubDir = path.join(sessionDir, 'capability-sessions');
        if (!fs.existsSync(sessionSubDir)) {
          logger.info('No capability-sessions directory found', {
            requestId,
            sessionDir,
          });
          return {
            success: false,
            operation: 'progress',
            dataType: 'capabilities',
            error: {
              message: 'No capability scan sessions found',
              details:
                'No capability-sessions directory found in the session directory',
              help: 'Start a new capability scan with the scan operation first',
              sessionDirectory: sessionDir,
            },
          };
        }

        // Find all capability scan session files in the subdirectory
        const sessionFiles = fs
          .readdirSync(sessionSubDir)
          .filter(file => file.endsWith('.json'))
          .map(file => {
            const filePath = path.join(sessionSubDir, file);
            const stats = fs.statSync(filePath);
            return {
              filename: file,
              path: filePath,
              mtime: stats.mtime,
              sessionId: file.replace('.json', ''), // Remove .json extension to get sessionId
            };
          })
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Sort by newest first

        if (sessionFiles.length === 0) {
          logger.info('No capability scan session files found', {
            requestId,
            sessionDir,
          });
          return {
            success: false,
            operation: 'progress',
            dataType: 'capabilities',
            error: {
              message: 'No capability scan sessions found',
              details:
                'No active or recent capability scans found in the session directory',
              help: 'Start a new capability scan with the scan operation first',
              sessionDirectory: sessionDir,
            },
          };
        }

        // Use the latest session (first after sorting)
        const latestSession = sessionFiles[0];
        sessionId = latestSession.sessionId;
        sessionFilePath = latestSession.path;

        logger.info('Using latest session file', {
          requestId,
          sessionId,
          totalSessions: sessionFiles.length,
          sessionFile: latestSession.filename,
        });
      } catch (error) {
        logger.error('Failed to discover session files', error as Error, {
          requestId,
          sessionDir,
        });
        return {
          success: false,
          operation: 'progress',
          dataType: 'capabilities',
          error: {
            message: 'Failed to discover session files',
            details: error instanceof Error ? error.message : String(error),
            sessionDirectory: sessionDir,
          },
        };
      }
    } else {
      // Use provided sessionId - look in capability-sessions subdirectory
      const sessionSubDir = path.join(sessionDir, 'capability-sessions');
      sessionFilePath = path.join(sessionSubDir, `${sessionId}.json`);

      if (!fs.existsSync(sessionFilePath)) {
        logger.warn('Session file not found for provided sessionId', {
          requestId,
          sessionId,
          filePath: sessionFilePath,
        });

        return {
          success: false,
          operation: 'progress',
          dataType: 'capabilities',
          error: {
            message: 'Session not found',
            details: `No capability scan found for session: ${sessionId}`,
            help: 'Use the scan operation to start a new capability scan, or omit sessionId to use the latest session',
          },
        };
      }
    }

    // Read and parse session file
    const sessionData = JSON.parse(
      fs.readFileSync(sessionFilePath, 'utf8')
    ) as CapabilityScanSession;

    // Extract progress information
    const progress = sessionData.progress;
    if (!progress) {
      return {
        success: true,
        operation: 'progress',
        dataType: 'capabilities',
        sessionId: sessionId,
        status: 'no-progress-data',
        message: 'Session exists but no progress tracking is active',
        currentStep: sessionData.currentStep,
        startedAt: sessionData.startedAt,
        lastActivity: sessionData.lastActivity,
      };
    }

    // Build comprehensive progress response
    const response: CapabilityOperationResponse = {
      success: true,
      operation: 'progress',
      dataType: 'capabilities',
      sessionId: sessionId,
      progress: {
        status: progress.status,
        current: progress.current,
        total: progress.total,
        percentage: progress.percentage,
        currentResource: progress.currentResource,
        startedAt: progress.startedAt,
        lastUpdated: progress.lastUpdated,
      },
      sessionInfo: {
        currentStep: sessionData.currentStep,
        processingMode: sessionData.processingMode,
        resourceCount: Array.isArray(sessionData.selectedResources)
          ? sessionData.selectedResources.length
          : sessionData.selectedResources === 'all'
            ? 'all resources'
            : 'unknown',
        startedAt: sessionData.startedAt,
        lastActivity: sessionData.lastActivity,
      },
    };

    // Add completion information if scan is done
    if (progress.status === 'completed') {
      response.progress!.completedAt = progress.completedAt;
      response.progress!.totalProcessingTime = progress.totalProcessingTime;
      response.message = 'Capability scan completed successfully';
    } else {
      response.progress!.estimatedTimeRemaining =
        progress.estimatedTimeRemaining;
      response.message = `Capability scan in progress: ${progress.current}/${progress.total} resources processed`;
    }

    // Add user-friendly display information with client formatting instructions
    response.display = {
      summary:
        progress.status === 'completed'
          ? `✅ Scan complete: processed ${progress.total} resources in ${progress.totalProcessingTime}`
          : `⏳ Processing: ${progress.current}/${progress.total} (${progress.percentage}%) - ${progress.estimatedTimeRemaining} remaining`,
      currentResource: progress.currentResource,
      timeline: {
        started: progress.startedAt,
        lastUpdate: progress.lastUpdated,
        ...(progress.completedAt && { completed: progress.completedAt }),
      },
    };

    // Add client instructions for readable formatting
    response.clientInstructions = {
      behavior: 'Display capability scan progress in a clean, readable format',
      requirement:
        'Show progress information in separate lines, not as a single condensed line',
      format:
        progress.status === 'completed'
          ? 'Completion format: Status, total processed, processing time on separate lines'
          : 'Progress format: Status line, current resource line, time estimates line, timestamps line',
      example:
        progress.status === 'completed'
          ? '✅ Capability Scan Complete\n📊 Processed: X resources\n⏰ Processing time: X minutes'
          : '⏳ Progress: X/Y resources (Z%)\n📊 Current resource: ResourceName\n⏰ Est. remaining: X minutes\n🕒 Started: timestamp\n🔄 Last updated: timestamp',
      prohibit: 'Do not display all progress information on a single line',
    };

    logger.info('Progress query completed successfully', {
      requestId,
      sessionId: args.sessionId,
      status: progress.status,
      percentage: progress.percentage,
    });

    return response;
  } catch (error) {
    logger.error('Failed to query capability progress', error as Error, {
      requestId,
      sessionId: args.sessionId,
    });

    return {
      success: false,
      operation: 'progress',
      dataType: 'capabilities',
      error: {
        message: 'Failed to query scan progress',
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Handle capability search operation
 */
export async function handleCapabilitySearch(
  args: CapabilityOperationArgs,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<CapabilityOperationResponse> {
  try {
    // Validate required search query (stored in id field)
    if (!args.id || typeof args.id !== 'string' || args.id.trim() === '') {
      return {
        success: false,
        operation: 'search',
        dataType: 'capabilities',
        error: {
          message: 'Search query required',
          details:
            'The id field must contain a search query (e.g., "postgresql database in azure")',
        },
      };
    }

    const searchQuery = args.id.trim();
    const limit = args.limit || 25;

    logger.info('Searching capabilities', {
      requestId,
      query: searchQuery,
      limit,
    });

    // Perform the search using existing service
    const searchResults = await capabilityService.searchCapabilities(
      searchQuery,
      { limit }
    );

    // Format results for user display
    const formattedResults = searchResults.map((result, index) => ({
      rank: index + 1,
      score: Math.round(result.score * 100) / 100, // Round to 2 decimal places
      id: CapabilityInferenceEngine.generateCapabilityId(
        result.data.resourceName
      ),
      resourceName: result.data.resourceName,
      capabilities: result.data.capabilities,
      providers: result.data.providers,
      complexity: result.data.complexity,
      description: result.data.description,
      useCase: result.data.useCase,
      confidence: result.data.confidence,
      analyzedAt: result.data.analyzedAt,
    }));

    logger.info('Capability search completed', {
      requestId,
      query: searchQuery,
      resultsFound: searchResults.length,
      limit,
    });

    return {
      success: true,
      operation: 'search',
      dataType: 'capabilities',
      data: {
        query: searchQuery,
        results: formattedResults,
        resultCount: searchResults.length,
        limit,
      },
      message: `Found ${searchResults.length} capabilities matching "${searchQuery}"`,
      clientInstructions: {
        behavior:
          'Display search results with relevance scores and capability details',
        sections: {
          searchSummary: 'Show query and result count prominently',
          resultsList:
            'Display each result with rank, score, resource name, and capabilities',
          capabilityDetails:
            'Include providers, complexity, and description for context',
          actionGuidance:
            'Show IDs for get operations and suggest refinement if needed',
        },
        format: 'Ranked list with scores (higher scores = better matches)',
        emphasize: 'Resource names and main capabilities for easy scanning',
      },
    };
  } catch (error) {
    logger.error('Failed to search capabilities', error as Error, {
      requestId,
      query: args.id,
    });

    return {
      success: false,
      operation: 'search',
      dataType: 'capabilities',
      error: {
        message: 'Capability search failed',
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Consolidated CRUD operations handler with service initialization
 * Handles list, get, search, delete, deleteAll operations with proper Vector DB setup
 */
export async function handleCapabilityCRUD(
  operation: string,
  args: CapabilityOperationArgs,
  logger: Logger,
  requestId: string
): Promise<CapabilityOperationResponse> {
  // Create capability service for CRUD operations
  // Use collection from args if provided, otherwise defaults to 'capabilities'
  const capabilityService = new CapabilityVectorService(args.collection);
  const isReadOperation = ['list', 'get', 'search'].includes(operation);

  try {
    const vectorDBHealthy = await capabilityService.healthCheck();
    if (!vectorDBHealthy) {
      return {
        success: false,
        operation,
        dataType: 'capabilities',
        error: {
          message: 'Vector DB (Qdrant) connection required',
          details: 'Capability operations require a working Qdrant connection.',
          setup: {
            docker: 'docker run -p 6333:6333 qdrant/qdrant',
            config: 'export QDRANT_URL=http://localhost:6333',
          },
        },
      };
    }

    // For read operations, check if collection exists without creating it
    // For write operations, initialize (create if needed)
    if (isReadOperation) {
      const exists = await capabilityService.collectionExists();
      if (!exists) {
        // Return empty results for read operations on non-existent collection
        if (operation === 'list') {
          return {
            success: true,
            operation: 'list',
            dataType: 'capabilities',
            data: { capabilities: [], totalCount: 0, returnedCount: 0 },
            message: 'No capabilities found (collection not initialized)',
          };
        } else if (operation === 'get') {
          return {
            success: false,
            operation: 'get',
            dataType: 'capabilities',
            error: { message: 'Capability not found' },
          };
        } else if (operation === 'search') {
          return {
            success: true,
            operation: 'search',
            dataType: 'capabilities',
            data: { query: args.id, results: [], resultCount: 0 },
            message: 'No capabilities found (collection not initialized)',
          };
        }
      }
    } else {
      await capabilityService.initialize();
    }

    // Route to specific CRUD operation
    switch (operation) {
      case 'list':
        return await handleCapabilityList(
          args,
          logger,
          requestId,
          capabilityService
        );
      case 'get':
        return await handleCapabilityGet(
          args,
          logger,
          requestId,
          capabilityService
        );
      case 'search':
        return await handleCapabilitySearch(
          args,
          logger,
          requestId,
          capabilityService
        );
      case 'delete':
        return await handleCapabilityDelete(
          args,
          logger,
          requestId,
          capabilityService
        );
      case 'deleteAll':
        return await handleCapabilityDeleteAll(
          args,
          logger,
          requestId,
          capabilityService
        );
      default:
        throw new Error(`Unexpected CRUD operation: ${operation}`);
    }
  } catch (error) {
    logger.error(`Capability ${operation} operation failed`, error as Error, {
      requestId,
    });
    return {
      success: false,
      operation,
      dataType: 'capabilities',
      error: {
        message: `Capability ${operation} failed`,
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
