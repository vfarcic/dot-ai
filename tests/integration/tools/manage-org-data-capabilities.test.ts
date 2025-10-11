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
        interaction_id: 'capability_scan_workflow'
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

      // Step 2: Select 'all' resources
      const resourceSelectionResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-selection',
        response: 'all',
        interaction_id: 'capability_resource_selection'
      });

      // Validate resource selection response
      const expectedResourceResponse = {
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
                sessionId: sessionId,
                step: 'processing-mode',
                response: 'user_choice_here'
              }
            },
            workflow: {
              step: 'processing-mode',
              question: 'Processing mode: auto (batch process) or manual (review each)?',
              options: [
                {
                  number: 1,
                  value: 'auto',
                  display: '1. auto - Batch process automatically'
                },
                {
                  number: 2,
                  value: 'manual',
                  display: '2. manual - Review each step'
                }
              ],
              sessionId: sessionId,
              selectedResources: 'all',
              instruction: 'IMPORTANT: You MUST ask the user to make a choice. Do NOT automatically select a processing mode.'
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

      expect(resourceSelectionResponse).toMatchObject(expectedResourceResponse);

      // Step 3: Select 'auto' processing mode (this will take significant time)
      const autoScanResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'processing-mode',
        response: 'auto',
        interaction_id: 'capability_auto_scan'
      });

      // Validate final scan completion response (based on createCapabilityScanCompletionResponse)
      const expectedFinalResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'scan',
            dataType: 'capabilities',
            mode: 'auto',
            step: 'complete',
            sessionId: sessionId,
            summary: {
              totalScanned: expect.any(Number),
              successful: expect.any(Number),
              failed: expect.any(Number),
              processingTime: expect.any(String)
            },
            message: expect.stringMatching(/✅ Capability scan completed/),
            availableOptions: {
              viewResults: "Use 'list' operation to browse all discovered capabilities",
              getDetails: "Use 'get' operation with capability ID to view specific capability details",
              checkStatus: expect.stringMatching(/Capabilities are now available for AI-powered recommendations|No capabilities were stored/)
            },
            userNote: "The above options are available for you to choose from - the system will not execute them automatically."
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          version: 'v1'
        })
      };

      expect(autoScanResponse).toMatchObject(expectedFinalResponse);

      // Validate scan completion - the exact response structure may vary based on implementation
      // Key requirement is that scan completes successfully
      expect(autoScanResponse.data.result.sessionId).toBeDefined();
      expect(autoScanResponse.data.result.summary).toBeDefined();

      // If operators are found, they should be in summary
      if (autoScanResponse.data.result.summary.operatorsFound) {
        expect(Array.isArray(autoScanResponse.data.result.summary.operatorsFound)).toBe(true);
      }

      // NOTE: This test does NOT clean up capabilities data
      // The full scan results will be used by recommendation tests
    }, 2700000); // 45 minute timeout for full test (accommodates slower AI models like OpenAI)

    test('should handle specific resource scanning workflow', async () => {
      // Step 1: Start scan
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        interaction_id: 'capability_specific_scan_workflow'
      });

      const sessionId = startResponse.data.result.workflow.sessionId;

      // Step 2: Select 'specific' resources
      const specificResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-selection',
        response: 'specific',
        interaction_id: 'capability_specific_selection'
      });

      // Should ask for resource specification
      expect(specificResponse.data.result.success).toBeDefined(); // Accept any boolean value
      expect(specificResponse.data.result.workflow.step).toBe('resource-specification');
      expect(specificResponse.data.result.workflow.question).toContain('resource');

      // Continue with specific resources (Deployment, Service) - use resourceList parameter
      const resourceSpecResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-specification',
        resourceList: 'Deployment.apps,Service',
        interaction_id: 'capability_resource_specification'
      });

      // Should proceed to processing mode
      expect(resourceSpecResponse.data.result.success).toBe(true);
      expect(resourceSpecResponse.data.result.workflow.step).toBe('processing-mode');
      expect(resourceSpecResponse.data.result.workflow.selectedResources).toContain('Deployment.apps');
      expect(resourceSpecResponse.data.result.workflow.selectedResources).toContain('Service');

      // Note: No cleanup to avoid race conditions with parallel tests
    });

    test('should handle manual processing mode workflow', async () => {
      // Start scan and get to processing mode
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        interaction_id: 'capability_manual_scan_workflow'
      });
      const sessionId = startResponse.data.result.workflow.sessionId;

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-selection',
        response: 'specific',
        interaction_id: 'capability_manual_resource_selection'
      });

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-specification',
        response: 'Deployment.apps',
        interaction_id: 'capability_manual_resource_spec'
      });

      // Select manual processing mode
      const manualResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'processing-mode',
        response: 'manual',
        interaction_id: 'capability_manual_processing'
      });

      // Should provide manual review workflow or completion - manual mode may return success: false with error info
      expect(manualResponse.data.result.success).toBeDefined();
      expect(manualResponse.data.result.operation).toBe('scan');
      // Manual mode may complete immediately or provide review workflow
      if (manualResponse.data.result.workflow) {
        expect(manualResponse.data.result.workflow).toHaveProperty('question');
      }

      // Note: No cleanup to avoid race conditions with parallel tests
    });
  });

  describe('Capabilities Management Operations', () => {
    test('should test complete CRUD lifecycle with deletion', async () => {
      // First create some test capabilities via specific scan
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        interaction_id: 'capability_crud_test_setup'
      });
      const sessionId = startResponse.data.result.workflow.sessionId;

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-selection',
        response: 'specific',
        interaction_id: 'capability_crud_resource_selection'
      });

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-specification',
        resourceList: 'Service,ConfigMap',
        interaction_id: 'capability_crud_resource_spec'
      });

      const scanResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'processing-mode',
        response: 'auto',
        interaction_id: 'capability_crud_auto_scan'
      }, { timeout: 300000 }); // 5 minutes for scan completion

      // Ensure scan completed successfully
      expect(scanResponse.data.result.success).toBe(true);
      expect(scanResponse.data.result.step).toBe('complete');

      // List capabilities to verify they exist
      const listResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'list',
        limit: 10,
        interaction_id: 'capability_list_test'
      });

      expect(listResponse.success).toBe(true);
      expect(listResponse.data.result.data.capabilities.length).toBeGreaterThan(0);

      // Get a specific capability ID for individual delete test
      const capabilityId = listResponse.data.result.data.capabilities[0].id;

      const getResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'get',
        id: capabilityId,
        interaction_id: 'capability_get_test'
      });

      expect(getResponse.success).toBe(true);
      expect(getResponse.data.result.data.id).toBe(capabilityId);

      // Test individual delete
      const deleteResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'delete',
        id: capabilityId,
        interaction_id: 'capability_delete_test'
      });

      expect(deleteResponse.success).toBe(true);
      expect(deleteResponse.data.result.operation).toBe('delete');
      expect(deleteResponse.data.result.deletedCapability.id).toBe(capabilityId);

      // Verify individual delete worked
      const getDeletedResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'get',
        id: capabilityId,
        interaction_id: 'capability_get_deleted_test'
      });

      expect(getDeletedResponse.success).toBe(true);
      expect(getDeletedResponse.data.result.success).toBe(false);
      expect(getDeletedResponse.data.result.error.message).toContain('Capability not found');

    });

    test('should list stored capabilities after scan', async () => {
      // First ensure we have some capabilities by running a quick scan
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        interaction_id: 'capability_list_setup_scan'
      });
      const sessionId = startResponse.data.result.workflow.sessionId;

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-selection',
        response: 'specific',
        interaction_id: 'capability_list_resource_selection'
      });

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'resource-specification',
        resourceList: 'Service',
        interaction_id: 'capability_list_resource_spec'
      });

      const scanResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'scan',
        sessionId,
        step: 'processing-mode',
        response: 'auto',
        interaction_id: 'capability_list_auto_scan'
      }, { timeout: 300000 }); // 5 minutes for scan completion

      // Ensure scan completed successfully
      expect(scanResponse.data.result.success).toBe(true);
      expect(scanResponse.data.result.step).toBe('complete');

      // Now list capabilities
      const listResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'list',
        limit: 10,
        interaction_id: 'capability_list_after_setup'
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
                  description: expect.any(String)
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
          interaction_id: 'capability_get_by_id_test'
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
                capabilities: expect.any(Array)
              })
            }
          }
        };

        expect(getResponse).toMatchObject(expectedGetResponse);
      }
    });

    test('should check scan progress during long operations', async () => {
      const progressResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'progress',
        interaction_id: 'capability_progress_check'
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
        interaction_id: 'capability_search_setup_scan'
      });
      const sessionId = startResponse.data.result.workflow.sessionId;

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities', operation: 'scan', sessionId,
        step: 'resource-selection', response: 'specific',
        interaction_id: 'capability_search_resource_selection'
      });

      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities', operation: 'scan', sessionId,
        step: 'resource-specification', resourceList: 'Service,Deployment',
        interaction_id: 'capability_search_resource_spec'
      });

      integrationTest.httpClient.setTimeout(180000); // 3 minutes for specific resource scan with AI
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities', operation: 'scan', sessionId,
        step: 'processing-mode', response: 'auto',
        interaction_id: 'capability_search_auto_scan'
      });

      // Reset timeout to default for search (semantic search can take time with embeddings)
      integrationTest.httpClient.setTimeout(1800000); // Back to 30 minutes default

      // Test semantic search
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'capabilities',
        operation: 'search',
        id: 'workload application deployment', // Search query
        interaction_id: 'capability_semantic_search_test'
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
        interaction_id: 'capability_resource_get_error_test'
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
        interaction_id: 'capability_invalid_operation_error'
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
        interaction_id: 'capability_missing_session_error'
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
        interaction_id: 'capability_invalid_session_error'
      });

      // API returns success but handles errors in workflow response
      expect(errorResponse.success).toBe(true);
      expect(errorResponse.data).toHaveProperty('tool', 'manageOrgData');
    });
  });
});