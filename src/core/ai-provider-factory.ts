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
import { VercelProvider } from './providers/vercel-provider';
import { HostProvider } from './providers/host-provider';
import { NoOpAIProvider } from './providers/noop-provider';
import { CURRENT_MODELS } from './model-config';

/**
 * Provider environment variable mappings
 * Phase 1 (PRD 73): anthropic, openai, google
 */
const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  anthropic_opus: 'ANTHROPIC_API_KEY', // Uses same API key as regular Anthropic
  anthropic_haiku: 'ANTHROPIC_API_KEY', // Uses same API key as regular Anthropic
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY', // Standard Vercel AI SDK env var (also checks GOOGLE_API_KEY as fallback)
  google_flash: 'GOOGLE_GENERATIVE_AI_API_KEY', // PRD #294: Uses same API key as regular Google
  kimi: 'MOONSHOT_API_KEY', // PRD #237: Moonshot AI Kimi K2
  kimi_thinking: 'MOONSHOT_API_KEY', // PRD #237: Uses same API key as regular Kimi
  xai: 'XAI_API_KEY',
};

/**
 * Providers implemented - dynamically generated from CURRENT_MODELS
 * Single source of truth maintained in model-config.ts
 */
type ImplementedProvider = keyof typeof CURRENT_MODELS;
const IMPLEMENTED_PROVIDERS = Object.keys(CURRENT_MODELS) as ImplementedProvider[];

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
    if (config.provider === CURRENT_MODELS.host) {
      return new HostProvider();
    }

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

    // All providers use VercelProvider (PRD #238: consolidated on Vercel AI SDK)
    return new VercelProvider(config);
  }

  /**
   * Create provider from environment variables
   *
   * Detects provider from AI_PROVIDER env var (defaults to 'anthropic')
   * and loads corresponding API key from environment.
   *
   * If no API keys are configured, returns a NoOpAIProvider that allows
   * the MCP server to start but returns helpful errors when AI is needed.
   *
   * @returns Configured AI provider instance or NoOpProvider if no keys available
   */
  static createFromEnv(): AIProvider {
    const providerType = process.env.AI_PROVIDER || 'anthropic';

    // Validate provider is implemented
    if (!IMPLEMENTED_PROVIDERS.includes(providerType as ImplementedProvider)) {
      // Write to stderr for logging
      process.stderr.write(
        `WARNING: Invalid AI_PROVIDER: ${providerType}. ` +
        `Must be one of: ${IMPLEMENTED_PROVIDERS.join(', ')}. ` +
        `Falling back to NoOpProvider.\n`
      );
      return new NoOpAIProvider();
    }

    // Get API key for the provider
    // PRD #194: Support CUSTOM_LLM_API_KEY for custom LLM endpoints
    // Priority: 1. CUSTOM_LLM_API_KEY, 2. Provider-specific key (e.g., OPENAI_API_KEY)
    // PRD #175: Amazon Bedrock uses AWS SDK credential chain, not API keys
    let apiKey: string;

    // Special handling for Amazon Bedrock - AWS SDK handles credentials automatically
    if (providerType === 'amazon_bedrock') {
      // Use dummy API key for Bedrock - AWS SDK will handle actual authentication
      // AWS credentials checked at runtime by AWS SDK (env vars, ~/.aws/credentials, IAM roles)
      apiKey = 'bedrock-uses-aws-credentials';
    } else if (providerType === CURRENT_MODELS.host) {
      return new HostProvider();
    } else {
      const apiKeyEnvVar = PROVIDER_ENV_KEYS[providerType];
      if (!apiKeyEnvVar) {
        process.stderr.write(
          `WARNING: No API key environment variable defined for provider: ${providerType}. ` +
          `Falling back to NoOpProvider.\n`
        );
        return new NoOpAIProvider();
      }

      // Check primary env var, with fallback for Google providers (GOOGLE_API_KEY for backward compatibility)
      let resolvedApiKey = process.env.CUSTOM_LLM_API_KEY || process.env[apiKeyEnvVar];
      if (!resolvedApiKey && providerType.startsWith('google')) {
        resolvedApiKey = process.env.GOOGLE_API_KEY; // Fallback for backward compatibility
      }
      if (!resolvedApiKey) {
        process.stderr.write(
          `INFO: ${apiKeyEnvVar} not configured. ` +
          `AI features will be unavailable. ` +
          `Tools that don't require AI (prompts, project-setup) will still work.\n`
        );
        return new NoOpAIProvider();
      }
      apiKey = resolvedApiKey;
    }

    // Get optional model override
    const model = process.env.AI_MODEL;

    // Get debug mode setting
    const debugMode = process.env.DEBUG_DOT_AI === 'true';

    // PRD #194: Get custom endpoint URL for OpenAI-compatible LLM APIs
    // Use CUSTOM_LLM_BASE_URL for LLM endpoints (separate from OPENAI_BASE_URL used for embeddings)
    const baseURL = process.env.CUSTOM_LLM_BASE_URL;

    // Determine effective provider type based on endpoint configuration
    let effectiveProviderType = providerType;

    // PRD #194: Detect OpenRouter and override provider type
    // OpenRouter requires dedicated provider for proper tool calling support
    if (baseURL && baseURL.includes('openrouter.ai')) {
      effectiveProviderType = 'openrouter';
    } else if (baseURL) {
      // Generic custom endpoint (Ollama, vLLM, LiteLLM, etc.)
      effectiveProviderType = 'custom';
    }

    return this.create({
      provider: effectiveProviderType,
      apiKey,
      model,
      debugMode,
      baseURL
    });
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
