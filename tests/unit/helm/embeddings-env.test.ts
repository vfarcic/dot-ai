/**
 * Unit Test: Embeddings environment variable rendering (Issue #465)
 *
 * Tests that customEndpoint and localEmbeddings env vars never produce
 * duplicate entries in the mcp-server container spec.
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
          env?: Array<{
            name: string;
            value?: string;
            valueFrom?: {
              secretKeyRef?: { name: string; key: string; optional?: boolean };
            };
          }>;
        }>;
      };
    };
  };
}

function helmTemplate(setValues: string[] = []): unknown[] {
  const chartPath = './charts';
  const setArgs = setValues.map(v => `--set ${v}`).join(' ');
  const cmd = `helm template test-release ${chartPath} ${setArgs} 2>&1`;
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

function getMcpServerEnv(docs: unknown[]) {
  const deployments = findResourcesByKind<DeploymentResource>(docs, 'Deployment');
  const mainDeploy = deployments.find(
    d => !d.metadata.name.includes('plugin') && !d.metadata.name.includes('dex') && !d.metadata.name.includes('local-embeddings')
  );
  expect(mainDeploy).toBeDefined();
  const container = mainDeploy!.spec.template.spec.containers.find(c => c.name === 'mcp-server');
  expect(container).toBeDefined();
  return container!.env || [];
}

describe.concurrent('Embeddings env var rendering (Issue #465)', () => {

  test('neither enabled: CUSTOM_EMBEDDINGS_API_KEY from secretKeyRef, no CUSTOM_EMBEDDINGS_BASE_URL', () => {
    const docs = helmTemplate();
    const env = getMcpServerEnv(docs);

    const baseUrlEntries = env.filter(e => e.name === 'CUSTOM_EMBEDDINGS_BASE_URL');
    expect(baseUrlEntries).toHaveLength(0);

    const apiKeyEntries = env.filter(e => e.name === 'CUSTOM_EMBEDDINGS_API_KEY');
    expect(apiKeyEntries).toHaveLength(1);
    expect(apiKeyEntries[0].valueFrom?.secretKeyRef).toBeDefined();

    const dimensionsEntries = env.filter(e => e.name === 'EMBEDDINGS_DIMENSIONS');
    expect(dimensionsEntries).toHaveLength(0);
  });

  test('only customEndpoint: embeddings vars from customEndpoint, API key from secretKeyRef', () => {
    const docs = helmTemplate([
      'ai.customEndpoint.enabled=true',
      'ai.customEndpoint.baseURL=https://my-llm:443/v1',
      'ai.customEndpoint.embeddingsBaseURL=https://my-embeddings:443/v1',
      'ai.customEndpoint.embeddingsModel=custom-embed',
      'ai.customEndpoint.embeddingsDimensions=768',
    ]);
    const env = getMcpServerEnv(docs);

    // CUSTOM_EMBEDDINGS_BASE_URL from customEndpoint
    const baseUrlEntries = env.filter(e => e.name === 'CUSTOM_EMBEDDINGS_BASE_URL');
    expect(baseUrlEntries).toHaveLength(1);
    expect(baseUrlEntries[0].value).toBe('https://my-embeddings:443/v1');

    // CUSTOM_EMBEDDINGS_API_KEY from secretKeyRef
    const apiKeyEntries = env.filter(e => e.name === 'CUSTOM_EMBEDDINGS_API_KEY');
    expect(apiKeyEntries).toHaveLength(1);
    expect(apiKeyEntries[0].valueFrom?.secretKeyRef).toBeDefined();

    // EMBEDDINGS_MODEL and EMBEDDINGS_DIMENSIONS from customEndpoint
    const modelEntries = env.filter(e => e.name === 'EMBEDDINGS_MODEL');
    expect(modelEntries).toHaveLength(1);
    expect(modelEntries[0].value).toBe('custom-embed');

    const dimEntries = env.filter(e => e.name === 'EMBEDDINGS_DIMENSIONS');
    expect(dimEntries).toHaveLength(1);
    expect(dimEntries[0].value).toBe('768');
  });

  test('only localEmbeddings: embeddings vars from local service, dummy API key', () => {
    const docs = helmTemplate([
      'localEmbeddings.enabled=true',
    ]);
    const env = getMcpServerEnv(docs);

    // CUSTOM_EMBEDDINGS_BASE_URL points to local service
    const baseUrlEntries = env.filter(e => e.name === 'CUSTOM_EMBEDDINGS_BASE_URL');
    expect(baseUrlEntries).toHaveLength(1);
    expect(baseUrlEntries[0].value).toContain('local-embeddings');
    expect(baseUrlEntries[0].value).toContain('/v1');

    // CUSTOM_EMBEDDINGS_API_KEY is the dummy value (no secretKeyRef duplicate)
    const apiKeyEntries = env.filter(e => e.name === 'CUSTOM_EMBEDDINGS_API_KEY');
    expect(apiKeyEntries).toHaveLength(1);
    expect(apiKeyEntries[0].value).toBe('local-embeddings-no-key-required');

    // EMBEDDINGS_DIMENSIONS from localEmbeddings
    const dimEntries = env.filter(e => e.name === 'EMBEDDINGS_DIMENSIONS');
    expect(dimEntries).toHaveLength(1);
    expect(dimEntries[0].value).toBe('384');
  });

  test('both enabled: localEmbeddings wins for embeddings, customEndpoint still sets LLM vars', () => {
    const docs = helmTemplate([
      'ai.customEndpoint.enabled=true',
      'ai.customEndpoint.baseURL=https://my-llm:443/v1',
      'ai.customEndpoint.embeddingsBaseURL=https://my-embeddings:443/v1',
      'ai.customEndpoint.embeddingsDimensions=768',
      'ai.customEndpoint.headers={"X-Custom":"val"}',
      'localEmbeddings.enabled=true',
    ]);
    const env = getMcpServerEnv(docs);

    // CUSTOM_EMBEDDINGS_BASE_URL from localEmbeddings (not customEndpoint)
    const baseUrlEntries = env.filter(e => e.name === 'CUSTOM_EMBEDDINGS_BASE_URL');
    expect(baseUrlEntries).toHaveLength(1);
    expect(baseUrlEntries[0].value).toContain('local-embeddings');

    // CUSTOM_EMBEDDINGS_API_KEY is the dummy value (exactly one entry)
    const apiKeyEntries = env.filter(e => e.name === 'CUSTOM_EMBEDDINGS_API_KEY');
    expect(apiKeyEntries).toHaveLength(1);
    expect(apiKeyEntries[0].value).toBe('local-embeddings-no-key-required');

    // EMBEDDINGS_DIMENSIONS from localEmbeddings (not customEndpoint)
    const dimEntries = env.filter(e => e.name === 'EMBEDDINGS_DIMENSIONS');
    expect(dimEntries).toHaveLength(1);
    expect(dimEntries[0].value).toBe('384');

    // CUSTOM_LLM_BASE_URL still rendered from customEndpoint
    const llmBaseUrl = env.filter(e => e.name === 'CUSTOM_LLM_BASE_URL');
    expect(llmBaseUrl).toHaveLength(1);
    expect(llmBaseUrl[0].value).toBe('https://my-llm:443/v1');

    // CUSTOM_LLM_HEADERS still rendered from customEndpoint
    const llmHeaders = env.filter(e => e.name === 'CUSTOM_LLM_HEADERS');
    expect(llmHeaders).toHaveLength(1);
  });

  test('no env var name appears more than once in the container spec', () => {
    const docs = helmTemplate([
      'ai.customEndpoint.enabled=true',
      'ai.customEndpoint.baseURL=https://my-llm:443/v1',
      'ai.customEndpoint.embeddingsBaseURL=https://my-embeddings:443/v1',
      'ai.customEndpoint.embeddingsDimensions=768',
      'localEmbeddings.enabled=true',
    ]);
    const env = getMcpServerEnv(docs);

    const names = env.map(e => e.name);
    const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
    expect(duplicates).toEqual([]);
  });
});
