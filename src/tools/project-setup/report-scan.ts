/**
 * Report Scan Handler - Project Setup Tool
 * PRD #177 - Milestone 1: Core Tool Infrastructure
 *
 * Step 2 of workflow: Analyze scan results and identify missing files
 */

import { ErrorHandler, Logger } from '../../core/error-handling';
import { GenericSessionManager } from '../../core/generic-session-manager';
import { ReportScanResponse, ProjectSetupSessionData, ErrorResponse } from './types';

/**
 * Handle reportScan stage - Step 2 of project setup workflow
 *
 * Analyzes which files exist vs. which are missing
 * If selectedFiles provided, initializes files map and returns questions for first file
 */
export async function handleReportScan(
  sessionId: string,
  existingFiles: string[],
  selectedFiles: string[] | undefined,
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
      if (!session.data.filesToCheck) {
        return {
          success: false,
          error: {
            message: 'Invalid session state',
            details: 'Session does not contain filesToCheck data'
          }
        } as ErrorResponse;
      }

      // Calculate missing files
      const missingFiles = session.data.filesToCheck.filter(
        file => !existingFiles.includes(file)
      );

      logger.info('Scan analysis complete', {
        requestId,
        sessionId,
        totalFiles: session.data.filesToCheck.length,
        existingCount: existingFiles.length,
        missingCount: missingFiles.length
      });

      // If user hasn't selected files yet, return the report for them to choose
      if (!selectedFiles) {
        if (missingFiles.length === 0) {
          return {
            success: true,
            sessionId: session.sessionId,
            existingFiles,
            missingFiles: [],
            nextStep: 'generateFile',
            instructions: 'All files exist! No files need to be generated.'
          };
        }

        return {
          success: true,
          sessionId: session.sessionId,
          existingFiles,
          missingFiles,
          nextStep: 'generateFile',
          instructions: `Present this report to the user:\n\nExisting files (${existingFiles.length}):\n${existingFiles.map(f => `✓ ${f}`).join('\n')}\n\nMissing files (${missingFiles.length}):\n${missingFiles.map(f => `✗ ${f}`).join('\n')}\n\nAsk the user which missing files they would like to generate. Then call projectSetup tool again with step: "reportScan", sessionId: "${sessionId}", existingFiles: [...], and selectedFiles: ["file1", "file2", ...] with the files user chose.`
        };
      }

      // User has selected files - initialize files map
      const filesMap: Record<string, { status: 'excluded' | 'pending' | 'in-progress' | 'done', answers?: Record<string, string> }> = {};

      // Mark all files
      for (const file of session.data.filesToCheck) {
        if (existingFiles.includes(file)) {
          filesMap[file] = { status: 'excluded' }; // Already exists
        } else if (selectedFiles.includes(file)) {
          filesMap[file] = { status: 'pending' };   // User wants to generate
        } else {
          filesMap[file] = { status: 'excluded' }; // User doesn't want
        }
      }

      // Find first pending file
      const firstPendingFile = selectedFiles.find(f => filesMap[f]?.status === 'pending');

      if (!firstPendingFile) {
        return {
          success: false,
          error: {
            message: 'No valid files to generate',
            details: 'Selected files are either already existing or invalid'
          }
        } as ErrorResponse;
      }

      // Mark first file as in-progress
      filesMap[firstPendingFile].status = 'in-progress';

      // Update session
      sessionManager.updateSession(sessionId, {
        currentStep: 'generateFile',
        questions: session.data.questions,
        filesToCheck: session.data.filesToCheck,
        files: filesMap
      });

      logger.info('Files map initialized, starting with first file', {
        requestId,
        sessionId,
        firstFile: firstPendingFile
      });

      // Return questions for first file
      const response: ReportScanResponse = {
        success: true,
        sessionId: session.sessionId,
        existingFiles,
        missingFiles,
        nextStep: 'generateFile',
        currentFile: firstPendingFile,
        questions: session.data.questions,
        instructions: `Analyze the repository to determine answers for these questions about ${firstPendingFile}:\n${session.data.questions?.map((q, idx) => `${idx + 1}. ${q.question} (ID: ${q.id})`).join('\n')}\n\nPresent your suggested answers as a numbered list to match the questions above. Allow the user to review and respond with the number if they want to change any answer (e.g., "2. New description here"). Once answers are finalized, call projectSetup tool with step: "generateFile", sessionId: "${sessionId}", fileName: "${firstPendingFile}", and answers using the question IDs as keys (e.g., {"${session.data.questions?.[0]?.id}": "value1", "${session.data.questions?.[1]?.id}": "value2", ...})`
      };

      logger.debug('Report scan response prepared', {
        requestId,
        sessionId,
        currentFile: firstPendingFile
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
