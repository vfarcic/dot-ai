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

  // Integration tests always run in-cluster (MCP deployed in Kind, accessed via ingress)


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
                version: packageJson.version,
                nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
                platform: 'linux',
                arch: expect.any(String)
              },
              vectorDB: {
                connected: true,
                url: expect.stringContaining('qdrant'), // Service DNS in-cluster
                collections: {
                  patterns: expect.objectContaining({
                    exists: expect.any(Boolean)
                  }),
                  policies: expect.objectContaining({
                    exists: expect.any(Boolean)
                  }),
                  capabilities: expect.objectContaining({
                    exists: expect.any(Boolean)
                  }),
                  resources: expect.objectContaining({
                    exists: expect.any(Boolean)
                  })
                }
              },
              embedding: {
                available: true,
                provider: 'openai',
                model: 'text-embedding-3-small',
                dimensions: 1536
              },
              aiProvider: {
                connected: true,
                keyConfigured: true,
                providerType: expectedProviderType,
                modelName: expectedModelName
              },
              kubernetes: {
                connected: true,
                kubeconfig: 'in-cluster', // PRD #343: uses plugin
                clusterInfo: {
                  context: 'in-cluster',
                  version: expect.stringMatching(/^v\d+\.\d+\.\d+/)
                  // PRD #343: endpoint not available from kubectl version
                }
              },
              capabilities: {
                systemReady: true,
                vectorDBHealthy: true,
                collectionAccessible: true,
                storedCount: expect.any(Number),
                lastDiagnosis: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
              },
              kyverno: {
                installed: true,
                version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
                webhookReady: true,
                policyGenerationReady: true
              },
              // PRD #343: Plugin stats
              plugins: {
                pluginCount: 1,
                toolCount: 11,
                plugins: [
                  {
                    name: 'agentic-tools',
                    version: '1.0.0',
                    toolCount: 11
                  }
                ]
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

      // PRD #343: Diagnostic assertions for plugin system
      const system = response.data?.result?.system;
      const plugins = system?.plugins;
      const kubernetes = system?.kubernetes;
      const kyverno = system?.kyverno;

      // Plugin system diagnostics
      expect(plugins, 'plugins field missing - PluginManager not passed to handleVersionTool?').toBeDefined();
      expect(plugins?.pluginCount, `Plugin discovery failed: found ${plugins?.pluginCount} plugins. Check plugins.json mounted at /etc/dot-ai/ and plugin service reachable`).toBe(1);
      expect(plugins?.toolCount, `Expected 11 kubectl tools, found ${plugins?.toolCount}. Check agentic-tools registration`).toBe(11);
      expect(plugins?.plugins?.[0]?.name, 'agentic-tools plugin not in discovered plugins').toBe('agentic-tools');

      // Kubernetes via plugin diagnostics
      expect(kubernetes?.connected, `Kubernetes not connected: ${kubernetes?.error || 'unknown'}. kubectl_version tool failed?`).toBe(true);
      expect(kubernetes?.clusterInfo?.version, 'K8s version missing from kubectl_version response').toBeDefined();

      // Kyverno via plugin diagnostics
      expect(kyverno?.installed, `Kyverno not detected: ${kyverno?.error || kyverno?.reason || 'unknown'}`).toBe(true);
      expect(kyverno?.policyGenerationReady, `Kyverno not ready: ${kyverno?.reason || 'unknown'}`).toBe(true);

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
              type: expect.stringMatching(/^(mermaid|cards|table|code|diff|bar-chart)$/)
            })
          ]),
          insights: expect.arrayContaining([expect.any(String)])
          // toolsUsed is optional - only present when AI uses tools during generation
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
      // toolsUsed is optional - only compare if present in original response
      if (vizResponse.data.toolsUsed) {
        expect(cachedVizResponse.data.toolsUsed).toEqual(vizResponse.data.toolsUsed);
      }

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

      // Verify reload actually regenerated - toolsUsed may be populated if AI called tools
      // (toolsUsed is optional and depends on what tools the AI uses during generation)
      if (reloadVizResponse.data.toolsUsed) {
        expect(Array.isArray(reloadVizResponse.data.toolsUsed)).toBe(true);
      }
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
                kubeconfig: 'in-cluster', // PRD #343: uses plugin
                clusterInfo: {
                  context: 'in-cluster',
                  version: expect.stringMatching(/^v\d+\.\d+\.\d+/)
                  // PRD #343: endpoint not available from kubectl version
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