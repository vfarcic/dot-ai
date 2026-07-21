/**
 * Unit tests for the Amazon Bedrock credential-provider integration in
 * VercelProvider (PRD #694).
 *
 * Strategy: mock @ai-sdk/amazon-bedrock and @aws-sdk/credential-providers so
 * we can assert that fromNodeProviderChain() is wired into
 * createAmazonBedrock({ credentialProvider }) without any real AWS calls.
 * Follows the vi.hoisted pattern from custom-headers-base-url.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockLanguageModel,
} from './_helpers/mock-language-model';

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

// Stub tracing and debug utils so they don't interfere.
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
 * Create a provider factory function that returns a mock model when called.
 */
function bedrockProviderFactory() {
  const mockModel = createMockLanguageModel({ text: 'bedrock response' });
  const providerFn = vi.fn().mockReturnValue(mockModel);
  return providerFn;
}

describe('VercelProvider — Amazon Bedrock credential chain (PRD #694)', () => {
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
    mockFromNodeProviderChain.mockReturnValue(sentinelProvider);
    mockCreateAmazonBedrock.mockReturnValue(bedrockProviderFactory());

    const provider = new VercelProvider({
      provider: 'amazon_bedrock',
      apiKey: 'ignored-for-bedrock',
      debugMode: false,
    });

    expect(provider).toBeDefined();
    expect(mockFromNodeProviderChain).toHaveBeenCalledOnce();
    expect(mockCreateAmazonBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialProvider: sentinelProvider,
      }),
    );
  });

  it('defaults region to us-east-1 when AWS_REGION is not set', () => {
    const sentinelProvider = Symbol('credential-provider');
    mockFromNodeProviderChain.mockReturnValue(sentinelProvider);
    mockCreateAmazonBedrock.mockReturnValue(bedrockProviderFactory());

    new VercelProvider({
      provider: 'amazon_bedrock',
      apiKey: 'ignored-for-bedrock',
      debugMode: false,
    });

    expect(mockCreateAmazonBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        credentialProvider: sentinelProvider,
      }),
    );
  });

  it('respects AWS_REGION environment variable', () => {
    process.env.AWS_REGION = 'eu-central-1';
    const sentinelProvider = Symbol('credential-provider');
    mockFromNodeProviderChain.mockReturnValue(sentinelProvider);
    mockCreateAmazonBedrock.mockReturnValue(bedrockProviderFactory());

    new VercelProvider({
      provider: 'amazon_bedrock',
      apiKey: 'ignored-for-bedrock',
      debugMode: false,
    });

    expect(mockCreateAmazonBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'eu-central-1',
        credentialProvider: sentinelProvider,
      }),
    );
  });

  it('does not require static AWS credentials at construction', () => {
    const sentinelProvider = Symbol('credential-provider');
    mockFromNodeProviderChain.mockReturnValue(sentinelProvider);
    mockCreateAmazonBedrock.mockReturnValue(bedrockProviderFactory());

    // Clear all AWS credential env vars
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;

    const provider = new VercelProvider({
      provider: 'amazon_bedrock',
      apiKey: 'ignored-for-bedrock',
      debugMode: false,
    });

    expect(provider).toBeDefined();
    expect(provider.isInitialized()).toBe(true);
  });

  it('constructs the credential provider once, not per-request', () => {
    mockFromNodeProviderChain.mockReturnValue('memoized-provider');
    mockCreateAmazonBedrock.mockReturnValue(bedrockProviderFactory());

    new VercelProvider({
      provider: 'amazon_bedrock',
      apiKey: 'ignored-for-bedrock',
      debugMode: false,
    });

    expect(mockFromNodeProviderChain).toHaveBeenCalledTimes(1);
  });
});
