/**
 * Unit Test: MCP Server Authentication Helm Chart Templates (PRD #414)
 *
 * Tests that:
 * 1. MCP auth env vars are injected from Secrets when configured
 * 2. MCP servers config JSON includes auth env var names
 * 3. No auth config = backward compatible (no env vars, no auth in JSON)
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
              secretKeyRef?: { name: string; key: string };
            };
          }>;
        }>;
      };
    };
  };
}

interface ConfigMapResource {
  apiVersion: string;
  kind: 'ConfigMap';
  metadata: { name: string };
  data: Record<string, string>;
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

describe.concurrent('MCP Server Authentication Helm Templates (PRD #414)', () => {

  test('no auth config produces no MCP_AUTH env vars (backward compatible)', () => {
    const docs = helmTemplate([
      'mcpServers.prometheus.enabled=true',
      'mcpServers.prometheus.endpoint=http://prometheus:3000/mcp',
      'mcpServers.prometheus.attachTo[0]=query',
    ]);

    const deployments = findResourcesByKind<DeploymentResource>(docs, 'Deployment');
    const mainDeploy = deployments.find(d => !d.metadata.name.includes('plugin') && !d.metadata.name.includes('dex'));
    expect(mainDeploy).toBeDefined();

    const container = mainDeploy!.spec.template.spec.containers.find(c => c.name === 'mcp-server');
    expect(container).toBeDefined();

    const mcpAuthEnvs = container!.env?.filter(e => e.name.startsWith('MCP_AUTH_') || e.name.startsWith('MCP_HEADERS_'));
    expect(mcpAuthEnvs || []).toHaveLength(0);
  });

  test('auth.token.existingSecret injects MCP_AUTH_* env var from Secret', () => {
    const docs = helmTemplate([
      'mcpServers.context-forge.enabled=true',
      'mcpServers.context-forge.endpoint=http://cf:4444/mcp',
      'mcpServers.context-forge.attachTo[0]=query',
      'mcpServers.context-forge.auth.token.existingSecret.name=cf-auth',
      'mcpServers.context-forge.auth.token.existingSecret.key=bearer-token',
    ]);

    const deployments = findResourcesByKind<DeploymentResource>(docs, 'Deployment');
    const mainDeploy = deployments.find(d => !d.metadata.name.includes('plugin') && !d.metadata.name.includes('dex'));
    expect(mainDeploy).toBeDefined();

    const container = mainDeploy!.spec.template.spec.containers.find(c => c.name === 'mcp-server');
    expect(container).toBeDefined();

    const authEnv = container!.env?.find(e => e.name === 'MCP_AUTH_CONTEXT_FORGE');
    expect(authEnv).toBeDefined();
    expect(authEnv!.valueFrom?.secretKeyRef).toEqual({
      name: 'cf-auth',
      key: 'bearer-token',
    });
  });

  test('auth.headers.existingSecret injects MCP_HEADERS_* env var from Secret', () => {
    const docs = helmTemplate([
      'mcpServers.legacy-server.enabled=true',
      'mcpServers.legacy-server.endpoint=http://legacy:8080/mcp',
      'mcpServers.legacy-server.attachTo[0]=operate',
      'mcpServers.legacy-server.auth.headers.existingSecret.name=legacy-auth',
      'mcpServers.legacy-server.auth.headers.existingSecret.key=auth-headers',
    ]);

    const deployments = findResourcesByKind<DeploymentResource>(docs, 'Deployment');
    const mainDeploy = deployments.find(d => !d.metadata.name.includes('plugin') && !d.metadata.name.includes('dex'));
    const container = mainDeploy!.spec.template.spec.containers.find(c => c.name === 'mcp-server');

    const headersEnv = container!.env?.find(e => e.name === 'MCP_HEADERS_LEGACY_SERVER');
    expect(headersEnv).toBeDefined();
    expect(headersEnv!.valueFrom?.secretKeyRef).toEqual({
      name: 'legacy-auth',
      key: 'auth-headers',
    });
  });

  test('MCP servers ConfigMap includes auth env var names in JSON', () => {
    const docs = helmTemplate([
      'mcpServers.context-forge.enabled=true',
      'mcpServers.context-forge.endpoint=http://cf:4444/mcp',
      'mcpServers.context-forge.attachTo[0]=query',
      'mcpServers.context-forge.auth.token.existingSecret.name=cf-auth',
      'mcpServers.context-forge.auth.token.existingSecret.key=bearer-token',
    ]);

    const configMaps = findResourcesByKind<ConfigMapResource>(docs, 'ConfigMap');
    const mcpCm = configMaps.find(cm => cm.metadata.name.includes('mcp-servers'));
    expect(mcpCm).toBeDefined();

    const config = JSON.parse(mcpCm!.data['mcp-servers.json']);
    expect(config).toHaveLength(1);
    expect(config[0].name).toBe('context-forge');
    expect(config[0].auth).toBeDefined();
    expect(config[0].auth.tokenEnvVar).toBe('MCP_AUTH_CONTEXT_FORGE');
  });

  test('no auth in MCP servers ConfigMap when auth not configured', () => {
    const docs = helmTemplate([
      'mcpServers.prometheus.enabled=true',
      'mcpServers.prometheus.endpoint=http://prometheus:3000/mcp',
      'mcpServers.prometheus.attachTo[0]=query',
    ]);

    const configMaps = findResourcesByKind<ConfigMapResource>(docs, 'ConfigMap');
    const mcpCm = configMaps.find(cm => cm.metadata.name.includes('mcp-servers'));
    expect(mcpCm).toBeDefined();

    const config = JSON.parse(mcpCm!.data['mcp-servers.json']);
    expect(config).toHaveLength(1);
    expect(config[0].name).toBe('prometheus');
    expect(config[0].auth).toBeUndefined();
  });

  test('both token and headers auth on same server', () => {
    const docs = helmTemplate([
      'mcpServers.multi-auth.enabled=true',
      'mcpServers.multi-auth.endpoint=http://multi:3000/mcp',
      'mcpServers.multi-auth.attachTo[0]=query',
      'mcpServers.multi-auth.auth.token.existingSecret.name=multi-token',
      'mcpServers.multi-auth.auth.token.existingSecret.key=token',
      'mcpServers.multi-auth.auth.headers.existingSecret.name=multi-headers',
      'mcpServers.multi-auth.auth.headers.existingSecret.key=headers',
    ]);

    const deployments = findResourcesByKind<DeploymentResource>(docs, 'Deployment');
    const mainDeploy = deployments.find(d => !d.metadata.name.includes('plugin') && !d.metadata.name.includes('dex'));
    const container = mainDeploy!.spec.template.spec.containers.find(c => c.name === 'mcp-server');

    const tokenEnv = container!.env?.find(e => e.name === 'MCP_AUTH_MULTI_AUTH');
    const headersEnv = container!.env?.find(e => e.name === 'MCP_HEADERS_MULTI_AUTH');
    expect(tokenEnv).toBeDefined();
    expect(headersEnv).toBeDefined();

    // Also check ConfigMap
    const configMaps = findResourcesByKind<ConfigMapResource>(docs, 'ConfigMap');
    const mcpCm = configMaps.find(cm => cm.metadata.name.includes('mcp-servers'));
    const config = JSON.parse(mcpCm!.data['mcp-servers.json']);
    expect(config[0].auth.tokenEnvVar).toBe('MCP_AUTH_MULTI_AUTH');
    expect(config[0].auth.headersEnvVar).toBe('MCP_HEADERS_MULTI_AUTH');
  });
});
