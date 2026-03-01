/**
 * Session directory utilities for MCP tools
 * Provides consistent session directory resolution and validation across all tools
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Get session directory from environment variable
 *
 * @returns Resolved session directory path (can be relative or absolute)
 */
export function getSessionDirectory(): string {
  const envSessionDir = process.env.DOT_AI_SESSION_DIR;
  if (!envSessionDir) {
    throw new Error(
      'Session directory must be specified via DOT_AI_SESSION_DIR environment variable'
    );
  }

  return envSessionDir;
}

/**
 * Validate session directory exists and is accessible
 * Works with both relative and absolute paths
 *
 * @param sessionDir - Session directory path to validate
 * @param requireWrite - Whether to test write permissions (default: false)
 */
export function validateSessionDirectory(
  sessionDir: string,
  requireWrite: boolean = false
): void {
  try {
    // Check if directory exists (resolves relative paths automatically)
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session directory does not exist: ${sessionDir}`);
    }

    // Check if it's actually a directory
    const stat = fs.statSync(sessionDir);
    if (!stat.isDirectory()) {
      throw new Error(
        `Session directory path is not a directory: ${sessionDir}`
      );
    }

    // Test read permissions by attempting to read directory contents
    fs.readdirSync(sessionDir);

    // Test write permissions if required
    if (requireWrite) {
      const testFile = path.join(sessionDir, '.write-test-' + Date.now());
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    }
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw specific error messages
      if (
        error.message.includes('Session directory does not exist') ||
        error.message.includes('Session directory path is not a directory')
      ) {
        throw error;
      }

      // Handle permission errors
      if (error.message.includes('EACCES')) {
        throw new Error(
          `Session directory is not accessible: ${sessionDir}. Check permissions.`,
          { cause: error }
        );
      }

      // Handle write permission errors
      if (requireWrite) {
        throw new Error(
          `Session directory is not writable: ${sessionDir}. Error: ${error.message}`,
          { cause: error }
        );
      }
    }

    throw new Error(
      `Session directory validation failed: ${sessionDir}. Error: ${error}`,
      { cause: error }
    );
  }
}

/**
 * Get and validate session directory in one call
 *
 * @param requireWrite - Whether to test write permissions (default: false)
 * @returns Validated session directory path
 */
export function getAndValidateSessionDirectory(
  requireWrite: boolean = false
): string {
  const sessionDir = getSessionDirectory();
  validateSessionDirectory(sessionDir, requireWrite);
  return sessionDir;
}
