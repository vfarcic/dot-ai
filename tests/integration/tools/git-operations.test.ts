/**
 * Integration Test: Git Operations Tools
 *
 * Tests git_clone and git_push tools via REST API.
 * These tools require DOT_AI_GIT_TOKEN or GitHub App authentication.
 *
 * PRD #362: Git Operations for Recommend Tool
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import * as fs from 'fs';
import * as path from 'path';

interface Tool {
  name: string;
  description: string;
}

const integrationTest = new IntegrationTest();
const hasGitAuth =
  !!process.env.DOT_AI_GIT_TOKEN || process.env.GITHUB_APP_ENABLED === 'true';
const testRepo = 'https://github.com/octocat/Hello-World.git';

describe.concurrent('Git Operations Integration', () => {
  beforeAll(async () => {
    if (!fs.existsSync('./tmp')) {
      fs.mkdirSync('./tmp', { recursive: true });
    }
  });

  describe.concurrent('Tool Registration', () => {
    test('git_clone tool should be registered in MCP server', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/tools');

      expect(response).toMatchObject({
        success: true,
        data: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'git_clone',
              description: expect.stringContaining('Clone a git repository'),
            }),
          ]),
        }),
      });
    });

    test('git_push tool should be registered in MCP server', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/tools');

      expect(response).toMatchObject({
        success: true,
        data: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'git_push',
              description: expect.stringContaining(
                'Push files to a git repository'
              ),
            }),
          ]),
        }),
      });
    });
  });

  describe.concurrent.skipIf(!hasGitAuth)('Git Clone Operations', () => {
    test('should clone a public repository', async () => {
      const testDir = `./tmp/git-clone-${Date.now()}`;

      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          repoUrl: testRepo,
          targetDir: testDir,
          depth: 1,
        }
      );

      expect(response).toMatchObject({
        success: true,
        data: expect.objectContaining({
          result: expect.objectContaining({
            success: true,
            localPath: testDir,
          }),
        }),
      });

      expect(fs.existsSync(path.join(testDir, '.git'))).toBe(true);

      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    }, 60000);

    test('should clone specific branch', async () => {
      const branchTestDir = `./tmp/git-branch-${Date.now()}`;

      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          repoUrl: testRepo,
          branch: 'main',
          targetDir: branchTestDir,
          depth: 1,
        }
      );

      expect(response).toMatchObject({
        success: true,
        data: expect.objectContaining({
          result: expect.objectContaining({
            success: true,
            branch: 'main',
          }),
        }),
      });

      if (fs.existsSync(branchTestDir)) {
        fs.rmSync(branchTestDir, { recursive: true, force: true });
      }
    }, 60000);

    test('should return error for invalid repository URL', async () => {
      const invalidDir = `./tmp/git-invalid-${Date.now()}`;

      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          repoUrl:
            'https://github.com/nonexistent/repo-that-does-not-exist.git',
          targetDir: invalidDir,
        }
      );

      expect(response).toMatchObject({
        success: false,
        data: expect.objectContaining({
          result: expect.objectContaining({
            success: false,
            error: expect.any(String),
          }),
        }),
      });
    }, 60000);
  });

  describe.concurrent.skipIf(!hasGitAuth)('Git Push Operations', () => {
    test.skipIf(!process.env.TEST_REPO_URL)(
      'should push files to repository (requires test repo)',
      async () => {
        const testRepoUrl = process.env.TEST_REPO_URL!;
        const testPushDir = `./tmp/git-push-${Date.now()}`;

        const cloneResponse = await integrationTest.httpClient.post(
          '/api/v1/tools/git_clone',
          {
            repoUrl: testRepoUrl,
            targetDir: testPushDir,
          }
        );
        expect(cloneResponse).toMatchObject({
          success: true,
          data: expect.objectContaining({
            result: expect.objectContaining({
              success: true,
            }),
          }),
        });

        const pushResponse = await integrationTest.httpClient.post(
          '/api/v1/tools/git_push',
          {
            repoPath: testPushDir,
            files: [
              {
                path: `test-file-${Date.now()}.txt`,
                content: `Test file created at ${new Date().toISOString()}`,
              },
            ],
            commitMessage: 'test: integration test file',
          }
        );

        expect(pushResponse).toMatchObject({
          success: true,
          data: expect.objectContaining({
            result: expect.objectContaining({
              success: true,
              commitSha: expect.any(String),
            }),
          }),
        });

        if (fs.existsSync(testPushDir)) {
          fs.rmSync(testPushDir, { recursive: true, force: true });
        }
      },
      120000
    );
  });

  describe.concurrent('Error Handling', () => {
    test('should return error when no auth configured for clone', async () => {
      if (hasGitAuth) {
        return;
      }

      const testDir = `./tmp/git-noauth-${Date.now()}`;
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          repoUrl: testRepo,
          targetDir: testDir,
        }
      );

      expect(response).toMatchObject({
        data: expect.objectContaining({
          result: expect.objectContaining({
            success: false,
            error: expect.stringContaining('authentication'),
          }),
        }),
      });
    });

    test('should validate required parameters for git_clone', async () => {
      const testDir = `./tmp/git-validate-${Date.now()}`;
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_clone',
        {
          targetDir: testDir,
        }
      );

      expect(response).toMatchObject({
        success: false,
      });
    });

    test('should validate required parameters for git_push', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/git_push',
        {}
      );

      expect(response).toMatchObject({
        success: false,
      });
    });
  });
});
