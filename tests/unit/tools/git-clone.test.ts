/**
 * Unit tests for git-clone tool (PRD #362)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleGitCloneTool,
  GIT_CLONE_TOOL_NAME,
  GIT_CLONE_TOOL_DESCRIPTION,
} from '../../../src/tools/git-clone';
import { resetGitOperations } from '../../../src/core/git-utils';

vi.mock('../../../src/core/git-utils', () => ({
  getGitOperations: vi.fn(() => ({
    clone: vi.fn().mockResolvedValue({
      success: true,
      localPath: '/tmp/test-repo',
      branch: 'main',
    }),
  })),
  resetGitOperations: vi.fn(),
}));

describe('git-clone tool', () => {
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
      expect(GIT_CLONE_TOOL_NAME).toBe('git_clone');
    });

    it('should have description', () => {
      expect(GIT_CLONE_TOOL_DESCRIPTION).toContain('Clone a git repository');
    });
  });

  describe('handleGitCloneTool', () => {
    it('should clone repository successfully', async () => {
      const result = await handleGitCloneTool(
        {
          repoUrl: 'https://github.com/org/repo.git',
          branch: 'main',
        },
        mockLogger as any,
        'test-request-id'
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const output = JSON.parse(result.content[0].text);
      expect(output.success).toBe(true);
      expect(output.localPath).toBe('/tmp/test-repo');
      expect(output.branch).toBe('main');
    });

    it('should accept optional parameters', async () => {
      const result = await handleGitCloneTool(
        {
          repoUrl: 'https://github.com/org/repo.git',
          branch: 'develop',
          targetDir: '/custom/path',
          depth: 1,
        },
        mockLogger as any,
        'test-request-id'
      );

      expect(result.content).toHaveLength(1);
    });
  });
});
