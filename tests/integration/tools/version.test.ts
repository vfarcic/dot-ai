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
import { CURRENT_MODELS } from '../../../dist/core/model-config.js';

describe.concurrent('Version Tool Integration', () => {
  const integrationTest = new IntegrationTest();

  // Get expected provider and model based on test environment configuration
  const aiProvider = process.env.AI_PROVIDER || 'anthropic';
  const expectedModelName = CURRENT_MODELS[aiProvider as keyof typeof CURRENT_MODELS];

  // All providers use VercelProvider (PRD #238), providerType matches the configured provider
  const expectedProviderType = aiProvider;

  // Detect deployment mode based on MCP_BASE_URL
  const isInClusterMode = process.env.MCP_BASE_URL?.includes('nip.io') || false;

  beforeAll(() => {
    // Verify we're using the test environment (either kubeconfig or in-cluster)
    if (!isInClusterMode) {
      const kubeconfig = process.env.KUBECONFIG;
      expect(kubeconfig).toContain('kubeconfig-test.yaml');
    }
  });


  describe('System Status via REST API', () => {
    test('should return comprehensive system status with correct structure', async () => {
      // Define expected response structure (based on actual API inspection)
      // Adjust expectations based on deployment mode (host vs in-cluster)
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
                platform: isInClusterMode ? 'linux' : process.platform, // In-cluster runs on Linux
                arch: expect.any(String) // Architecture varies
              },
              vectorDB: {
                connected: true, // Specific - should be connected to Qdrant
                url: isInClusterMode
                  ? expect.stringContaining('qdrant') // In-cluster: service DNS (qdrant.dot-ai.svc.cluster.local)
                  : 'http://localhost:6335', // Host mode: localhost
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
                providerType: expectedProviderType, // Specific - validates against AI_PROVIDER env var
                modelName: expectedModelName // Specific - validates against AI_PROVIDER env var
              },
              kubernetes: {
                connected: true, // Specific - should be connected to our test cluster
                kubeconfig: isInClusterMode
                  ? 'in-cluster' // In-cluster: uses service account
                  : expect.stringContaining('kubeconfig-test.yaml'), // Host mode: uses kubeconfig file
                clusterInfo: {
                  context: isInClusterMode ? 'in-cluster' : 'kind-dot-test', // Context differs by mode
                  version: expect.stringMatching(/^v\d+\.\d+\.\d+/), // Pattern - K8s version changes
                  endpoint: isInClusterMode
                    ? expect.stringMatching(/^https:\/\/\d+\.\d+\.\d+\.\d+:\d+$/) // In-cluster: Kubernetes service IP
                    : expect.stringMatching(/^https:\/\/127\.0\.0\.1:\d+$/) // Host mode: localhost with port
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
              }
            },
            summary: {
              overall: 'healthy', // Specific - test environment should be healthy
              patternSearch: expect.stringMatching(/^(semantic\+keyword|keyword|semantic)$/), // Pattern - search capabilities
              capabilityScanning: 'ready', // Specific - capability scanning should be ready
              kubernetesAccess: 'connected', // Specific - should match kubernetes.connected
              policyIntentManagement: 'ready', // Specific - policy intent management should be ready (available without Kyverno)
              kyvernoPolicyGeneration: 'ready', // Specific - Kyverno policy generation should be ready (requires Kyverno)
              capabilities: expect.arrayContaining([
                'policy-intent-management', // Available with Vector DB and embedding service
                'capability-scanning',
                'semantic-search',
                'ai-recommendations',
                'kubernetes-integration',
                'kyverno-policy-generation' // Available only when Kyverno is installed
              ]) // Pattern - should contain all expected capabilities
            },
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/), // Pattern - ISO timestamp
            // PRD #320: Version tool returns visualizationUrl
            visualizationUrl: expect.stringMatching(/^https:\/\/dot-ai-ui\.test\.local\/v\/ver-\d+-[a-f0-9]+$/)
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

      // PRD #320: Verify visualization endpoint works
      // NOTE: This is the ONLY test that validates the visualization endpoint since
      // the version tool is fastest. Other tools just verify visualizationUrl is returned.
      const visualizationUrl = response.data.result.visualizationUrl;
      const vizPath = `/api/v1/visualize/${visualizationUrl.split('/v/')[1]}`;
      const vizResponse = await integrationTest.httpClient.get(vizPath);

      const expectedVizResponse = {
        success: true,
        data: {
          title: expect.any(String),
          visualizations: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              label: expect.any(String),
              type: expect.stringMatching(/^(mermaid|cards|table|code|diff)$/)
            })
          ]),
          insights: expect.arrayContaining([expect.any(String)]),
          toolsUsed: expect.any(Array)
        }
      };

      expect(vizResponse).toMatchObject(expectedVizResponse);

      // Verify visualization is not a fallback error
      expect(vizResponse.data.insights[0]).not.toContain('AI visualization generation failed');

      // PRD #320 Milestone 2.6: Verify validate_mermaid called if Mermaid diagrams present
      const hasMermaid = vizResponse.data.visualizations.some((v: any) => v.type === 'mermaid');
      if (hasMermaid) {
        expect(vizResponse.data.toolsUsed).toContain('validate_mermaid');
      }

      // Verify caching - second request should return cached data instantly
      const cacheStartTime = Date.now();
      const cachedVizResponse = await integrationTest.httpClient.get(vizPath);
      const cachedResponseTime = Date.now() - cacheStartTime;

      // Cached response should be fast (< 1 second vs ~40+ seconds for generation)
      expect(cachedResponseTime).toBeLessThan(1000);

      // Cached response should have same structure and content
      expect(cachedVizResponse).toMatchObject(expectedVizResponse);
      expect(cachedVizResponse.data.title).toBe(vizResponse.data.title);
      expect(cachedVizResponse.data.visualizations.length).toBe(vizResponse.data.visualizations.length);
      expect(cachedVizResponse.data.insights.length).toBe(vizResponse.data.insights.length);
      expect(cachedVizResponse.data.toolsUsed).toEqual(vizResponse.data.toolsUsed);

      // PRD #320 Milestone 2.8: Verify ?reload=true bypasses cache and regenerates
      const reloadStartTime = Date.now();
      const reloadVizResponse = await integrationTest.httpClient.get(`${vizPath}?reload=true`);
      const reloadResponseTime = Date.now() - reloadStartTime;

      // Reload response should take longer than cached (regenerating via AI)
      // Cached was < 1 second, regeneration typically takes 10-60+ seconds
      expect(reloadResponseTime).toBeGreaterThan(1000);

      // Reload response should have valid structure (AI regenerated)
      expect(reloadVizResponse).toMatchObject(expectedVizResponse);
      expect(reloadVizResponse.data.title).toBeDefined();
      expect(reloadVizResponse.data.visualizations.length).toBeGreaterThan(0);

      // Verify reload actually regenerated - toolsUsed should be populated (AI called tools)
      expect(reloadVizResponse.data.toolsUsed).toBeDefined();
      expect(Array.isArray(reloadVizResponse.data.toolsUsed)).toBe(true);

      // Output session ID for manual Web UI verification
      console.log(`\n📊 Version visualization session ID: ${visualizationUrl.split('/v/')[1]}`);
    }, 300000); // Increased timeout for visualization generation + cache + reload tests

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
      // Adjust expectations based on deployment mode
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
                kubeconfig: isInClusterMode
                  ? 'in-cluster'
                  : expect.stringContaining('kubeconfig-test.yaml'),
                clusterInfo: {
                  context: isInClusterMode ? 'in-cluster' : 'kind-dot-test',
                  version: expect.stringMatching(/^v\d+\.\d+\.\d+/),
                  endpoint: isInClusterMode
                    ? expect.stringMatching(/^https:\/\/\d+\.\d+\.\d+\.\d+:\d+$/)
                    : expect.stringMatching(/^https:\/\/127\.0\.0\.1:\d+$/)
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