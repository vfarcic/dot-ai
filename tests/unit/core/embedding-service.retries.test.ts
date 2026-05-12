/**
 * Verifies `VercelEmbeddingProvider` forwards the configured `maxRetries`
 * value (resolved from `ai-retry-config`) to the Vercel AI SDK's `embed` and
 * `embedMany` functions.
 *
 * Strategy differs from `embedding-service.test.ts`: here we mock the entire
 * `ai` module so we can observe call options directly, rather than running
 * the real `embedMany` against a `MockEmbeddingModelV3`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockEmbed, mockEmbedMany, mockCreateOpenAI } = vi.hoisted(() => ({
  mockEmbed: vi.fn(),
  mockEmbedMany: vi.fn(),
  mockCreateOpenAI: vi.fn(),
}));

vi.mock('ai', () => ({
  embed: mockEmbed,
  embedMany: mockEmbedMany,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}));

// Tracing wrapper short-circuits to the inner function.
vi.mock('../../../src/core/tracing/ai-tracing', () => ({
  withAITracing: vi.fn((_config, fn) => fn()),
}));

import { VercelEmbeddingProvider } from '../../../src/core/embedding-service';

const RETRY_ENV_KEYS = [
  'DOT_AI_AI_MAX_RETRIES',
  'DOT_AI_AI_MAX_RETRIES_EMBEDDINGS',
  'DOT_AI_AI_MAX_RETRIES_CHAT',
  'DOT_AI_AI_MAX_RETRIES_TOOL_LOOP',
  'DOT_AI_AI_MAX_RETRIES_WRAP_UP',
];

describe('VercelEmbeddingProvider maxRetries wiring', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const k of RETRY_ENV_KEYS) delete process.env[k];
    vi.clearAllMocks();

    // Default OpenAI factory returns a stub textEmbedding model.
    mockCreateOpenAI.mockReturnValue({
      textEmbedding: () => ({ provider: 'openai', modelId: 'stub' }),
    });

    mockEmbed.mockResolvedValue({ embedding: [0.1], usage: { tokens: 1 } });
    mockEmbedMany.mockImplementation(async ({ values }) => ({
      embeddings: values.map(() => [0.1]),
      usage: { tokens: values.length },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('forwards the embeddings default maxRetries (4) to embed()', async () => {
    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
      apiKey: 'test-key',
    });

    await provider.generateEmbedding('hello');

    expect(mockEmbed).toHaveBeenCalledTimes(1);
    expect(mockEmbed.mock.calls[0][0]).toMatchObject({ maxRetries: 4 });
  });

  it('forwards the embeddings default maxRetries (4) to embedMany()', async () => {
    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
      apiKey: 'test-key',
    });

    await provider.generateEmbeddings(['a', 'b']);

    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
    expect(mockEmbedMany.mock.calls[0][0]).toMatchObject({ maxRetries: 4 });
  });

  it('honours DOT_AI_AI_MAX_RETRIES_EMBEDDINGS for embedMany()', async () => {
    process.env.DOT_AI_AI_MAX_RETRIES_EMBEDDINGS = '1';

    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
      apiKey: 'test-key',
    });
    await provider.generateEmbeddings(['x']);

    expect(mockEmbedMany.mock.calls[0][0]).toMatchObject({ maxRetries: 1 });
  });

  it('honours the global DOT_AI_AI_MAX_RETRIES override', async () => {
    process.env.DOT_AI_AI_MAX_RETRIES = '0';

    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
      apiKey: 'test-key',
    });
    await provider.generateEmbedding('hi');

    expect(mockEmbed.mock.calls[0][0]).toMatchObject({ maxRetries: 0 });
  });

  it('per-op override beats global override', async () => {
    process.env.DOT_AI_AI_MAX_RETRIES = '9';
    process.env.DOT_AI_AI_MAX_RETRIES_EMBEDDINGS = '2';

    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
      apiKey: 'test-key',
    });
    await provider.generateEmbeddings(['v']);

    expect(mockEmbedMany.mock.calls[0][0]).toMatchObject({ maxRetries: 2 });
  });
});
