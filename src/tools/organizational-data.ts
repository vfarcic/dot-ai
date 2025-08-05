/**
 * Organizational Data Management Tool
 * 
 * Unified MCP tool for managing organizational knowledge: deployment patterns,
 * governance policies, AI memory, and other institutional data.
 * 
 * Currently implements: patterns
 * Future: policies, memory, config
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
// Import only what we need - other imports removed as they're no longer used with Vector DB
import { PatternCreationSessionManager } from '../core/pattern-creation-session';
import { VectorDBService, PatternVectorService, EmbeddingService } from '../core/index';
import { getAndValidateSessionDirectory } from '../core/session-utils';
import * as fs from 'fs';
import * as path from 'path';

// Tool metadata for MCP registration
export const ORGANIZATIONAL_DATA_TOOL_NAME = 'manageOrgData';
export const ORGANIZATIONAL_DATA_TOOL_DESCRIPTION = 'Unified tool for managing cluster data: organizational patterns (available now), resource capabilities (PRD #48), and resource dependencies (PRD #49). For patterns: supports step-by-step creation workflow. For capabilities/dependencies: returns implementation status. Use dataType parameter to specify what to manage: "pattern" for organizational patterns, "capabilities" for resource capabilities, "dependencies" for resource dependencies.';

// Extensible schema - supports patterns, capabilities, and dependencies
export const ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA = {
  dataType: z.enum(['pattern', 'capabilities', 'dependencies']).describe('Type of cluster data to manage: pattern (organizational patterns), capabilities (resource capabilities), dependencies (resource dependencies)'),
  operation: z.enum(['create', 'list', 'get', 'delete', 'scan', 'analyze']).describe('Operation to perform on the cluster data'),
  
  // Workflow fields for step-by-step pattern creation
  sessionId: z.string().optional().describe('Pattern creation session ID (for continuing multi-step workflow)'),
  response: z.string().optional().describe('User response to previous workflow step question'),
  
  // Generic fields for get/delete operations
  id: z.string().optional().describe('Data item ID (required for get/delete operations)'),
  
  // Generic fields for list operations
  limit: z.number().optional().describe('Maximum number of items to return (default: 10)'),
  
  // Resource-specific fields (for capabilities and dependencies)
  resource: z.object({
    kind: z.string(),
    group: z.string(),
    apiVersion: z.string()
  }).optional().describe('Kubernetes resource reference (for capabilities/dependencies operations)')
};

/**
 * Get Vector DB-based pattern service with optional embedding support
 */
async function getPatternService(): Promise<PatternVectorService> {
  const vectorDB = new VectorDBService();
  const embeddingService = new EmbeddingService(); // Optional - gracefully handles missing API keys
  const patternService = new PatternVectorService(vectorDB, embeddingService);
  
  // Always ensure proper collection initialization
  try {
    await patternService.initialize();
  } catch (error) {
    // If initialization fails, try to provide helpful error context
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Vector DB collection initialization failed: ${errorMessage}. This may be due to dimension mismatch or collection configuration issues.`);
  }
  
  return patternService;
}

/**
 * Validate Vector DB connection and return helpful error if unavailable
 */
async function validateVectorDBConnection(
  patternService: PatternVectorService,
  logger: Logger,
  requestId: string
): Promise<{ success: boolean; error?: any }> {
  const isHealthy = await patternService.healthCheck();
  
  if (!isHealthy) {
    logger.warn('Vector DB connection not available', { requestId });
    
    return {
      success: false,
      error: {
        message: 'Vector DB connection required for pattern management',
        details: 'Pattern management requires a Qdrant Vector Database connection to store and search organizational patterns.',
        setup: {
          selfHosted: {
            docker: 'docker run -d -p 6333:6333 --name qdrant qdrant/qdrant',
            environment: 'export QDRANT_URL=http://localhost:6333'
          },
          saas: {
            signup: 'Sign up at https://cloud.qdrant.io',
            environment: [
              'export QDRANT_URL=https://your-cluster.aws.cloud.qdrant.io:6333',
              'export QDRANT_API_KEY=your-api-key-from-dashboard'
            ]
          },
          docs: 'See documentation for detailed setup instructions'
        },
        currentConfig: {
          QDRANT_URL: process.env.QDRANT_URL || 'not set (defaults to http://localhost:6333)',
          QDRANT_API_KEY: process.env.QDRANT_API_KEY ? 'set' : 'not set (optional)'
        }
      }
    };
  }
  
  return { success: true };
}

/**
 * Validate embedding service configuration and fail if unavailable
 */
async function validateEmbeddingService(
  logger: Logger,
  requestId: string
): Promise<{ success: boolean; error?: any }> {
  const { EmbeddingService } = await import('../core/embedding-service');
  const embeddingService = new EmbeddingService();
  const status = embeddingService.getStatus();
  
  if (!status.available) {
    logger.warn('Embedding service required but not available', { 
      requestId, 
      reason: status.reason 
    });
    
    return {
      success: false,
      error: {
        message: 'OpenAI API key required for pattern management',
        details: 'Pattern management requires OpenAI embeddings for semantic search and storage. The system cannot proceed without proper configuration.',
        reason: status.reason,
        setup: {
          required: 'export OPENAI_API_KEY=your-openai-api-key',
          optional: [
            'export OPENAI_MODEL=text-embedding-3-small (default)',
            'export OPENAI_DIMENSIONS=1536 (default)'
          ],
          docs: 'Get API key from https://platform.openai.com/api-keys'
        },
        currentConfig: {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'set' : 'not set',
          QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
          status: 'embedding service unavailable'
        }
      }
    };
  }
  
  logger.info('Embedding service available', { 
    requestId, 
    provider: status.provider,
    model: status.model,
    dimensions: status.dimensions
  });
  
  return { success: true };
}

/**
 * Handle pattern operations with workflow support
 */
async function handlePatternOperation(
  operation: string,
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  // Get pattern service and validate Vector DB connection
  const patternService = await getPatternService();
  const connectionCheck = await validateVectorDBConnection(patternService, logger, requestId);
  
  if (!connectionCheck.success) {
    return {
      success: false,
      operation,
      dataType: 'pattern',
      error: connectionCheck.error,
      message: 'Vector DB connection required for pattern management'
    };
  }

  // Validate embedding service and fail if unavailable
  const embeddingCheck = await validateEmbeddingService(logger, requestId);
  
  if (!embeddingCheck.success) {
    return {
      success: false,
      operation,
      dataType: 'pattern',
      error: embeddingCheck.error,
      message: 'OpenAI API key required for pattern management'
    };
  }

  const sessionManager = new PatternCreationSessionManager();

  switch (operation) {
    case 'create': {
      let workflowStep;
      
      if (args.sessionId) {
        // Continue existing session
        logger.info('Continuing pattern creation workflow', { 
          requestId, 
          sessionId: args.sessionId 
        });
        
        if (args.response) {
          // Process user response and move to next step
          workflowStep = sessionManager.processResponse(args.sessionId, args.response, args);
        } else {
          // Just get current step without processing response
          workflowStep = sessionManager.getNextStep(args.sessionId, args);
        }
        
        if (!workflowStep) {
          throw ErrorHandler.createError(
            ErrorCategory.VALIDATION,
            ErrorSeverity.HIGH,
            `Session not found or workflow failed`,
            {
              operation: 'pattern_workflow_continue',
              component: 'OrganizationalDataTool',
              requestId,
              input: { sessionId: args.sessionId }
            }
          );
        }
      } else {
        // Start new workflow session
        logger.info('Starting new pattern creation workflow', { requestId });
        
        const session = sessionManager.createSession(args);
        workflowStep = sessionManager.getNextStep(session.sessionId, args);
        
        if (!workflowStep) {
          throw ErrorHandler.createError(
            ErrorCategory.OPERATION,
            ErrorSeverity.HIGH,
            `Failed to start pattern creation workflow`,
            {
              operation: 'pattern_workflow_start',
              component: 'OrganizationalDataTool',
              requestId
            }
          );
        }
      }
      
      // Always check if workflow is complete and store pattern in Vector DB
      let storageInfo: any = {};
      
      logger.info('Checking workflow completion', {
        requestId,
        step: workflowStep.step,
        hasPattern: !!workflowStep.data?.pattern,
        patternId: workflowStep.data?.pattern?.id
      });
      
      if (workflowStep.step === 'complete' && workflowStep.data?.pattern) {
        try {
          await patternService.storePattern(workflowStep.data.pattern);
          const vectorDBConfig = new VectorDBService().getConfig();
          storageInfo = {
            stored: true,
            vectorDbUrl: vectorDBConfig.url,
            collectionName: vectorDBConfig.collectionName,
            patternId: workflowStep.data.pattern.id
          };
          logger.info('Pattern stored in Vector DB successfully', { 
            requestId, 
            patternId: workflowStep.data.pattern.id,
            vectorDbUrl: vectorDBConfig.url
          });

          // Clean up session file after successful Vector DB storage
          try {
            const sessionDir = getAndValidateSessionDirectory(args, false);
            const sessionFile = path.join(sessionDir, 'pattern-sessions', `${workflowStep.sessionId}.json`);
            if (fs.existsSync(sessionFile)) {
              fs.unlinkSync(sessionFile);
              logger.info('Session file cleaned up after successful pattern storage', { 
                requestId, 
                sessionId: workflowStep.sessionId,
                sessionFile 
              });
            }
          } catch (cleanupError) {
            // Log cleanup failure but don't fail the operation
            logger.warn('Failed to cleanup session file after pattern storage', { 
              requestId, 
              sessionId: workflowStep.sessionId,
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const vectorDBConfig = new VectorDBService().getConfig();
          storageInfo = {
            stored: false,
            error: errorMessage,
            vectorDbUrl: vectorDBConfig.url,
            collectionName: vectorDBConfig.collectionName,
            patternId: workflowStep.data.pattern.id
          };
          logger.error('Failed to store pattern in Vector DB', error as Error, { 
            requestId, 
            patternId: workflowStep.data.pattern.id,
            error: errorMessage
          });
        }
      }
      
      // For completed patterns, storage failure means creation failure
      const isComplete = workflowStep.step === 'complete';
      const storageSucceeded = storageInfo.stored === true;
      const operationSucceeded = !isComplete || storageSucceeded;

      return {
        success: operationSucceeded,
        operation: 'create',
        dataType: 'pattern',
        workflow: workflowStep,
        storage: storageInfo,
        message: isComplete ? 
          (storageSucceeded ? 'Pattern created successfully' : `Pattern creation failed: ${storageInfo.error}`) : 
          'Workflow step ready'
      };
    }

    case 'list': {
      const limit = args.limit || 10;
      const patterns = await patternService.getAllPatterns();
      const totalCount = await patternService.getPatternsCount();
      const searchMode = patternService.getSearchMode();

      // Apply limit client-side (Vector DB returns all, we slice)
      const limitedPatterns = patterns.slice(0, limit);

      logger.info('Patterns listed successfully', { 
        requestId, 
        returnedCount: limitedPatterns.length,
        totalCount,
        limit,
        searchMode: searchMode.semantic ? 'semantic+keyword' : 'keyword-only'
      });

      return {
        success: true,
        operation: 'list',
        dataType: 'pattern',
        data: {
          patterns: limitedPatterns.map(p => ({
            id: p.id,
            description: p.description.substring(0, 100) + (p.description.length > 100 ? '...' : ''),
            triggersCount: p.triggers.length,
            resourcesCount: p.suggestedResources.length,
            createdAt: p.createdAt,
            createdBy: p.createdBy
          })),
          totalCount,
          returnedCount: limitedPatterns.length,
          limit,
          searchCapabilities: {
            semantic: searchMode.semantic,
            provider: searchMode.provider,
            mode: searchMode.semantic ? 'semantic+keyword hybrid search' : 'keyword-only search',
            note: searchMode.reason || (searchMode.semantic ? 'Full semantic search enabled' : undefined)
          }
        },
        message: `Found ${limitedPatterns.length} of ${totalCount} total patterns. Search mode: ${searchMode.semantic ? 'semantic+keyword' : 'keyword-only'}`
      };
    }

    case 'get': {
      if (!args.id) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'Pattern ID is required for get operation',
          {
            operation: 'pattern_get_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: args
          }
        );
      }

      const pattern = await patternService.getPattern(args.id);
      
      if (!pattern) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          `Pattern not found with ID: ${args.id}`,
          {
            operation: 'pattern_get',
            component: 'OrganizationalDataTool',
            requestId,
            input: { id: args.id }
          }
        );
      }

      logger.info('Pattern retrieved successfully', { 
        requestId, 
        patternId: pattern.id,
        description: pattern.description.substring(0, 50) + (pattern.description.length > 50 ? '...' : '')
      });

      return {
        success: true,
        operation: 'get',
        dataType: 'pattern',
        data: pattern,
        message: `Retrieved pattern: ${pattern.description.substring(0, 50)}${pattern.description.length > 50 ? '...' : ''}`
      };
    }

    case 'delete': {
      if (!args.id) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'Pattern ID is required for delete operation',
          {
            operation: 'pattern_delete_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: args
          }
        );
      }

      // Get pattern info before deletion for logging
      const pattern = await patternService.getPattern(args.id);
      
      if (!pattern) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          `Pattern not found with ID: ${args.id}`,
          {
            operation: 'pattern_delete',
            component: 'OrganizationalDataTool',
            requestId,
            input: { id: args.id }
          }
        );
      }

      await patternService.deletePattern(args.id);

      logger.info('Pattern deleted successfully', { 
        requestId, 
        patternId: args.id,
        description: pattern.description.substring(0, 50) + (pattern.description.length > 50 ? '...' : '')
      });

      return {
        success: true,
        operation: 'delete',
        dataType: 'pattern',
        data: { id: args.id },
        message: `Pattern deleted successfully: ${args.id}`
      };
    }

    default:
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        `Unsupported pattern operation: ${operation}`,
        {
          operation: 'pattern_operation_validation',
          component: 'OrganizationalDataTool',
          requestId,
          input: { operation, supportedOperations: ['create', 'list', 'get', 'delete'] }
        }
      );
  }
}

/**
 * Handle capabilities operations (placeholder for PRD #48)
 */
async function handleCapabilitiesOperation(
  operation: string,
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  logger.info('Capabilities operation requested', { requestId, operation });
  
  return {
    success: false,
    operation,
    dataType: 'capabilities',
    error: {
      message: 'Resource capabilities management not yet implemented',
      details: 'This feature is planned for PRD #48 - Resource Capabilities Discovery & Integration',
      status: 'coming-soon',
      implementationPlan: {
        prd: 'PRD #48',
        description: 'Kubernetes resource capability discovery and semantic matching',
        expectedFeatures: [
          'Cluster resource scanning',
          'Capability inference from schemas', 
          'Semantic resource matching',
          'Vector DB storage and search'
        ]
      }
    },
    message: 'Capabilities management will be available after PRD #48 implementation'
  };
}

/**
 * Handle dependencies operations (placeholder for PRD #49)
 */
async function handleDependenciesOperation(
  operation: string,
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  logger.info('Dependencies operation requested', { requestId, operation });
  
  return {
    success: false,
    operation,
    dataType: 'dependencies',
    error: {
      message: 'Resource dependencies management not yet implemented',
      details: 'This feature is planned for PRD #49 - Resource Dependencies Discovery & Integration',
      status: 'coming-soon',
      implementationPlan: {
        prd: 'PRD #49', 
        description: 'Resource dependency discovery and complete solution assembly',
        expectedFeatures: [
          'Dependency relationship discovery',
          'Complete solution assembly',
          'Deployment order optimization',
          'Vector DB storage and search'
        ]
      }
    },
    message: 'Dependencies management will be available after PRD #49 implementation'
  };
}

/**
 * Main tool handler - routes to appropriate data type handler
 */
export async function handleOrganizationalDataTool(
  args: any,
  _dotAI: DotAI | null,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Processing organizational-data tool request', { 
      requestId, 
      dataType: args.dataType,
      operation: args.operation
    });

    // Validate required parameters
    if (!args.dataType) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        'dataType parameter is required',
        {
          operation: 'organizational_data_validation',
          component: 'OrganizationalDataTool',
          requestId,
          input: args
        }
      );
    }

    if (!args.operation) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        'operation parameter is required',
        {
          operation: 'organizational_data_validation',
          component: 'OrganizationalDataTool',
          requestId,
          input: args
        }
      );
    }

    // Route to appropriate handler based on data type
    let result;
    switch (args.dataType) {
      case 'pattern':
        result = await handlePatternOperation(args.operation, args, logger, requestId);
        break;
      
      case 'capabilities':
        result = await handleCapabilitiesOperation(args.operation, args, logger, requestId);
        break;
        
      case 'dependencies':
        result = await handleDependenciesOperation(args.operation, args, logger, requestId);
        break;
      
      default:
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Unsupported data type: ${args.dataType}. Currently supported: pattern, capabilities, dependencies`,
          {
            operation: 'data_type_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: { dataType: args.dataType, supportedTypes: ['pattern', 'capabilities', 'dependencies'] }
          }
        );
    }

    logger.info('Organizational-data tool request completed successfully', { 
      requestId, 
      dataType: args.dataType,
      operation: args.operation,
      success: result.success
    });

    // Return consistent MCP response format
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2)
      }]
    };

  } catch (error) {
    logger.error('Organizational-data tool request failed', error as Error);

    // Handle errors consistently
    if (error instanceof Error && 'category' in error) {
      // Already an AppError, format for MCP response
      const appError = error as any;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: {
              message: appError.message,
              category: appError.category,
              severity: appError.severity,
              code: appError.code
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    }

    // Generic error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: {
            message: errorMessage,
            category: 'OPERATION',
            severity: 'HIGH'
          },
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
}