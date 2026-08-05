/**
 * Push to Git Tool - Push generated manifests to a Git repository
 *
 * PRD #395: Git Push Recommend Integration
 * PRD #710: Pull request mode — the same stage can propose the change on a
 *           server-generated branch instead of writing the target branch.
 *
 * This stage allows users to push generated manifests to a Git repository,
 * enabling GitOps workflows with Argo CD, Flux, etc.
 */

import * as fs from 'fs';
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
  createPullRequest,
  lookupPullRequest,
  getGitAuthConfigFromEnv,
  getGitopsClonesDir,
  scrubCredentials,
  sanitizeRelativePath,
  isRepoHostAllowed,
  describeDisallowedRepoHost,
} from '../core/git-utils';
import type { PullRequestSnapshot, PushResult } from '../core/git-utils';
import { getVisualizationUrl } from '../core/visualization';
import { getCurrentIdentity } from '../interfaces/request-context';
import type { UserIdentity } from '../interfaces/oauth/types';

/**
 * The format GenericSessionManager mints solution IDs in
 * (`sol-<timestamp>-<8 hex>`), enforced here rather than only in a Zod schema.
 *
 * This is a security control, not tidiness (PRD #710 M2). `solutionId` names the
 * clone directory below, and that directory is removed with
 * `fs.rmSync(…, { recursive: true, force: true })` in the `finally`. The name
 * used to end in a `randomUUID()`, whose unpredictability meant an escaped path
 * could be created but never collided with anything pre-existing; PRD #710 drops
 * the suffix for the `./tmp/gitops-clones/<solutionId>/` convention, so the
 * format check is what stands between a client-supplied id and recursive
 * deletion of an attacker-chosen directory.
 *
 * It lives HERE, not in RECOMMEND_TOOL_INPUT_SCHEMA, because the Zod schema only
 * guards the MCP path: the REST API hands the request body to the tool handler
 * unvalidated (rest-api.ts handleToolExecution), and `getSession` is no gate
 * either — it does a bare `path.join(sessionsPath, id + '.json')`, so an id like
 * `x/../../sol-sessions/<real-id>` resolves back to a genuine session file and
 * passes. A check in the handler covers both interfaces.
 */
export const SOLUTION_ID_PATTERN = /^sol-\d+-[a-f0-9]{8}$/;

/** Identifies this feature in GitHub's API logs, alongside dot-ai-remediate. */
const PR_USER_AGENT = 'dot-ai-pushtogit';

/** Fallback commit email when an identity has no email address of its own. */
const NOREPLY_EMAIL = 'dot-ai@users.noreply.github.com';

interface PushToGitArgs {
  solutionId: string;
  repoUrl: string;
  targetPath: string;
  /**
   * Direct push: the branch to commit to. PR mode: the BASE branch the pull
   * request targets (PRD #710 decision 1). There is deliberately no head-branch
   * parameter — see buildPrHeadBranch.
   */
  branch?: string;
  /** PRD #710: open a pull request instead of writing `branch` directly. */
  pullRequest?: boolean;
  commitMessage?: string;
  authorName?: string;
  authorEmail?: string;
  interaction_id?: string;
}

/** Discriminates what PR mode did, mirroring createPullRequest's own `status`. */
type PullRequestOutcome = {
  status: 'created' | 'updated' | 'no_changes' | 'pushed_without_pr';
  url?: string;
  number?: number;
  branch: string;
  baseBranch: string;
  filesChanged: string[];
  /** Only for `pushed_without_pr`: why no pull request was opened. */
  error?: string;
};

/**
 * Head branch for PR mode: `dot-ai/<solutionId>-<timestamp>` (PRD #710 decision
 * 2).
 *
 * Server-generated, and that is the point rather than a convenience — success
 * criterion 2 requires that no client-supplied parameter can influence it, so
 * there is no head-branch argument to honour and an invented one is ignored.
 * Both components are machine-generated: the solution id is format-checked
 * against SOLUTION_ID_PATTERN (asserted here too, so the guarantee is local to
 * the function that builds the ref) and the timestamp is a number, so the result
 * is always a valid git ref with no user text to sanitize.
 */
export function buildPrHeadBranch(
  solutionId: string,
  timestamp: number = Date.now()
): string {
  if (!SOLUTION_ID_PATTERN.test(solutionId)) {
    throw new Error(
      `Cannot build a pull request branch from an invalid solution ID: ${solutionId}`
    );
  }
  return `dot-ai/${solutionId}-${timestamp}`;
}

/**
 * Commit author for both modes (PRD #710 decision 8).
 *
 * An authenticated OAuth identity IS the author and client-supplied
 * `authorName`/`authorEmail` do not override it: in PR mode the commit author
 * and PR body are a reviewer's only answer to "who asked for this", so letting
 * a caller attribute the commit to anyone would undermine the feature. Direct
 * push gets the same treatment — there was never a reason for it to be
 * spoofable.
 *
 * With no OAuth identity (a static-token caller, or auth disabled) there is no
 * identity to defend and the client-supplied author is honoured, exactly as
 * before PRD #710.
 */
export function resolveCommitAuthor(
  identity: UserIdentity | undefined,
  args: { authorName?: string; authorEmail?: string }
): { name: string; email: string } | undefined {
  if (identity?.source === 'oauth') {
    return {
      name: identity.email || identity.userId,
      email: identity.email || NOREPLY_EMAIL,
    };
  }
  if (args.authorName) {
    return {
      name: args.authorName,
      email: args.authorEmail || NOREPLY_EMAIL,
    };
  }
  return undefined;
}

/**
 * Pull request body (PRD #710 decision 8): it answers who asked for this change
 * and what it is meant to do, because a reviewer looking at generated manifests
 * has no other way to find out. The requester is the authenticated identity, so
 * a spoofed `authorEmail` never appears here either.
 */
export function buildPullRequestBody(input: {
  solutionId: string;
  intent?: string;
  targetPath: string;
  baseBranch: string;
  requestedBy: string;
}): string {
  return [
    'Manifests generated by dot-ai from a `recommend` solution. Review and merge to let your GitOps controller (Argo CD/Flux) apply them.',
    '',
    `- **Requested by:** ${input.requestedBy}`,
    `- **Intent:** ${input.intent || '(not recorded)'}`,
    `- **Solution ID:** ${input.solutionId}`,
    `- **Target path:** \`${input.targetPath}\``,
    `- **Base branch:** \`${input.baseBranch}\``,
    '',
    'No changes were made to the base branch and nothing was applied to the cluster.',
  ].join('\n');
}

export async function handlePushToGitTool(
  args: PushToGitArgs,
  dotAI: DotAI,
  logger: Logger,
  requestId: string,
  sessionManager?: GenericSessionManager<SolutionData>
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      const prMode = args.pullRequest === true;

      logger.info('Handling pushToGit request', {
        requestId,
        solutionId: args.solutionId,
        repoUrl: scrubCredentials(args.repoUrl),
        targetPath: args.targetPath,
        branch: args.branch,
        pullRequest: prMode,
      });

      // Before the session lookup and before the id names any directory.
      if (!SOLUTION_ID_PATTERN.test(args.solutionId)) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'Invalid solution ID: expected the format sol-<timestamp>-<8 hex characters>',
          {
            operation: 'push_to_git',
            component: 'PushToGitTool',
            requestId,
            input: { solutionId: args.solutionId },
            suggestedActions: [
              'Use the solutionId returned by the recommend stage verbatim',
            ],
          }
        );
      }

      const sm =
        sessionManager || new GenericSessionManager<SolutionData>('sol');

      const session = sm.getSession(args.solutionId);
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

      if (solution.generatedManifests.type === 'helm') {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'GitOps push for Helm charts is not yet supported. Use the deployManifests stage to install directly, or wait for a future release with Argo CD Application / Flux HelmRelease support.',
          {
            operation: 'push_to_git',
            component: 'PushToGitTool',
            requestId,
            input: { solutionId: args.solutionId },
            suggestedActions: [
              'Use deployManifests stage to install Helm chart directly',
              'Wait for future release with GitOps Helm support (Argo CD Application / Flux HelmRelease)',
            ],
          }
        );
      }

      // ── Repository host allowlist ──
      // BEFORE any credential is minted or attached, and before the pull request
      // lookup: getAuthenticatedUrl embeds the SERVER's token into whatever URL
      // it is given, so a client naming `https://attacker.example/x.git` would
      // otherwise have DOT_AI_GIT_TOKEN (or a GitHub App installation token)
      // delivered to a host they control — and left behind in that clone's
      // .git/config. Rejecting here covers every downstream use of this URL,
      // which all derive from it: the clone, the push (whose `origin` is this URL
      // as recorded by that clone), createPullRequest, and lookupPullRequest.
      if (!isRepoHostAllowed(args.repoUrl)) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          describeDisallowedRepoHost(args.repoUrl),
          {
            operation: 'push_to_git',
            component: 'PushToGitTool',
            requestId,
            input: { repoUrl: scrubCredentials(args.repoUrl) },
            suggestedActions: [
              'Push to a repository on an allowed host',
              'Ask your platform operator to add the host to the gitops.allowedRepoHosts Helm value',
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

      // Direct push: the branch that gets written. PR mode: the base branch the
      // pull request targets, which is never written (decision 1).
      const targetBranch = args.branch || 'main';
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

      const identity = getCurrentIdentity();
      const author = resolveCommitAuthor(identity, args);
      const requestedBy =
        identity?.source === 'oauth'
          ? identity.email || identity.userId
          : 'a client authenticated with the server token (no user identity)';

      // ── Re-run reuse (decision 9) ──
      // A second PR-mode push for the same solution must update the pull request
      // that is already open rather than open a second one proposing the same
      // change. The session records the head branch and PR number; GitHub decides
      // whether that PR is still reusable.
      let reusablePr: PullRequestSnapshot | undefined;
      const recordedPush = solution.gitPush;
      const recordedPr = recordedPush?.pullRequest;
      if (
        prMode &&
        recordedPr?.number &&
        recordedPr.branch &&
        // Only for the SAME repository: a branch recorded against another remote
        // says nothing about this one. Session URLs are stored scrubbed.
        recordedPush?.repoUrl === scrubCredentials(args.repoUrl)
      ) {
        const lookup = await lookupPullRequest(
          args.repoUrl,
          recordedPr.number,
          { userAgent: PR_USER_AGENT }
        );

        if (lookup.status === 'unknown') {
          // Treating "GitHub did not answer" as "not open" would open a
          // duplicate pull request every time the API has a bad minute, which is
          // exactly what decision 9 exists to prevent.
          throw ErrorHandler.createError(
            ErrorCategory.NETWORK,
            ErrorSeverity.HIGH,
            `Could not determine whether pull request #${recordedPr.number} is still open, so nothing was pushed: ${lookup.error}`,
            {
              operation: 'push_to_git',
              component: 'PushToGitTool',
              requestId,
              input: {
                repoUrl: scrubCredentials(args.repoUrl),
                pullRequest: recordedPr.number,
              },
              suggestedActions: [
                'Retry the push — this is usually transient',
                'Verify the token still has access to the repository',
              ],
            }
          );
        }

        if (
          lookup.status === 'found' &&
          lookup.pullRequest.state === 'open' &&
          !lookup.pullRequest.merged &&
          lookup.pullRequest.headBranch === recordedPr.branch
        ) {
          reusablePr = lookup.pullRequest;
        } else {
          logger.info(
            'Recorded pull request is no longer open — opening a new one',
            {
              requestId,
              solutionId: args.solutionId,
              pullRequest: recordedPr.number,
              lookupStatus: lookup.status,
            }
          );
        }
      }

      // The head branch exists only in PR mode. Reuse keeps the recorded one so
      // the open pull request updates in place.
      const headBranch = prMode
        ? (reusablePr?.headBranch ?? buildPrHeadBranch(args.solutionId))
        : undefined;
      // Reuse clones the head branch so the new commit lands on top of it; every
      // other case clones the base.
      const cloneBranch = reusablePr ? reusablePr.headBranch : targetBranch;
      const baseBranch = reusablePr?.baseBranch ?? targetBranch;

      // ./tmp/gitops-clones/<solutionId>/ — the project's tmp convention (PRD
      // #710 scope item 5). solutionId is format-checked above; the containment
      // check keeps that guarantee local to the line that builds the path, since
      // this directory is deleted recursively in the `finally`. Two concurrent
      // pushes for the SAME solution would share it and one would fail on a
      // half-removed clone — a client sequences its own stage calls, and the
      // failure is loud rather than silent.
      const clonesDir = getGitopsClonesDir();
      const tmpDir = path.resolve(clonesDir, args.solutionId);
      if (path.dirname(tmpDir) !== clonesDir) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'Invalid solution ID: it does not resolve to a directory inside the clones directory',
          {
            operation: 'push_to_git',
            component: 'PushToGitTool',
            requestId,
            input: { solutionId: args.solutionId },
            suggestedActions: [
              'Use the solutionId returned by the recommend stage verbatim',
            ],
          }
        );
      }

      logger.info('Cloning repository', {
        repoUrl: scrubCredentials(args.repoUrl),
        branch: cloneBranch,
        tmpDir,
      });

      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.mkdirSync(clonesDir, { recursive: true });

        try {
          await cloneRepo(args.repoUrl, tmpDir, {
            branch: cloneBranch,
            depth: 1,
          });
        } catch (cloneError) {
          // Scrubbed, not raw: git's stderr is text this server did not write,
          // and an authenticated remote URL can appear in it.
          const errorMessage = scrubCredentials(
            cloneError instanceof Error
              ? cloneError.message
              : String(cloneError)
          );
          logger.error('Failed to clone repository', new Error(errorMessage), {
            repoUrl: scrubCredentials(args.repoUrl),
            branch: cloneBranch,
          });

          throw ErrorHandler.createError(
            ErrorCategory.NETWORK,
            ErrorSeverity.HIGH,
            `Failed to clone repository: ${errorMessage}`,
            {
              operation: 'push_to_git',
              component: 'PushToGitTool',
              requestId,
              input: {
                repoUrl: scrubCredentials(args.repoUrl),
                branch: cloneBranch,
              },
              suggestedActions: [
                'Verify the repository URL is correct',
                'Check that the branch exists',
                'Ensure your token has read access to the repository',
              ],
            }
          );
        }

        const files: Array<{ path: string; content: string }> = [];

        // Handle raw/kustomize manifests (Helm is rejected earlier in validation)
        const manifestFiles = solution.generatedManifests.files;
        if (manifestFiles && manifestFiles.length > 0) {
          for (const file of manifestFiles) {
            const sanitizedPath = sanitizeRelativePath(file.relativePath);
            files.push({
              path: path.posix.join(targetPath, sanitizedPath),
              content: file.content,
            });
          }
        }

        if (files.length === 0) {
          throw ErrorHandler.createError(
            ErrorCategory.VALIDATION,
            ErrorSeverity.HIGH,
            'No files to push. Manifests may be empty or missing content.',
            {
              operation: 'push_to_git',
              component: 'PushToGitTool',
              requestId,
              input: { solutionId: args.solutionId },
              suggestedActions: [
                'Verify generateManifests completed successfully',
                'Check that manifests contain content',
              ],
            }
          );
        }

        logger.info('Pushing files to repository', {
          fileCount: files.length,
          targetPath,
          branch: headBranch ?? targetBranch,
          pullRequest: prMode,
        });

        const filesPreview = files.map(f => ({
          path: f.path,
          size: f.content.length,
          lines: f.content.split('\n').length,
        }));

        /**
         * pushRepo with a scrubbed failure. The raw message is git's own output,
         * so it may carry the authenticated remote URL.
         */
        const push = async (branch: string): Promise<PushResult> => {
          try {
            return await pushRepo(tmpDir, files, commitMessage, {
              branch,
              author,
            });
          } catch (pushError) {
            const errorMessage = scrubCredentials(
              pushError instanceof Error ? pushError.message : String(pushError)
            );
            logger.error(
              'Failed to push to repository',
              new Error(errorMessage),
              {
                repoUrl: scrubCredentials(args.repoUrl),
                branch,
                targetPath,
              }
            );

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
        };

        let pushedBranch: string;
        let commitSha: string | undefined;
        let filesPushed: string[];
        let pullRequest: PullRequestOutcome | undefined;
        let status: 'manifests_pushed' | 'no_changes' = 'manifests_pushed';
        let gitopsMessage: string;

        if (!prMode) {
          // ── Direct push (PRD #395, unchanged apart from the author) ──
          const pushResult = await push(targetBranch);
          pushedBranch = pushResult.branch;
          commitSha = pushResult.commitSha;
          filesPushed = pushResult.filesAdded;
          if (!commitSha) {
            // Reporting "pushed successfully" for a push that never happened is
            // the pre-existing oddity M1 flagged for M2 (PRD #710 decision 3).
            status = 'no_changes';
            gitopsMessage =
              pushResult.noCommitReason === 'commit_failed'
                ? 'Nothing was pushed: the commit produced no revision even though the changes were staged — a commit hook may have rejected it.'
                : `No changes to push: the manifests already match branch ${pushedBranch}.`;
          } else {
            gitopsMessage = `Manifests pushed successfully. Your GitOps controller (Argo CD/Flux) will sync these changes automatically.`;
          }
        } else if (reusablePr) {
          // ── Re-run onto the open pull request (decision 9) ──
          const pushResult = await push(reusablePr.headBranch);
          pushedBranch = reusablePr.headBranch;
          if (pushResult.commitSha) {
            commitSha = pushResult.commitSha;
            filesPushed = pushResult.filesAdded;
            pullRequest = {
              status: 'updated',
              url: reusablePr.url,
              number: reusablePr.number,
              branch: reusablePr.headBranch,
              baseBranch: reusablePr.baseBranch,
              filesChanged: pushResult.filesAdded,
            };
            gitopsMessage = `Pull request #${reusablePr.number} updated with a new commit: ${reusablePr.url}. Nothing was written to ${reusablePr.baseBranch} — merge the pull request to let your GitOps controller (Argo CD/Flux) sync the change.`;
          } else if (pushResult.noCommitReason === 'commit_failed') {
            throw ErrorHandler.createError(
              ErrorCategory.OPERATION,
              ErrorSeverity.HIGH,
              'Failed to push to repository: the commit produced no revision even though the changes were staged — a commit hook may have rejected it. Nothing was pushed.',
              {
                operation: 'push_to_git',
                component: 'PushToGitTool',
                requestId,
                input: {
                  repoUrl: scrubCredentials(args.repoUrl),
                  branch: reusablePr.headBranch,
                },
                suggestedActions: [
                  'Check for repository commit hooks that reject generated commits',
                ],
              }
            );
          } else {
            // Decision 3, on the re-run path: the files already match the branch
            // the pull request proposes, so there is nothing to add to it.
            status = 'no_changes';
            filesPushed = [];
            pullRequest = {
              status: 'no_changes',
              url: reusablePr.url,
              number: reusablePr.number,
              branch: reusablePr.headBranch,
              baseBranch: reusablePr.baseBranch,
              filesChanged: [],
            };
            gitopsMessage = `No changes to push: the manifests already match branch ${reusablePr.headBranch}. Pull request #${reusablePr.number} is unchanged: ${reusablePr.url}.`;
          }
        } else {
          // ── First PR-mode push for this solution ──
          const prResult = await createPullRequest({
            repoPath: tmpDir,
            files,
            title: commitMessage,
            body: buildPullRequestBody({
              solutionId: args.solutionId,
              intent: solution.intent,
              targetPath,
              baseBranch: targetBranch,
              requestedBy,
            }),
            // Server-generated (success criterion 2). validatePathWithinClones
            // is NOT in this path — pushToGit built tmpDir itself and never
            // accepts a client-supplied path, which is the same guarantee.
            branchName: headBranch!,
            baseBranch: targetBranch,
            author,
            userAgent: PR_USER_AGENT,
          });

          if (prResult.status === 'failed') {
            // Already credential-scrubbed by the helper.
            throw ErrorHandler.createError(
              ErrorCategory.NETWORK,
              ErrorSeverity.HIGH,
              `Failed to create pull request: ${prResult.error}`,
              {
                operation: 'push_to_git',
                component: 'PushToGitTool',
                requestId,
                input: {
                  repoUrl: scrubCredentials(args.repoUrl),
                  branch: headBranch,
                  baseBranch: targetBranch,
                },
                suggestedActions: [
                  'Ensure your token has write access to the repository and permission to open pull requests',
                  `Check that the base branch ${targetBranch} exists`,
                ],
              }
            );
          }

          pushedBranch = prResult.branch;
          filesPushed = prResult.filesChanged;
          pullRequest = {
            status: prResult.status,
            branch: prResult.branch,
            baseBranch: prResult.baseBranch,
            filesChanged: prResult.filesChanged,
          };

          if (prResult.status === 'created') {
            commitSha = prResult.commitSha;
            pullRequest.url = prResult.prUrl;
            pullRequest.number = prResult.prNumber;
            gitopsMessage = `Pull request #${prResult.prNumber} opened: ${prResult.prUrl}. Nothing was written to ${prResult.baseBranch} — merge the pull request to let your GitOps controller (Argo CD/Flux) sync the change.`;
          } else if (prResult.status === 'pushed_without_pr') {
            // Decision 7: say plainly that the pull request does NOT exist.
            commitSha = prResult.commitSha;
            pullRequest.error = prResult.error;
            gitopsMessage = `Branch ${prResult.branch} was pushed but NO pull request was opened: ${prResult.error} Open one from ${prResult.branch} into ${prResult.baseBranch} manually — nothing was written to ${prResult.baseBranch}.`;
          } else {
            // no_changes: nothing was pushed, so there is no branch on the
            // remote and no pull request (decision 3).
            status = 'no_changes';
            filesPushed = [];
            gitopsMessage = `No changes to propose: the manifests already match ${prResult.baseBranch}. No branch was pushed and no pull request was opened.`;
          }
        }

        const pushedAt = new Date().toISOString();

        sm.updateSession(args.solutionId, {
          stage: 'pushed',
          gitPush: {
            repoUrl: scrubCredentials(args.repoUrl),
            path: targetPath,
            branch: pushedBranch,
            commitSha,
            pushedAt,
            // Decision 5: `stage` stays 'pushed' (dot-ai-ui consumes it) and the
            // pull request rides here instead. Recorded even for `no_changes`,
            // so the NEXT re-run can still find the open pull request.
            //
            // `url`/`number` are SPREAD rather than assigned, because the session
            // manager serializes with a replacer that turns undefined into null
            // to preserve structure. Assigning them would write `"url": null` for
            // `pushed_without_pr`, where no pull request exists at all — a shape
            // the response itself never produces (plain JSON.stringify drops
            // undefined) and one a session-file consumer such as dot-ai-ui would
            // have to special-case. Absent means absent, in both places.
            ...(pullRequest
              ? {
                  pullRequest: {
                    status: pullRequest.status,
                    ...(pullRequest.url !== undefined
                      ? { url: pullRequest.url }
                      : {}),
                    ...(pullRequest.number !== undefined
                      ? { number: pullRequest.number }
                      : {}),
                    branch: pullRequest.branch,
                    baseBranch: pullRequest.baseBranch,
                  },
                }
              : {}),
          },
        });

        const visualizationUrl = getVisualizationUrl(args.solutionId);

        const response = {
          success: true,
          status,
          solutionId: args.solutionId,
          gitPush: {
            repoUrl: scrubCredentials(args.repoUrl),
            path: targetPath,
            branch: pushedBranch,
            commitSha,
            filesPushed,
            pushedAt,
            ...(pullRequest ? { pullRequest } : {}),
          },
          filesPreview,
          gitopsMessage,
          timestamp: new Date().toISOString(),
          ...(visualizationUrl ? { visualizationUrl } : {}),
        };

        logger.info('Push to Git completed successfully', {
          solutionId: args.solutionId,
          status,
          commitSha,
          branch: pushedBranch,
          baseBranch: prMode ? baseBranch : undefined,
          pullRequestStatus: pullRequest?.status,
          pullRequestNumber: pullRequest?.number,
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
        // Stronger than the clones directory's TTL sweep, which only runs at the
        // start of a remediate investigation and would never fire in a
        // recommend-only deployment (PRD #710 scope item 5).
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
      input: { ...args, repoUrl: scrubCredentials(args.repoUrl) },
    }
  );
}
