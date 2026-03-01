import {
  AIProvider,
  AIResponse,
  AgenticResult,
  ToolLoopConfig,
} from '../ai-provider.interface';
import * as path from 'path';
import { loadPromptFile } from '../../tools/prompts';
import { CURRENT_MODELS } from '../model-config';
import {
  generateDebugId,
  debugLogInteraction,
  debugLogPromptOnly,
  logEvaluationDataset,
  EvaluationMetrics,
} from './provider-debug-utils';
import { withAITracing } from '../tracing/ai-tracing';
import {
  formatToolDefinitions,
  formatToolOutput,
  extractToolCalls,
} from './tool-utils';
import { INVESTIGATION_MESSAGES } from '../constants/investigation';

export interface SamplingMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string } | string;
}

export interface SamplingResult {
  content: { type: 'text'; text: string } | string;
}

export type SamplingHandler = (
  messages: SamplingMessage[],
  systemPrompt?: string,
  options?: Record<string, unknown>
) => Promise<SamplingResult>;

export class HostProvider implements AIProvider {
  private static samplingHandler?: SamplingHandler;
  private debugMode: boolean;

  constructor() {
    this.debugMode = process.env.DEBUG_DOT_AI === 'true';
  }

  setSamplingHandler(handler: SamplingHandler) {
    HostProvider.samplingHandler = handler;
  }

  isInitialized(): boolean {
    return !!HostProvider.samplingHandler;
  }

  getDefaultModel(): string {
    return CURRENT_MODELS.host;
  }

  getProviderType(): string {
    return CURRENT_MODELS.host;
  }

  getModelName(): string {
    return CURRENT_MODELS.host;
  }

  private logDebugIfEnabled(
    operation: string,
    prompt: string,
    response: AIResponse
  ): { promptFile: string; responseFile: string } | null {
    if (!this.debugMode) return null;

    const debugId = generateDebugId(operation);
    debugLogInteraction(
      debugId,
      prompt,
      response,
      operation,
      this.getProviderType(),
      this.getModelName(),
      this.debugMode
    );

    return {
      promptFile: `${debugId}_prompt.md`,
      responseFile: `${debugId}_response.md`,
    };
  }

  async sendMessage(
    message: string,
    operation: string = 'generic',
    evaluationContext?: {
      user_intent?: string;
      interaction_id?: string;
    }
  ): Promise<AIResponse> {
    if (!HostProvider.samplingHandler) {
      throw new Error('Host provider is not connected to MCP server');
    }

    return await withAITracing(
      {
        provider: this.getProviderType(),
        model: this.getModelName(),
        operation: 'chat',
      },
      async () => {
        const startTime = Date.now();
        const messages: SamplingMessage[] = [
          { role: 'user', content: { type: 'text', text: message } },
        ];

        try {
          const result = await HostProvider.samplingHandler!(
            messages,
            undefined,
            {
              operation,
              evaluationContext,
            }
          );

          let content = '';
          if (
            typeof result.content === 'object' &&
            result.content.type === 'text'
          ) {
            content = result.content.text;
          } else if (typeof result.content === 'string') {
            content = result.content;
          } else {
            content = JSON.stringify(result.content);
          }

          const response: AIResponse = {
            content,
            usage: {
              input_tokens: 0,
              output_tokens: 0,
            },
          };

          const durationMs = Date.now() - startTime;

          // Debug log the interaction if enabled
          if (this.debugMode) {
            this.logDebugIfEnabled(operation, message, response);

            const evaluationMetrics: EvaluationMetrics = {
              operation,
              sdk: this.getProviderType(),
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              durationMs,
              iterationCount: 1,
              toolCallCount: 0,
              status: 'completed',
              completionReason: 'stop',
              modelVersion: this.getModelName(),
              test_scenario: operation,
              ai_response_summary: response.content,
              user_intent: evaluationContext?.user_intent || '',
              interaction_id: evaluationContext?.interaction_id || '',
            };

            logEvaluationDataset(evaluationMetrics, this.debugMode);
          }

          return response;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          if (this.debugMode) {
            const debugId = generateDebugId(operation);
            debugLogPromptOnly(
              debugId,
              message,
              operation,
              this.getProviderType(),
              this.getModelName(),
              this.debugMode
            );

            if (evaluationContext) {
              const failureMetrics: EvaluationMetrics = {
                operation,
                user_intent: evaluationContext.user_intent || '',
                ai_response_summary: `Error: ${errorMessage}`,
                durationMs: Date.now() - startTime,
                inputTokens: 0,
                outputTokens: 0,
                iterationCount: 0,
                toolCallCount: 0,
                status: 'failed',
                completionReason: 'error',
                sdk: this.getProviderType(),
                modelVersion: this.getModelName(),
                test_scenario: operation,
                interaction_id:
                  evaluationContext.interaction_id ||
                  generateDebugId(operation),
                failure_analysis: {
                  failure_type: 'error',
                  failure_reason: `Host API error: ${errorMessage}`,
                  time_to_failure: Date.now() - startTime,
                },
              };
              logEvaluationDataset(failureMetrics, this.debugMode);
            }
          }

          throw new Error(`Host sampling error: ${errorMessage}`, {
            cause: error,
          });
        }
      },
      (response: AIResponse) => ({
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      })
    );
  }

  /**
   * Execute a tool loop with the host model
   *
   * The tool loop relies on a specific JSON format embedded in markdown code blocks:
   * ```json
   * {
   *   "tool": "toolName",
   *   "arguments": { ... }
   * }
   * ```
   */
  async toolLoop(config: ToolLoopConfig): Promise<AgenticResult> {
    if (!HostProvider.samplingHandler) {
      throw new Error('Host provider is not connected to MCP server');
    }

    return await withAITracing(
      {
        provider: this.getProviderType(),
        model: this.getModelName(),
        operation: 'tool_loop',
      },
      async () => {
        const maxIterations = config.maxIterations || 20;
        const messages: SamplingMessage[] = [
          { role: 'user', content: { type: 'text', text: config.userMessage } },
        ];

        // Construct system prompt with tool definitions
        const promptPath = path.join(
          __dirname,
          '..',
          '..',
          '..',
          'prompts',
          'host-tools.md'
        );
        const promptTemplate = loadPromptFile(promptPath).content;

        const toolDefinitions = formatToolDefinitions(config.tools);

        const systemPrompt =
          config.systemPrompt +
          '\n\n' +
          promptTemplate.replace('{{TOOL_DEFINITIONS}}', toolDefinitions);

        const toolCallsExecuted: Array<{
          tool: string;
          input: unknown;
          output: unknown;
        }> = [];
        let iterations = 0;

        while (iterations < maxIterations) {
          iterations++;

          try {
            const result = await HostProvider.samplingHandler!(
              messages,
              systemPrompt,
              {
                operation: config.operation,
                evaluationContext: config.evaluationContext,
                interaction_id: config.interaction_id,
              }
            );

            let content = '';
            if (
              typeof result.content === 'object' &&
              result.content.type === 'text'
            ) {
              content = result.content.text;
            } else if (typeof result.content === 'string') {
              content = result.content;
            } else {
              content = JSON.stringify(result.content);
            }

            // Add assistant response to history
            messages.push({
              role: 'assistant',
              content: { type: 'text', text: content },
            });

            // Check for tool calls
            const toolCalls = extractToolCalls(content);

            if (toolCalls.length > 0) {
              for (const toolCall of toolCalls) {
                try {
                  const toolName = toolCall.tool;
                  const toolArgs = toolCall.arguments || {};

                  // Validate tool exists
                  const toolExists = config.tools.some(
                    t => t.name === toolName
                  );
                  if (!toolExists) {
                    messages.push({
                      role: 'user',
                      content: {
                        type: 'text',
                        text: `Unknown tool '${toolName}'. Available tools: ${config.tools.map(t => t.name).join(', ')}`,
                      },
                    });
                    continue;
                  }

                  // Execute tool
                  const toolOutput = await config.toolExecutor(
                    toolName,
                    toolArgs
                  );

                  toolCallsExecuted.push({
                    tool: toolName,
                    input: toolArgs,
                    output: toolOutput,
                  });

                  // Add tool result to history
                  messages.push({
                    role: 'user',
                    content: {
                      type: 'text',
                      text: formatToolOutput(toolName, toolOutput),
                    },
                  });
                } catch (executionError) {
                  messages.push({
                    role: 'user',
                    content: {
                      type: 'text',
                      text: `Error executing tool '${toolCall.tool}': ${executionError instanceof Error ? executionError.message : String(executionError)}`,
                    },
                  });
                }
              }

              if (config.onIteration) {
                try {
                  config.onIteration(iterations, toolCallsExecuted);
                } catch {
                  // Ignore errors in callback
                }
              }
            } else {
              // No tool call, assume final response
              return {
                finalMessage: content,
                iterations,
                toolCallsExecuted,
                totalTokens: { input: 0, output: 0 },
              };
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new Error(`Host sampling error in tool loop: ${message}`, {
              cause: error,
            });
          }
        }

        // Max iterations reached - make one final wrap-up call WITHOUT tools
        // to force the AI to summarize findings rather than continue investigating
        const wrapUpMessage = INVESTIGATION_MESSAGES.WRAP_UP;

        messages.push({
          role: 'user',
          content: { type: 'text', text: wrapUpMessage },
        });

        try {
          // Make final call WITHOUT tools in system prompt - use base system prompt only
          const wrapUpResult = await HostProvider.samplingHandler!(
            messages,
            config.systemPrompt, // Original system prompt without tool definitions
            {
              operation: config.operation,
              evaluationContext: config.evaluationContext,
              interaction_id: config.interaction_id,
            }
          );

          let wrapUpContent = '';
          if (
            typeof wrapUpResult.content === 'object' &&
            wrapUpResult.content.type === 'text'
          ) {
            wrapUpContent = wrapUpResult.content.text;
          } else if (typeof wrapUpResult.content === 'string') {
            wrapUpContent = wrapUpResult.content;
          } else {
            wrapUpContent = JSON.stringify(wrapUpResult.content);
          }

          return {
            finalMessage: wrapUpContent,
            iterations: iterations + 1, // Include wrap-up iteration
            toolCallsExecuted,
            totalTokens: { input: 0, output: 0 },
            status: 'timeout',
            completionReason: 'max_iterations',
          };
        } catch {
          // If wrap-up call fails, fall back to last message
          const lastMessage = messages[messages.length - 2]; // -2 because we added wrap-up message
          const lastContent =
            typeof lastMessage.content === 'string'
              ? lastMessage.content
              : (lastMessage.content?.text ?? '');

          return {
            finalMessage: lastContent,
            iterations,
            toolCallsExecuted,
            totalTokens: { input: 0, output: 0 },
            status: 'timeout',
            completionReason: 'max_iterations',
          };
        }
      },
      (result: AgenticResult) => ({
        inputTokens: result.totalTokens.input,
        outputTokens: result.totalTokens.output,
      })
    );
  }
}
