/**
 * Anthropic AI Provider Implementation
 *
 * Implements AIProvider interface using Anthropic SDK directly.
 * Supports streaming for long operations and debug logging.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  AIProvider,
  AIResponse,
  AIProviderConfig,
  AITool,
  ToolExecutor,
  ToolLoopConfig,
  AgenticResult
} from '../ai-provider.interface';
import { generateDebugId, debugLogInteraction, logMetrics } from './provider-debug-utils';

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

  async sendMessage(message: string, operation: string = 'generic'): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const startTime = Date.now();

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

      const durationMs = Date.now() - startTime;

      // Debug log the interaction if enabled
      if (this.debugMode) {
        const debugId = generateDebugId(operation);
        debugLogInteraction(debugId, message, response, operation, this.getProviderType(), this.model, this.debugMode);
        logMetrics(operation, this.getProviderType(), response.usage, durationMs, this.debugMode);
      }

      return response;

    } catch (error) {
      throw new Error(`Anthropic API error: ${error}`);
    }
  }

  async toolLoop(config: ToolLoopConfig): Promise<AgenticResult> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const startTime = Date.now();

    // Convert AITool[] to Anthropic Tool format
    const tools: Anthropic.Tool[] = config.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }));

    // Initialize conversation history with system + user message
    const conversationHistory: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: config.systemPrompt + '\n\n' + config.userMessage
      }
    ];

    let iterations = 0;
    const toolCallsExecuted: Array<{ tool: string; input: any; output: any }> = [];
    const totalTokens = { input: 0, output: 0 };
    const maxIterations = config.maxIterations || 20;

    try {
      while (iterations < maxIterations) {
        iterations++;

        // Call Anthropic API with tools
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          messages: conversationHistory,
          tools: tools
        });

        // Track token usage
        totalTokens.input += response.usage.input_tokens;
        totalTokens.output += response.usage.output_tokens;

        // Check if AI wants to use tools
        const toolUses = response.content.filter(
          (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use'
        );

        if (toolUses.length === 0) {
          // AI is done - extract final text message
          const textContent = response.content.find(
            (c): c is Anthropic.TextBlock => c.type === 'text'
          );

          const result: AgenticResult = {
            finalMessage: textContent?.text || '',
            iterations,
            toolCallsExecuted,
            totalTokens
          };

          // Log metrics for the entire tool loop
          const durationMs = Date.now() - startTime;
          if (this.debugMode) {
            logMetrics('tool-loop', this.getProviderType(), { input_tokens: totalTokens.input, output_tokens: totalTokens.output }, durationMs, this.debugMode);
          }

          return result;
        }

        // Execute all requested tools
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUses) {
          try {
            const result = await config.toolExecutor(toolUse.name, toolUse.input);

            toolCallsExecuted.push({
              tool: toolUse.name,
              input: toolUse.input,
              output: result
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            });
          } catch (error) {
            // Feed error back to AI as tool result
            const errorMessage = error instanceof Error ? error.message : String(error);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: errorMessage }),
              is_error: true
            });
          }
        }

        // Add AI response and tool results to conversation history
        conversationHistory.push(
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults }
        );

        // Invoke iteration callback if provided
        if (config.onIteration) {
          config.onIteration(iterations, toolCallsExecuted);
        }
      }

      throw new Error(`Tool loop exceeded max iterations (${maxIterations})`);

    } catch (error) {
      if (error instanceof Error && error.message.includes('exceeded max iterations')) {
        throw error;
      }
      throw new Error(`Anthropic tool loop error: ${error}`);
    }
  }

  async sendMessageWithTools(
    message: string,
    tools: AITool[],
    toolExecutor: ToolExecutor,
    operation: string = 'tool-call'
  ): Promise<AIResponse & { toolCalls?: any[] }> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    // Convert AITool[] to Anthropic Tool format
    const anthropicTools: Anthropic.Tool[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }));

    try {
      // Single API call with tools
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: message }],
        tools: anthropicTools
      });

      const toolCalls: any[] = [];
      let textContent = '';

      // Process response content
      for (const block of response.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          // Execute the tool
          try {
            const result = await toolExecutor(block.name, block.input);
            toolCalls.push({
              tool: block.name,
              input: block.input,
              output: result
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toolCalls.push({
              tool: block.name,
              input: block.input,
              error: errorMessage
            });
          }
        }
      }

      const aiResponse: AIResponse & { toolCalls?: any[] } = {
        content: textContent,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens
        },
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      };

      // Debug log if enabled
      if (this.debugMode) {
        const debugId = generateDebugId(operation);
        debugLogInteraction(debugId, message, aiResponse, operation, this.getProviderType(), this.model, this.debugMode);
      }

      return aiResponse;

    } catch (error) {
      throw new Error(`Anthropic tool call error: ${error}`);
    }
  }
}
