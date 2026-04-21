import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks — required because vi.mock factories execute before imports
const {
  mockCreateAnthropic,
  mockCreateOpenAI,
  mockCreateGoogleGenerativeAI,
  mockCreateXai,
  mockCreateAlibaba,
  mockCreateOpenAICompatible,
  mockCreateAmazonBedrock,
  mockCreateOpenRouter,
} = vi.hoisted(() => ({
  mockCreateAnthropic: vi.fn(),
  mockCreateOpenAI: vi.fn(),
  mockCreateGoogleGenerativeAI: vi.fn(),
  mockCreateXai: vi.fn(),
  mockCreateAlibaba: vi.fn(),
  mockCreateOpenAICompatible: vi.fn(),
  mockCreateAmazonBedrock: vi.fn(),
  mockCreateOpenRouter: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mockCreateAnthropic }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: mockCreateGoogleGenerativeAI,
}));
vi.mock('@ai-sdk/xai', () => ({ createXai: mockCreateXai }));
vi.mock('@ai-sdk/alibaba', () => ({ createAlibaba: mockCreateAlibaba }));
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: mockCreateOpenAICompatible,
}));
vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: mockCreateAmazonBedrock,
}));
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: mockCreateOpenRouter,
}));

vi.mock('../../../src/core/tracing/ai-tracing', () => ({
  withAITracing: vi.fn((_config, fn) => fn()),
}));
vi.mock('ai', () => ({
  generateText: vi.fn(),
  jsonSchema: vi.fn(),
  tool: vi.fn(),
  stepCountIs: vi.fn(),
}));

import { AIProviderFactory } from '../../../src/core/ai-provider-factory';
import { NoOpAIProvider } from '../../../src/core/providers/noop-provider';
import { VercelProvider } from '../../../src/core/providers/vercel-provider';

function mockProviderFactory() {
  const mockModel = { modelId: 'test-model' };
  const providerFn = vi.fn().mockReturnValue(mockModel);
  providerFn.chat = vi.fn().mockReturnValue(mockModel);
  providerFn.chatModel = vi.fn().mockReturnValue(mockModel);
  return providerFn;
}

describe('PRD #194: custom and openrouter providers selectable via AI_PROVIDER', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Ensure default selection is deterministic — strip any leaked provider env
    delete process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.MOONSHOT_API_KEY;
    delete process.env.ALIBABA_API_KEY;
    delete process.env.CUSTOM_LLM_API_KEY;
    delete process.env.CUSTOM_LLM_BASE_URL;
    delete process.env.CUSTOM_LLM_HEADERS;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_MODEL;

    vi.clearAllMocks();

    mockCreateAnthropic.mockReturnValue(mockProviderFactory());
    mockCreateOpenAI.mockReturnValue(mockProviderFactory());
    mockCreateGoogleGenerativeAI.mockReturnValue(mockProviderFactory());
    mockCreateXai.mockReturnValue(mockProviderFactory());
    mockCreateAlibaba.mockReturnValue(mockProviderFactory());
    mockCreateOpenAICompatible.mockReturnValue(mockProviderFactory());
    mockCreateAmazonBedrock.mockReturnValue(mockProviderFactory());
    mockCreateOpenRouter.mockReturnValue(mockProviderFactory());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('AI_PROVIDER=custom', () => {
    it('returns a VercelProvider when CUSTOM_LLM_API_KEY and CUSTOM_LLM_BASE_URL are set', () => {
      process.env.AI_PROVIDER = 'custom';
      process.env.CUSTOM_LLM_API_KEY = 'ollama-dummy-key';
      process.env.CUSTOM_LLM_BASE_URL = 'http://host.docker.internal:11434/v1';
      process.env.AI_MODEL = 'qwen2.5:3b';

      const provider = AIProviderFactory.createFromEnv();

      expect(provider).toBeInstanceOf(VercelProvider);
      expect(provider).not.toBeInstanceOf(NoOpAIProvider);
      // Custom provider uses the OpenAI-compatible adapter under the hood
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'ollama-dummy-key',
          baseURL: 'http://host.docker.internal:11434/v1',
        })
      );
    });

    it('falls back to NoOpAIProvider when CUSTOM_LLM_API_KEY is absent', () => {
      process.env.AI_PROVIDER = 'custom';
      delete process.env.CUSTOM_LLM_API_KEY;
      process.env.CUSTOM_LLM_BASE_URL = 'http://host.docker.internal:11434/v1';

      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);

      const provider = AIProviderFactory.createFromEnv();

      expect(provider).toBeInstanceOf(NoOpAIProvider);
      // Messaging should reference the env var name so operators can find it
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('CUSTOM_LLM_API_KEY')
      );
      expect(mockCreateOpenAI).not.toHaveBeenCalled();
    });
  });

  describe('AI_PROVIDER=openrouter', () => {
    it('returns a VercelProvider when OPENROUTER_API_KEY is set', () => {
      process.env.AI_PROVIDER = 'openrouter';
      process.env.OPENROUTER_API_KEY = 'or-sk-test';

      const provider = AIProviderFactory.createFromEnv();

      expect(provider).toBeInstanceOf(VercelProvider);
      expect(provider).not.toBeInstanceOf(NoOpAIProvider);
      expect(mockCreateOpenRouter).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'or-sk-test' })
      );
    });

    it('falls back to NoOpAIProvider when OPENROUTER_API_KEY is absent', () => {
      process.env.AI_PROVIDER = 'openrouter';
      delete process.env.OPENROUTER_API_KEY;

      const provider = AIProviderFactory.createFromEnv();

      expect(provider).toBeInstanceOf(NoOpAIProvider);
      expect(mockCreateOpenRouter).not.toHaveBeenCalled();
    });
  });

  describe('regression: existing providers unaffected', () => {
    it('anthropic path still resolves ANTHROPIC_API_KEY', () => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      AIProviderFactory.createFromEnv();

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'test-key' })
      );
    });

    it('google_flash path still resolves GOOGLE_GENERATIVE_AI_API_KEY', () => {
      process.env.AI_PROVIDER = 'google_flash';
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';

      AIProviderFactory.createFromEnv();

      expect(mockCreateGoogleGenerativeAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'test-key' })
      );
    });
  });
});
