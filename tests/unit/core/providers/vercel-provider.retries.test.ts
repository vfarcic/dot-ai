/**
 * Verifies `VercelProvider` forwards the configured `maxRetries` value
 * (resolved from `ai-retry-config`) to the Vercel AI SDK's `generateText` for
 * the chat code path.
 *
 * Tool-loop and wrap-up call sites also pass `maxRetries`; their wiring is
 * exercised by the same `getMaxRetries('tool_loop' | 'wrap_up')` lookup, so
 * this test focuses on the most-trafficked path to keep the mock surface
 * tight.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGenerateText, mockCreateAnthropic, mockJsonSchema, mockTool, mockStepCountIs } =
  vi.hoisted(() => ({
    mockGenerateText: vi.fn(),
    mockCreateAnthropic: vi.fn(),
    mockJsonSchema: vi.fn((s: unknown) => s),
    mockTool: vi.fn((t: unknown) => t),
    mockStepCountIs: vi.fn((n: number) => ({ stepCount: n })),
  }));

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  jsonSchema: mockJsonSchema,
  tool: mockTool,
  stepCountIs: mockStepCountIs,
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

const RETRY_ENV_KEYS = [
  'DOT_AI_AI_MAX_RETRIES',
  'DOT_AI_AI_MAX_RETRIES_EMBEDDINGS',
  'DOT_AI_AI_MAX_RETRIES_CHAT',
  'DOT_AI_AI_MAX_RETRIES_TOOL_LOOP',
  'DOT_AI_AI_MAX_RETRIES_WRAP_UP',
];

describe('VercelProvider.sendMessage maxRetries wiring', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEBUG_DOT_AI;
    for (const k of RETRY_ENV_KEYS) delete process.env[k];
    vi.clearAllMocks();

    mockCreateAnthropic.mockReturnValue(
      () => ({ provider: 'anthropic', modelId: 'stub' })
    );
    mockGenerateText.mockResolvedValue({
      text: 'ok',
      usage: { inputTokens: 1, outputTokens: 1 },
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('forwards the chat default maxRetries (2) to generateText', async () => {
    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    await provider.sendMessage('hi', 'unit-test');

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockGenerateText.mock.calls[0][0]).toMatchObject({ maxRetries: 2 });
  });

  it('honours DOT_AI_AI_MAX_RETRIES_CHAT for the chat call', async () => {
    process.env.DOT_AI_AI_MAX_RETRIES_CHAT = '5';

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    await provider.sendMessage('hi', 'unit-test');

    expect(mockGenerateText.mock.calls[0][0]).toMatchObject({ maxRetries: 5 });
  });

  it('honours the global DOT_AI_AI_MAX_RETRIES override', async () => {
    process.env.DOT_AI_AI_MAX_RETRIES = '0';

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    await provider.sendMessage('hi', 'unit-test');

    expect(mockGenerateText.mock.calls[0][0]).toMatchObject({ maxRetries: 0 });
  });
});
