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

  /**
   * Helper method to log debug information if debug mode is enabled
   */
  private logDebugIfEnabled(
    operation: string,
    prompt: string,
    response: AIResponse,
    durationMs: number
  ): void {
    if (!this.debugMode) return;

    const debugId = generateDebugId(operation);
    debugLogInteraction(debugId, prompt, response, operation, this.getProviderType(), this.model, this.debugMode);
    logMetrics(operation, this.getProviderType(), response.usage, durationMs, this.debugMode);
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
      this.logDebugIfEnabled(operation, message, response, durationMs);

      return response;

    } catch (error) {
      throw new Error(`Anthropic API error: ${error}`);
    }
  }

  /**
   * Agentic tool loop implementation
   *
   * NOTE: This method is currently NOT USED in the codebase (as of PRD #136 completion).
   *
   * Analysis showed that SDK-based tool loops and JSON-based agentic loops are functionally
   * equivalent - both allow AI to decide which tools to call and when to stop. The JSON-based
   * approach we already use provides the same capabilities without the token overhead of
   * tool schemas in every request.
   *
   * This implementation is kept for potential future use cases where SDK-managed tool loops
   * might provide advantages (e.g., better provider-specific optimizations, simpler code for
   * highly exploratory workflows).
   *
   * ONLY IMPLEMENTED IN ANTHROPIC PROVIDER - VercelAIProvider does not implement this method
   * as it's not needed for current workflows. If you need toolLoop for other providers, you'll
   * need to implement it there as well.
   *
   * See PRD #136 for full architecture analysis and decision rationale.
   */
  async toolLoop(config: ToolLoopConfig): Promise<AgenticResult> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const startTime = Date.now();

    // Convert AITool[] to Anthropic Tool format with caching on last tool
    const tools: Anthropic.Tool[] = config.tools.map((t, index) => {
      const tool: Anthropic.Tool = {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema
      };

      // Add cache control to the last tool to cache the entire tools array
      if (index === config.tools.length - 1) {
        (tool as any).cache_control = { type: 'ephemeral' };
      }

      return tool;
    });

    // Separate system prompt with caching from user message
    const systemPrompt: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        text: config.systemPrompt,
        cache_control: { type: 'ephemeral' }
      }
    ];

    // Initialize conversation history with just the user message
    const conversationHistory: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: config.userMessage
      }
    ];

    let iterations = 0;
    const toolCallsExecuted: Array<{ tool: string; input: any; output: any }> = [];
    const totalTokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
    const maxIterations = config.maxIterations || 20;
    const operation = config.operation || 'tool-loop';

    try {
      while (iterations < maxIterations) {
        iterations++;
        const iterationStartTime = Date.now();

        // Call Anthropic API with tools and cached system prompt
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: conversationHistory,
          tools: tools
        });

        // Track token usage including cache metrics
        totalTokens.input += response.usage.input_tokens;
        totalTokens.output += response.usage.output_tokens;

        // Track cache usage (available when prompt caching is used)
        if ('cache_creation_input_tokens' in response.usage) {
          totalTokens.cacheCreation += (response.usage as any).cache_creation_input_tokens || 0;
        }
        if ('cache_read_input_tokens' in response.usage) {
          totalTokens.cacheRead += (response.usage as any).cache_read_input_tokens || 0;
        }

        // Debug log this iteration if enabled
        if (this.debugMode) {
          const currentPrompt = conversationHistory.map(m =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2)
          ).join('\n\n---\n\n');

          const aiResponse: AIResponse = {
            content: response.content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join('\n'),
            usage: {
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
              cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens,
              cache_read_input_tokens: (response.usage as any).cache_read_input_tokens
            }
          };

          const iterationDurationMs = Date.now() - iterationStartTime;
          this.logDebugIfEnabled(`${operation}-iter${iterations}`, currentPrompt, aiResponse, iterationDurationMs);
        }

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

          // Log summary metrics for the entire tool loop
          const durationMs = Date.now() - startTime;
          if (this.debugMode) {
            logMetrics(`${operation}-summary`, this.getProviderType(), {
              input_tokens: totalTokens.input,
              output_tokens: totalTokens.output,
              cache_creation_input_tokens: totalTokens.cacheCreation,
              cache_read_input_tokens: totalTokens.cacheRead
            }, durationMs, this.debugMode);
          }

          return result;
        }

        // Execute all requested tools in parallel
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        // Create promises for parallel execution
        const toolExecutionPromises = toolUses.map(async (toolUse) => {
          try {
            const result = await config.toolExecutor(toolUse.name, toolUse.input);
            return {
              success: true,
              toolUse,
              result
            };
          } catch (error) {
            return {
              success: false,
              toolUse,
              error: error instanceof Error ? error.message : String(error)
            };
          }
        });

        // Execute all tools simultaneously
        const executionResults = await Promise.all(toolExecutionPromises);

        // Process results and build tool_result blocks
        for (const executionResult of executionResults) {
          if (executionResult.success) {
            toolCallsExecuted.push({
              tool: executionResult.toolUse.name,
              input: executionResult.toolUse.input,
              output: executionResult.result
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: executionResult.toolUse.id,
              content: JSON.stringify(executionResult.result)
            });
          } else {
            // Feed error back to AI as tool result
            toolResults.push({
              type: 'tool_result',
              tool_use_id: executionResult.toolUse.id,
              content: JSON.stringify({ error: executionResult.error }),
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

}
