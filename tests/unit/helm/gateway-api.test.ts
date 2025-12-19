/**
 * Unit Test: Gateway API Helm Chart Templates
 *
 * Tests Gateway API Helm chart templates to ensure they render correctly
 * and validate mutual exclusivity with Ingress.
 *
 * NOTE: These tests validate Helm template rendering, not actual Gateway API deployment,
 * since Gateway API CRDs and controllers may not be available in all test environments.
 */

import { describe, test, expect } from 'vitest';
import { execSync } from 'child_process';
import * as yaml from 'js-yaml';
import { readFileSync } from 'fs';

/**
 * Type definitions for Kubernetes Gateway API resources
 */
interface Listener {
  name: string;
  protocol: string;
  port: number;
  hostname?: string;
  tls?: {
    mode: string;
    certificateRefs?: Array<{ name: string; kind: string }>;
  };
}

interface GatewayResource {
  apiVersion: string;
  kind: 'Gateway';
  metadata: {
    name: string;
    annotations?: Record<string, string>;
  };
  spec: {
    gatewayClassName: string;
    listeners: Listener[];
  };
}

interface HTTPRouteResource {
  apiVersion: string;
  kind: 'HTTPRoute';
  metadata: {
    name: string;
  };
  spec: {
    parentRefs: Array<{ name: string; kind: string }>;
    rules: Array<{
      timeouts?: { request: string; backendRequest: string };
      backendRefs: Array<{ name: string; port: number }>;
    }>;
    hostnames?: string[];
  };
}

interface IngressResource {
  kind: 'Ingress';
}

describe.concurrent('Gateway API Helm Chart Integration', () => {
  const chartPath = './charts';

  /**
   * Helper function to find a resource by kind in parsed YAML documents
   */
  function findResourceByKind<T>(docs: unknown[], kind: string): T | undefined {
    return docs.find(
      (doc: unknown) =>
        typeof doc === 'object' &&
        doc !== null &&
        'kind' in doc &&
        doc.kind === kind
    ) as T | undefined;
  }

  /**
   * Helper function to run helm template and parse output
   */
  function helmTemplate(values: Record<string, unknown>): string {
    const setArgs = Object.entries(values)
      .map(([key, value]) => `--set ${key}=${value}`)
      .join(' ');
    
    try {
      const output = execSync(
        `helm template test-gateway ${chartPath} ${setArgs}`,
        { encoding: 'utf-8' }
      );
      return output;
    } catch (error: unknown) {
      if (error instanceof Error && 'stdout' in error) {
        // Helm validation errors come through stdout
        return (error as { stdout: string }).stdout || '';
      }
      throw error;
    }
  }

  /**
   * Helper function to parse YAML documents from Helm output
   */
  function parseYamlDocs(output: string): unknown[] {
    return output
      .split('---')
      .map(doc => doc.trim())
      .filter(doc => doc.length > 0)
      .map(doc => yaml.load(doc));
  }

  describe('Gateway Resource Template', () => {
    test('should render Gateway resource when gateway.enabled=true', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.http.hostname': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      expect(gateway?.apiVersion).toBe('gateway.networking.k8s.io/v1');
      expect(gateway?.kind).toBe('Gateway');
      expect(gateway?.metadata.name).toContain('dot-ai');
      expect(gateway?.spec.gatewayClassName).toBe('istio');
      expect(gateway?.spec.listeners).toHaveLength(1); // Only HTTP listener
    });

    test('should render Gateway with HTTP listener on port 80', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.http.enabled': true,
        'gateway.listeners.http.hostname': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      const httpListener = gateway?.spec.listeners.find(l => l.name === 'http');
      expect(httpListener).toBeDefined();
      expect(httpListener?.protocol).toBe('HTTP');
      expect(httpListener?.port).toBe(80);
      expect(httpListener?.hostname).toBe('dot-ai.example.com');
    });

    test('should render Gateway with HTTPS listener on port 443', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.https.enabled': true,
        'gateway.listeners.https.hostname': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      const httpsListener = gateway?.spec.listeners.find(l => l.name === 'https');
      expect(httpsListener).toBeDefined();
      expect(httpsListener?.protocol).toBe('HTTPS');
      expect(httpsListener?.port).toBe(443);
      expect(httpsListener?.hostname).toBe('dot-ai.example.com');
      expect(httpsListener?.tls?.mode).toBe('Terminate');
    });

    test('should support both HTTP and HTTPS listeners', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.http.enabled': true,
        'gateway.listeners.https.enabled': true,
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      expect(gateway?.spec.listeners).toHaveLength(2); // Both HTTP and HTTPS
    });

    test('should include annotations when configured', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.annotations.external-dns\\.alpha\\.kubernetes\\.io/hostname':
          'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      expect(gateway?.metadata.annotations).toBeDefined();
      expect(
        gateway?.metadata.annotations?.['external-dns.alpha.kubernetes.io/hostname']
      ).toBe('dot-ai.example.com');
    });
  });

  describe('HTTPRoute Resource Template', () => {
    test('should render HTTPRoute resource when gateway.enabled=true', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
      });

      const docs = parseYamlDocs(output);
      const httproute = findResourceByKind<HTTPRouteResource>(docs, 'HTTPRoute');

      expect(httproute).toBeDefined();
      expect(httproute?.apiVersion).toBe('gateway.networking.k8s.io/v1');
      expect(httproute?.kind).toBe('HTTPRoute');
      expect(httproute?.metadata.name).toContain('dot-ai');
    });

    test('should reference Gateway in parentRefs', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
      });

      const docs = parseYamlDocs(output);
      const httproute = findResourceByKind<HTTPRouteResource>(docs, 'HTTPRoute');

      expect(httproute).toBeDefined();
      expect(httproute?.spec.parentRefs).toHaveLength(1);
      expect(httproute?.spec.parentRefs[0].kind).toBe('Gateway');
      expect(httproute?.spec.parentRefs[0].name).toContain('dot-ai');
    });

    test('should configure SSE streaming timeout (3600s)', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.timeouts.request': '3600s',
        'gateway.timeouts.backendRequest': '3600s',
      });

      const docs = parseYamlDocs(output);
      const httproute = findResourceByKind<HTTPRouteResource>(docs, 'HTTPRoute');

      expect(httproute).toBeDefined();
      expect(httproute?.spec.rules[0].timeouts?.request).toBe('3600s');
      expect(httproute?.spec.rules[0].timeouts?.backendRequest).toBe('3600s');
    });

    test('should route to standard service when deployment.method=standard', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'deployment.method': 'standard',
      });

      const docs = parseYamlDocs(output);
      const httproute = findResourceByKind<HTTPRouteResource>(docs, 'HTTPRoute');

      expect(httproute).toBeDefined();
      const backendRef = httproute?.spec.rules[0].backendRefs[0];
      expect(backendRef?.name).toContain('dot-ai');
      expect(backendRef?.name).not.toContain('proxy');
      expect(backendRef?.port).toBe(3456);
    });

    test('should route to proxy service when deployment.method=toolhive', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'deployment.method': 'toolhive',
      });

      const docs = parseYamlDocs(output);
      const httproute = findResourceByKind<HTTPRouteResource>(docs, 'HTTPRoute');

      expect(httproute).toBeDefined();
      const backendRef = httproute?.spec.rules[0].backendRefs[0];
      expect(backendRef?.name).toContain('mcp-');
      expect(backendRef?.name).toContain('proxy');
      expect(backendRef?.port).toBe(3456);
    });

    test('should include hostnames from listeners', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.http.hostname': 'dot-ai.example.com',
      });

      const docs = parseYamlDocs(output);
      const httproute = findResourceByKind<HTTPRouteResource>(docs, 'HTTPRoute');

      expect(httproute).toBeDefined();
      expect(httproute?.spec.hostnames).toContain('dot-ai.example.com');
    });
  });

  describe('Mutual Exclusivity with Ingress', () => {
    test('should fail when both ingress.enabled and gateway.enabled are true', () => {
      const output = helmTemplate({
        'ingress.enabled': true,
        'gateway.enabled': true,
      });

      expect(output).toContain(
        'Cannot enable both ingress.enabled and gateway.enabled'
      );
    });

    test('should succeed with only gateway.enabled=true', () => {
      const output = helmTemplate({
        'ingress.enabled': false,
        'gateway.enabled': true,
        'gateway.className': 'istio',
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');
      const ingress = findResourceByKind<IngressResource>(docs, 'Ingress');

      expect(gateway).toBeDefined();
      expect(ingress).toBeUndefined();
    });

    test('should succeed with only ingress.enabled=true', () => {
      const output = helmTemplate({
        'ingress.enabled': true,
        'gateway.enabled': false,
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');
      const ingress = findResourceByKind<IngressResource>(docs, 'Ingress');

      expect(gateway).toBeUndefined();
      expect(ingress).toBeDefined();
    });

    test('should succeed with both disabled', () => {
      const output = helmTemplate({
        'ingress.enabled': false,
        'gateway.enabled': false,
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');
      const ingress = findResourceByKind<IngressResource>(docs, 'Ingress');

      expect(gateway).toBeUndefined();
      expect(ingress).toBeUndefined();
    });
  });

  describe('Gateway Configuration Validations', () => {
    test('should fail when gateway.className is empty', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': '',
      });

      expect(output).toContain(
        'gateway.className is required when gateway.enabled is true'
      );
    });

    test('should fail when both listeners are disabled', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.http.enabled': false,
        'gateway.listeners.https.enabled': false,
      });

      expect(output).toContain(
        'At least one listener (http or https) must be enabled when gateway.enabled is true'
      );
    });

    test('should succeed when HTTP listener is enabled', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.http.enabled': true,
        'gateway.listeners.https.enabled': false,
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      expect(gateway?.spec.listeners).toHaveLength(1);
    });

    test('should succeed when HTTPS listener is enabled', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.http.enabled': false,
        'gateway.listeners.https.enabled': true,
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      expect(gateway?.spec.listeners).toHaveLength(1);
    });

    test('should succeed when both listeners are enabled', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.http.enabled': true,
        'gateway.listeners.https.enabled': true,
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      expect(gateway?.spec.listeners).toHaveLength(2);
    });
  });

  describe('Chart Version', () => {
    test('should have bumped version to 0.163.0', () => {
      const chartYaml = readFileSync(
        `${chartPath}/Chart.yaml`,
        'utf-8'
      );
      const chart = yaml.load(chartYaml) as { version: string };
      expect(chart.version).toBe('0.163.0');
    });

    test('should include gateway-api keyword', () => {
      const chartYaml = readFileSync(
        `${chartPath}/Chart.yaml`,
        'utf-8'
      );
      const chart = yaml.load(chartYaml) as { keywords: string[] };
      expect(chart.keywords).toContain('gateway-api');
    });
  });

  describe('Certificate References', () => {
    test('should use secretName when certificateRefs not specified', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.https.enabled': true,
        'gateway.listeners.https.secretName': 'custom-tls-secret',
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      const httpsListener = gateway?.spec.listeners.find(
        (l: Listener) => l.name === 'https'
      );
      expect(httpsListener?.tls?.certificateRefs).toHaveLength(1);
      expect(httpsListener?.tls?.certificateRefs?.[0].kind).toBe('Secret');
      expect(httpsListener?.tls?.certificateRefs?.[0].name).toBe('custom-tls-secret');
    });

    test('should generate default secret name if not specified', () => {
      const output = helmTemplate({
        'gateway.enabled': true,
        'gateway.className': 'istio',
        'gateway.listeners.https.enabled': true,
      });

      const docs = parseYamlDocs(output);
      const gateway = findResourceByKind<GatewayResource>(docs, 'Gateway');

      expect(gateway).toBeDefined();
      const httpsListener = gateway?.spec.listeners.find(
        (l: Listener) => l.name === 'https'
      );
      expect(httpsListener?.tls?.certificateRefs?.[0].name).toContain('-tls');
    });
  });
});
