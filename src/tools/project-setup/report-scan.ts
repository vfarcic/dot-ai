/**
 * Report Scan Handler - Project Setup Tool
 * PRD #177 - Milestone 2: Scope-based workflow
 *
 * Step 2 of workflow: Analyze which scopes are complete/incomplete
 */

import { ErrorHandler, Logger } from '../../core/error-handling';
import { GenericSessionManager } from '../../core/generic-session-manager';
import { ReportScanResponse, ProjectSetupSessionData, ErrorResponse } from './types';

/**
 * Handle reportScan stage - Step 2 of project setup workflow
 *
 * Analyzes which scopes are complete vs incomplete
 * If selectedScopes provided, initializes files map and returns questions for first file
 */
export async function handleReportScan(
  sessionId: string,
  existingFiles: string[] | undefined,
  selectedScopes: string[] | undefined,
  logger: Logger,
  requestId: string
): Promise<ReportScanResponse | ErrorResponse> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Starting report scan analysis', { requestId, sessionId });

      // Initialize session manager
      const sessionManager = new GenericSessionManager<ProjectSetupSessionData>('proj');

      // Load session
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            message: `Session ${sessionId} not found`,
            details: 'Please start a new session with step: "discover"'
          }
        } as ErrorResponse;
      }

      // Validate session state
      if (!session.data.allScopes || !session.data.filesToCheck) {
        return {
          success: false,
          error: {
            message: 'Invalid session state',
            details: 'Session does not contain scope configuration data'
          }
        } as ErrorResponse;
      }

      const allScopes = session.data.allScopes;

      // Determine which existingFiles to use
      let filesToUse: string[];

      if (existingFiles !== undefined) {
        // First call - store existingFiles in session
        filesToUse = existingFiles;
        session.data.existingFiles = existingFiles;
        sessionManager.updateSession(sessionId, session.data);
        logger.debug('Stored existingFiles in session', { requestId, sessionId, count: existingFiles.length });
      } else if (session.data.existingFiles !== undefined) {
        // Second call - reuse stored existingFiles
        filesToUse = session.data.existingFiles;
        logger.debug('Reusing existingFiles from session', { requestId, sessionId, count: filesToUse.length });
      } else {
        // No existingFiles provided and none in session
        return {
          success: false,
          error: {
            message: 'existingFiles is required for first reportScan call',
            details: 'Please provide an array of files that exist in the repository'
          }
        } as ErrorResponse;
      }

      // Analyze scope completeness
      const scopeStatus: Record<string, { complete: boolean; missingFiles: string[] }> = {};

      for (const [scopeName, scopeConfig] of Object.entries(allScopes)) {
        const missingFiles = scopeConfig.files.filter(file => !filesToUse.includes(file));
        scopeStatus[scopeName] = {
          complete: missingFiles.length === 0,
          missingFiles
        };
      }

      // Calculate incomplete scopes
      const incompleteScopes = Object.entries(scopeStatus)
        .filter(([_, status]) => !status.complete)
        .map(([scopeName, _]) => scopeName);

      logger.info('Scope analysis complete', {
        requestId,
        sessionId,
        totalScopes: Object.keys(allScopes).length,
        completeScopes: Object.keys(scopeStatus).length - incompleteScopes.length,
        incompleteScopes: incompleteScopes.length
      });

      // If user hasn't selected scopes yet, return the scope status report
      if (!selectedScopes) {
        if (incompleteScopes.length === 0) {
          return {
            success: true,
            sessionId: session.sessionId,
            nextStep: 'generateFile',
            instructions: 'All scopes are complete! No files need to be generated.'
          };
        }

        // Build scope status report
        const scopeReport = Object.entries(scopeStatus)
          .map(([scopeName, status]) => {
            if (status.complete) {
              return `✓ ${scopeName} (complete)`;
            } else {
              return `✗ ${scopeName} (missing: ${status.missingFiles.join(', ')})`;
            }
          })
          .join('\n');

        return {
          success: true,
          sessionId: session.sessionId,
          nextStep: 'generateFile',
          instructions: `Present this scope status report to the user:\n\n${scopeReport}\n\nAsk the user which incomplete scopes they would like to setup. Then call projectSetup tool again with step: "reportScan", sessionId: "${sessionId}", and selectedScopes: ["scope1", "scope2", ...] with the scopes user chose.`
        };
      }

      // User has selected scopes - validate them
      for (const scopeName of selectedScopes) {
        if (!allScopes[scopeName]) {
          return {
            success: false,
            error: {
              message: `Unknown scope: ${scopeName}`,
              details: `Available scopes: ${Object.keys(allScopes).join(', ')}`
            }
          } as ErrorResponse;
        }
      }

      // Initialize files map for all selected scopes
      const filesMap: Record<string, { status: 'excluded' | 'pending' | 'in-progress' | 'done', answers?: Record<string, string>, scope?: string }> = {};

      // Mark all files from all scopes
      for (const [scopeName, scopeConfig] of Object.entries(allScopes)) {
        // Add regular files
        for (const file of scopeConfig.files) {
          if (filesToUse.includes(file)) {
            filesMap[file] = { status: 'excluded', scope: scopeName }; // Already exists
          } else if (selectedScopes.includes(scopeName)) {
            filesMap[file] = { status: 'pending', scope: scopeName };   // User wants to generate
          } else {
            filesMap[file] = { status: 'excluded', scope: scopeName }; // User doesn't want this scope
          }
        }

        // Add conditional files (will be evaluated later in generate-file.ts)
        const conditionalFiles = scopeConfig.conditionalFiles || {};
        for (const conditionalFile of Object.keys(conditionalFiles)) {
          // Don't add if already in map (from regular files)
          if (filesMap[conditionalFile]) {
            continue;
          }

          if (selectedScopes.includes(scopeName)) {
            filesMap[conditionalFile] = { status: 'pending', scope: scopeName };
          } else {
            filesMap[conditionalFile] = { status: 'excluded', scope: scopeName };
          }
        }
      }

      // Find first pending file (from first selected scope)
      let firstPendingFile: string | undefined;
      let firstPendingScope: string | undefined;

      for (const scopeName of selectedScopes) {
        const scopeConfig = allScopes[scopeName];
        const pendingFile = scopeConfig.files.find(f => filesMap[f]?.status === 'pending');
        if (pendingFile) {
          firstPendingFile = pendingFile;
          firstPendingScope = scopeName;
          break;
        }
      }

      if (!firstPendingFile || !firstPendingScope) {
        return {
          success: false,
          error: {
            message: 'No valid files to generate',
            details: 'Selected scopes have no missing files'
          }
        } as ErrorResponse;
      }

      // Mark first file as in-progress
      filesMap[firstPendingFile].status = 'in-progress';

      // Get questions for the first file's scope
      const firstScopeConfig = allScopes[firstPendingScope];

      // Update session with selected scopes
      sessionManager.updateSession(sessionId, {
        currentStep: 'generateFile',
        allScopes,
        selectedScopes,
        filesToCheck: session.data.filesToCheck,
        files: filesMap
      });

      logger.info('Scope selection processed, starting with first file', {
        requestId,
        sessionId,
        selectedScopes,
        firstScope: firstPendingScope,
        firstFile: firstPendingFile
      });

      // Return questions for first file
      const response: ReportScanResponse = {
        success: true,
        sessionId: session.sessionId,
        nextStep: 'generateFile',
        currentFile: firstPendingFile,
        questions: firstScopeConfig.questions,
        instructions: `Analyze the repository to determine answers for these questions about ${firstPendingFile} (${firstPendingScope} scope):\n${firstScopeConfig.questions.map((q, idx) => `${idx + 1}. ${q.question} (ID: ${q.id})`).join('\n')}\n\nPresent your suggested answers as a numbered list to match the questions above. Allow the user to review and respond with the number if they want to change any answer (e.g., "2. New description here"). Once answers are finalized, call projectSetup tool with step: "generateFile", sessionId: "${sessionId}", fileName: "${firstPendingFile}", and answers using the question IDs as keys (e.g., {"${firstScopeConfig.questions[0]?.id}": "value1", "${firstScopeConfig.questions[1]?.id}": "value2", ...})`
      };

      logger.debug('Report scan response prepared', {
        requestId,
        sessionId,
        currentFile: firstPendingFile,
        currentScope: firstPendingScope
      });

      return response;
    },
    {
      operation: 'project_setup_report_scan',
      component: 'ProjectSetupTool',
      requestId
    }
  );
}
