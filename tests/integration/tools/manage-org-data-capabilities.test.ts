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


  describe('Capabilities Scanning Workflow', () => {
    test('should complete full auto scan workflow from start to finish', async () => {
      // Step 1: Start capabilities scan
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        interaction_id: 'scan_workflow'
      });

      // Validate initial workflow response
      const expectedStartResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'scan',
            dataType: 'capabilities',
            REQUIRED_NEXT_CALL: {
              tool: 'dot-ai:manageOrgData',
              parameters: {
                dataType: 'capabilities',
                operation: 'scan',
                sessionId: expect.stringMatching(/^cap-scan-\d+-[a-f0-9]{8}$/),
                step: 'resource-selection',
                response: 'user_choice_here'
              },
              note: 'The step parameter is MANDATORY when sessionId is provided'
            },
            workflow: {
              step: 'resource-selection',
              question: 'Scan all cluster resources or specify subset?',
              options: [
                {
                  number: 1,
                  value: 'all',
                  display: '1. all - Scan all available cluster resources'
                },
                {
                  number: 2,
                  value: 'specific',
                  display: '2. specific - Specify particular resource types to scan'
                }
              ],
              sessionId: expect.stringMatching(/^cap-scan-\d+-[a-f0-9]{8}$/),
              instruction: 'IMPORTANT: You MUST ask the user to make a choice. Do NOT automatically select an option.',
              userPrompt: 'Would you like to scan all cluster resources or specify a subset?',
              clientInstructions: expect.objectContaining({
                behavior: 'interactive',
                requirement: 'Ask user to choose between options',
                prohibit: 'Do not auto-select options'
              })
            }
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(startResponse).toMatchObject(expectedStartResponse);
      const sessionId = startResponse.data.result.workflow.sessionId;

      // Step 2: Select 'all' resources - this now starts scan in background
      const resourceSelectionResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-selection',
        response: 'all',
        interaction_id: 'resource_selection'
      });

      // Step 2 should start background scan and return immediately
      const expectedStartedResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'scan',
            dataType: 'capabilities',
            status: 'started',
            sessionId: sessionId,
            message: 'Capability scan started. Use operation "progress" to check status.',
            checkProgress: {
              dataType: 'capabilities',
              operation: 'progress'
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

      expect(resourceSelectionResponse).toMatchObject(expectedStartedResponse);
      expect(resourceSelectionResponse.data.result.sessionId).toBeDefined();

      // Step 3: Poll for completion using progress operation
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

    test('should handle specific resource scanning workflow', async () => {
      // Step 1: Start scan
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        interaction_id: 'specific_scan_workflow'
      });

      const sessionId = startResponse.data.result.workflow.sessionId;

      // Step 2: Select 'specific' resources
      const specificResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-selection',
        response: 'specific',
        interaction_id: 'specific_selection'
      });

      // Should ask for resource specification
      expect(specificResponse.data.result.success).toBe(true);
      expect(specificResponse.data.result.workflow.step).toBe('resource-specification');
      expect(specificResponse.data.result.workflow.question).toContain('resource');

      // Continue with specific resources (Deployment, Service, SQL) - use resourceList parameter
      const resourceSpecResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-specification',
        resourceList: 'Deployment.apps,Service,SQL.devopstoolkit.live',
        interaction_id: 'resource_specification'
      }, { timeout: 300000 }); // 5 minutes for scan completion

      // Should proceed directly to scanning and complete (no processing-mode step)
      expect(resourceSpecResponse.data.result.success).toBe(true);
      expect(resourceSpecResponse.data.result.step).toBe('complete');
      expect(resourceSpecResponse.data.result.mode).toBe('auto');
      expect(resourceSpecResponse.data.result.summary).toBeDefined();
      expect(resourceSpecResponse.data.result.summary.totalScanned).toBeGreaterThanOrEqual(3);

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
      // First ensure we have some capabilities by running a quick scan
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        interaction_id: 'list_setup_scan'
      });
      const sessionId = startResponse.data.result.workflow.sessionId;

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-selection',
        response: 'specific',
        interaction_id: 'list_resource_selection'
      });

      const scanResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-specification',
        resourceList: 'Service',
        interaction_id: 'list_resource_spec'
      }, { timeout: 300000 }); // 5 minutes for scan completion

      // Ensure scan completed successfully
      expect(scanResponse.data.result.success).toBe(true);
      expect(scanResponse.data.result.step).toBe('complete');

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
      // First ensure we have some capabilities data for searching
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        interaction_id: 'search_setup_scan'
      });
      const sessionId = startResponse.data.result.workflow.sessionId;

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities', operation: 'scan', sessionId,
        step: 'resource-selection', response: 'specific',
        interaction_id: 'search_resource_selection'
      });

      integrationTest.httpClient.setTimeout(300000); // 5 minutes for specific resource scan with AI
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities', operation: 'scan', sessionId,
        step: 'resource-specification', resourceList: 'Service,Deployment.apps',
        interaction_id: 'search_resource_spec'
      });

      // Reset timeout to default for search (semantic search can take time with embeddings)
      integrationTest.httpClient.setTimeout(1800000); // Back to 30 minutes default

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

    test('should handle missing sessionId for workflow operations', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        step: 'resource-selection',
        response: 'all',
        // Missing sessionId
        interaction_id: 'missing_session_error'
      });

      // API returns success but handles errors in workflow response
      expect(errorResponse.success).toBe(true);
      expect(errorResponse.data).toHaveProperty('tool', 'manageOrgData');
    });

    test('should handle invalid sessionId', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId: 'invalid-session-id',
        step: 'resource-selection',
        response: 'all',
        interaction_id: 'invalid_session_error'
      });

      // API returns success but handles errors in workflow response
      expect(errorResponse.success).toBe(true);
      expect(errorResponse.data).toHaveProperty('tool', 'manageOrgData');
    });
  });
});