/**
 * Git Push Tool - Push files to a git repository
 *
 * PRD #362: Git Operations for Recommend Tool
 * Supports PAT and GitHub App authentication
 */

import {
  KubectlTool,
  successResult,
  errorResult,
  requireParam,
  optionalParam,
  withValidation,
} from './base';
import { getGitOperations } from '../../../src/core/git-utils';

export const gitPush: KubectlTool = {
  definition: {
    name: 'git_push',
    type: 'agentic',
    description: 'Push files to a git repository with commit',
    inputSchema: {
      type: 'object',
      properties: {
        repoPath: {
          type: 'string',
          description: 'Local path to the git repository',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
          description: 'Files to add and commit',
        },
        commitMessage: {
          type: 'string',
          description: 'Commit message',
        },
        branch: {
          type: 'string',
          description: 'Branch to push to (default: current branch)',
        },
        author: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
          },
          description: 'Commit author (default: git config)',
        },
      },
      required: ['repoPath', 'files', 'commitMessage'],
    },
  },

  handler: withValidation(async args => {
    const repoPath = requireParam<string>(args, 'repoPath', 'git_push');
    const files = requireParam<Array<{ path: string; content: string }>>(
      args,
      'files',
      'git_push'
    );
    const commitMessage = requireParam<string>(
      args,
      'commitMessage',
      'git_push'
    );
    const branch = optionalParam<string>(args, 'branch', undefined);
    const author = optionalParam<{ name: string; email: string }>(
      args,
      'author',
      undefined
    );

    try {
      const gitOps = getGitOperations();

      const result = await gitOps.push({
        repoPath,
        files,
        commitMessage,
        branch,
        author,
      });

      if (result.success) {
        return successResult(
          JSON.stringify(
            {
              success: true,
              commitSha: result.commitSha,
              branch: result.branch,
              filesAdded: result.filesAdded,
            },
            null,
            2
          ),
          `Files pushed successfully to ${result.branch}`
        );
      } else {
        return errorResult(result.error || 'Push failed', 'Git push failed');
      }
    } catch (error: any) {
      const message = error.message || 'Unknown error during git push';
      return errorResult(message, 'Git push failed');
    }
  }),
};
