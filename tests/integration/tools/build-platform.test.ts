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

  describe('Tool Invocation with Intent', () => {
    test('should accept intent and return workflow response with next steps', async () => {
      // User provides natural language intent
      const response = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        intent: 'Install cert-manager'
      });

      // Expected response structure (consistent with project MCP tool patterns)
      const expectedResponse = {
        success: true,
        data: {
          result: {
            success: true,
            workflow: {
              sessionId: expect.stringMatching(/^platform-\d+-[a-f0-9-]+$/), // Similar to pattern tool format
              intent: 'Install cert-manager', // Echo back the intent
              // At Phase 1, we expect either:
              // - instruction/prompt for next step OR
              // - error about Nushell not available
              nextStep: expect.any(String) // e.g., 'discover', 'parameters', 'execute', etc.
            },
            message: expect.any(String) // Status message like "Workflow started" or "Ready to proceed"
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

      expect(response).toMatchObject(expectedResponse);

      // Validate sessionId format
      const sessionId = response.data.result.workflow.sessionId;
      expect(sessionId).toMatch(/^platform-\d+-[a-f0-9-]+$/);
    });

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
