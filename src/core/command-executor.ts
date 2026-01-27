/**
 * Shared Command Executor
 *
 * Provides common command execution logic for tools (remediate, operate, etc.)
 * Uses continue-on-error pattern: executes all commands sequentially regardless
 * of individual failures.
 *
 * PRD #343: Commands are executed through the plugin system via shell_exec tool.
 * The plugin container has RBAC permissions; the MCP server does not.
 */

import { Logger } from './error-handling';
import { PluginManager } from './plugin-manager';

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
 * PRD #343: Commands are executed through the plugin's shell_exec tool.
 * The plugin container has RBAC; commands are executed exactly as provided
 * (no parsing or transformation).
 *
 * @param commands - Array of command strings to execute
 * @param logger - Logger instance for tracking execution
 * @param pluginManager - Plugin manager for executing commands via plugin
 * @param options - Optional execution context and metadata
 * @returns Array of execution results and overall success status
 */
export async function executeCommands(
  commands: string[],
  logger: Logger,
  pluginManager: PluginManager,
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

      // PRD #343: Execute command via plugin's shell_exec tool
      const response = await pluginManager.invokeTool('shell_exec', { command: cleanCommand });

      if (response.success) {
        // Check for nested error - plugin wraps command errors in { success: false, error: "..." }
        if (typeof response.result === 'object' && response.result !== null) {
          const result = response.result as any;
          if (result.success === false) {
            throw new Error(result.error || result.message || 'Command execution failed');
          }
        }

        // Extract only the data field - never pass JSON wrapper
        let output: string;
        if (typeof response.result === 'object' && response.result !== null) {
          const result = response.result as any;
          if (result.data !== undefined) {
            output = String(result.data);
          } else if (typeof result === 'string') {
            output = result;
          } else {
            throw new Error('Plugin returned unexpected response format - missing data field');
          }
        } else {
          output = String(response.result || '');
        }

        results.push({
          command,
          success: true,
          output: output,
          timestamp: new Date()
        });

        logger.info(`Command ${commandNum} succeeded`, {
          ...logMetadata,
          sessionId
        });
      } else {
        const errorMessage = response.error?.message || 'Command execution failed';
        overallSuccess = false;

        results.push({
          command,
          success: false,
          error: errorMessage,
          timestamp: new Date()
        });

        logger.error(`Command ${commandNum} failed`, new Error(errorMessage), {
          ...logMetadata,
          sessionId,
          command
        });
      }

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
