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

  // Detect deployment mode based on MCP_BASE_URL
  const isInClusterMode = process.env.MCP_BASE_URL?.includes('nip.io') || false;

  // Exact list of all built-in prompts with their metadata
  const expectedPrompts = [
    { name: 'generate-cicd', description: 'Generate intelligent CI/CD workflows through interactive conversation by analyzing repository structure and user preferences' },
    { name: 'generate-dockerfile', description: 'Generate production-ready, secure, multi-stage Dockerfile and .dockerignore for any project' },
    { name: 'prd-close', description: 'Close a PRD that is already implemented or no longer needed' },
    { name: 'prd-create', description: 'Create documentation-first PRDs that guide development through user-facing content' },
    { name: 'prd-done', description: 'Complete PRD implementation workflow - create branch, push changes, create PR, merge, and close issue' },
    { name: 'prd-next', description: 'Analyze existing PRD to identify and recommend the single highest-priority task to work on next' },
    { name: 'prd-start', description: 'Start working on a PRD implementation' },
    { name: 'prd-update-decisions', description: 'Update PRD based on design decisions and strategic changes made during conversations' },
    { name: 'prd-update-progress', description: 'Update PRD progress based on git commits and code changes, enhanced by conversation context' },
    { name: 'prds-get', description: 'Fetch all open GitHub issues from this project that have the \'PRD\' label' },
  ];

  beforeAll(() => {
    // Verify we're using the test environment (either kubeconfig or in-cluster)
    if (!isInClusterMode) {
      const kubeconfig = process.env.KUBECONFIG;
      expect(kubeconfig).toContain('kubeconfig-test.yaml');
    }
  });

  describe.concurrent('Prompts List', () => {
    test('should return exactly 10 built-in prompts with correct metadata', async () => {
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
      expect(response.data.prompts).toHaveLength(10);
    });
  });

  describe.concurrent('Prompts Get', () => {
    // Test each prompt individually - run in parallel using concurrent
    test.concurrent.each(expectedPrompts)('should return prompt content for $name', async ({ name, description }) => {
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

  describe.concurrent('HTTP Method Validation', () => {
    test('should reject POST for prompts list endpoint', async () => {
      const response = await integrationTest.httpClient.post('/api/v1/prompts', {});

      const expectedErrorResponse = {
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only GET method allowed for prompts list'
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
          message: 'Only POST method allowed for prompt get'
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
