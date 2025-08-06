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
import { VectorDBService, PatternVectorService, CapabilityVectorService, EmbeddingService } from '../core/index';
import { getAndValidateSessionDirectory } from '../core/session-utils';
import * as fs from 'fs';
import * as path from 'path';

// Tool metadata for MCP registration
export const ORGANIZATIONAL_DATA_TOOL_NAME = 'manageOrgData';
export const ORGANIZATIONAL_DATA_TOOL_DESCRIPTION = 'Unified tool for managing cluster data: organizational patterns and resource capabilities. For patterns: supports step-by-step creation workflow. For capabilities: supports scan, list, get, delete, deleteAll, and progress operations for cluster resource capability discovery and management. Use dataType parameter to specify what to manage: "pattern" for organizational patterns, "capabilities" for resource capabilities.';

// Extensible schema - supports patterns and capabilities
export const ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA = {
  dataType: z.enum(['pattern', 'capabilities']).describe('Type of cluster data to manage: "pattern" for organizational patterns, "capabilities" for resource capabilities'),
  operation: z.enum(['create', 'list', 'get', 'delete', 'deleteAll', 'scan', 'analyze', 'progress']).describe('Operation to perform on the cluster data'),
  
  // Workflow fields for step-by-step pattern creation
  sessionId: z.string().optional().describe('Session ID (required for continuing workflow steps, optional for progress - uses latest session if omitted)'),
  step: z.string().optional().describe('Current workflow step (required when sessionId is provided)'),
  response: z.string().optional().describe('User response to previous workflow step question'),
  
  // Generic fields for get/delete operations
  id: z.string().optional().describe('Data item ID (required for get/delete operations)'),
  
  // Generic fields for list operations
  limit: z.number().optional().describe('Maximum number of items to return (default: 10)'),
  
  // Resource-specific fields (for capabilities operations)
  resource: z.object({
    kind: z.string(),
    group: z.string(),
    apiVersion: z.string()
  }).optional().describe('Kubernetes resource reference (for capabilities operations)'),
  
  // Resource list for specific resource scanning
  resourceList: z.string().optional().describe('Comma-separated list of resources to scan (format: Kind.group or Kind for core resources)')
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
 * Handle capabilities operations - PRD #48 Implementation
 */
async function handleCapabilitiesOperation(
  operation: string,
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  logger.info('Capabilities operation requested', { requestId, operation });
  
  switch (operation) {
    case 'scan':
      return await handleCapabilityScan(args, logger, requestId);
    
    case 'progress':
      return await handleCapabilityProgress(args, logger, requestId);
    
    case 'list':
    case 'get':
    case 'delete':
    case 'deleteAll': {
      // Create and initialize capability service for list/get/delete operations
      const capabilityService = new CapabilityVectorService();
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
                config: 'export QDRANT_URL=http://localhost:6333'
              }
            }
          };
        }
        
        await capabilityService.initialize();
        
        if (operation === 'list') {
          return await handleCapabilityList(args, logger, requestId, capabilityService);
        } else if (operation === 'get') {
          return await handleCapabilityGet(args, logger, requestId, capabilityService);
        } else if (operation === 'delete') {
          return await handleCapabilityDelete(args, logger, requestId, capabilityService);
        } else if (operation === 'deleteAll') {
          return await handleCapabilityDeleteAll(args, logger, requestId, capabilityService);
        } else {
          // This should never happen since we already check the operation in the switch case
          throw new Error(`Unexpected operation: ${operation}`);
        }
      } catch (error) {
        logger.error(`Capability ${operation} operation failed`, error as Error, { requestId });
        return {
          success: false,
          operation,
          dataType: 'capabilities',
          error: {
            message: `Capability ${operation} failed`,
            details: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
    
    default:
      return {
        success: false,
        operation,
        dataType: 'capabilities',
        error: {
          message: `Unsupported capabilities operation: ${operation}`,
          supportedOperations: ['scan', 'list', 'get', 'delete', 'deleteAll']
        }
      };
  }
}

/**
 * Convert numeric response to option value
 */
function parseNumericResponse(response: string, validOptions: string[]): string {
  // If response is a number, map it to the corresponding option
  const num = parseInt(response, 10);
  if (!isNaN(num) && num >= 1 && num <= validOptions.length) {
    return validOptions[num - 1]; // Convert 1-based to 0-based index
  }
  // Otherwise return the original response (for backward compatibility)
  return response;
}

/**
 * Capability scanning workflow session with step-based state management
 */
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
  currentStep: 'resource-selection' | 'resource-specification' | 'processing-mode' | 'scanning' | 'complete';
  selectedResources?: string[] | 'all';
  resourceList?: string;
  processingMode?: 'auto' | 'manual';
  currentResourceIndex?: number; // Track which resource we're currently processing (for multi-resource workflows)
  progress?: ProgressData; // Progress tracking for long-running operations
  startedAt: string;
  lastActivity: string;
}

/**
 * Get session file path following established pattern
 */
function getCapabilitySessionPath(sessionId: string, args: any): string {
  const sessionDir = getAndValidateSessionDirectory(args, false);
  const sessionSubDir = path.join(sessionDir, 'capability-sessions');
  
  // Ensure capability-sessions subdirectory exists
  if (!fs.existsSync(sessionSubDir)) {
    fs.mkdirSync(sessionSubDir, { recursive: true });
  }
  
  return path.join(sessionSubDir, `${sessionId}.json`);
}

/**
 * Load session from file system following established pattern
 */
function loadCapabilitySession(sessionId: string, args: any): CapabilityScanSession | null {
  try {
    const sessionPath = getCapabilitySessionPath(sessionId, args);
    if (!fs.existsSync(sessionPath)) {
      return null;
    }
    
    const sessionData = fs.readFileSync(sessionPath, 'utf8');
    const session = JSON.parse(sessionData) as CapabilityScanSession;
    
    // Update last activity
    session.lastActivity = new Date().toISOString();
    saveCapabilitySession(session, args);
    
    return session;
  } catch (error) {
    // Log error but don't throw - return null to create new session
    return null;
  }
}

/**
 * Save session to file system following established pattern
 */
function saveCapabilitySession(session: CapabilityScanSession, args: any): void {
  try {
    const sessionPath = getCapabilitySessionPath(session.sessionId, args);
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf8');
  } catch (error) {
    // Log error but don't throw - workflow can continue
    console.warn('Failed to save capability session:', error);
  }
}

/**
 * Get or create session with file-based persistence
 */
function getOrCreateCapabilitySession(sessionId: string | undefined, args: any, logger: Logger, requestId: string): CapabilityScanSession {
  if (sessionId) {
    const existing = loadCapabilitySession(sessionId, args);
    if (existing) {
      logger.info('Loaded existing capability session', { 
        requestId, 
        sessionId, 
        currentStep: existing.currentStep 
      });
      return existing;
    }
  }
  
  // Create new session
  const newSessionId = sessionId || `cap-scan-${Date.now()}`;
  const session: CapabilityScanSession = {
    sessionId: newSessionId,
    currentStep: 'resource-selection',
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };
  
  saveCapabilitySession(session, args);
  logger.info('Created new capability session', { 
    requestId, 
    sessionId: newSessionId, 
    currentStep: session.currentStep 
  });
  
  return session;
}

/**
 * Validate client is on the correct step - step parameter is MANDATORY
 */
function validateCapabilityStep(session: CapabilityScanSession, clientStep?: string): { valid: boolean; error?: string } {
  if (!clientStep) {
    return {
      valid: false,
      error: `Step parameter is required. You are currently on step '${session.currentStep}'. Please call with step='${session.currentStep}' and appropriate parameters.`
    };
  }
  
  if (clientStep !== session.currentStep) {
    return {
      valid: false,
      error: `Step mismatch: you're on step '${session.currentStep}', but called with step '${clientStep}'. Please call with step='${session.currentStep}'.`
    };
  }
  
  return { valid: true };
}

/**
 * Transition session to next step with proper state updates
 */
function transitionCapabilitySession(session: CapabilityScanSession, nextStep: CapabilityScanSession['currentStep'], updates: Partial<CapabilityScanSession>, args: any): void {
  session.currentStep = nextStep;
  session.lastActivity = new Date().toISOString();
  
  if (updates) {
    Object.assign(session, updates);
  }
  
  saveCapabilitySession(session, args);
}

/**
 * Clean up session file after successful completion
 */
function cleanupCapabilitySession(session: CapabilityScanSession, args: any, logger: Logger, requestId: string): void {
  try {
    const sessionPath = getCapabilitySessionPath(session.sessionId, args);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
      logger.info('Capability session cleaned up after completion', { 
        requestId, 
        sessionId: session.sessionId 
      });
    }
  } catch (error) {
    // Log cleanup failure but don't fail the operation
    logger.warn('Failed to cleanup capability session file', { 
      requestId, 
      sessionId: session.sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Handle capability scanning workflow with step-based state management
 */
async function handleCapabilityScan(
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  // Validate Vector DB and embedding service dependencies upfront
  // This prevents users from going through the entire workflow only to fail at storage
  const capabilityService = new CapabilityVectorService();
  
  // Check Vector DB connection and initialize collection
  try {
    const vectorDBHealthy = await capabilityService.healthCheck();
    if (!vectorDBHealthy) {
      return {
        success: false,
        operation: 'scan',
        dataType: 'capabilities',
        error: {
          message: 'Vector DB (Qdrant) connection required for capability management',
          details: 'Capability scanning requires Qdrant for storing and searching capabilities. The system cannot proceed without a working Vector DB connection.',
          setup: {
            required: 'Qdrant server must be running',
            default: 'http://localhost:6333',
            docker: 'docker run -p 6333:6333 qdrant/qdrant',
            config: 'export QDRANT_URL=http://localhost:6333'
          },
          currentConfig: {
            QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333 (default)',
            status: 'connection failed'
          }
        }
      };
    }
  } catch (error) {
    logger.error('Vector DB connection check failed', error as Error, { requestId });
    return {
      success: false,
      operation: 'scan',
      dataType: 'capabilities',
      error: {
        message: 'Vector DB (Qdrant) connection failed',
        details: 'Cannot establish connection to Qdrant server. Please ensure Qdrant is running and accessible.',
        technicalDetails: error instanceof Error ? error.message : String(error),
        setup: {
          required: 'Qdrant server must be running',
          default: 'http://localhost:6333',
          docker: 'docker run -p 6333:6333 qdrant/qdrant',
          config: 'export QDRANT_URL=http://localhost:6333'
        },
        currentConfig: {
          QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333 (default)',
          status: 'connection error'
        }
      }
    };
  }
  
  // Initialize the collection now that we know Qdrant is healthy
  try {
    await capabilityService.initialize();
  } catch (error) {
    logger.error('Failed to initialize capabilities collection', error as Error, { requestId });
    return {
      success: false,
      operation: 'scan',
      dataType: 'capabilities',
      error: {
        message: 'Vector DB collection initialization failed',
        details: 'Could not create or access the capabilities collection in Qdrant.',
        technicalDetails: error instanceof Error ? error.message : String(error),
        setup: {
          possibleCauses: [
            'Qdrant version compatibility issue',
            'Insufficient permissions',
            'Collection dimension mismatch',
            'Corrupted existing collection'
          ],
          recommendations: [
            'Check Qdrant logs for detailed error information',
            'Verify Qdrant version compatibility',
            'Consider removing existing capabilities collection if corrupted'
          ]
        }
      }
    };
  }

  // Check embedding service (OpenAI API) availability
  const embeddingCheck = await validateEmbeddingService(logger, requestId);
  if (!embeddingCheck.success) {
    return {
      success: false,
      operation: 'scan',
      dataType: 'capabilities',
      error: {
        message: 'OpenAI API required for capability semantic search',
        details: 'Capability scanning requires OpenAI embeddings for semantic search functionality. The system cannot proceed without proper OpenAI API configuration.',
        ...embeddingCheck.error,
        recommendation: 'Set up OpenAI API key to enable full capability scanning with semantic search'
      }
    };
  }

  logger.info('Capability scanning dependencies validated', {
    requestId,
    vectorDB: 'healthy',
    embeddings: 'available'
  });

  // Get or create session with step-based state management
  const session = getOrCreateCapabilitySession(args.sessionId, args, logger, requestId);
  
  // Validate client is on correct step - only for existing sessions
  // New sessions (no sessionId provided) are allowed to start without step parameter
  // If sessionId is provided, client must follow step-based protocol
  const clientProvidedSessionId = !!args.sessionId;
  if (clientProvidedSessionId) {
    const stepValidation = validateCapabilityStep(session, args.step);
    if (!stepValidation.valid) {
      return {
        success: false,
        operation: 'scan',
        dataType: 'capabilities',
        error: {
          message: 'Step validation failed',
          details: stepValidation.error,
          currentStep: session.currentStep,
          expectedCall: `Call with step='${session.currentStep}' and appropriate parameters`
        }
      };
    }
  }
  
  // Handle workflow based on current step
  switch (session.currentStep) {
    case 'resource-selection':
      return await handleResourceSelection(session, args, logger, requestId);
    
    case 'resource-specification':
      return await handleResourceSpecification(session, args, logger, requestId);
    
    case 'processing-mode':
      return await handleProcessingMode(session, args, logger, requestId, capabilityService);
    
    case 'scanning':
      return await handleScanning(session, args, logger, requestId, capabilityService);
    
    case 'complete':
      return {
        success: false,
        operation: 'scan',
        dataType: 'capabilities',
        error: {
          message: 'Workflow already complete',
          details: `Session ${session.sessionId} has already completed capability scanning.`,
          sessionId: session.sessionId
        }
      };
    
    default:
      return {
        success: false,
        operation: 'scan',
        dataType: 'capabilities',
        error: {
          message: 'Invalid workflow state',
          details: `Unknown step: ${session.currentStep}`,
          currentStep: session.currentStep
        }
      };
  }
}

/**
 * Handle resource selection step
 */
async function handleResourceSelection(
  session: CapabilityScanSession,
  args: any,
  _logger: Logger,
  _requestId: string
): Promise<any> {
  if (!args.response) {
    // Show initial resource selection prompt
    return {
      success: true,
      operation: 'scan',
      dataType: 'capabilities',
      
      // CRITICAL: Put required parameters at top level for maximum visibility
      REQUIRED_NEXT_CALL: {
        tool: 'dot-ai:manageOrgData',
        parameters: {
          dataType: 'capabilities',
          operation: 'scan',
          sessionId: session.sessionId,
          step: 'resource-selection',  // MANDATORY PARAMETER
          response: 'user_choice_here'  // Replace with actual user choice
        },
        note: 'The step parameter is MANDATORY when sessionId is provided'
      },
      
      workflow: {
        step: 'resource-selection',
        question: 'Scan all cluster resources or specify subset?',
        options: [
          { number: 1, value: 'all', display: '1. all - Scan all available cluster resources' },
          { number: 2, value: 'specific', display: '2. specific - Specify particular resource types to scan' }
        ],
        sessionId: session.sessionId,
        instruction: 'IMPORTANT: You MUST ask the user to make a choice. Do NOT automatically select an option.',
        userPrompt: 'Would you like to scan all cluster resources or specify a subset?',
        clientInstructions: {
          behavior: 'interactive',
          requirement: 'Ask user to choose between options',
          prohibit: 'Do not auto-select options',
          nextStep: `Call with step='resource-selection', sessionId='${session.sessionId}', and response parameter containing the semantic value (all or specific)`,
          responseFormat: 'Convert user input to semantic values: 1→all, 2→specific, or pass through semantic words directly',
          requiredParameters: {
            step: 'resource-selection',
            sessionId: session.sessionId,
            response: 'user choice (all or specific)'
          }
        }
      }
    };
  }
  
  // Process user response
  const normalizedResponse = parseNumericResponse(args.response, ['all', 'specific']);
  
  if (normalizedResponse === 'all') {
    // Transition to processing mode for all resources
    transitionCapabilitySession(session, 'processing-mode', { selectedResources: 'all' }, args);
    
    return {
      success: true,
      operation: 'scan',
      dataType: 'capabilities',
      
      // CRITICAL: Put required parameters at top level for maximum visibility
      REQUIRED_NEXT_CALL: {
        tool: 'dot-ai:manageOrgData',
        parameters: {
          dataType: 'capabilities',
          operation: 'scan',
          sessionId: session.sessionId,
          step: 'processing-mode',  // MANDATORY PARAMETER
          response: 'user_choice_here'  // Replace with actual user choice
        },
        note: 'The step parameter is MANDATORY when sessionId is provided'
      },
      
      workflow: {
        step: 'processing-mode',
        question: 'Processing mode: auto (batch process) or manual (review each)?',
        options: [
          { number: 1, value: 'auto', display: '1. auto - Batch process automatically' },
          { number: 2, value: 'manual', display: '2. manual - Review each step' }
        ],
        sessionId: session.sessionId,
        selectedResources: 'all',
        instruction: 'IMPORTANT: You MUST ask the user to make a choice. Do NOT automatically select a processing mode.',
        userPrompt: 'How would you like to process the resources?',
        clientInstructions: {
          behavior: 'interactive',
          requirement: 'Ask user to choose processing mode',
          prohibit: 'Do not auto-select processing mode',
          nextStep: `Call with step='processing-mode', sessionId='${session.sessionId}', and response parameter containing the semantic value (auto or manual)`,
          responseFormat: 'Convert user input to semantic values: 1→auto, 2→manual, or pass through semantic words directly',
          requiredParameters: {
            step: 'processing-mode', 
            sessionId: session.sessionId,
            response: 'user choice (auto or manual)'
          }
        }
      }
    };
  }
  
  if (normalizedResponse === 'specific') {
    // Transition to resource specification
    transitionCapabilitySession(session, 'resource-specification', {}, args);
    
    return {
      success: true,
      operation: 'scan',
      dataType: 'capabilities',
      
      // CRITICAL: Put required parameters at top level for maximum visibility
      REQUIRED_NEXT_CALL: {
        tool: 'dot-ai:manageOrgData',
        parameters: {
          dataType: 'capabilities',
          operation: 'scan',
          sessionId: session.sessionId,
          step: 'resource-specification',  // MANDATORY PARAMETER
          resourceList: 'user_resource_list_here'  // Replace with actual resource list
        },
        note: 'The step parameter is MANDATORY when sessionId is provided'
      },
      
      workflow: {
        step: 'resource-specification',
        question: 'Which resources would you like to scan?',
        sessionId: session.sessionId,
        instruction: 'IMPORTANT: You MUST ask the user to specify which resources to scan. Do NOT provide a default list.',
        userPrompt: 'Please specify which resources you want to scan.',
        resourceFormat: {
          description: 'Specify resources using Kubernetes naming convention',
          format: 'Kind.group for CRDs, Kind for core resources',
          examples: {
            crds: ['SQL.devopstoolkit.live', 'Server.dbforpostgresql.azure.upbound.io'],
            core: ['Pod', 'Service', 'ConfigMap'],
            apps: ['Deployment.apps', 'StatefulSet.apps']
          },
          input: 'Comma-separated list (e.g.: SQL.devopstoolkit.live, Deployment.apps, Pod)'
        },
        clientInstructions: {
          behavior: 'interactive',
          requirement: 'Ask user to provide specific resource list',
          prohibit: 'Do not suggest or auto-select resources',
          nextStep: `Call with step='resource-specification', sessionId='${session.sessionId}', and resourceList parameter`,
          requiredParameters: {
            step: 'resource-specification',
            sessionId: session.sessionId,
            resourceList: 'comma-separated list of resources'
          }
        }
      }
    };
  }
  
  return {
    success: false,
    operation: 'scan',
    dataType: 'capabilities',
    error: {
      message: 'Invalid resource selection response',
      details: `Expected 'all' or 'specific', got: ${args.response}`,
      currentStep: session.currentStep
    }
  };
}

/**
 * Handle resource specification step
 */
async function handleResourceSpecification(
  session: CapabilityScanSession,
  args: any,
  _logger: Logger,
  _requestId: string
): Promise<any> {
  if (!args.resourceList) {
    return {
      success: false,
      operation: 'scan',
      dataType: 'capabilities',
      error: {
        message: 'Missing resource list',
        details: 'Expected resourceList parameter with comma-separated resource names',
        currentStep: session.currentStep,
        expectedCall: `Call with step='resource-specification' and resourceList parameter`
      }
    };
  }
  
  // Parse and validate resource list
  const resources = args.resourceList.split(',').map((r: string) => r.trim()).filter((r: string) => r.length > 0);
  if (resources.length === 0) {
    return {
      success: false,
      operation: 'scan',
      dataType: 'capabilities',
      error: {
        message: 'Empty resource list',
        details: 'Resource list cannot be empty',
        currentStep: session.currentStep
      }
    };
  }
  
  // Transition to processing mode for specific resources
  transitionCapabilitySession(session, 'processing-mode', { 
    selectedResources: resources,
    resourceList: args.resourceList 
  }, args);
  
  return {
    success: true,
    operation: 'scan',
    dataType: 'capabilities',
    
    // CRITICAL: Put required parameters at top level for maximum visibility
    REQUIRED_NEXT_CALL: {
      tool: 'dot-ai:manageOrgData',
      parameters: {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId: session.sessionId,
        step: 'processing-mode',  // MANDATORY PARAMETER
        response: 'user_choice_here'  // Replace with actual user choice
      },
      note: 'The step parameter is MANDATORY when sessionId is provided'
    },
    
    workflow: {
      step: 'processing-mode',
      question: `Processing mode for ${resources.length} selected resources: auto (batch process) or manual (review each)?`,
      options: [
        { number: 1, value: 'auto', display: '1. auto - Batch process automatically' },
        { number: 2, value: 'manual', display: '2. manual - Review each step' }
      ],
      sessionId: session.sessionId,
      selectedResources: resources,
      instruction: 'IMPORTANT: You MUST ask the user to choose processing mode for the specified resources.',
      userPrompt: `How would you like to process these ${resources.length} resources?`,
      clientInstructions: {
        behavior: 'interactive',
        requirement: 'Ask user to choose processing mode for specific resources',
        context: `Processing ${resources.length} user-specified resources: ${resources.join(', ')}`,
        prohibit: 'Do not auto-select processing mode',
        nextStep: `Call with step='processing-mode', sessionId='${session.sessionId}', and response parameter containing the semantic value (auto or manual)`,
        responseFormat: 'Convert user input to semantic values: 1→auto, 2→manual, or pass through semantic words directly',
        requiredParameters: {
          step: 'processing-mode',
          sessionId: session.sessionId,
          response: 'user choice (auto or manual)'
        }
      }
    }
  };
}

/**
 * Handle processing mode step
 */
async function handleProcessingMode(
  session: CapabilityScanSession,
  args: any,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<any> {
  if (!args.response) {
    return {
      success: false,
      operation: 'scan',
      dataType: 'capabilities',
      error: {
        message: 'Missing processing mode response',
        details: 'Expected response parameter with processing mode choice',
        currentStep: session.currentStep,
        expectedCall: `Call with step='processing-mode' and response parameter (auto or manual)`
      }
    };
  }
  
  // Process user response
  const processingModeResponse = parseNumericResponse(args.response, ['auto', 'manual']);
  
  if (processingModeResponse !== 'auto' && processingModeResponse !== 'manual') {
    return {
      success: false,
      operation: 'scan',
      dataType: 'capabilities',
      error: {
        message: 'Invalid processing mode response',
        details: `Expected 'auto' or 'manual', got: ${args.response}`,
        currentStep: session.currentStep
      }
    };
  }
  
  // Transition to scanning with processing mode and initialize resource tracking
  transitionCapabilitySession(session, 'scanning', { 
    processingMode: processingModeResponse,
    currentResourceIndex: 0  // Start with first resource
  }, args);
  
  // Begin actual capability scanning - clear response from previous step
  return await handleScanning(session, { ...args, response: undefined }, logger, requestId, capabilityService);
}

/**
 * Handle scanning step (actual capability analysis)
 */
async function handleScanning(
  session: CapabilityScanSession,
  args: any,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<any> {
  try {
    // If this is a response to a manual mode preview, handle it first
    if (session.processingMode === 'manual' && args.response) {
      const userResponse = parseNumericResponse(args.response, ['yes', 'no', 'stop']);
      
      if (userResponse === 'stop') {
        // User wants to stop scanning
        transitionCapabilitySession(session, 'complete', {}, args);
        cleanupCapabilitySession(session, args, logger, requestId);
        
        const currentIndex = session.currentResourceIndex || 0;
        const totalResources = Array.isArray(session.selectedResources) ? session.selectedResources.length : 1;
        
        return {
          success: true,
          operation: 'scan',
          dataType: 'capabilities',
          step: 'complete',
          sessionId: session.sessionId,
          results: {
            processed: currentIndex, // Resources processed so far
            successful: currentIndex, // Assume all successful for now
            failed: 0,
            stopped: true,
            message: `Scanning stopped by user after ${currentIndex} of ${totalResources} resources`
          },
          message: 'Capability scan stopped by user'
        };
      }
      
      if (userResponse === 'yes' || userResponse === 'no') {
        // TODO: If 'yes', store the capability in Vector DB (Milestone 2)
        // For now, just log the decision
        logger.info(`User ${userResponse === 'yes' ? 'accepted' : 'skipped'} capability for resource`, {
          requestId,
          sessionId: session.sessionId,
          resourceIndex: session.currentResourceIndex,
          decision: userResponse
        });
        
        // Move to the next resource
        const nextIndex = (session.currentResourceIndex || 0) + 1;
        transitionCapabilitySession(session, 'scanning', { currentResourceIndex: nextIndex }, args);
        
        // Continue processing (will handle the next resource or complete if done)
        return await handleScanning(session, { ...args, response: undefined }, logger, requestId, capabilityService);
      }
      
      // Invalid response
      return {
        success: false,
        operation: 'scan',
        dataType: 'capabilities',
        error: {
          message: 'Invalid response to capability preview',
          details: `Expected 'yes', 'no', or 'stop', got: ${args.response}`,
          currentStep: session.currentStep
        }
      };
    }
    // Import capability engine
    const { CapabilityInferenceEngine } = await import('../core/capabilities');
    const { ClaudeIntegration } = await import('../core/claude');
    
    // Validate Claude API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        operation: 'scan',
        dataType: 'capabilities',
        error: {
          message: 'ANTHROPIC_API_KEY required for capability inference',
          details: 'Set ANTHROPIC_API_KEY environment variable to enable AI-powered capability analysis'
        }
      };
    }
    
    // Initialize capability engine
    const claudeIntegration = new ClaudeIntegration(apiKey);
    const engine = new CapabilityInferenceEngine(claudeIntegration, logger);
    
    // Get the resource to analyze
    let resourceName: string;
    let currentIndex: number;
    let totalResources: number;
    
    if (session.selectedResources === 'all') {
      // For 'all' mode, discover actual cluster resources first
      try {
        logger.info('Discovering all cluster resources for capability scanning', { requestId, sessionId: session.sessionId });
        
        // Import discovery engine
        const { KubernetesDiscovery } = await import('../core/discovery');
        const discovery = new KubernetesDiscovery();
        await discovery.connect();
        
        // Discover all available resources
        const resourceMap = await discovery.discoverResources();
        const allResources = [...resourceMap.resources, ...resourceMap.custom];
        
        // Extract resource names for capability analysis
        const discoveredResourceNames = allResources.map(resource => {
          // For CRDs (custom resources), prioritize full name format
          if (resource.name && resource.name.includes('.')) {
            return resource.name;
          }
          // For standard resources, use kind
          if (resource.kind) {
            return resource.kind;
          }
          // Fallback to name if no kind
          if (resource.name) {
            return resource.name;
          }
          return 'unknown-resource';
        }).filter(name => name !== 'unknown-resource');
        
        logger.info('Discovered cluster resources for capability scanning', {
          requestId,
          sessionId: session.sessionId,
          totalDiscovered: discoveredResourceNames.length,
          sampleResources: discoveredResourceNames.slice(0, 5)
        });
        
        if (discoveredResourceNames.length === 0) {
          return {
            success: false,
            operation: 'scan',
            dataType: 'capabilities',
            error: {
              message: 'No resources discovered in cluster',
              details: 'Cluster resource discovery returned empty results. Check cluster connectivity and permissions.',
              sessionId: session.sessionId
            }
          };
        }
        
        // Update session with discovered resources and start batch processing
        transitionCapabilitySession(session, 'scanning', {
          selectedResources: discoveredResourceNames,
          processingMode: session.processingMode,
          currentResourceIndex: 0
        }, args);
        
        // Continue to batch processing with discovered resources
        resourceName = discoveredResourceNames[0]; // First resource for manual mode
        currentIndex = 0;
        totalResources = discoveredResourceNames.length;
        
      } catch (error) {
        logger.error('Failed to discover cluster resources', error as Error, {
          requestId,
          sessionId: session.sessionId
        });
        
        return {
          success: false,
          operation: 'scan',
          dataType: 'capabilities',
          error: {
            message: 'Cluster resource discovery failed',
            details: error instanceof Error ? error.message : String(error),
            sessionId: session.sessionId,
            suggestedActions: [
              'Check cluster connectivity',
              'Verify kubectl access permissions',
              'Try specifying specific resources instead of "all"'
            ]
          }
        };
      }
    } else if (Array.isArray(session.selectedResources)) {
      // Get the current resource based on currentResourceIndex
      currentIndex = session.currentResourceIndex || 0;
      totalResources = session.selectedResources.length;
      
      if (currentIndex >= totalResources) {
        // All resources processed - mark as complete
        transitionCapabilitySession(session, 'complete', {}, args);
        cleanupCapabilitySession(session, args, logger, requestId);
        
        return {
          success: true,
          operation: 'scan',
          dataType: 'capabilities',
          step: 'complete',
          sessionId: session.sessionId,
          results: {
            processed: totalResources,
            successful: totalResources, // Assume all successful for now
            failed: 0,
            message: `Completed scanning ${totalResources} resources`
          },
          message: 'Capability scan completed successfully'
        };
      }
      
      resourceName = session.selectedResources[currentIndex];
      if (!resourceName) {
        throw new Error(`No resource found at index ${currentIndex}`);
      }
    } else {
      throw new Error('Invalid selectedResources in session state');
    }
    
    // Generate a context-rich prompt for the AI
    const resourceContext = `
Resource Name: ${resourceName}
Context: This is a Kubernetes resource that the user wants to analyze for capabilities.
The AI should infer what this resource does based on its name and provide comprehensive capability analysis.`;
    
    logger.info('Analyzing resource for capability inference', { 
      requestId, 
      sessionId: session.sessionId,
      resource: resourceName,
      mode: session.processingMode
    });
    
    if (session.processingMode === 'manual') {
      // Manual mode: Show capability data for user review
      const capability = await engine.inferCapabilities(resourceName, resourceContext);
      const capabilityId = CapabilityInferenceEngine.generateCapabilityId(resourceName);
      
      return {
        success: true,
        operation: 'scan',
        dataType: 'capabilities',
        mode: 'manual',
        step: 'scanning',
        sessionId: session.sessionId,
        preview: {
          resource: resourceName,
          resourceIndex: `${currentIndex + 1}/${totalResources}`,
          id: capabilityId,
          data: capability,
          question: 'Continue storing this capability?',
          options: [
            { number: 1, value: 'yes', display: '1. yes - Store this capability' },
            { number: 2, value: 'no', display: '2. no - Skip this resource' },
            { number: 3, value: 'stop', display: '3. stop - End scanning process' }
          ],
          instruction: 'Review the capability analysis results before storing',
          clientInstructions: {
            behavior: 'interactive',
            requirement: 'Ask user to review capability data and decide on storage',
            nextStep: `Call with step='scanning' and response parameter containing their choice (yes/no/stop)`,
            responseFormat: 'Convert user input to semantic values: 1→yes, 2→no, 3→stop'
          }
        }
      };
    } else {
      // Auto mode: Process ALL resources in batch without user interaction
      // At this point, selectedResources should always be an array (either discovered or specified)
      if (!Array.isArray(session.selectedResources)) {
        throw new Error(`Invalid selectedResources state: expected array, got ${typeof session.selectedResources}. This indicates a bug in resource discovery.`);
      }
      
      const resources = session.selectedResources;
      const totalResources = resources.length;
      const processedResults: any[] = [];
      const errors: any[] = [];
      
      logger.info('Starting auto batch processing', {
        requestId,
        sessionId: session.sessionId,
        totalResources,
        resources: resources
      });
      
      // Initialize progress tracking
      const startTime = Date.now();
      const updateProgress = (current: number, currentResource: string, successful: number, failed: number, recentErrors: any[]) => {
        const elapsed = Date.now() - startTime;
        const percentage = Math.round((current / totalResources) * 100);
        
        // Calculate estimated time remaining
        let estimatedTimeRemaining: string | undefined;
        if (current > 0) {
          const avgTimePerResource = elapsed / current;
          const remainingResources = totalResources - current;
          const estimatedRemainingMs = remainingResources * avgTimePerResource;
          const estimatedMinutes = Math.round(estimatedRemainingMs / 60000 * 10) / 10;
          estimatedTimeRemaining = estimatedMinutes > 1 ? 
            `${estimatedMinutes} minutes` : 
            `${Math.round(estimatedRemainingMs / 1000)} seconds`;
        }
        
        const progressData: ProgressData = {
          status: 'processing',
          current: current,
          total: totalResources,
          percentage: percentage,
          currentResource: currentResource,
          startedAt: new Date(startTime).toISOString(),
          lastUpdated: new Date().toISOString(),
          estimatedTimeRemaining,
          successfulResources: successful,
          failedResources: failed,
          errors: recentErrors.slice(-5) // Keep last 5 errors for troubleshooting
        };
        
        // Update session file with progress
        transitionCapabilitySession(session, 'scanning', { 
          processingMode: session.processingMode,
          selectedResources: session.selectedResources,
          currentResourceIndex: current - 1,
          progress: progressData
        }, args);
      };
      
      // Process each resource in the batch with progress tracking
      for (let i = 0; i < resources.length; i++) {
        const currentResource = resources[i];
        const currentContext = `
Resource Name: ${currentResource}
Context: This is a Kubernetes resource that the user wants to analyze for capabilities.
The AI should infer what this resource does based on its name and provide comprehensive capability analysis.`;
        
        // Update progress before processing
        updateProgress(i + 1, currentResource, processedResults.length, errors.length, errors);
        
        try {
          logger.info(`Processing resource ${i + 1}/${totalResources}`, {
            requestId,
            sessionId: session.sessionId,
            resource: currentResource,
            percentage: Math.round(((i + 1) / totalResources) * 100)
          });
          
          const capability = await engine.inferCapabilities(currentResource, currentContext);
          const capabilityId = CapabilityInferenceEngine.generateCapabilityId(currentResource);
          
          // Store capability in Vector DB
          await capabilityService.storeCapability(capability);
          
          processedResults.push({
            resource: currentResource,
            id: capabilityId,
            capabilities: capability.capabilities,
            providers: capability.providers,
            complexity: capability.complexity,
            confidence: capability.confidence
          });
          
          logger.info(`Successfully processed resource ${i + 1}/${totalResources}`, {
            requestId,
            sessionId: session.sessionId,
            resource: currentResource,
            capabilitiesFound: capability.capabilities.length,
            percentage: Math.round(((i + 1) / totalResources) * 100)
          });
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorDetail = {
            resource: currentResource,
            error: errorMessage,
            index: i + 1,
            timestamp: new Date().toISOString()
          };
          
          logger.error(`Failed to process resource ${i + 1}/${totalResources}`, error as Error, {
            requestId,
            sessionId: session.sessionId,
            resource: currentResource,
            percentage: Math.round(((i + 1) / totalResources) * 100)
          });
          
          errors.push(errorDetail);
        }
      }
      
      // Final progress update - mark as completed
      const finalElapsed = Date.now() - startTime;
      const finalMinutes = Math.round(finalElapsed / 60000 * 10) / 10;
      const successful = processedResults.length;
      const failed = errors.length;
      
      const completionData: ProgressData = {
        status: 'completed',
        current: totalResources,
        total: totalResources,
        percentage: 100,
        currentResource: 'Processing complete',
        startedAt: new Date(startTime).toISOString(),
        lastUpdated: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalProcessingTime: finalMinutes > 1 ? `${finalMinutes} minutes` : `${Math.round(finalElapsed / 1000)} seconds`,
        successfulResources: successful,
        failedResources: failed,
        errors: errors.slice(-5)
      };
      
      // Update session with completion status
      transitionCapabilitySession(session, 'complete', {
        progress: completionData
      }, args);
      
      logger.info('Auto batch processing completed', {
        requestId,
        sessionId: session.sessionId,
        processed: totalResources,
        successful,
        failed,
        processingTime: completionData.totalProcessingTime
      });
      
      // Clean up session file after a brief delay to allow progress viewing
      setTimeout(() => {
        cleanupCapabilitySession(session, args, logger, requestId);
      }, 30000); // Keep for 30 seconds after completion
      
      return {
        success: true,
        operation: 'scan',
        dataType: 'capabilities',
        mode: 'auto',
        step: 'complete',
        sessionId: session.sessionId,
        results: {
          processed: totalResources,
          successful,
          failed,
          message: `Completed batch processing ${totalResources} resources (${successful} successful, ${failed} failed)`,
          processedResources: processedResults,
          processingTime: completionData.totalProcessingTime,
          ...(errors.length > 0 && { errors })
        },
        message: failed > 0 ? 
          `Capability scan completed with ${failed} errors. ${successful}/${totalResources} resources processed successfully.` :
          'Capability scan completed successfully for all resources.',
        sample: processedResults.length > 0 ? processedResults[0] : undefined,
        progressTracking: {
          note: 'Progress was tracked during processing in the session file',
          sessionFile: `Session progress was available at: ~/.dot-ai/sessions/${session.sessionId}.json`,
          nextTime: 'To monitor progress of future scans, check the session file during processing'
        }
      };
    }
  } catch (error) {
    logger.error('Capability scanning failed', error as Error, {
      requestId,
      sessionId: session.sessionId,
      resource: (error && typeof error === 'object' && 'resourceName' in error) ? (error as any).resourceName : 'unknown',
      step: session.currentStep
    });
    
    // Clean up session on error
    cleanupCapabilitySession(session, args, logger, requestId);
    
    return {
      success: false,
      operation: 'scan',
      dataType: 'capabilities',
      error: {
        message: 'Capability scanning failed',
        details: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Handle capability listing (placeholder for future implementation)
 */
async function handleCapabilityList(
  args: any,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<any> {
  try {
    // Get all capabilities with optional limit
    const limit = args.limit || 10;
    const capabilities = await capabilityService.getAllCapabilities(limit);
    const count = await capabilityService.getCapabilitiesCount();
    
    logger.info('Capabilities listed successfully', {
      requestId,
      count: capabilities.length,
      totalCount: count,
      limit
    });
    
    return {
      success: true,
      operation: 'list',
      dataType: 'capabilities',
      data: {
        capabilities: capabilities.map(cap => ({
          id: (cap as any).id,
          resourceName: cap.resourceName,
          capabilities: cap.capabilities,
          description: cap.description.length > 100 ? cap.description.substring(0, 100) + '...' : cap.description,
          complexity: cap.complexity,
          confidence: cap.confidence,
          analyzedAt: cap.analyzedAt
        })),
        totalCount: count,
        returnedCount: capabilities.length,
        limit
      },
      message: `Retrieved ${capabilities.length} capabilities (${count} total)`,
      clientInstructions: {
        behavior: 'Display capability list with IDs prominently visible for user reference',
        requirement: 'Each capability must show: ID, resource name, main capabilities, and description',
        format: 'List format with ID clearly labeled (e.g., "ID: abc123") so users can reference specific capabilities',
        prohibit: 'Do not hide or omit capability IDs from the display - users need them for get operations'
      }
    };
  } catch (error) {
    logger.error('Failed to list capabilities', error as Error, {
      requestId
    });
    
    return {
      success: false,
      operation: 'list',
      dataType: 'capabilities',
      error: {
        message: 'Failed to list capabilities',
        details: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Handle capability retrieval (placeholder for future implementation)
 */
async function handleCapabilityGet(
  args: any,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<any> {
  try {
    // Validate required parameters
    if (!args.id) {
      return {
        success: false,
        operation: 'get',
        dataType: 'capabilities',
        error: {
          message: 'Missing required parameter: id',
          details: 'Specify id to retrieve capability data',
          example: { id: 'capability-id-example' }
        }
      };
    }
    
    // Get capability by ID
    const capability = await capabilityService.getCapability(args.id);
    
    if (!capability) {
      logger.warn('Capability not found', {
        requestId,
        capabilityId: args.id
      });
      
      return {
        success: false,
        operation: 'get',
        dataType: 'capabilities',
        error: {
          message: `Capability not found for ID: ${args.id}`,
          details: 'Resource capability may not have been scanned yet',
          suggestion: 'Use scan operation to analyze this resource first'
        }
      };
    }
    
    logger.info('Capability retrieved successfully', {
      requestId,
      capabilityId: args.id,
      resourceName: capability.resourceName,
      capabilitiesFound: capability.capabilities.length,
      confidence: capability.confidence
    });
    
    return {
      success: true,
      operation: 'get',
      dataType: 'capabilities',
      data: capability,
      message: `Retrieved capability data for ${capability.resourceName} (ID: ${args.id})`,
      clientInstructions: {
        behavior: 'Display comprehensive capability details in organized sections',
        requirement: 'Show resource name, capabilities, providers, complexity, use case, and confidence prominently',
        format: 'Structured display with clear sections: Resource Info, Capabilities, Technical Details, and Analysis Results',
        sections: {
          resourceInfo: 'Resource name and description with use case',
          capabilities: 'List all capabilities, providers, and abstractions clearly',
          technicalDetails: 'Complexity level and provider information',
          analysisResults: 'Confidence score, analysis timestamp, and ID for reference'
        }
      }
    };
  } catch (error) {
    logger.error('Failed to get capability', error as Error, {
      requestId,
      capabilityId: args.id
    });
    
    return {
      success: false,
      operation: 'get',
      dataType: 'capabilities',
      error: {
        message: 'Failed to retrieve capability',
        details: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Handle capability progress query (check progress of running scan)
 */
async function handleCapabilityProgress(
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Capability progress query requested', { 
      requestId,
      sessionId: args.sessionId 
    });
    
    // Get session directory first
    const sessionDir = getAndValidateSessionDirectory(args, false);
    let sessionId = args.sessionId;
    let sessionFilePath: string;
    
    // If no sessionId provided, auto-discover the latest session
    if (!sessionId) {
      logger.info('No sessionId provided, searching for latest session file', { requestId });
      
      try {
        // Check if capability-sessions subdirectory exists
        const sessionSubDir = path.join(sessionDir, 'capability-sessions');
        if (!fs.existsSync(sessionSubDir)) {
          logger.info('No capability-sessions directory found', { requestId, sessionDir });
          return {
            success: false,
            operation: 'progress',
            dataType: 'capabilities',
            error: {
              message: 'No capability scan sessions found',
              details: 'No capability-sessions directory found in the session directory',
              help: 'Start a new capability scan with the scan operation first',
              sessionDirectory: sessionDir
            }
          };
        }
        
        // Find all capability scan session files in the subdirectory
        const sessionFiles = fs.readdirSync(sessionSubDir)
          .filter(file => file.endsWith('.json'))
          .map(file => {
            const filePath = path.join(sessionSubDir, file);
            const stats = fs.statSync(filePath);
            return {
              filename: file,
              path: filePath,
              mtime: stats.mtime,
              sessionId: file.replace('.json', '') // Remove .json extension to get sessionId
            };
          })
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Sort by newest first
        
        if (sessionFiles.length === 0) {
          logger.info('No capability scan session files found', { requestId, sessionDir });
          return {
            success: false,
            operation: 'progress',
            dataType: 'capabilities',
            error: {
              message: 'No capability scan sessions found',
              details: 'No active or recent capability scans found in the session directory',
              help: 'Start a new capability scan with the scan operation first',
              sessionDirectory: sessionDir
            }
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
          sessionFile: latestSession.filename 
        });
        
      } catch (error) {
        logger.error('Failed to discover session files', error as Error, { requestId, sessionDir });
        return {
          success: false,
          operation: 'progress',
          dataType: 'capabilities',
          error: {
            message: 'Failed to discover session files',
            details: error instanceof Error ? error.message : String(error),
            sessionDirectory: sessionDir
          }
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
          filePath: sessionFilePath
        });
        
        return {
          success: false,
          operation: 'progress',
          dataType: 'capabilities',
          error: {
            message: 'Session not found',
            details: `No capability scan found for session: ${sessionId}`,
            help: 'Use the scan operation to start a new capability scan, or omit sessionId to use the latest session'
          }
        };
      }
    }
    
    // Read and parse session file
    const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8')) as CapabilityScanSession;
    
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
        lastActivity: sessionData.lastActivity
      };
    }
    
    // Build comprehensive progress response
    const response: any = {
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
        lastUpdated: progress.lastUpdated
      },
      sessionInfo: {
        currentStep: sessionData.currentStep,
        processingMode: sessionData.processingMode,
        resourceCount: Array.isArray(sessionData.selectedResources) 
          ? sessionData.selectedResources.length 
          : (sessionData.selectedResources === 'all' ? 'all resources' : 'unknown'),
        startedAt: sessionData.startedAt,
        lastActivity: sessionData.lastActivity
      }
    };
    
    // Add completion information if scan is done
    if (progress.status === 'completed') {
      response.progress.completedAt = progress.completedAt;
      response.progress.totalProcessingTime = progress.totalProcessingTime;
      response.message = 'Capability scan completed successfully';
    } else {
      response.progress.estimatedTimeRemaining = progress.estimatedTimeRemaining;
      response.message = `Capability scan in progress: ${progress.current}/${progress.total} resources processed`;
    }
    
    // Add user-friendly display information
    response.display = {
      summary: progress.status === 'completed' 
        ? `✅ Scan complete: processed ${progress.total} resources in ${progress.totalProcessingTime}`
        : `⏳ Processing: ${progress.current}/${progress.total} (${progress.percentage}%) - ${progress.estimatedTimeRemaining} remaining`,
      currentResource: progress.currentResource,
      timeline: {
        started: progress.startedAt,
        lastUpdate: progress.lastUpdated,
        ...(progress.completedAt && { completed: progress.completedAt })
      }
    };
    
    logger.info('Progress query completed successfully', {
      requestId,
      sessionId: args.sessionId,
      status: progress.status,
      percentage: progress.percentage
    });
    
    return response;
    
  } catch (error) {
    logger.error('Failed to query capability progress', error as Error, {
      requestId,
      sessionId: args.sessionId
    });
    
    return {
      success: false,
      operation: 'progress',
      dataType: 'capabilities',
      error: {
        message: 'Failed to query scan progress',
        details: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Handle capability deletion (delete single capability by ID)
 */
async function handleCapabilityDelete(
  args: any,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<any> {
  try {
    // Validate required parameters
    if (!args.id) {
      return {
        success: false,
        operation: 'delete',
        dataType: 'capabilities',
        error: {
          message: 'Missing required parameter: id',
          details: 'Specify id to delete capability data',
          example: { id: 'capability-id-example' }
        }
      };
    }
    
    // Check if capability exists before deletion
    const capability = await capabilityService.getCapability(args.id);
    
    if (!capability) {
      logger.warn('Capability not found for deletion', {
        requestId,
        capabilityId: args.id
      });
      
      return {
        success: false,
        operation: 'delete',
        dataType: 'capabilities',
        error: {
          message: `Capability not found for ID: ${args.id}`,
          details: 'Cannot delete capability that does not exist'
        }
      };
    }
    
    // Delete capability by ID
    await capabilityService.deleteCapabilityById(args.id);
    
    logger.info('Capability deleted successfully', {
      requestId,
      capabilityId: args.id,
      resourceName: capability.resourceName
    });
    
    return {
      success: true,
      operation: 'delete',
      dataType: 'capabilities',
      deletedCapability: { 
        id: args.id,
        resourceName: capability.resourceName 
      },
      message: `Capability deleted: ${capability.resourceName}`
    };
  } catch (error) {
    logger.error('Failed to delete capability', error as Error, {
      requestId,
      capabilityId: args.id
    });
    
    return {
      success: false,
      operation: 'delete',
      dataType: 'capabilities',
      error: {
        message: 'Failed to delete capability',
        details: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * Handle capability bulk deletion (delete all capabilities)
 */
async function handleCapabilityDeleteAll(
  args: any,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<any> {
  try {
    // Get all capabilities first to count them and provide feedback
    const allCapabilities = await capabilityService.getAllCapabilities();
    const totalCount = allCapabilities.length;
    
    if (totalCount === 0) {
      logger.info('No capabilities found to delete', { requestId });
      
      return {
        success: true,
        operation: 'deleteAll',
        dataType: 'capabilities',
        deletedCount: 0,
        totalCount: 0,
        message: 'No capabilities found to delete'
      };
    }
    
    logger.info('Starting bulk capability deletion', {
      requestId,
      totalCapabilities: totalCount
    });
    
    // Delete all capabilities one by one
    let deletedCount = 0;
    const errors: any[] = [];
    
    for (const capability of allCapabilities) {
      try {
        const capabilityId = (capability as any).id;
        if (capabilityId) {
          await capabilityService.deleteCapabilityById(capabilityId);
          deletedCount++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to delete capability: ${(capability as any).id}`, {
          requestId,
          capabilityId: (capability as any).id,
          error: errorMessage
        });
        
        errors.push({
          id: (capability as any).id,
          resourceName: capability.resourceName,
          error: errorMessage
        });
      }
    }
    
    logger.info('Bulk capability deletion completed', {
      requestId,
      deleted: deletedCount,
      errors: errors.length,
      total: totalCount
    });
    
    const allDeleted = deletedCount === totalCount;
    
    return {
      success: allDeleted, // Only success if all deleted without errors
      operation: 'deleteAll',
      dataType: 'capabilities',
      deletedCount,
      totalCount,
      errorCount: errors.length,
      ...(errors.length > 0 && { errorDetails: errors }),
      message: allDeleted 
        ? `Deleted ${deletedCount} of ${totalCount} capabilities`
        : `Deleted ${deletedCount} of ${totalCount} capabilities (${errors.length} errors occurred)`,
      confirmation: allDeleted 
        ? 'All capability data has been permanently removed from the Vector DB'
        : `${deletedCount} capabilities removed, ${errors.length} operations failed`
    };
  } catch (error) {
    logger.error('Failed to delete all capabilities', error as Error, {
      requestId
    });
    
    return {
      success: false,
      operation: 'deleteAll',
      dataType: 'capabilities',
      error: {
        message: 'Failed to delete all capabilities',
        details: error instanceof Error ? error.message : String(error)
      }
    };
  }
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
      
      default:
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Unsupported data type: ${args.dataType}. Currently supported: pattern, capabilities`,
          {
            operation: 'data_type_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: { dataType: args.dataType, supportedTypes: ['pattern', 'capabilities'] }
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