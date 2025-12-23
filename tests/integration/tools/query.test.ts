/**
 * Integration Test: Query Tool
 *
 * Tests AI tool selection for cluster queries:
 * - M2: Capability tools (search_capabilities, query_capabilities)
 * - M3: Resource tools (search_resources, query_resources)
 *
 * PRD #291: Cluster Query Tool - Natural Language Cluster Intelligence
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import { execSync } from 'child_process';

describe.concurrent('Query Tool Integration', () => {
  const integrationTest = new IntegrationTest();
  const testNamespace = 'query-tool-test';

  beforeAll(async () => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');

    // M3: Create dedicated namespace and resources for query tool tests
    // This prepares for M4 kubectl tools while testing M3 resource tools

    // Create test namespace
    try {
      execSync(`kubectl create namespace ${testNamespace}`, {
        env: { ...process.env, KUBECONFIG: kubeconfig },
        stdio: 'pipe'
      });
    } catch (e) {
      // Ignore if already exists
    }

    // Create CNPG PostgreSQL cluster in K8s
    const cnpgClusterYaml = `
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: test-pg-cluster
  namespace: ${testNamespace}
  labels:
    app: postgresql
    team: platform
    environment: test
spec:
  instances: 1
  storage:
    size: 1Gi
`;
    try {
      execSync(`echo '${cnpgClusterYaml}' | kubectl apply -f -`, {
        env: { ...process.env, KUBECONFIG: kubeconfig },
        stdio: 'pipe'
      });
    } catch (e) {
      // Ignore if CNPG CRD not ready
    }

    // Sync resources to Qdrant for Vector DB queries
    await integrationTest.httpClient.post('/api/v1/resources/sync', {
      upserts: [
        {
          namespace: testNamespace,
          name: 'test-pg-cluster',
          kind: 'Cluster',
          apiVersion: 'postgresql.cnpg.io/v1',
          apiGroup: 'postgresql.cnpg.io',
          labels: {
            app: 'postgresql',
            team: 'platform',
            environment: 'test'
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          namespace: testNamespace,
          name: 'test-web-deployment',
          kind: 'Deployment',
          apiVersion: 'apps/v1',
          apiGroup: 'apps',
          labels: {
            app: 'nginx',
            tier: 'frontend',
            environment: 'test'
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      deletes: [],
      isResync: false
    });
  });

  // M2: Capability Tools
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
    expect(response.data.result.iterations).toBeGreaterThanOrEqual(2);
  }, 300000);

  // M3: Resource Tools
  test('should use search_resources for name-based resource search', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/query',
      {
        intent: 'Search the resource inventory for anything with postgres in the name',
        interaction_id: 'query_search_resources_postgres'
      }
    );

    // Name-based search should use search_resources and find our test CNPG cluster
    const expectedResponse = {
      success: true,
      data: {
        tool: 'query',
        executionTime: expect.any(Number),
        result: {
          success: true,
          summary: expect.stringMatching(/test-pg-cluster|postgres/i),
          toolsUsed: ['search_resources']
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    };

    expect(response).toMatchObject(expectedResponse);
    expect(response.data.result.iterations).toBeGreaterThanOrEqual(2);
  }, 300000);

  test('should use query_resources for label-based resource filter', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/query',
      {
        intent: 'Query the resource inventory for resources with label team=platform',
        interaction_id: 'query_filter_resources_label'
      }
    );

    // Label filter should use query_resources and find the PostgreSQL cluster with team=platform
    const expectedResponse = {
      success: true,
      data: {
        tool: 'query',
        executionTime: expect.any(Number),
        result: {
          success: true,
          summary: expect.stringMatching(/test-pg-cluster|team.*platform|platform/i),
          toolsUsed: ['query_resources']
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    };

    expect(response).toMatchObject(expectedResponse);
    expect(response.data.result.iterations).toBeGreaterThanOrEqual(2);
  }, 300000);
});
