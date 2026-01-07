/**
 * Core Policy Operations
 * 
 * Handles policy intent management operations including CRUD operations
 * and Kyverno cluster policy cleanup
 */

import { ErrorHandler, ErrorCategory, ErrorSeverity, Logger } from './error-handling';
import { PolicyVectorService } from './policy-vector-service';
import { VectorDBService } from './vector-db-service';
import { UnifiedCreationSessionManager } from './unified-creation-session';
import { executeKubectl } from './kubernetes-utils';
import { maybeGetFeedbackMessage } from './index';
import { VALIDATION_MESSAGES } from './constants/validation';
import { AI_SERVICE_ERROR_TEMPLATES } from './constants';

// Note: validateVectorDBConnection and validateEmbeddingService are shared utilities
// that remain in the main organizational-data.ts file as they're used by multiple domains

/**
 * Get initialized policy service
 */
export async function getPolicyService(): Promise<PolicyVectorService> {
  const policyService = new PolicyVectorService();
  
  // Always ensure proper collection initialization
  try {
    await policyService.initialize();
  } catch (error) {
    // If initialization fails, try to provide helpful error context
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Vector DB collection initialization failed: ${errorMessage}. This may be due to dimension mismatch or collection configuration issues.`);
  }
  
  return policyService;
}


/**
 * Find Kyverno policies by policy intent ID using label selector
 */
export async function findKyvernoPoliciesByPolicyId(
  policyId: string,
  logger: Logger,
  requestId: string
): Promise<any[]> {
  try {
    logger.info('Searching for Kyverno policies by policy ID', { 
      requestId, 
      policyId
    });
    
    const output = await executeKubectl(['get', 'clusterpolicy', '-l', `policy-intent/id=${policyId}`, '-o', 'json'], {
      kubeconfig: process.env.KUBECONFIG,
      timeout: 15000
    });
    
    const parsedOutput = JSON.parse(output || '{"items": []}');
    const policies = parsedOutput.items || [];
    
    logger.info('Found Kyverno policies for policy intent', { 
      requestId, 
      policyId,
      policyCount: policies.length,
      policyNames: policies.map((p: any) => p.metadata?.name)
    });
    
    return policies.map((p: any) => ({
      name: p.metadata?.name,
      labels: p.metadata?.labels,
      creationTimestamp: p.metadata?.creationTimestamp
    }));
    
  } catch (error) {
    logger.warn('Failed to query Kyverno policies (cluster may not have Kyverno or no policies found)', { 
      requestId, 
      policyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

/**
 * Find all Kyverno policies that have policy-intent/id labels
 */
export async function findAllKyvernoPoliciesForPolicyIntents(
  logger: Logger,
  requestId: string
): Promise<any[]> {
  try {
    logger.info('Searching for all Kyverno policies with policy-intent labels', { 
      requestId
    });
    
    const output = await executeKubectl(['get', 'clusterpolicy', '-l', 'policy-intent/id', '-o', 'json'], {
      kubeconfig: process.env.KUBECONFIG,
      timeout: 15000
    });
    
    const parsedOutput = JSON.parse(output || '{"items": []}');
    const policies = parsedOutput.items || [];
    
    logger.info('Found all Kyverno policies for policy intents', { 
      requestId,
      policyCount: policies.length,
      policyNames: policies.map((p: any) => p.metadata?.name)
    });
    
    return policies.map((p: any) => ({
      name: p.metadata?.name,
      policyId: p.metadata?.labels?.['policy-intent/id'],
      labels: p.metadata?.labels,
      creationTimestamp: p.metadata?.creationTimestamp
    }));
    
  } catch (error) {
    logger.warn('Failed to query all Kyverno policies (cluster may not have Kyverno or no policies found)', { 
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

/**
 * Delete Kyverno policies by policy intent ID using label selector
 */
export async function deleteKyvernoPoliciesByPolicyId(
  policyId: string,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Deleting Kyverno policies by policy ID', { 
      requestId, 
      policyId
    });
    
    const output = await executeKubectl(['delete', 'clusterpolicy', '-l', `policy-intent/id=${policyId}`], {
      kubeconfig: process.env.KUBECONFIG,
      timeout: 30000
    });
    
    logger.info('Kyverno policies deleted successfully', { 
      requestId, 
      policyId,
      output
    });
    
    return {
      successful: [{ policyId, deletedAt: new Date().toISOString() }],
      failed: [],
      total: 1
    };
    
  } catch (error) {
    logger.error('Failed to delete Kyverno policies', error as Error, { 
      requestId, 
      policyId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return {
      successful: [],
      failed: [{ policyId, error: error instanceof Error ? error.message : String(error) }],
      total: 1
    };
  }
}

/**
 * Delete all Kyverno policies that have policy-intent/id labels
 */
export async function deleteAllKyvernoPoliciesForPolicyIntents(
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Deleting all Kyverno policies with policy-intent labels', { 
      requestId
    });
    
    const output = await executeKubectl(['delete', 'clusterpolicy', '-l', 'policy-intent/id'], {
      kubeconfig: process.env.KUBECONFIG,
      timeout: 30000
    });
    
    logger.info('All Kyverno policies deleted successfully', { 
      requestId,
      output
    });
    
    return {
      successful: [{ deletedAt: new Date().toISOString() }],
      failed: [],
      total: 1
    };
    
  } catch (error) {
    logger.error('Failed to delete all Kyverno policies', error as Error, { 
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return {
      successful: [],
      failed: [{ error: error instanceof Error ? error.message : String(error) }],
      total: 1
    };
  }
}

/**
 * Handle individual policy delete with Kyverno cleanup
 */
export async function handlePolicyDelete(
  policyId: string,
  policyService: any,
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    // Check if policy intent exists
    const existingPolicyIntent = await policyService.getPolicyIntent(policyId);
    if (!existingPolicyIntent) {
      return {
        success: false,
        operation: 'delete',
        dataType: 'policy',
        message: `Policy intent not found: ${policyId}`,
        error: 'Policy intent not found'
      };
    }

    // Check if there are deployed Kyverno policies with this policy ID
    const kyvernoPolicies = await findKyvernoPoliciesByPolicyId(policyId, logger, requestId);
    
    if (kyvernoPolicies.length > 0 && !args.response) {
      // Show confirmation prompt for Kyverno cleanup
      return {
        success: true,
        operation: 'delete',
        dataType: 'policy',
        requiresConfirmation: true,
        message: 'Policy intent has deployed Kyverno policies that need cleanup decision',
        confirmation: {
          question: `Policy intent "${existingPolicyIntent.description.substring(0, 60)}..." has ${kyvernoPolicies.length} deployed Kyverno policies in your cluster: ${kyvernoPolicies.map(p => p.name).join(', ')}\n\n**Choose what to do:**\n\n1. **Delete everything** - Remove policy intent AND delete Kyverno policies from cluster\n2. **Keep Kyverno policies** - Remove policy intent only, preserve cluster policies\n\n⚠️ **Warning**: Option 1 will remove active policy enforcement from your cluster.\n\n**What would you like to do?**`,
          options: ['Delete everything', 'Keep Kyverno policies']
        },
        policyIntent: existingPolicyIntent,
        kyvernoPolicies: kyvernoPolicies
      };
    }

    // Process user's response or proceed with direct deletion
    let kyvernoCleanupResults = null;
    
    if (kyvernoPolicies.length > 0 && args.response) {
      const response = args.response.trim();
      if (response === '1' || response.toLowerCase().includes('delete everything')) {
        // Delete Kyverno policies from cluster
        kyvernoCleanupResults = await deleteKyvernoPoliciesByPolicyId(policyId, logger, requestId);
      }
    }

    // Always delete the policy intent from Vector DB
    await policyService.deletePolicyIntent(policyId);
    
    const cleanupMessage = kyvernoCleanupResults 
      ? `with Kyverno cleanup (${kyvernoCleanupResults.successful.length} deleted, ${kyvernoCleanupResults.failed.length} failed)`
      : kyvernoPolicies.length > 0 
        ? '(Kyverno policies preserved in cluster)'
        : '(no Kyverno policies to cleanup)';

    return {
      success: true,
      operation: 'delete',
      dataType: 'policy',
      message: `Policy intent deleted successfully ${cleanupMessage}`,
      deletedPolicyIntent: existingPolicyIntent,
      kyvernoCleanup: kyvernoCleanupResults || { preserved: true }
    };
    
  } catch (error) {
    logger.error('Failed to delete policy intent', error as Error, { requestId, policyId });
    return {
      success: false,
      operation: 'delete',
      dataType: 'policy',
      message: 'Failed to delete policy intent',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Handle deleteAll policies with batch Kyverno cleanup
 */
export async function handlePolicyDeleteAll(
  policyService: any,
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    // Get all policy intents
    const allPolicyIntents = await policyService.getAllPolicyIntents();
    
    if (!allPolicyIntents || allPolicyIntents.length === 0) {
      return {
        success: true,
        operation: 'deleteAll',
        dataType: 'policy',
        message: 'No policy intents found to delete',
        deletedCount: 0
      };
    }

    // Find all deployed Kyverno policies for all policy intents
    const allKyvernoPolicies = await findAllKyvernoPoliciesForPolicyIntents(logger, requestId);
    
    if (allKyvernoPolicies.length > 0 && !args.response) {
      // Show confirmation prompt for batch Kyverno cleanup
      return {
        success: true,
        operation: 'deleteAll',
        dataType: 'policy',
        requiresConfirmation: true,
        message: 'Found policy intents with deployed Kyverno policies that need cleanup decision',
        confirmation: {
          question: `Deleting ${allPolicyIntents.length} policy intents. Found ${allKyvernoPolicies.length} deployed Kyverno policies in your cluster: ${allKyvernoPolicies.map(p => p.name).join(', ')}\n\n**Choose what to do:**\n\n1. **Delete everything** - Remove all policy intents AND delete all Kyverno policies from cluster\n2. **Keep Kyverno policies** - Remove all policy intents only, preserve all cluster policies\n\n⚠️ **Warning**: Option 1 will remove ALL active policy enforcement from your cluster.\n\n**What would you like to do?**`,
          options: ['Delete everything', 'Keep Kyverno policies']
        },
        policyIntents: allPolicyIntents,
        kyvernoPolicies: allKyvernoPolicies
      };
    }

    // Process user's response or proceed with direct deletion
    let kyvernoCleanupResults = null;
    
    if (allKyvernoPolicies.length > 0 && args.response) {
      const response = args.response.trim();
      if (response === '1' || response.toLowerCase().includes('delete everything')) {
        // Delete all Kyverno policies from cluster
        kyvernoCleanupResults = await deleteAllKyvernoPoliciesForPolicyIntents(logger, requestId);
      }
    }

    // Always delete all policy intents from Vector DB
    for (const policyIntent of allPolicyIntents) {
      await policyService.deletePolicyIntent(policyIntent.id);
    }
    
    const cleanupMessage = kyvernoCleanupResults 
      ? `with Kyverno cleanup (${kyvernoCleanupResults.successful.length} deleted, ${kyvernoCleanupResults.failed.length} failed)`
      : allKyvernoPolicies.length > 0 
        ? '(Kyverno policies preserved in cluster)'
        : '(no Kyverno policies to cleanup)';

    return {
      success: true,
      operation: 'deleteAll',
      dataType: 'policy',
      message: `All ${allPolicyIntents.length} policy intents deleted successfully ${cleanupMessage}`,
      deletedCount: allPolicyIntents.length,
      deletedPolicyIntents: allPolicyIntents,
      kyvernoCleanup: kyvernoCleanupResults || { preserved: true }
    };
    
  } catch (error) {
    logger.error('Failed to delete all policy intents', error as Error, { requestId });
    return {
      success: false,
      operation: 'deleteAll',
      dataType: 'policy',
      message: 'Failed to delete all policy intents',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Main policy operations handler - delegates to specific operation functions
 * Requires shared validation utilities to be passed as parameters to avoid circular imports
 */
export async function handlePolicyOperation(
  operation: string,
  args: any,
  logger: Logger,
  requestId: string,
  validateVectorDBConnection: (vectorService: PolicyVectorService, logger: Logger, requestId: string) => Promise<{ success: boolean; error?: any }>,
  validateEmbeddingService: (logger: Logger, requestId: string) => Promise<{ success: boolean; error?: any }>
): Promise<any> {
  // Get policy service and validate Vector DB connection
  const policyService = await getPolicyService();
  const connectionCheck = await validateVectorDBConnection(policyService, logger, requestId);
  
  if (!connectionCheck.success) {
    return {
      success: false,
      operation,
      dataType: 'policy',
      error: connectionCheck.error,
      message: 'Vector DB connection required for policy management'
    };
  }

  // Validate embedding service and fail if unavailable (except for delete operations)
  const operationsRequiringEmbedding = ['create', 'search'];
  if (operationsRequiringEmbedding.includes(operation)) {
    const embeddingCheck = await validateEmbeddingService(logger, requestId);
    
    if (!embeddingCheck.success) {
      return {
        success: false,
        operation,
        dataType: 'policy',
        error: embeddingCheck.error,
        message: AI_SERVICE_ERROR_TEMPLATES.OPENAI_KEY_REQUIRED('policy management')
      };
    }
  }

  const sessionManager = new UnifiedCreationSessionManager('policy');

  switch (operation) {
    case 'create': {
      let workflowStep;
      
      if (args.sessionId) {
        // Continue existing session
        logger.info('Continuing policy creation workflow', { 
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
                operation: 'policy_workflow_continue',
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
              operation: 'policy_workflow_continue',
              component: 'OrganizationalDataTool',
              requestId,
              input: { sessionId: args.sessionId }
            }
          );
        }
      } else {
        // Start new workflow session
        logger.info('Starting new policy creation workflow', { requestId });
        
        const session = sessionManager.createSession(args);
        workflowStep = await sessionManager.getNextWorkflowStep(session, args);
        
        if (!workflowStep) {
          throw ErrorHandler.createError(
            ErrorCategory.OPERATION,
            ErrorSeverity.HIGH,
            'Failed to initialize policy creation workflow',
            {
              operation: 'policy_workflow_start',
              component: 'OrganizationalDataTool',
              requestId
            }
          );
        }
      }

      // Always check if workflow is complete and store policy in Vector DB
      let storageInfo: any = {};
      
      const isComplete = !('nextStep' in workflowStep) || !workflowStep.nextStep; // Complete when no next step
      const hasPolicy = !!workflowStep.data?.policy;
      
      logger.info('Checking workflow completion', {
        requestId,
        nextStep: ('nextStep' in workflowStep) ? workflowStep.nextStep : 'complete',
        hasPolicy,
        policyId: workflowStep.data?.policy?.id
      });
      
      if (isComplete && hasPolicy) {
        try {
          await policyService.storePolicyIntent(workflowStep.data.policy);
          const vectorDBConfig = new VectorDBService({ collectionName: 'policies' }).getConfig();
          storageInfo = {
            stored: true,
            vectorDbUrl: vectorDBConfig.url,
            collectionName: vectorDBConfig.collectionName,
            policyId: workflowStep.data.policy.id
          };
          
          logger.info('Policy stored in Vector DB successfully', { 
            requestId, 
            policyId: workflowStep.data.policy.id,
            description: workflowStep.data.policy.description.substring(0, 50) + (workflowStep.data.policy.description.length > 50 ? '...' : '')
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          storageInfo = {
            stored: false,
            error: errorMessage,
            policyId: workflowStep.data.policy.id
          };
          
          logger.error('Failed to store policy in Vector DB', error instanceof Error ? error : new Error(String(error)), { 
            requestId, 
            policyId: workflowStep.data.policy.id
          });
        }
      }
      
      // For completed policies, storage failure means creation failure
      const storageSucceeded = storageInfo.stored === true;
      const operationSucceeded = !isComplete || storageSucceeded;

      // Check if we should show feedback message (workflow completion point)
      const feedbackMessage = (isComplete && storageSucceeded) ? maybeGetFeedbackMessage() : '';

      return {
        success: operationSucceeded,
        operation: 'create',
        dataType: 'policy',
        workflow: workflowStep,
        storage: storageInfo,
        message: isComplete ?
          (storageSucceeded ? `Policy created and stored successfully${feedbackMessage}` : 'Policy creation failed - storage error') :
          'Workflow step ready'
      };
    }

    case 'list': {
      const limit = args.limit || 10;
      const policyIntents = await policyService.getAllPolicyIntents();
      const totalCount = await policyService.getPolicyIntentsCount();

      const limitedPolicyIntents = policyIntents.slice(0, limit);

      return {
        success: true,
        operation,
        dataType: 'policy',
        message: `Found ${totalCount} policy intents (showing ${limitedPolicyIntents.length})`,
        policyIntents: limitedPolicyIntents,
        totalCount,
        note: totalCount > limit ? `Showing first ${limit} of ${totalCount} policy intents. Use limit parameter to see more.` : undefined
      };
    }

    case 'get': {
      if (!args.id) {
        return {
          success: false,
          operation,
          dataType: 'policy',
          message: 'Policy intent ID is required for get operation',
          error: VALIDATION_MESSAGES.MISSING_PARAMETER('id')
        };
      }

      const policyIntent = await policyService.getPolicyIntent(args.id);
      
      if (!policyIntent) {
        return {
          success: false,
          operation,
          dataType: 'policy',
          message: `Policy intent not found: ${args.id}`,
          error: 'Policy intent not found'
        };
      }

      return {
        success: true,
        operation,
        dataType: 'policy',
        message: 'Policy intent retrieved successfully',
        policyIntent
      };
    }

    case 'search': {
      if (!args.id) { // For search, 'id' parameter contains the search query
        return {
          success: false,
          operation,
          dataType: 'policy',
          message: 'Search query is required (use id parameter)',
          error: VALIDATION_MESSAGES.MISSING_PARAMETER_WITH_CONTEXT('id', 'search query')
        };
      }

      const limit = args.limit || 10;
      const searchResults = await policyService.searchPolicyIntents(args.id, { limit });

      return {
        success: true,
        operation,
        dataType: 'policy',
        message: `Found ${searchResults.length} policy intents matching "${args.id}"`,
        policyIntents: searchResults.map(result => result.data),
        searchResults: searchResults.map(result => ({
          policyIntent: result.data,
          score: result.score
        }))
      };
    }

    case 'delete': {
      if (!args.id) {
        return {
          success: false,
          operation,
          dataType: 'policy',
          message: 'Policy intent ID is required for delete operation',
          error: VALIDATION_MESSAGES.MISSING_PARAMETER('id')
        };
      }

      return await handlePolicyDelete(args.id, policyService, args, logger, requestId);
    }

    case 'deleteAll': {
      return await handlePolicyDeleteAll(policyService, args, logger, requestId);
    }

    default:
      return {
        success: false,
        operation,
        dataType: 'policy',
        message: `Unsupported operation: ${operation}. Supported operations: create, list, get, search, delete, deleteAll`,
        error: 'Unsupported operation'
      };
  }
}