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
import { CapabilityInferenceEngine } from '../core/capabilities';
import { getAndValidateSessionDirectory } from '../core/session-utils';
import { KubernetesDiscovery } from '../core/discovery';
import { EmbeddingService } from '../core/embedding-service';
import { ClaudeIntegration } from '../core/claude';
import { handlePolicyOperation as handlePolicyOperationCore } from '../core/policy-operations';
import { handlePatternOperation as handlePatternOperationCore } from '../core/pattern-operations';
import { handleCapabilityList, handleCapabilityGet, handleCapabilityDelete, handleCapabilityDeleteAll, handleCapabilityProgress, handleCapabilitySearch } from '../core/capability-operations';
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
  resourceList: z.string().optional().describe('Comma-separated list of resources to scan (format: Kind.group or Kind for core resources)')
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
        } else if (operation === 'search') {
          return await handleCapabilitySearch(args, logger, requestId, capabilityService);
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
 * Create user-friendly error message for resource definition failures
 */
function createResourceDefinitionErrorMessage(resourceName: string, error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  let userFriendlyMessage = `Cannot analyze resource '${resourceName}': `;
  
  if (errorMessage.includes('not found') || errorMessage.includes('NotFound')) {
    userFriendlyMessage += `Resource does not exist in cluster. Please ensure the CRD is installed.`;
  } else if (errorMessage.includes('connection refused') || errorMessage.includes('timeout')) {
    userFriendlyMessage += `Cannot connect to Kubernetes cluster. Please check cluster connectivity.`;
  } else if (errorMessage.includes('forbidden') || errorMessage.includes('Forbidden')) {
    userFriendlyMessage += `Insufficient permissions to read resource definitions. Please check RBAC settings.`;
  } else {
    userFriendlyMessage += `${errorMessage}`;
  }
  
  return userFriendlyMessage;
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
        
        return createCapabilityScanCompletionResponse(
          session.sessionId,
          totalResources,
          currentIndex, // Resources processed so far
          0,
          'stopped interactively',
          'manual',
          true // stopped = true
        );
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
    // Already imported at top of file
    
    // Validate Claude API key - skip in test environment
    const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!isTestEnvironment && !apiKey) {
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
    const claudeIntegration = new ClaudeIntegration(apiKey || 'test-api-key');
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
        
        return createCapabilityScanCompletionResponse(
          session.sessionId,
          totalResources,
          totalResources, // Assume all successful for manual mode
          0,
          'completed interactively',
          'manual'
        );
      }
      
      resourceName = session.selectedResources[currentIndex];
      if (!resourceName) {
        throw new Error(`No resource found at index ${currentIndex}`);
      }
    } else {
      throw new Error('Invalid selectedResources in session state');
    }
    
    // Get complete resource definition for comprehensive analysis
    let resourceDefinition: string | undefined;
    
    try {
      // Import and connect to discovery engine for kubectl access
      const discovery = new KubernetesDiscovery();
      await discovery.connect();
      
      // Get complete CRD definition if it's a custom resource
      if (resourceName.includes('.')) {
        const crdOutput = await discovery.executeKubectl(['get', 'crd', resourceName, '-o', 'yaml']);
        resourceDefinition = crdOutput;
        
        logger.info('Found complete CRD definition for capability analysis', {
          requestId,
          sessionId: session.sessionId,
          resource: resourceName,
          hasDefinition: !!resourceDefinition,
          definitionSize: resourceDefinition?.length || 0
        });
      } else {
        // For core resources, use kubectl explain to get schema information
        const explainOutput = await discovery.explainResource(resourceName);
        resourceDefinition = explainOutput;
        
        logger.info('Found core resource explanation for capability analysis', {
          requestId,
          sessionId: session.sessionId,
          resource: resourceName,
          hasDefinition: !!resourceDefinition
        });
      }
    } catch (error) {
      logger.error('Failed to retrieve resource definition for capability analysis', error as Error, {
        requestId,
        sessionId: session.sessionId,
        resource: resourceName
      });
      
      throw new Error(createResourceDefinitionErrorMessage(resourceName, error));
    }
    
    logger.info('Analyzing resource for capability inference', { 
      requestId, 
      sessionId: session.sessionId,
      resource: resourceName,
      mode: session.processingMode
    });
    
    if (session.processingMode === 'manual') {
      // Manual mode: Show capability data for user review
      const capability = await engine.inferCapabilities(resourceName, resourceDefinition);
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
      
      // Setup kubectl access for getting complete resource definitions
      let discovery: any;
      try {
        discovery = new KubernetesDiscovery();
        await discovery.connect();
        
        logger.info('Connected to Kubernetes for batch resource definition retrieval', {
          requestId,
          sessionId: session.sessionId
        });
      } catch (error) {
        logger.warn('Could not connect to Kubernetes for batch processing, falling back to name-based inference', {
          requestId,
          sessionId: session.sessionId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Process each resource in the batch with progress tracking
      for (let i = 0; i < resources.length; i++) {
        const currentResource = resources[i];
        
        // Get complete resource definition for this resource
        let currentResourceDefinition: string | undefined;
        
        if (discovery) {
          try {
            if (currentResource.includes('.')) {
              // Get complete CRD definition
              currentResourceDefinition = await discovery.executeKubectl(['get', 'crd', currentResource, '-o', 'yaml']);
            } else {
              // Get core resource explanation
              currentResourceDefinition = await discovery.explainResource(currentResource);
            }
          } catch (error) {
            logger.error(`Failed to get resource definition for ${currentResource}`, error as Error, {
              requestId,
              sessionId: session.sessionId,
              resource: currentResource
            });
            
            // Add to errors array and skip processing this resource
            errors.push({
              resource: currentResource,
              error: createResourceDefinitionErrorMessage(currentResource, error),
              timestamp: new Date().toISOString()
            });
            
            // Skip processing this resource
            continue;
          }
        }
        
        // Update progress before processing
        updateProgress(i + 1, currentResource, processedResults.length, errors.length, errors);
        
        try {
          logger.info(`Processing resource ${i + 1}/${totalResources}`, {
            requestId,
            sessionId: session.sessionId,
            resource: currentResource,
            percentage: Math.round(((i + 1) / totalResources) * 100)
          });
          
          const capability = await engine.inferCapabilities(currentResource, currentResourceDefinition);
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
      
      return createCapabilityScanCompletionResponse(
        session.sessionId,
        totalResources,
        successful,
        failed,
        completionData.totalProcessingTime || 'completed',
        'auto'
      );
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


