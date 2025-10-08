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
import { generateDebugId, debugLogInteraction, createAndLogAgenticResult } from './provider-debug-utils';
import { getCurrentModel } from '../model-config';

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
    return getCurrentModel('anthropic');
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
    response: AIResponse
  ): { promptFile: string; responseFile: string } | null {
    if (!this.debugMode) return null;

    const debugId = generateDebugId(operation);
    debugLogInteraction(debugId, prompt, response, operation, this.getProviderType(), this.model, this.debugMode);
    
    // Return the actual debug file names created
    return {
      promptFile: `${debugId}_prompt.md`,
      responseFile: `${debugId}_response.md`
    };
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
      this.logDebugIfEnabled(operation, message, response);

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

        // Build current prompt for debug logging
        const currentPrompt = `System: ${config.systemPrompt}\n\n${conversationHistory.map(msg => {
          let content = '';
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else if (Array.isArray(msg.content)) {
            // Extract text from content blocks
            content = msg.content.map(block => {
              if (block.type === 'text') {
                return (block as any).text;
              } else if (block.type === 'tool_use') {
                return `[TOOL_USE: ${(block as any).name}]`;
              } else if (block.type === 'tool_result') {
                const content = (block as any).content;
                if (typeof content === 'string') {
                  return `[TOOL_RESULT: ${(block as any).tool_use_id}]\n${content}`;
                } else if (Array.isArray(content)) {
                  const textContent = content.map(c => c.type === 'text' ? c.text : `[${c.type}]`).join(' ');
                  return `[TOOL_RESULT: ${(block as any).tool_use_id}]\n${textContent}`;
                }
                return `[TOOL_RESULT: ${(block as any).tool_use_id}]`;
              }
              return `[${block.type}]`;
            }).join(' ');
          } else {
            content = '[complex_content]';
          }
          return `${msg.role}: ${content}`;
        }).join('\n\n')}`;

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

        // Check if AI wants to use tools
        const toolUses = response.content.filter(
          (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use'
        );

        // Log debug for final iteration to capture complete prompts/responses for evaluation
        let debugFiles: { promptFile: string; responseFile: string } | null = null;
        if (toolUses.length === 0) {
          const aiResponse: AIResponse = {
            content: response.content
              .filter((c): c is Anthropic.TextBlock => c.type === 'text')
              .map(c => c.text)
              .join('\n\n'),
            usage: {
              input_tokens: response.usage.input_tokens,
              output_tokens: response.usage.output_tokens,
              cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens,
              cache_read_input_tokens: (response.usage as any).cache_read_input_tokens
            }
          };
          
          debugFiles = this.logDebugIfEnabled(`${config.operation}-summary`, currentPrompt, aiResponse);
        }

        if (toolUses.length === 0) {
          // AI is done - extract final text message
          const textContent = response.content.find(
            (c): c is Anthropic.TextBlock => c.type === 'text'
          );

          return createAndLogAgenticResult({
            finalMessage: textContent?.text || '',
            iterations,
            toolCallsExecuted,
            totalTokens: {
              input: totalTokens.input,
              output: totalTokens.output,
              cacheCreation: totalTokens.cacheCreation,
              cacheRead: totalTokens.cacheRead
            },
            status: 'success',
            completionReason: 'investigation_complete',
            modelVersion: this.model,
            operation: `${operation}-summary`,
            sdk: this.getProviderType(),
            startTime,
            debugMode: this.debugMode,
            debugFiles
          });
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

      // Reached max iterations without completion
      return createAndLogAgenticResult({
        finalMessage: `Investigation incomplete - reached maximum ${maxIterations} iterations`,
        iterations,
        toolCallsExecuted,
        totalTokens: {
          input: totalTokens.input,
          output: totalTokens.output,
          cacheCreation: totalTokens.cacheCreation,
          cacheRead: totalTokens.cacheRead
        },
        status: 'failed',
        completionReason: 'max_iterations',
        modelVersion: this.model,
        operation: `${operation}-max-iterations`,
        sdk: this.getProviderType(),
        startTime,
        debugMode: this.debugMode
      });

    } catch (error) {
      // Return error result with extended metrics
      return createAndLogAgenticResult({
        finalMessage: `Error during investigation: ${error instanceof Error ? error.message : String(error)}`,
        iterations,
        toolCallsExecuted,
        totalTokens: {
          input: totalTokens.input,
          output: totalTokens.output,
          cacheCreation: totalTokens.cacheCreation,
          cacheRead: totalTokens.cacheRead
        },
        status: 'failed',
        completionReason: 'error',
        modelVersion: this.model,
        operation: `${operation}-error`,
        sdk: this.getProviderType(),
        startTime,
        debugMode: this.debugMode
      });
    }
  }

}
