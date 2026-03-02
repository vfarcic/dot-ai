/**
 * Unit tests for git-push tool (PRD #362)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleGitPushTool,
  GIT_PUSH_TOOL_NAME,
  GIT_PUSH_TOOL_DESCRIPTION,
} from '../../../src/tools/git-push';

vi.mock('../../../src/core/git-utils', () => ({
  getGitOperations: vi.fn(() => ({
    push: vi.fn().mockResolvedValue({
      success: true,
      commitSha: 'abc123def456',
      branch: 'main',
      filesAdded: ['apps/deployment.yaml', 'apps/service.yaml'],
    }),
  })),
  resetGitOperations: vi.fn(),
}));

describe('git-push tool', () => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('metadata', () => {
    it('should have correct tool name', () => {
      expect(GIT_PUSH_TOOL_NAME).toBe('git_push');
    });

    it('should have description', () => {
      expect(GIT_PUSH_TOOL_DESCRIPTION).toContain(
        'Push files to a git repository'
      );
    });
  });

  describe('handleGitPushTool', () => {
    it('should push files successfully', async () => {
      const result = await handleGitPushTool(
        {
          repoPath: '/tmp/test-repo',
          files: [
            {
              path: 'apps/deployment.yaml',
              content: 'apiVersion: apps/v1\nkind: Deployment',
            },
            {
              path: 'apps/service.yaml',
              content: 'apiVersion: v1\nkind: Service',
            },
          ],
          commitMessage: 'Add deployment manifests',
        },
        mockLogger as any,
        'test-request-id'
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.commitSha).toBe('abc123def456');
      expect(output.branch).toBe('main');
      expect(output.filesAdded).toHaveLength(2);
    });

    it('should accept optional author parameter', async () => {
      const result = await handleGitPushTool(
        {
          repoPath: '/tmp/test-repo',
          files: [{ path: 'test.yaml', content: 'test' }],
          commitMessage: 'Test commit',
          author: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
        mockLogger as any,
        'test-request-id'
      );

      expect(result.content).toHaveLength(1);
    });

    it('should accept optional branch parameter', async () => {
      const result = await handleGitPushTool(
        {
          repoPath: '/tmp/test-repo',
          files: [{ path: 'test.yaml', content: 'test' }],
          commitMessage: 'Test commit',
          branch: 'feature/test',
        },
        mockLogger as any,
        'test-request-id'
      );

      expect(result.content).toHaveLength(1);
    });
  });
});
