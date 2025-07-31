/**
 * Version tool for MCP server
 * 
 * Provides comprehensive system status including version information, 
 * Vector DB connection status, and embedding service capabilities
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '../core/error-handling';
import { VectorDBService, PatternVectorService, EmbeddingService } from '../core/index';

export const VERSION_TOOL_NAME = 'version';
export const VERSION_TOOL_DESCRIPTION = 'Get comprehensive system status including version information, Vector DB connection status, embedding service capabilities, Anthropic API connectivity, and pattern management health check';
export const VERSION_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false
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
    const [vectorDBStatus, embeddingStatus, anthropicStatus] = await Promise.all([
      getVectorDBStatus(),
      getEmbeddingStatus(),
      getAnthropicStatus()
    ]);
    
    const systemStatus: SystemStatus = {
      version,
      vectorDB: vectorDBStatus,
      embedding: embeddingStatus,
      anthropic: anthropicStatus
    };
    
    // Log summary of system health
    logger.info('System diagnostics completed', { 
      requestId,
      version: version.version,
      vectorDBConnected: vectorDBStatus.connected,
      embeddingAvailable: embeddingStatus.available,
      anthropicConnected: anthropicStatus.connected
    });
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          status: 'success',
          system: systemStatus,
          summary: {
            overall: vectorDBStatus.connected && anthropicStatus.connected ? 'healthy' : 'degraded',
            patternSearch: embeddingStatus.available ? 'semantic+keyword' : 'keyword-only',
            capabilities: [
              vectorDBStatus.connected ? 'pattern-management' : null,
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