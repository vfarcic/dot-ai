/**
 * Shared Command Executor
 *
 * Provides common command execution logic for tools (remediate, operate, etc.)
 * Uses continue-on-error pattern: executes all commands sequentially regardless
 * of individual failures.
 */

import { Logger } from './error-handling';

/**
 * Execution result for a single command
 */
export interface CommandExecutionResult {
  command: string;
  success: boolean;
  output?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Options for command execution
 */
export interface CommandExecutionOptions {
  sessionId?: string;
  context?: string; // e.g., 'remediation', 'operation'
  logMetadata?: Record<string, any>;
}

/**
 * Execute a list of commands sequentially with continue-on-error pattern
 *
 * @param commands - Array of command strings to execute
 * @param logger - Logger instance for tracking execution
 * @param options - Optional execution context and metadata
 * @returns Array of execution results and overall success status
 */
export async function executeCommands(
  commands: string[],
  logger: Logger,
  options: CommandExecutionOptions = {}
): Promise<{ results: CommandExecutionResult[]; overallSuccess: boolean }> {
  const results: CommandExecutionResult[] = [];
  let overallSuccess = true;

  const { sessionId, context = 'command execution', logMetadata = {} } = options;

  logger.info(`Starting ${context}`, {
    ...logMetadata,
    sessionId,
    commandCount: commands.length
  });

  // Execute each command sequentially
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    const commandNum = i + 1;

    try {
      logger.info(`Executing command ${commandNum}/${commands.length}`, {
        ...logMetadata,
        sessionId,
        command
      });

      // Clean up escape sequences that AI models sometimes add
      const cleanCommand = command.replace(/\\"/g, '"');

      // Execute command using shared utility
      const { execAsync } = await import('./platform-utils.js');
      const { stdout } = await execAsync(cleanCommand);

      results.push({
        command,
        success: true,
        output: stdout?.trim() || '',
        timestamp: new Date()
      });

      logger.info(`Command ${commandNum} succeeded`, {
        ...logMetadata,
        sessionId
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      overallSuccess = false;

      results.push({
        command,
        success: false,
        error: errorMessage,
        timestamp: new Date()
      });

      logger.error(`Command ${commandNum} failed`, error as Error, {
        ...logMetadata,
        sessionId,
        command
      });

      // Continue to next command (continue-on-error pattern)
    }
  }

  logger.info(`${context} completed`, {
    ...logMetadata,
    sessionId,
    successCount: results.filter(r => r.success).length,
    failureCount: results.filter(r => !r.success).length
  });

  return { results, overallSuccess };
}
