/**
 * Integration Test: ManageOrgData - Policies
 *
 * Tests the policy intents functionality via REST API against a real test cluster.
 * Validates policy creation workflow, CRUD operations, and Vector DB integration.
 *
 * NOTE: Written based on actual API response inspection following PRD best practices.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('ManageOrgData - Policies Integration', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');

    // Verify we're using Haiku model for tests
    expect(process.env.MODEL).toBe('claude-3-haiku-20240307');

    // Clean state once before all tests
    // 1. Delete all Kyverno ClusterPolicies with policy-intent labels (clean cluster state)
    await integrationTest.kubectl('delete clusterpolicy -l policy-intent/id --ignore-not-found=true');

    // 2. Delete all policy intents from Vector DB
    await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
      dataType: 'policy',
      operation: 'deleteAll'
    });
  });


  describe('Policy Creation Workflow', () => {
    test('should complete full interactive policy creation workflow', async () => {
      // Step 1: Start policy creation workflow with pre-populated capabilities collection
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        collection: 'capabilities-policies' // Use pre-populated collection for Kyverno generation
      });

      // Validate initial workflow response (based on actual API inspection)
      const expectedStartResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            workflow: {
              sessionId: expect.stringMatching(/^policy-\d+-[a-f0-9-]+$/), // Actual format: policy-timestamp-uuid
              entityType: 'policy',
              prompt: expect.stringContaining('What policy requirement'), // Exact prompt from policy-description.md
              instruction: expect.stringContaining('Wait for the user to provide'), // Standard instruction text
              nextStep: 'triggers' // First step is description, so next should be triggers
            },
            storage: {},
            message: 'Workflow step ready'
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
      const nextStep = startResponse.data.result.workflow.nextStep;

      // Step 2: Provide description response (policy intent description) - use unique name
      const testId = Date.now();
      const descriptionResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: `All pods must have resource limits ${testId}` // Unique per test execution
      });

      const expectedDescriptionResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            workflow: {
              sessionId: sessionId,
              entityType: 'policy',
              instruction: expect.stringContaining('Wait for the user to provide infrastructure type keywords'),
              nextStep: 'trigger-expansion'
            },
            storage: {},
            message: 'Workflow step ready'
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

      expect(descriptionResponse).toMatchObject(expectedDescriptionResponse);

      // Step 3: Provide infrastructure triggers
      const triggersResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'pods, containers, resource management, limits'
      });

      const expectedTriggersResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            workflow: {
              sessionId: sessionId,
              entityType: 'policy',
              instruction: expect.stringContaining('Present this complete list of infrastructure types'),
              nextStep: 'rationale' // Policies skip resources step (no suggestedResources field)
            },
            storage: {}, // Still empty during workflow
            message: 'Workflow step ready'
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

      expect(triggersResponse).toMatchObject(expectedTriggersResponse);

      // Step 4: Handle trigger-expansion (user selects final triggers)
      const triggerExpansionResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'Pod, Container, Deployment, ResourceQuota'
      });

      const expectedTriggerExpansionResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            workflow: {
              sessionId: sessionId,
              entityType: 'policy',
              prompt: expect.stringContaining('Why'),
              instruction: expect.stringContaining('Wait for the user'),
              nextStep: 'created-by' // Goes directly to created-by after trigger selection
            },
            storage: {},
            message: 'Workflow step ready'
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(triggerExpansionResponse).toMatchObject(expectedTriggerExpansionResponse);

      // Step 5: Provide rationale
      const rationaleResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'Resource limits prevent pods from consuming excessive CPU and memory, ensuring fair resource allocation across all workloads'
      });

      const expectedRationaleResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            workflow: {
              sessionId: sessionId,
              entityType: 'policy',
              prompt: expect.stringContaining('Who should be credited'),
              instruction: expect.stringContaining('Wait for the user'),
              nextStep: 'namespace-scope'
            },
            storage: {},
            message: 'Workflow step ready'
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(rationaleResponse).toMatchObject(expectedRationaleResponse);

      // Step 6: Provide creator
      const createdByResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'Integration Test Suite'
      });

      const expectedCreatedByResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            workflow: {
              sessionId: sessionId,
              entityType: 'policy',
              instruction: expect.stringContaining('namespace scope'),
              nextStep: 'kyverno-generation'
            },
            storage: {},
            message: 'Workflow step ready'
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(createdByResponse).toMatchObject(expectedCreatedByResponse);

      // Step 7: Provide namespace scope (cluster-wide) - now goes directly to complete
      const namespaceScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'all'
      });

      const expectedNamespaceScopeResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            workflow: {
              sessionId: sessionId,
              entityType: 'policy',
              nextStep: 'complete' // Goes straight to complete after Kyverno generation
            },
            storage: {},
            message: 'Workflow step ready'
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(namespaceScopeResponse).toMatchObject(expectedNamespaceScopeResponse);

      // Step 8: Apply policy to cluster (final step)
      // After namespace scope, nextStep is 'complete' with review prompt showing generated Kyverno policy
      // User responds with deployment choice: 'apply-to-cluster', 'store-intent-only', or cancel
      const finalResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'apply-to-cluster' // Deploy to cluster and store in Vector DB
      });

      const expectedFinalResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            message: expect.stringContaining('Policy'),
            storage: {
              stored: true,
              policyId: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/) // UUID format
            }
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(finalResponse).toMatchObject(expectedFinalResponse);

      // Get policy ID for subsequent checks
      const policyId = finalResponse.data.result.storage.policyId;

      // Verify Kyverno ClusterPolicy was deployed to the cluster
      const clusterPolicies = await integrationTest.kubectl(
        `get clusterpolicy -l policy-intent/id=${policyId} -o json`
      );
      const policies = JSON.parse(clusterPolicies);
      expect(policies.items).toBeDefined();
      expect(policies.items.length).toBeGreaterThan(0);

      const deployedPolicy = policies.items[0];
      expect(deployedPolicy.metadata.labels['policy-intent/id']).toBe(policyId);

      // Verify policy is available in Vector DB
      const getResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'get',
        id: policyId
      });

      const expectedGetResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'get',
            dataType: 'policy',
            message: 'Policy intent retrieved successfully',
            policyIntent: expect.objectContaining({
              id: policyId,
              description: expect.stringContaining('pods must have resource limits'),
              triggers: expect.arrayContaining(['pod', 'container', 'deployment']),
              rationale: 'Resource limits prevent pods from consuming excessive CPU and memory, ensuring fair resource allocation across all workloads',
              createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
              createdBy: 'Integration Test Suite'
            })
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(getResponse).toMatchObject(expectedGetResponse);

      // Test LIST operation
      const listResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'list',
        limit: 10
      });

      const expectedListResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'list',
            dataType: 'policy',
            message: expect.stringContaining('Found'),
            policyIntents: expect.arrayContaining([
              expect.objectContaining({
                id: policyId,
                description: expect.stringContaining('pods must have resource limits'),
                triggers: expect.arrayContaining(['pod', 'container', 'deployment']),
                rationale: 'Resource limits prevent pods from consuming excessive CPU and memory, ensuring fair resource allocation across all workloads',
                createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
                createdBy: 'Integration Test Suite'
              })
            ]),
            totalCount: expect.any(Number)
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(listResponse).toMatchObject(expectedListResponse);
      expect(listResponse.data.result.policyIntents.length).toBeGreaterThan(0);

      // Test SEARCH operation using semantic search for our created policy
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'search',
        id: 'resource limits pods containers', // Search query in 'id' parameter
        limit: 10
      });

      const expectedSearchResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'search',
            dataType: 'policy',
            message: expect.stringContaining('Found'),
            policyIntents: expect.arrayContaining([
              expect.objectContaining({
                id: policyId,
                description: expect.stringContaining('pods must have resource limits'),
                triggers: expect.arrayContaining(['pod', 'container', 'deployment']),
                rationale: 'Resource limits prevent pods from consuming excessive CPU and memory, ensuring fair resource allocation across all workloads',
                createdBy: 'Integration Test Suite'
              })
            ]),
            searchResults: expect.arrayContaining([
              expect.objectContaining({
                policyIntent: expect.objectContaining({
                  id: policyId
                }),
                score: expect.any(Number)
              })
            ])
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(searchResponse).toMatchObject(expectedSearchResponse);
      expect(searchResponse.data.result.policyIntents.length).toBeGreaterThan(0);

      // Verify our policy appears in search results with good score
      const foundResult = searchResponse.data.result.searchResults.find((r: any) => r.policyIntent.id === policyId);
      expect(foundResult).toBeDefined();
      expect(foundResult.score).toBeGreaterThan(0.5); // Good semantic match

      // Test DELETE operation - first call asks for confirmation
      const deleteInitialResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'delete',
        id: policyId
      });

      const expectedDeleteInitialResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'delete',
            dataType: 'policy',
            requiresConfirmation: true,
            message: 'Policy intent has deployed Kyverno policies that need cleanup decision',
            confirmation: expect.objectContaining({
              question: expect.stringContaining('What would you like to do'),
              options: expect.arrayContaining(['Delete everything', 'Keep Kyverno policies'])
            }),
            policyIntent: expect.objectContaining({
              id: policyId
            }),
            kyvernoPolicies: expect.any(Array)
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(deleteInitialResponse).toMatchObject(expectedDeleteInitialResponse);

      // Store Kyverno policy name before deletion
      const kyvernoPolicyName = deleteInitialResponse.data.result.kyvernoPolicies[0].name;

      // Respond to delete confirmation - choose to delete everything (Kyverno policies too)
      const deleteFinalResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'delete',
        id: policyId,
        response: 'Delete everything'
      });

      const expectedDeleteFinalResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'delete',
            dataType: 'policy',
            message: expect.stringContaining('Policy intent deleted successfully'),
            deletedPolicyIntent: expect.objectContaining({
              id: policyId,
              description: expect.stringContaining('pods must have resource limits')
            }),
            kyvernoCleanup: expect.objectContaining({
              successful: expect.any(Array),
              failed: expect.any(Array)
            })
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(deleteFinalResponse).toMatchObject(expectedDeleteFinalResponse);

      // Validate that Kyverno ClusterPolicy was removed from cluster
      const checkKyvernoResult = await integrationTest.kubectl(
        `get clusterpolicy ${kyvernoPolicyName} --ignore-not-found -o json`
      );
      expect(checkKyvernoResult.trim()).toBe(''); // Should be empty - policy deleted

      // Verify deletion - policy should no longer exist
      const getDeletedResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'get',
        id: policyId
      });

      const expectedGetDeletedResponse = {
        success: true,
        data: {
          result: {
            success: false,
            operation: 'get',
            dataType: 'policy',
            message: expect.stringContaining('Policy intent not found'),
            error: 'Policy intent not found'
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(getDeletedResponse).toMatchObject(expectedGetDeletedResponse);
    }, 300000); // 5 minutes for full CRUD workflow

    test('should create policy intent without deploying Kyverno policies (store-intent-only)', async () => {
      // Start policy creation workflow
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        collection: 'capabilities-policies'
      });

      const sessionId = startResponse.data.result.workflow.sessionId;

      // Complete all workflow steps quickly
      // Step 2: Description
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'All deployments must specify replica count for high availability'
      });

      // Step 3: Triggers
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'deployment, replica, replicas'
      });

      // Step 4: Trigger expansion (confirm/select final triggers)
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'deployment, replica, replicas'
      });

      // Step 5: Rationale
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'Ensures high availability by requiring multiple instances'
      });

      // Step 6: Created By
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'Integration Test - Store Only'
      });

      // Step 7: Namespace scope - Kyverno generation happens automatically, returns with nextStep: 'complete'
      const namespaceScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'all'
      });

      // Verify we're at complete step with Kyverno policy generated
      const expectedNamespaceScopeResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            workflow: {
              sessionId,
              entityType: 'policy',
              nextStep: 'complete'
            },
            storage: {},
            message: 'Workflow step ready'
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(namespaceScopeResponse).toMatchObject(expectedNamespaceScopeResponse);

      // At complete step, choose to store intent only (not deploy to cluster)
      const finalResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId,
        response: 'store-intent-only'
      });

      const expectedFinalResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'policy',
            message: expect.stringContaining('Policy created and stored successfully'),
            storage: {
              stored: true,
              policyId: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
            },
            workflow: {
              sessionId,
              entityType: 'policy',
              data: expect.objectContaining({
                policy: expect.objectContaining({
                  id: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
                  description: 'All deployments must specify replica count for high availability',
                  triggers: expect.arrayContaining(['deployment', 'replica', 'replicas']),
                  rationale: 'Ensures high availability by requiring multiple instances',
                  createdBy: 'Integration Test - Store Only',
                  createdAt: expect.any(String),
                  deployedPolicies: []
                }),
                applied: false
              })
            }
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(finalResponse).toMatchObject(expectedFinalResponse);

      const policyId = finalResponse.data.result.storage.policyId;

      // Verify NO Kyverno policies were deployed to cluster
      const clusterPolicies = await integrationTest.kubectl(
        `get clusterpolicy -l policy-intent/id=${policyId} -o json`
      );
      const policies = JSON.parse(clusterPolicies);

      const expectedClusterPolicies = {
        items: expect.arrayContaining([])
      };

      expect(policies).toMatchObject(expectedClusterPolicies);
      expect(policies.items.length).toBe(0); // Should be empty - no deployment

      // Verify policy intent exists in Vector DB
      const getResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'get',
        id: policyId
      });

      const expectedGetResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'get',
            dataType: 'policy',
            message: expect.stringContaining('Policy intent retrieved successfully'),
            policyIntent: expect.objectContaining({
              id: policyId,
              description: expect.stringContaining('deployments must specify replica count'),
              createdBy: 'Integration Test - Store Only'
            })
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(getResponse).toMatchObject(expectedGetResponse);

      // Delete policy - should NOT require confirmation since no Kyverno policies deployed
      const deleteResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'delete',
        id: policyId
      });

      const expectedDeleteResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'delete',
            dataType: 'policy',
            message: expect.stringContaining('Policy intent deleted successfully'),
            deletedPolicyIntent: expect.objectContaining({
              id: policyId
            })
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(deleteResponse).toMatchObject(expectedDeleteResponse);
      expect(deleteResponse.data.result.requiresConfirmation).toBeUndefined(); // No confirmation needed

      // Verify deletion from Vector DB
      const getDeletedResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'get',
        id: policyId
      });

      const expectedGetDeletedResponse = {
        success: true,
        data: {
          result: {
            success: false,
            operation: 'get',
            dataType: 'policy',
            message: expect.stringContaining('Policy intent not found'),
            error: 'Policy intent not found'
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(getDeletedResponse).toMatchObject(expectedGetDeletedResponse);
    }, 120000); // 2 minutes for store-only workflow

    test('should validate required parameters during workflow', async () => {
      // Try to continue session without sessionId
      const invalidResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        response: 'some response'
        // Missing sessionId
      });

      // Should start new session instead of failing
      const expectedInvalidResponse = {
        success: true,
        data: {
          result: {
            workflow: expect.objectContaining({
              sessionId: expect.stringMatching(/^policy-\d+-[a-f0-9-]+$/),
              entityType: 'policy'
            })
          }
        }
      };

      expect(invalidResponse).toMatchObject(expectedInvalidResponse);
    });
  });


  describe('Error Handling', () => {
    test('should handle invalid operation gracefully', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'invalid-operation'
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          tool: 'manageOrgData',
          result: {
            error: expect.stringContaining('Unsupported operation')
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing ID for get operation', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'get'
        // Missing id parameter
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: expect.stringContaining('Missing required parameter: id')
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing ID for delete operation', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'delete'
        // Missing id parameter
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: expect.stringContaining('Missing required parameter: id')
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing search query', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'search'
        // Missing id parameter (search query)
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: expect.stringContaining('Missing required parameter: id')
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle non-existent policy ID for get operation', async () => {
      const nonExistentId = 'non-existent-policy-id-12345';

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'get',
        id: nonExistentId
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: expect.objectContaining({
              message: expect.stringContaining('Failed to get document')
            })
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle non-existent policy ID for delete operation', async () => {
      const nonExistentId = 'non-existent-policy-id-67890';

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'delete',
        id: nonExistentId
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: expect.stringContaining('Failed to get document')
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should return error when invalid session ID provided', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'policy',
        operation: 'create',
        sessionId: 'invalid-session-id-xyz',
        response: 'test response'
      });

      // Should return error about invalid session
      const expectedResponse = {
        success: true,
        data: {
          tool: 'manageOrgData',
          result: {
            error: expect.objectContaining({
              message: expect.stringContaining('invalid-session-id-xyz')
            })
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedResponse);
    });
  });

});