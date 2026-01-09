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
  currentStep: 'resource-selection' | 'resource-specification' | 'scanning' | 'complete';
  selectedResources?: string[] | 'all';
  resourceList?: string;
  currentResourceIndex?: number;
  progress?: any; // Progress tracking for long-running operations
  startedAt: string;
  lastActivity: string;
  resourceMetadata?: Record<string, { apiVersion: string; version: string; group: string; resourcePlural: string }>; // Store apiVersion info and plural name for Table API
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
    // Transition directly to scanning (auto mode only - manual mode removed)
    transitionCapabilitySession(session, 'scanning', {
      selectedResources: 'all',
      currentResourceIndex: 0  // Start with first resource
    }, args);

    // Start scanning in background (don't await) to avoid MCP timeout
    handleScanningFn(session, { ...args, response: undefined }, logger, requestId, capabilityService, parseNumericResponse, transitionCapabilitySession, cleanupCapabilitySession, createCapabilityScanCompletionResponse)
      .catch(error => {
        logger.error('Background capability scan failed', error as Error, {
          requestId,
          sessionId: session.sessionId
        });
      });

    // Return immediately - user can check progress with operation: 'progress'
    return {
      success: true,
      operation: 'scan',
      dataType: 'capabilities',
      status: 'started',
      sessionId: session.sessionId,
      message: 'Capability scan started. Use operation "progress" to check status.',
      checkProgress: {
        dataType: 'capabilities',
        operation: 'progress'
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
  logger: Logger,
  requestId: string,
  capabilityService: CapabilityVectorService,
  parseNumericResponse: ParseNumericResponseFn,
  transitionCapabilitySession: TransitionCapabilitySessionFn,
  cleanupCapabilitySession: CleanupCapabilitySessionFn,
  createCapabilityScanCompletionResponse: CreateCapabilityScanCompletionResponseFn,
  handleScanningFn: (session: CapabilityScanSession, args: any, logger: Logger, requestId: string, capabilityService: CapabilityVectorService, parseNumericResponse: ParseNumericResponseFn, transitionCapabilitySession: TransitionCapabilitySessionFn, cleanupCapabilitySession: CleanupCapabilitySessionFn, createCapabilityScanCompletionResponse: CreateCapabilityScanCompletionResponseFn) => Promise<any>
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
  
  // Transition directly to scanning (auto mode only - manual mode removed)
  transitionCapabilitySession(session, 'scanning', {
    selectedResources: resources,
    resourceList: args.resourceList,
    currentResourceIndex: 0  // Start with first resource
  }, args);

  // Begin actual capability scanning and return completion summary
  return await handleScanningFn(session, { ...args, response: undefined }, logger, requestId, capabilityService, parseNumericResponse, transitionCapabilitySession, cleanupCapabilitySession, createCapabilityScanCompletionResponse);
}

/**
 * Handle scanning step (actual capability analysis - auto mode only)
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
    // Validate and initialize AI provider
    let aiProvider;
    try {
      aiProvider = createAIProvider();
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

    // Initialize capability engine
    const engine = new CapabilityInferenceEngine(aiProvider, logger);

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

        // Extract resource names AND preserve metadata for capability analysis
        const discoveredResourceNames: string[] = [];
        const resourceMetadata: Record<string, { apiVersion: string; version: string; group: string; resourcePlural: string }> = {};

        for (const resource of allResources) {
          let resourceName = 'unknown-resource';

          // For CRDs (custom resources), prioritize full name format
          if (resource.name && resource.name.includes('.')) {
            resourceName = resource.name;
          }
          // For standard resources, use kind
          else if (resource.kind) {
            resourceName = resource.kind;
          }
          // Fallback to name if no kind
          else if (resource.name) {
            resourceName = resource.name;
          }

          if (resourceName !== 'unknown-resource') {
            discoveredResourceNames.push(resourceName);

            // Store apiVersion metadata for later use
            // Handle both EnhancedResource (has apiVersion) and EnhancedCRD (has group+version)
            let apiVersion = '';
            let version = '';
            let group = '';
            let resourcePlural = '';

            if ('apiVersion' in resource) {
              // EnhancedResource type - name is the plural (e.g., "deployments")
              apiVersion = resource.apiVersion || '';
              version = apiVersion.includes('/') ? apiVersion.split('/')[1] : apiVersion;
              group = resource.group || '';
              resourcePlural = resource.name || resourceName.toLowerCase() + 's';
            } else {
              // EnhancedCRD type - construct apiVersion from group and version
              // Plural is first part of name (e.g., "sqls" from "sqls.devopstoolkit.live")
              group = resource.group || '';
              version = resource.version || '';
              apiVersion = group ? `${group}/${version}` : version;
              resourcePlural = resource.name.includes('.') ? resource.name.split('.')[0] : resource.name;
            }

            resourceMetadata[resourceName] = {
              apiVersion,
              version,
              group,
              resourcePlural
            };
          }
        }

        logger.info('Discovered cluster resources for capability scanning', {
          requestId,
          sessionId: session.sessionId,
          totalDiscovered: discoveredResourceNames.length,
          sampleResources: discoveredResourceNames.slice(0, 5),
          metadataPreserved: Object.keys(resourceMetadata).length
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

        // Update session with discovered resources AND metadata
        transitionCapabilitySession(session, 'scanning', {
          selectedResources: discoveredResourceNames,
          resourceMetadata: resourceMetadata,
          currentResourceIndex: 0
        }, args);

        // Fall through to batch processing with discovered resources
        
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
    }

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
            // Try kubectl explain with full name first (works for CRDs and core resources)
            try {
              currentResourceDefinition = await discovery.explainResource(currentResource);
            } catch (explainError) {
              // If explain fails and resource has a dot (like Deployment.apps), try with just the Kind
              if (currentResource.includes('.')) {
                const resourceKind = currentResource.split('.')[0];
                logger.info(`kubectl explain failed for ${currentResource}, attempting with Kind only: ${resourceKind}`, {
                  requestId,
                  sessionId: session.sessionId,
                  resource: currentResource,
                  resourceKind
                });
                currentResourceDefinition = await discovery.explainResource(resourceKind);
              } else {
                // Re-throw explain error for resources without dots
                throw explainError;
              }
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

          // Get metadata for this resource - first try session metadata, then parse from kubectl explain
          let metadata = session.resourceMetadata?.[currentResource];

          // If no session metadata and we have resource definition, parse from kubectl explain output
          if (!metadata && currentResourceDefinition) {
            const lines = currentResourceDefinition.split('\n');
            const groupLine = lines.find((line: string) => line.startsWith('GROUP:'));
            const versionLine = lines.find((line: string) => line.startsWith('VERSION:'));

            // Extract metadata if version is found (group is optional for core resources)
            if (versionLine) {
              const group = groupLine ? groupLine.replace('GROUP:', '').trim() : '';
              const version = versionLine.replace('VERSION:', '').trim();
              const apiVersion = group ? `${group}/${version}` : version;
              // resourcePlural should come from session metadata; leave empty if not available
              // (printer columns fetch will be skipped rather than failing with wrong plural)
              const resourcePlural = '';

              metadata = { apiVersion, version, group, resourcePlural };
            }
          }

          const capability = await engine.inferCapabilities(
            currentResource,
            currentResourceDefinition,
            args.interaction_id,
            metadata?.apiVersion,
            metadata?.version,
            metadata?.group
          );
          const capabilityId = CapabilityInferenceEngine.generateCapabilityId(currentResource);

          // Fetch printer columns via Table API
          if (metadata?.apiVersion && metadata?.resourcePlural) {
            try {
              const printerColumns = await discovery.getPrinterColumns(
                metadata.resourcePlural,
                metadata.apiVersion
              );
              capability.printerColumns = printerColumns;
            } catch (printerError) {
              // Log but don't fail - printer columns are an enhancement
              logger.warn(`Failed to fetch printer columns for ${currentResource}`, {
                requestId,
                sessionId: session.sessionId,
                resource: currentResource,
                error: printerError instanceof Error ? printerError.message : String(printerError)
              });
            }
          }

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