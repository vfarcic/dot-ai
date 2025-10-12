/**
 * Integration Test: ManageOrgData - Patterns
 *
 * Tests the organizational patterns functionality via REST API against a real test cluster.
 * Validates pattern creation workflow, CRUD operations, and Vector DB integration.
 *
 * NOTE: Written based on actual API response inspection following PRD best practices.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('ManageOrgData - Patterns Integration', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });


  describe('Pattern Creation Workflow', () => {
    test('should complete full interactive pattern creation workflow', async () => {
      // Step 1: Start pattern creation workflow
      const startResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        interaction_id: 'create_workflow'
      });

      // Validate initial workflow response (based on actual API inspection)
      const expectedStartResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'pattern',
            workflow: {
              sessionId: expect.stringMatching(/^pattern-\d+-[a-f0-9-]+$/), // Actual format: pattern-timestamp-uuid
              entityType: 'pattern',
              prompt: expect.stringContaining('What deployment capability does this pattern provide'), // Exact prompt from pattern-description.md
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

      // Step 2: Provide description response (capability description) - use unique name
      const testId = Date.now();
      const descriptionResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: `Database clustering ${testId}`, // Unique per test execution
        interaction_id: 'description_step'
      });

      const expectedDescriptionResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'pattern',
            workflow: {
              sessionId: sessionId,
              entityType: 'pattern',
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
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'databases, SQL databases, persistent storage, high availability',
        interaction_id: 'triggers_step'
      });

      const expectedTriggersResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'pattern',
            workflow: {
              sessionId: sessionId,
              entityType: 'pattern',
              instruction: expect.stringContaining('Present this complete list of infrastructure types'),
              nextStep: 'resources'
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

      // Step 4: Handle trigger-expansion (AI expands the triggers)
      const triggerExpansionResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'PostgreSQL, MySQL, StatefulSet, PersistentVolume',
        interaction_id: 'trigger_expansion_step'
      });

      const expectedTriggerExpansionResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'pattern',
            workflow: {
              sessionId: sessionId,
              entityType: 'pattern',
              prompt: expect.stringContaining('Kubernetes resources'),
              instruction: expect.stringContaining('Wait for the user'),
              nextStep: 'rationale'
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

      // Step 5: Provide suggested resources
      const resourcesResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'StatefulSet, Service, PersistentVolumeClaim, ConfigMap, Secret',
        interaction_id: 'resources_step'
      });

      const expectedResourcesResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'pattern',
            workflow: {
              sessionId: sessionId,
              entityType: 'pattern',
              prompt: expect.stringContaining('Why does this combination'),
              instruction: expect.stringContaining('Wait for the user'),
              nextStep: 'created-by'
            },
            storage: {},
            message: 'Workflow step ready'
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(resourcesResponse).toMatchObject(expectedResourcesResponse);

      // Step 6: Provide rationale
      const rationaleResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'StatefulSet provides ordered deployment and persistent identity for database pods, while PVC ensures data persistence across pod restarts',
        interaction_id: 'rationale_step'
      });

      const expectedRationaleResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'pattern',
            workflow: {
              sessionId: sessionId,
              entityType: 'pattern',
              prompt: expect.stringContaining('What is your name'),
              instruction: expect.stringContaining('Wait for the user'),
              nextStep: 'review'
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

      // Step 7: Provide creator
      const createdByResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'Integration Test Suite',
        interaction_id: 'created_by_step'
      });

      const expectedCreatedByResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'create',
            dataType: 'pattern',
            workflow: {
              sessionId: sessionId,
              entityType: 'pattern',
              prompt: expect.stringContaining('Please review your pattern'),
              instruction: expect.stringContaining('Present the pattern information for user review'),
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

      expect(createdByResponse).toMatchObject(expectedCreatedByResponse);

      // Step 8: Confirm review to complete pattern creation
      const finalResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'confirm',
        interaction_id: 'final_step'
      });

      // Final response should indicate successful creation with storage info
      const expectedFinalResponse = {
        success: true,
        data: {
          result: {
            success: true,
            message: expect.stringContaining('Pattern created successfully'),
            storage: {
              stored: true,
              patternId: expect.any(String)
            }
          }
        }
      };

      expect(finalResponse).toMatchObject(expectedFinalResponse);

      // Verify pattern is available in Vector DB
      const patternId = finalResponse.data.result.storage.patternId;
      const getResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'get',
        id: patternId,
        interaction_id: 'get_test'
      });

      const expectedGetResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'get',
            dataType: 'pattern',
            data: expect.objectContaining({
              id: patternId,
              description: expect.stringContaining('Database clustering'),
              triggers: expect.arrayContaining(['postgresql', 'mysql', 'statefulset', 'persistentvolume']),
              suggestedResources: expect.arrayContaining(['StatefulSet', 'Service', 'PersistentVolumeClaim', 'ConfigMap', 'Secret']),
              rationale: 'StatefulSet provides ordered deployment and persistent identity for database pods, while PVC ensures data persistence across pod restarts',
              createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
              createdBy: 'Integration Test Suite'
            }),
            message: expect.stringContaining('Retrieved pattern')
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({ version: 'v1' })
      };

      expect(getResponse).toMatchObject(expectedGetResponse);

      // Test LIST operation
      const listResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'list',
        limit: 10,
        interaction_id: 'list_test'
      });

      const expectedListResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'list',
            dataType: 'pattern',
            data: {
              patterns: expect.arrayContaining([
                expect.objectContaining({
                  id: patternId,
                  description: expect.stringContaining('Database clustering'),
                  triggersCount: expect.any(Number),
                  resourcesCount: expect.any(Number),
                  createdAt: expect.any(String),
                  createdBy: 'Integration Test Suite'
                })
              ]),
              limit: 10,
              searchCapabilities: expect.objectContaining({
                mode: 'semantic+keyword hybrid search',
                note: 'Embedding service available',
                provider: expect.any(String),
                semantic: true
              })
            },
            message: expect.stringContaining('Found')
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(listResponse).toMatchObject(expectedListResponse);
      expect(listResponse.data.result.data.patterns.length).toBeGreaterThan(0);

      // Test SEARCH operation using semantic search for our created pattern
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'search',
        id: 'database persistent storage stateful', // Search query in 'id' parameter
        limit: 10,
        interaction_id: 'search_test'
      });

      const expectedSearchResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'search',
            dataType: 'pattern',
            data: expect.objectContaining({
              patterns: expect.arrayContaining([
                expect.objectContaining({
                  id: patternId, // Should find our created pattern
                  description: expect.stringContaining('Database clustering'),
                  relevanceScore: expect.any(Number),
                  resourcesCount: 5,
                  triggersCount: 4
                })
              ]),
              query: 'database persistent storage stateful',
              returnedCount: expect.any(Number),
              totalCount: expect.any(Number)
            }),
            message: expect.stringContaining('Found')
          },
          tool: 'manageOrgData',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(searchResponse).toMatchObject(expectedSearchResponse);
      expect(searchResponse.data.result.data.patterns.length).toBeGreaterThan(0);

      // Verify our pattern appears in search results
      const foundPattern = searchResponse.data.result.data.patterns.find((p: any) => p.id === patternId);
      expect(foundPattern).toBeDefined();
      expect(foundPattern.relevanceScore).toBeGreaterThan(0.5); // Good semantic match

      // Test DELETE operation
      const deleteResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'delete',
        id: patternId,
        interaction_id: 'delete_test'
      });

      const expectedDeleteResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operation: 'delete',
            data: {
              id: patternId
            }
          }
        }
      };

      expect(deleteResponse).toMatchObject(expectedDeleteResponse);

      // Verify deletion - pattern should no longer exist
      const getDeletedResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'get',
        id: patternId,
        interaction_id: 'get_deleted_test'
      });

      const expectedGetDeletedResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: expect.objectContaining({
              message: expect.stringContaining('Pattern not found')
            })
          }
        }
      };

      expect(getDeletedResponse).toMatchObject(expectedGetDeletedResponse);
    }, 300000); // 5 minutes for full CRUD workflow


    test('should validate required parameters during workflow', async () => {
      // Try to continue session without sessionId
      const invalidResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        response: 'some response',
        // Missing sessionId
        interaction_id: 'invalid_session_test'
      });

      // Should start new session instead of failing
      const expectedInvalidResponse = {
        success: true,
        data: {
          result: {
            workflow: expect.objectContaining({
              sessionId: expect.stringMatching(/^pattern-\d+-[a-f0-9-]+$/),
              entityType: 'pattern'
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
        dataType: 'pattern',
        operation: 'invalid-operation',
        interaction_id: 'invalid_operation_error'
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          tool: 'manageOrgData',
          result: {
            error: expect.objectContaining({
              message: expect.stringContaining('invalid-operation')
            })
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing ID for get operation', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'get',
        // Missing id parameter
        interaction_id: 'missing_id_get_error'
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('Pattern ID is required')
            }
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing ID for delete operation', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'delete',
        // Missing id parameter
        interaction_id: 'missing_id_delete_error'
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('Pattern ID is required')
            }
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing search query', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'search',
        // Missing id parameter (search query)
        interaction_id: 'missing_search_query_error'
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('Search query is required')
            }
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle non-existent pattern ID for get operation', async () => {
      const nonExistentId = 'non-existent-pattern-id-12345';

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'get',
        id: nonExistentId,
        interaction_id: 'nonexistent_get_error'
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('Failed to get document')
            }
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle non-existent pattern ID for delete operation', async () => {
      const nonExistentId = 'non-existent-pattern-id-67890';

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'delete',
        id: nonExistentId,
        interaction_id: 'nonexistent_delete_error'
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('Failed to get document')
            }
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should return error when invalid session ID provided', async () => {
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId: 'invalid-session-id-xyz',
        response: 'test response',
        interaction_id: 'invalid_session_id_error'
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