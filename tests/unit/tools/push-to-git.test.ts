/**
 * Unit Tests for Push to Git Tool (PRD #395)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { handlePushToGitTool } from '../../../src/tools/push-to-git.js';
import { GenericSessionManager } from '../../../src/core/generic-session-manager.js';
import type { SolutionData } from '../../../src/tools/recommend.js';

vi.mock('../../../src/core/git-utils.js', () => ({
  cloneRepo: vi.fn(),
  pushRepo: vi.fn(),
  getGitAuthConfigFromEnv: vi.fn(),
  scrubCredentials: vi.fn((url: string) => url.replace(/:\/\/[^@]+@/, '://***@')),
}));

vi.mock('../../../src/core/session-utils.js', () => ({
  getAndValidateSessionDirectory: vi.fn(() => '/tmp/dot-ai-sessions'),
}));

vi.mock('../../../src/core/visualization.js', () => ({
  getVisualizationUrl: vi.fn(() => 'http://localhost:3000/v/sol-test'),
}));

describe('Push to Git Tool', () => {
  let sessionManager: GenericSessionManager<SolutionData>;
  let mockDotAI: any;
  let mockLogger: any;
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
    test('should reject invalid solutionId format', async () => {
      const { getGitAuthConfigFromEnv } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });

      await expect(
        handlePushToGitTool(
          {
            solutionId: 'invalid-id',
            repoUrl: 'https://github.com/test/repo.git',
            targetPath: 'apps/test/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow();
    });

    test('should reject invalid repoUrl format', async () => {
      const { getGitAuthConfigFromEnv } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });

      await expect(
        handlePushToGitTool(
          {
            solutionId: 'sol-1234567890-abc12345',
            repoUrl: 'not-a-url',
            targetPath: 'apps/test/',
          },
          mockDotAI,
          mockLogger,
          requestId
        )
      ).rejects.toThrow();
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

    test('should push Helm values', async () => {
      const { getGitAuthConfigFromEnv, cloneRepo, pushRepo } = await import('../../../src/core/git-utils.js');
      vi.mocked(getGitAuthConfigFromEnv).mockReturnValue({ pat: 'test-token' });
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      vi.mocked(pushRepo).mockResolvedValue({
        branch: 'main',
        commitSha: 'abc123',
        filesAdded: ['apps/postgres/values.yaml'],
      });

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
      expect(pushRepo).toHaveBeenCalledWith(
        expect.any(String),
        [{ path: 'apps/postgres/values.yaml', content: expect.any(String) }],
        expect.stringContaining('helm'),
        { branch: 'main' }
      );
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
        { branch: 'main' }
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
});
