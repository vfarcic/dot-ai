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
import { isPluginInitialized } from './plugin-registry';

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

// Printer column definition (matches EnhancedCRD structure)
interface PrinterColumnDef {
  name: string;
  type: string;
  jsonPath: string;
  description?: string;
  priority?: number;
}

// Resource metadata for capability scanning
interface ResourceMetadata {
  apiVersion: string;
  version: string;
  group: string;
  resourcePlural: string;
  printerColumns?: PrinterColumnDef[];
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
  resourceMetadata?: Record<string, ResourceMetadata>;
}

/**
 * Result of scanning a single resource
 */
interface ScanResourceResult {
  success: boolean;
  resource: string;
  id?: string;
  capabilities?: string[];
  providers?: string[];
  complexity?: string;
  confidence?: number;
  error?: string;
}

/**
 * Scan a single resource - fetches all data, runs AI inference, stores to DB
 * This is the core function that both full scan and targeted scan call for each resource.
 */
export async function scanSingleResource(
  resourceName: string,
  discovery: KubernetesDiscovery,
  engine: CapabilityInferenceEngine,
  capabilityService: CapabilityVectorService,
  logger: Logger,
  requestId: string,
  interactionId?: string
): Promise<ScanResourceResult> {
  try {
    // Step 1: Get resource metadata (including printerColumns for CRDs)
    let metadata: ResourceMetadata | undefined;

    if (resourceName.includes('.')) {
      // This is a CRD - fetch CRD data to get metadata including printerColumns
      const dotIndex = resourceName.indexOf('.');
      const kind = resourceName.substring(0, dotIndex);
      const group = resourceName.substring(dotIndex + 1);

      // Try common plural patterns to find CRD
      const pluralGuesses = [
        kind.toLowerCase() + 's',
        kind.toLowerCase().endsWith('y') ? kind.toLowerCase().slice(0, -1) + 'ies' : null,
        kind.toLowerCase().endsWith('s') ? kind.toLowerCase() + 'es' : null
      ].filter(Boolean) as string[];

      for (const plural of pluralGuesses) {
        try {
          const crdName = `${plural}.${group}`;
          const crdData = await discovery.getCRDData(crdName);
          const storageVersion = crdData.versions.find(v => v.storage) || crdData.versions[0];

          metadata = {
            apiVersion: `${crdData.group}/${crdData.version}`,
            version: crdData.version,
            group: crdData.group,
            resourcePlural: crdData.resourcePlural,
            printerColumns: storageVersion?.additionalPrinterColumns
          };
          break;
        } catch {
          // Try next plural form
        }
      }
    }

    // Step 2: Get resource definition via kubectl explain
    let resourceDefinition: string | undefined;
    try {
      resourceDefinition = await discovery.explainResource(resourceName);
    } catch (explainError) {
      // If explain fails and resource has a dot, try with just the Kind
      if (resourceName.includes('.')) {
        const resourceKind = resourceName.split('.')[0];
        resourceDefinition = await discovery.explainResource(resourceKind);
      } else {
        throw explainError;
      }
    }

    // If no CRD metadata, parse from kubectl explain output
    if (!metadata && resourceDefinition) {
      const lines = resourceDefinition.split('\n');
      const groupLine = lines.find((line: string) => line.startsWith('GROUP:'));
      const versionLine = lines.find((line: string) => line.startsWith('VERSION:'));

      if (versionLine) {
        const group = groupLine ? groupLine.replace('GROUP:', '').trim() : '';
        const version = versionLine.replace('VERSION:', '').trim();
        const apiVersion = group ? `${group}/${version}` : version;
        // For core resources, derive plural from kind
        const kind = resourceName.includes('.') ? resourceName.split('.')[0] : resourceName;
        const resourcePlural = kind.toLowerCase() + 's';

        metadata = { apiVersion, version, group, resourcePlural };
      }
    }

    // Step 3: Run AI inference
    const capability = await engine.inferCapabilities(
      resourceName,
      resourceDefinition,
      interactionId,
      metadata?.apiVersion,
      metadata?.version,
      metadata?.group
    );
    const capabilityId = CapabilityInferenceEngine.generateCapabilityId(resourceName);

    // Step 4: Set printer columns
    const nameColumn: PrinterColumnDef = {
      name: 'Name',
      type: 'string',
      jsonPath: '.metadata.name',
      description: 'Resource name',
      priority: 0
    };

    if (metadata?.printerColumns && metadata.printerColumns.length > 0) {
      // Use printer columns from CRD metadata (includes jsonPath)
      capability.printerColumns = [nameColumn, ...metadata.printerColumns];
    } else if (metadata?.apiVersion && metadata?.resourcePlural) {
      // Fall back to Table API for core resources
      try {
        const printerColumns = await discovery.getPrinterColumns(
          metadata.resourcePlural,
          metadata.apiVersion
        );
        capability.printerColumns = printerColumns;
      } catch (printerError) {
        logger.warn(`Failed to fetch printer columns for ${resourceName}`, {
          requestId,
          resource: resourceName,
          error: printerError instanceof Error ? printerError.message : String(printerError)
        });
      }
    }

    // Step 5: Store to DB
    await capabilityService.storeCapability(capability);

    return {
      success: true,
      resource: resourceName,
      id: capabilityId,
      capabilities: capability.capabilities,
      providers: capability.providers,
      complexity: capability.complexity,
      confidence: capability.confidence
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to scan resource ${resourceName}`, error as Error, {
      requestId,
      resource: resourceName
    });
    return {
      success: false,
      resource: resourceName,
      error: errorMessage
    };
  }
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
    // Guard: Verify plugin is available before starting background scan
    // PRD #359: Check via unified plugin registry
    if (!isPluginInitialized()) {
      logger.error('Cannot start capability scan: plugin system not available', undefined, { requestId, sessionId: session.sessionId });
      return {
        success: false,
        operation: 'scan',
        dataType: 'capabilities',
        error: {
          message: 'Plugin system not available',
          details: 'Capability scanning requires the agentic-tools plugin for kubectl operations. Ensure the plugin is deployed and configured.'
        }
      };
    }

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

  logger.info('Resource specification received', {
    requestId,
    sessionId: session.sessionId,
    resourceCount: resources.length,
    resources
  });

  // Transition directly to scanning - scanSingleResource will fetch metadata for each
  transitionCapabilitySession(session, 'scanning', {
    selectedResources: resources,
    resourceList: args.resourceList,
    currentResourceIndex: 0
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

        // PRD #359: Use unified plugin registry for kubectl operations
        if (!isPluginInitialized()) {
          throw new Error('Plugin system not available. Capability scanning requires agentic-tools plugin.');
        }
        const discovery = new KubernetesDiscovery();

        // Discover all available resources
        const resourceMap = await discovery.discoverResources();
        const allResources = [...resourceMap.resources, ...resourceMap.custom];

        // Extract resource names only - scanSingleResource will fetch metadata for each
        const discoveredResourceNames: string[] = [];

        for (const resource of allResources) {
          let resourceName = 'unknown-resource';

          // For CRDs (custom resources), use Kind.group format
          if ('kind' in resource && resource.kind && 'group' in resource && resource.group) {
            resourceName = `${resource.kind}.${resource.group}`;
          }
          // For CRDs with name format "plural.group"
          else if (resource.name && resource.name.includes('.')) {
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
          }
        }

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

        // Update session with discovered resources
        transitionCapabilitySession(session, 'scanning', {
          selectedResources: discoveredResourceNames,
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
      
      // PRD #359: Use unified plugin registry for kubectl operations
      if (!isPluginInitialized()) {
        throw new Error('Plugin system not available. Capability scanning requires agentic-tools plugin.');
      }
      // Setup kubectl access via plugin
      const discovery = new KubernetesDiscovery();
      logger.info('Ready for capability scanning via plugin', {
        requestId,
        sessionId: session.sessionId
      });

      // Process each resource using scanSingleResource
      // Progress is tracked via updateProgress() and available via the progress endpoint
      for (let i = 0; i < resources.length; i++) {
        const currentResource = resources[i];

        // Update progress before processing
        updateProgress(i + 1, currentResource, processedResults.length, errors.length, errors);

        // Call the shared single-resource scan function
        const result = await scanSingleResource(
          currentResource,
          discovery,
          engine,
          capabilityService,
          logger,
          requestId,
          args.interaction_id
        );

        if (result.success) {
          processedResults.push({
            resource: result.resource,
            id: result.id,
            capabilities: result.capabilities,
            providers: result.providers,
            complexity: result.complexity,
            confidence: result.confidence
          });
        } else {
          errors.push({
            resource: result.resource,
            error: result.error,
            index: i + 1,
            timestamp: new Date().toISOString()
          });
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