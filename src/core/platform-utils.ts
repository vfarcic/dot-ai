/**
 * Platform Utilities
 *
 * Shared utility functions for platform operations and tools.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

export const execAsync = promisify(exec);

/**
 * Get the scripts directory path, works in both development and installed npm package
 */
export function getScriptsDir(): string {
    // In CommonJS (after TypeScript compilation), __dirname is available
    // Go up from dist/core/ to project root, then into scripts/
    return path.join(__dirname, '..', '..', 'scripts');
}

/**
 * Strip markdown code blocks from AI response
 */
export function stripMarkdownCodeBlocks(content: string): string {
  let jsonContent = content.trim();
  if (jsonContent.startsWith('```json')) {
    jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return jsonContent;
}
