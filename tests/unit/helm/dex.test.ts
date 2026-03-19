/**
 * Unit Test: Dex Helm Chart Templates
 *
 * Tests that Dex is disabled by default and that enabling it produces
 * the expected env vars, ingress, and httproute resources.
 *
 * Issue #396: Dex was enabled by default, causing crashes for users
 * without HTTPS. Fix: Dex is now opt-in (dex.enabled: false).
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

interface IngressResource {
  apiVersion: string;
  kind: 'Ingress';
  metadata: {
    name: string;
    annotations?: Record<string, string>;
  };
  spec: {
    rules: Array<{ host: string }>;
  };
}

interface HTTPRouteResource {
  apiVersion: string;
  kind: 'HTTPRoute';
  metadata: { name: string };
}

describe.concurrent('Dex Helm Chart Integration', () => {
  const chartPath = './charts';

  function findResourcesByKind<T>(
    docs: unknown[],
    kind: string,
    nameIncludes?: string
  ): T[] {
    return docs.filter(
      (doc: unknown) =>
        typeof doc === 'object' &&
        doc !== null &&
        'kind' in doc &&
        doc.kind === kind &&
        (!nameIncludes ||
          ('metadata' in doc &&
            typeof (doc as any).metadata?.name === 'string' &&
            (doc as any).metadata.name.includes(nameIncludes)))
    ) as T[];
  }

  function findResourceByKind<T>(
    docs: unknown[],
    kind: string,
    nameIncludes?: string
  ): T | undefined {
    return findResourcesByKind<T>(docs, kind, nameIncludes)[0];
  }

  function helmTemplate(values: Record<string, unknown>): string {
    const setArgs = Object.entries(values)
      .map(([key, value]) => `--set ${key}=${value}`)
      .join(' ');

    try {
      return execSync(`helm template test-auth ${chartPath} ${setArgs}`, {
        encoding: 'utf-8',
      });
    } catch (error: unknown) {
      if (error instanceof Error && 'stderr' in error) {
        return (error as { stderr: string }).stderr || '';
      }
      throw error;
    }
  }

  function parseYamlDocs(output: string): unknown[] {
    return output
      .split('---')
      .map(doc => doc.trim())
      .filter(doc => doc.length > 0)
      .map(doc => yaml.load(doc));
  }

  function getEnvVar(
    deployment: DeploymentResource,
    name: string
  ): string | undefined {
    const container = deployment.spec.template.spec.containers.find(
      c => c.name === 'mcp-server'
    );
    return container?.env?.find(e => e.name === name)?.value;
  }

  describe('Dex Disabled by Default (Issue #396)', () => {
    test('should not set DEX_ISSUER_URL when dex.enabled is default (false)', () => {
      const output = helmTemplate({
        'ingress.enabled': true,
        'ingress.host': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const deployment = findResourceByKind<DeploymentResource>(
        docs,
        'Deployment'
      );

      expect(deployment).toBeDefined();
      const dexIssuerUrl = getEnvVar(deployment!, 'DEX_ISSUER_URL');
      expect(dexIssuerUrl).toBeUndefined();
    });

    test('should not set DOT_AI_EXTERNAL_URL when dex.enabled is default (false)', () => {
      const output = helmTemplate({
        'ingress.enabled': true,
        'ingress.host': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const deployment = findResourceByKind<DeploymentResource>(
        docs,
        'Deployment'
      );

      expect(deployment).toBeDefined();
      const externalUrl = getEnvVar(deployment!, 'DOT_AI_EXTERNAL_URL');
      expect(externalUrl).toBeUndefined();
    });

    test('should not create Dex ingress when dex.enabled is default (false)', () => {
      const output = helmTemplate({
        'ingress.enabled': true,
        'ingress.host': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const dexIngresses = findResourcesByKind<IngressResource>(
        docs,
        'Ingress',
        '-dex'
      );

      expect(dexIngresses).toHaveLength(0);
    });

    test('should not create Dex HTTPRoute when dex.enabled is default (false)', () => {
      const output = helmTemplate({
        'gateway.name': 'cluster-gateway',
        'gateway.listeners.http.hostname': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const dexRoutes = findResourcesByKind<HTTPRouteResource>(
        docs,
        'HTTPRoute',
        '-dex'
      );

      expect(dexRoutes).toHaveLength(0);
    });
  });

  describe('Dex Enabled Explicitly', () => {
    test('should set DEX_ISSUER_URL when dex.enabled=true', () => {
      const output = helmTemplate({
        'dex.enabled': true,
        'dex.existingSecret': 'dex-credentials',
        'dex.adminPasswordHash': '$2a$10$fakehashfortesting',
        'ingress.enabled': true,
        'ingress.tls.enabled': true,
        'ingress.host': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const deployment = findResourceByKind<DeploymentResource>(
        docs,
        'Deployment',
        'test-auth-dot-ai'
      );

      expect(deployment).toBeDefined();
      const dexIssuerUrl = getEnvVar(deployment!, 'DEX_ISSUER_URL');
      expect(dexIssuerUrl).toBe('https://dex.dot-ai.example.com');
    });

    test('should set DOT_AI_EXTERNAL_URL when dex.enabled=true', () => {
      const output = helmTemplate({
        'dex.enabled': true,
        'dex.existingSecret': 'dex-credentials',
        'dex.adminPasswordHash': '$2a$10$fakehashfortesting',
        'ingress.enabled': true,
        'ingress.tls.enabled': true,
        'ingress.host': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const deployment = findResourceByKind<DeploymentResource>(
        docs,
        'Deployment',
        'test-auth-dot-ai'
      );

      expect(deployment).toBeDefined();
      const externalUrl = getEnvVar(deployment!, 'DOT_AI_EXTERNAL_URL');
      expect(externalUrl).toBe('https://dot-ai.example.com');
    });

    test('should use HTTP for DEX_TOKEN_ENDPOINT (in-cluster communication)', () => {
      const output = helmTemplate({
        'dex.enabled': true,
        'dex.existingSecret': 'dex-credentials',
        'dex.adminPasswordHash': '$2a$10$fakehashfortesting',
        'ingress.enabled': true,
        'ingress.tls.enabled': true,
        'ingress.host': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const deployment = findResourceByKind<DeploymentResource>(
        docs,
        'Deployment',
        'test-auth-dot-ai'
      );

      expect(deployment).toBeDefined();
      const tokenEndpoint = getEnvVar(deployment!, 'DEX_TOKEN_ENDPOINT');
      expect(tokenEndpoint).toMatch(/^http:\/\//);
      expect(tokenEndpoint).toContain('.svc.cluster.local:5556/token');
    });

    test('should create Dex ingress when dex.enabled=true and ingress.enabled=true', () => {
      const output = helmTemplate({
        'dex.enabled': true,
        'dex.existingSecret': 'dex-credentials',
        'dex.adminPasswordHash': '$2a$10$fakehashfortesting',
        'ingress.enabled': true,
        'ingress.host': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const dexIngress = findResourceByKind<IngressResource>(
        docs,
        'Ingress',
        '-dex'
      );

      expect(dexIngress).toBeDefined();
      expect(dexIngress?.spec.rules[0].host).toBe('dex.dot-ai.example.com');
    });
  });
});
