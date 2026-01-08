/**
 * Core Pattern Operations
 * 
 * Complete operations for creating, validating, and managing organizational patterns
 * Handles workflow management, Vector DB operations, and MCP routing
 */

import { OrganizationalPattern, CreatePatternRequest } from './pattern-types';
import { randomUUID } from 'crypto';
import { ErrorHandler, ErrorCategory, ErrorSeverity, Logger } from './error-handling';
import { AI_SERVICE_ERROR_TEMPLATES } from './constants';
import { UnifiedCreationSessionManager } from './unified-creation-session';
import { VectorDBService, PatternVectorService } from './index';
import { getAndValidateSessionDirectory } from './session-utils';
import * as fs from 'fs';
import * as path from 'path';

// Note: validateVectorDBConnection and validateEmbeddingService are shared utilities
// that remain in the main organizational-data.ts file as they're used by multiple domains

// Simple validation function
export function validatePattern(request: CreatePatternRequest): string[] {
  const errors: string[] = [];

  if (!request.description || request.description.trim().length === 0) {
    errors.push('Pattern description is required');
  }

  if (!request.triggers || request.triggers.length === 0) {
    errors.push('At least one trigger is required');
  }
  if (request.triggers && request.triggers.some(t => !t || t.trim().length === 0)) {
    errors.push('All triggers must be non-empty');
  }

  if (!request.suggestedResources || request.suggestedResources.length === 0) {
    errors.push('At least one suggested resource is required');
  }

  if (!request.rationale || request.rationale.trim().length === 0) {
    errors.push('Pattern rationale is required');
  }

  if (!request.createdBy || request.createdBy.trim().length === 0) {
    errors.push('Pattern creator is required');
  }

  return errors;
}

// Create a new pattern from request
export function createPattern(request: CreatePatternRequest): OrganizationalPattern {
  // Pre-process request to clean up data before validation
  const cleanRequest = {
    ...request,
    description: request.description?.trim() || '',
    triggers: request.triggers?.map(t => t?.trim()).filter(t => t && t.length > 0) || [],
    rationale: request.rationale?.trim() || '',
    createdBy: request.createdBy?.trim() || ''
  };

  const errors = validatePattern(cleanRequest);
  if (errors.length > 0) {
    throw new Error(`Pattern validation failed: ${errors.join(', ')}`);
  }

  return {
    id: randomUUID(),
    description: cleanRequest.description,
    triggers: cleanRequest.triggers,
    suggestedResources: cleanRequest.suggestedResources,
    rationale: cleanRequest.rationale,
    createdAt: new Date().toISOString(),
    createdBy: cleanRequest.createdBy
  };
}

// Serialize pattern to JSON
export function serializePattern(pattern: OrganizationalPattern): string {
  return JSON.stringify(pattern, null, 2);
}

// Deserialize pattern from JSON
export function deserializePattern(json: string): OrganizationalPattern {
  const parsed = JSON.parse(json);
  
  // Basic structure validation
  if (!parsed.id || !parsed.description || 
      !Array.isArray(parsed.triggers) || !Array.isArray(parsed.suggestedResources) ||
      !parsed.rationale || !parsed.createdAt || !parsed.createdBy) {
    throw new Error('Invalid pattern JSON structure');
  }

  return parsed as OrganizationalPattern;
}

/**
 * Get Vector DB-based pattern service with optional embedding support
 */
async function getPatternService(): Promise<PatternVectorService> {
  const patternService = new PatternVectorService();
  
  // Always ensure proper collection initialization
  try {
    await patternService.initialize();
    return patternService;
  } catch (error) {
    // If initialization fails, return service anyway - health check will catch connection issues
    return patternService;
  }
}

/**
 * Handle pattern operations with workflow support
 * Shared validation functions are passed as parameters to avoid circular dependencies
 */
export async function handlePatternOperation(
  operation: string,
  args: any,
  logger: Logger,
  requestId: string,
  validateVectorDBConnection: (vectorService: PatternVectorService, logger: Logger, requestId: string) => Promise<{ success: boolean; error?: any }>,
  validateEmbeddingService: (logger: Logger, requestId: string) => Promise<{ success: boolean; error?: any }>
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

  // Validate embedding service and fail if unavailable (except for operations that don't need embeddings)
  const operationsRequiringEmbedding = ['create', 'search'];
  if (operationsRequiringEmbedding.includes(operation)) {
    const embeddingCheck = await validateEmbeddingService(logger, requestId);
    
    if (!embeddingCheck.success) {
      return {
        success: false,
        operation,
        dataType: 'pattern',
        error: embeddingCheck.error,
        message: AI_SERVICE_ERROR_TEMPLATES.OPENAI_KEY_REQUIRED('pattern management')
      };
    }
  }

  const sessionManager = new UnifiedCreationSessionManager('pattern');

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
          const updatedSession = sessionManager.processResponse(args.sessionId, args.response, args);
          workflowStep = await sessionManager.getNextWorkflowStep(updatedSession, args);
        } else {
          // Just get current step without processing response
          const session = sessionManager.loadSession(args.sessionId, args);
          if (!session) {
            throw ErrorHandler.createError(
              ErrorCategory.VALIDATION,
              ErrorSeverity.HIGH,
              `Session not found: ${args.sessionId}`,
              {
                operation: 'pattern_workflow_continue',
                component: 'OrganizationalDataTool',
                requestId,
                input: { sessionId: args.sessionId }
              }
            );
          }
          workflowStep = await sessionManager.getNextWorkflowStep(session, args);
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
        workflowStep = await sessionManager.getNextWorkflowStep(session, args);
        
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
      
      const isComplete = !('nextStep' in workflowStep) || !workflowStep.nextStep; // Complete when no next step
      const hasPattern = !!workflowStep.data?.pattern;
      
      logger.info('Checking workflow completion', {
        requestId,
        nextStep: ('nextStep' in workflowStep) ? workflowStep.nextStep : 'complete',
        hasPattern,
        patternId: workflowStep.data?.pattern?.id
      });
      
      if (isComplete && hasPattern) {
        try {
          await patternService.storePattern(workflowStep.data.pattern);
          const vectorDBConfig = new VectorDBService({ collectionName: 'patterns' }).getConfig();
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
            const sessionDir = getAndValidateSessionDirectory(false);
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
          const vectorDBConfig = new VectorDBService({ collectionName: 'patterns' }).getConfig();
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
      const storageSucceeded = storageInfo.stored === true;
      const operationSucceeded = !isComplete || storageSucceeded;

      return {
        success: operationSucceeded,
        operation: 'create',
        dataType: 'pattern',
        workflow: workflowStep,
        storage: storageInfo,
        message: isComplete ?
          (storageSucceeded ? `Pattern created successfully` : `Pattern creation failed: ${storageInfo.error}`) :
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

    case 'search': {
      if (!args.id) { // For search, 'id' parameter contains the search query
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'Search query is required for pattern search operation',
          {
            operation: 'pattern_search_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: args
          }
        );
      }

      const searchQuery = args.id;
      const limit = args.limit || 10;

      logger.info('Searching patterns', { 
        requestId, 
        query: searchQuery,
        limit 
      });

      const searchResults = await patternService.searchPatterns(searchQuery, { limit });

      logger.info('Pattern search completed', { 
        requestId, 
        query: searchQuery,
        resultsCount: searchResults.length 
      });

      return {
        success: true,
        operation: 'search',
        dataType: 'pattern',
        data: {
          query: searchQuery,
          patterns: searchResults.map(result => ({
            id: result.data.id,
            description: result.data.description.substring(0, 100) + (result.data.description.length > 100 ? '...' : ''),
            triggersCount: result.data.triggers.length,
            resourcesCount: result.data.suggestedResources.length,
            createdAt: result.data.createdAt,
            createdBy: result.data.createdBy,
            relevanceScore: result.score
          })),
          totalCount: searchResults.length,
          returnedCount: searchResults.length,
          limit
        },
        message: `Found ${searchResults.length} patterns matching "${searchQuery}"`
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
          input: { operation, supportedOperations: ['create', 'list', 'get', 'delete', 'search'] }
        }
      );
  }
}