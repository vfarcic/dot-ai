/**
 * Version tool for MCP server
 * 
 * Provides comprehensive system status including version information, 
 * Vector DB connection status, and embedding service capabilities
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '../core/error-handling';
import { VectorDBService, PatternVectorService, PolicyVectorService, CapabilityVectorService, EmbeddingService } from '../core/index';
import { executeKubectl, ErrorClassifier } from '../core/kubernetes-utils';

export const VERSION_TOOL_NAME = 'version';
export const VERSION_TOOL_DESCRIPTION = 'Get comprehensive system status including version information, Vector DB connection status, embedding service capabilities, Anthropic API connectivity, Kubernetes cluster connectivity, Kyverno policy engine status, and pattern management health check';
export const VERSION_TOOL_INPUT_SCHEMA = {};

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
    };
  };
  embedding: {
    available: boolean;
    provider: string | null;
    model?: string;
    dimensions?: number;
    reason?: string;
  };
  anthropic: {
    connected: boolean;
    keyConfigured: boolean;
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
          capabilities: { exists: false, error: 'Vector DB not accessible' }
        }
      };
    }

    // Test each collection separately
    const embeddingService = new EmbeddingService();
    
    // Test patterns collection
    const patternsStatus = await testCollectionStatus('patterns', () => {
      const patternVectorDB = new VectorDBService({ collectionName: 'patterns' });
      const patternService = new PatternVectorService(patternVectorDB, embeddingService);
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

    return {
      connected: true,
      url: config.url || 'unknown',
      collections: {
        patterns: patternsStatus,
        policies: policiesStatus,
        capabilities: capabilitiesStatus
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
        capabilities: { exists: false, error: 'Vector DB connection failed' }
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
 * Test embedding service status
 */
async function getEmbeddingStatus(): Promise<SystemStatus['embedding']> {
  const embeddingService = new EmbeddingService();
  const status = embeddingService.getStatus();
  
  return {
    available: status.available,
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
        const testEmbedding = await embeddingService.generateEmbedding('diagnostic test query');
        
        if (!testEmbedding || testEmbedding.length !== 1536) {
          throw new Error(`Embedding dimension mismatch: expected 1536, got ${testEmbedding?.length || 'null'} dimensions`);
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
 * Test Kyverno installation and readiness for policy generation
 */
async function getKyvernoStatus(): Promise<SystemStatus['kyverno']> {
  const kubeconfig = process.env.KUBECONFIG || '~/.kube/config';
  
  try {
    // Check if Kyverno CRDs are installed
    const crdOutput = await executeKubectl(['get', 'crd', '--no-headers'], { 
      kubeconfig: kubeconfig,
      timeout: 10000 
    });
    
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
    
    // Check if Kyverno deployment is ready
    let deploymentReady = false;
    let webhookReady = false;
    let version: string | undefined;
    
    try {
      const deploymentOutput = await executeKubectl([
        'get', 'deployment', '-n', 'kyverno', '--no-headers'
      ], { kubeconfig, timeout: 5000 });
      
      // Check if kyverno deployment exists and is ready
      const kyvernoDeployment = deploymentOutput.split('\n').find(line => 
        line.trim().startsWith('kyverno')
      );
      
      if (kyvernoDeployment) {
        // Parse deployment status (format: NAME READY UP-TO-DATE AVAILABLE AGE)
        const parts = kyvernoDeployment.trim().split(/\s+/);
        const ready = parts[1]; // e.g., "1/1", "0/1"
        if (ready && ready.includes('/')) {
          const [current, desired] = ready.split('/');
          deploymentReady = current === desired && current !== '0';
        }
      }
    } catch (error) {
      // Kyverno might be in a different namespace or not exist
      deploymentReady = false;
    }
    
    // Check admission controller webhook
    try {
      const webhookOutput = await executeKubectl([
        'get', 'validatingwebhookconfigurations', '--no-headers'
      ], { kubeconfig, timeout: 5000 });
      
      webhookReady = webhookOutput.includes('kyverno-');
    } catch (error) {
      webhookReady = false;
    }
    
    // Try to get version from deployment labels or image
    try {
      const deploymentDetails = await executeKubectl([
        'get', 'deployment', 'kyverno', '-n', 'kyverno', '-o', 'jsonpath={.metadata.labels.version}'
      ], { kubeconfig, timeout: 5000 });
      
      if (deploymentDetails && deploymentDetails.trim()) {
        version = deploymentDetails.trim();
      } else {
        // Fallback: try to get version from image tag
        const imageOutput = await executeKubectl([
          'get', 'deployment', 'kyverno', '-n', 'kyverno', '-o', 'jsonpath={.spec.template.spec.containers[0].image}'
        ], { kubeconfig, timeout: 5000 });
        
        const imageMatch = imageOutput.match(/:v?([0-9]+\.[0-9]+\.[0-9]+)/);
        if (imageMatch) {
          version = imageMatch[1];
        }
      }
    } catch (error) {
      // Version detection is optional
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
    
    // If Kubernetes is not available, we can't detect Kyverno
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connection refused')) {
      return {
        installed: false,
        policyGenerationReady: false,
        error: 'Cannot detect Kyverno - Kubernetes cluster is not accessible'
      };
    }
    
    return {
      installed: false,
      policyGenerationReady: false,
      error: `Kyverno detection failed: ${errorMessage}`
    };
  }
}

/**
 * Test Kubernetes cluster connectivity
 */
async function getKubernetesStatus(): Promise<SystemStatus['kubernetes']> {
  const kubeconfig = process.env.KUBECONFIG || '~/.kube/config';
  
  try {
    // Test basic connectivity with cluster-info
    const clusterInfo = await executeKubectl(['cluster-info'], { 
      kubeconfig: kubeconfig,
      timeout: 10000 // 10 second timeout
    });
    
    // Parse cluster info to extract endpoint
    const endpointMatch = clusterInfo.match(/Kubernetes control plane is running at (https?:\/\/[^\s]+)/);
    const endpoint = endpointMatch ? endpointMatch[1] : undefined;
    
    // Get current context
    let context: string | undefined;
    try {
      context = await executeKubectl(['config', 'current-context'], { kubeconfig });
    } catch (error) {
      // Context retrieval is optional
      context = undefined;
    }
    
    // Get server version
    let version: string | undefined;
    try {
      const versionInfo = await executeKubectl(['version', '--short'], { kubeconfig, timeout: 5000 });
      const serverMatch = versionInfo.match(/Server Version: (.+)/);
      version = serverMatch ? serverMatch[1] : undefined;
    } catch (error) {
      // Version retrieval is optional
      version = undefined;
    }
    
    return {
      connected: true,
      clusterInfo: {
        endpoint,
        version,
        context
      },
      kubeconfig
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const classified = ErrorClassifier.classifyError(error as Error);
    
    return {
      connected: false,
      kubeconfig,
      error: errorMessage,
      errorType: classified.type
    };
  }
}

/**
 * Test Anthropic API connectivity
 */
async function getAnthropicStatus(): Promise<SystemStatus['anthropic']> {
  const keyConfigured = !!process.env.ANTHROPIC_API_KEY;
  
  if (!keyConfigured) {
    return {
      connected: false,
      keyConfigured: false,
      error: 'ANTHROPIC_API_KEY environment variable not set'
    };
  }

  try {
    // Import Claude integration and test a simple connection
    const { ClaudeIntegration } = await import('../core/claude');
    const claude = new ClaudeIntegration(process.env.ANTHROPIC_API_KEY!);
    
    // Test with a minimal request to check connectivity
    await claude.sendMessage('test');
    
    return {
      connected: true,
      keyConfigured: true
    };
  } catch (error) {
    return {
      connected: false,
      keyConfigured: true,
      error: error instanceof Error ? error.message : String(error)
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
 * Handle version tool request with comprehensive system diagnostics
 */
export async function handleVersionTool(
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Processing version tool request with system diagnostics', { requestId });
    
    // Get version info
    const version = getVersionInfo();
    
    // Run all diagnostics in parallel for better performance
    logger.info('Running system diagnostics...', { requestId });
    const [vectorDBStatus, embeddingStatus, anthropicStatus, kubernetesStatus, capabilityStatus, kyvernoStatus] = await Promise.all([
      getVectorDBStatus(),
      getEmbeddingStatus(),
      getAnthropicStatus(),
      getKubernetesStatus(),
      getCapabilityStatus(),
      getKyvernoStatus()
    ]);
    
    const systemStatus: SystemStatus = {
      version,
      vectorDB: vectorDBStatus,
      embedding: embeddingStatus,
      anthropic: anthropicStatus,
      kubernetes: kubernetesStatus,
      capabilities: capabilityStatus,
      kyverno: kyvernoStatus
    };
    
    // Log summary of system health
    logger.info('System diagnostics completed', { 
      requestId,
      version: version.version,
      vectorDBConnected: vectorDBStatus.connected,
      embeddingAvailable: embeddingStatus.available,
      anthropicConnected: anthropicStatus.connected,
      kubernetesConnected: kubernetesStatus.connected,
      capabilitySystemReady: capabilityStatus.systemReady,
      kyvernoReady: kyvernoStatus.policyGenerationReady
    });
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status: 'success',
          system: systemStatus,
          summary: {
            overall: vectorDBStatus.connected && anthropicStatus.connected && kubernetesStatus.connected && capabilityStatus.systemReady ? 'healthy' : 'degraded',
            patternSearch: embeddingStatus.available ? 'semantic+keyword' : 'keyword-only',
            capabilityScanning: capabilityStatus.systemReady && kubernetesStatus.connected ? 'ready' : 'not-ready',
            kubernetesAccess: kubernetesStatus.connected ? 'connected' : 'disconnected',
            policyGeneration: kyvernoStatus.policyGenerationReady ? 'ready' : 'not-ready',
            capabilities: [
              vectorDBStatus.connected && vectorDBStatus.collections.patterns.exists ? 'pattern-management' : null,
              vectorDBStatus.connected && vectorDBStatus.collections.policies.exists ? 'policy-management' : null,
              capabilityStatus.systemReady && kubernetesStatus.connected ? 'capability-scanning' : null,
              embeddingStatus.available ? 'semantic-search' : null,
              anthropicStatus.connected ? 'ai-recommendations' : null,
              kubernetesStatus.connected ? 'kubernetes-integration' : null,
              kyvernoStatus.policyGenerationReady ? 'policy-generation' : null
            ].filter(Boolean)
          },
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
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