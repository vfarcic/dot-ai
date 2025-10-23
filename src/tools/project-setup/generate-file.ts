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
  nextFileAnswers: Record<string, string> | undefined,
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
        return handleFileCompletion(sessionManager, session, files, completedFileName, nextFileAnswers, logger, requestId);
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

      // Check conditional file rules from the file's scope
      const fileScope = files[fileName].scope;
      if (fileScope && session.data.allScopes) {
        const scopeConfig = session.data.allScopes[fileScope];
        const conditionalFiles = scopeConfig?.conditionalFiles || {};
        const conditionalRule = conditionalFiles[fileName];

        if (conditionalRule) {
          const shouldGenerate = evaluateCondition(conditionalRule.condition, answers);

          if (!shouldGenerate) {
            // File doesn't meet condition - skip it
            logger.info('File skipped due to conditional rule', {
              requestId,
              fileName,
              scope: fileScope,
              condition: conditionalRule.condition,
              reason: conditionalRule.reason
            });

            // Mark file as excluded
            files[fileName].status = 'excluded';
            files[fileName].answers = answers;

            // Find next pending file
            return handleFileCompletion(sessionManager, session, files, fileName, undefined, logger, requestId);
          }
        }
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

      // Look ahead to see if there's a next pending file (optimization to reduce round trips)
      const nextPendingEntry = Object.entries(files).find(
        ([name, file]) => name !== fileName && file.status === 'pending'
      );

      let nextFilePreview;
      let instructions;

      if (nextPendingEntry) {
        const [nextFileName, nextFile] = nextPendingEntry;
        const nextScope = nextFile.scope || '';
        const nextScopeConfig = nextScope && session.data.allScopes ? session.data.allScopes[nextScope] : undefined;
        const nextQuestions = nextScopeConfig?.questions || [];

        if (nextQuestions.length > 0) {
          nextFilePreview = {
            fileName: nextFileName,
            scope: nextScope,
            questions: nextQuestions
          };

          instructions = `File content generated for "${fileName}". Write this content to the file in your repository.\n\n${generateNextFileInstructions(sessionId, nextFileName, nextScope, nextQuestions, true, fileName)}`;
        }
      }

      if (!instructions) {
        // No more files after this one
        instructions = `File content generated for "${fileName}". Write this content to the file in your repository. After creating the file, call projectSetup tool with step: "generateFile", sessionId: "${sessionId}", and completedFileName: "${fileName}" to confirm completion.`;
      }

      // Return generation response with optional next file preview
      const response: GenerateFileResponse = {
        success: true,
        sessionId: session.sessionId,
        fileName,
        content,
        nextFile: nextFilePreview,
        instructions
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
 * Generate instructions for next file questions
 * Used both after file generation (preview) and after completion confirmation
 */
function generateNextFileInstructions(
  sessionId: string,
  nextFileName: string,
  nextScope: string,
  nextQuestions: any[],
  includeCompletionParams: boolean,
  completedFileName?: string
): string {
  const questionsText = nextQuestions.map((q: any, idx: number) => `${idx + 1}. ${q.question} (ID: ${q.id})`).join('\n');
  const answerExample = nextQuestions.slice(0, 2).map((q: any) => `"${q.id}": "value${nextQuestions.indexOf(q) + 1}"`).join(', ');

  const prefix = completedFileName
    ? `File "${completedFileName}" marked as done. Next file to generate: "${nextFileName}"${nextScope ? ` (${nextScope} scope)` : ''}`
    : `Next file to generate: "${nextFileName}"${nextScope ? ` (${nextScope} scope)` : ''}`;

  const callParams = includeCompletionParams
    ? `step: "generateFile", sessionId: "${sessionId}", completedFileName: "${completedFileName}", and nextFileAnswers: {${answerExample}, ...}`
    : `step: "generateFile", sessionId: "${sessionId}", fileName: "${nextFileName}", and answers: {${answerExample}, ...}`;

  return `${prefix}\n\nAnalyze the repository to determine answers for these questions:\n${questionsText}\n\nPresent your suggested answers as a numbered list to match the questions above. Allow the user to review and respond with the number if they want to change any answer (e.g., "2. New description here"). Once answers are finalized, call projectSetup tool with ${callParams} using the question IDs as keys.`;
}

/**
 * Handle file completion and move to next file
 */
function handleFileCompletion(
  sessionManager: GenericSessionManager<ProjectSetupSessionData>,
  session: any,
  files: Record<string, FileInfo>,
  completedFileName: string,
  nextFileAnswers: Record<string, string> | undefined,
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
  const [nextFileName, nextFileInfo] = nextPendingFile;
  files[nextFileName].status = 'in-progress';

  // Get questions for next file's scope
  const nextScope = nextFileInfo.scope || '';
  const nextScopeConfig = nextScope && session.data.allScopes ? session.data.allScopes[nextScope] : undefined;
  const nextQuestions = nextScopeConfig?.questions || [];

  // If client provided answers for next file, generate it immediately (optimization)
  if (nextFileAnswers) {
    logger.info('Client provided next file answers, generating immediately', {
      requestId,
      sessionId: session.sessionId,
      nextFile: nextFileName
    });

    // Check conditional file rules
    if (nextScope && session.data.allScopes) {
      const scopeConfig = session.data.allScopes[nextScope];
      const conditionalFiles = scopeConfig?.conditionalFiles || {};
      const conditionalRule = conditionalFiles[nextFileName];

      if (conditionalRule) {
        const shouldGenerate = evaluateCondition(conditionalRule.condition, nextFileAnswers);

        if (!shouldGenerate) {
          logger.info('Next file skipped due to conditional rule', {
            requestId,
            nextFileName,
            scope: nextScope,
            condition: conditionalRule.condition
          });

          // Mark as excluded and recursively move to next file
          files[nextFileName].status = 'excluded';
          files[nextFileName].answers = nextFileAnswers;

          sessionManager.updateSession(session.sessionId, {
            ...session.data,
            files
          });

          return handleFileCompletion(sessionManager, session, files, nextFileName, undefined, logger, requestId);
        }
      }
    }

    // Generate next file content
    const nextContent = generateFileContent(nextFileName, nextFileAnswers, logger);

    // Store answers
    files[nextFileName].answers = nextFileAnswers;

    sessionManager.updateSession(session.sessionId, {
      ...session.data,
      files
    });

    // Look ahead for file after next
    const fileAfterNext = Object.entries(files).find(
      ([name, file]) => name !== nextFileName && file.status === 'pending'
    );

    let nextFilePreview;
    let instructions;

    if (fileAfterNext) {
      const [fileAfterNextName, fileAfterNextInfo] = fileAfterNext;
      const fileAfterNextScope = fileAfterNextInfo.scope || '';
      const fileAfterNextScopeConfig = fileAfterNextScope && session.data.allScopes ? session.data.allScopes[fileAfterNextScope] : undefined;
      const fileAfterNextQuestions = fileAfterNextScopeConfig?.questions || [];

      if (fileAfterNextQuestions.length > 0) {
        nextFilePreview = {
          fileName: fileAfterNextName,
          scope: fileAfterNextScope,
          questions: fileAfterNextQuestions
        };

        instructions = `File content generated for "${nextFileName}". Write this content to the file in your repository.\n\n${generateNextFileInstructions(session.sessionId, fileAfterNextName, fileAfterNextScope, fileAfterNextQuestions, true, nextFileName)}`;
      }
    }

    if (!instructions) {
      instructions = `File content generated for "${nextFileName}". Write this content to the file in your repository. After creating the file, call projectSetup tool with step: "generateFile", sessionId: "${session.sessionId}", and completedFileName: "${nextFileName}" to confirm completion.`;
    }

    return {
      success: true,
      sessionId: session.sessionId,
      fileName: nextFileName,
      content: nextContent,
      nextFile: nextFilePreview,
      instructions
    };
  }

  // No answers provided - return questions for client to answer
  sessionManager.updateSession(session.sessionId, {
    ...session.data,
    files
  });

  logger.info('Moving to next file', {
    requestId,
    sessionId: session.sessionId,
    nextFile: nextFileName,
    nextScope: nextFileInfo.scope
  });

  // Return questions for next file
  return {
    success: true,
    sessionId: session.sessionId,
    fileName: nextFileName,
    content: '',
    instructions: generateNextFileInstructions(session.sessionId, nextFileName, nextScope, nextQuestions, false, completedFileName)
  };
}

/**
 * Generate file content from template using Handlebars
 */
function generateFileContent(fileName: string, answers: Record<string, string>, logger: Logger): string {
  try {
    // Load template using shared prompt loader with Handlebars support
    // Templates use .hbs extension (e.g., README.md -> README.md.hbs)
    const content = loadPrompt(
      fileName,
      answers,
      'src/tools/project-setup/templates',
      '.hbs' // Add .hbs extension to template files
    );

    return content;
  } catch (error) {
    logger.error('Failed to generate file content', error as Error, { fileName });
    return `# ${fileName}\n\nError: Could not generate content for this file.\nTemplate may be missing at: src/tools/project-setup/templates/${fileName}.hbs\n`;
  }
}

/**
 * Evaluate conditional file generation rule
 *
 * Supports simple conditions:
 * - "false" -> always false
 * - "true" -> always true
 * - "variableName === 'value'" -> check if answers[variableName] === 'value'
 */
function evaluateCondition(condition: string, answers: Record<string, string>): boolean {
  const trimmed = condition.trim();

  // Handle literal boolean strings
  if (trimmed === 'false') return false;
  if (trimmed === 'true') return true;

  // Handle equality checks: "variableName === 'value'"
  const equalityMatch = trimmed.match(/^(\w+)\s*===\s*['"]([^'"]+)['"]$/);
  if (equalityMatch) {
    const [, variableName, expectedValue] = equalityMatch;
    return answers[variableName] === expectedValue;
  }

  // Unknown condition format - default to false for safety
  return false;
}
