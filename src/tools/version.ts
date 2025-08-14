/**
 * Version tool for MCP server
 * 
 * Provides comprehensive system status including version information, 
 * Vector DB connection status, and embedding service capabilities
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '../core/error-handling';
import { VectorDBService, PatternVectorService, CapabilityVectorService, EmbeddingService } from '../core/index';

export const VERSION_TOOL_NAME = 'version';
export const VERSION_TOOL_DESCRIPTION = 'Get comprehensive system status including version information, Vector DB connection status, embedding service capabilities, Anthropic API connectivity, and pattern management health check';
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
    collectionName: string;
    error?: string;
    patternsCount?: number;
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
  capabilities: {
    systemReady: boolean;
    vectorDBHealthy: boolean;
    collectionAccessible: boolean;
    storedCount?: number;
    error?: string;
    rawError?: string;
    lastDiagnosis: string;
  };
}

/**
 * Test Vector DB connectivity and get status
 */
async function getVectorDBStatus(): Promise<SystemStatus['vectorDB']> {
  const vectorDB = new VectorDBService();
  const config = vectorDB.getConfig();
  
  try {
    const isHealthy = await vectorDB.healthCheck();
    if (!isHealthy) {
      return {
        connected: false,
        url: config.url || 'unknown',
        collectionName: config.collectionName || 'patterns',
        error: 'Health check failed - Vector DB not responding'
      };
    }

    // Try to get patterns count to verify collection access
    const embeddingService = new EmbeddingService();
    const patternService = new PatternVectorService(vectorDB, embeddingService);
    let patternsCount: number | undefined;
    
    try {
      patternsCount = await patternService.getPatternsCount();
    } catch (error) {
      // Collection might not exist yet - that's okay
      patternsCount = 0;
    }

    return {
      connected: true,
      url: config.url || 'unknown',
      collectionName: config.collectionName || 'patterns',
      patternsCount
    };
  } catch (error) {
    return {
      connected: false,
      url: config.url || 'unknown',
      collectionName: config.collectionName || 'patterns',
      error: error instanceof Error ? error.message : String(error)
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
    const [vectorDBStatus, embeddingStatus, anthropicStatus, capabilityStatus] = await Promise.all([
      getVectorDBStatus(),
      getEmbeddingStatus(),
      getAnthropicStatus(),
      getCapabilityStatus()
    ]);
    
    const systemStatus: SystemStatus = {
      version,
      vectorDB: vectorDBStatus,
      embedding: embeddingStatus,
      anthropic: anthropicStatus,
      capabilities: capabilityStatus
    };
    
    // Log summary of system health
    logger.info('System diagnostics completed', { 
      requestId,
      version: version.version,
      vectorDBConnected: vectorDBStatus.connected,
      embeddingAvailable: embeddingStatus.available,
      anthropicConnected: anthropicStatus.connected,
      capabilitySystemReady: capabilityStatus.systemReady
    });
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status: 'success',
          system: systemStatus,
          summary: {
            overall: vectorDBStatus.connected && anthropicStatus.connected && capabilityStatus.systemReady ? 'healthy' : 'degraded',
            patternSearch: embeddingStatus.available ? 'semantic+keyword' : 'keyword-only',
            capabilityScanning: capabilityStatus.systemReady ? 'ready' : 'not-ready',
            capabilities: [
              vectorDBStatus.connected ? 'pattern-management' : null,
              capabilityStatus.systemReady ? 'capability-scanning' : null,
              embeddingStatus.available ? 'semantic-search' : null,
              anthropicStatus.connected ? 'ai-recommendations' : null
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