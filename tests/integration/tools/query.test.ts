/**
 * Integration Test: Query Tool
 *
 * Tests AI tool selection for cluster queries:
 * - M2: Capability tools (search_capabilities, query_capabilities)
 * - M3: Resource tools (search_resources, query_resources)
 * - M4: Kubectl tools (kubectl_get, kubectl_describe, etc.)
 * - M5: Full semantic bridge (capabilities → resources → kubectl) + error handling
 *
 * PRD #291: Cluster Query Tool - Natural Language Cluster Intelligence
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import { execSync } from 'child_process';

describe.concurrent('Query Tool Integration', () => {
  const integrationTest = new IntegrationTest();
  const testNamespace = 'query-tool-test';

  beforeAll(async () => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');

    // Clean up any leftover resources from previous runs to avoid interference
    try {
      await integrationTest.httpClient.post('/api/v1/resources/sync', {
        upserts: [],
        deletes: [
          { namespace: testNamespace, name: 'test-pg-cluster', kind: 'Cluster', apiVersion: 'postgresql.cnpg.io/v1' },
          { namespace: testNamespace, name: 'test-web-deployment', kind: 'Deployment', apiVersion: 'apps/v1' }
        ],
        isResync: false
      });
    } catch {
      // Ignore errors if resources don't exist
    }

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

  // Clean up resources synced to Qdrant to avoid interference with other tests
  afterAll(async () => {
    await integrationTest.httpClient.post('/api/v1/resources/sync', {
      upserts: [],
      deletes: [
        { namespace: testNamespace, name: 'test-pg-cluster', kind: 'Cluster', apiVersion: 'postgresql.cnpg.io/v1' },
        { namespace: testNamespace, name: 'test-web-deployment', kind: 'Deployment', apiVersion: 'apps/v1' }
      ],
      isResync: false
    });
  });

  // M2: Capability Tools + PRD #317: Visualization Endpoint
  test('should use search_capabilities for semantic query, return session, and visualization endpoint returns matching data', async () => {
    const queryIntent = 'What databases can I deploy?';

    // Step 1: Execute query
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/query',
      {
        intent: queryIntent,
        interaction_id: 'query_semantic_databases'
      }
    );

    // Test cluster has CNPG operator - semantic search should find PostgreSQL capabilities
    // PRD #317: Query tool now stores session for visualization - sessionId and visualizationUrl returned
    const expectedResponse = {
      success: true,
      data: {
        tool: 'query',
        executionTime: expect.any(Number),
        result: {
          success: true,
          summary: expect.stringMatching(/postgres|cnpg|database/i),
          toolsUsed: expect.arrayContaining(['search_capabilities']),
          sessionId: expect.stringMatching(/^qry-\d+-[a-f0-9]+$/),
          visualizationUrl: expect.stringMatching(/^https:\/\/dot-ai-ui\.test\.local\/v\/qry-\d+-[a-f0-9]+$/),
          guidance: 'Present the summary to the user. Include the visualizationUrl at the end of your response.'
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

    // NOTE: Visualization endpoint is tested in version.test.ts (fastest tool)
    // This test only verifies visualizationUrl is returned
  }, 180000);

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
          toolsUsed: expect.arrayContaining(['query_capabilities']),
          sessionId: expect.stringMatching(/^qry-\d+-[a-f0-9]+$/),
          visualizationUrl: expect.stringMatching(/^https:\/\/dot-ai-ui\.test\.local\/v\/qry-\d+-[a-f0-9]+$/),
          guidance: 'Present the summary to the user. Include the visualizationUrl at the end of your response.'
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
          toolsUsed: expect.arrayContaining(['search_resources']),
          sessionId: expect.stringMatching(/^qry-\d+-[a-f0-9]+$/),
          visualizationUrl: expect.stringMatching(/^https:\/\/dot-ai-ui\.test\.local\/v\/qry-\d+-[a-f0-9]+$/),
          guidance: 'Present the summary to the user. Include the visualizationUrl at the end of your response.'
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
          toolsUsed: expect.arrayContaining(['query_resources']),
          sessionId: expect.stringMatching(/^qry-\d+-[a-f0-9]+$/),
          visualizationUrl: expect.stringMatching(/^https:\/\/dot-ai-ui\.test\.local\/v\/qry-\d+-[a-f0-9]+$/),
          guidance: 'Present the summary to the user. Include the visualizationUrl at the end of your response.'
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

  // M5: Full Semantic Bridge Pattern (capabilities → resources → kubectl)
  test('should use all 3 tool types: capabilities for meaning, resources for inventory, kubectl for live status', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/query',
      {
        intent: 'Find all database-related resources in the cluster and check their current status',
        interaction_id: 'query_semantic_bridge_full'
      }
    );

    // Full semantic bridge should:
    // 1. Use search_capabilities to understand what "database" means (StatefulSet, CNPG Cluster, etc.)
    // 2. Use query_resources or search_resources to find instances in inventory
    // 3. Use kubectl_get or kubectl_describe to check live status
    const expectedResponse = {
      success: true,
      data: {
        tool: 'query',
        executionTime: expect.any(Number),
        result: {
          success: true,
          // Summary should mention actual resources and status
          summary: expect.stringMatching(/test-pg-cluster|postgres|database|cluster|status/i),
          toolsUsed: expect.any(Array),
          sessionId: expect.stringMatching(/^qry-\d+-[a-f0-9]+$/),
          visualizationUrl: expect.stringMatching(/^https:\/\/dot-ai-ui\.test\.local\/v\/qry-\d+-[a-f0-9]+$/),
          guidance: 'Present the summary to the user. Include the visualizationUrl at the end of your response.'
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    };

    expect(response).toMatchObject(expectedResponse);

    // Validate full semantic bridge: must use all 3 tool types
    const toolsUsed = response.data.result.toolsUsed as string[];

    const usedCapabilityTool = toolsUsed.some(t =>
      t === 'search_capabilities' || t === 'query_capabilities'
    );
    const usedResourceTool = toolsUsed.some(t =>
      t === 'search_resources' || t === 'query_resources'
    );
    const usedKubectlTool = toolsUsed.some(t =>
      t.startsWith('kubectl_')
    );

    expect(usedCapabilityTool).toBe(true);
    expect(usedResourceTool).toBe(true);
    expect(usedKubectlTool).toBe(true);

    // Multiple iterations required for full bridge pattern
    expect(response.data.result.iterations).toBeGreaterThanOrEqual(3);
  }, 300000);

  // M4: Kubectl Tools
  test('should use kubectl_get for live cluster status query', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/query',
      {
        intent: `Get the pods in the ${testNamespace} namespace`,
        interaction_id: 'query_kubectl_get_pods'
      }
    );

    // Direct namespace query should use kubectl_get for live status
    const expectedResponse = {
      success: true,
      data: {
        tool: 'query',
        executionTime: expect.any(Number),
        result: {
          success: true,
          summary: expect.any(String),
          toolsUsed: expect.arrayContaining(['kubectl_get']),
          sessionId: expect.stringMatching(/^qry-\d+-[a-f0-9]+$/),
          visualizationUrl: expect.stringMatching(/^https:\/\/dot-ai-ui\.test\.local\/v\/qry-\d+-[a-f0-9]+$/),
          guidance: 'Present the summary to the user. Include the visualizationUrl at the end of your response.'
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    };

    expect(response).toMatchObject(expectedResponse);
  }, 300000);

  // M5: Error Handling
  test('should return error for missing intent', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/query',
      {
        // Missing intent parameter
        interaction_id: 'query_error_missing_intent'
      }
    );

    // Validation errors return success: false with actual error message
    const expectedResponse = {
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: expect.stringContaining('Intent is required')
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    };

    expect(response).toMatchObject(expectedResponse);
  }, 30000);

  // PRD #317: Visualization endpoint error handling
  test('should return 404 for non-existent session in visualization endpoint', async () => {
    const nonExistentSessionId = 'qry-9999999999-nonexistent';

    const response = await integrationTest.httpClient.get(
      `/api/v1/visualize/${nonExistentSessionId}`
    );

    const expectedResponse = {
      success: false,
      error: {
        code: 'SESSION_NOT_FOUND',
        message: `Session '${nonExistentSessionId}' not found or has expired`
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    };

    expect(response).toMatchObject(expectedResponse);
  }, 30000);

  // PRD #328: GET /api/v1/resources/kinds
  test('GET /api/v1/resources/kinds should return resource kinds with counts', async () => {
    const response = await integrationTest.httpClient.get('/api/v1/resources/kinds');

    expect(response).toMatchObject({
      success: true,
      data: {
        kinds: expect.arrayContaining([
          { kind: 'Deployment', apiGroup: 'apps', apiVersion: 'apps/v1', count: 1 },
          { kind: 'Cluster', apiGroup: 'postgresql.cnpg.io', apiVersion: 'postgresql.cnpg.io/v1', count: 1 }
        ])
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });

    // Kinds should be sorted by count descending
    const kinds = response.data.kinds as Array<{ count: number }>;
    for (let i = 1; i < kinds.length; i++) {
      expect(kinds[i - 1].count).toBeGreaterThanOrEqual(kinds[i].count);
    }
  }, 30000);

  // PRD #328: GET /api/v1/resources/kinds with namespace filter
  test('GET /api/v1/resources/kinds?namespace=query-tool-test should return only kinds in that namespace', async () => {
    const response = await integrationTest.httpClient.get(`/api/v1/resources/kinds?namespace=${testNamespace}`);

    expect(response).toMatchObject({
      success: true,
      data: {
        kinds: expect.arrayContaining([
          { kind: 'Deployment', apiGroup: 'apps', apiVersion: 'apps/v1', count: 1 },
          { kind: 'Cluster', apiGroup: 'postgresql.cnpg.io', apiVersion: 'postgresql.cnpg.io/v1', count: 1 }
        ])
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });

    // Should only have 2 kinds in this namespace
    expect(response.data.kinds.length).toBe(2);
  }, 30000);

  // PRD #328: GET /api/v1/resources with kind and apiVersion filter
  test('GET /api/v1/resources?kind=Deployment&apiVersion=apps/v1 should return test-web-deployment', async () => {
    const response = await integrationTest.httpClient.get('/api/v1/resources?kind=Deployment&apiVersion=apps/v1');

    expect(response).toMatchObject({
      success: true,
      data: {
        resources: [
          {
            name: 'test-web-deployment',
            namespace: testNamespace,
            kind: 'Deployment',
            apiGroup: 'apps',
            apiVersion: 'apps/v1',
            labels: { app: 'nginx', tier: 'frontend', environment: 'test' }
          }
        ],
        total: 1,
        limit: 100,
        offset: 0
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/resources with kind, apiVersion, and namespace filter
  test('GET /api/v1/resources?kind=Cluster&apiVersion=postgresql.cnpg.io/v1&namespace=query-tool-test should return test-pg-cluster', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/resources?kind=Cluster&apiVersion=postgresql.cnpg.io/v1&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        resources: [
          {
            name: 'test-pg-cluster',
            namespace: testNamespace,
            kind: 'Cluster',
            apiGroup: 'postgresql.cnpg.io',
            apiVersion: 'postgresql.cnpg.io/v1',
            labels: { app: 'postgresql', team: 'platform', environment: 'test' }
          }
        ],
        total: 1,
        limit: 100,
        offset: 0
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/resources without required kind parameter
  test('GET /api/v1/resources without kind should return 400', async () => {
    const response = await integrationTest.httpClient.get('/api/v1/resources?apiVersion=apps/v1');

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'The "kind" query parameter is required'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/resources without required apiVersion parameter
  test('GET /api/v1/resources without apiVersion should return 400', async () => {
    const response = await integrationTest.httpClient.get('/api/v1/resources?kind=Deployment');

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'MISSING_PARAMETER',
        message: 'The "apiVersion" query parameter is required'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/resources with non-existent kind
  test('GET /api/v1/resources?kind=NonExistent&apiVersion=v1 should return empty array', async () => {
    const response = await integrationTest.httpClient.get('/api/v1/resources?kind=NonExistent&apiVersion=v1');

    expect(response).toMatchObject({
      success: true,
      data: {
        resources: [],
        total: 0,
        limit: 100,
        offset: 0
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/resources with includeStatus=true should return resources with status field
  test('GET /api/v1/resources with includeStatus=true should return resources with status', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/resources?kind=Cluster&apiVersion=postgresql.cnpg.io/v1&namespace=${testNamespace}&includeStatus=true`
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        resources: [
          {
            name: 'test-pg-cluster',
            namespace: testNamespace,
            kind: 'Cluster',
            apiVersion: 'postgresql.cnpg.io/v1',
            // status field should be present (may be undefined if resource doesn't exist in K8s)
            status: expect.anything()
          }
        ],
        total: 1,
        limit: 100,
        offset: 0
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/namespaces
  test('GET /api/v1/namespaces should return query-tool-test namespace', async () => {
    const response = await integrationTest.httpClient.get('/api/v1/namespaces');

    expect(response).toMatchObject({
      success: true,
      data: {
        namespaces: [testNamespace]
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/resource - Single Resource Endpoint
  test('GET /api/v1/resource should return full resource with metadata, spec, and status', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/resource?kind=Cluster&apiVersion=postgresql.cnpg.io/v1&name=test-pg-cluster&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        resource: {
          apiVersion: 'postgresql.cnpg.io/v1',
          kind: 'Cluster',
          metadata: {
            name: 'test-pg-cluster',
            namespace: testNamespace,
            labels: { app: 'postgresql', team: 'platform', environment: 'test' }
          },
          spec: {
            instances: 1,
            storage: { size: '1Gi' }
          }
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });

    // Verify status field is present (may have various conditions)
    expect(response.data.resource).toHaveProperty('status');
  }, 30000);

  // PRD #328: GET /api/v1/resource without required kind parameter
  test('GET /api/v1/resource without kind should return 400', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/resource?apiVersion=apps/v1&name=test&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'kind query parameter is required'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/resource without required apiVersion parameter
  test('GET /api/v1/resource without apiVersion should return 400', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/resource?kind=Deployment&name=test&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'apiVersion query parameter is required'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/resource without required name parameter
  test('GET /api/v1/resource without name should return 400', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/resource?kind=Deployment&apiVersion=apps/v1&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'name query parameter is required'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/resource for non-existent resource should return 404
  test('GET /api/v1/resource for non-existent resource should return 404', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/resource?kind=Deployment&apiVersion=apps/v1&name=non-existent-resource&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: expect.stringContaining('not found')
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/events - Events Endpoint
  test('GET /api/v1/events should return events for a resource', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/events?name=test-pg-cluster&kind=Cluster&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        events: expect.any(Array),
        count: expect.any(Number)
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });

    // If there are events, verify the structure
    if (response.data.events.length > 0) {
      const event = response.data.events[0];
      expect(event).toMatchObject({
        reason: expect.any(String),
        message: expect.any(String),
        type: expect.stringMatching(/^(Normal|Warning)$/),
        involvedObject: {
          kind: 'Cluster',
          name: 'test-pg-cluster'
        }
      });
    }
  }, 30000);

  // PRD #328: GET /api/v1/events without required name parameter
  test('GET /api/v1/events without name should return 400', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/events?kind=Cluster&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'name query parameter is required'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/events without required kind parameter
  test('GET /api/v1/events without kind should return 400', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/events?name=test-pg-cluster&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'kind query parameter is required'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/events for non-existent resource returns empty array
  test('GET /api/v1/events for non-existent resource should return empty array', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/events?name=non-existent-resource&kind=Pod&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        events: [],
        count: 0
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/logs - Pod Logs Endpoint
  test('GET /api/v1/logs should return logs for a pod', async () => {
    // Get dot-ai pod name first (the MCP server pod running the test)
    const kubeconfig = process.env.KUBECONFIG;
    const podsOutput = execSync(
      `kubectl get pods -n dot-ai -l app.kubernetes.io/name=dot-ai -o jsonpath='{.items[0].metadata.name}'`,
      { env: { ...process.env, KUBECONFIG: kubeconfig }, encoding: 'utf8' }
    );
    const podName = podsOutput.replace(/'/g, '').trim();

    const response = await integrationTest.httpClient.get(
      `/api/v1/logs?name=${podName}&namespace=dot-ai&tailLines=10`
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        logs: expect.any(String),
        container: 'mcp-server',
        containerCount: 1
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });

    // Logs should contain some content (MCP server produces logs)
    expect(response.data.logs.length).toBeGreaterThan(0);
  }, 30000);

  // PRD #328: GET /api/v1/logs without required name parameter
  test('GET /api/v1/logs without name should return 400', async () => {
    const response = await integrationTest.httpClient.get(
      '/api/v1/logs?namespace=dot-ai'
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'name query parameter is required'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/logs without required namespace parameter
  test('GET /api/v1/logs without namespace should return 400', async () => {
    const response = await integrationTest.httpClient.get(
      '/api/v1/logs?name=some-pod'
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'namespace query parameter is required'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/logs with invalid tailLines
  test('GET /api/v1/logs with invalid tailLines should return 400', async () => {
    const response = await integrationTest.httpClient.get(
      '/api/v1/logs?name=some-pod&namespace=default&tailLines=invalid'
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_PARAMETER',
        message: 'tailLines must be a positive integer'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: GET /api/v1/logs for non-existent pod should return error
  test('GET /api/v1/logs for non-existent pod should return error', async () => {
    const response = await integrationTest.httpClient.get(
      `/api/v1/logs?name=non-existent-pod-xyz&namespace=${testNamespace}`
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'LOGS_ERROR',
        message: 'Failed to retrieve logs'
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);

  // PRD #328: Query with [visualization] prefix returns visualization data directly
  test('should return visualization data directly when [visualization] prefix is used', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/query',
      {
        intent: '[visualization] Analyze the cluster health and show what resources are deployed',
        interaction_id: 'query_visualization_mode'
      }
    );

    // Visualization mode returns visualization format (title, visualizations, insights)
    // instead of normal query output (summary, sessionId, etc.)
    expect(response).toMatchObject({
      success: true,
      data: {
        tool: 'query',
        executionTime: expect.any(Number),
        result: {
          title: expect.any(String),
          visualizations: expect.any(Array),
          insights: expect.any(Array),
          toolsUsed: expect.any(Array)
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });

    // Validate visualization structure
    const result = response.data.result;
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.visualizations.length).toBeGreaterThan(0);
    expect(result.insights.length).toBeGreaterThan(0);

    // Each visualization should have required fields
    for (const viz of result.visualizations) {
      expect(viz).toMatchObject({
        id: expect.any(String),
        label: expect.any(String),
        type: expect.stringMatching(/^(mermaid|table|cards|code|diff)$/),
        content: expect.anything()
      });
    }

    // Should NOT have normal query output fields
    expect(result).not.toHaveProperty('summary');
    expect(result).not.toHaveProperty('sessionId');
    expect(result).not.toHaveProperty('visualizationUrl');
    expect(result).not.toHaveProperty('guidance');
  }, 300000);
});
