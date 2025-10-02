/**
 * Platform Operations Discovery
 *
 * Discovers available Nu shell script operations and maps user intent to operations
 * using AI-powered parsing and matching.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ClaudeIntegration } from './claude';
import { Logger } from './error-handling';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface Operation {
  name: string;
  description: string;
  operations: string[];
}

/**
 * Discover available operations from Nu shell scripts using AI parsing
 */
export async function discoverOperations(
  claudeIntegration: ClaudeIntegration,
  logger: Logger
): Promise<Operation[]> {
  try {
    // Execute Nu script help command
    const scriptPath = path.join(process.cwd(), 'scripts', 'dot.nu');
    const { stdout, stderr } = await execAsync(`nu ${scriptPath} --help`);

    if (stderr) {
      logger.warn?.('Nu script help command produced stderr', { stderr });
    }

    // Load AI prompt template for parsing help output
    const promptPath = path.join(process.cwd(), 'prompts', 'parse-script-operations.md');
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');

    // Replace template variable with actual help output
    const prompt = promptTemplate.replace('{helpOutput}', stdout);

    // Send to Claude for AI-powered parsing
    const response = await claudeIntegration.sendMessage(prompt);

    // Parse JSON response from AI
    const operations = JSON.parse(response.content);

    logger.info?.('Discovered operations from Nu scripts', {
      count: operations.length
    });

    return operations;
  } catch (error) {
    logger.error?.('Failed to discover operations', error as Error);
    throw error;
  }
}
