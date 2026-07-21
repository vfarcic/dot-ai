/**
 * Unit tests for the Amazon Bedrock credential-provider integration in
 * VercelEmbeddingProvider (PRD #694).
 *
 * Strategy: mock @ai-sdk/amazon-bedrock and @aws-sdk/credential-providers so
 * we can assert that fromNodeProviderChain() is wired into
 * createAmazonBedrock({ credentialProvider }) on the embeddings path.
 * Follows the vi.hoisted pattern from embedding-service.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockEmbeddingModel } from './_helpers/mock-embedding-model';

// Hoisted mocks — factories run before module imports.
const { mockCreateAmazonBedrock, mockFromNodeProviderChain } =
  vi.hoisted(() => ({
    mockCreateAmazonBedrock: vi.fn(),
    mockFromNodeProviderChain: vi.fn(),
  }));

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: mockCreateAmazonBedrock,
}));

vi.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: mockFromNodeProviderChain,
}));

// Stub tracing so it doesn't interfere.
vi.mock('../../../src/core/tracing/ai-tracing', () => ({
  withAITracing: vi.fn((_config, fn) => fn()),
}));

import { VercelEmbeddingProvider } from '../../../src/core/embedding-service';

describe('VercelEmbeddingProvider — Amazon Bedrock credential chain (PRD #694)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.DEBUG_DOT_AI;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('passes credentialProvider from fromNodeProviderChain() to createAmazonBedrock', () => {
    const sentinelProvider = Symbol('credential-provider');
    const mockModel = createMockEmbeddingModel({ dimensions: 4 });

    mockFromNodeProviderChain.mockReturnValue(sentinelProvider);
    mockCreateAmazonBedrock.mockReturnValue({
      textEmbeddingModel: () => mockModel,
    });

    const provider = new VercelEmbeddingProvider({
      provider: 'amazon_bedrock',
    });

    expect(provider).toBeDefined();
    expect(provider.isAvailable()).toBe(true);
    expect(mockFromNodeProviderChain).toHaveBeenCalledOnce();
    expect(mockCreateAmazonBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialProvider: sentinelProvider,
      }),
    );
  });

  it('defaults region to us-east-1 when AWS_REGION is not set', () => {
    const sentinelProvider = Symbol('credential-provider');
    const mockModel = createMockEmbeddingModel({ dimensions: 4 });

    mockFromNodeProviderChain.mockReturnValue(sentinelProvider);
    mockCreateAmazonBedrock.mockReturnValue({
      textEmbeddingModel: () => mockModel,
    });

    new VercelEmbeddingProvider({
      provider: 'amazon_bedrock',
    });

    expect(mockCreateAmazonBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        credentialProvider: sentinelProvider,
      }),
    );
  });

  it('respects AWS_REGION environment variable', () => {
    process.env.AWS_REGION = 'eu-west-1';
    const sentinelProvider = Symbol('credential-provider');
    const mockModel = createMockEmbeddingModel({ dimensions: 4 });

    mockFromNodeProviderChain.mockReturnValue(sentinelProvider);
    mockCreateAmazonBedrock.mockReturnValue({
      textEmbeddingModel: () => mockModel,
    });

    new VercelEmbeddingProvider({
      provider: 'amazon_bedrock',
    });

    expect(mockCreateAmazonBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'eu-west-1',
        credentialProvider: sentinelProvider,
      }),
    );
  });

  it('constructs without static AWS credentials', () => {
    const sentinelProvider = Symbol('credential-provider');
    const mockModel = createMockEmbeddingModel({ dimensions: 4 });

    mockFromNodeProviderChain.mockReturnValue(sentinelProvider);
    mockCreateAmazonBedrock.mockReturnValue({
      textEmbeddingModel: () => mockModel,
    });

    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;

    const provider = new VercelEmbeddingProvider({
      provider: 'amazon_bedrock',
    });

    expect(provider).toBeDefined();
    expect(provider.isAvailable()).toBe(true);
  });

  it('does not call fromNodeProviderChain for non-bedrock providers', () => {
    delete process.env.OPENAI_API_KEY;

    const provider = new VercelEmbeddingProvider({
      provider: 'openai',
    });

    expect(provider).toBeDefined();
    expect(provider.isAvailable()).toBe(false);
    expect(mockFromNodeProviderChain).not.toHaveBeenCalled();
    expect(mockCreateAmazonBedrock).not.toHaveBeenCalled();
  });
});
