/**
 * Generate Scope Handler - Project Setup Tool
 * PRD #177 - Scope-based workflow refactoring
 *
 * Step 3 of workflow: Generate ALL files in a scope at once
 */

import { ErrorHandler, Logger } from '../../core/error-handling';
import { GenericSessionManager } from '../../core/generic-session-manager';
import { GenerateScopeResponse, ProjectSetupSessionData, ErrorResponse, GeneratedFile } from './types';
import { loadPrompt } from '../../core/shared-prompt-loader';

/**
 * Handle generateScope stage - Step 3 of project setup workflow
 *
 * Generates ALL files for a scope at once based on user answers
 */
export async function handleGenerateScope(
  sessionId: string,
  scope: string | undefined,
  answers: Record<string, any> | undefined,
  logger: Logger,
  requestId: string
): Promise<GenerateScopeResponse | ErrorResponse> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Starting scope generation', { requestId, sessionId, scope });

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

      // Validate inputs
      if (!scope) {
        return {
          success: false,
          error: {
            message: 'scope is required for generateScope step',
            details: 'Provide the scope name (e.g., "github-community")'
          }
        } as ErrorResponse;
      }

      if (!answers) {
        return {
          success: false,
          error: {
            message: 'answers are required for generateScope step',
            details: 'Provide answers to the questions for this scope'
          }
        } as ErrorResponse;
      }

      // Validate session state
      if (!session.data.allScopes || !session.data.existingFiles) {
        return {
          success: false,
          error: {
            message: 'Invalid session state',
            details: 'Session does not contain required data'
          }
        } as ErrorResponse;
      }

      const scopeConfig = session.data.allScopes[scope];
      if (!scopeConfig) {
        return {
          success: false,
          error: {
            message: `Invalid scope: ${scope}`,
            details: `Available scopes: ${Object.keys(session.data.allScopes).join(', ')}`
          }
        } as ErrorResponse;
      }

      // Get files to generate (excluding existing ones)
      const existingFiles = session.data.existingFiles;
      const baseFiles = scopeConfig.files.filter(file => !existingFiles.includes(file));

      // Add conditional-only files (files that exist ONLY in conditionalFiles, not in main files array)
      const conditionalFiles = scopeConfig.conditionalFiles || {};
      const conditionalOnlyFiles = Object.keys(conditionalFiles).filter(
        file => !scopeConfig.files.includes(file) && !existingFiles.includes(file)
      );

      // Combine base files and conditional-only files
      const filesToGenerate = [...baseFiles, ...conditionalOnlyFiles];

      // Evaluate conditional files and generate content
      const generatedFiles: GeneratedFile[] = [];
      const excludedFiles: string[] = [];

      for (const fileName of filesToGenerate) {
        // Check if this file has conditional generation rules
        const conditionalRule = conditionalFiles[fileName];

        if (conditionalRule) {
          const shouldGenerate = evaluateCondition(conditionalRule.condition, answers);

          if (!shouldGenerate) {
            logger.info('File excluded due to conditional rule', {
              requestId,
              fileName,
              scope,
              condition: conditionalRule.condition,
              reason: conditionalRule.reason
            });
            excludedFiles.push(fileName);
            continue;
          }
        }

        // Preprocess answers for template (convert comma-separated strings to arrays)
        const processedAnswers = preprocessAnswers(answers);

        // Generate file content
        const content = generateFileContent(fileName, processedAnswers, logger);

        generatedFiles.push({
          path: fileName,
          content,
          reason: conditionalRule ? conditionalRule.reason : undefined
        });

        logger.info('File generated', {
          requestId,
          sessionId,
          fileName,
          scope,
          contentLength: content.length
        });
      }

      // Update session
      session.data.currentStep = 'complete';
      sessionManager.updateSession(sessionId, session.data);

      logger.info('Scope generation complete', {
        requestId,
        sessionId,
        scope,
        generatedCount: generatedFiles.length,
        excludedCount: excludedFiles.length
      });

      return {
        success: true,
        sessionId,
        scope,
        files: generatedFiles,
        excludedFiles: excludedFiles.length > 0 ? excludedFiles : undefined,
        instructions: `Generated ${generatedFiles.length} file(s) for scope "${scope}".\n\n` +
          `Files:\n${generatedFiles.map(f => `- ${f.path}`).join('\n')}\n\n` +
          (excludedFiles.length > 0 ? `Excluded ${excludedFiles.length} file(s):\n${excludedFiles.map(f => `- ${f}`).join('\n')}\n\n` : '') +
          `Write these files to your repository using the Write tool.`
      };
    },
    {
      operation: 'project_setup_generate_scope',
      component: 'ProjectSetupTool',
      requestId
    }
  );
}

/**
 * Generate file content from template using Handlebars
 */
function generateFileContent(fileName: string, answers: Record<string, any>, logger: Logger): string {
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
 * Supports conditions:
 * - "false" -> always false
 * - "true" -> always true
 * - "variableName === 'value'" -> check if answers[variableName] === 'value'
 * - "variableName === true" -> check if answers[variableName] is boolean true or truthy string
 * - OR conditions: "condition1 || condition2 || condition3"
 */
function evaluateCondition(condition: string, answers: Record<string, any>): boolean {
  const trimmed = condition.trim();

  // Handle literal boolean strings
  if (trimmed === 'false') return false;
  if (trimmed === 'true') return true;

  // Handle OR conditions: split by || and evaluate each part
  if (trimmed.includes('||')) {
    const conditions = trimmed.split('||').map(c => c.trim());
    return conditions.some(cond => evaluateCondition(cond, answers));
  }

  // Handle equality checks with boolean: "variableName === true"
  const booleanMatch = trimmed.match(/^(\w+)\s*===\s*(true|false)$/);
  if (booleanMatch) {
    const [, variableName, expectedValue] = booleanMatch;
    const actualValue = answers[variableName];

    // Check for truthy values: boolean true, string "yes", string "true"
    if (expectedValue === 'true') {
      return actualValue === true || actualValue === 'true' || actualValue === 'yes';
    }
    // Check for falsy values
    return actualValue === false || actualValue === 'false' || actualValue === 'no';
  }

  // Handle equality checks with strings: "variableName === 'value'"
  const stringMatch = trimmed.match(/^(\w+)\s*===\s*['"]([^'"]+)['"]$/);
  if (stringMatch) {
    const [, variableName, expectedValue] = stringMatch;
    return answers[variableName] === expectedValue;
  }

  // Unknown condition format - default to false for safety
  return false;
}

/**
 * Preprocess answers for Handlebars templates
 * Converts comma-separated strings to arrays where needed
 */
function preprocessAnswers(answers: Record<string, any>): Record<string, any> {
  const processed = { ...answers };

  // Convert maintainerUsernames from comma-separated string to array
  if (processed.maintainerUsernames && typeof processed.maintainerUsernames === 'string') {
    processed.maintainerUsernames = processed.maintainerUsernames
      .split(',')
      .map((username: string) => username.trim())
      .filter((username: string) => username.length > 0);
  }

  return processed;
}
