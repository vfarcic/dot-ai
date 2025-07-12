/**
 * Version tool for MCP server
 * 
 * Provides version information for debugging and validation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
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
  gitCommit?: string;
  gitBranch?: string;
  buildTime: string;
  nodeVersion: string;
  platform: string;
  arch: string;
}

/**
 * Get version information from package.json and git
 */
export function getVersionInfo(): VersionInfo {
  // Read package.json version
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  
  // Get git information
  let gitCommit: string | undefined;
  let gitBranch: string | undefined;
  
  try {
    gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    // Git info not available (e.g., not a git repo or git not installed)
  }
  
  return {
    version: packageJson.version,
    gitCommit,
    gitBranch,
    buildTime: new Date().toISOString(),
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