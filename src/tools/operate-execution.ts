/**
 * Operate Execution Workflow
 *
 * Executes approved operational changes using shared command executor
 * and validates results using remediate tool
 */

import { Logger, ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { GenericSessionManager } from '../core/generic-session-manager';
import { executeCommands } from '../core/command-executor';
import { OperateSessionData, ExecutionResult, OperateOutput } from './operate';
import { handleRemediateTool } from './remediate';

/**
 * Executes approved operational changes
 * @param sessionId - Session ID with approved changes
 * @param logger - Logger instance
 * @param sessionManager - Session manager instance
 * @returns Operation output with execution results
 */
export async function executeOperations(
  sessionId: string,
  logger: Logger,
  sessionManager: GenericSessionManager<OperateSessionData>
): Promise<OperateOutput> {
  logger.info('Starting operation execution', { sessionId });

  try {
    // 1. Load session with approved commands
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        `Session not found: ${sessionId}. The session may have expired or been deleted.`,
        { operation: 'session_loading', component: 'OperateExecutionTool' }
      );
    }

    // Check if already executed
    if (session.data.status === 'executing' || session.data.status === 'executed_successfully' || session.data.status === 'executed_with_errors') {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        `Session ${sessionId} has already been executed. Current status: ${session.data.status}`,
        { operation: 'execution_validation', component: 'OperateExecutionTool' }
      );
    }

    // Update session status to executing
    sessionManager.updateSession(sessionId, { status: 'executing' });

    logger.info('Loaded session for execution', {
      sessionId,
      commandCount: session.data.commands.length,
      intent: session.data.intent
    });

    // 2. Execute commands using shared executor
    const { results, overallSuccess } = await executeCommands(
      session.data.commands,
      logger,
      {
        sessionId,
        context: 'operation',
        logMetadata: { intent: session.data.intent }
      }
    );

    // Convert CommandExecutionResult to ExecutionResult
    const executionResults: ExecutionResult[] = results.map(r => ({
      command: r.command,
      success: r.success,
      output: r.output,
      error: r.error,
      timestamp: r.timestamp
    }));

    // 3. Run validation via remediate tool (only if commands succeeded)
    let validationSummary = 'Validation skipped due to command failures.';

    if (overallSuccess && session.data.validationIntent) {
      logger.info('Running post-execution validation via remediate', {
        sessionId,
        validationIntent: session.data.validationIntent
      });

      try {
        // Call remediate tool internally with validation intent
        const validationResponse = await handleRemediateTool({
          issue: session.data.validationIntent,
          executedCommands: session.data.commands,
          interaction_id: session.data.interaction_id
        });

        // Extract validation result from remediate response
        const validationData = JSON.parse(validationResponse.content[0].text);

        if (validationData.status === 'resolved' || validationData.status === 'no_issue_found') {
          validationSummary = `Validation successful: ${validationData.message || 'Operations completed as expected.'}`;
        } else {
          validationSummary = `Validation completed with confidence ${Math.round((validationData.analysis?.confidence || 0) * 100)}%: ${validationData.analysis?.rootCause || 'See validation details'}`;
        }

        logger.info('Validation completed', { sessionId, validationSummary });

      } catch (error) {
        logger.error('Validation failed', error as Error, { sessionId });
        validationSummary = `Validation encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Manual verification recommended.`;
      }
    }

    // 4. Update session with execution results
    const finalStatus = overallSuccess ? 'executed_successfully' : 'executed_with_errors';
    sessionManager.updateSession(sessionId, {
      status: finalStatus,
      executionResults
    });

    logger.info('Execution completed', {
      sessionId,
      finalStatus,
      successCount: executionResults.filter(r => r.success).length,
      failureCount: executionResults.filter(r => !r.success).length
    });

    // 5. Return execution results with validation
    return {
      status: overallSuccess ? 'success' : 'failed',
      sessionId,
      execution: {
        results: executionResults,
        validation: validationSummary
      },
      message: overallSuccess
        ? `All ${executionResults.length} command(s) executed successfully. ${validationSummary}`
        : `${executionResults.filter(r => !r.success).length} of ${executionResults.length} command(s) failed. See execution results for details.`
    };

  } catch (error) {
    logger.error('Execution failed', error as Error, { sessionId });

    // Mark session as failed if we can
    try {
      sessionManager.updateSession(sessionId, { status: 'failed' });
    } catch (updateError) {
      // Ignore - session might not exist
    }

    throw ErrorHandler.createError(
      ErrorCategory.OPERATION,
      ErrorSeverity.HIGH,
      `Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        operation: 'execute_operations',
        component: 'OperateExecutionTool',
        sessionId
      }
    );
  }
}
