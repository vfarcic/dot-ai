/**
 * Git Clone Tool - Clone a git repository with authentication
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

export const gitClone: KubectlTool = {
  definition: {
    name: 'git_clone',
    type: 'agentic',
    description: 'Clone a git repository with PAT or GitHub App authentication',
    inputSchema: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description:
            'Repository URL (HTTPS, e.g., https://github.com/org/repo.git)',
        },
        branch: {
          type: 'string',
          description: 'Branch to clone (default: repository default branch)',
        },
        targetDir: {
          type: 'string',
          description:
            'Local directory to clone into (default: temp directory)',
        },
        depth: {
          type: 'number',
          description:
            'Create a shallow clone with specified depth (default: full clone)',
        },
      },
      required: ['repoUrl'],
    },
  },

  handler: withValidation(async args => {
    const repoUrl = requireParam<string>(args, 'repoUrl', 'git_clone');
    const branch = optionalParam<string>(args, 'branch', undefined);
    const targetDir = optionalParam<string>(args, 'targetDir', undefined);
    const depth = optionalParam<number>(args, 'depth', undefined);

    try {
      const gitOps = getGitOperations();

      const result = await gitOps.clone({
        repoUrl,
        branch,
        targetDir,
        depth,
      });

      if (result.success) {
        return successResult(
          JSON.stringify(
            {
              success: true,
              localPath: result.localPath,
              branch: result.branch,
            },
            null,
            2
          ),
          `Repository cloned successfully to ${result.localPath}`
        );
      } else {
        return errorResult(result.error || 'Clone failed', 'Git clone failed');
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error during git clone';
      return errorResult(message, 'Git clone failed');
    }
  }),
};
