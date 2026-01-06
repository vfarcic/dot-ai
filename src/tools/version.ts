/**
 * Version tool for MCP server
 * 
 * Provides comprehensive system status including version information, 
 * Vector DB connection status, and embedding service capabilities
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import * as k8s from '@kubernetes/client-node';
import { Logger } from '../core/error-handling';
import { VectorDBService, PatternVectorService, PolicyVectorService, CapabilityVectorService, EmbeddingService, maybeGetFeedbackMessage } from '../core/index';
import { ResourceVectorService } from '../core/resource-vector-service';
import { KubernetesDiscovery } from '../core/discovery';
import { ErrorClassifier } from '../core/kubernetes-utils';
import { getTracer, createTracedK8sClient } from '../core/tracing';
import { loadTracingConfig } from '../core/tracing/config';
import { GenericSessionManager } from '../core/generic-session-manager';
import { getVisualizationUrl, BaseVisualizationData } from '../core/visualization';

export const VERSION_TOOL_NAME = 'version';
export const VERSION_TOOL_DESCRIPTION = 'Get comprehensive system health and diagnostics';
export const VERSION_TOOL_INPUT_SCHEMA = {
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.')
};

export interface VersionInfo {
  version: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

export interface SystemStatus {
  version: VersionInfo;
  vectorDB: {
    connected: boolean;
    url: string;
    error?: string;
    collections: {
      patterns: {
        exists: boolean;
        documentsCount?: number;
        error?: string;
      };
      policies: {
        exists: boolean;
        documentsCount?: number;
        error?: string;
      };
      capabilities: {
        exists: boolean;
        documentsCount?: number;
        error?: string;
      };
      resources: {
        exists: boolean;
        documentsCount?: number;
        syncedTypes?: string[];
        error?: string;
      };
    };
  };
  embedding: {
    available: boolean;
    provider: string | null;
    model?: string;
    dimensions?: number;
    reason?: string;
  };
  aiProvider: {
    connected: boolean;
    keyConfigured: boolean;
    providerType?: string;
    modelName?: string;
    error?: string;
  };
  kubernetes: {
    connected: boolean;
    clusterInfo?: {
      endpoint?: string;
      version?: string;
      context?: string;
    };
    kubeconfig: string;
    error?: string;
    errorType?: string;
  };
  capabilities: {
    systemReady: boolean;
    vectorDBHealthy: boolean;
    collectionAccessible: boolean;
    storedCount?: number;
    error?: string;
    rawError?: string;
    lastDiagnosis: string;
  };
  kyverno: {
    installed: boolean;
    version?: string;
    webhookReady?: boolean;
    policyGenerationReady: boolean;
    error?: string;
    reason?: string;
  };
  tracing: {
    enabled: boolean;
    exporterType: string;
    endpoint?: string;
    serviceName: string;
    initialized: boolean;
  };
}

// PRD #320: Session data for version tool visualization
export interface VersionSessionData extends BaseVisualizationData {
  toolName: 'version';
  system: SystemStatus;
  summary: {
    overall: 'healthy' | 'degraded';
    patternSearch: string;
    capabilityScanning: string;
    kubernetesAccess: string;
    policyIntentManagement: string;
    kyvernoPolicyGeneration: string;
    capabilities: string[];
  };
  timestamp: string;
  status: 'success' | 'error';
}

/**
 * Test Vector DB connectivity and get status for all collections
 */
async function getVectorDBStatus(): Promise<SystemStatus['vectorDB']> {
  // Create a test service just to get connection config
  const testVectorDB = new VectorDBService({ collectionName: 'test' });
  const config = testVectorDB.getConfig();
  
  try {
    // Test basic Vector DB connectivity (independent of collections)
    const isHealthy = await testVectorDB.healthCheck();
    if (!isHealthy) {
      return {
        connected: false,
        url: config.url || 'unknown',
        error: 'Health check failed - Vector DB not responding',
        collections: {
          patterns: { exists: false, error: 'Vector DB not accessible' },
          policies: { exists: false, error: 'Vector DB not accessible' },
          capabilities: { exists: false, error: 'Vector DB not accessible' },
          resources: { exists: false, error: 'Vector DB not accessible' }
        }
      };
    }

    // Test each collection separately
    const embeddingService = new EmbeddingService();
    
    // Test patterns collection
    const patternsStatus = await testCollectionStatus('patterns', () => {
      const patternVectorDB = new VectorDBService({ collectionName: 'patterns' });
      const patternService = new PatternVectorService('patterns', patternVectorDB, embeddingService);
      return patternService.getPatternsCount();
    });

    // Test policies collection
    const policiesStatus = await testCollectionStatus('policies', () => {
      const policyVectorDB = new VectorDBService({ collectionName: 'policies' });
      const policyService = new PolicyVectorService(policyVectorDB, embeddingService);
      return policyService.getDataCount();
    });

    // Test capabilities collection
    const capabilitiesStatus = await testCollectionStatus('capabilities', () => {
      const capabilityService = new CapabilityVectorService();
      return capabilityService.getCapabilitiesCount();
    });

    // Test resources collection and get synced types
    const resourcesStatus = await testResourcesCollectionStatus(embeddingService);

    return {
      connected: true,
      url: config.url || 'unknown',
      collections: {
        patterns: patternsStatus,
        policies: policiesStatus,
        capabilities: capabilitiesStatus,
        resources: resourcesStatus
      }
    };
  } catch (error) {
    return {
      connected: false,
      url: config.url || 'unknown',
      error: error instanceof Error ? error.message : String(error),
      collections: {
        patterns: { exists: false, error: 'Vector DB connection failed' },
        policies: { exists: false, error: 'Vector DB connection failed' },
        capabilities: { exists: false, error: 'Vector DB connection failed' },
        resources: { exists: false, error: 'Vector DB connection failed' }
      }
    };
  }
}

/**
 * Helper function to test individual collection status
 */
async function testCollectionStatus(
  collectionName: string, 
  getCountFn: () => Promise<number>
): Promise<{ exists: boolean; documentsCount?: number; error?: string; }> {
  try {
    const documentsCount = await getCountFn();
    return {
      exists: true,
      documentsCount
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check if error indicates collection doesn't exist (vs other errors)
    const collectionNotExists = errorMessage.toLowerCase().includes('collection') && 
      (errorMessage.toLowerCase().includes('not exist') || 
       errorMessage.toLowerCase().includes('does not exist'));
    
    return {
      exists: false,
      error: collectionNotExists ? `${collectionName} collection does not exist` : errorMessage
    };
  }
}

/**
 * Test resources collection status and get unique synced resource types
 */
async function testResourcesCollectionStatus(
  embeddingService: EmbeddingService
): Promise<{ exists: boolean; documentsCount?: number; syncedTypes?: string[]; error?: string }> {
  try {
    const resourceVectorDB = new VectorDBService({ collectionName: 'resources' });
    const resourceService = new ResourceVectorService('resources', resourceVectorDB, embeddingService);

    const resources = await resourceService.listResources();
    const documentsCount = resources.length;

    // Extract unique resource types as "kind.group" (e.g., "Deployment.apps", "Service.")
    const typeSet = new Set<string>();
    for (const resource of resources) {
      const group = resource.apiGroup || '';
      const syncedType = group ? `${resource.kind}.${group}` : resource.kind;
      typeSet.add(syncedType);
    }
    const syncedTypes = Array.from(typeSet).sort();

    return {
      exists: true,
      documentsCount,
      syncedTypes
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const collectionNotExists = errorMessage.toLowerCase().includes('collection') &&
      (errorMessage.toLowerCase().includes('not exist') ||
       errorMessage.toLowerCase().includes('does not exist'));

    return {
      exists: false,
      error: collectionNotExists ? 'resources collection does not exist' : errorMessage
    };
  }
}

/**
 * Test embedding service status
 * Performs actual embedding generation test to verify service works
 */
async function getEmbeddingStatus(): Promise<SystemStatus['embedding']> {
  const embeddingService = new EmbeddingService();
  const status = embeddingService.getStatus();

  // If service reports available, actually test it to verify embeddings work
  if (status.available) {
    try {
      // Test embedding generation with a simple query
      await embeddingService.generateEmbedding('test');

      return {
        available: true,
        provider: status.provider,
        model: status.model,
        dimensions: status.dimensions
      };
    } catch (error) {
      // Embedding service initialized but doesn't actually work
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        available: false,
        provider: status.provider,
        model: status.model,
        dimensions: status.dimensions,
        reason: `Embedding generation test failed: ${errorMessage}`
      };
    }
  }

  return {
    available: false,
    provider: status.provider,
    model: status.model,
    dimensions: status.dimensions,
    reason: status.reason
  };
}

/**
 * Test capability system readiness
 */
async function getCapabilityStatus(): Promise<SystemStatus['capabilities']> {
  const timestamp = new Date().toISOString();
  
  try {
    const capabilityService = new CapabilityVectorService();
    
    // Test Vector DB health for capabilities
    let vectorDBHealthy = false;
    let collectionAccessible = false;
    let storedCount: number | undefined;
    
    try {
      vectorDBHealthy = await capabilityService.healthCheck();
    } catch (error) {
      return {
        systemReady: false,
        vectorDBHealthy: false,
        collectionAccessible: false,
        error: `Vector DB health check failed: ${error instanceof Error ? error.message : String(error)}`,
        lastDiagnosis: timestamp
      };
    }
    
    if (vectorDBHealthy) {
      // Test collection accessibility and storage operations
      try {
        await capabilityService.initialize();
        storedCount = await capabilityService.getCapabilitiesCount();
        collectionAccessible = true;
        
        // Test MCP-used operations: verify vector operations work
        const embeddingService = new EmbeddingService();
        const embeddingStatus = embeddingService.getStatus();
        const expectedDimensions = embeddingStatus.dimensions || 1536; // Use provider's dimension or default
        const testEmbedding = await embeddingService.generateEmbedding('diagnostic test query');

        if (!testEmbedding || testEmbedding.length !== expectedDimensions) {
          throw new Error(`Embedding dimension mismatch: expected ${expectedDimensions}, got ${testEmbedding?.length || 'null'} dimensions`);
        }
        
        // Validate embedding values are numbers (not NaN, Infinity, etc.)
        if (testEmbedding.some(val => !Number.isFinite(val))) {
          throw new Error('Embedding contains invalid values (NaN or Infinity)');
        }
        
        // Test core MCP operations: verify we can list capabilities (most basic operation)
        const capabilities = await capabilityService.getAllCapabilities(1);
        if (capabilities.length === 0 && storedCount > 0) {
          throw new Error('Capability listing failed - cannot retrieve stored capabilities');
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check for actual dimension mismatch errors (be specific)
        const isDimensionMismatch = (
          errorMessage.toLowerCase().includes('dimension') && 
          (errorMessage.toLowerCase().includes('mismatch') || errorMessage.toLowerCase().includes('expected'))
        ) || (
          errorMessage.toLowerCase().includes('vector') && 
          errorMessage.toLowerCase().includes('size')
        );
        
        // Since core MCP functionality works (list, search, ID-based get), downgrade severity
        const isCoreSystemWorking = vectorDBHealthy && collectionAccessible && (storedCount || 0) > 0;
        
        return {
          systemReady: isCoreSystemWorking, // Core system is ready if MCP operations work
          vectorDBHealthy: true,
          collectionAccessible: collectionAccessible,
          storedCount: storedCount,
          error: isDimensionMismatch ? 
            `Vector dimension mismatch detected: ${errorMessage}. The capabilities collection exists but has incompatible vector dimensions. Delete the collection to allow recreation with correct dimensions.` :
            `Capability system test failed: ${errorMessage}`,
          lastDiagnosis: timestamp,
          // Add raw error for debugging
          rawError: errorMessage
        };
      }
    }
    
    // Check embedding service (required for semantic search)
    const embeddingService = new EmbeddingService();
    const embeddingAvailable = embeddingService.isAvailable();
    
    // System is ready if Vector DB is healthy, collection is accessible, and embeddings available
    const systemReady = vectorDBHealthy && collectionAccessible && embeddingAvailable;
    
    return {
      systemReady,
      vectorDBHealthy,
      collectionAccessible,
      storedCount,
      lastDiagnosis: timestamp
    };
    
  } catch (error) {
    return {
      systemReady: false,
      vectorDBHealthy: false,
      collectionAccessible: false,
      error: `Capability diagnostics failed: ${error instanceof Error ? error.message : String(error)}`,
      lastDiagnosis: timestamp
    };
  }
}

/**
 * Test Kyverno installation and readiness for policy generation using shared client
 */
export async function getKyvernoStatus(): Promise<SystemStatus['kyverno']> {
  try {
    // Create discovery instance and establish connection
    const discovery = new KubernetesDiscovery({});
    await discovery.connect();
    
    // First test if we can connect to Kubernetes at all
    const testResult = await discovery.testConnection();
    if (!testResult.connected) {
      return {
        installed: false,
        policyGenerationReady: false,
        error: 'Cannot detect Kyverno - Kubernetes cluster is not accessible'
      };
    }
    
    // Check if Kyverno CRDs are installed using the original approach
    const crdOutput = await discovery.executeKubectl(['get', 'crd', '--no-headers']);
    
    const kyvernoCRDs = crdOutput.split('\n').filter(line => 
      line.includes('kyverno.io') && (
        line.includes('clusterpolicies') || 
        line.includes('policies') ||
        line.includes('policyreports')
      )
    );
    
    if (kyvernoCRDs.length === 0) {
      return {
        installed: false,
        policyGenerationReady: false,
        reason: 'Kyverno CRDs not found in cluster - Kyverno is not installed'
      };
    }
    
    // Check if Kyverno deployment is ready using the client
    let deploymentReady = false;
    let webhookReady = false;
    let version: string | undefined;
    
    try {
      // Get client and check deployment status
      const client = discovery.getClient();
      const appsV1Api = createTracedK8sClient(
        client.makeApiClient(k8s.AppsV1Api),
        'AppsV1Api'
      );
      
      const deploymentResponse = await appsV1Api.listNamespacedDeployment({
        namespace: 'kyverno'
      });
      const kyvernoDeployments = deploymentResponse.items.filter((deployment: any) => 
        deployment.metadata?.name?.startsWith('kyverno-')
      );
      
      if (kyvernoDeployments.length > 0) {
        // Check if all Kyverno deployments are ready
        deploymentReady = kyvernoDeployments.every((deployment: any) => {
          const readyReplicas = deployment.status?.readyReplicas || 0;
          const replicas = deployment.status?.replicas || 0;
          return readyReplicas > 0 && readyReplicas === replicas;
        });
        
        // Try to get version from image tag of the first deployment (usually admission controller)
        const firstDeployment = kyvernoDeployments[0];
        const container = firstDeployment.spec?.template.spec?.containers?.[0];
        if (container?.image) {
          const imageMatch = container.image.match(/:v?([0-9]+\.[0-9]+\.[0-9]+)/);
          if (imageMatch) {
            version = imageMatch[1];
          }
        }
      }
    } catch (error) {
      // Kyverno might be in a different namespace or not exist
      deploymentReady = false;
    }
    
    // Check admission controller webhook
    try {
      const client = discovery.getClient();
      const admissionApi = createTracedK8sClient(
        client.makeApiClient(k8s.AdmissionregistrationV1Api),
        'AdmissionregistrationV1Api'
      );
      
      const webhookResponse = await admissionApi.listValidatingWebhookConfiguration();
      webhookReady = webhookResponse.items.some((webhook: any) => 
        webhook.metadata?.name?.includes('kyverno')
      );
    } catch (error) {
      webhookReady = false;
    }
    
    // Determine if policy generation is ready
    const policyGenerationReady = deploymentReady && webhookReady;
    
    if (!policyGenerationReady) {
      let reason = 'Kyverno is partially installed but not fully operational';
      if (!deploymentReady && !webhookReady) {
        reason = 'Kyverno deployment and admission webhook are not ready';
      } else if (!deploymentReady) {
        reason = 'Kyverno deployment is not ready';
      } else if (!webhookReady) {
        reason = 'Kyverno admission webhook is not ready';
      }
      
      return {
        installed: true,
        version,
        webhookReady,
        policyGenerationReady,
        reason
      };
    }
    
    return {
      installed: true,
      version,
      webhookReady: true,
      policyGenerationReady: true
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      installed: false,
      policyGenerationReady: false,
      error: `Kyverno detection failed: ${errorMessage}`
    };
  }
}

/**
 * Test Kubernetes cluster connectivity using shared client
 */
async function getKubernetesStatus(): Promise<SystemStatus['kubernetes']> {
  try {
    // Create discovery instance and establish connection
    const discovery = new KubernetesDiscovery({});
    await discovery.connect();
    
    // Get connection info using the shared approach
    const connectionInfo = discovery.getConnectionInfo();
    const testResult = await discovery.testConnection();
    
    if (testResult.connected) {
      return {
        connected: true,
        clusterInfo: {
          endpoint: connectionInfo.server,
          version: testResult.version,
          context: connectionInfo.context
        },
        kubeconfig: connectionInfo.kubeconfig
      };
    } else {
      return {
        connected: false,
        kubeconfig: connectionInfo.kubeconfig,
        error: testResult.error,
        errorType: testResult.errorType
      };
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const classified = ErrorClassifier.classifyError(error as Error);
    
    return {
      connected: false,
      kubeconfig: process.env.KUBECONFIG || '~/.kube/config',
      error: errorMessage,
      errorType: classified.type
    };
  }
}

/**
 * Test AI provider connectivity
 */
async function getAIProviderStatus(interaction_id?: string): Promise<SystemStatus['aiProvider']> {
  try {
    // Import AI provider factory and test connectivity
    const { createAIProvider } = await import('../core/ai-provider-factory');
    const aiProvider = createAIProvider();

    if (!aiProvider.isInitialized()) {
      return {
        connected: false,
        keyConfigured: false,
        providerType: aiProvider.getProviderType(),
        error: 'AI provider API key not configured'
      };
    }

    // Test with a minimal request to check connectivity
    await aiProvider.sendMessage('test', 'version-connectivity-check', {
      user_intent: 'Test AI provider connectivity and system version check',
      interaction_id: interaction_id
    });

    return {
      connected: true,
      keyConfigured: true,
      providerType: aiProvider.getProviderType(),
      modelName: aiProvider.getModelName()
    };
  } catch (error) {
    // Try to get provider type and model name even on error
    let providerType: string | undefined;
    let modelName: string | undefined;
    try {
      const { createAIProvider } = await import('../core/ai-provider-factory');
      const aiProvider = createAIProvider();
      providerType = aiProvider.getProviderType();
      modelName = aiProvider.getModelName();
    } catch {
      providerType = undefined;
      modelName = undefined;
    }

    // Capture detailed error information for debugging
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;

      // If there are additional properties on the error object, include them
      const errorObj = error as any;
      const details: string[] = [];

      if (errorObj.cause) {
        details.push(`cause: ${String(errorObj.cause)}`);
      }
      if (errorObj.url) {
        details.push(`url: ${errorObj.url}`);
      }
      if (errorObj.statusCode || errorObj.status) {
        details.push(`status: ${errorObj.statusCode || errorObj.status}`);
      }
      if (errorObj.statusText) {
        details.push(`statusText: ${errorObj.statusText}`);
      }
      if (errorObj.responseBody) {
        try {
          details.push(`response: ${JSON.stringify(errorObj.responseBody)}`);
        } catch {
          details.push(`response: ${String(errorObj.responseBody)}`);
        }
      }

      // Add stack trace first line for context (shows where error originated)
      if (error.stack) {
        const stackLines = error.stack.split('\n');
        if (stackLines.length > 1) {
          details.push(`at: ${stackLines[1].trim()}`);
        }
      }

      if (details.length > 0) {
        errorMessage += ` (${details.join(', ')})`;
      }
    } else {
      errorMessage = String(error);
    }

    return {
      connected: false,
      keyConfigured: false,
      providerType,
      modelName,
      error: errorMessage
    };
  }
}

/**
 * Get version information from package.json
 */
export function getVersionInfo(): VersionInfo {
  // Find package.json relative to this module's location (MCP server's installation)
  let packageJson: any;
  
  try {
    // Get the directory where this module is installed
    // __dirname points to the compiled JS location (dist/tools/), go up two levels to find package.json
    const mcpServerDir = join(__dirname, '..', '..');
    const packageJsonPath = join(mcpServerDir, 'package.json');
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    // If package.json not found, use unknown version
    packageJson = { version: 'unknown' };
  }
  
  return {
    version: packageJson.version,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  };
}

/**
 * Get OpenTelemetry tracing status
 */
export function getTracingStatus(): SystemStatus['tracing'] {
  const config = loadTracingConfig();
  const tracer = getTracer();

  return {
    enabled: config.enabled,
    exporterType: config.exporterType,
    endpoint: config.otlpEndpoint,
    serviceName: config.serviceName,
    initialized: tracer.isEnabled()
  };
}

/**
 * Handle version tool request with comprehensive system diagnostics
 */
export async function handleVersionTool(
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    // Extract interaction_id for evaluation dataset generation
    const interaction_id = args.interaction_id ? VERSION_TOOL_INPUT_SCHEMA.interaction_id.parse(args.interaction_id) : undefined;
    
    logger.info('Processing version tool request with system diagnostics', { requestId });
    
    // Get version info
    const version = getVersionInfo();
    
    // Run all diagnostics in parallel for better performance
    logger.info('Running system diagnostics...', { requestId });
    const [vectorDBStatus, embeddingStatus, aiProviderStatus, kubernetesStatus, capabilityStatus, kyvernoStatus] = await Promise.all([
      getVectorDBStatus(),
      getEmbeddingStatus(),
      getAIProviderStatus(interaction_id),
      getKubernetesStatus(),
      getCapabilityStatus(),
      getKyvernoStatus()
    ]);

    // Get tracing status synchronously (no async operations)
    const tracingStatus = getTracingStatus();

    const systemStatus: SystemStatus = {
      version,
      vectorDB: vectorDBStatus,
      embedding: embeddingStatus,
      aiProvider: aiProviderStatus,
      kubernetes: kubernetesStatus,
      capabilities: capabilityStatus,
      kyverno: kyvernoStatus,
      tracing: tracingStatus
    };
    
    // Log summary of system health
    logger.info('System diagnostics completed', {
      requestId,
      version: version.version,
      vectorDBConnected: vectorDBStatus.connected,
      embeddingAvailable: embeddingStatus.available,
      aiProviderConnected: aiProviderStatus.connected,
      kubernetesConnected: kubernetesStatus.connected,
      capabilitySystemReady: capabilityStatus.systemReady,
      kyvernoReady: kyvernoStatus.policyGenerationReady
    });
    
    // Check if we should show feedback message
    const feedbackMessage = maybeGetFeedbackMessage();

    // Build summary object
    const summary = {
      overall: (vectorDBStatus.connected && aiProviderStatus.connected && kubernetesStatus.connected && capabilityStatus.systemReady ? 'healthy' : 'degraded') as 'healthy' | 'degraded',
      patternSearch: embeddingStatus.available ? 'semantic+keyword' : 'keyword-only',
      capabilityScanning: capabilityStatus.systemReady && kubernetesStatus.connected ? 'ready' : 'not-ready',
      kubernetesAccess: kubernetesStatus.connected ? 'connected' : 'disconnected',
      policyIntentManagement: vectorDBStatus.connected && embeddingStatus.available ? 'ready' : 'not-ready',
      kyvernoPolicyGeneration: kyvernoStatus.policyGenerationReady ? 'ready' : 'not-ready',
      capabilities: [
        vectorDBStatus.connected && vectorDBStatus.collections.patterns.exists ? 'pattern-management' : null,
        // Policy intent management is available if Vector DB and embedding service are ready
        vectorDBStatus.connected && embeddingStatus.available ? 'policy-intent-management' : null,
        capabilityStatus.systemReady && kubernetesStatus.connected ? 'capability-scanning' : null,
        embeddingStatus.available ? 'semantic-search' : null,
        aiProviderStatus.connected ? 'ai-recommendations' : null,
        kubernetesStatus.connected ? 'kubernetes-integration' : null,
        // Kyverno policy generation is only available when Kyverno is installed
        kyvernoStatus.policyGenerationReady ? 'kyverno-policy-generation' : null
      ].filter(Boolean) as string[]
    };

    const timestamp = new Date().toISOString();

    // PRD #320: Create session for visualization
    const sessionManager = new GenericSessionManager<VersionSessionData>('ver');
    const session = sessionManager.createSession({
      toolName: 'version',
      system: systemStatus,
      summary,
      timestamp,
      status: 'success'
    });

    // PRD #320: Generate visualization URL if configured
    const visualizationUrl = getVisualizationUrl(session.sessionId);

    // PRD #320: Build response with visualization instruction for agents
    const responseData = {
      status: 'success',
      system: systemStatus,
      summary,
      timestamp,
      ...(feedbackMessage ? { message: feedbackMessage } : {}),
      ...(visualizationUrl ? { visualizationUrl } : {})
    };

    // PRD #320: Return two content blocks - JSON for REST API, text instruction for MCP agents
    const content: Array<{ type: 'text'; text: string }> = [{
      type: 'text' as const,
      text: JSON.stringify(responseData, null, 2)
    }];

    // Add visualization instruction as second content block so agents display it to users
    if (visualizationUrl) {
      content.push({
        type: 'text' as const,
        text: `📊 **View visualization**: ${visualizationUrl}`
      });
    }

    return { content };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Version tool request failed', error as Error, { requestId });
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status: 'error',
          error: errorMessage,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
}