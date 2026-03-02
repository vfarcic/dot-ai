/**
 * Unit tests for Git Operations (PRD #362)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GitOperations,
  getGitAuthConfigFromEnv,
  resetGitOperations,
} from '../../../src/core/git-utils';

vi.mock('simple-git', () => {
  const mockGit = {
    clone: vi.fn(),
    checkout: vi.fn(),
    checkoutLocalBranch: vi.fn(),
    branchLocal: vi.fn(),
    add: vi.fn(),
    commit: vi.fn().mockResolvedValue({ commit: 'abc123' }),
    push: vi.fn(),
    status: vi.fn().mockResolvedValue({ current: 'main' }),
    getRemotes: vi
      .fn()
      .mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/org/repo.git' } },
      ]),
    remote: vi.fn(),
    addConfig: vi.fn(),
  };

  return {
    default: vi.fn(() => mockGit),
  };
});

describe('GitOperations', () => {
  let gitOps: GitOperations;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGitOperations();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with PAT auth', () => {
      gitOps = new GitOperations({ pat: 'test-token' });
      expect(gitOps).toBeDefined();
    });

    it('should create instance with GitHub App auth', () => {
      gitOps = new GitOperations({
        githubApp: {
          appId: '12345',
          privateKey:
            '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
        },
      });
      expect(gitOps).toBeDefined();
    });
  });

  describe('clone', () => {
    it('should clone repository with PAT', async () => {
      gitOps = new GitOperations({ pat: 'test-token' });

      const result = await gitOps.clone({
        repoUrl: 'https://github.com/org/repo.git',
        branch: 'main',
      });

      expect(result).toBeDefined();
    });

    it('should return error when no auth configured', async () => {
      gitOps = new GitOperations({});

      const result = await gitOps.clone({
        repoUrl: 'https://github.com/org/repo.git',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No authentication method');
    });
  });

  describe('push', () => {
    it('should push files to repository', async () => {
      gitOps = new GitOperations({ pat: 'test-token' });

      const result = await gitOps.push({
        repoPath: '/tmp/test-repo',
        files: [
          { path: 'test.yaml', content: 'apiVersion: v1\nkind: ConfigMap' },
        ],
        commitMessage: 'Add test file',
      });

      expect(result).toBeDefined();
    });

    it('should push with custom author', async () => {
      gitOps = new GitOperations({ pat: 'test-token' });

      const result = await gitOps.push({
        repoPath: '/tmp/test-repo',
        files: [{ path: 'test.yaml', content: 'test' }],
        commitMessage: 'Add test file',
        author: {
          name: 'Test User',
          email: 'test@example.com',
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('static methods', () => {
    it('isRepo should return false for non-existent path', () => {
      expect(GitOperations.isRepo('/non/existent/path')).toBe(false);
    });
  });
});

describe('getGitAuthConfigFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return PAT from environment', () => {
    process.env.GIT_TOKEN = 'test-pat-token';

    const config = getGitAuthConfigFromEnv();

    expect(config.pat).toBe('test-pat-token');
  });

  it('should return GitHub App config from environment', () => {
    process.env.GITHUB_APP_ENABLED = 'true';
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY =
      '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';
    process.env.GITHUB_APP_INSTALLATION_ID = '67890';
    delete process.env.GIT_TOKEN;

    const config = getGitAuthConfigFromEnv();

    expect(config.githubApp).toBeDefined();
    expect(config.githubApp?.appId).toBe('12345');
    expect(config.githubApp?.installationId).toBe('67890');
  });

  it('should throw error when GitHub App enabled but missing config', () => {
    process.env.GITHUB_APP_ENABLED = 'true';
    process.env.GITHUB_APP_ID = '';
    process.env.GITHUB_APP_PRIVATE_KEY = '';
    delete process.env.GIT_TOKEN;

    expect(() => getGitAuthConfigFromEnv()).toThrow('GitHub App enabled but');
  });

  it('should return empty config when no auth configured', () => {
    delete process.env.GIT_TOKEN;
    delete process.env.GITHUB_APP_ENABLED;

    const config = getGitAuthConfigFromEnv();

    expect(config).toEqual({});
  });
});
