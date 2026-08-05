/**
 * Unit Tests for Push to Git Tool (PRD #395, PRD #710)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { posix as posixPath, resolve as resolvePath } from 'path';
import { z } from 'zod';
import {
  handlePushToGitTool,
  buildPrHeadBranch,
  buildPullRequestBody,
  resolveCommitAuthor,
  SOLUTION_ID_PATTERN,
} from '../../../src/tools/push-to-git.js';
import { GenericSessionManager } from '../../../src/core/generic-session-manager.js';
import { requestContext } from '../../../src/interfaces/request-context.js';
import type { UserIdentity } from '../../../src/interfaces/oauth/types.js';
import type { SolutionData } from '../../../src/tools/recommend.js';
import type { Logger } from '../../../src/core/error-handling.js';

vi.mock('../../../src/core/git-utils.js', async importOriginal => ({
  // The repository host allowlist is NOT mocked: it is a pure function of the
  // env var, and the point of its tests here is that the handler refuses a
  // disallowed host before any of the mocked, credential-bearing calls below.
  ...(await importOriginal<typeof import('../../../src/core/git-utils.js')>()),
  cloneRepo: vi.fn(),
  pushRepo: vi.fn(),
  createPullRequest: vi.fn(),
  lookupPullRequest: vi.fn(),
  getGitAuthConfigFromEnv: vi.fn(),
  // A directory under ./tmp, since the handler really does rm/mkdir it.
  getGitopsClonesDir: vi.fn(() =>
    resolvePath(process.cwd(), 'tmp', 'unit-push-to-git-clones')
  ),
  scrubCredentials: vi.fn((url: string) => url.replace(/:\/\/[^@]+@/, '://***@')),
  sanitizeRelativePath: vi.fn((p: string) => {
    if (p.startsWith('/')) throw new Error('Relative path cannot be absolute');
    const normalized = posixPath.normalize(p);
    if (normalized.startsWith('..') || posixPath.isAbsolute(normalized))
      throw new Error('Relative path cannot escape target directory');
    return normalized;
  }),
}));

vi.mock('../../../src/core/session-utils.js', () => ({
  getAndValidateSessionDirectory: vi.fn(() => '/tmp/dot-ai-sessions'),
}));

vi.mock('../../../src/core/visualization.js', () => ({
  getVisualizationUrl: vi.fn(() => 'http://localhost:3000/v/sol-test'),
}));

describe('Push to Git Tool', () => {
  let sessionManager: GenericSessionManager<SolutionData>;
  let mockDotAI: { ai: { isInitialized: () => boolean }; discovery: Record<string, unknown> };
  let mockLogger: Partial<Logger>;
  const requestId = 'test-request-id';

  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = new GenericSessionManager<SolutionData>('sol');
    mockDotAI = {
      ai: { isInitialized: () => true },
      discovery: {},
    };
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  describe('Input Validation', () => {
    test('should reject invalid solutionId format via schema', () => {
      const schema = z.object({
        solutionId: z.string().regex(/^sol-\d+-[a-f0-9]{8}$/),
        repoUrl: z.string().url(),
        targetPath: z.string(),
      });

      const result = schema.safeParse({
        solutionId: 'invalid-id',
        repoUrl: 'https://github.com/test/repo.git',
        targetPath: 'apps/test/',
      });

      expect(result.success).toBe(false);
    });

    test('should reject invalid repoUrl format via schema', () => {
      const schema = z.object({
        solutionId: z.string().regex(/^sol-\d+-[a-f0-9]{8}$/),
        repoUrl: z.string().url(),
        targetPath: z.string(),
      });

      const result = schema.safeParse({
        solutionId: 'sol-1234567890-abc12345',
        repoUrl: 'not-a-url',
        targetPath: 'apps/test/',
      });

      expect(result.success).toBe(false);
    });

    test('should reject path traversal in targetPath', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      await expect(
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: 'https://github.com/test/repo.git',
            targetPath: '../../../etc/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow('Invalid target path');
    });

    test.each([
      '/apps/test/',
      '~/apps/test/',
      'apps\\test/',
    ])('should reject invalid targetPath %s', async (targetPath) => {
      const { getGitAuthConfigFromEnv } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);

      await expect(
        handlePushToGitTool(
          {
            solutionId: session.sessionId,
            repoUrl: 'https://github.com/test/repo.git',
            targetPath,
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow('Invalid target path');
    });
  });

  describe('Authentication', () => {
    test('should reject when no auth configured', async () => {
      const { getGitAuthConfigFromEnv } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({});

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      await expect(
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: 'https://github.com/test/repo.git',
            targetPath: 'apps/test/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow('No Git authentication configured');
    });

    test('should accept PAT auth', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, pushRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'abc123',
        filesAdded: ['apps/test/test.yaml'],
      });

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      const result = await handlePushToGitTool(
        {
          solutionId: sessionId,
          repoUrl: 'https://github.com/test/repo.git',
          targetPath: 'apps/test/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.status).toBe('manifests_pushed');
    });

    test('should accept GitHub App auth', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, pushRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({
        githubApp: {
          appId: '123',
          privateKey: 'test-key',
        },
      });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'abc123',
        filesAdded: ['apps/test/test.yaml'],
      });

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      const result = await handlePushToGitTool(
        {
          solutionId: sessionId,
          repoUrl: 'https://github.com/test/repo.git',
          targetPath: 'apps/test/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('Manifest Handling', () => {
    test('should push raw manifests', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, pushRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'abc123',
        filesAdded: ['apps/test/manifests.yaml'],
      });

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'postgresql deployment',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [
            { relativePath: 'deployment.yaml', content: 'apiVersion: apps/v1\nkind: Deployment' },
            { relativePath: 'service.yaml', content: 'apiVersion: v1\nkind: Service' },
          ],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      const result = await handlePushToGitTool(
        {
          solutionId: sessionId,
          repoUrl: 'https://github.com/test/repo.git',
          targetPath: 'apps/postgres/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.gitPush.path).toBe('apps/postgres');
      expect(pushRepo).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          { path: 'apps/postgres/deployment.yaml', content: expect.any(String) },
          { path: 'apps/postgres/service.yaml', content: expect.any(String) },
        ]),
        expect.stringContaining('postgresql deployment'),
        { branch: 'main', author: undefined }
      );
    });

    test('should reject Helm solutions with clear error', async () => {
      const { getGitAuthConfigFromEnv } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'helm deployment',
        type: 'helm',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'helm',
          valuesYaml: 'replicaCount: 3\nimage: postgres:15',
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      await expect(
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: 'https://github.com/test/repo.git',
            targetPath: 'apps/postgres/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow('GitOps push for Helm charts is not yet supported');
    });

    test('should use posix paths when building Git file paths', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, pushRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'abc123',
        filesAdded: ['apps/windows/path/manifests/deployment.yaml'],
      });

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'windows path test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'manifests/deployment.yaml', content: 'kind: Deployment' }],
        },
      };
      const session = sessionManager.createSession(solutionData);

      await handlePushToGitTool(
        {
          solutionId: session.sessionId,
          repoUrl: 'https://github.com/test/repo.git',
          targetPath: 'apps/windows/path/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      expect(pushRepo).toHaveBeenCalledWith(
        expect.any(String),
        [{ path: 'apps/windows/path/manifests/deployment.yaml', content: 'kind: Deployment' }],
        expect.stringContaining('windows path test'),
        { branch: 'main', author: undefined }
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle clone failure', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockRejectedValue(new Error('Repository not found'));

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      await expect(
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: 'https://github.com/test/repo.git',
            targetPath: 'apps/test/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow('Failed to clone repository');
    });

    test('should handle push failure', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, pushRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      vi.mocked(pushRepo).mockRejectedValue(new Error('Permission denied'));

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      await expect(
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: 'https://github.com/test/repo.git',
            targetPath: 'apps/test/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow('Failed to push to repository');
    });

    test('should handle missing manifests', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      await expect(
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: 'https://github.com/test/repo.git',
            targetPath: 'apps/test/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow('No manifests found');
    });
  });

  describe('Session State', () => {
    test('should update session with gitPush data', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, pushRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'abc123def456',
        filesAdded: ['apps/test/test.yaml'],
      });

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      await handlePushToGitTool(
        {
          solutionId: sessionId,
          repoUrl: 'https://github.com/test/repo.git',
          targetPath: 'apps/test/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      const updatedSession = sessionManager.getSession(sessionId);
      expect(updatedSession).toBeDefined();
      expect(updatedSession!.data.stage).toBe('pushed');
      expect(updatedSession!.data.gitPush).toBeDefined();
      expect(updatedSession!.data.gitPush!.branch).toBe('main');
      expect(updatedSession!.data.gitPush!.commitSha).toBe('abc123def456');
      expect(updatedSession!.data.gitPush!.path).toBe('apps/test');
    });
  });

  describe('Response Format', () => {
    test('should include GitOps message in response', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, pushRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'abc123',
        filesAdded: ['apps/test/test.yaml'],
      });

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      const result = await handlePushToGitTool(
        {
          solutionId: sessionId,
          repoUrl: 'https://github.com/test/repo.git',
          targetPath: 'apps/test/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.gitopsMessage).toContain('Argo CD');
      expect(response.gitopsMessage).toContain('Flux');
    });

    test('should include visualization URL in response', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, pushRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'abc123',
        filesAdded: ['apps/test/test.yaml'],
      });

      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'test',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'test.yaml', content: 'test: value' }],
        },
      };
      const session = sessionManager.createSession(solutionData);
      const sessionId = session.sessionId;

      const result = await handlePushToGitTool(
        {
          solutionId: sessionId,
          repoUrl: 'https://github.com/test/repo.git',
          targetPath: 'apps/test/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.visualizationUrl).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PR mode (PRD #710 M2)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Pull request mode (PRD #710 M2)', () => {
    const REPO_URL = 'https://github.com/acme/demo.git';
    const PR_URL = 'https://github.com/acme/demo/pull/7';
    const PR_NUMBER = 7;

    const oauthIdentity: UserIdentity = {
      userId: 'pr-user-sub',
      email: 'pr-user@example.test',
      groups: [],
      source: 'oauth',
    };

    /** Run the handler as an authenticated OAuth user. */
    function asUser<T>(
      identity: UserIdentity | undefined,
      fn: () => Promise<T>
    ): Promise<T> {
      return requestContext.run({ identity }, fn);
    }

    function seedSolution(): string {
      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'deploy nginx web server',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'manifests.yaml', content: 'kind: Service' }],
        },
      };
      return sessionManager.createSession(solutionData).sessionId;
    }

    /** Record a previous PR-mode push, the way a real first push would have. */
    function recordPreviousPr(
      sessionId: string,
      overrides: Partial<{
        headBranch: string;
        number: number;
        repoUrl: string;
      }> = {}
    ): string {
      const headBranch = overrides.headBranch ?? `dot-ai/${sessionId}-111`;
      sessionManager.updateSession(sessionId, {
        gitPush: {
          repoUrl: overrides.repoUrl ?? REPO_URL,
          path: 'apps/test',
          branch: headBranch,
          commitSha: 'oldsha',
          pullRequest: {
            status: 'created',
            url: PR_URL,
            number: overrides.number ?? PR_NUMBER,
            branch: headBranch,
            baseBranch: 'main',
          },
        },
      });
      return headBranch;
    }

    async function gitUtils() {
      return await import('../../../src/core/git-utils.js');
    }

    beforeEach(async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, createPullRequest } =
        await gitUtils();
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined as never);
      // Echo the head branch back, so a test can prove the name the handler
      // generated rather than a name the mock invented.
      vi.mocked(createPullRequest).mockImplementation(async input => ({
        status: 'created',
        success: true,
        prUrl: PR_URL,
        prNumber: PR_NUMBER,
        branch: input.branchName,
        baseBranch: input.baseBranch || 'main',
        filesChanged: input.files.map(f => f.path),
        commitSha: 'newsha',
      }));
    });

    test('opens a PR on a server-generated head branch and never writes the base', async () => {
      const { cloneRepo, createPullRequest, pushRepo } = await gitUtils();
      const sessionId = seedSolution();

      const result = await asUser(oauthIdentity, () =>
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: REPO_URL,
            targetPath: 'apps/test/',
            branch: 'main',
            pullRequest: true,
            commitMessage: 'test: pr mode',
            // Decision 8 / success criterion 2: neither the spoofed author nor
            // an invented head-branch parameter may take effect.
            authorName: 'Spoofed Author',
            authorEmail: 'spoofed@attacker.example',
            headBranch: 'client-chosen-head',
          } as never,
          mockDotAI,
          mockLogger,
          requestId
        )
      );

      const response = JSON.parse(result.content[0].text);
      const headBranch = response.gitPush.branch;

      expect(headBranch).toMatch(new RegExp(`^dot-ai/${sessionId}-\\d+$`));
      expect(headBranch).not.toBe('main');
      expect(headBranch).not.toBe('client-chosen-head');

      // The clone is of the BASE branch; the head branch is created from it.
      expect(cloneRepo).toHaveBeenCalledWith(REPO_URL, expect.any(String), {
        branch: 'main',
        depth: 1,
      });
      // Direct push never happens in PR mode.
      expect(pushRepo).not.toHaveBeenCalled();

      expect(createPullRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          branchName: headBranch,
          baseBranch: 'main',
          title: 'test: pr mode',
          author: { name: oauthIdentity.email, email: oauthIdentity.email },
          userAgent: 'dot-ai-pushtogit',
        })
      );

      const body = vi.mocked(createPullRequest).mock.calls[0][0].body!;
      expect(body).toContain(sessionId);
      expect(body).toContain('deploy nginx web server');
      expect(body).toContain('apps/test');
      expect(body).toContain(oauthIdentity.email!);
      expect(body).not.toContain('spoofed@attacker.example');

      expect(response).toMatchObject({
        success: true,
        status: 'manifests_pushed',
        gitPush: {
          path: 'apps/test',
          branch: headBranch,
          commitSha: 'newsha',
          pullRequest: {
            status: 'created',
            url: PR_URL,
            number: PR_NUMBER,
            branch: headBranch,
            baseBranch: 'main',
            filesChanged: ['apps/test/manifests.yaml'],
          },
        },
      });

      // Decision 5: stage stays 'pushed'; the PR rides on gitPush.
      const session = sessionManager.getSession(sessionId);
      expect(session!.data.stage).toBe('pushed');
      expect(session!.data.gitPush).toMatchObject({
        branch: headBranch,
        pullRequest: {
          status: 'created',
          url: PR_URL,
          number: PR_NUMBER,
          branch: headBranch,
          baseBranch: 'main',
        },
      });
    });

    test('a re-run with changed manifests updates the open PR in place', async () => {
      const { cloneRepo, pushRepo, createPullRequest, lookupPullRequest } =
        await gitUtils();
      const sessionId = seedSolution();
      const headBranch = recordPreviousPr(sessionId);

      vi.mocked(lookupPullRequest).mockResolvedValue({
        status: 'found',
        pullRequest: {
          number: PR_NUMBER,
          url: PR_URL,
          headBranch,
          baseBranch: 'main',
          state: 'open',
          merged: false,
        },
      });
      vi.mocked(pushRepo).mockResolvedValue({
        branch: headBranch,
        commitSha: 'updatedsha',
        filesAdded: ['apps/updated/manifests.yaml'],
      });

      const result = await asUser(oauthIdentity, () =>
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: REPO_URL,
            targetPath: 'apps/updated/',
            branch: 'main',
            pullRequest: true,
            commitMessage: 'test: pr mode',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      );

      // Reuse clones the HEAD branch so the new commit lands on top of it.
      expect(cloneRepo).toHaveBeenCalledWith(REPO_URL, expect.any(String), {
        branch: headBranch,
        depth: 1,
      });
      // No second pull request.
      expect(createPullRequest).not.toHaveBeenCalled();
      expect(pushRepo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        'test: pr mode',
        {
          branch: headBranch,
          author: { name: oauthIdentity.email, email: oauthIdentity.email },
        }
      );

      expect(JSON.parse(result.content[0].text)).toMatchObject({
        status: 'manifests_pushed',
        gitPush: {
          branch: headBranch,
          commitSha: 'updatedsha',
          pullRequest: {
            status: 'updated',
            url: PR_URL,
            number: PR_NUMBER,
            branch: headBranch,
            baseBranch: 'main',
            filesChanged: ['apps/updated/manifests.yaml'],
          },
        },
      });
    });

    test('a re-run with unchanged manifests is no_changes and keeps the PR on the session', async () => {
      const { pushRepo, lookupPullRequest } = await gitUtils();
      const sessionId = seedSolution();
      const headBranch = recordPreviousPr(sessionId);

      vi.mocked(lookupPullRequest).mockResolvedValue({
        status: 'found',
        pullRequest: {
          number: PR_NUMBER,
          url: PR_URL,
          headBranch,
          baseBranch: 'main',
          state: 'open',
          merged: false,
        },
      });
      vi.mocked(pushRepo).mockResolvedValue({
        branch: headBranch,
        commitSha: undefined,
        filesAdded: [],
        noCommitReason: 'nothing_staged',
      });

      const result = await asUser(oauthIdentity, () =>
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: REPO_URL,
            targetPath: 'apps/test/',
            branch: 'main',
            pullRequest: true,
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      );

      expect(JSON.parse(result.content[0].text)).toMatchObject({
        success: true,
        status: 'no_changes',
        gitPush: {
          pullRequest: {
            status: 'no_changes',
            url: PR_URL,
            number: PR_NUMBER,
            branch: headBranch,
            baseBranch: 'main',
            filesChanged: [],
          },
        },
      });

      // The NEXT re-run must still find this PR, so no_changes cannot drop it.
      expect(
        sessionManager.getSession(sessionId)!.data.gitPush!.pullRequest
      ).toMatchObject({ number: PR_NUMBER, url: PR_URL, branch: headBranch });
    });

    test('a closed pull request is not reused — a new branch and PR are opened', async () => {
      const { pushRepo, createPullRequest, lookupPullRequest } =
        await gitUtils();
      const sessionId = seedSolution();
      const headBranch = recordPreviousPr(sessionId);

      vi.mocked(lookupPullRequest).mockResolvedValue({
        status: 'found',
        pullRequest: {
          number: PR_NUMBER,
          url: PR_URL,
          headBranch,
          baseBranch: 'main',
          state: 'closed',
          merged: true,
        },
      });

      const result = await asUser(oauthIdentity, () =>
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: REPO_URL,
            targetPath: 'apps/test/',
            branch: 'main',
            pullRequest: true,
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      );

      expect(pushRepo).not.toHaveBeenCalled();
      expect(createPullRequest).toHaveBeenCalledTimes(1);
      const newBranch = JSON.parse(result.content[0].text).gitPush.branch;
      expect(newBranch).not.toBe(headBranch);
      expect(newBranch).toMatch(new RegExp(`^dot-ai/${sessionId}-\\d+$`));
    });

    test('a branch recorded against a different repository is not reused', async () => {
      const { createPullRequest, lookupPullRequest } = await gitUtils();
      const sessionId = seedSolution();
      recordPreviousPr(sessionId, {
        repoUrl: 'https://github.com/acme/other.git',
      });

      await asUser(oauthIdentity, () =>
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: REPO_URL,
            targetPath: 'apps/test/',
            branch: 'main',
            pullRequest: true,
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      );

      expect(lookupPullRequest).not.toHaveBeenCalled();
      expect(createPullRequest).toHaveBeenCalledTimes(1);
    });

    test('an unavailable PR lookup fails the push instead of opening a duplicate', async () => {
      const { cloneRepo, pushRepo, createPullRequest, lookupPullRequest } =
        await gitUtils();
      const sessionId = seedSolution();
      recordPreviousPr(sessionId);

      vi.mocked(lookupPullRequest).mockResolvedValue({
        status: 'unknown',
        error: 'GitHub API error (502): Bad Gateway',
      });

      await expect(
        asUser(oauthIdentity, () =>
          handlePushToGitTool(
            {
              solutionId: sessionId,
              repoUrl: REPO_URL,
              targetPath: 'apps/test/',
              branch: 'main',
              pullRequest: true,
            },
            mockDotAI,
            mockLogger,
            requestId
          )
        )
      ).rejects.toThrow(/Could not determine whether pull request #7 is still open/);

      expect(cloneRepo).not.toHaveBeenCalled();
      expect(pushRepo).not.toHaveBeenCalled();
      expect(createPullRequest).not.toHaveBeenCalled();
    });

    test('a pushed branch without a PR says so instead of reading as a created PR', async () => {
      const { createPullRequest } = await gitUtils();
      const sessionId = seedSolution();

      vi.mocked(createPullRequest).mockResolvedValue({
        status: 'pushed_without_pr',
        success: true,
        branch: `dot-ai/${sessionId}-222`,
        baseBranch: 'main',
        filesChanged: ['apps/test/manifests.yaml'],
        commitSha: 'pushedsha',
        error: 'A pull request could not be opened automatically for this remote.',
      });

      const result = await asUser(oauthIdentity, () =>
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: REPO_URL,
            targetPath: 'apps/test/',
            branch: 'main',
            pullRequest: true,
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.gitPush.pullRequest).toMatchObject({
        status: 'pushed_without_pr',
        error: expect.stringContaining('could not be opened'),
      });
      expect(response.gitPush.pullRequest.url).toBeUndefined();
      expect(response.gitopsMessage).toContain('NO pull request');
    });

    test('the first PR-mode push with nothing to propose is no_changes, not a 422', async () => {
      const { createPullRequest } = await gitUtils();
      const sessionId = seedSolution();

      vi.mocked(createPullRequest).mockResolvedValue({
        status: 'no_changes',
        success: true,
        branch: `dot-ai/${sessionId}-333`,
        baseBranch: 'main',
        filesChanged: [],
        message: 'No changes to propose',
      });

      const result = await asUser(oauthIdentity, () =>
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: REPO_URL,
            targetPath: 'apps/test/',
            branch: 'main',
            pullRequest: true,
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('no_changes');
      expect(response.gitPush.pullRequest).toMatchObject({
        status: 'no_changes',
        filesChanged: [],
      });
      expect(response.gitPush.commitSha).toBeUndefined();
    });

    test("a failed pull request surfaces the helper's scrubbed error", async () => {
      const { createPullRequest } = await gitUtils();
      const sessionId = seedSolution();

      vi.mocked(createPullRequest).mockResolvedValue({
        status: 'failed',
        success: false,
        error: 'GitHub API error (422): {"message":"Validation Failed"}',
      });

      await expect(
        asUser(oauthIdentity, () =>
          handlePushToGitTool(
            {
              solutionId: sessionId,
              repoUrl: REPO_URL,
              targetPath: 'apps/test/',
              branch: 'main',
              pullRequest: true,
            },
            mockDotAI,
            mockLogger,
            requestId
          )
        )
      ).rejects.toThrow('Failed to create pull request: GitHub API error (422)');
    });

    test('direct push uses the authenticated identity as author, not the client-supplied one', async () => {
      const { pushRepo } = await gitUtils();
      const sessionId = seedSolution();
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'directsha',
        filesAdded: ['apps/test/manifests.yaml'],
      });

      await asUser(oauthIdentity, () =>
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: REPO_URL,
            targetPath: 'apps/test/',
            authorName: 'Spoofed Author',
            authorEmail: 'spoofed@attacker.example',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      );

      expect(pushRepo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.any(String),
        {
          branch: 'main',
          author: { name: oauthIdentity.email, email: oauthIdentity.email },
        }
      );
    });

    test('a direct push with nothing to commit reports no_changes rather than success', async () => {
      const { pushRepo } = await gitUtils();
      const sessionId = seedSolution();
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: undefined,
        filesAdded: [],
        noCommitReason: 'nothing_staged',
      });

      const result = await handlePushToGitTool(
        {
          solutionId: sessionId,
          repoUrl: REPO_URL,
          targetPath: 'apps/test/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('no_changes');
      expect(response.gitPush.pullRequest).toBeUndefined();
    });

    test('rejects a solutionId outside the sol-<timestamp>-<8 hex> format before cloning', async () => {
      const { cloneRepo, createPullRequest } = await gitUtils();

      await expect(
        handlePushToGitTool(
          {
            solutionId: 'sol-1/../../etc',
            repoUrl: REPO_URL,
            targetPath: 'apps/test/',
            pullRequest: true,
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow('Invalid solution ID');

      expect(cloneRepo).not.toHaveBeenCalled();
      expect(createPullRequest).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Repository host allowlist
  // ─────────────────────────────────────────────────────────────────────────

  describe('Repository host allowlist', () => {
    const ALLOWED_HOSTS_ENV = 'DOT_AI_GITOPS_ALLOWED_REPO_HOSTS';
    let savedAllowedHosts: string | undefined;

    beforeEach(async () => {
      savedAllowedHosts = process.env[ALLOWED_HOSTS_ENV];
      const { getGitAuthConfigFromEnv, cloneRepo } = await import(
        '../../../src/core/git-utils.js'
      );
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined as never);
    });

    afterEach(() => {
      if (savedAllowedHosts === undefined) delete process.env[ALLOWED_HOSTS_ENV];
      else process.env[ALLOWED_HOSTS_ENV] = savedAllowedHosts;
    });

    function seedSolution(): string {
      const solutionData: SolutionData = {
        toolName: 'recommend',
        intent: 'deploy nginx',
        type: 'single',
        score: 1,
        description: 'test',
        reasons: [],
        questions: {},
        answers: {},
        timestamp: new Date().toISOString(),
        generatedManifests: {
          type: 'raw',
          files: [{ relativePath: 'manifests.yaml', content: 'kind: Service' }],
        },
      };
      return sessionManager.createSession(solutionData).sessionId;
    }

    test.each([
      ['direct push', false],
      ['pull request mode', true],
    ])(
      'a disallowed host is refused in %s before ANY credential-bearing call',
      async (_mode, pullRequest) => {
        // The finding: getAuthenticatedUrl embeds the SERVER's token into
        // whatever URL the client supplied, so an attacker-named host receives
        // DOT_AI_GIT_TOKEN. Every one of these four calls would carry it (the
        // push and createPullRequest via the clone's `origin`), so the assertion
        // is that none of them runs at all.
        process.env[ALLOWED_HOSTS_ENV] = 'github.com';
        const { cloneRepo, pushRepo, createPullRequest, lookupPullRequest } =
          await import('../../../src/core/git-utils.js');
        const sessionId = seedSolution();

        await expect(
          handlePushToGitTool(
            {
              solutionId: sessionId,
              repoUrl: 'https://attacker.example/x.git',
              targetPath: 'apps/test/',
              pullRequest,
            },
            mockDotAI,
            mockLogger,
            requestId
          )
        ).rejects.toThrow(/attacker\.example/);

        expect(cloneRepo).not.toHaveBeenCalled();
        expect(pushRepo).not.toHaveBeenCalled();
        expect(createPullRequest).not.toHaveBeenCalled();
        expect(lookupPullRequest).not.toHaveBeenCalled();
      }
    );

    test('the refusal names the Helm value an operator has to change', async () => {
      process.env[ALLOWED_HOSTS_ENV] = 'github.com';
      const sessionId = seedSolution();

      await expect(
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: 'https://gitlab.corp/team/gitops.git',
            targetPath: 'apps/test/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow(/gitops\.allowedRepoHosts/);
    });

    test('a host that only LOOKS like an allowed one is still refused', async () => {
      process.env[ALLOWED_HOSTS_ENV] = 'github.com';
      const { cloneRepo } = await import('../../../src/core/git-utils.js');
      const sessionId = seedSolution();

      await expect(
        handlePushToGitTool(
          {
            solutionId: sessionId,
            // Userinfo cannot smuggle the host past a hostname comparison.
            repoUrl: 'https://github.com@attacker.example/x.git',
            targetPath: 'apps/test/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow(/attacker\.example/);

      expect(cloneRepo).not.toHaveBeenCalled();
    });

    test('an allowed non-GitHub host is accepted once an operator adds it', async () => {
      // The second breaking change of this release, and its remedy: pushing to a
      // self-hosted remote works again as soon as the host is allowlisted.
      process.env[ALLOWED_HOSTS_ENV] = 'github.com,gitlab.corp';
      const { cloneRepo, pushRepo } = await import(
        '../../../src/core/git-utils.js'
      );
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'sha',
        filesAdded: ['apps/test/manifests.yaml'],
      });
      const sessionId = seedSolution();

      const result = await handlePushToGitTool(
        {
          solutionId: sessionId,
          repoUrl: 'https://gitlab.corp/team/gitops.git',
          targetPath: 'apps/test/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      expect(JSON.parse(result.content[0].text).status).toBe(
        'manifests_pushed'
      );
      expect(cloneRepo).toHaveBeenCalled();
    });

    test('an empty allowlist denies even github.com', async () => {
      process.env[ALLOWED_HOSTS_ENV] = '';
      const { cloneRepo } = await import('../../../src/core/git-utils.js');
      const sessionId = seedSolution();

      await expect(
        handlePushToGitTool(
          {
            solutionId: sessionId,
            repoUrl: 'https://github.com/acme/demo.git',
            targetPath: 'apps/test/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow(/github\.com/);

      expect(cloneRepo).not.toHaveBeenCalled();
    });

    test('an unset allowlist still allows github.com', async () => {
      // Absent must mean the secure DEFAULT, not "allow everything" — and not
      // "deny everything" either, or an upgrade breaks every GitHub deployment.
      delete process.env[ALLOWED_HOSTS_ENV];
      const { cloneRepo, pushRepo } = await import(
        '../../../src/core/git-utils.js'
      );
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'sha',
        filesAdded: ['apps/test/manifests.yaml'],
      });
      const sessionId = seedSolution();

      const result = await handlePushToGitTool(
        {
          solutionId: sessionId,
          repoUrl: 'https://github.com/acme/demo.git',
          targetPath: 'apps/test/',
        },
        mockDotAI,
        mockLogger,
        requestId
      );

      expect(JSON.parse(result.content[0].text).status).toBe(
        'manifests_pushed'
      );
      expect(cloneRepo).toHaveBeenCalled();
    });
  });

  describe('Branch naming and attribution helpers (PRD #710 M2)', () => {
    test('the head branch is dot-ai/<solutionId>-<timestamp>', () => {
      expect(buildPrHeadBranch('sol-1785963643840-f9bcad4f', 1700000000000)).toBe(
        'dot-ai/sol-1785963643840-f9bcad4f-1700000000000'
      );
    });

    test('every component is machine-generated, so the ref needs no sanitizing', () => {
      const branch = buildPrHeadBranch('sol-1785963643840-f9bcad4f');
      expect(branch).toMatch(/^dot-ai\/sol-\d+-[a-f0-9]{8}-\d+$/);
      // Git ref rules: no space, no `..`, no control or special characters.
      expect(branch).not.toMatch(/[\s~^:?*[\\]|\.\./);
    });

    test.each([
      'sol-1/../../etc',
      'sol-abc-f9bcad4f',
      'sol-1785963643840-F9BCAD4F',
      '../sol-1785963643840-f9bcad4f',
      '',
    ])('refuses to build a branch from %s', invalid => {
      expect(SOLUTION_ID_PATTERN.test(invalid)).toBe(false);
      expect(() => buildPrHeadBranch(invalid)).toThrow(
        'invalid solution ID'
      );
    });

    test('two pushes for the same solution get different branches', () => {
      expect(buildPrHeadBranch('sol-1785963643840-f9bcad4f', 1)).not.toBe(
        buildPrHeadBranch('sol-1785963643840-f9bcad4f', 2)
      );
    });

    test('an OAuth identity outranks the client-supplied author', () => {
      expect(
        resolveCommitAuthor(
          {
            userId: 'sub-1',
            email: 'real@example.test',
            groups: [],
            source: 'oauth',
          },
          { authorName: 'Spoofed', authorEmail: 'spoofed@attacker.example' }
        )
      ).toEqual({ name: 'real@example.test', email: 'real@example.test' });
    });

    test('an OAuth identity without an email still never yields to the client', () => {
      expect(
        resolveCommitAuthor(
          { userId: 'sub-1', groups: [], source: 'oauth' },
          { authorName: 'Spoofed', authorEmail: 'spoofed@attacker.example' }
        )
      ).toEqual({
        name: 'sub-1',
        email: 'dot-ai@users.noreply.github.com',
      });
    });

    test('a static-token caller keeps the pre-PRD-710 behavior', () => {
      expect(
        resolveCommitAuthor(
          { userId: 'anonymous', groups: [], source: 'token' },
          { authorName: 'CI Bot', authorEmail: 'ci@example.test' }
        )
      ).toEqual({ name: 'CI Bot', email: 'ci@example.test' });
      expect(resolveCommitAuthor(undefined, {})).toBeUndefined();
    });

    test('the PR body answers who asked for this and what it does', () => {
      const body = buildPullRequestBody({
        solutionId: 'sol-1785963643840-f9bcad4f',
        intent: 'deploy nginx web server',
        targetPath: 'apps/nginx',
        baseBranch: 'main',
        requestedBy: 'real@example.test',
      });
      expect(body).toContain('sol-1785963643840-f9bcad4f');
      expect(body).toContain('deploy nginx web server');
      expect(body).toContain('apps/nginx');
      expect(body).toContain('real@example.test');
      expect(body).toContain('main');
    });
  });
});
