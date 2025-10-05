/**
 * Discover Operations Tool
 *
 * Self-contained tool that fetches raw Nu shell script help output.
 * Returns unprocessed data for AI to parse.
 */

import * as path from 'path';
import { AITool, AIProvider } from '../../core/ai-provider.interface';
import { Logger } from '../../core/error-handling';
import { execAsync, getScriptsDir } from '../../core/platform-utils';

/**
 * Operation interfaces (re-export for tool consumers)
 */
export interface OperationCommand {
  name: string;
  command: string[];
}

export interface Operation {
  name: string;
  description: string;
  operations: OperationCommand[];
}

/**
 * Tool schema for getting Nu script help output
 */
export const discoverOperationsTool: AITool = {
  name: "get_nu_help_output",
  description: `Executes 'nu ./dot.nu --help' and returns the raw help output text.

  Returns the complete help documentation that lists all available platform
  operations with their commands and descriptions.`,
  inputSchema: {
    type: "object",
    properties: {} // No input needed
  }
};

/**
 * Execute get_nu_help_output tool
 *
 * Simple data fetcher - returns raw Nu script help output
 */
export async function executeDiscoverOperations(
  input: any,
  aiProvider: AIProvider,
  logger: Logger
): Promise<{ success: boolean; helpOutput?: string; error?: string }> {
  try {
    // Execute Nu script help command
    const scriptPath = path.join(getScriptsDir(), 'dot.nu');
    const { stdout, stderr } = await execAsync(`nu ${scriptPath} --help`);

    if (stderr) {
      logger.warn?.('Nu script help command produced stderr', { stderr });
    }

    logger.info?.('Tool fetched Nu help output', {
      length: stdout.length
    });

    return {
      success: true,
      helpOutput: stdout
    };
  } catch (error) {
    logger.error?.('Tool failed to get Nu help output', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
