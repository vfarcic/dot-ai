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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe.concurrent('Build Platform Tool - Phase 1: Basic Invocation', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(() => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  describe.concurrent('Script Discovery and Intent Mapping Workflow', () => {
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

      // Step 2: Map specific intent to operation and get ALL parameters
      const intentResponse = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        intent: 'Install Argo CD'
      });

      // Assert success and output full response if failed
      expect(intentResponse.data.result.success, `Intent mapping should succeed. Full response: ${JSON.stringify(intentResponse.data.result, null, 2)}`).toBe(true);

      const expectedIntentResponse = {
        success: true,
        data: {
          result: {
            success: true,
            workflow: {
              sessionId: expect.stringMatching(/^platform-\d+-[a-f0-9-]+$/),
              intent: 'Install Argo CD',
              matchedOperation: {
                tool: 'ArgoCD',
                operation: expect.stringMatching(/^(apply|install|deploy|setup)$/),  // AI models may use synonyms
                command: ['apply', 'argocd'],
                description: expect.any(String)
              },
              parameters: [
                {
                  name: 'host-name',
                  type: 'string',
                  required: false,
                  description: expect.any(String),
                  default: ''
                },
                {
                  name: 'apply-apps',
                  type: 'boolean',
                  required: false,
                  description: expect.any(String),
                  default: true
                },
                {
                  name: 'ingress-class-name',
                  type: 'string',
                  required: false,
                  description: expect.any(String),
                  default: 'traefik'
                }
              ],
              nextStep: 'collectParameters',
              message: expect.stringContaining('parameters')
            }
          },
          tool: 'buildPlatform',
          executionTime: expect.any(Number)
        }
      };

      expect(intentResponse).toMatchObject(expectedIntentResponse);

      // Verify message provides clear guidance to client agent on next steps
      const intentMessage = intentResponse.data.result.workflow.message;
      expect(intentMessage).toContain('stage');
      expect(intentMessage).toContain('submitAnswers');
      expect(intentMessage).toContain('sessionId');
      expect(intentMessage).toContain('answers');
      expect(intentMessage).toContain(intentResponse.data.result.workflow.sessionId);

      // Verify session file was created
      const sessionId = intentResponse.data.result.workflow.sessionId;
      const fs = await import('fs');
      const path = await import('path');
      const sessionPath = path.join(process.cwd(), 'tmp', 'sessions', 'platform', `${sessionId}.json`);
      expect(fs.existsSync(sessionPath)).toBe(true);

      // Verify session file contains expected data
      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      expect(sessionData).toMatchObject({
        sessionId,
        intent: 'Install Argo CD',
        matchedOperation: expect.objectContaining({
          tool: 'ArgoCD',
          command: ['apply', 'argocd']
        }),
        parameters: expect.any(Array),
        answers: {},
        currentStep: 'collectParameters'
      });

      // Step 3: Submit answers - only provide one parameter, let others use defaults
      const submitResponse = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        stage: 'submitAnswers',
        sessionId,
        answers: {
          'host-name': 'argocd.example.com'
          // Skip 'apply-apps' and 'ingress-class-name' to test defaults
        }
      });

      // Assert success and output error if failed
      expect(submitResponse.data.result.success, `Submit failed with error: ${JSON.stringify(submitResponse.data.result.error || submitResponse.data.result, null, 2)}`).toBe(true);

      const expectedSubmitResponse = {
        success: true,
        data: {
          result: {
            success: true,
            execution: {
              tool: 'ArgoCD',
              operation: expect.stringMatching(/^(apply|install|deploy|setup)$/),  // AI models may use synonyms
              status: 'started',
              message: expect.stringContaining('execution started')
            }
          }
        }
      };

      expect(submitResponse).toMatchObject(expectedSubmitResponse);

      // Step 4: Verify ArgoCD namespace was created (validates script executed)
      const { stdout } = await execAsync('kubectl get namespace argocd --no-headers');
      expect(stdout).toContain('argocd');
    }, 300000);

    test('should execute immediately when operation has no parameters', async () => {
      // Step 1: Send intent for operation with no parameters
      const intentResponse = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        intent: 'Install cert-manager'
      });

      // Assert success and output error if failed
      expect(intentResponse.data.result.success, `Execution failed with error: ${JSON.stringify(intentResponse.data.result.error || intentResponse.data.result, null, 2)}`).toBe(true);

      // Should execute immediately without asking for parameters
      const expectedExecutionResponse = {
        success: true,
        data: {
          result: {
            success: true,
            execution: {
              tool: expect.any(String),
              operation: expect.any(String),
              status: 'started',
              message: expect.stringContaining('execution started')
            }
          }
        }
      };

      expect(intentResponse).toMatchObject(expectedExecutionResponse);

      // Verify cert-manager namespace was created
      // Wait a moment for installation to start
      await new Promise(resolve => setTimeout(resolve, 5000));

      const { stdout } = await execAsync('kubectl get namespace cert-manager --no-headers');
      expect(stdout).toContain('cert-manager');
    }, 300000);

    test('should return error when no script matches the intent', async () => {
      // Intent that doesn't match any available operations
      const response = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        intent: 'Install FooBarBaz'
      });

      const expectedNoMatchResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.any(String),
              suggestion: expect.stringContaining('list')
            }
          },
          tool: 'buildPlatform',
          executionTime: expect.any(Number)
        }
      };

      expect(response).toMatchObject(expectedNoMatchResponse);
      // Verify error message mentions the intent
      expect(response.data.result.error.message).toContain('FooBarBaz');
    });

    test('should return error when required parameters are missing in submitAnswers', async () => {
      // First get parameters
      const intentResponse = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        intent: 'Create Kubernetes cluster' // This likely has required parameters
      });

      const sessionId = intentResponse.data.result.workflow.sessionId;
      const parameters = intentResponse.data.result.workflow.parameters;

      // Find if there are any required parameters
      const hasRequiredParams = parameters.some((p: any) => p.required === true);

      if (hasRequiredParams) {
        // Submit answers without required parameters
        const submitResponse = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
          stage: 'submitAnswers',
          sessionId,
          answers: {} // Empty answers - missing required params
        });

        const expectedErrorResponse = {
          success: true,
          data: {
            result: {
              success: false,
              error: {
                message: expect.stringContaining('required'),
                missingParameters: expect.any(Array)
              }
            }
          }
        };

        expect(submitResponse).toMatchObject(expectedErrorResponse);
        expect(submitResponse.data.result.error.missingParameters.length).toBeGreaterThan(0);
      }
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
              message: expect.stringContaining('intent')
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

  describe.concurrent('Nushell Runtime Validation', () => {
    test('should validate Nushell availability before processing', async () => {
      const response = await integrationTest.httpClient.post('/api/v1/tools/buildPlatform', {
        intent: 'Install kro'
      });

      expect(response.success).toBe(true);

      // Two possible outcomes at Phase 1:
      // 1. Nushell available: workflow proceeds (success: true)
      // 2. Nushell NOT available: error with installation instructions (success: false)

      const result = response.data.result;

      if (result.success) {
        // Nushell is available - workflow should proceed
        // kro has no parameters, so it executes immediately
        const expectedSuccessResponse = {
          success: true,
          execution: {
            tool: expect.any(String),
            operation: expect.any(String),
            status: 'started',
            message: expect.stringContaining('execution started')
          }
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
