/**
 * Unit tests for `VercelEmbeddingProvider` using the Vercel AI SDK's mock
 * embedding model.
 *
 * Issue #453: replace the manual `Promise.all + embed()` fan-out in
 * `generateEmbeddings` with a single `embedMany` call.
 *
 * Strategy: stub the per-provider SDK factories (`@ai-sdk/openai`,
 * `@ai-sdk/google`, `@ai-sdk/amazon-bedrock`) so they hand back a
 * `MockEmbeddingModelV3` instance. The real `embedMany` from the `ai`
 * package then runs end-to-end against the mock, exercising the provider's
 * batching path without any network calls or API keys. Mirrors the pattern
 * established for `VercelProvider` in `vercel-provider.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockEmbeddingModelV3 } from 'ai/test';
import {
  createMockEmbeddingModel,
  buildEmbeddingVector,
} from './_helpers/mock-embedding-model';

// Hoisted mocks: factories run before module imports, so the referenced
// functions must be created via vi.hoisted (matches custom-headers-base-url
// and vercel-provider tests).
const { mockCreateOpenAI, mockGoogleTextEmbedding, mockCreateAmazonBedrock } =
  vi.hoisted(() => ({
    mockCreateOpenAI: vi.fn(),
    mockGoogleTextEmbedding: vi.fn(),
    mockCreateAmazonBedrock: vi.fn(),
  }));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}));

vi.mock('@ai-sdk/google', () => ({
  google: { textEmbedding: mockGoogleTextEmbedding },
}));

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: mockCreateAmazonBedrock,
}));

// Tracing wrapper short-circuits to the inner function so we observe the
// real embedMany path without OTel setup.
vi.mock('../../../src/core/tracing/ai-tracing', () => ({
  withAITracing: vi.fn((_config, fn) => fn()),
}));

import { EmbeddingService, VercelEmbeddingProvider } from '../../../src/core/embedding-service';

describe('VercelEmbeddingProvider.generateEmbeddings (with embedMany)', () => {
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

  it('returns one embedding per input value, in order, via a single doEmbed call', async () => {
    const mockModel = createMockEmbeddingModel({ dimensions: 4 });
    mockCreateOpenAI.mockReturnValue({
      textEmbedding: () => mockModel,
    });

    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
      apiKey: 'test-key',
    });

    const inputs = ['alpha', 'bravo', 'charlie'];
    const embeddings = await provider.generateEmbeddings(inputs);

    expect(embeddings).toEqual(inputs.map((v) => buildEmbeddingVector(v, 4)));

    // The SDK batched all values into a single call instead of one per value.
    expect(mockModel.doEmbedCalls).toHaveLength(1);
    expect(mockModel.doEmbedCalls[0].values).toEqual(inputs);
  });

  it('returns [] for an empty input array without invoking the model', async () => {
    const mockModel = createMockEmbeddingModel();
    mockCreateOpenAI.mockReturnValue({
      textEmbedding: () => mockModel,
    });

    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
      apiKey: 'test-key',
    });

    const embeddings = await provider.generateEmbeddings([]);

    expect(embeddings).toEqual([]);
    expect(mockModel.doEmbedCalls).toHaveLength(0);
  });

  it('filters whitespace-only entries before sending to the model', async () => {
    const mockModel = createMockEmbeddingModel({ dimensions: 3 });
    mockCreateOpenAI.mockReturnValue({
      textEmbedding: () => mockModel,
    });

    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
      apiKey: 'test-key',
    });

    const embeddings = await provider.generateEmbeddings([
      'kept',
      '   ',
      '',
      '  surrounded  ',
    ]);

    expect(mockModel.doEmbedCalls).toHaveLength(1);
    expect(mockModel.doEmbedCalls[0].values).toEqual(['kept', 'surrounded']);
    expect(embeddings).toHaveLength(2);
  });

  it('passes Google providerOptions (outputDimensionality, taskType) on the batch call', async () => {
    const mockModel = createMockEmbeddingModel({
      provider: 'google',
      dimensions: 768,
    });
    mockGoogleTextEmbedding.mockReturnValue(mockModel);

    const provider = new VercelEmbeddingProvider({
      provider: 'google',
      apiKey: 'test-key',
      dimensions: 768,
    });

    await provider.generateEmbeddings(['one', 'two']);

    expect(mockModel.doEmbedCalls).toHaveLength(1);
    expect(mockModel.doEmbedCalls[0].providerOptions).toEqual({
      google: {
        outputDimensionality: 768,
        taskType: 'SEMANTIC_SIMILARITY',
      },
    });
  });

  it('wraps model errors as `${providerType} batch embedding failed: ...`', async () => {
    const failing = new MockEmbeddingModelV3({
      provider: 'mock-provider',
      modelId: 'mock-model',
      doEmbed: async () => {
        throw new Error('upstream rate limit');
      },
    });
    mockCreateOpenAI.mockReturnValue({
      textEmbedding: () => failing,
    });

    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
      apiKey: 'test-key',
    });

    await expect(provider.generateEmbeddings(['x'])).rejects.toThrow(
      /^openai batch embedding failed: upstream rate limit$/
    );
  });
});

describe('EmbeddingService.isSemanticModeConfigured', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.EMBEDDINGS_PROVIDER;
    delete process.env.CUSTOM_EMBEDDINGS_BASE_URL;
    delete process.env.CUSTOM_EMBEDDINGS_API_KEY;
    delete process.env.OPENAI_API_KEY;
    // Reset (not just clear) so the factory returns undefined and the provider
    // fails to construct — modeling a configured-but-unavailable provider.
    mockCreateOpenAI.mockReset();
    mockGoogleTextEmbedding.mockReset();
    mockCreateAmazonBedrock.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('treats a custom-key-only deployment as semantic mode even when the provider is unavailable', () => {
    process.env.CUSTOM_EMBEDDINGS_API_KEY = 'sk-custom';

    const service = new EmbeddingService();

    expect(service.isAvailable()).toBe(false);
    expect(service.isSemanticModeConfigured()).toBe(true);
  });

  it('treats a deployment with no embedding configuration as keyword-only', () => {
    const service = new EmbeddingService();

    expect(service.isAvailable()).toBe(false);
    expect(service.isSemanticModeConfigured()).toBe(false);
  });
});
