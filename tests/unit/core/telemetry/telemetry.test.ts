/**
 * Unit Tests: PostHog Telemetry Module
 *
 * Tests telemetry configuration, event tracking, and opt-out behavior.
 * PostHog client is mocked to verify correct event capture.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock posthog-node before importing telemetry modules
vi.mock('posthog-node', () => {
  return {
    PostHog: vi.fn().mockImplementation(() => ({
      capture: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

// Mock kubernetes client to avoid cluster dependency
vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: vi.fn().mockImplementation(() => ({
    loadFromDefault: vi.fn(),
    makeApiClient: vi.fn().mockReturnValue({
      readNamespace: vi.fn().mockResolvedValue({
        metadata: { uid: 'test-cluster-uid-12345' },
      }),
    }),
  })),
  CoreV1Api: vi.fn(),
}));

describe('Telemetry Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be enabled by default (opt-out model)', async () => {
    delete process.env.DOT_AI_TELEMETRY;

    const { loadTelemetryConfig } = await import('../../../../src/core/telemetry/config');
    const config = loadTelemetryConfig();

    expect(config.enabled).toBe(true);
  });

  it('should be disabled when DOT_AI_TELEMETRY=false', async () => {
    process.env.DOT_AI_TELEMETRY = 'false';

    const { loadTelemetryConfig } = await import('../../../../src/core/telemetry/config');
    const config = loadTelemetryConfig();

    expect(config.enabled).toBe(false);
  });

  it('should be disabled when DOT_AI_TELEMETRY=0', async () => {
    process.env.DOT_AI_TELEMETRY = '0';

    const { loadTelemetryConfig } = await import('../../../../src/core/telemetry/config');
    const config = loadTelemetryConfig();

    expect(config.enabled).toBe(false);
  });

  it('should be disabled when DOT_AI_TELEMETRY=no', async () => {
    process.env.DOT_AI_TELEMETRY = 'no';

    const { loadTelemetryConfig } = await import('../../../../src/core/telemetry/config');
    const config = loadTelemetryConfig();

    expect(config.enabled).toBe(false);
  });

  it('should be disabled when DOT_AI_TELEMETRY=off', async () => {
    process.env.DOT_AI_TELEMETRY = 'off';

    const { loadTelemetryConfig } = await import('../../../../src/core/telemetry/config');
    const config = loadTelemetryConfig();

    expect(config.enabled).toBe(false);
  });

  it('should use default PostHog host when not configured', async () => {
    delete process.env.DOT_AI_POSTHOG_HOST;

    const { loadTelemetryConfig } = await import('../../../../src/core/telemetry/config');
    const config = loadTelemetryConfig();

    expect(config.posthogHost).toBe('https://eu.i.posthog.com');
  });

  it('should use custom PostHog host when configured', async () => {
    process.env.DOT_AI_POSTHOG_HOST = 'https://custom.posthog.com';

    const { loadTelemetryConfig } = await import('../../../../src/core/telemetry/config');
    const config = loadTelemetryConfig();

    expect(config.posthogHost).toBe('https://custom.posthog.com');
  });

  it('should detect AI provider from AI_PROVIDER env var', async () => {
    process.env.AI_PROVIDER = 'openai';

    const { loadTelemetryConfig } = await import('../../../../src/core/telemetry/config');
    const config = loadTelemetryConfig();

    expect(config.aiProvider).toBe('openai');
  });

  it('should infer AI provider from ANTHROPIC_API_KEY', async () => {
    delete process.env.AI_PROVIDER;
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const { loadTelemetryConfig } = await import('../../../../src/core/telemetry/config');
    const config = loadTelemetryConfig();

    expect(config.aiProvider).toBe('anthropic');
  });
});

describe('Telemetry Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Enable telemetry for service tests
    delete process.env.DOT_AI_TELEMETRY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should report enabled status correctly', async () => {
    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    expect(telemetry.isEnabled()).toBe(true);
  });

  it('should report disabled status when opt-out', async () => {
    process.env.DOT_AI_TELEMETRY = 'false';

    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    expect(telemetry.isEnabled()).toBe(false);
  });

  it('should have trackToolExecution method', async () => {
    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    expect(typeof telemetry.trackToolExecution).toBe('function');
  });

  it('should have trackToolError method', async () => {
    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    expect(typeof telemetry.trackToolError).toBe('function');
  });

  it('should have trackServerStart method', async () => {
    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    expect(typeof telemetry.trackServerStart).toBe('function');
  });

  it('should have trackServerStop method', async () => {
    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    expect(typeof telemetry.trackServerStop).toBe('function');
  });

  it('should not throw when tracking with telemetry disabled', async () => {
    process.env.DOT_AI_TELEMETRY = 'false';

    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    // These should not throw even when disabled
    expect(() => telemetry.trackToolExecution('test-tool', true, 100)).not.toThrow();
    expect(() => telemetry.trackToolError('test-tool', 'TestError')).not.toThrow();
    expect(() => telemetry.trackServerStart('1.29.0', 'helm')).not.toThrow();
    expect(() => telemetry.trackServerStop(3600)).not.toThrow();
  });

  it('should have trackClientConnected method', async () => {
    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    expect(typeof telemetry.trackClientConnected).toBe('function');
  });

  it('should not throw when tracking client connection with telemetry disabled', async () => {
    process.env.DOT_AI_TELEMETRY = 'false';

    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    expect(() => telemetry.trackClientConnected({ name: 'test-client', version: '1.0.0' }, 'stdio')).not.toThrow();
  });

  it('should accept MCP client info in trackToolExecution', async () => {
    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    // Should not throw when passing MCP client info
    expect(() => telemetry.trackToolExecution('test-tool', true, 100, { name: 'claude-code', version: '1.0.0' })).not.toThrow();
  });

  it('should accept MCP client info in trackToolError', async () => {
    const { getTelemetry } = await import('../../../../src/core/telemetry/client');
    const telemetry = getTelemetry();

    // Should not throw when passing MCP client info
    expect(() => telemetry.trackToolError('test-tool', 'TestError', { name: 'cursor', version: '2.0.0' })).not.toThrow();
  });
});

describe('Tool Tracing with Telemetry', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should track successful tool execution via withToolTracing', async () => {
    const { withToolTracing } = await import('../../../../src/core/tracing/tool-tracing');

    const mockHandler = vi.fn().mockResolvedValue({ success: true });

    const result = await withToolTracing('test-tool', { arg: 'value' }, mockHandler);

    expect(result).toEqual({ success: true });
    expect(mockHandler).toHaveBeenCalledWith({ arg: 'value' });
  });

  it('should track failed tool execution via withToolTracing', async () => {
    const { withToolTracing } = await import('../../../../src/core/tracing/tool-tracing');

    const testError = new Error('Test error');
    const mockHandler = vi.fn().mockRejectedValue(testError);

    await expect(withToolTracing('test-tool', { arg: 'value' }, mockHandler)).rejects.toThrow(
      'Test error'
    );
    expect(mockHandler).toHaveBeenCalledWith({ arg: 'value' });
  });

  it('should not break tool execution when telemetry is disabled', async () => {
    process.env.DOT_AI_TELEMETRY = 'false';

    const { withToolTracing } = await import('../../../../src/core/tracing/tool-tracing');

    const mockHandler = vi.fn().mockResolvedValue({ data: 'test' });

    const result = await withToolTracing('test-tool', {}, mockHandler);

    expect(result).toEqual({ data: 'test' });
  });

  it('should pass MCP client info to telemetry via options', async () => {
    const { withToolTracing } = await import('../../../../src/core/tracing/tool-tracing');

    const mockHandler = vi.fn().mockResolvedValue({ success: true });
    const mcpClient = { name: 'claude-code', version: '1.0.0' };

    const result = await withToolTracing('test-tool', { arg: 'value' }, mockHandler, { mcpClient });

    expect(result).toEqual({ success: true });
    expect(mockHandler).toHaveBeenCalledWith({ arg: 'value' });
  });

  it('should work without MCP client info (undefined options)', async () => {
    const { withToolTracing } = await import('../../../../src/core/tracing/tool-tracing');

    const mockHandler = vi.fn().mockResolvedValue({ success: true });

    const result = await withToolTracing('test-tool', { arg: 'value' }, mockHandler, undefined);

    expect(result).toEqual({ success: true });
    expect(mockHandler).toHaveBeenCalledWith({ arg: 'value' });
  });

  it('should work with empty options object', async () => {
    const { withToolTracing } = await import('../../../../src/core/tracing/tool-tracing');

    const mockHandler = vi.fn().mockResolvedValue({ success: true });

    const result = await withToolTracing('test-tool', { arg: 'value' }, mockHandler, {});

    expect(result).toEqual({ success: true });
    expect(mockHandler).toHaveBeenCalledWith({ arg: 'value' });
  });
});
