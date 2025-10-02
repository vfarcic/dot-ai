/**
 * Integration Test: Build Platform Tool - Phase 1
 *
 * Phase 1: Tool invocation with intent and Nushell runtime validation
 * Tests that the tool accepts natural language intent, validates Nushell availability,
 * and returns structured workflow responses.
 *
 * Test Case: "Install cert-manager"
 * - cert-manager NOT currently installed in test cluster
 * - Simple operation: no parameters required for basic installation
 * - Fast: Helm chart installation (~30 seconds)
 * - Safe cleanup: Helm uninstall removes everything
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe('Build Platform Tool - Phase 1: Basic Invocation', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(() => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  describe('Script Discovery and Intent Mapping Workflow', () => {
    test('should complete full workflow: list operations, map intent, handle ambiguous intent', async () => {
      // Step 1: List all available operations
      const listResponse = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        stage: 'list'
      });

      const expectedListResponse = {
        success: true,
        data: {
          result: {
            success: true,
            operations: expect.arrayContaining([
              expect.objectContaining({
                name: expect.any(String),
                description: expect.any(String),
                operations: expect.any(Array)
              })
            ]),
            message: expect.stringContaining('Found')
          },
          tool: 'buildPlatform',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      expect(listResponse).toMatchObject(expectedListResponse);
      expect(listResponse.data.result.operations.length).toBeGreaterThan(0);

      // Verify at least one operation has available actions
      const firstOperation = listResponse.data.result.operations[0];
      expect(firstOperation.operations.length).toBeGreaterThan(0);

      // Verify message provides guidance to client agent
      const message = listResponse.data.result.message;
      expect(message).toContain('numbered list');
      expect(message).toContain('operations');
      expect(message).toContain('intent');
      expect(message).toContain('call this tool again');

      // TODO: Step 2 - Map specific intent to operation
      // TODO: Step 3 - Handle ambiguous intent
    }, 300000);

    test('should return error when intent parameter is missing', async () => {
      // Missing required intent parameter
      const response = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        // No intent provided
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('intent') // Error should mention missing intent
            }
          },
          tool: 'buildPlatform',
          executionTime: expect.any(Number)
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

  describe('Nushell Runtime Validation', () => {
    test('should validate Nushell availability before processing', async () => {
      const response = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        intent: 'Install cert-manager'
      });

      expect(response.success).toBe(true);

      // Two possible outcomes at Phase 1:
      // 1. Nushell available: workflow proceeds (success: true)
      // 2. Nushell NOT available: error with installation instructions (success: false)

      const result = response.data.result;

      if (result.success) {
        // Nushell is available - workflow should proceed
        const expectedSuccessResponse = {
          success: true,
          workflow: {
            sessionId: expect.stringMatching(/^platform-\d+-[a-f0-9-]+$/),
            intent: 'Install cert-manager',
            nextStep: expect.any(String)
          },
          message: expect.any(String)
        };

        expect(result).toMatchObject(expectedSuccessResponse);
      } else {
        // Nushell NOT available - should return helpful error
        const expectedNushellErrorResponse = {
          success: false,
          error: {
            message: expect.stringContaining('Nushell'), // Error mentions Nushell
            installationUrl: expect.stringContaining('nushell.sh') // Provides installation link
          }
        };

        expect(result).toMatchObject(expectedNushellErrorResponse);
      }
    });
  });
});
