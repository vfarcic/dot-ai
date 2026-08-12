/**
 * Unit Test: localEmbeddings pod scheduling values
 *
 * Tests that nodeSelector, affinity, and tolerations under
 * localEmbeddings render only on the local-embeddings Deployment
 * and only when explicitly configured (empty defaults stay empty).
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
        nodeSelector?: Record<string, string>;
        affinity?: Record<string, unknown>;
        tolerations?: Array<Record<string, unknown>>;
        containers: Array<{ name: string }>;
      };
    };
  };
}

const NODE_SELECTOR_JSON = '{"kubernetes.io/arch":"arm64"}';
const AFFINITY_JSON =
  '{"nodeAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/arch","operator":"In","values":["arm64"]}]}]}}}';
const TOLERATIONS_JSON =
  '[{"key":"kubernetes.io/arch","operator":"Equal","value":"arm64","effect":"NoSchedule"}]';

function helmTemplate(setArgs: string[] = []): unknown[] {
  const chartPath = './charts';
  const args = setArgs.join(' ');
  const cmd = `helm template test-release ${chartPath} ${args} 2>&1`;
  const output = execSync(cmd, { encoding: 'utf-8' });
  return yaml.loadAll(output).filter(Boolean);
}

function findDeployments(
  docs: unknown[],
  nameIncludes?: string
): DeploymentResource[] {
  return docs.filter(
    (doc: unknown) =>
      typeof doc === 'object' &&
      doc !== null &&
      (doc as Record<string, unknown>).kind === 'Deployment' &&
      (!nameIncludes ||
        ((doc as Record<string, unknown>).metadata as Record<string, unknown>)
          ?.name
          ?.toString()
          .includes(nameIncludes))
  ) as DeploymentResource[];
}

function customSchedulingArgs(): string[] {
  return [
    '--set localEmbeddings.enabled=true',
    `--set-json 'localEmbeddings.nodeSelector=${NODE_SELECTOR_JSON}'`,
    `--set-json 'localEmbeddings.affinity=${AFFINITY_JSON}'`,
    `--set-json 'localEmbeddings.tolerations=${TOLERATIONS_JSON}'`,
  ];
}

describe.concurrent('localEmbeddings pod scheduling values', () => {
  test('enabled with empty defaults: nodeSelector, affinity, tolerations absent from pod spec', () => {
    const docs = helmTemplate(['--set localEmbeddings.enabled=true']);
    const leDeploy = findDeployments(docs, 'local-embeddings')[0];
    expect(leDeploy).toBeDefined();

    const podSpec = leDeploy!.spec.template.spec;
    expect(podSpec.nodeSelector).toBeUndefined();
    expect(podSpec.affinity).toBeUndefined();
    expect(podSpec.tolerations).toBeUndefined();
  });

  test('custom values render on Deployment/test-release-local-embeddings', () => {
    const docs = helmTemplate(customSchedulingArgs());
    const leDeploy = findDeployments(docs, 'local-embeddings')[0];
    expect(leDeploy).toBeDefined();
    expect(leDeploy!.metadata.name).toBe('test-release-local-embeddings');

    const podSpec = leDeploy!.spec.template.spec;
    expect(podSpec.nodeSelector).toEqual({
      'kubernetes.io/arch': 'arm64',
    });

    expect(podSpec.affinity).toEqual({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                {
                  key: 'kubernetes.io/arch',
                  operator: 'In',
                  values: ['arm64'],
                },
              ],
            },
          ],
        },
      },
    });

    expect(podSpec.tolerations).toEqual([
      {
        key: 'kubernetes.io/arch',
        operator: 'Equal',
        value: 'arm64',
        effect: 'NoSchedule',
      },
    ]);
  });

  test('scheduling values affect only the local-embeddings Deployment', () => {
    const docs = helmTemplate(customSchedulingArgs());
    const deployments = findDeployments(docs);
    expect(deployments.length).toBeGreaterThan(1);

    const leDeploy = deployments.find(d =>
      d.metadata.name.includes('local-embeddings')
    );
    expect(leDeploy).toBeDefined();
    expect(leDeploy!.spec.template.spec.nodeSelector).toBeDefined();
    expect(leDeploy!.spec.template.spec.affinity).toBeDefined();
    expect(leDeploy!.spec.template.spec.tolerations).toBeDefined();

    const otherDeploys = deployments.filter(
      d => !d.metadata.name.includes('local-embeddings')
    );
    expect(otherDeploys.length).toBeGreaterThan(0);

    for (const deploy of otherDeploys) {
      const podSpec = deploy.spec.template.spec;
      expect(podSpec.nodeSelector).toBeUndefined();
      expect(podSpec.affinity).toBeUndefined();
      expect(podSpec.tolerations).toBeUndefined();
    }
  });
});
