/**
 * Push to Git Tool - Push generated manifests to a Git repository
 *
 * PRD #395: Git Push Recommend Integration
 *
 * This stage allows users to push generated manifests directly to a Git
 * repository, enabling GitOps workflows with Argo CD, Flux, etc.
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ErrorHandler,
  ErrorCategory,
  ErrorSeverity,
} from '../core/error-handling';
import { DotAI, buildAgentDisplayBlock } from '../core/index';
import { Logger } from '../core/error-handling';
import { GenericSessionManager } from '../core/generic-session-manager';
import type { SolutionData } from './recommend';
import {
  cloneRepo,
  pushRepo,
  getGitAuthConfigFromEnv,
  scrubCredentials,
} from '../core/git-utils';
import { getVisualizationUrl } from '../core/visualization';

export const PUSHTOGIT_TOOL_NAME = 'pushToGit';
export const PUSHTOGIT_TOOL_DESCRIPTION =
  'Push generated manifests to a Git repository for GitOps workflows (Argo CD, Flux). Use after generateManifests stage.';

export const PUSHTOGIT_TOOL_INPUT_SCHEMA = {
  solutionId: z
    .string()
    .regex(/^sol-\d+-[a-f0-9]{8}$/)
    .describe('The solution ID to push manifests for'),
  repoUrl: z.string().url().describe('Git repository URL (HTTPS)'),
  targetPath: z
    .string()
    .describe('Path within repository where manifests will be stored (e.g., "apps/postgresql/")'),
  branch: z.string().optional().describe('Git branch (default: main)'),
  commitMessage: z
    .string()
    .optional()
    .describe('Commit message (default: "Add {resource} deployment")'),
  authorName: z.string().optional().describe('Git author name'),
  authorEmail: z.string().optional().describe('Git author email'),
  interaction_id: z
    .string()
    .optional()
    .describe('INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.'),
};

interface PushToGitArgs {
  solutionId: string;
  repoUrl: string;
  targetPath: string;
  branch?: string;
  commitMessage?: string;
  authorName?: string;
  authorEmail?: string;
  interaction_id?: string;
}

export async function handlePushToGitTool(
  args: PushToGitArgs,
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.info('Handling pushToGit request', {
        requestId,
        solutionId: args.solutionId,
        repoUrl: scrubCredentials(args.repoUrl),
        targetPath: args.targetPath,
        branch: args.branch,
      });

      const sessionManager = new GenericSessionManager<SolutionData>('sol');

      const session = sessionManager.getSession(args.solutionId);
      if (!session) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Solution not found: ${args.solutionId}`,
          {
            operation: 'push_to_git',
            component: 'PushToGitTool',
            requestId,
            input: { solutionId: args.solutionId },
            suggestedActions: [
              'Verify the solution ID is correct',
              'Ensure generateManifests stage was completed first',
              'Check that the session has not expired',
            ],
          }
        );
      }

      const solution = session.data;

      if (!solution.generatedManifests) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'No manifests found. Run generateManifests stage first.',
          {
            operation: 'push_to_git',
            component: 'PushToGitTool',
            requestId,
            input: { solutionId: args.solutionId },
            suggestedActions: [
              'Call recommend tool with stage: generateManifests first',
              'Ensure the solution was fully configured',
            ],
          }
        );
      }

      const authConfig = getGitAuthConfigFromEnv();
      if (!authConfig.pat && !authConfig.githubApp) {
        throw ErrorHandler.createError(
          ErrorCategory.CONFIGURATION,
          ErrorSeverity.HIGH,
          'No Git authentication configured. Set DOT_AI_GIT_TOKEN or configure GitHub App.',
          {
            operation: 'push_to_git',
            component: 'PushToGitTool',
            requestId,
            input: { repoUrl: scrubCredentials(args.repoUrl) },
            suggestedActions: [
              'Set DOT_AI_GIT_TOKEN environment variable with a valid PAT',
              'Or configure GitHub App authentication (GITHUB_APP_ENABLED, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY)',
            ],
          }
        );
      }

      const branch = args.branch || 'main';
      const defaultCommitMessage = `Add ${solution.intent || 'deployment'} manifests`;
      const commitMessage = args.commitMessage || defaultCommitMessage;

      const rawTargetPath = args.targetPath.trim();
      if (
        rawTargetPath === '' ||
        rawTargetPath.startsWith('/') ||
        rawTargetPath.startsWith('~') ||
        rawTargetPath.includes('\\') ||
        rawTargetPath.includes('..')
      ) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'Invalid target path: use a relative repository path without "/", "~", "\\", or ".."',
          {
            operation: 'push_to_git',
            component: 'PushToGitTool',
            requestId,
            input: { targetPath: args.targetPath },
            suggestedActions: [
              'Use a relative repository path such as "apps/postgresql"',
            ],
          }
        );
      }

      const targetPath = rawTargetPath.replace(/\/+$/, '');

      const tmpDir = path.join(os.tmpdir(), `dot-ai-git-${args.solutionId}`);
      logger.info('Cloning repository', {
        repoUrl: scrubCredentials(args.repoUrl),
        branch,
        tmpDir,
      });

      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });

        try {
          await cloneRepo(args.repoUrl, tmpDir, { branch, depth: 1 });
        } catch (cloneError) {
          const errorMessage =
            cloneError instanceof Error ? cloneError.message : String(cloneError);
          logger.error('Failed to clone repository', cloneError as Error, {
            repoUrl: scrubCredentials(args.repoUrl),
            branch,
          });

          throw ErrorHandler.createError(
            ErrorCategory.NETWORK,
            ErrorSeverity.HIGH,
            `Failed to clone repository: ${errorMessage}`,
            {
              operation: 'push_to_git',
              component: 'PushToGitTool',
              requestId,
              input: { repoUrl: scrubCredentials(args.repoUrl), branch },
              suggestedActions: [
                'Verify the repository URL is correct',
                'Check that the branch exists',
                'Ensure your token has read access to the repository',
              ],
            }
          );
        }

        const files: Array<{ path: string; content: string }> = [];

        if (solution.generatedManifests.type === 'helm') {
          if (solution.generatedManifests.valuesYaml) {
            files.push({
              path: path.posix.join(targetPath, 'values.yaml'),
              content: solution.generatedManifests.valuesYaml,
            });
          }
        } else {
          const manifestFiles = solution.generatedManifests.files;
          if (manifestFiles && manifestFiles.length > 0) {
            for (const file of manifestFiles) {
              files.push({
                path: path.posix.join(targetPath, file.relativePath),
                content: file.content,
              });
            }
          }
        }

        logger.info('Pushing files to repository', {
          fileCount: files.length,
          targetPath,
          branch,
        });

        const filesPreview = files.map(f => ({
          path: f.path,
          size: f.content.length,
          lines: f.content.split('\n').length,
        }));

        let pushResult;
        try {
          pushResult = await pushRepo(tmpDir, files, commitMessage, {
            branch,
            author: args.authorName
              ? { name: args.authorName, email: args.authorEmail || '' }
              : undefined,
          });
        } catch (pushError) {
          const errorMessage =
            pushError instanceof Error ? pushError.message : String(pushError);
          logger.error('Failed to push to repository', pushError as Error, {
            repoUrl: scrubCredentials(args.repoUrl),
            branch,
            targetPath,
          });

          throw ErrorHandler.createError(
            ErrorCategory.NETWORK,
            ErrorSeverity.HIGH,
            `Failed to push to repository: ${errorMessage}`,
            {
              operation: 'push_to_git',
              component: 'PushToGitTool',
              requestId,
              input: {
                repoUrl: scrubCredentials(args.repoUrl),
                branch,
                targetPath,
              },
              suggestedActions: [
                'Ensure your token has write access to the repository',
                'Check for merge conflicts (pull latest changes first)',
                'Verify the branch exists or can be created',
              ],
            }
          );
        }

        sessionManager.updateSession(args.solutionId, {
          stage: 'pushed',
          gitPush: {
            repoUrl: args.repoUrl,
            path: targetPath,
            branch: pushResult.branch,
            commitSha: pushResult.commitSha,
            pushedAt: new Date().toISOString(),
          },
        });

        const visualizationUrl = getVisualizationUrl(args.solutionId);

        const response = {
          success: true,
          status: 'manifests_pushed',
          solutionId: args.solutionId,
          gitPush: {
            repoUrl: scrubCredentials(args.repoUrl),
            path: targetPath,
            branch: pushResult.branch,
            commitSha: pushResult.commitSha,
            filesPushed: pushResult.filesAdded,
            pushedAt: new Date().toISOString(),
          },
          filesPreview,
          gitopsMessage: `Manifests pushed successfully. Your GitOps controller (Argo CD/Flux) will sync these changes automatically.`,
          timestamp: new Date().toISOString(),
          ...(visualizationUrl ? { visualizationUrl } : {}),
        };

        logger.info('Push to Git completed successfully', {
          solutionId: args.solutionId,
          commitSha: pushResult.commitSha,
          branch: pushResult.branch,
        });

        const content: Array<{ type: 'text'; text: string }> = [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ];

        const agentDisplayBlock = buildAgentDisplayBlock({ visualizationUrl });
        if (agentDisplayBlock) {
          content.push(agentDisplayBlock);
        }

        return { content };
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (cleanupError) {
          logger.warn('Failed to cleanup temporary git directory', {
            tmpDir,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          });
        }
      }
    },
    {
      operation: 'push_to_git',
      component: 'PushToGitTool',
      requestId,
      input: args,
    }
  );
}
