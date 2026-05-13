/**
 * Error-path unit tests for `VercelProvider.sendMessage` using the Vercel
 * AI SDK's mock model.
 *
 * Issue #464, followup to PR #493 (happy-path coverage). Verifies that
 * SDK failures surface as wrapped `Error`s with the original error
 * preserved on `cause`, so upstream handlers (telemetry, retry
 * classification, debug logs) can still inspect the underlying cause.
 *
 * Strategy mirrors `vercel-provider.test.ts`: stub `@ai-sdk/anthropic`'s
 * `createAnthropic` to hand back a `MockLanguageModelV3` whose
 * `doGenerate` rejects with a representative error. The real
 * `generateText` from the `ai` package propagates the rejection through
 * the provider's catch block, which we then assert against.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APICallError } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const { mockCreateAnthropic } = vi.hoisted(() => ({
  mockCreateAnthropic: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: mockCreateAnthropic,
}));

vi.mock('../../../../src/core/tracing/ai-tracing', () => ({
  withAITracing: vi.fn((_config, fn) => fn()),
}));

vi.mock('../../../../src/core/providers/provider-debug-utils', () => ({
  generateDebugId: vi.fn(() => 'debug-id'),
  debugLogInteraction: vi.fn(),
  debugLogPromptOnly: vi.fn(),
  createAndLogAgenticResult: vi.fn(),
  logEvaluationDataset: vi.fn(),
}));

import { VercelProvider } from '../../../../src/core/providers/vercel-provider';

/**
 * Build a `MockLanguageModelV3` whose `doGenerate` always rejects with
 * the given error. Used to simulate transport-level failures (429, 401,
 * network errors) without standing up a real provider.
 */
function createFailingModel(error: unknown): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: 'mock-provider',
    modelId: 'mock-model',
    doGenerate: async () => {
      throw error;
    },
  });
}

/**
 * Convenience factory matching the existing happy-path tests: stub
 * `createAnthropic` to return a function yielding the given model.
 */
function wireMockModel(model: MockLanguageModelV3): void {
  mockCreateAnthropic.mockReturnValue(() => model);
}

describe('VercelProvider.sendMessage error paths', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEBUG_DOT_AI;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('wraps a rate-limit (429) APICallError and preserves the original on cause', async () => {
    // `isRetryable: false` keeps this test deterministic. The SDK's retry
    // behaviour for retryable 429s is covered separately in the retries
    // suite; here we only assert the wrapping/cause-chain contract.
    const rateLimitErr = new APICallError({
      message: 'Too Many Requests',
      url: 'https://api.anthropic.com/v1/messages',
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: false,
    });
    const model = createFailingModel(rateLimitErr);
    wireMockModel(model);

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    let caught: unknown;
    try {
      await provider.sendMessage('any prompt');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { cause?: unknown };
    expect(err.message).toMatch(/^anthropic API error:/);
    expect(err.message).toContain('Too Many Requests');
    // The original SDK error must be preserved for upstream handlers
    // (telemetry, retry classification, debug logs).
    expect(APICallError.isInstance(err.cause)).toBe(true);
    expect((err.cause as APICallError).statusCode).toBe(429);
  });

  it('wraps an auth (401) APICallError and preserves the original on cause', async () => {
    const authErr = new APICallError({
      message: 'Invalid API key',
      url: 'https://api.anthropic.com/v1/messages',
      requestBodyValues: {},
      statusCode: 401,
      isRetryable: false,
    });
    const model = createFailingModel(authErr);
    wireMockModel(model);

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'bad-key',
      debugMode: false,
    });

    await expect(provider.sendMessage('any prompt')).rejects.toThrow(
      /^anthropic API error:.*Invalid API key/
    );

    // Re-invoke to inspect the cause; both calls share the same mock.
    let caught: unknown;
    try {
      await provider.sendMessage('any prompt');
    } catch (e) {
      caught = e;
    }
    const err = caught as Error & { cause?: unknown };
    expect(APICallError.isInstance(err.cause)).toBe(true);
    expect((err.cause as APICallError).statusCode).toBe(401);
    expect((err.cause as APICallError).isRetryable).toBe(false);
  });

  it('wraps a generic network error and preserves the original on cause', async () => {
    const networkErr = new TypeError('fetch failed');
    const model = createFailingModel(networkErr);
    wireMockModel(model);

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    let caught: unknown;
    try {
      await provider.sendMessage('any prompt');
    } catch (e) {
      caught = e;
    }

    const err = caught as Error & { cause?: unknown };
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/^anthropic API error:/);
    expect(err.message).toContain('fetch failed');
    expect(err.cause).toBe(networkErr);
  });

  it('embeds the underlying error message in the wrapped Error', async () => {
    const inner = new Error('upstream gateway timeout');
    const model = createFailingModel(inner);
    wireMockModel(model);

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    await expect(provider.sendMessage('hello')).rejects.toThrowError(
      /upstream gateway timeout/
    );
  });
});
