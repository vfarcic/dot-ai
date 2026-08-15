/**
 * Unit Test: Local embeddings pod scheduling options (Issue #755)
 *
 * Tests that nodeSelector, affinity and tolerations render under
 * spec.template.spec of the local-embeddings Deployment only, and that
 * their empty defaults are omitted from the rendered manifest entirely.
 */

import { describe, test, expect } from 'vitest';
import { execSync } from 'child_process';
import * as yaml from 'js-yaml';

interface PodSpec {
  containers: Array<{
    name: string;
    image: string;
    args?: string[];
  }>;
  nodeSelector?: Record<string, string>;
  affinity?: Record<string, unknown>;
  tolerations?: Array<Record<string, unknown>>;
  terminationGracePeriodSeconds?: number;
}

interface DeploymentResource {
  apiVersion: string;
  kind: 'Deployment';
  metadata: { name: string };
  spec: {
    template: {
      spec: PodSpec;
    };
  };
}

function helmTemplate(setValues: string[] = [], setJsonValues: string[] = []): unknown[] {
  const chartPath = './charts';
  const setArgs = setValues.map(v => `--set ${v}`).join(' ');
  const setJsonArgs = setJsonValues.map(v => `--set-json '${v}'`).join(' ');
  const cmd = `helm template test-release ${chartPath} ${setArgs} ${setJsonArgs} 2>&1`;
  const output = execSync(cmd, { encoding: 'utf-8' });
  return yaml.loadAll(output).filter(Boolean);
}

function findResourcesByKind<T>(docs: unknown[], kind: string, nameIncludes?: string): T[] {
  return docs.filter(
    (doc: unknown) =>
      typeof doc === 'object' &&
      doc !== null &&
      (doc as Record<string, unknown>).kind === kind &&
      (!nameIncludes ||
        ((doc as Record<string, unknown>).metadata as Record<string, unknown>)?.name
          ?.toString()
          .includes(nameIncludes))
  ) as T[];
}

function getLocalEmbeddingsPodSpec(docs: unknown[]): PodSpec {
  const deployments = findResourcesByKind<DeploymentResource>(docs, 'Deployment', 'local-embeddings');
  expect(deployments).toHaveLength(1);
  return deployments[0].spec.template.spec;
}

const AFFINITY_JSON =
  'localEmbeddings.affinity={"nodeAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":' +
  '{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/arch","operator":"In","values":["arm64"]}]}]}}}';

const TOLERATIONS_JSON =
  'localEmbeddings.tolerations=[{"key":"dedicated","operator":"Equal","value":"embeddings","effect":"NoSchedule"},' +
  '{"key":"gpu","operator":"Exists","effect":"NoExecute"}]';

const NODE_SELECTOR_JSON =
  'localEmbeddings.nodeSelector={"kubernetes.io/arch":"arm64","node-pool":"embeddings"}';

describe.concurrent('Local embeddings pod scheduling options (Issue #755)', () => {

  test('defaults: no nodeSelector, affinity or tolerations keys in the pod spec', () => {
    const docs = helmTemplate(['localEmbeddings.enabled=true']);
    const podSpec = getLocalEmbeddingsPodSpec(docs);

    expect(podSpec.nodeSelector).toBeUndefined();
    expect(podSpec.affinity).toBeUndefined();
    expect(podSpec.tolerations).toBeUndefined();
    expect(Object.keys(podSpec)).not.toContain('nodeSelector');
    expect(Object.keys(podSpec)).not.toContain('affinity');
    expect(Object.keys(podSpec)).not.toContain('tolerations');
  });

  test('nodeSelector renders under spec.template.spec with the exact map', () => {
    const docs = helmTemplate(['localEmbeddings.enabled=true'], [NODE_SELECTOR_JSON]);
    const podSpec = getLocalEmbeddingsPodSpec(docs);

    expect(podSpec.nodeSelector).toEqual({
      'kubernetes.io/arch': 'arm64',
      'node-pool': 'embeddings',
    });
    expect(podSpec.affinity).toBeUndefined();
    expect(podSpec.tolerations).toBeUndefined();
  });

  test('tolerations render under spec.template.spec as a list with exact entries', () => {
    const docs = helmTemplate(['localEmbeddings.enabled=true'], [TOLERATIONS_JSON]);
    const podSpec = getLocalEmbeddingsPodSpec(docs);

    expect(podSpec.tolerations).toEqual([
      { key: 'dedicated', operator: 'Equal', value: 'embeddings', effect: 'NoSchedule' },
      { key: 'gpu', operator: 'Exists', effect: 'NoExecute' },
    ]);
    expect(podSpec.nodeSelector).toBeUndefined();
    expect(podSpec.affinity).toBeUndefined();
  });

  test('affinity renders under spec.template.spec preserving nested structure', () => {
    const docs = helmTemplate(['localEmbeddings.enabled=true'], [AFFINITY_JSON]);
    const podSpec = getLocalEmbeddingsPodSpec(docs);

    expect(podSpec.affinity).toEqual({
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                { key: 'kubernetes.io/arch', operator: 'In', values: ['arm64'] },
              ],
            },
          ],
        },
      },
    });
    expect(podSpec.nodeSelector).toBeUndefined();
    expect(podSpec.tolerations).toBeUndefined();
  });

  test('all three set together render correctly and leave the rest of the pod spec unaffected', () => {
    const docs = helmTemplate(
      ['localEmbeddings.enabled=true'],
      [NODE_SELECTOR_JSON, AFFINITY_JSON, TOLERATIONS_JSON]
    );
    const podSpec = getLocalEmbeddingsPodSpec(docs);

    expect(podSpec.nodeSelector).toEqual({
      'kubernetes.io/arch': 'arm64',
      'node-pool': 'embeddings',
    });
    expect(podSpec.affinity?.nodeAffinity).toBeDefined();
    expect(podSpec.tolerations).toHaveLength(2);

    // Rest of the pod spec is untouched
    expect(podSpec.terminationGracePeriodSeconds).toBe(30);
    expect(podSpec.containers).toHaveLength(1);
    const container = podSpec.containers[0];
    expect(container.name).toBe('local-embeddings');
    expect(container.image).toContain('text-embeddings-inference');
    expect(container.args).toEqual([
      '--model-id',
      'sentence-transformers/all-MiniLM-L6-v2',
      '--port',
      '80',
    ]);
  });

  test('isolation: no other Deployment gains nodeSelector, affinity or tolerations', () => {
    const docs = helmTemplate(
      ['localEmbeddings.enabled=true'],
      [NODE_SELECTOR_JSON, AFFINITY_JSON, TOLERATIONS_JSON]
    );

    const deployments = findResourcesByKind<DeploymentResource>(docs, 'Deployment');
    const others = deployments.filter(d => !d.metadata.name.includes('local-embeddings'));
    // Main MCP server Deployment plus at least the agentic-tools plugin Deployment
    expect(others.length).toBeGreaterThanOrEqual(2);

    // The main MCP server Deployment must be among them and unaffected
    const mainDeploy = others.find(
      d => !d.metadata.name.includes('agentic-tools') && !d.metadata.name.includes('dex')
    );
    expect(mainDeploy).toBeDefined();

    for (const deployment of others) {
      const podSpec = deployment.spec.template.spec;
      expect(podSpec.nodeSelector, `${deployment.metadata.name} nodeSelector`).toBeUndefined();
      expect(podSpec.affinity, `${deployment.metadata.name} affinity`).toBeUndefined();
      expect(podSpec.tolerations, `${deployment.metadata.name} tolerations`).toBeUndefined();
    }
  });
});
