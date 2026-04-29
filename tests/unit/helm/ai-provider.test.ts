/**
 * Unit Test: AI_PROVIDER Helm Chart Conditional (Issue #474)
 *
 * Verifies the chart conditionally emits the AI_PROVIDER env var so the
 * MCP server's auto-detect 'custom' branch in ai-provider-factory.ts is
 * reachable when ai.provider is empty, and the explicit 'custom' value
 * is forwarded when set.
 */

import { describe, test, expect } from 'vitest';
import { execSync } from 'child_process';
import * as yaml from 'js-yaml';

interface DeploymentResource {
  apiVersion: string;
  kind: 'Deployment';
  metadata: { name: string };
  spec: {
    template: {
      spec: {
        containers: Array<{
          name: string;
          env?: Array<{ name: string; value?: string }>;
        }>;
      };
    };
  };
}

describe.concurrent(
  'AI_PROVIDER Conditional Helm Rendering (Issue #474)',
  () => {
    const chartPath = './charts';

    function helmTemplate(setArgs: string): string {
      return execSync(`helm template test-ai ${chartPath} ${setArgs}`, {
        encoding: 'utf-8',
      });
    }

    function parseYamlDocs(output: string): unknown[] {
      return output
        .split('---')
        .map(doc => doc.trim())
        .filter(doc => doc.length > 0)
        .map(doc => yaml.load(doc));
    }

    function getMcpServerEnv(
      deployment: DeploymentResource,
      name: string
    ): { name: string; value?: string } | undefined {
      const container = deployment.spec.template.spec.containers.find(
        c => c.name === 'mcp-server'
      );
      return container?.env?.find(e => e.name === name);
    }

    function getDeployment(output: string): DeploymentResource {
      const docs = parseYamlDocs(output);
      const deployment = docs.find(
        d =>
          typeof d === 'object' &&
          d !== null &&
          'kind' in d &&
          d.kind === 'Deployment' &&
          'metadata' in d &&
          typeof (d as any).metadata?.name === 'string' &&
          (d as any).metadata.name === 'test-ai-dot-ai'
      ) as DeploymentResource | undefined;
      expect(deployment).toBeDefined();
      return deployment!;
    }

    test('omits AI_PROVIDER env var when ai.provider is empty (auto-detect path)', () => {
      const output = helmTemplate('--set ai.provider=""');
      const deployment = getDeployment(output);

      const aiProvider = getMcpServerEnv(deployment, 'AI_PROVIDER');
      expect(aiProvider).toBeUndefined();
    });

    test('emits AI_PROVIDER=custom when ai.provider=custom', () => {
      const output = helmTemplate(
        '--set ai.provider=custom --set ai.customEndpoint.enabled=true --set ai.customEndpoint.baseURL=https://my.custom.llm/v1'
      );
      const deployment = getDeployment(output);

      const aiProvider = getMcpServerEnv(deployment, 'AI_PROVIDER');
      expect(aiProvider?.value).toBe('custom');
    });

    test('emits AI_PROVIDER=anthropic by default (no breaking change)', () => {
      const output = helmTemplate('');
      const deployment = getDeployment(output);

      const aiProvider = getMcpServerEnv(deployment, 'AI_PROVIDER');
      expect(aiProvider?.value).toBe('anthropic');
    });
  }
);
