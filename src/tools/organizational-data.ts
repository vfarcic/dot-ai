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
export const ORGANIZATIONAL_DATA_TOOL_DESCRIPTION = 'Unified tool for managing cluster data: organizational patterns (available now), resource capabilities (PRD #48), and resource dependencies (PRD #49). For patterns: supports step-by-step creation workflow. For capabilities/dependencies: returns implementation status. Use dataType parameter to specify what to manage: "pattern" for organizational patterns, "capabilities" for resource capabilities, "dependencies" for resource dependencies.';

// Extensible schema - supports patterns, capabilities, and dependencies
export const ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA = {
  dataType: z.enum(['pattern', 'capabilities', 'dependencies']).describe('Type of cluster data to manage: pattern (organizational patterns), capabilities (resource capabilities), dependencies (resource dependencies)'),
  operation: z.enum(['create', 'list', 'get', 'delete', 'scan', 'analyze']).describe('Operation to perform on the cluster data'),
  
  // Workflow fields for step-by-step pattern creation
  sessionId: z.string().optional().describe('Pattern creation session ID (for continuing multi-step workflow)'),
  step: z.string().optional().describe('Current workflow step (required when sessionId is provided)'),
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
  }).optional().describe('Kubernetes resource reference (for capabilities/dependencies operations)'),
  
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
    
    case 'list':
    case 'get': {
      // Create and initialize capability service for list/get operations
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
        } else {
          return await handleCapabilityGet(args, logger, requestId, capabilityService);
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
          supportedOperations: ['scan', 'list', 'get']
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
interface CapabilityScanSession {
  sessionId: string;
  currentStep: 'resource-selection' | 'resource-specification' | 'processing-mode' | 'scanning' | 'complete';
  selectedResources?: string[] | 'all';
  resourceList?: string;
  processingMode?: 'auto' | 'manual';
  currentResourceIndex?: number; // Track which resource we're currently processing (for multi-resource workflows)
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
      // For 'all' mode, use a sample resource (could be enhanced to discover actual resources)
      resourceName = 'SQL.devopstoolkit.live';
      currentIndex = 1;
      totalResources = 1;
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
      const resources = Array.isArray(session.selectedResources) ? session.selectedResources : [resourceName];
      const totalResources = resources.length;
      const processedResults: any[] = [];
      const errors: any[] = [];
      
      logger.info('Starting auto batch processing', {
        requestId,
        sessionId: session.sessionId,
        totalResources,
        resources: resources
      });
      
      // Process each resource in the batch
      for (let i = 0; i < resources.length; i++) {
        const currentResource = resources[i];
        const currentContext = `
Resource Name: ${currentResource}
Context: This is a Kubernetes resource that the user wants to analyze for capabilities.
The AI should infer what this resource does based on its name and provide comprehensive capability analysis.`;
        
        try {
          logger.info(`Processing resource ${i + 1}/${totalResources}`, {
            requestId,
            sessionId: session.sessionId,
            resource: currentResource
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
            capabilitiesFound: capability.capabilities.length
          });
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          logger.error(`Failed to process resource ${i + 1}/${totalResources}`, error as Error, {
            requestId,
            sessionId: session.sessionId,
            resource: currentResource
          });
          
          errors.push({
            resource: currentResource,
            error: errorMessage,
            index: i + 1
          });
        }
      }
      
      // Mark session as complete and cleanup
      transitionCapabilitySession(session, 'complete', {}, args);
      cleanupCapabilitySession(session, args, logger, requestId);
      
      const successful = processedResults.length;
      const failed = errors.length;
      
      logger.info('Auto batch processing completed', {
        requestId,
        sessionId: session.sessionId,
        processed: totalResources,
        successful,
        failed
      });
      
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
          ...(errors.length > 0 && { errors })
        },
        message: failed > 0 ? 
          `Capability scan completed with ${failed} errors. ${successful}/${totalResources} resources processed successfully.` :
          'Capability scan completed successfully for all resources.',
        sample: processedResults.length > 0 ? processedResults[0] : undefined
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
      data: capabilities,
      metadata: {
        returned: capabilities.length,
        total: count,
        limit
      },
      message: `Retrieved ${capabilities.length} capabilities (${count} total)`
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
    if (!args.resourceName) {
      return {
        success: false,
        operation: 'get',
        dataType: 'capabilities',
        error: {
          message: 'Missing required parameter: resourceName',
          details: 'Specify resourceName to retrieve capability data',
          example: { resourceName: 'sqls.devopstoolkit.live' }
        }
      };
    }
    
    // Get capability by resource name
    const capability = await capabilityService.getCapability(args.resourceName);
    
    if (!capability) {
      logger.warn('Capability not found', {
        requestId,
        resourceName: args.resourceName
      });
      
      return {
        success: false,
        operation: 'get',
        dataType: 'capabilities',
        error: {
          message: `Capability not found for resource: ${args.resourceName}`,
          details: 'Resource capability may not have been scanned yet',
          suggestion: 'Use scan operation to analyze this resource first'
        }
      };
    }
    
    logger.info('Capability retrieved successfully', {
      requestId,
      resourceName: args.resourceName,
      capabilitiesFound: capability.capabilities.length,
      confidence: capability.confidence
    });
    
    return {
      success: true,
      operation: 'get',
      dataType: 'capabilities',
      data: capability,
      message: `Retrieved capability data for ${args.resourceName}`
    };
  } catch (error) {
    logger.error('Failed to get capability', error as Error, {
      requestId,
      resourceName: args.resourceName
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