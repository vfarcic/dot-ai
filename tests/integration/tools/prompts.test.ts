/**
 * Integration Test: Prompts
 *
 * Tests the prompts REST API endpoints against a real test cluster.
 * Validates prompts list and get functionality with exact data validation.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('Prompts Integration', () => {
  const integrationTest = new IntegrationTest();

  // Detect deployment mode based on MCP_BASE_URL (parse hostname to avoid substring matching issues)
  const isInClusterMode = (() => {
    try {
      const url = new URL(process.env.MCP_BASE_URL || '');
      return url.hostname.endsWith('.nip.io') || url.hostname === 'nip.io';
    } catch {
      return false;
    }
  })();

  // Exact list of all built-in prompts with their metadata
  const expectedBuiltInPrompts = [
    { name: 'generate-cicd', description: 'Generate intelligent CI/CD workflows through interactive conversation by analyzing repository structure and user preferences' },
    { name: 'generate-dockerfile', description: 'Generate production-ready, secure, multi-stage Dockerfile and .dockerignore for any project' },
    { name: 'prd-close', description: 'Close a PRD that is already implemented or no longer needed' },
    { name: 'prd-create', description: 'Create documentation-first PRDs that guide development through user-facing content' },
    { name: 'prd-done', description: 'Complete PRD implementation workflow - create branch, push changes, create PR, merge, and close issue' },
    { name: 'prd-next', description: 'Analyze existing PRD to identify and recommend the single highest-priority task to work on next' },
    {
      name: 'prd-start',
      description: 'Start working on a PRD implementation',
      arguments: [
        { name: 'prdNumber', description: 'PRD number to start working on (e.g., 306)', required: false }
      ]
    },
    { name: 'prd-update-decisions', description: 'Update PRD based on design decisions and strategic changes made during conversations' },
    { name: 'prd-update-progress', description: 'Update PRD progress based on git commits and code changes, enhanced by conversation context' },
    { name: 'prds-get', description: 'Fetch all open GitHub issues from this project that have the \'PRD\' label' },
  ];

  // User prompts loaded from git repository (user-prompts/ directory)
  const expectedUserPrompts = [
    { name: 'eval-analyze-test-failure', description: 'Analyze Test Failure' },
    {
      name: 'eval-run',
      description: 'Run AI Model Evaluations',
      arguments: [
        { name: 'toolType', description: 'Evaluation type (capabilities, policies, patterns, remediation, recommendation)', required: false },
        { name: 'models', description: 'Comma-separated list of models (sonnet, gpt, gemini, gemini-flash, grok)', required: false }
      ]
    },
    { name: 'eval-update-model-metadata', description: 'Update Model Metadata Command' },
  ];

  // Combined list of all prompts (built-in + user)
  const expectedPrompts = [...expectedBuiltInPrompts, ...expectedUserPrompts];

  beforeAll(async () => {
    // Verify we're using the test environment (either kubeconfig or in-cluster)
    if (!isInClusterMode) {
      const kubeconfig = process.env.KUBECONFIG;
      expect(kubeconfig).toContain('kubeconfig-test.yaml');
    }

    // Warm-up: Make a single prompts request to ensure git clone completes
    // before running tests. This prevents race conditions when user prompts
    // are loaded from a git repository.
    await integrationTest.httpClient.get('/api/v1/prompts');
  });

  describe('Prompts List', () => {
    test('should return 10 built-in prompts + 3 user prompts with correct metadata', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/prompts');

      const expectedListResponse = {
        success: true,
        data: {
          prompts: expect.arrayContaining(
            expectedPrompts.map(p => expect.objectContaining(p))
          )
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(response).toMatchObject(expectedListResponse);
      // At least 10 built-in + 3 user prompts from git repository
      expect(response.data.prompts.length).toBeGreaterThanOrEqual(13);
    });
  });

  describe('Prompts Get', () => {
    // Test each prompt individually
    test.each(expectedPrompts)('should return prompt content for $name', async ({ name, description }) => {
      const response = await integrationTest.httpClient.post(`/api/v1/prompts/${name}`, {});

      const expectedGetResponse = {
        success: true,
        data: {
          description: description,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: expect.any(String)
              }
            }
          ]
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(response).toMatchObject(expectedGetResponse);
      // Verify content is non-empty
      expect(response.data.messages[0].content.text.length).toBeGreaterThan(100);
    });

    test('should return error for non-existent prompt', async () => {
      const response = await integrationTest.httpClient.post('/api/v1/prompts/non-existent-prompt', {});

      const expectedErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt not found: non-existent-prompt'
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(response).toMatchObject(expectedErrorResponse);
    });
  });

  describe('Prompt Arguments', () => {
    test('should return prd-start with arguments metadata in list', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/prompts');

      const prdStartPrompt = response.data.prompts.find((p: { name: string }) => p.name === 'prd-start');
      expect(prdStartPrompt).toBeDefined();
      expect(prdStartPrompt.arguments).toEqual([
        { name: 'prdNumber', description: 'PRD number to start working on (e.g., 306)', required: false }
      ]);
    });

    test('should return prd-start content without argument (placeholder remains)', async () => {
      const response = await integrationTest.httpClient.post('/api/v1/prompts/prd-start', {});

      expect(response.success).toBe(true);
      // Without argument, the placeholder should remain in the content
      expect(response.data.messages[0].content.text).toContain('{{prdNumber}}');
    });

    test('should substitute argument when provided to prd-start', async () => {
      const response = await integrationTest.httpClient.post('/api/v1/prompts/prd-start', {
        arguments: { prdNumber: '306' }
      });

      expect(response.success).toBe(true);
      // With argument, the placeholder should be substituted
      expect(response.data.messages[0].content.text).not.toContain('{{prdNumber}}');
      expect(response.data.messages[0].content.text).toContain('306');
    });
  });

  describe('Prompts Cache Refresh', () => {
    const gitToken = process.env.DOT_AI_GIT_TOKEN;
    const testRunId = Date.now();
    const testPromptName = `test-cache-refresh-${testRunId}`;
    const testPromptPath = `user-prompts/${testPromptName}.md`;
    const testPromptContent = [
      '---',
      `name: ${testPromptName}`,
      'description: Temporary prompt for cache refresh integration test',
      '---',
      '',
      'This is a temporary prompt used by integration tests. If you see this file, it was not cleaned up properly.',
    ].join('\n');

    // GitHub API helper to create a file in the test-prompts repo
    async function createFileInRepo(): Promise<string> {
      const res = await fetch(
        `https://api.github.com/repos/vfarcic/dot-ai-test-prompts/contents/${testPromptPath}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${gitToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'test: add temporary prompt for cache refresh test',
            content: Buffer.from(testPromptContent).toString('base64'),
          }),
        }
      );
      expect(res.ok).toBe(true);
      const data = await res.json();
      return data.content.sha;
    }

    // GitHub API helper to delete a file from the test-prompts repo
    async function deleteFileFromRepo(sha: string): Promise<void> {
      await fetch(
        `https://api.github.com/repos/vfarcic/dot-ai-test-prompts/contents/${testPromptPath}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `token ${gitToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'test: remove temporary prompt for cache refresh test',
            sha,
          }),
        }
      );
      expect(res.ok).toBe(true);
    }

    test('should refresh cache and pick up new prompts from repository', async () => {
      // Skip if no git token (can only test with write access to test-prompts repo)
      if (!gitToken) {
        console.log('Skipping cache refresh test: DOT_AI_GIT_TOKEN not set');
        return;
      }

      let fileSha: string | undefined;

      try {
        // Step 1: Record initial prompt count
        const initialList = await integrationTest.httpClient.get('/api/v1/prompts');
        expect(initialList).toMatchObject({ success: true });
        const initialCount = initialList.data.prompts.length;

        // Step 2: Push a new prompt to the repo
        fileSha = await createFileInRepo();

        // Step 3: Verify list still returns cached (old) count
        const cachedList = await integrationTest.httpClient.get('/api/v1/prompts');
        expect(cachedList.data.prompts.length).toBe(initialCount);

        // Step 4: Call refresh
        const refreshResponse = await integrationTest.httpClient.post('/api/v1/prompts/refresh', {});
        expect(refreshResponse).toMatchObject({
          success: true,
          data: {
            refreshed: true,
            promptsLoaded: expect.any(Number),
            source: expect.stringMatching(/^built-in(\+repository)?$/),
          },
          meta: {
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
            requestId: expect.stringMatching(/^rest_\d+_\d+$/),
            version: 'v1'
          }
        });

        // Step 5: Verify list now includes the new prompt
        const refreshedList = await integrationTest.httpClient.get('/api/v1/prompts');
        expect(refreshedList.data.prompts.length).toBe(initialCount + 1);
        const newPrompt = refreshedList.data.prompts.find(
          (p: { name: string }) => p.name === testPromptName
        );
        expect(newPrompt).toMatchObject({
          name: testPromptName,
          description: 'Temporary prompt for cache refresh integration test',
        });
      } finally {
        // Step 6: Always clean up — remove the test prompt from the repo
        if (fileSha) {
          await deleteFileFromRepo(fileSha);
          // Refresh again to restore the server cache to clean state
          await integrationTest.httpClient.post('/api/v1/prompts/refresh', {});
        }
      }
    }, 300000);

    test('should reject GET method for refresh endpoint', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/prompts/refresh');

      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: expect.stringContaining('Only POST method allowed'),
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      });
    });
  });

  describe('HTTP Method Validation', () => {
    test('should reject POST for prompts list endpoint', async () => {
      const response = await integrationTest.httpClient.post('/api/v1/prompts', {});

      const expectedErrorResponse = {
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: expect.stringContaining('Only GET method allowed'),
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(response).toMatchObject(expectedErrorResponse);
    });

    test('should reject GET for prompt get endpoint', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/prompts/generate-dockerfile');

      const expectedErrorResponse = {
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: expect.stringContaining('Only POST method allowed'),
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(response).toMatchObject(expectedErrorResponse);
    });
  });
});
