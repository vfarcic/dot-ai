import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so mocks are available when vi.mock factories run
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

// Mock tracing and ai module to avoid side effects
vi.mock('../../../../src/core/tracing/ai-tracing', () => ({
  withAITracing: vi.fn((_config, fn) => fn()),
}));
vi.mock('ai', () => ({
  generateText: vi.fn(),
  jsonSchema: vi.fn(),
  tool: vi.fn(),
  stepCountIs: vi.fn(),
}));

import { AIProviderFactory } from '../../../../src/core/ai-provider-factory';

// Helper: create a mock provider function that returns a mock model
function mockProviderFactory() {
  const mockModel = { modelId: 'test-model' };
  const providerFn = vi.fn().mockReturnValue(mockModel);
  // Also support .chat() for OpenAI custom endpoints
  providerFn.chat = vi.fn().mockReturnValue(mockModel);
  // Also support .chatModel() for OpenAI-compatible (kimi)
  providerFn.chatModel = vi.fn().mockReturnValue(mockModel);
  return providerFn;
}

describe('PRD #443: Custom Headers and Base URL Support', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();

    // Set up default mock returns
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

  describe('CUSTOM_LLM_HEADERS parsing', () => {
    it('should parse valid JSON headers and pass to provider', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_HEADERS =
        '{"version": "2026-02-20", "x-custom-auth": "token123"}';

      AIProviderFactory.createFromEnv();

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            version: '2026-02-20',
            'x-custom-auth': 'token123',
          }),
        })
      );
    });

    it('should ignore invalid JSON and log warning', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_HEADERS = 'not-valid-json';

      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);

      AIProviderFactory.createFromEnv();

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('CUSTOM_LLM_HEADERS is not valid JSON')
      );

      // Verify invalid headers are ignored — no headers passed
      const anthropicConfig = mockCreateAnthropic.mock.calls[0]?.[0];
      expect(anthropicConfig.headers).toBeUndefined();
    });

    it('should work without CUSTOM_LLM_HEADERS set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      delete process.env.CUSTOM_LLM_HEADERS;

      AIProviderFactory.createFromEnv();

      // Anthropic should be called with apiKey, no headers
      const anthropicConfig = mockCreateAnthropic.mock.calls[0]?.[0];
      expect(anthropicConfig.apiKey).toBe('test-key');
      expect(anthropicConfig.headers).toBeUndefined();
    });
  });

  describe('Header merging with provider defaults', () => {
    it('should pass custom headers to Anthropic provider', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_HEADERS = '{"x-custom": "value"}';

      AIProviderFactory.createFromEnv();

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'x-custom': 'value',
          },
        })
      );
    });

    it('should pass custom headers to OpenAI provider', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'openai';
      process.env.CUSTOM_LLM_HEADERS = '{"x-custom": "value"}';

      AIProviderFactory.createFromEnv();

      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'x-custom': 'value' },
        })
      );
    });

    it('should pass custom headers to Google provider', () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'google';
      process.env.CUSTOM_LLM_HEADERS = '{"x-custom": "value"}';

      AIProviderFactory.createFromEnv();

      expect(mockCreateGoogleGenerativeAI).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'x-custom': 'value' },
        })
      );
    });

    it('should pass custom headers to xAI provider', () => {
      process.env.XAI_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'xai';
      process.env.CUSTOM_LLM_HEADERS = '{"x-custom": "value"}';

      AIProviderFactory.createFromEnv();

      expect(mockCreateXai).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { 'x-custom': 'value' },
        })
      );
    });
  });

  describe('Base URL with explicit AI_PROVIDER (no provider override)', () => {
    it('should preserve AI_PROVIDER=anthropic when CUSTOM_LLM_BASE_URL is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_BASE_URL = 'https://proxy.example.com/api';

      AIProviderFactory.createFromEnv();

      // Should use createAnthropic (not createOpenAI for 'custom')
      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://proxy.example.com/api',
        })
      );
      expect(mockCreateOpenAI).not.toHaveBeenCalled();
    });

    it('should preserve AI_PROVIDER=openai when CUSTOM_LLM_BASE_URL is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'openai';
      process.env.CUSTOM_LLM_BASE_URL = 'https://proxy.example.com/v1';

      AIProviderFactory.createFromEnv();

      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://proxy.example.com/v1',
        })
      );
    });

    it('should pass both baseURL and custom headers to Anthropic proxy', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_BASE_URL = 'https://proxy.example.com/api';
      process.env.CUSTOM_LLM_HEADERS =
        '{"version": "2026-02-20", "x-proxy-auth": "secret"}';

      AIProviderFactory.createFromEnv();

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://proxy.example.com/api',
          headers: {
            version: '2026-02-20',
            'x-proxy-auth': 'secret',
          },
        })
      );
    });
  });

  describe('Backward compatibility', () => {
    it('should fall back to custom provider when AI_PROVIDER is not set and base URL is provided', () => {
      delete process.env.AI_PROVIDER;
      process.env.CUSTOM_LLM_API_KEY = 'test-key';
      process.env.CUSTOM_LLM_BASE_URL = 'http://ollama:11434/v1';

      AIProviderFactory.createFromEnv();

      // Should use createOpenAI for 'custom' provider (backward compat)
      expect(mockCreateOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://ollama:11434/v1',
        })
      );
      expect(mockCreateAnthropic).not.toHaveBeenCalled();
    });

    it('should detect OpenRouter URL regardless of AI_PROVIDER', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_BASE_URL = 'https://openrouter.ai/api/v1';

      AIProviderFactory.createFromEnv();

      // OpenRouter detection takes priority
      expect(mockCreateOpenRouter).toHaveBeenCalled();
      expect(mockCreateAnthropic).not.toHaveBeenCalled();
    });

    it('should detect OpenRouter URL when AI_PROVIDER is not set', () => {
      delete process.env.AI_PROVIDER;
      process.env.CUSTOM_LLM_API_KEY = 'test-key';
      process.env.CUSTOM_LLM_BASE_URL = 'https://openrouter.ai/api/v1';

      AIProviderFactory.createFromEnv();

      expect(mockCreateOpenRouter).toHaveBeenCalled();
    });

    it('should work with no base URL and no custom headers (default behavior)', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      delete process.env.AI_PROVIDER;
      delete process.env.CUSTOM_LLM_BASE_URL;
      delete process.env.CUSTOM_LLM_HEADERS;

      AIProviderFactory.createFromEnv();

      // Default: anthropic provider with apiKey, no headers, no baseURL
      const callArgs = mockCreateAnthropic.mock.calls[0][0];
      expect(callArgs.apiKey).toBe('test-key');
      expect(callArgs.headers).toBeUndefined();
      expect(callArgs.baseURL).toBeUndefined();
    });
  });

  describe('Anthropic Bearer auth (authToken) for corporate proxies', () => {
    it('should use authToken when Authorization header is in custom headers', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_HEADERS =
        '{"Authorization": "Bearer proxy-token", "x-custom": "value"}';

      AIProviderFactory.createFromEnv();

      const config = mockCreateAnthropic.mock.calls[0]?.[0];
      expect(config.authToken).toBe('proxy-token');
      expect(config.apiKey).toBeUndefined();
      // Authorization stripped from headers (SDK generates it from authToken)
      expect(config.headers).toEqual({ 'x-custom': 'value' });
    });

    it('should use apiKey when no Authorization header is in custom headers', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_HEADERS = '{"x-custom": "value"}';

      AIProviderFactory.createFromEnv();

      const config = mockCreateAnthropic.mock.calls[0]?.[0];
      expect(config.apiKey).toBe('test-key');
      expect(config.authToken).toBeUndefined();
    });

    it('should detect Authorization header case-insensitively', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_HEADERS =
        '{"authorization": "Bearer proxy-token"}';

      AIProviderFactory.createFromEnv();

      const config = mockCreateAnthropic.mock.calls[0]?.[0];
      expect(config.authToken).toBe('proxy-token');
      expect(config.apiKey).toBeUndefined();
      // Authorization stripped; remaining headers is empty object
      expect(config.headers).toEqual({});
    });

    it('should work with anthropic_opus variant', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic_opus';
      process.env.CUSTOM_LLM_HEADERS =
        '{"Authorization": "Bearer proxy-token"}';

      AIProviderFactory.createFromEnv();

      const config = mockCreateAnthropic.mock.calls[0]?.[0];
      expect(config.authToken).toBe('proxy-token');
      expect(config.apiKey).toBeUndefined();
    });

    it('should work with anthropic_haiku variant', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic_haiku';
      process.env.CUSTOM_LLM_HEADERS =
        '{"Authorization": "Bearer proxy-token"}';

      AIProviderFactory.createFromEnv();

      const config = mockCreateAnthropic.mock.calls[0]?.[0];
      expect(config.authToken).toBe('proxy-token');
      expect(config.apiKey).toBeUndefined();
    });

    it('should combine authToken with baseURL for full proxy scenario', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_BASE_URL =
        'https://proxy.corp.example.com/anthropic/v1';
      process.env.CUSTOM_LLM_HEADERS =
        '{"Authorization": "Bearer proxy-token", "version": "2026-02-20"}';

      AIProviderFactory.createFromEnv();

      const config = mockCreateAnthropic.mock.calls[0]?.[0];
      expect(config.authToken).toBe('proxy-token');
      expect(config.apiKey).toBeUndefined();
      expect(config.baseURL).toBe(
        'https://proxy.corp.example.com/anthropic/v1'
      );
      expect(config.headers).toEqual({ version: '2026-02-20' });
    });
  });
});
