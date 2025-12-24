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
import { PatternVectorService, CapabilityVectorService } from '../core/index';
import { PolicyVectorService } from '../core/policy-vector-service';
import { getAndValidateSessionDirectory } from '../core/session-utils';
import { EmbeddingService } from '../core/embedding-service';
import { handlePolicyOperation as handlePolicyOperationCore } from '../core/policy-operations';
import { handlePatternOperation as handlePatternOperationCore } from '../core/pattern-operations';
import { handleCapabilityProgress, handleCapabilityCRUD } from '../core/capability-operations';
import { handleResourceSelection as handleResourceSelectionCore, handleResourceSpecification as handleResourceSpecificationCore, handleScanning as handleScanningCore } from '../core/capability-scan-workflow';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Tool metadata for MCP registration
export const ORGANIZATIONAL_DATA_TOOL_NAME = 'manageOrgData';
export const ORGANIZATIONAL_DATA_TOOL_DESCRIPTION = 'Unified tool for managing cluster data: organizational patterns, policy intents, and resource capabilities. For patterns and policies: supports create, list, get, delete, deleteAll, and search operations (patterns also support step-by-step creation workflow). For capabilities: supports scan, list, get, delete, deleteAll, and progress operations for cluster resource capability discovery and management. Use dataType parameter to specify what to manage: "pattern" for organizational patterns, "policy" for policy intents, "capabilities" for resource capabilities.';

// Extensible schema - supports patterns, policies, and capabilities
export const ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA = {
  dataType: z.enum(['pattern', 'policy', 'capabilities']).describe('Type of cluster data to manage: "pattern" for organizational patterns, "policy" for policy intents, "capabilities" for resource capabilities'),
  operation: z.enum(['create', 'list', 'get', 'delete', 'deleteAll', 'scan', 'analyze', 'progress', 'search']).describe('Operation to perform on the cluster data'),
  
  // Workflow fields for step-by-step pattern creation
  sessionId: z.string().optional().describe('Session ID (required for continuing workflow steps, optional for progress - uses latest session if omitted)'),
  step: z.string().optional().describe('Current workflow step (required when sessionId is provided)'),
  response: z.string().optional().describe('User response to previous workflow step question'),
  
  // Generic fields for get/delete/search operations
  id: z.string().optional().describe('Data item ID (required for get/delete operations) or search query (required for search operations)'),
  
  // Generic fields for list operations
  limit: z.number().optional().describe('Maximum number of items to return (default: 10)'),
  
  // Resource-specific fields (for capabilities operations)
  resource: z.object({
    kind: z.string(),
    group: z.string(),
    apiVersion: z.string()
  }).optional().describe('Kubernetes resource reference (for capabilities operations)'),
  
  // Resource list for specific resource scanning
  resourceList: z.string().optional().describe('Comma-separated list of resources to scan (format: Kind.group or Kind for core resources)'),

  // Fire-and-forget scan mode (for controller integration)
  mode: z.enum(['full']).optional().describe('Scan mode: "full" triggers a fire-and-forget full cluster scan that returns immediately. Use with resourceList for targeted fire-and-forget scans.'),

  // Collection name for capabilities (allows using different collections for different purposes)
  collection: z.string().optional().describe('Collection name for capabilities operations (default: "capabilities", use "capabilities-policies" for pre-populated test data)'),
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.')
};

/**
 * Validate Vector DB connection and return helpful error if unavailable
 */
async function validateVectorDBConnection(
  vectorService: PatternVectorService | PolicyVectorService,
  logger: Logger,
  requestId: string
): Promise<{ success: boolean; error?: any }> {
  const isHealthy = await vectorService.healthCheck();
  
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
 * Create standardized capability scan completion response
 */
function createCapabilityScanCompletionResponse(
  sessionId: string,
  totalProcessed: number,
  successful: number,
  failed: number,
  processingTime: string,
  mode: 'auto' | 'manual',
  stopped: boolean = false
): any {
  
  let message: string;
  if (stopped) {
    message = `⏹️ Capability scan stopped by user after processing ${successful} of ${totalProcessed} resources.`;
  } else if (failed > 0) {
    message = `✅ Capability scan completed with ${failed} errors. ${successful}/${totalProcessed} resources processed successfully.`;
  } else {
    message = `✅ Capability scan completed successfully! Processed ${totalProcessed} resources.`;
  }

  return {
    success: true,
    operation: 'scan',
    dataType: 'capabilities',
    mode: mode,
    step: 'complete',
    sessionId: sessionId,
    summary: {
      totalScanned: totalProcessed,
      successful: successful,
      failed: failed,
      processingTime: processingTime,
      ...(stopped && { stopped: true })
    },
    message: message,
    availableOptions: {
      viewResults: "Use 'list' operation to browse all discovered capabilities",
      getDetails: "Use 'get' operation with capability ID to view specific capability details", 
      checkStatus: successful > 0 ? "Capabilities are now available for AI-powered recommendations" : "No capabilities were stored"
    },
    userNote: "The above options are available for you to choose from - the system will not execute them automatically."
  };
}


/**
 * Handle fire-and-forget capability scanning (PRD #216 - Controller Integration)
 *
 * This function provides a simplified API for automated controllers to trigger
 * capability scans without going through the interactive workflow.
 *
 * Two modes:
 * 1. mode: "full" - Triggers full cluster scan
 * 2. resourceList: "Kind.group,Kind.group" - Triggers targeted scan
 *
 * Both modes return immediately with { status: "started" } and run scanning in background.
 */
async function handleFireAndForgetScan(
  args: any,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService
): Promise<any> {
  const isFullScan = args.mode === 'full';
  const isTargetedScan = !!args.resourceList;

  logger.info('Fire-and-forget scan initiated', {
    requestId,
    mode: isFullScan ? 'full' : 'targeted',
    resourceList: args.resourceList
  });

  // Create a session for progress tracking (controllers can optionally poll for status)
  const sessionId = `cap-scan-${Date.now()}-${randomUUID().substring(0, 8)}`;
  const session: CapabilityScanSession = {
    sessionId,
    currentStep: 'scanning',
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    selectedResources: isFullScan ? 'all' : undefined,
    resourceList: args.resourceList,
    currentResourceIndex: 0
  };

  // If targeted scan, parse and validate resources
  if (isTargetedScan && !isFullScan) {
    const resources = args.resourceList.split(',').map((r: string) => r.trim()).filter((r: string) => r.length > 0);
    if (resources.length === 0) {
      return {
        success: false,
        operation: 'scan',
        dataType: 'capabilities',
        error: {
          message: 'Empty resource list',
          details: 'resourceList parameter must contain at least one resource'
        }
      };
    }
    session.selectedResources = resources;
  }

  // Save session for progress tracking
  saveCapabilitySession(session);

  // Start scanning in background (don't await) - fire and forget
  handleScanningCore(
    session,
    { ...args, response: undefined },
    logger,
    requestId,
    capabilityService,
    parseNumericResponse,
    transitionCapabilitySession,
    cleanupCapabilitySession,
    createCapabilityScanCompletionResponse
  ).catch(error => {
    logger.error('Background fire-and-forget scan failed', error as Error, {
      requestId,
      sessionId: session.sessionId,
      mode: isFullScan ? 'full' : 'targeted'
    });
  });

  // Return immediately - don't wait for scan to complete
  const resourceCount = isTargetedScan && !isFullScan
    ? args.resourceList.split(',').filter((r: string) => r.trim().length > 0).length
    : undefined;

  return {
    success: true,
    operation: 'scan',
    dataType: 'capabilities',
    status: 'started',
    mode: isFullScan ? 'full' : 'targeted',
    sessionId: session.sessionId,
    message: isFullScan
      ? 'Full cluster scan initiated. Scan runs in background.'
      : `Scan initiated for ${resourceCount} resource(s). Scan runs in background.`,
    ...(resourceCount && { resourceCount }),
    checkProgress: {
      dataType: 'capabilities',
      operation: 'progress',
      sessionId: session.sessionId
    }
  };
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
    case 'search':
    case 'delete':
    case 'deleteAll':
      return await handleCapabilityCRUD(operation, args, logger, requestId);
    
    default:
      return createUnsupportedOperationError(operation, 'capabilities', ['scan', 'progress', 'list', 'get', 'search', 'delete', 'deleteAll']);
  }
}

/**
 * Create unsupported operation error response
 */
function createUnsupportedOperationError(operation: string, dataType: string, supportedOperations: string[]) {
  return {
    success: false,
    operation,
    dataType,
    error: {
      message: `Unsupported ${dataType} operation: ${operation}`,
      supportedOperations
    }
  };
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
  currentStep: 'resource-selection' | 'resource-specification' | 'scanning' | 'complete';
  selectedResources?: string[] | 'all';
  resourceList?: string;
  currentResourceIndex?: number; // Track which resource we're currently processing (for multi-resource workflows)
  progress?: ProgressData; // Progress tracking for long-running operations
  startedAt: string;
  lastActivity: string;
}

/**
 * Get session file path following established pattern
 */
function getCapabilitySessionPath(sessionId: string): string {
  const sessionDir = getAndValidateSessionDirectory(false);
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
function loadCapabilitySession(sessionId: string): CapabilityScanSession | null {
  try {
    const sessionPath = getCapabilitySessionPath(sessionId);
    if (!fs.existsSync(sessionPath)) {
      return null;
    }
    
    const sessionData = fs.readFileSync(sessionPath, 'utf8');
    const session = JSON.parse(sessionData) as CapabilityScanSession;
    
    // Update last activity
    session.lastActivity = new Date().toISOString();
    saveCapabilitySession(session);
    
    return session;
  } catch (error) {
    // Log error but don't throw - return null to create new session
    return null;
  }
}

/**
 * Save session to file system following established pattern
 */
function saveCapabilitySession(session: CapabilityScanSession): void {
  try {
    const sessionPath = getCapabilitySessionPath(session.sessionId);
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
    const existing = loadCapabilitySession(sessionId);
    if (existing) {
      logger.info('Loaded existing capability session', { 
        requestId, 
        sessionId, 
        currentStep: existing.currentStep 
      });
      return existing;
    }
  }
  
  // Create new session with unique ID (timestamp + UUID for concurrent request safety)
  const newSessionId = sessionId || `cap-scan-${Date.now()}-${randomUUID().substring(0, 8)}`;
  const session: CapabilityScanSession = {
    sessionId: newSessionId,
    currentStep: 'resource-selection',
    startedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };
  
  saveCapabilitySession(session);
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
function transitionCapabilitySession(session: CapabilityScanSession, nextStep: CapabilityScanSession['currentStep'], updates: Partial<CapabilityScanSession>): void {
  session.currentStep = nextStep;
  session.lastActivity = new Date().toISOString();
  
  if (updates) {
    Object.assign(session, updates);
  }
  
  saveCapabilitySession(session);
}

/**
 * Clean up session file after successful completion
 */
function cleanupCapabilitySession(session: CapabilityScanSession, args: any, logger: Logger, requestId: string): void {
  try {
    const sessionPath = getCapabilitySessionPath(session.sessionId);
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
  // Use collection from args if provided (for testing with pre-populated data)
  const capabilityService = new CapabilityVectorService(args.collection);
  
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

  // Check embedding service (OpenAI API) availability - skip for workflow continuations
  const isWorkflowContinuation = args.sessionId && args.step;
  if (!isWorkflowContinuation) {
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
  }

  logger.info('Capability scanning dependencies validated', {
    requestId,
    vectorDB: 'healthy',
    embeddings: 'available'
  });

  // ============================================================================
  // FIRE-AND-FORGET MODE (PRD #216 - Controller Integration)
  // ============================================================================
  // Check for fire-and-forget parameters BEFORE interactive workflow
  // This allows controllers to trigger scans without going through the interactive steps
  // ============================================================================

  const isFireAndForget = !args.sessionId && (args.mode === 'full' || args.resourceList);

  if (isFireAndForget) {
    return await handleFireAndForgetScan(args, logger, requestId, capabilityService);
  }

  // ============================================================================
  // INTERACTIVE WORKFLOW MODE (Existing behavior for human users)
  // ============================================================================

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
      return await handleResourceSelectionCore(
        session,
        args,
        logger,
        requestId,
        capabilityService,
        parseNumericResponse,
        transitionCapabilitySession,
        cleanupCapabilitySession,
        createCapabilityScanCompletionResponse,
        handleScanningCore
      );

    case 'resource-specification':
      return await handleResourceSpecificationCore(
        session,
        args,
        logger,
        requestId,
        capabilityService,
        parseNumericResponse,
        transitionCapabilitySession,
        cleanupCapabilitySession,
        createCapabilityScanCompletionResponse,
        handleScanningCore
      );

    case 'scanning':
      return await handleScanningCore(
        session,
        args,
        logger,
        requestId,
        capabilityService,
        parseNumericResponse,
        transitionCapabilitySession,
        cleanupCapabilitySession,
        createCapabilityScanCompletionResponse
      );
    
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
        result = await handlePatternOperationCore(args.operation, args, logger, requestId, validateVectorDBConnection, validateEmbeddingService);
        break;
      
      case 'policy':
        result = await handlePolicyOperationCore(args.operation, args, logger, requestId, validateVectorDBConnection, validateEmbeddingService);
        break;
      
      case 'capabilities':
        result = await handleCapabilitiesOperation(args.operation, args, logger, requestId);
        break;
      
      default:
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Unsupported data type: ${args.dataType}. Currently supported: pattern, policy, capabilities`,
          {
            operation: 'data_type_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: { dataType: args.dataType, supportedTypes: ['pattern', 'policy', 'capabilities'] }
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


