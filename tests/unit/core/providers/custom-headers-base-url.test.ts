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
        expect.stringContaining(
          'CUSTOM_LLM_HEADERS is not valid JSON'
        )
      );

      // Verify invalid headers are ignored — only provider defaults remain
      const anthropicConfig = mockCreateAnthropic.mock.calls[0]?.[0];
      expect(anthropicConfig.headers).toEqual(
        expect.objectContaining({
          'anthropic-beta': 'context-1m-2025-08-07',
        })
      );
      expect(anthropicConfig.headers).not.toHaveProperty('x-custom-auth');
    });

    it('should work without CUSTOM_LLM_HEADERS set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      delete process.env.CUSTOM_LLM_HEADERS;

      AIProviderFactory.createFromEnv();

      // Anthropic should still get its default beta header
      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'anthropic-beta': 'context-1m-2025-08-07',
          }),
        })
      );
    });
  });

  describe('Header merging with provider defaults', () => {
    it('should merge custom headers with Anthropic beta header', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_HEADERS = '{"x-custom": "value"}';

      AIProviderFactory.createFromEnv();

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'anthropic-beta': 'context-1m-2025-08-07',
            'x-custom': 'value',
          },
        })
      );
    });

    it('should allow custom headers to override Anthropic beta header', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.AI_PROVIDER = 'anthropic';
      process.env.CUSTOM_LLM_HEADERS =
        '{"anthropic-beta": "custom-beta-value"}';

      AIProviderFactory.createFromEnv();

      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'anthropic-beta': 'custom-beta-value',
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
            'anthropic-beta': 'context-1m-2025-08-07',
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
      process.env.CUSTOM_LLM_BASE_URL =
        'https://openrouter.ai/api/v1';

      AIProviderFactory.createFromEnv();

      // OpenRouter detection takes priority
      expect(mockCreateOpenRouter).toHaveBeenCalled();
      expect(mockCreateAnthropic).not.toHaveBeenCalled();
    });

    it('should detect OpenRouter URL when AI_PROVIDER is not set', () => {
      delete process.env.AI_PROVIDER;
      process.env.CUSTOM_LLM_API_KEY = 'test-key';
      process.env.CUSTOM_LLM_BASE_URL =
        'https://openrouter.ai/api/v1';

      AIProviderFactory.createFromEnv();

      expect(mockCreateOpenRouter).toHaveBeenCalled();
    });

    it('should work with no base URL and no custom headers (default behavior)', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      delete process.env.AI_PROVIDER;
      delete process.env.CUSTOM_LLM_BASE_URL;
      delete process.env.CUSTOM_LLM_HEADERS;

      AIProviderFactory.createFromEnv();

      // Default: anthropic provider with beta header, no baseURL
      expect(mockCreateAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'anthropic-beta': 'context-1m-2025-08-07',
          },
        })
      );
      // Should NOT have baseURL in the call
      const callArgs = mockCreateAnthropic.mock.calls[0][0];
      expect(callArgs.baseURL).toBeUndefined();
    });
  });
});
