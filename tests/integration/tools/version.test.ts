/**
 * Integration Test: Version Tool
 *
 * Tests the version tool via REST API against a real test cluster.
 * Validates that the tool returns comprehensive system status information.
 *
 * NOTE: Written based on actual API response inspection following PRD best practices.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import packageJson from '../../../package.json';

describe.concurrent('Version Tool Integration', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(() => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });


  describe('System Status via REST API', () => {
    test('should return comprehensive system status with correct structure', async () => {
      // Define expected response structure (based on actual API inspection)
      const expectedVersionResponse = {
        success: true,
        data: {
          tool: 'version',
          executionTime: expect.any(Number), // Variable - execution time varies
          result: {
            status: 'success',
            system: {
              version: {
                version: packageJson.version, // Dynamic - should match actual package.json version
                nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/), // Pattern - Node.js version changes
                platform: process.platform, // Dynamic - actual runtime platform
                arch: process.arch // Dynamic - actual runtime architecture
              },
              vectorDB: {
                connected: true, // Specific - should be connected to Qdrant
                url: 'http://localhost:6335', // Specific - test environment URL
                collections: {
                  patterns: expect.objectContaining({
                    exists: expect.any(Boolean)
                  }),
                  policies: expect.objectContaining({
                    exists: expect.any(Boolean)
                  }),
                  capabilities: expect.objectContaining({
                    exists: expect.any(Boolean)
                  })
                }
              },
              embedding: {
                available: true, // Specific - test environment should have embedding configured
                provider: 'openai', // Specific - using OpenAI for embeddings
                model: 'text-embedding-3-small', // Specific - model name
                dimensions: 1536 // Specific - embedding dimensions
              },
              aiProvider: {
                connected: true, // Specific - should be connected with API key
                keyConfigured: true, // Specific - API key should be configured
                providerType: expect.any(String) // Generic - accepts any configured provider
              },
              kubernetes: {
                connected: true, // Specific - should be connected to our test cluster
                kubeconfig: expect.stringContaining('kubeconfig-test.yaml'), // Pattern - path may vary
                clusterInfo: {
                  context: 'kind-dot-test', // Specific - our test cluster name
                  version: expect.stringMatching(/^v\d+\.\d+\.\d+/), // Pattern - K8s version changes
                  endpoint: expect.stringMatching(/^https:\/\/127\.0\.0\.1:\d+$/) // Pattern - localhost endpoint with port
                }
              },
              capabilities: {
                systemReady: true, // Specific - capability system should be ready
                vectorDBHealthy: true, // Specific - vector DB should be healthy
                collectionAccessible: true, // Specific - collections should be accessible
                storedCount: expect.any(Number), // Variable - stored count varies
                lastDiagnosis: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) // Pattern - ISO timestamp
              },
              kyverno: {
                installed: true, // Specific - Kyverno should be installed
                version: expect.stringMatching(/^\d+\.\d+\.\d+$/), // Pattern - semantic version
                webhookReady: true, // Specific - webhook should be ready
                policyGenerationReady: true // Specific - policy generation should be ready
              },
              nushell: {
                installed: true, // Specific - Nushell should be installed in dev/CI
                version: expect.stringMatching(/^\d+\.\d+\.\d+$/), // Pattern - semantic version
                ready: true // Specific - should be ready in dev/CI
                // error and installationUrl are undefined when ready
              }
            },
            summary: {
              overall: 'healthy', // Specific - test environment should be healthy
              patternSearch: expect.stringMatching(/^(semantic\+keyword|keyword|semantic)$/), // Pattern - search capabilities
              capabilityScanning: 'ready', // Specific - capability scanning should be ready
              kubernetesAccess: 'connected', // Specific - should match kubernetes.connected
              policyGeneration: 'ready', // Specific - policy generation should be ready
              capabilities: expect.arrayContaining([
                'capability-scanning',
                'semantic-search',
                'ai-recommendations',
                'kubernetes-integration',
                'policy-generation'
              ]) // Pattern - should contain all expected capabilities
            },
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) // Pattern - ISO timestamp
          }
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/), // Pattern - ISO timestamp
          requestId: expect.stringMatching(/^rest_\d+_\d+$/), // Pattern - format is predictable
          version: 'v1' // Specific - API version is fixed
        }
      };

      // Call version tool via REST API (POST request as required)
      const response = await integrationTest.httpClient.post('/api/v1/tools/version', {
        interaction_id: 'system_status'
      });

      // Single comprehensive assertion using expected structure
      expect(response).toMatchObject(expectedVersionResponse);
    });

    test('should handle POST method requirement', async () => {
      // Define expected error response structure (based on actual API inspection)
      const expectedErrorResponse = {
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only POST method allowed for tool execution'
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      // Test that GET method is not allowed
      const response = await integrationTest.httpClient.get('/api/v1/tools/version');

      // Single comprehensive assertion using expected structure
      expect(response).toMatchObject(expectedErrorResponse);
    });
  });

  describe('Test Environment Validation', () => {
    test('should use test-specific configuration', async () => {
      // Define expected response structure for test environment validation
      const expectedTestResponse = {
        success: true,
        data: {
          tool: 'version',
          executionTime: expect.any(Number),
          result: {
            status: 'success',
            system: {
              kubernetes: {
                connected: true,
                kubeconfig: expect.stringContaining('kubeconfig-test.yaml'),
                clusterInfo: {
                  context: 'kind-dot-test',
                  version: expect.stringMatching(/^v\d+\.\d+\.\d+/),
                  endpoint: expect.stringMatching(/^https:\/\/127\.0\.0\.1:\d+$/)
                }
              }
            }
          }
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      const response = await integrationTest.httpClient.post('/api/v1/tools/version', {
        interaction_id: 'test_environment_validation'
      });

      // Validate test environment configuration in API response
      expect(response).toMatchObject(expectedTestResponse);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid endpoints gracefully', async () => {
      // Define expected error response structure (based on actual API inspection)
      const expectedErrorResponse = {
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: "Tool 'nonexistent' not found"
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1'
        }
      };

      const response = await integrationTest.httpClient.post('/api/v1/tools/nonexistent', {});

      // Single comprehensive assertion using expected structure
      expect(response).toMatchObject(expectedErrorResponse);
    });
  });
});