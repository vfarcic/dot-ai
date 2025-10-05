/**
 * AI Provider Factory
 *
 * Creates AI provider instances based on configuration.
 * Supports environment-based provider selection and extensible provider architecture.
 *
 * Phase 1 Implementation (PRD 73): anthropic, openai, google
 * Architecture supports future expansion to 19+ Vercel AI SDK providers
 */

import {
  AIProvider,
  AIProviderConfig
} from './ai-provider.interface';
import { AnthropicProvider } from './providers/anthropic-provider';
import { VercelProvider } from './providers/vercel-provider';

/**
 * Provider environment variable mappings
 * Phase 1 (PRD 73): anthropic, openai, google
 */
const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

/**
 * Providers implemented in Phase 1
 */
const IMPLEMENTED_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
type ImplementedProvider = typeof IMPLEMENTED_PROVIDERS[number];

/**
 * Factory for creating AI provider instances
 *
 * Usage:
 * ```typescript
 * // Explicit provider selection
 * const provider = AIProviderFactory.create({
 *   provider: 'anthropic',
 *   apiKey: process.env.ANTHROPIC_API_KEY
 * });
 *
 * // Auto-detect from environment
 * const provider = AIProviderFactory.createFromEnv();
 * ```
 */
export class AIProviderFactory {
  /**
   * Create an AI provider instance with explicit configuration
   *
   * @param config Provider configuration
   * @returns Configured AI provider instance
   * @throws Error if provider type is unsupported or configuration is invalid
   */
  static create(config: AIProviderConfig): AIProvider {
    // Validate configuration
    if (!config.apiKey) {
      throw new Error(`API key is required for ${config.provider} provider`);
    }

    if (!config.provider) {
      throw new Error('Provider type must be specified');
    }

    // Check if provider is implemented in Phase 1
    if (!IMPLEMENTED_PROVIDERS.includes(config.provider as ImplementedProvider)) {
      throw new Error(
        `Provider '${config.provider}' is not yet implemented. ` +
        `Phase 1 providers: ${IMPLEMENTED_PROVIDERS.join(', ')}. ` +
        `Future phases will add support for additional Vercel AI SDK providers.`
      );
    }

    // Create provider based on type
    switch (config.provider) {
      case 'anthropic':
        return this.createAnthropicProvider(config);

      case 'openai':
        return this.createOpenAIProvider(config);

      case 'google':
        return this.createGoogleProvider(config);

      default:
        // This should never happen due to IMPLEMENTED_PROVIDERS check above
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  /**
   * Create provider from environment variables
   *
   * Detects provider from AI_PROVIDER env var (defaults to 'anthropic')
   * and loads corresponding API key from environment.
   *
   * Supports AI_PROVIDER_SDK env var to override SDK choice:
   * - 'native' (default): Use native provider SDK
   * - 'vercel': Use Vercel AI SDK for the provider
   *
   * @returns Configured AI provider instance
   * @throws Error if required environment variables are missing
   */
  static createFromEnv(): AIProvider {
    const providerType = process.env.AI_PROVIDER || 'anthropic';
    const sdkPreference = process.env.AI_PROVIDER_SDK || 'native';

    // Validate provider is implemented
    if (!IMPLEMENTED_PROVIDERS.includes(providerType as ImplementedProvider)) {
      throw new Error(
        `Invalid AI_PROVIDER: ${providerType}. ` +
        `Must be one of: ${IMPLEMENTED_PROVIDERS.join(', ')}`
      );
    }

    // Get API key for the provider
    const apiKeyEnvVar = PROVIDER_ENV_KEYS[providerType];
    if (!apiKeyEnvVar) {
      throw new Error(`No API key environment variable defined for provider: ${providerType}`);
    }

    const apiKey = process.env[apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(`${apiKeyEnvVar} environment variable must be set for ${providerType} provider`);
    }

    // Get optional model override
    const model = process.env.AI_MODEL;

    // Get debug mode setting
    const debugMode = process.env.DEBUG_DOT_AI === 'true';

    // If SDK override to 'vercel', use VercelProvider for all providers
    if (sdkPreference === 'vercel') {
      return new VercelProvider({
        provider: providerType,
        apiKey,
        model,
        debugMode
      });
    }

    return this.create({
      provider: providerType,
      apiKey,
      model,
      debugMode
    });
  }

  /**
   * Create Anthropic provider instance
   * @private
   */
  private static createAnthropicProvider(config: AIProviderConfig): AIProvider {
    return new AnthropicProvider(config);
  }

  /**
   * Create OpenAI provider instance
   * @private
   */
  private static createOpenAIProvider(config: AIProviderConfig): AIProvider {
    return new VercelProvider(config);
  }

  /**
   * Create Google provider instance
   * @private
   */
  private static createGoogleProvider(config: AIProviderConfig): AIProvider {
    return new VercelProvider(config);
  }

  /**
   * Check if a provider is available (has API key configured)
   *
   * @param provider Provider type to check
   * @returns true if provider has API key configured
   */
  static isProviderAvailable(provider: string): boolean {
    const apiKeyEnvVar = PROVIDER_ENV_KEYS[provider];
    if (!apiKeyEnvVar) return false;
    return !!process.env[apiKeyEnvVar];
  }

  /**
   * Get list of available providers (implemented + have API keys configured)
   *
   * @returns Array of available provider types
   */
  static getAvailableProviders(): string[] {
    return IMPLEMENTED_PROVIDERS.filter(provider =>
      this.isProviderAvailable(provider)
    );
  }

  /**
   * Check if a provider is implemented in current phase
   *
   * @param provider Provider type to check
   * @returns true if provider is implemented
   */
  static isProviderImplemented(provider: string): boolean {
    return IMPLEMENTED_PROVIDERS.includes(provider as ImplementedProvider);
  }
}

/**
 * Convenience function to create AI provider from environment
 * Maintains backward compatibility with existing code
 */
export function createAIProvider(): AIProvider {
  return AIProviderFactory.createFromEnv();
}
