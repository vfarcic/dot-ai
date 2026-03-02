/**
 * Integration Test: Git Operations Tools
 *
 * Tests git_clone and git_push tools via REST API.
 * These tools require GIT_TOKEN or GitHub App authentication.
 *
 * PRD #362: Git Operations for Recommend Tool
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Git Operations Integration', () => {
  const integrationTest = new IntegrationTest();
  const hasGitAuth =
    !!process.env.GIT_TOKEN || process.env.GITHUB_APP_ENABLED === 'true';
  const testRepo = 'https://github.com/octocat/Hello-World.git';
  const testDir = './tmp/git-integration-test';

  beforeAll(async () => {
    // Clean up test directory if exists
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    // Create tmp directory
    if (!fs.existsSync('./tmp')) {
      fs.mkdirSync('./tmp', { recursive: true });
    }
  });

  afterAll(async () => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Tool Registration', () => {
    test('git_clone tool should be registered in MCP server', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/tools');

      expect(response.success).toBe(true);
      expect(response.data?.tools).toBeDefined();

      const gitCloneTool = response.data.tools.find(
        (t: any) => t.name === 'git_clone'
      );
      expect(gitCloneTool).toBeDefined();
      expect(gitCloneTool?.description).toContain('Clone a git repository');
    });

    test('git_push tool should be registered in MCP server', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/tools');

      expect(response.success).toBe(true);
      expect(response.data?.tools).toBeDefined();

      const gitPushTool = response.data.tools.find(
        (t: any) => t.name === 'git_push'
      );
      expect(gitPushTool).toBeDefined();
      expect(gitPushTool?.description).toContain(
        'Push files to a git repository'
      );
    });
  });

  // Skip git operations if no auth configured
  describe.skipIf(!hasGitAuth)('Git Clone Operations', () => {
    test('should clone a public repository', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          repoUrl: testRepo,
          targetDir: testDir,
          depth: 1,
        }
      );

      expect(response.success).toBe(true);
      expect(response.data?.result?.success).toBe(true);
      expect(response.data?.result?.localPath).toBe(testDir);

      // Verify repository was cloned
      expect(fs.existsSync(path.join(testDir, '.git'))).toBe(true);
    }, 60000);

    test('should clone specific branch', async () => {
      const branchTestDir = `${testDir}-branch`;

      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          repoUrl: testRepo,
          branch: 'main',
          targetDir: branchTestDir,
          depth: 1,
        }
      );

      expect(response.success).toBe(true);
      expect(response.data?.result?.success).toBe(true);
      expect(response.data?.result?.branch).toBe('main');

      // Cleanup
      if (fs.existsSync(branchTestDir)) {
        fs.rmSync(branchTestDir, { recursive: true, force: true });
      }
    }, 60000);

    test('should return error for invalid repository URL', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          repoUrl:
            'https://github.com/nonexistent/repo-that-does-not-exist.git',
          targetDir: `${testDir}-invalid`,
        }
      );

      expect(response.success).toBe(false);
      expect(response.data?.result?.success).toBe(false);
      expect(response.data?.result?.error).toBeDefined();
    }, 60000);
  });

  describe.skipIf(!hasGitAuth)('Git Push Operations', () => {
    test.skip('should push files to repository (requires test repo)', async () => {
      // This test is skipped by default as it requires:
      // 1. A test repository with write access
      // 2. GIT_TOKEN with push permissions
      //
      // To enable: set GIT_TOKEN and TEST_REPO_URL environment variables

      const testRepoUrl = process.env.TEST_REPO_URL;
      if (!testRepoUrl) {
        return;
      }

      // Clone first
      const cloneResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          repoUrl: testRepoUrl,
          targetDir: testDir,
        }
      );
      expect(cloneResponse.success).toBe(true);

      // Push a test file
      const pushResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/git_push',
        {
          repoPath: testDir,
          files: [
            {
              path: `test-file-${Date.now()}.txt`,
              content: `Test file created at ${new Date().toISOString()}`,
            },
          ],
          commitMessage: 'test: integration test file',
        }
      );

      expect(pushResponse.success).toBe(true);
      expect(pushResponse.data?.result?.success).toBe(true);
      expect(pushResponse.data?.result?.commitSha).toBeDefined();
    }, 120000);
  });

  describe('Error Handling', () => {
    test('should return error when no auth configured for clone', async () => {
      // This test only runs when no auth is configured
      if (hasGitAuth) {
        return;
      }

      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          repoUrl: testRepo,
          targetDir: testDir,
        }
      );

      expect(response.data?.result?.success).toBe(false);
      expect(response.data?.result?.error).toContain('authentication');
    });

    test('should validate required parameters for git_clone', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          // Missing repoUrl
          targetDir: testDir,
        }
      );

      expect(response.success).toBe(false);
    });

    test('should validate required parameters for git_push', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_push',
        {
          // Missing repoPath, files, commitMessage
        }
      );

      expect(response.success).toBe(false);
    });
  });
});
