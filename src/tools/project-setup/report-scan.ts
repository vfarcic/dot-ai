/**
 * Report Scan Handler - Project Setup Tool
 * PRD #177 - Scope-based workflow refactoring
 *
 * Step 2 of workflow: Return ALL questions for selected scope
 */

import { ErrorHandler, Logger } from '../../core/error-handling';
import { GenericSessionManager } from '../../core/generic-session-manager';
import { ReportScanResponse, ProjectSetupSessionData, ErrorResponse } from './types';

/**
 * Handle reportScan stage - Step 2 of project setup workflow
 *
 * Returns all questions for the selected scope and list of files to generate
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

      // Store or retrieve existingFiles
      let filesToUse: string[];
      if (existingFiles !== undefined) {
        filesToUse = existingFiles;
        session.data.existingFiles = existingFiles;
        sessionManager.updateSession(sessionId, session.data);
        logger.debug('Stored existingFiles in session', { requestId, sessionId, count: existingFiles.length });
      } else if (session.data.existingFiles !== undefined) {
        filesToUse = session.data.existingFiles;
        logger.debug('Reusing existingFiles from session', { requestId, sessionId, count: filesToUse.length });
      } else {
        return {
          success: false,
          error: {
            message: 'existingFiles is required for first reportScan call',
            details: 'Please provide an array of files that exist in the repository'
          }
        } as ErrorResponse;
      }

      // If no scopes selected, return analysis report
      if (!selectedScopes || selectedScopes.length === 0) {
        // Analyze scope completeness
        const scopeStatus: Record<string, { complete: boolean; missingFiles: string[] }> = {};

        for (const [scopeName, scopeConfig] of Object.entries(allScopes)) {
          const missingFiles = scopeConfig.files.filter(file => !filesToUse.includes(file));
          scopeStatus[scopeName] = {
            complete: missingFiles.length === 0,
            missingFiles
          };
        }

        const incompleteScopes = Object.entries(scopeStatus)
          .filter(([_, status]) => !status.complete)
          .map(([scopeName, _]) => scopeName);

        // Generate report for user to review
        const report = generateReport(scopeStatus, allScopes);

        logger.info('Generated scope analysis report', {
          requestId,
          sessionId,
          totalScopes: Object.keys(allScopes).length,
          incompleteScopes: incompleteScopes.length
        });

        const incompleteScopeNames = incompleteScopes.join('", "');

        return {
          success: true,
          sessionId,
          nextStep: 'generateScope',
          scope: '',
          questions: [],
          filesToGenerate: [],
          instructions: `${report}\n\nIncomplete scopes: ${incompleteScopes.join(', ')}\n\n**IMPORTANT**: Present each scope individually to the user. Do NOT combine or group scopes. Use exact scope names.\n\nTo proceed, call projectSetup tool again with:\n- step: "reportScan"\n- sessionId: "${sessionId}"\n- selectedScopes: ["${incompleteScopeNames}"]  (Use exact scope names from the list above)`
        } as ReportScanResponse;
      }

      // User selected scope(s) - take first scope to generate
      const selectedScope = selectedScopes[0];
      const scopeConfig = allScopes[selectedScope];

      if (!scopeConfig) {
        return {
          success: false,
          error: {
            message: `Invalid scope: ${selectedScope}`,
            details: `Available scopes: ${Object.keys(allScopes).join(', ')}`
          }
        } as ErrorResponse;
      }

      // Calculate which files need to be generated
      const filesToGenerate = scopeConfig.files.filter(file => !filesToUse.includes(file));

      // Store selected scopes in session
      session.data.selectedScopes = selectedScopes;
      session.data.currentStep = 'generateScope';
      sessionManager.updateSession(sessionId, session.data);

      logger.info('Ready to generate scope', {
        requestId,
        sessionId,
        scope: selectedScope,
        filesToGenerate: filesToGenerate.length,
        questions: scopeConfig.questions.length
      });

      // Return ALL questions for this scope
      return {
        success: true,
        sessionId,
        nextStep: 'generateScope',
        scope: selectedScope,
        questions: scopeConfig.questions,
        filesToGenerate,
        instructions: `Scope: ${selectedScope}\n\nFiles to generate (${filesToGenerate.length}):\n${filesToGenerate.map(f => `- ${f}`).join('\n')}\n\nQuestions (${scopeConfig.questions.length}):\n${scopeConfig.questions.map((q, i) => `${i + 1}. ${q.question} (ID: ${q.id}${q.required ? ', required' : ''})`).join('\n')}\n\nAnalyze the repository to determine answers for these questions. Present your suggested answers as a numbered list. Once finalized, call projectSetup tool with:\n- step: "generateScope"\n- sessionId: "${sessionId}"\n- scope: "${selectedScope}"\n- answers: {${scopeConfig.questions.slice(0, 2).map(q => `"${q.id}": "value"`).join(', ')}, ...}`
      };
    },
    {
      operation: 'project_setup_report_scan',
      component: 'ProjectSetupTool',
      requestId
    }
  );
}

/**
 * Generate human-readable report of scope analysis
 */
function generateReport(
  scopeStatus: Record<string, { complete: boolean; missingFiles: string[] }>,
  allScopes: Record<string, { files: string[]; [key: string]: unknown }>
): string {
  const lines: string[] = ['Repository Analysis:', ''];

  for (const [scopeName, status] of Object.entries(scopeStatus)) {
    const scopeConfig = allScopes[scopeName];
    const totalFiles = scopeConfig.files.length;
    const missingCount = status.missingFiles.length;
    const existingCount = totalFiles - missingCount;

    const statusIcon = status.complete ? '✓' : '○';
    lines.push(`${statusIcon} ${scopeName}: ${existingCount}/${totalFiles} files exist`);

    if (!status.complete) {
      lines.push(`  Missing: ${status.missingFiles.join(', ')}`);
    }
  }

  return lines.join('\n');
}
