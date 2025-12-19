/**
 * Integration Test: Resource Sync Endpoint
 *
 * Tests the POST /api/v1/resources/sync endpoint for receiving
 * cluster resource data from the dot-ai-controller.
 *
 * This endpoint is NOT an MCP tool - it's a direct REST endpoint
 * for machine-to-machine communication between the controller and MCP.
 */

import { describe, test, expect } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe('Resource Sync Endpoint Integration', () => {
  const integrationTest = new IntegrationTest();
  const testId = Date.now();

  describe('Complete Sync Workflow', () => {
    test('should complete full resource sync workflow: upsert, verify, delete', async () => {
      // Step 1: UPSERT - Create two resources
      const upsertResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        upserts: [
          {
            namespace: 'default',
            name: `test-nginx-${testId}`,
            kind: 'Deployment',
            apiVersion: 'apps/v1',
            labels: {
              app: 'nginx',
              env: 'production',
              'team': 'platform'
            },
            annotations: {
              description: 'Production web server deployment'
            },
            createdAt: '2025-12-19T10:00:00Z',
            updatedAt: '2025-12-19T10:00:00Z'
          },
          {
            namespace: 'default',
            name: `test-service-${testId}`,
            kind: 'Service',
            apiVersion: 'v1',
            labels: {
              app: 'nginx',
              type: 'loadbalancer'
            },
            createdAt: '2025-12-19T10:00:00Z',
            updatedAt: '2025-12-19T10:00:00Z'
          }
        ],
        deletes: [],
        isResync: false
      });

      // First check success and show error details if failed
      expect(upsertResponse.success, `Upsert failed: ${JSON.stringify(upsertResponse.error)}`).toBe(true);

      const expectedUpsertResponse = {
        success: true,
        data: {
          upserted: 2,
          deleted: 0
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(upsertResponse).toMatchObject(expectedUpsertResponse);

      // Step 2: UPSERT again to verify idempotent update works
      const updateResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        upserts: [
          {
            namespace: 'default',
            name: `test-nginx-${testId}`,
            kind: 'Deployment',
            apiVersion: 'apps/v1',
            labels: {
              app: 'nginx',
              env: 'staging', // Changed from production
              'team': 'platform'
            },
            annotations: {
              description: 'Updated staging web server deployment'
            },
            createdAt: '2025-12-19T10:00:00Z',
            updatedAt: '2025-12-19T11:00:00Z' // Updated timestamp
          }
        ],
        isResync: false
      });

      const expectedUpdateResponse = {
        success: true,
        data: {
          upserted: 1,
          deleted: 0
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(updateResponse).toMatchObject(expectedUpdateResponse);

      // Step 3: DELETE - Remove one resource (using object with components)
      const deleteResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        upserts: [],
        deletes: [
          {
            namespace: 'default',
            name: `test-service-${testId}`,
            kind: 'Service',
            apiVersion: 'v1'
          }
        ],
        isResync: false
      });

      const expectedDeleteResponse = {
        success: true,
        data: {
          upserted: 0,
          deleted: 1
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(deleteResponse).toMatchObject(expectedDeleteResponse);

      // Step 4: IDEMPOTENT DELETE - Delete same resource again (should succeed)
      const idempotentDeleteResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        deletes: [
          {
            namespace: 'default',
            name: `test-service-${testId}`,
            kind: 'Service',
            apiVersion: 'v1'
          }
        ]
      });

      const expectedIdempotentDeleteResponse = {
        success: true,
        data: {
          upserted: 0,
          deleted: 1 // Should count as success even though resource already deleted
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(idempotentDeleteResponse).toMatchObject(expectedIdempotentDeleteResponse);

      // Step 5: Clean up - Delete remaining resource
      const cleanupResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        deletes: [
          {
            namespace: 'default',
            name: `test-nginx-${testId}`,
            kind: 'Deployment',
            apiVersion: 'apps/v1'
          }
        ]
      });

      expect(cleanupResponse).toMatchObject({
        success: true,
        data: {
          upserted: 0,
          deleted: 1
        }
      });
    }, 120000); // 2 minute timeout for full workflow
  });

  describe('Resync Workflow', () => {
    test('should perform diff-based resync correctly', async () => {
      // Step 1: Create initial resources
      const initialSyncResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        upserts: [
          {
            namespace: 'default',
            name: `resync-app-${testId}`,
            kind: 'Deployment',
            apiVersion: 'apps/v1',
            labels: { app: 'resync-test' },
            createdAt: '2025-12-19T10:00:00Z',
            updatedAt: '2025-12-19T10:00:00Z'
          },
          {
            namespace: 'default',
            name: `resync-config-${testId}`,
            kind: 'ConfigMap',
            apiVersion: 'v1',
            labels: { type: 'config' },
            createdAt: '2025-12-19T10:00:00Z',
            updatedAt: '2025-12-19T10:00:00Z'
          }
        ],
        isResync: false
      });

      expect(initialSyncResponse).toMatchObject({
        success: true,
        data: {
          upserted: 2,
          deleted: 0
        }
      });

      // Step 2: Perform resync with different set of resources
      // - resync-app updated (changed labels)
      // - resync-config removed (not in incoming set)
      // - resync-secret added (new resource)
      const resyncResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        upserts: [
          {
            namespace: 'default',
            name: `resync-app-${testId}`,
            kind: 'Deployment',
            apiVersion: 'apps/v1',
            labels: { app: 'resync-test', version: 'v2' }, // Updated labels
            createdAt: '2025-12-19T10:00:00Z',
            updatedAt: '2025-12-19T12:00:00Z' // Updated timestamp
          },
          {
            namespace: 'default',
            name: `resync-secret-${testId}`,
            kind: 'Secret',
            apiVersion: 'v1',
            labels: { type: 'secret' },
            createdAt: '2025-12-19T11:00:00Z',
            updatedAt: '2025-12-19T11:00:00Z'
          }
        ],
        isResync: true // Trigger diff-based sync
      });

      const expectedResyncResponse = {
        success: true,
        data: {
          upserted: 2, // inserted (resync-secret) + updated (resync-app)
          deleted: 1, // resync-config was removed
          resync: {
            inserted: 1, // resync-secret is new
            updated: 1, // resync-app was updated
            deleted: 1  // resync-config was removed
          }
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(resyncResponse).toMatchObject(expectedResyncResponse);

      // Clean up resync test resources
      await integrationTest.httpClient.post('/api/v1/resources/sync', {
        deletes: [
          { namespace: 'default', name: `resync-app-${testId}`, kind: 'Deployment', apiVersion: 'apps/v1' },
          { namespace: 'default', name: `resync-secret-${testId}`, kind: 'Secret', apiVersion: 'v1' }
        ]
      });
    }, 120000);
  });

  describe('Validation and Error Handling', () => {
    test('should reject invalid request body', async () => {
      const invalidResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        upserts: [
          {
            // Missing required fields: namespace, kind, apiVersion, createdAt, updatedAt
            name: 'invalid-resource'
          }
        ]
      });

      // Should fail validation due to missing required fields
      const expectedInvalidResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: expect.arrayContaining([
            expect.objectContaining({
              path: expect.stringContaining('upserts'),
              message: expect.any(String)
            })
          ])
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(invalidResponse).toMatchObject(expectedInvalidResponse);
    });

    test('should handle empty sync request gracefully', async () => {
      const emptyResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        upserts: [],
        deletes: [],
        isResync: false
      });

      const expectedEmptyResponse = {
        success: true,
        data: {
          upserted: 0,
          deleted: 0
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(emptyResponse).toMatchObject(expectedEmptyResponse);
    });

    test('should reject non-POST methods', async () => {
      const getResponse = await integrationTest.httpClient.get('/api/v1/resources/sync');

      const expectedMethodNotAllowed = {
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only POST method allowed for resource sync'
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(getResponse).toMatchObject(expectedMethodNotAllowed);
    });
  });

  describe('Cluster-Scoped Resources', () => {
    test('should handle cluster-scoped resources with _cluster prefix', async () => {
      const clusterResponse = await integrationTest.httpClient.post('/api/v1/resources/sync', {
        upserts: [
          {
            namespace: '_cluster',
            name: `test-admin-${testId}`,
            kind: 'ClusterRole',
            apiVersion: 'rbac.authorization.k8s.io/v1',
            labels: {
              'rbac.authorization.k8s.io/aggregate-to-admin': 'true'
            },
            createdAt: '2025-12-19T10:00:00Z',
            updatedAt: '2025-12-19T10:00:00Z'
          }
        ]
      });

      const expectedClusterResponse = {
        success: true,
        data: {
          upserted: 1,
          deleted: 0
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(clusterResponse).toMatchObject(expectedClusterResponse);

      // Clean up
      await integrationTest.httpClient.post('/api/v1/resources/sync', {
        deletes: [
          {
            namespace: '_cluster',
            name: `test-admin-${testId}`,
            kind: 'ClusterRole',
            apiVersion: 'rbac.authorization.k8s.io/v1'
          }
        ]
      });
    });
  });
});
