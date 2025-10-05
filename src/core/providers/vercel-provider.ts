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
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  AIProvider,
  AIResponse,
  AIProviderConfig
} from '../ai-provider.interface';

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

  /**
   * Create debug directory if it doesn't exist
   */
  private ensureDebugDirectory(): string {
    const debugDir = path.join(process.cwd(), 'tmp', 'debug-ai');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    return debugDir;
  }

  /**
   * Generate unique identifier for debug files with operation context
   */
  private generateDebugId(operation: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').split('T');
    const dateTime = timestamp[0] + 'T' + timestamp[1].substring(0, 6);
    const randomHex = crypto.randomBytes(4).toString('hex');
    return `${dateTime}_${randomHex}_${operation}`;
  }

  /**
   * Save AI interaction for debugging when DEBUG_DOT_AI=true
   */
  private debugLogInteraction(debugId: string, prompt: string, response: AIResponse, operation: string = 'ai_call'): void {
    if (!this.debugMode) return;

    try {
      const debugDir = this.ensureDebugDirectory();

      // Save prompt with descriptive naming
      const promptFile = path.join(debugDir, `${debugId}_prompt.md`);
      fs.writeFileSync(promptFile, `# AI Prompt - ${operation}\n\nTimestamp: ${new Date().toISOString()}\nProvider: ${this.providerType}\nModel: ${this.model}\nOperation: ${operation}\n\n---\n\n${prompt}`);

      // Save response with matching naming
      const responseFile = path.join(debugDir, `${debugId}_response.md`);
      const responseContent = `# AI Response - ${operation}

Timestamp: ${new Date().toISOString()}
Provider: ${this.providerType}
Model: ${this.model}
Operation: ${operation}
Input Tokens: ${response.usage.input_tokens}
Output Tokens: ${response.usage.output_tokens}

---

${response.content}`;

      fs.writeFileSync(responseFile, responseContent);

      console.log(`🐛 DEBUG: AI interaction logged to tmp/debug-ai/${debugId}_*.md`);
    } catch (error) {
      console.warn('Failed to log AI debug interaction:', error);
    }
  }

  async sendMessage(message: string, operation: string = 'generic'): Promise<AIResponse> {
    if (!this.isInitialized()) {
      throw new Error(`${this.providerType} provider not initialized`);
    }

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

      // Debug log the interaction if enabled
      if (this.debugMode) {
        const debugId = this.generateDebugId(operation);
        this.debugLogInteraction(debugId, message, response, operation);
      }

      return response;

    } catch (error) {
      throw new Error(`${this.providerType} API error: ${error}`);
    }
  }
}
