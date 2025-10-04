/**
 * Anthropic AI Provider Implementation
 *
 * Implements AIProvider interface using Anthropic SDK directly.
 * Supports streaming for long operations and debug logging.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  AIProvider,
  AIResponse,
  AIProviderConfig
} from '../ai-provider.interface';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private apiKey: string;
  private model: string;
  private debugMode: boolean;

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || this.getDefaultModel();
    this.debugMode = config.debugMode ?? (process.env.DEBUG_DOT_AI === 'true');

    this.validateApiKey();
    this.client = new Anthropic({
      apiKey: this.apiKey,
    });
  }

  private validateApiKey(): void {
    if (!this.apiKey) {
      throw new Error('API key is required for Anthropic provider');
    }
    if (this.apiKey.length === 0) {
      throw new Error('Invalid API key: API key cannot be empty');
    }
  }

  getProviderType(): string {
    return 'anthropic';
  }

  getDefaultModel(): string {
    return 'claude-sonnet-4-5-20250929';
  }

  isInitialized(): boolean {
    return this.client !== undefined;
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
      fs.writeFileSync(promptFile, `# AI Prompt - ${operation}\n\nTimestamp: ${new Date().toISOString()}\nOperation: ${operation}\n\n---\n\n${prompt}`);

      // Save response with matching naming
      const responseFile = path.join(debugDir, `${debugId}_response.md`);
      const responseContent = `# AI Response - ${operation}

Timestamp: ${new Date().toISOString()}
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
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    try {
      // Make real API call to Anthropic with streaming
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: 64000,
        messages: [{ role: 'user', content: message }],
        stream: true // Enable streaming by default to support long operations (>10 minutes)
      });

      let content = '';
      let input_tokens = 0;
      let output_tokens = 0;

      for await (const chunk of stream) {
        if (chunk.type === 'message_start') {
          input_tokens = chunk.message.usage.input_tokens;
        } else if (chunk.type === 'content_block_delta') {
          if (chunk.delta.type === 'text_delta') {
            content += chunk.delta.text;
          }
        } else if (chunk.type === 'message_delta') {
          output_tokens = chunk.usage.output_tokens;
        }
      }

      const response: AIResponse = {
        content,
        usage: {
          input_tokens,
          output_tokens
        }
      };

      // Debug log the interaction if enabled
      if (this.debugMode) {
        const debugId = this.generateDebugId(operation);
        this.debugLogInteraction(debugId, message, response, operation);
      }

      return response;

    } catch (error) {
      throw new Error(`Anthropic API error: ${error}`);
    }
  }
}
