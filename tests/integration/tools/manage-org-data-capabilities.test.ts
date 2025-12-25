/**
 * Integration Test: ManageOrgData - Capabilities
 *
 * Tests the capabilities scanning functionality via REST API against a real test cluster.
 * Validates cluster resource discovery, capability storage, and management operations.
 *
 * NOTE: Written based on actual API response inspection following PRD best practices.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('ManageOrgData - Capabilities Integration', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');

    // Clean sessions directory to prevent stale session reuse
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    await execAsync('rm -rf ./tmp/sessions/capability-sessions/*').catch(() => {});
  });


  describe('Fire-and-Forget Scanning (PRD #216)', () => {
    /**
     * Fire-and-forget scanning allows controllers to trigger scans without
     * going through the interactive workflow. This is the primary scanning API
     * designed for the dot-ai-controller to trigger scans when CRDs are created/updated.
     */

    test('should complete full cluster scan with mode=full', async () => {
      // Clean capabilities collection before full scan to get accurate count
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'deleteAll',
        interaction_id: 'cleanup_before_full_scan'
      });

      // Fire-and-forget full scan - no workflow steps, returns immediately
      const scanResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        mode: 'full',
        interaction_id: 'fire_forget_full_scan'
      });

      // Validate fire-and-forget response - returns immediately with status: started
      const expectedStartedResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'scan',
            dataType: 'capabilities',
            status: 'started',
            mode: 'full',
            sessionId: expect.stringMatching(/^cap-scan-\d+-[a-f0-9]{8}$/),
            message: 'Full cluster scan initiated. Scan runs in background.',
            checkProgress: {
              dataType: 'capabilities',
              operation: 'progress',
              sessionId: expect.stringMatching(/^cap-scan-\d+-[a-f0-9]{8}$/)
            }
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          version: 'v1'
        })
      };

      expect(scanResponse).toMatchObject(expectedStartedResponse);

      const sessionId = scanResponse.data.result.sessionId;
      expect(sessionId).toBeDefined();

      // Poll for completion using progress operation
      let scanComplete = false;
      let progressResponse;
      const maxAttempts = 60; // 10 minutes with 10 second intervals
      let attempts = 0;

      while (!scanComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds between checks

        progressResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
          dataType: 'capabilities',
          operation: 'progress',
          sessionId,
          interaction_id: `progress_check_${attempts}`
        });

        // Check if scan is complete - status is inside progress object
        const progressStatus = progressResponse.data.result.progress?.status;
        if (progressStatus === 'complete' || progressStatus === 'completed') {
          scanComplete = true;
        }
        attempts++;
      }

      // Validate scan eventually completed
      expect(scanComplete).toBe(true);

      // Capture scan statistics from final progress response for debugging
      const scanStats = {
        total: progressResponse?.data?.result?.progress?.total,
        successful: progressResponse?.data?.result?.progress?.successfulResources,
        failed: progressResponse?.data?.result?.progress?.failedResources,
        errors: progressResponse?.data?.result?.progress?.errors,
        processingTime: progressResponse?.data?.result?.progress?.totalProcessingTime
      };

      // === VALIDATE COUNT: Full scan processes API resources + CRDs ===
      const countResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'list',
        limit: 1,
        interaction_id: 'count_after_full_scan'
      });
      const totalCount = countResponse.data.result.data.totalCount;

      // Validate count: Cluster has 91 API resources (89 unique Kinds + 2 duplicates).
      // We expect at least 90 capabilities to ensure accurate scanning.
      // If this fails, capability scanning is not working correctly.
      if (totalCount < 90 || totalCount > 120) {
        throw new Error(`Capability count ${totalCount} outside expected range [90-120].
  Expected: ~90 capabilities (cluster has 91 API resources, 89 unique Kinds)
  Discovered: ${scanStats.total}
  Successful: ${scanStats.successful}
  Failed: ${scanStats.failed}
  Processing time: ${scanStats.processingTime}
  Errors: ${JSON.stringify(scanStats.errors, null, 2)}`);
      }

      // === FIELD VALIDATION: Verify stored capabilities have correct field values ===
      // Test cluster has known resources with deterministic metadata
      const allCapabilities = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'list',
        limit: 200,
        interaction_id: 'field_validation_list'
      });

      const capabilities = allCapabilities.data.result.data.capabilities;

      // Find specific known resources for field validation
      const pod = capabilities.find((c: any) => c.resourceName === 'Pod');
      const deployment = capabilities.find((c: any) => c.resourceName === 'Deployment');
      const service = capabilities.find((c: any) => c.resourceName === 'Service');
      const configMap = capabilities.find((c: any) => c.resourceName === 'ConfigMap');
      const statefulSet = capabilities.find((c: any) => c.resourceName === 'StatefulSet');
      const cnpgCluster = capabilities.find((c: any) => c.resourceName === 'clusters.postgresql.cnpg.io');

      // Validate core resource: Pod (apiVersion: v1, no group)
      expect(pod).toBeDefined();
      expect(pod).toMatchObject({
        resourceName: 'Pod',
        apiVersion: 'v1',
        version: 'v1',
        group: ''
      });

      // Validate core resource: Service (apiVersion: v1, no group)
      expect(service).toBeDefined();
      expect(service).toMatchObject({
        resourceName: 'Service',
        apiVersion: 'v1',
        version: 'v1',
        group: ''
      });

      // Validate core resource: ConfigMap (apiVersion: v1, no group)
      expect(configMap).toBeDefined();
      expect(configMap).toMatchObject({
        resourceName: 'ConfigMap',
        apiVersion: 'v1',
        version: 'v1',
        group: ''
      });

      // Validate apps group resource: Deployment (apiVersion: apps/v1)
      expect(deployment).toBeDefined();
      expect(deployment).toMatchObject({
        resourceName: 'Deployment',
        apiVersion: 'apps/v1',
        version: 'v1',
        group: 'apps'
      });

      // Validate apps group resource: StatefulSet (apiVersion: apps/v1)
      expect(statefulSet).toBeDefined();
      expect(statefulSet).toMatchObject({
        resourceName: 'StatefulSet',
        apiVersion: 'apps/v1',
        version: 'v1',
        group: 'apps'
      });

      // Validate CRD: CNPG Cluster (apiVersion: postgresql.cnpg.io/v1)
      expect(cnpgCluster).toBeDefined();
      expect(cnpgCluster).toMatchObject({
        resourceName: 'clusters.postgresql.cnpg.io',
        apiVersion: 'postgresql.cnpg.io/v1',
        version: 'v1',
        group: 'postgresql.cnpg.io'
      });

      // === READ: Verify capabilities were stored by listing them ===
      const listResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'list',
        limit: 10,
        interaction_id: 'verify_scan_complete'
      });

      expect(listResponse.success).toBe(true);
      expect(listResponse.data.result.data.capabilities.length).toBeGreaterThan(0);

      // Get a specific capability ID for RUD operations
      const capabilityId = listResponse.data.result.data.capabilities[0].id;
      const capabilityResourceName = listResponse.data.result.data.capabilities[0].resourceName;

      // === READ: Get specific capability by ID ===
      const getResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'get',
        id: capabilityId,
        interaction_id: 'get_capability_test'
      });

      expect(getResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            data: {
              id: capabilityId,
              resourceName: capabilityResourceName
            }
          }
        }
      });

      // === DELETE: Remove the capability ===
      const deleteResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'delete',
        id: capabilityId,
        interaction_id: 'delete_capability_test'
      });

      expect(deleteResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'delete',
            deletedCapability: {
              id: capabilityId
            }
          }
        }
      });

      // === VERIFY DELETE: Confirm capability no longer exists ===
      const getDeletedResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'get',
        id: capabilityId,
        interaction_id: 'verify_deleted_test'
      });

      expect(getDeletedResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('Capability not found')
            }
          }
        }
      });

      // NOTE: One capability was deleted, but the rest remain for recommendation tests
    }, 660000); // 11 minute timeout (10 min polling + buffer)

    test('should scan specific resources with resourceList parameter', async () => {
      // Fire-and-forget targeted scan - specify resources directly, no workflow steps
      const scanResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        resourceList: 'Deployment.apps,Service,SQL.devopstoolkit.live',
        interaction_id: 'fire_forget_specific_scan'
      });

      // Validate fire-and-forget response
      const expectedStartedResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'scan',
            dataType: 'capabilities',
            status: 'started',
            mode: 'targeted',
            resourceCount: 3,
            sessionId: expect.stringMatching(/^cap-scan-\d+-[a-f0-9]{8}$/),
            message: 'Scan initiated for 3 resource(s). Scan runs in background.',
            checkProgress: {
              dataType: 'capabilities',
              operation: 'progress',
              sessionId: expect.stringMatching(/^cap-scan-\d+-[a-f0-9]{8}$/)
            }
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        }
      };

      expect(scanResponse).toMatchObject(expectedStartedResponse);

      const sessionId = scanResponse.data.result.sessionId;

      // Poll for completion
      let scanComplete = false;
      const maxAttempts = 30; // 5 minutes with 10 second intervals
      let attempts = 0;

      while (!scanComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000));

        const progressResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
          dataType: 'capabilities',
          operation: 'progress',
          sessionId,
          interaction_id: `specific_progress_${attempts}`
        });

        const progressStatus = progressResponse.data.result.progress?.status;
        if (progressStatus === 'complete' || progressStatus === 'completed') {
          scanComplete = true;
        }
        attempts++;
      }

      expect(scanComplete).toBe(true);

      // Verify scanned capabilities have correct apiVersion
      const listResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'list',
        limit: 20,
        interaction_id: 'verify_scanned_resources'
      });

      const capabilities = listResponse.data.result.data.capabilities;
      const deployment = capabilities.find((c: any) => c.resourceName === 'Deployment');
      const service = capabilities.find((c: any) => c.resourceName === 'Service');
      const sql = capabilities.find((c: any) => c.resourceName === 'sqls.devopstoolkit.live');

      // Validate Deployment has correct apiVersion (apps/v1)
      if (deployment) {
        expect(deployment.apiVersion).toBe('apps/v1');
        expect(deployment.version).toBe('v1');
        expect(deployment.group).toBe('apps');
      }

      // Validate Service has correct apiVersion (v1 - core resource)
      if (service) {
        expect(service.apiVersion).toBe('v1');
        expect(service.version).toBe('v1');
        expect(service.group).toBe('');
      }

      // Validate SQL CRD has correct apiVersion (devopstoolkit.live/v1beta1)
      if (sql) {
        expect(sql.apiVersion).toBe('devopstoolkit.live/v1beta1');
        expect(sql.version).toBe('v1beta1');
        expect(sql.group).toBe('devopstoolkit.live');
      }

      // Note: No cleanup to avoid race conditions with parallel tests
    }, 300000); // 5 minute timeout for specific resource scan

  });

  describe('Capabilities Management Operations', () => {
    // NOTE: CRUD lifecycle (Create, Read, Update, Delete) is now tested in the full auto scan test above
    // to avoid race conditions with deterministic capability IDs across concurrent tests

    test('should list stored capabilities after scan', async () => {
      // First ensure we have some capabilities by running a quick fire-and-forget scan
      const scanResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        resourceList: 'Service',
        interaction_id: 'list_setup_scan'
      });

      expect(scanResponse.data.result.success).toBe(true);
      expect(scanResponse.data.result.status).toBe('started');

      const sessionId = scanResponse.data.result.sessionId;

      // Poll for completion
      let scanComplete = false;
      const maxAttempts = 30;
      let attempts = 0;

      while (!scanComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000));

        const progressResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
          dataType: 'capabilities',
          operation: 'progress',
          sessionId,
          interaction_id: `list_progress_${attempts}`
        });

        const progressStatus = progressResponse.data.result.progress?.status;
        if (progressStatus === 'complete' || progressStatus === 'completed') {
          scanComplete = true;
        }
        attempts++;
      }

      // Ensure scan completed successfully
      expect(scanComplete).toBe(true);

      // Now list capabilities
      const listResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'list',
        limit: 10,
        interaction_id: 'list_after_setup'
      });

      const expectedListResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'list',
            dataType: 'capabilities',
            data: {
              capabilities: expect.arrayContaining([
                expect.objectContaining({
                  id: expect.any(String),
                  resourceName: expect.any(String),
                  description: expect.any(String),
                  apiVersion: expect.any(String),
                  version: expect.any(String),
                  group: expect.any(String)
                })
              ]),
              totalCount: expect.any(Number),
              limit: 10
            }
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(listResponse).toMatchObject(expectedListResponse);
      expect(listResponse.data.result.data.capabilities.length).toBeGreaterThan(0);

      // Validate that all capabilities have version information
      for (const capability of listResponse.data.result.data.capabilities) {
        expect(capability.apiVersion).toBeDefined();
        expect(capability.version).toBeDefined();
        expect(capability.group).toBeDefined();
      }
    });

    test('should get specific capability by ID', async () => {
      // First list to get an ID
      const listResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'list',
        limit: 1
      });

      if (listResponse.data.result.data.capabilities.length > 0) {
        const capabilityId = listResponse.data.result.data.capabilities[0].id;

        // Get specific capability
        const getResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
          dataType: 'capabilities',
          operation: 'get',
          id: capabilityId,
          interaction_id: 'get_by_id_test'
        });

        const expectedGetResponse = {
          success: true,
          data: {
            result: {
              success: true,
              operation: 'get',
              dataType: 'capabilities',
              data: expect.objectContaining({
                id: capabilityId,
                resourceName: expect.any(String),
                description: expect.any(String),
                capabilities: expect.any(Array),
                apiVersion: expect.any(String),
                version: expect.any(String),
                group: expect.any(String)
              })
            }
          }
        };

        expect(getResponse).toMatchObject(expectedGetResponse);

        // Validate version information is present
        expect(getResponse.data.result.data.apiVersion).toBeDefined();
        expect(getResponse.data.result.data.version).toBeDefined();
        expect(getResponse.data.result.data.group).toBeDefined();
      }
    });

    test('should check scan progress during long operations', async () => {
      const progressResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'progress',
        interaction_id: 'progress_check'
      });

      // Progress check should always succeed
      expect(progressResponse.success).toBe(true);
      expect(progressResponse.data.result.operation).toBe('progress');
      expect(progressResponse.data.result.dataType).toBe('capabilities');
    });

    test('should search capabilities by semantic query', async () => {
      // First ensure we have some capabilities data for searching via fire-and-forget scan
      const scanResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        resourceList: 'Service,Deployment.apps',
        interaction_id: 'search_setup_scan'
      });

      expect(scanResponse.data.result.success).toBe(true);
      expect(scanResponse.data.result.status).toBe('started');

      const sessionId = scanResponse.data.result.sessionId;

      // Poll for completion
      let scanComplete = false;
      const maxAttempts = 30;
      let attempts = 0;

      while (!scanComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000));

        const progressResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
          dataType: 'capabilities',
          operation: 'progress',
          sessionId,
          interaction_id: `search_progress_${attempts}`
        });

        const progressStatus = progressResponse.data.result.progress?.status;
        if (progressStatus === 'complete' || progressStatus === 'completed') {
          scanComplete = true;
        }
        attempts++;
      }

      expect(scanComplete).toBe(true);

      // Test semantic search
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'search',
        id: 'workload application deployment', // Search query
        interaction_id: 'semantic_search_test'
      });

      const expectedSearchResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'search',
            dataType: 'capabilities',
            data: {
              query: 'workload application deployment',
              results: expect.arrayContaining([
                expect.objectContaining({
                  id: expect.any(String),
                  resourceName: expect.any(String),
                  rank: expect.any(Number),
                  score: expect.any(Number)
                })
              ])
            }
          }
        }
      };

      expect(searchResponse).toMatchObject(expectedSearchResponse);
      expect(searchResponse.data.result.data.results.length).toBeGreaterThan(0);

      // Note: No cleanup to avoid race conditions with parallel tests
    });


    test('should handle resource-specific capability operations (validates error handling)', async () => {
      // Test resource-specific get operation - this should return an error because resource param is not supported
      // Only ID-based get operations are supported according to the API implementation
      const resourceResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'get',
        resource: {
          kind: 'Deployment',
          group: 'apps',
          apiVersion: 'apps/v1'
        },
        interaction_id: 'resource_get_error_test'
      });

      // Resource-specific get operations require an ID - should return error
      expect(resourceResponse.success).toBe(true);
      expect(resourceResponse.data.result.success).toBe(false);
      expect(resourceResponse.data.result.error.message).toContain('Missing required parameter: id');

      // Note: No cleanup to avoid race conditions with parallel tests
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid operation gracefully', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'invalid-operation',
        interaction_id: 'invalid_operation_error'
      });

      // API returns success but with error message in data for invalid operations
      expect(errorResponse.success).toBe(true);
      expect(errorResponse.data).toHaveProperty('tool', 'manageOrgData');
      expect(errorResponse.data.result).toHaveProperty('error');
    });

    test('should reject empty resourceList in fire-and-forget mode', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        resourceList: '  ,  ,  ', // Empty after trimming
        interaction_id: 'fire_forget_empty_list'
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            operation: 'scan',
            dataType: 'capabilities',
            error: {
              message: 'Empty resource list',
              details: 'resourceList parameter must contain at least one resource'
            }
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });
  });
});