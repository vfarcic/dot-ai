/**
 * Git Push Tool - Push files to a git repository
 *
 * PRD #362: Git Operations for Recommend Tool
 * Supports PAT and GitHub App authentication
 */

import { z } from 'zod';
import { ErrorHandler, Logger } from '../core/error-handling';
import { getGitOperations } from '../core/git-utils';

export const GIT_PUSH_TOOL_NAME = 'git_push';
export const GIT_PUSH_TOOL_DESCRIPTION =
  'Push files to a git repository with commit';

export const GIT_PUSH_TOOL_INPUT_SCHEMA = {
  repoPath: z.string().describe('Local repository path (from git_clone)'),
  files: z
    .array(
      z.object({
        path: z.string().describe('Relative path within repository'),
        content: z.string().describe('File content'),
      })
    )
    .min(1)
    .describe('Files to add and commit'),
  commitMessage: z.string().min(1).describe('Commit message'),
  branch: z
    .string()
    .optional()
    .describe('Branch to push to (default: current branch)'),
  author: z
    .object({
      name: z.string(),
      email: z.string().email(),
    })
    .optional()
    .describe('Commit author (default: git config)'),
};

export interface GitPushInput {
  repoPath: string;
  files: Array<{
    path: string;
    content: string;
  }>;
  commitMessage: string;
  branch?: string;
  author?: {
    name: string;
    email: string;
  };
}

export interface GitPushOutput {
  success: boolean;
  commitSha?: string;
  branch: string;
  filesAdded: string[];
  error?: string;
}

/**
 * Direct MCP tool handler for git_push functionality
 */
export async function handleGitPushTool(
  args: GitPushInput,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.info('Handling git_push request', {
        requestId,
        repoPath: args.repoPath,
        filesCount: args.files.length,
        branch: args.branch,
        commitMessage: args.commitMessage.substring(0, 50),
      });

      const gitOps = getGitOperations();

      const result = await gitOps.push({
        repoPath: args.repoPath,
        files: args.files,
        commitMessage: args.commitMessage,
        branch: args.branch,
        author: args.author,
      });

      logger.info('Git push completed', {
        requestId,
        success: result.success,
        commitSha: result.commitSha,
        branch: result.branch,
        filesCount: result.filesAdded.length,
      });

      const output: GitPushOutput = {
        success: result.success,
        commitSha: result.commitSha,
        branch: result.branch,
        filesAdded: result.filesAdded,
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
      operation: 'git_push',
      component: 'GitPushTool',
      requestId,
      input: {
        repoPath: args.repoPath,
        filesCount: args.files.length,
        branch: args.branch,
      },
    }
  );
}
