/**
 * Generate File Handler - Project Setup Tool
 * PRD #177 - Milestone 1: Core Tool Infrastructure
 *
 * Step 3 of workflow: Generate specific file content with iterative completion tracking
 */

import { ErrorHandler, Logger } from '../../core/error-handling';
import { GenericSessionManager } from '../../core/generic-session-manager';
import { GenerateFileResponse, ProjectSetupSessionData, ErrorResponse, FileInfo } from './types';
import { loadPrompt } from '../../core/shared-prompt-loader';

/**
 * Handle generateFile stage - Step 3 of project setup workflow
 *
 * Supports iterative workflow:
 * 1. completedFileName provided: Mark file as done, return next file's questions
 * 2. fileName + answers provided: Generate file content
 */
export async function handleGenerateFile(
  sessionId: string,
  fileName: string | undefined,
  answers: Record<string, string> | undefined,
  completedFileName: string | undefined,
  logger: Logger,
  requestId: string
): Promise<GenerateFileResponse | ErrorResponse> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Starting file generation', { requestId, sessionId, fileName, completedFileName });

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

      const files = session.data.files || {};

      // Handle completion confirmation
      if (completedFileName) {
        return handleFileCompletion(sessionManager, session, files, completedFileName, logger, requestId);
      }

      // Handle file generation
      if (!fileName) {
        return {
          success: false,
          error: {
            message: 'fileName is required for generateFile step',
            details: 'Provide either fileName (with answers) or completedFileName'
          }
        } as ErrorResponse;
      }

      if (!answers) {
        return {
          success: false,
          error: {
            message: 'answers are required for file generation',
            details: 'Provide answers to the questions for this file'
          }
        } as ErrorResponse;
      }

      // Validate file is in-progress
      if (!files[fileName] || files[fileName].status !== 'in-progress') {
        return {
          success: false,
          error: {
            message: `File "${fileName}" is not in-progress`,
            details: `Current status: ${files[fileName]?.status || 'not found'}`
          }
        } as ErrorResponse;
      }

      // Generate file content from template
      const content = generateFileContent(fileName, answers, logger);

      // Store answers in session
      files[fileName].answers = answers;

      sessionManager.updateSession(sessionId, {
        ...session.data,
        files
      });

      logger.info('File content generated', {
        requestId,
        sessionId,
        fileName,
        contentLength: content.length
      });

      // Return generation response
      const response: GenerateFileResponse = {
        success: true,
        sessionId: session.sessionId,
        fileName,
        content,
        instructions: `File content generated for "${fileName}". Write this content to the file in your repository. After creating the file, call projectSetup tool with step: "generateFile", sessionId: "${sessionId}", and completedFileName: "${fileName}" to confirm completion.`
      };

      return response;
    },
    {
      operation: 'project_setup_generate_file',
      component: 'ProjectSetupTool',
      requestId
    }
  );
}

/**
 * Handle file completion and move to next file
 */
function handleFileCompletion(
  sessionManager: GenericSessionManager<ProjectSetupSessionData>,
  session: any,
  files: Record<string, FileInfo>,
  completedFileName: string,
  logger: Logger,
  requestId: string
): GenerateFileResponse | ErrorResponse {
  // Validate completed file
  if (!files[completedFileName]) {
    return {
      success: false,
      error: {
        message: `File "${completedFileName}" not found in session`,
        details: 'Invalid completedFileName'
      }
    } as ErrorResponse;
  }

  // Mark file as done
  files[completedFileName].status = 'done';

  logger.info('File marked as completed', {
    requestId,
    sessionId: session.sessionId,
    fileName: completedFileName
  });

  // Find next pending file
  const nextPendingFile = Object.entries(files).find(
    ([_name, file]) => file.status === 'pending'
  );

  // If no more files, we're done
  if (!nextPendingFile) {
    sessionManager.updateSession(session.sessionId, {
      ...session.data,
      currentStep: 'complete',
      files
    });

    const completedCount = Object.values(files).filter(f => f.status === 'done').length;

    return {
      success: true,
      sessionId: session.sessionId,
      fileName: completedFileName,
      content: '',
      instructions: `All files generated successfully! Completed ${completedCount} file(s).`
    };
  }

  // Mark next file as in-progress
  const [nextFileName] = nextPendingFile;
  files[nextFileName].status = 'in-progress';

  sessionManager.updateSession(session.sessionId, {
    ...session.data,
    files
  });

  logger.info('Moving to next file', {
    requestId,
    sessionId: session.sessionId,
    nextFile: nextFileName
  });

  // Return questions for next file
  return {
    success: true,
    sessionId: session.sessionId,
    fileName: nextFileName,
    content: '',
    instructions: `File "${completedFileName}" marked as done. Next file to generate: "${nextFileName}"\n\nAnalyze the repository to determine answers for these questions:\n${session.data.questions?.map((q: any, idx: number) => `${idx + 1}. ${q.question} (ID: ${q.id})`).join('\n')}\n\nPresent your suggested answers as a numbered list to match the questions above. Allow the user to review and respond with the number if they want to change any answer (e.g., "2. New description here"). Once answers are finalized, call projectSetup tool with step: "generateFile", sessionId: "${session.sessionId}", fileName: "${nextFileName}", and answers using the question IDs as keys (e.g., {"${session.data.questions?.[0]?.id}": "value1", "${session.data.questions?.[1]?.id}": "value2", ...})`
  };
}

/**
 * Generate file content from template using Handlebars
 */
function generateFileContent(fileName: string, answers: Record<string, string>, logger: Logger): string {
  try {
    // Load template using shared prompt loader with Handlebars support
    const content = loadPrompt(
      fileName,
      answers,
      'src/tools/project-setup/templates',
      '' // No extension, fileName already includes it
    );

    return content;
  } catch (error) {
    logger.error('Failed to generate file content', error as Error, { fileName });
    return `# ${fileName}\n\nError: Could not generate content for this file.\nTemplate may be missing at: src/tools/project-setup/templates/${fileName}\n`;
  }
}
