/**
 * Integration Test: Query Tool - Capability Tools (M2)
 *
 * Tests AI tool selection for cluster queries:
 * - Semantic queries use search_capabilities
 * - Filter queries use query_capabilities
 *
 * PRD #291: Cluster Query Tool - Natural Language Cluster Intelligence
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('Query Tool Integration - Capability Tools (M2)', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(() => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  test('should use search_capabilities for semantic query and find CNPG PostgreSQL', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/query',
      {
        intent: 'What databases can I deploy?',
        interaction_id: 'query_semantic_databases'
      }
    );

    // Test cluster has CNPG operator - semantic search should find PostgreSQL capabilities
    const expectedResponse = {
      success: true,
      data: {
        tool: 'query',
        executionTime: expect.any(Number),
        result: {
          success: true,
          summary: expect.stringMatching(/postgres|cnpg|database/i),
          toolsUsed: expect.arrayContaining(['search_capabilities'])
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    };

    expect(response).toMatchObject(expectedResponse);
    // Tool loop requires at least 2 iterations: process intent + generate response
    expect(response.data.result.iterations).toBeGreaterThanOrEqual(2);
  }, 300000);

  test('should use query_capabilities for filter query and find low complexity capabilities', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/query',
      {
        intent: 'Show me low complexity capabilities',
        interaction_id: 'query_filter_complexity'
      }
    );

    // Filter by complexity field should use query_capabilities with Qdrant filter
    const expectedResponse = {
      success: true,
      data: {
        tool: 'query',
        executionTime: expect.any(Number),
        result: {
          success: true,
          summary: expect.stringMatching(/low complexity|configmap|namespace/i),
          toolsUsed: expect.arrayContaining(['query_capabilities'])
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    };

    expect(response).toMatchObject(expectedResponse);
    // Tool loop requires at least 2 iterations: process intent + generate response
    expect(response.data.result.iterations).toBeGreaterThanOrEqual(2);
  }, 300000);
});
