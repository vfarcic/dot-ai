/**
 * Vercel AI Provider Implementation
 *
 * Implements AIProvider interface using Vercel AI SDK.
 * Supports OpenAI and Google Gemini providers through unified interface.
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  AIProvider,
  AIResponse,
  AIProviderConfig,
  ToolLoopConfig,
  AgenticResult
} from '../ai-provider.interface';
import { generateDebugId, debugLogInteraction, logMetrics } from './provider-debug-utils';

/**
 * Provider-specific default models
 */
const PROVIDER_MODELS = {
  openai: 'gpt-5',
  google: 'gemini-2.5-pro',
  anthropic: 'claude-sonnet-4-5-20250929'
} as const;

type SupportedProvider = keyof typeof PROVIDER_MODELS;

export class VercelProvider implements AIProvider {
  private providerType: SupportedProvider;
  private model: string;
  private apiKey: string;
  private debugMode: boolean;
  private modelInstance: any; // Vercel AI SDK model instance

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey;
    this.providerType = config.provider as SupportedProvider;
    this.model = config.model || this.getDefaultModel();
    this.debugMode = config.debugMode ?? (process.env.DEBUG_DOT_AI === 'true');

    this.validateConfiguration();
    this.initializeModel();
  }

  private validateConfiguration(): void {
    if (!this.apiKey) {
      throw new Error(`API key is required for ${this.providerType} provider`);
    }

    if (!['openai', 'google', 'anthropic'].includes(this.providerType)) {
      throw new Error(`Unsupported provider: ${this.providerType}. Must be 'openai', 'google', or 'anthropic'`);
    }
  }

  private initializeModel(): void {
    try {
      switch (this.providerType) {
        case 'openai': {
          const provider = createOpenAI({
            apiKey: this.apiKey
          });
          this.modelInstance = provider(this.model);
          break;
        }
        case 'google': {
          const provider = createGoogleGenerativeAI({
            apiKey: this.apiKey
          });
          this.modelInstance = provider(this.model);
          break;
        }
        case 'anthropic': {
          const provider = createAnthropic({
            apiKey: this.apiKey
          });
          this.modelInstance = provider(this.model);
          break;
        }
        default:
          throw new Error(`Cannot initialize model for provider: ${this.providerType}`);
      }
    } catch (error) {
      throw new Error(`Failed to initialize ${this.providerType} model: ${error}`);
    }
  }

  getProviderType(): string {
    return this.providerType;
  }

  getDefaultModel(): string {
    return PROVIDER_MODELS[this.providerType];
  }

  isInitialized(): boolean {
    return this.modelInstance !== undefined;
  }

  async sendMessage(message: string, operation: string = 'generic'): Promise<AIResponse> {
    if (!this.isInitialized()) {
      throw new Error(`${this.providerType} provider not initialized`);
    }

    const startTime = Date.now();

    try {
      // Use Vercel AI SDK generateText
      // Note: maxTokens omitted - let SDK/provider use model-specific optimal defaults
      const result = await generateText({
        model: this.modelInstance,
        prompt: message,
      });

      const response: AIResponse = {
        content: result.text,
        usage: {
          input_tokens: result.usage.inputTokens || 0,
          output_tokens: result.usage.outputTokens || 0
        }
      };

      const durationMs = Date.now() - startTime;

      // Debug log the interaction if enabled
      if (this.debugMode) {
        const debugId = generateDebugId(operation);
        debugLogInteraction(debugId, message, response, operation, this.getProviderType(), this.model, this.debugMode);
        logMetrics(operation, this.getProviderType(), response.usage, durationMs, this.debugMode);
      }

      return response;

    } catch (error) {
      throw new Error(`${this.providerType} API error: ${error}`);
    }
  }

  /**
   * Agentic tool loop - NOT IMPLEMENTED for Vercel provider
   *
   * This method is intentionally not implemented because:
   * 1. toolLoop() is currently NOT USED anywhere in the codebase (see PRD #136)
   * 2. JSON-based agentic loops already provide equivalent functionality
   * 3. No current workflows require SDK-managed tool loops
   *
   * If future requirements necessitate toolLoop() for non-Anthropic providers,
   * this would need to be implemented using Vercel AI SDK's tool calling API.
   *
   * See AnthropicProvider.toolLoop() and PRD #136 for implementation reference.
   */
  async toolLoop(_config: ToolLoopConfig): Promise<AgenticResult> {
    if (!this.isInitialized()) {
      throw new Error(`${this.providerType} provider not initialized`);
    }

    throw new Error(`toolLoop() not implemented for ${this.providerType} provider. Use AnthropicProvider for tool-based workflows, or use JSON-based agentic loops (recommended).`);
  }

}
