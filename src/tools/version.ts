/**
 * Version tool for MCP server
 * 
 * Provides version information for debugging and validation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '../core/error-handling';

export const VERSION_TOOL_NAME = 'version';
export const VERSION_TOOL_DESCRIPTION = 'Get version information for the DevOps AI Toolkit MCP server';
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
 * Handle version tool request
 */
export async function handleVersionTool(
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Processing version tool request', { requestId });
    
    const versionInfo = getVersionInfo();
    
    logger.info('Version tool request completed', { requestId, version: versionInfo.version });
    
    return {
      status: 'success',
      versionInfo,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Version tool request failed', error as Error);
    
    return {
      status: 'error',
      error: errorMessage,
      timestamp: new Date().toISOString()
    };
  }
}