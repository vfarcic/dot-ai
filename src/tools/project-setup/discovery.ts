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
interface DiscoveryConfig {
  filesToCheck: string[];
  questions: Question[];
}

/**
 * Handle discovery stage - Step 1 of project setup workflow
 *
 * Loads file list from config and returns for client to scan
 */
export async function handleDiscovery(
  logger: Logger,
  requestId: string
): Promise<DiscoveryResponse> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Starting project setup discovery', { requestId });

      // Load discovery config from source directory
      // From dist/tools/project-setup/ -> ../../../ gets to project root, then src/tools/project-setup/
      const configPath = path.join(__dirname, '..', '..', '..', 'src', 'tools', 'project-setup', 'discovery-config.json');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config: DiscoveryConfig = JSON.parse(configContent);

      // Initialize session manager with 'proj' prefix
      const sessionManager = new GenericSessionManager<ProjectSetupSessionData>('proj');

      // Create new session
      const session = sessionManager.createSession({
        currentStep: 'discover',
        questions: config.questions,
        filesToCheck: config.filesToCheck,
        files: {}  // Will be populated in reportScan
      });

      logger.info('Project setup session created', {
        requestId,
        sessionId: session.sessionId,
        fileCount: config.filesToCheck.length
      });

      // Return discovery response
      const response: DiscoveryResponse = {
        success: true,
        sessionId: session.sessionId,
        filesToCheck: config.filesToCheck,
        nextStep: 'reportScan',
        instructions: `Scan the repository for these files: ${config.filesToCheck.join(', ')}. Check which files exist and build an array of those files. Then call projectSetup tool with step: "reportScan", sessionId: "${session.sessionId}", and existingFiles: [array of files that exist in the repository].`
      };

      logger.debug('Discovery response prepared', {
        requestId,
        sessionId: session.sessionId,
        fileCount: response.filesToCheck.length
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
