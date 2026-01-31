/**
 * Discovery Handler - Project Setup Tool
 * PRD #177 - Milestone 1: Core Tool Infrastructure
 *
 * Step 1 of workflow: Return list of files for client to scan
 */

import * as fs from 'fs';
import * as path from 'path';
import { ErrorHandler, Logger } from '../../core/error-handling';
import { GenericSessionManager } from '../../core/generic-session-manager';
import { DiscoveryResponse, ProjectSetupSessionData, Question } from './types';

/**
 * Discovery configuration loaded from JSON
 */
interface ScopeConfig {
  files: string[];
  questions: Question[];
  conditionalFiles?: Record<string, {
    condition: string;
    reason: string;
  }>;
  [key: string]: unknown;  // Allow additional properties
}

interface DiscoveryConfig {
  [scope: string]: ScopeConfig;
}

/**
 * Handle discovery stage - Step 1 of project setup workflow
 *
 * Loads ALL files from ALL scopes and returns for client to scan
 */
export async function handleDiscovery(
  logger: Logger,
  requestId: string
): Promise<DiscoveryResponse> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Starting project setup discovery', { requestId });

      // Load discovery config from assets directory
      // From dist/tools/project-setup/ -> ../../../ gets to project root, then assets/project-setup/
      const configPath = path.join(__dirname, '..', '..', '..', 'assets', 'project-setup', 'discovery-config.json');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const allConfig: DiscoveryConfig = JSON.parse(configContent);

      // Collect all files from all scopes
      const allFiles: string[] = [];
      const scopeNames = Object.keys(allConfig);

      for (const scopeName of scopeNames) {
        const scopeConfig = allConfig[scopeName];
        allFiles.push(...scopeConfig.files);
      }

      // Remove duplicates
      const uniqueFiles = Array.from(new Set(allFiles));

      // Initialize session manager with 'proj' prefix
      const sessionManager = new GenericSessionManager<ProjectSetupSessionData>('proj');

      // Create new session with ALL scope configurations
      const session = sessionManager.createSession({
        currentStep: 'discover',
        allScopes: allConfig,  // Store all scope configurations
        filesToCheck: uniqueFiles
      });

      logger.info('Project setup session created', {
        requestId,
        sessionId: session.sessionId,
        scopeCount: scopeNames.length,
        fileCount: uniqueFiles.length
      });

      // Return discovery response
      const response: DiscoveryResponse = {
        success: true,
        sessionId: session.sessionId,
        filesToCheck: uniqueFiles,
        availableScopes: scopeNames,
        nextStep: 'reportScan',
        instructions: `Scan the repository for these files: ${uniqueFiles.join(', ')}. Check which files exist and build an array of those files. Then call projectSetup tool with step: "reportScan", sessionId: "${session.sessionId}", and existingFiles: [array of files that exist in the repository].`
      };

      logger.debug('Discovery response prepared', {
        requestId,
        sessionId: session.sessionId,
        fileCount: response.filesToCheck.length,
        scopes: scopeNames
      });

      return response;
    },
    {
      operation: 'project_setup_discovery',
      component: 'ProjectSetupTool',
      requestId
    }
  );
}
