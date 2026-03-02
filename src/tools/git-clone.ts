/**
 * Git Clone Tool - Clone a git repository with authentication
 *
 * PRD #362: Git Operations for Recommend Tool
 * Supports PAT and GitHub App authentication
 */

import { z } from 'zod';
import { ErrorHandler, Logger } from '../core/error-handling';
import { getGitOperations } from '../core/git-utils';

export const GIT_CLONE_TOOL_NAME = 'git_clone';
export const GIT_CLONE_TOOL_DESCRIPTION =
  'Clone a git repository with PAT or GitHub App authentication';

export const GIT_CLONE_TOOL_INPUT_SCHEMA = {
  repoUrl: z
    .string()
    .url()
    .describe('Repository URL (HTTPS, e.g., https://github.com/org/repo.git)'),
  branch: z
    .string()
    .optional()
    .describe('Branch to clone (default: repository default branch)'),
  targetDir: z
    .string()
    .optional()
    .describe('Local directory to clone into (default: temp directory)'),
  depth: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe(
      'Create a shallow clone with specified depth (default: full clone)'
    ),
};

export interface GitCloneInput {
  repoUrl: string;
  branch?: string;
  targetDir?: string;
  depth?: number;
}

export interface GitCloneOutput {
  success: boolean;
  localPath: string;
  branch: string;
  error?: string;
}

/**
 * Direct MCP tool handler for git_clone functionality
 */
export async function handleGitCloneTool(
  args: GitCloneInput,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.info('Handling git_clone request', {
        requestId,
        repoUrl: args.repoUrl.replace(/\/\/.*@/, '//***@'),
        branch: args.branch,
        targetDir: args.targetDir,
      });

      const gitOps = getGitOperations();

      const result = await gitOps.clone({
        repoUrl: args.repoUrl,
        branch: args.branch,
        targetDir: args.targetDir,
        depth: args.depth,
      });

      logger.info('Git clone completed', {
        requestId,
        success: result.success,
        localPath: result.localPath,
        branch: result.branch,
      });

      const output: GitCloneOutput = {
        success: result.success,
        localPath: result.localPath,
        branch: result.branch,
        error: result.error,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
      };
    },
    {
      operation: 'git_clone',
      component: 'GitCloneTool',
      requestId,
      input: { repoUrl: args.repoUrl, branch: args.branch },
    }
  );
}
