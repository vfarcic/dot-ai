/**
 * Core Capability Scan Workflow
 * 
 * Handles the step-by-step capability scanning workflow including resource selection,
 * specification, processing mode selection, and the actual scanning process
 */

import { Logger } from './error-handling';
import { CapabilityVectorService } from './capability-vector-service';
import { KubernetesDiscovery } from './discovery';
import { CapabilityInferenceEngine } from './capabilities';
import { createAIProvider } from './ai-provider-factory';

// Types for shared utility functions (dependency injection)
export type TransitionCapabilitySessionFn = (session: CapabilityScanSession, nextStep: CapabilityScanSession['currentStep'], updates: Partial<CapabilityScanSession>, args: any) => void;
export type CleanupCapabilitySessionFn = (session: CapabilityScanSession, args: any, logger: Logger, requestId: string) => void;
export type ParseNumericResponseFn = (response: string, validOptions: string[]) => string;
export type CreateCapabilityScanCompletionResponseFn = (sessionId: string, totalProcessed: number, successful: number, failed: number, processingTime: string, mode: 'auto' | 'manual', stopped?: boolean) => any;

// Progress tracking interface
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
  errors: any[];
}

// Session interface (should be imported from shared types, but defining here for now)
interface CapabilityScanSession {
  sessionId: string;
  currentStep: 'resource-selection' | 'resource-specification' | 'processing-mode' | 'scanning' | 'complete';
  selectedResources?: string[] | 'all';
  resourceList?: string;
  processingMode?: 'auto' | 'manual';
  currentResourceIndex?: number;
  progress?: any; // Progress tracking for long-running operations
  startedAt: string;
  lastActivity: string;
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
 * Handle resource selection step
 */
export async function handleResourceSelection(
  session: CapabilityScanSession,
  args: any,
  _logger: Logger,
  _requestId: string,
  parseNumericResponse: ParseNumericResponseFn,
  transitionCapabilitySession: TransitionCapabilitySessionFn
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
export async function handleResourceSpecification(
  session: CapabilityScanSession,
  args: any,
  _logger: Logger,
  _requestId: string,
  transitionCapabilitySession: TransitionCapabilitySessionFn
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
export async function handleProcessingMode(
  session: CapabilityScanSession,
  args: any,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService,
  parseNumericResponse: ParseNumericResponseFn,
  transitionCapabilitySession: TransitionCapabilitySessionFn,
  cleanupCapabilitySession: CleanupCapabilitySessionFn,
  createCapabilityScanCompletionResponse: CreateCapabilityScanCompletionResponseFn,
  handleScanningFn: (session: CapabilityScanSession, args: any, logger: Logger, requestId: string, capabilityService: CapabilityVectorService, parseNumericResponse: ParseNumericResponseFn, transitionCapabilitySession: TransitionCapabilitySessionFn, cleanupCapabilitySession: CleanupCapabilitySessionFn, createCapabilityScanCompletionResponse: CreateCapabilityScanCompletionResponseFn) => Promise<any>
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
  return await handleScanningFn(session, { ...args, response: undefined }, logger, requestId, capabilityService, parseNumericResponse, transitionCapabilitySession, cleanupCapabilitySession, createCapabilityScanCompletionResponse);
}

/**
 * Handle scanning step (actual capability analysis)
 */
export async function handleScanning(
  session: CapabilityScanSession,
  args: any,
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService,
  parseNumericResponse: ParseNumericResponseFn,
  transitionCapabilitySession: TransitionCapabilitySessionFn,
  cleanupCapabilitySession: CleanupCapabilitySessionFn,
  createCapabilityScanCompletionResponse: CreateCapabilityScanCompletionResponseFn
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
        return await handleScanning(session, { ...args, response: undefined }, logger, requestId, capabilityService, parseNumericResponse, transitionCapabilitySession, cleanupCapabilitySession, createCapabilityScanCompletionResponse);
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
    
    // Validate AI provider - skip in test environment
    const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
    if (!isTestEnvironment) {
      try {
        const aiProvider = createAIProvider();
        if (!aiProvider.isInitialized()) {
          return {
            success: false,
            operation: 'scan',
            dataType: 'capabilities',
            error: {
              message: 'AI provider API key required for capability inference',
              details: 'Configure AI provider credentials to enable AI-powered capability analysis'
            }
          };
        }
      } catch (error) {
        return {
          success: false,
          operation: 'scan',
          dataType: 'capabilities',
          error: {
            message: 'AI provider initialization failed',
            details: error instanceof Error ? error.message : 'Unknown error'
          }
        };
      }
    }
    
    // Initialize capability engine
    const aiProvider = createAIProvider();
    const engine = new CapabilityInferenceEngine(aiProvider, logger);
    
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