/**
 * Unit tests for `VercelProvider` using the Vercel AI SDK's mock model.
 *
 * Issue #464: Use MockLanguageModelV1 for unit testing AI interactions.
 * Note: `ai ^6.x` exports the spec as `MockLanguageModelV3`. See the
 * `_helpers/mock-language-model.ts` header for context.
 *
 * Strategy: stub the per-provider SDK factories (`@ai-sdk/anthropic`, etc.)
 * so they hand back a function returning a `MockLanguageModelV3`. The real
 * `generateText` from the `ai` package then runs end-to-end against the
 * mock, exercising the provider's response-mapping logic without any
 * network calls or API keys.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockLanguageModel,
  buildTextGenerateResult,
} from './_helpers/mock-language-model';

// Hoisted mocks — vi.mock factories run before module imports, so the
// referenced functions must be created via vi.hoisted. Mirrors the
// pattern in custom-headers-base-url.test.ts.
const { mockCreateAnthropic } = vi.hoisted(() => ({
  mockCreateAnthropic: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: mockCreateAnthropic,
}));

// Tracing wrapper short-circuits to the inner function so we observe the
// real generate path without OTel setup.
vi.mock('../../../../src/core/tracing/ai-tracing', () => ({
  withAITracing: vi.fn((_config, fn) => fn()),
}));

// Debug helpers are only invoked when debugMode is true; we keep debugMode
// off in these tests, so this mock is a defensive no-op.
vi.mock('../../../../src/core/providers/provider-debug-utils', () => ({
  generateDebugId: vi.fn(() => 'debug-id'),
  debugLogInteraction: vi.fn(),
  debugLogPromptOnly: vi.fn(),
  createAndLogAgenticResult: vi.fn(),
  logEvaluationDataset: vi.fn(),
}));

import { VercelProvider } from '../../../../src/core/providers/vercel-provider';

describe('VercelProvider.sendMessage (with MockLanguageModelV3)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Ensure debug logging stays off regardless of the host shell.
    delete process.env.DEBUG_DOT_AI;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns the mocked response and maps usage tokens', async () => {
    const mockModel = createMockLanguageModel({
      text: 'hello from mock',
      inputTokens: 42,
      outputTokens: 7,
    });

    // The SDK factory (createAnthropic) returns a callable that, given a
    // model id, yields the LanguageModelV3 instance. Our mock returns the
    // same instance regardless of model id.
    mockCreateAnthropic.mockReturnValue(() => mockModel);

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    const response = await provider.sendMessage('Hello, world');

    expect(response.content).toBe('hello from mock');
    expect(response.usage.input_tokens).toBe(42);
    expect(response.usage.output_tokens).toBe(7);

    // The SDK called into our mock model exactly once.
    expect(mockModel.doGenerateCalls).toHaveLength(1);
  });

  it('forwards the user prompt to the language model', async () => {
    const mockModel = createMockLanguageModel({ text: 'ack' });
    mockCreateAnthropic.mockReturnValue(() => mockModel);

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    await provider.sendMessage('please summarise');

    const call = mockModel.doGenerateCalls[0];
    expect(call).toBeDefined();

    // The prompt is delivered as a structured message array; flatten any
    // text parts and assert the user input is present.
    const userText = call.prompt
      .filter((m) => m.role === 'user')
      .flatMap((m) =>
        Array.isArray(m.content)
          ? m.content
              .filter((p): p is { type: 'text'; text: string } =>
                p.type === 'text'
              )
              .map((p) => p.text)
          : []
      )
      .join('');

    expect(userText).toContain('please summarise');
  });

  it('builds a text generate result with a sensible default usage shape', () => {
    const result = buildTextGenerateResult({ text: 'sample' });

    expect(result.content).toEqual([{ type: 'text', text: 'sample' }]);
    expect(result.finishReason).toBe('stop');
    expect(result.usage.inputTokens.total).toBe(10);
    expect(result.usage.outputTokens.total).toBe(5);
  });
});
