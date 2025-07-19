/**
 * Test Docs Tool - Documentation testing workflow orchestrator
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import * as fs from 'fs';
import { DocTestingSessionManager } from '../core/doc-testing-session';
import { ValidationPhase } from '../core/doc-testing-types';
import { DocDiscovery } from '../core/doc-discovery';

// Tool metadata for direct MCP registration
export const TESTDOCS_TOOL_NAME = 'testDocs';
export const TESTDOCS_TOOL_DESCRIPTION = 'Test, validate, check, scan, verify, analyze, or review documentation files for accuracy, functionality, broken examples, outdated commands, invalid links, and overall quality. Use this tool whenever the user wants to test docs, validate documentation, check if examples work, scan for issues, verify commands, analyze doc quality, or review documentation content. IMPORTANT: This tool returns a workflow step with a "prompt" field - you must execute that prompt immediately to perform the actual documentation analysis.';

// Zod schema for MCP registration
export const TESTDOCS_TOOL_INPUT_SCHEMA = {
  filePath: z.string().min(1).optional().describe('Path to documentation file to test (optional - if not provided, will discover available files)'),
  sessionId: z.string().optional().describe('Existing session ID to continue (optional)'),
  phase: z.enum(['scan', 'test', 'analyze', 'fix']).optional().describe('Specific phase to run (defaults to scan)'),
  sectionId: z.string().optional().describe('Section ID when submitting test results'),
  results: z.string().optional().describe('Test results to store (for client agent reporting back)'),
  filePattern: z.string().optional().describe('File pattern for discovery (e.g., "**/*.md", "*.rst")')
};

/**
 * Handle test-docs tool request
 */
export async function handleTestDocsTool(
  args: any,
  _dotAI: DotAI | null,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Processing test-docs tool request', { 
      requestId, 
      filePath: args.filePath,
      sessionId: args.sessionId,
      phase: args.phase
    });

    // Check if we're in discovery mode (no filePath and no sessionId provided)
    if (!args.filePath && !args.sessionId) {
      logger.info('Running in discovery mode - scanning for documentation files', { requestId });
      
      const discovery = new DocDiscovery();
      const pattern = discovery.getFilePattern(args);
      const discoveredFiles = await discovery.discoverFiles(process.cwd(), pattern);
      
      if (discoveredFiles.length === 0) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `No documentation files found matching pattern: ${pattern}`,
          {
            operation: 'file_discovery',
            component: 'TestDocsTool',
            requestId,
            input: { pattern }
          }
        );
      }

      // Return discovery results
      const displayText = discovery.formatForDisplay(discoveredFiles);
      const defaultFile = discoveredFiles[0];
      
      logger.info('Discovery completed', { 
        requestId, 
        filesFound: discoveredFiles.length,
        pattern,
        defaultFile: defaultFile.relativePath
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            mode: 'discovery',
            pattern,
            filesFound: discoveredFiles.length,
            defaultFile: defaultFile.relativePath,
            files: discoveredFiles.map(f => ({
              path: f.relativePath,
              category: f.category,
              priority: f.priority
            })),
            displayText,
            instruction: `I found ${discoveredFiles.length} documentation file${discoveredFiles.length === 1 ? '' : 's'} matching "${pattern}". You must ask the user which file they want to test. Do not choose automatically - wait for the user to specify which file they prefer. The recommended option is "${defaultFile.relativePath}".`
          }, null, 2)
        }]
      };
    }

    // If we have sessionId but no filePath, load session to get filePath
    if (args.sessionId && !args.filePath) {
      const sessionManager = new DocTestingSessionManager();
      const existingSession = sessionManager.loadSession(args.sessionId, args);
      if (existingSession) {
        args.filePath = existingSession.filePath;
      }
    }

    // Validate file exists (testing mode)
    if (!fs.existsSync(args.filePath)) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        `Documentation file not found: ${args.filePath}`,
        {
          operation: 'file_validation',
          component: 'TestDocsTool',
          requestId,
          input: { filePath: args.filePath }
        }
      );
    }

    // Initialize session manager
    const sessionManager = new DocTestingSessionManager();

    let session;
    
    if (args.sessionId) {
      // Load existing session
      session = sessionManager.loadSession(args.sessionId, args);
      if (!session) {
        throw ErrorHandler.createError(
          ErrorCategory.STORAGE,
          ErrorSeverity.HIGH,
          `Session not found: ${args.sessionId}`,
          {
            operation: 'session_load',
            component: 'TestDocsTool',
            requestId,
            input: { sessionId: args.sessionId }
          }
        );
      }
      logger.info('Loaded existing session', { requestId, sessionId: args.sessionId });
    } else {
      // Create new session
      session = sessionManager.createSession(args.filePath, args);
      logger.info('Created new session', { requestId, sessionId: session.sessionId });
    }

    // Handle results submission if provided
    if (args.results && args.sessionId) {
      if (args.sectionId) {
        // Section-specific results
        logger.info('Storing section test results', { 
          requestId, 
          sessionId: args.sessionId,
          sectionId: args.sectionId
        });
        
        sessionManager.storeSectionTestResults(args.sessionId, args.sectionId, args.results, args);
        
        // After storing section results, get the next workflow step automatically
        const nextWorkflowStep = sessionManager.getNextStep(args.sessionId, args);
        if (nextWorkflowStep) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  data: nextWorkflowStep
                }, null, 2)
              }
            ]
          };
        }
      } else {
        // Scan results - process JSON array of section titles
        logger.info('Processing scan results', { 
          requestId, 
          sessionId: args.sessionId
        });
        
        try {
          const scanResults = JSON.parse(args.results);
          if (scanResults.sections && Array.isArray(scanResults.sections)) {
            sessionManager.processScanResults(args.sessionId, scanResults.sections, args);
            logger.info('Scan results processed successfully', { 
              requestId, 
              sessionId: args.sessionId,
              sectionsCount: scanResults.sections.length
            });
            
            // After processing scan results, get the next workflow step based on updated session state
            const nextWorkflowStep = sessionManager.getNextStep(args.sessionId, args);
            if (nextWorkflowStep) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: true,
                      data: nextWorkflowStep
                    }, null, 2)
                  }
                ]
              };
            }
          } else {
            throw new Error('Invalid scan results format - expected {sections: [...]} structure');
          }
        } catch (parseError) {
          throw ErrorHandler.createError(
            ErrorCategory.VALIDATION,
            ErrorSeverity.HIGH,
            `Failed to process scan results: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
            {
              operation: 'scan_results_processing',
              component: 'TestDocsTool',
              requestId,
              input: { sessionId: args.sessionId, results: args.results }
            }
          );
        }
      }
    }

    // Determine phase to run - only override if explicitly provided
    const phaseOverride = args.phase ? args.phase as ValidationPhase : undefined;
    
    // Get workflow step
    const workflowStep = sessionManager.getNextStep(session.sessionId, args, phaseOverride);
    
    if (!workflowStep) {
      throw ErrorHandler.createError(
        ErrorCategory.OPERATION,
        ErrorSeverity.HIGH,
        `Failed to get workflow step for session: ${session.sessionId}`,
        {
          operation: 'workflow_step_generation',
          component: 'TestDocsTool',
          requestId,
          input: { sessionId: session.sessionId, phaseOverride }
        }
      );
    }

    logger.info('Generated workflow step', { 
      requestId, 
      sessionId: session.sessionId,
      phase: workflowStep.phase,
      nextPhase: workflowStep.nextPhase
    });

    // Return successful response
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          sessionId: session.sessionId,
          phase: workflowStep.phase,
          filePath: session.filePath,
          prompt: workflowStep.prompt,
          nextPhase: workflowStep.nextPhase,
          workflow: workflowStep.workflow,
          reportFile: session.reportFile
        }, null, 2)
      }]
    };

  } catch (error) {
    logger.error('Test-docs tool failed', error as Error);

    // Handle errors consistently
    if (error instanceof Error && 'category' in error) {
      // Already an AppError, just return it
      throw error;
    }

    throw ErrorHandler.createError(
      ErrorCategory.OPERATION,
      ErrorSeverity.HIGH,
      error instanceof Error ? error.message : 'Unknown error in test-docs tool',
      {
        operation: 'test_docs_tool',
        component: 'TestDocsTool',
        requestId,
        input: args
      }
    );
  }
}