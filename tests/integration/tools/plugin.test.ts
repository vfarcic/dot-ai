/**
 * Integration Test: Plugin System (PRD #343)
 *
 * Verifies the Helm chart creates plugin resources correctly.
 * HTTP/functionality testing is done in M4b/M5 when MCP tools use plugins.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

interface PluginConfig {
  name: string;
  url: string;
}

describe.concurrent('Plugin System Integration (PRD #343)', () => {
  const integrationTest = new IntegrationTest();
  let plugins: PluginConfig[] = [];

  beforeAll(async () => {
    // Discover configured plugins from ConfigMap
    const configMapData = await integrationTest.kubectl(
      'get configmap dot-ai-plugins -n dot-ai -o jsonpath="{.data.plugins\\.json}"'
    );

    if (configMapData && configMapData.trim() !== '""') {
      const jsonStr = configMapData.trim().replace(/^"|"$/g, '');
      plugins = JSON.parse(jsonStr);
    }
  });

  test('should have plugins ConfigMap with correct content', async () => {
    expect(plugins.length).toBeGreaterThan(0);

    // Verify each plugin has required fields
    for (const plugin of plugins) {
      expect(plugin.name).toBeDefined();
      expect(plugin.url).toMatch(/^http:\/\//);
    }
  });

  test('should have all configured plugin Deployments ready', async () => {
    for (const plugin of plugins) {
      const deploymentName = `dot-ai-${plugin.name}`;

      const replicas = await integrationTest.kubectl(
        `get deployment ${deploymentName} -n dot-ai -o jsonpath="{.status.availableReplicas}"`
      );

      expect(
        parseInt(replicas.trim(), 10),
        `Plugin ${plugin.name} deployment should be ready`
      ).toBeGreaterThanOrEqual(1);
    }
  });

  test('should have all configured plugin Services', async () => {
    for (const plugin of plugins) {
      const serviceName = `dot-ai-${plugin.name}`;

      const servicePort = await integrationTest.kubectl(
        `get service ${serviceName} -n dot-ai -o jsonpath="{.spec.ports[0].port}"`
      );

      expect(
        parseInt(servicePort.trim(), 10),
        `Plugin ${plugin.name} service should exist`
      ).toBeGreaterThan(0);
    }
  });

  test('should have MCP server with plugins ConfigMap mounted', async () => {
    const volumeMount = await integrationTest.kubectl(
      'get deployment dot-ai -n dot-ai -o jsonpath="{.spec.template.spec.containers[0].volumeMounts[?(@.name==\'plugins-config\')].mountPath}"'
    );

    expect(volumeMount.trim()).toBe('/etc/dot-ai');
  });
});
