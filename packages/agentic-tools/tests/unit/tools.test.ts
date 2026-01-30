/**
 * Unit tests for kubectl tools
 *
 * Tests tool definitions, validation, and handler behavior.
 * Note: These tests mock kubectl execution to avoid cluster dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TOOLS, TOOL_HANDLERS } from '../../src/tools';
import * as base from '../../src/tools/base';

// Mock executeKubectl to avoid actual kubectl calls
vi.mock('../../src/tools/base', async () => {
  const actual = await vi.importActual<typeof base>('../../src/tools/base');
  return {
    ...actual,
    executeKubectl: vi.fn(),
  };
});

describe('Tool Definitions', () => {
  it('should have all required kubectl tools', () => {
    const toolNames = TOOLS.map((t) => t.name);

    expect(toolNames).toContain('kubectl_api_resources');
    expect(toolNames).toContain('kubectl_get');
    expect(toolNames).toContain('kubectl_describe');
    expect(toolNames).toContain('kubectl_logs');
    expect(toolNames).toContain('kubectl_events');
    expect(toolNames).toContain('kubectl_patch_dryrun');
    expect(toolNames).toContain('kubectl_apply_dryrun');
    expect(toolNames).toContain('kubectl_delete_dryrun');
    expect(toolNames).toContain('kubectl_get_crd_schema');
    expect(toolNames).toContain('kubectl_get_resource_json');
    expect(toolNames).toContain('kubectl_version');
  });

  it('should have at least the core kubectl tools', () => {
    // Tool count may change as more tools are added
    // PRD #359: Now includes 8 vector tools
    expect(TOOLS.length).toBeGreaterThanOrEqual(19);
  });

  it('should have matching handlers for all tools', () => {
    for (const tool of TOOLS) {
      expect(TOOL_HANDLERS[tool.name]).toBeDefined();
      expect(typeof TOOL_HANDLERS[tool.name]).toBe('function');
    }
  });

  describe('Tool definition structure', () => {
    for (const tool of TOOLS) {
      describe(tool.name, () => {
        it('should have correct type', () => {
          expect(tool.type).toBe('agentic');
        });

        it('should have a description', () => {
          expect(tool.description).toBeTruthy();
          expect(typeof tool.description).toBe('string');
        });

        it('should have valid inputSchema', () => {
          expect(tool.inputSchema).toBeDefined();
          expect(tool.inputSchema.type).toBe('object');
          expect(tool.inputSchema.properties).toBeDefined();
        });

        it('should have required array (can be empty)', () => {
          expect(Array.isArray(tool.inputSchema.required)).toBe(true);
        });
      });
    }
  });
});

describe('Tool Handlers', () => {
  const mockExecuteKubectl = vi.mocked(base.executeKubectl);

  beforeEach(() => {
    mockExecuteKubectl.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('kubectl_api_resources', () => {
    it('should call kubectl api-resources', async () => {
      mockExecuteKubectl.mockResolvedValue('NAME SHORTNAMES APIVERSION NAMESPACED KIND');

      const handler = TOOL_HANDLERS['kubectl_api_resources'];
      const result = await handler({});

      expect(mockExecuteKubectl).toHaveBeenCalledWith(['api-resources']);
      expect(result).toMatchObject({
        success: true,
        data: expect.any(String),
      });
    });
  });

  describe('kubectl_get', () => {
    it('should require resource parameter', async () => {
      const handler = TOOL_HANDLERS['kubectl_get'];
      const result = await handler({});

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('resource'),
      });
    });

    it('should call kubectl get with resource', async () => {
      mockExecuteKubectl.mockResolvedValue('NAME READY STATUS');

      const handler = TOOL_HANDLERS['kubectl_get'];
      const result = await handler({ resource: 'pods' });

      expect(mockExecuteKubectl).toHaveBeenCalledWith(['get', 'pods']);
      expect(result).toMatchObject({
        success: true,
        data: expect.any(String),
      });
    });

    it('should add namespace when provided', async () => {
      mockExecuteKubectl.mockResolvedValue('NAME READY STATUS');

      const handler = TOOL_HANDLERS['kubectl_get'];
      await handler({ resource: 'pods', namespace: 'kube-system' });

      expect(mockExecuteKubectl).toHaveBeenCalledWith(['get', 'pods', '-n', 'kube-system']);
    });

    it('should strip output format args', async () => {
      mockExecuteKubectl.mockResolvedValue('NAME READY STATUS');

      const handler = TOOL_HANDLERS['kubectl_get'];
      await handler({
        resource: 'pods',
        args: ['--selector=app=test', '-o=json', '--output=yaml'],
      });

      expect(mockExecuteKubectl).toHaveBeenCalledWith(['get', 'pods', '--selector=app=test']);
    });
  });

  describe('kubectl_describe', () => {
    it('should require resource parameter', async () => {
      const handler = TOOL_HANDLERS['kubectl_describe'];
      const result = await handler({});

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('resource'),
      });
    });

    it('should call kubectl describe with resource', async () => {
      mockExecuteKubectl.mockResolvedValue('Name: my-pod\nNamespace: default');

      const handler = TOOL_HANDLERS['kubectl_describe'];
      const result = await handler({ resource: 'pod/my-pod', namespace: 'default' });

      expect(mockExecuteKubectl).toHaveBeenCalledWith(['describe', 'pod/my-pod', '-n', 'default']);
      expect(result).toMatchObject({
        success: true,
      });
    });
  });

  describe('kubectl_logs', () => {
    it('should require resource and namespace', async () => {
      const handler = TOOL_HANDLERS['kubectl_logs'];

      const result1 = await handler({});
      expect(result1).toMatchObject({
        success: false,
        error: expect.stringContaining('resource'),
      });

      const result2 = await handler({ resource: 'my-pod' });
      expect(result2).toMatchObject({
        success: false,
        error: expect.stringContaining('namespace'),
      });
    });

    it('should call kubectl logs with pod and namespace', async () => {
      mockExecuteKubectl.mockResolvedValue('log line 1\nlog line 2');

      const handler = TOOL_HANDLERS['kubectl_logs'];
      await handler({ resource: 'my-pod', namespace: 'default' });

      expect(mockExecuteKubectl).toHaveBeenCalledWith(['logs', 'my-pod', '-n', 'default']);
    });

    it('should pass additional args', async () => {
      mockExecuteKubectl.mockResolvedValue('log line');

      const handler = TOOL_HANDLERS['kubectl_logs'];
      await handler({
        resource: 'my-pod',
        namespace: 'default',
        args: ['--previous', '--tail=50'],
      });

      expect(mockExecuteKubectl).toHaveBeenCalledWith([
        'logs',
        'my-pod',
        '-n',
        'default',
        '--previous',
        '--tail=50',
      ]);
    });
  });

  describe('kubectl_events', () => {
    it('should call kubectl get events', async () => {
      mockExecuteKubectl.mockResolvedValue('LAST SEEN TYPE REASON');

      const handler = TOOL_HANDLERS['kubectl_events'];
      await handler({});

      expect(mockExecuteKubectl).toHaveBeenCalledWith(['get', 'events']);
    });

    it('should add namespace when provided', async () => {
      mockExecuteKubectl.mockResolvedValue('LAST SEEN TYPE REASON');

      const handler = TOOL_HANDLERS['kubectl_events'];
      await handler({ namespace: 'kube-system' });

      expect(mockExecuteKubectl).toHaveBeenCalledWith(['get', 'events', '-n', 'kube-system']);
    });
  });

  describe('kubectl_patch_dryrun', () => {
    it('should require resource and patch', async () => {
      const handler = TOOL_HANDLERS['kubectl_patch_dryrun'];

      const result1 = await handler({});
      expect(result1).toMatchObject({
        success: false,
        error: expect.stringContaining('resource'),
      });

      const result2 = await handler({ resource: 'deployment/my-app' });
      expect(result2).toMatchObject({
        success: false,
        error: expect.stringContaining('patch'),
      });
    });

    it('should call kubectl patch with dry-run', async () => {
      mockExecuteKubectl.mockResolvedValue('deployment.apps/my-app patched (dry run)');

      const handler = TOOL_HANDLERS['kubectl_patch_dryrun'];
      await handler({
        resource: 'deployment/my-app',
        patch: '{"spec":{"replicas":3}}',
        namespace: 'default',
      });

      expect(mockExecuteKubectl).toHaveBeenCalledWith([
        'patch',
        'deployment/my-app',
        '--dry-run=server',
        '-n',
        'default',
        '-p',
        '{"spec":{"replicas":3}}',
      ]);
    });

    it('should support different patch types', async () => {
      mockExecuteKubectl.mockResolvedValue('patched');

      const handler = TOOL_HANDLERS['kubectl_patch_dryrun'];
      await handler({
        resource: 'deployment/my-app',
        patch: '[{"op":"replace","path":"/spec/replicas","value":3}]',
        patchType: 'json',
      });

      expect(mockExecuteKubectl).toHaveBeenCalledWith(
        expect.arrayContaining(['--type=json'])
      );
    });
  });

  describe('kubectl_apply_dryrun', () => {
    it('should require manifest', async () => {
      const handler = TOOL_HANDLERS['kubectl_apply_dryrun'];
      const result = await handler({});

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('manifest'),
      });
    });

    it('should call kubectl apply with dry-run and stdin', async () => {
      mockExecuteKubectl.mockResolvedValue('configmap/test created (dry run)');

      const manifest = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: test';
      const handler = TOOL_HANDLERS['kubectl_apply_dryrun'];
      await handler({ manifest });

      expect(mockExecuteKubectl).toHaveBeenCalledWith(
        ['apply', '--dry-run=server', '-f', '-'],
        { stdin: manifest }
      );
    });
  });

  describe('kubectl_delete_dryrun', () => {
    it('should require resource', async () => {
      const handler = TOOL_HANDLERS['kubectl_delete_dryrun'];
      const result = await handler({});

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('resource'),
      });
    });

    it('should call kubectl delete with dry-run', async () => {
      mockExecuteKubectl.mockResolvedValue('pod "my-pod" deleted (dry run)');

      const handler = TOOL_HANDLERS['kubectl_delete_dryrun'];
      await handler({ resource: 'pod/my-pod', namespace: 'default' });

      expect(mockExecuteKubectl).toHaveBeenCalledWith([
        'delete',
        'pod/my-pod',
        '--dry-run=server',
        '-n',
        'default',
      ]);
    });
  });

  describe('kubectl_get_crd_schema', () => {
    it('should require crdName', async () => {
      const handler = TOOL_HANDLERS['kubectl_get_crd_schema'];
      const result = await handler({});

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('crdName'),
      });
    });

    it('should call kubectl get crd with json output', async () => {
      mockExecuteKubectl.mockResolvedValue('{"apiVersion":"apiextensions.k8s.io/v1"}');

      const handler = TOOL_HANDLERS['kubectl_get_crd_schema'];
      await handler({ crdName: 'clusters.postgresql.cnpg.io' });

      expect(mockExecuteKubectl).toHaveBeenCalledWith([
        'get',
        'crd',
        'clusters.postgresql.cnpg.io',
        '-o',
        'json',
      ]);
    });
  });

  describe('kubectl_get_resource_json', () => {
    it('should require resource', async () => {
      const handler = TOOL_HANDLERS['kubectl_get_resource_json'];
      const result = await handler({});

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('resource'),
      });
    });

    it('should return full resource as JSON', async () => {
      const mockResource = { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'test' } };
      mockExecuteKubectl.mockResolvedValue(JSON.stringify(mockResource));

      const handler = TOOL_HANDLERS['kubectl_get_resource_json'];
      const result = await handler({ resource: 'pod/test', namespace: 'default' });

      expect(mockExecuteKubectl).toHaveBeenCalledWith([
        'get',
        'pod/test',
        '-o',
        'json',
        '-n',
        'default',
      ]);
      expect(result).toMatchObject({
        success: true,
        data: expect.stringContaining('"apiVersion"'),
      });
    });

    it('should return specific field when requested', async () => {
      const mockResource = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { name: 'test' },
        spec: { containers: [] },
      };
      mockExecuteKubectl.mockResolvedValue(JSON.stringify(mockResource));

      const handler = TOOL_HANDLERS['kubectl_get_resource_json'];
      const result = (await handler({ resource: 'pod/test', field: 'spec' })) as {
        success: boolean;
        data: string;
      };

      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.data);
      expect(parsed).toEqual({ containers: [] });
    });

    it('should return error for non-existent field', async () => {
      const mockResource = { apiVersion: 'v1', kind: 'Pod' };
      mockExecuteKubectl.mockResolvedValue(JSON.stringify(mockResource));

      const handler = TOOL_HANDLERS['kubectl_get_resource_json'];
      const result = await handler({ resource: 'pod/test', field: 'nonexistent' });

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('nonexistent'),
      });
    });
  });

  describe('kubectl_version', () => {
    it('should call kubectl version with json output', async () => {
      const mockVersion = {
        clientVersion: { gitVersion: 'v1.29.0' },
        serverVersion: { gitVersion: 'v1.28.0' },
      };
      mockExecuteKubectl.mockResolvedValue(JSON.stringify(mockVersion));

      const handler = TOOL_HANDLERS['kubectl_version'];
      const result = await handler({});

      expect(mockExecuteKubectl).toHaveBeenCalledWith(['version', '--output=json']);
      expect(result).toMatchObject({
        success: true,
        data: expect.stringContaining('serverVersion'),
      });
    });
  });

  describe('Error handling', () => {
    it('should return error result when kubectl fails', async () => {
      mockExecuteKubectl.mockRejectedValue(new Error('connection refused'));

      const handler = TOOL_HANDLERS['kubectl_get'];
      const result = await handler({ resource: 'pods' });

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('connection refused'),
      });
    });
  });
});

describe('Base utilities', () => {
  describe('escapeShellArg', () => {
    it('should return safe strings as-is', () => {
      expect(base.escapeShellArg('pods')).toBe('pods');
      expect(base.escapeShellArg('my-deployment')).toBe('my-deployment');
      expect(base.escapeShellArg('kube-system')).toBe('kube-system');
      expect(base.escapeShellArg('app.kubernetes.io/name=test')).toBe(
        'app.kubernetes.io/name=test'
      );
    });

    it('should quote strings with special characters', () => {
      expect(base.escapeShellArg('hello world')).toBe('"hello world"');
      expect(base.escapeShellArg('{"key":"value"}')).toBe('"{\\"key\\":\\"value\\"}"');
    });

    it('should handle empty strings', () => {
      expect(base.escapeShellArg('')).toBe('""');
    });
  });

  describe('stripOutputFormatArgs', () => {
    it('should remove output format flags', () => {
      const args = ['--selector=app=test', '-o=json', '--output=yaml', '--show-labels'];
      const result = base.stripOutputFormatArgs(args);

      expect(result).toEqual(['--selector=app=test', '--show-labels']);
    });

    it('should keep non-output args', () => {
      const args = ['--all-namespaces', '--selector=app=test'];
      const result = base.stripOutputFormatArgs(args);

      expect(result).toEqual(args);
    });
  });

  describe('buildKubectlCommand', () => {
    it('should build basic command', () => {
      const result = base.buildKubectlCommand(['get', 'pods']);
      expect(result).toBe('kubectl get pods');
    });

    it('should add kubeconfig when provided', () => {
      const result = base.buildKubectlCommand(['get', 'pods'], {
        kubeconfig: '/path/to/kubeconfig',
      });
      expect(result).toBe('kubectl --kubeconfig /path/to/kubeconfig get pods');
    });

    it('should add context when provided', () => {
      const result = base.buildKubectlCommand(['get', 'pods'], {
        context: 'my-context',
      });
      expect(result).toBe('kubectl --context my-context get pods');
    });

    it('should add namespace when provided', () => {
      const result = base.buildKubectlCommand(['get', 'pods'], {
        namespace: 'kube-system',
      });
      expect(result).toBe('kubectl --namespace kube-system get pods');
    });
  });
});
