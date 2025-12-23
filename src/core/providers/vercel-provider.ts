/**
 * Vercel AI Provider Implementation
 *
 * Implements AIProvider interface using Vercel AI SDK.
 * Supports OpenAI and Google Gemini providers through unified interface.
 */

import { generateText, jsonSchema, tool, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createXai } from '@ai-sdk/xai';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  AIProvider,
  AIResponse,
  AIProviderConfig,
  ToolLoopConfig,
  AgenticResult,
} from '../ai-provider.interface';
import {
  generateDebugId,
  debugLogInteraction,
  debugLogPromptOnly,
  createAndLogAgenticResult,
  logEvaluationDataset,
  EvaluationMetrics,
} from './provider-debug-utils';
import { CURRENT_MODELS } from '../model-config';
import { withAITracing } from '../tracing/ai-tracing';

type SupportedProvider = keyof typeof CURRENT_MODELS;

// Get all supported provider keys dynamically from CURRENT_MODELS
const SUPPORTED_PROVIDERS = Object.keys(CURRENT_MODELS) as SupportedProvider[];

export class VercelProvider implements AIProvider {
  private providerType: SupportedProvider;
  private model: string;
  private apiKey: string;
  private debugMode: boolean;
  private baseURL?: string; // PRD #194: Custom endpoint URL for OpenAI-compatible APIs
  private modelInstance: any; // Vercel AI SDK model instance

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey;
    this.providerType = config.provider as SupportedProvider;
    this.model = config.model || this.getDefaultModel();
    this.debugMode = config.debugMode ?? process.env.DEBUG_DOT_AI === 'true';
    this.baseURL = config.baseURL; // PRD #194: Store custom endpoint URL

    this.validateConfiguration();
    this.initializeModel();
  }

  private validateConfiguration(): void {
    if (!this.apiKey) {
      throw new Error(`API key is required for ${this.providerType} provider`);
    }

    if (!SUPPORTED_PROVIDERS.includes(this.providerType)) {
      throw new Error(
        `Unsupported provider: ${this.providerType}. Must be one of: ${SUPPORTED_PROVIDERS.join(', ')}`
      );
    }
  }

  private initializeModel(): void {
    try {
      let provider: any;

      switch (this.providerType) {
        case 'openai':
          provider = createOpenAI({
            apiKey: this.apiKey,
          });
          break;
        case 'google':
        case 'google_flash': // PRD #294: Gemini 3 Flash variant
          provider = createGoogleGenerativeAI({ apiKey: this.apiKey });
          break;
        case 'anthropic':
        case 'anthropic_opus':
        case 'anthropic_haiku':
          provider = createAnthropic({
            apiKey: this.apiKey,
            // Enable 1M token context window for Claude Sonnet 4 (5x increase from 200K)
            // Required for models like claude-sonnet-4-5-20250929
            headers: {
              'anthropic-beta': 'context-1m-2025-08-07',
            },
          });
          break;
        case 'xai':
          provider = createXai({ apiKey: this.apiKey });
          break;
        case 'kimi':
        case 'kimi_thinking':
          // PRD #237: Moonshot AI Kimi K2 - uses OpenAI-compatible API
          // Use .chat() explicitly to use /chat/completions instead of /responses
          // Use global endpoint (api.moonshot.ai) - China endpoint (api.moonshot.cn) requires China-specific API keys
          provider = createOpenAI({
            apiKey: this.apiKey,
            baseURL: 'https://api.moonshot.ai/v1',
          });
          this.modelInstance = provider.chat(this.model);
          return; // Early return - model instance already set
        case 'amazon_bedrock':
          // PRD #175: Amazon Bedrock provider
          // AWS SDK automatically uses credential chain:
          // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
          // 2. ~/.aws/credentials file
          // 3. IAM roles (EC2 instance profiles, ECS roles, EKS service accounts)
          provider = createAmazonBedrock({
            region: process.env.AWS_REGION || 'us-east-1',
          });
          break;
        case 'openrouter':
          // PRD #194: OpenRouter custom endpoint support
          // Use dedicated OpenRouter provider for proper format conversion
          provider = createOpenRouter({
            apiKey: this.apiKey,
          });
          break;
        case 'custom':
          // PRD #194: Generic custom endpoint support for OpenAI-compatible APIs
          // For non-OpenRouter custom endpoints (Ollama, vLLM, LiteLLM, etc.)
          if (!this.baseURL) {
            throw new Error(
              'Custom endpoint requires CUSTOM_LLM_BASE_URL to be set'
            );
          }
          provider = createOpenAI({
            apiKey: this.apiKey,
            baseURL: this.baseURL,
          });
          // Use .chat() explicitly for custom endpoints to use /chat/completions instead of /responses
          this.modelInstance = provider.chat(this.model);
          return; // Early return - model instance already set
        default:
          throw new Error(
            `Cannot initialize model for provider: ${this.providerType}`
          );
      }

      this.modelInstance = provider(this.model);
    } catch (error) {
      throw new Error(
        `Failed to initialize ${this.providerType} model: ${error}`
      );
    }
  }

  getProviderType(): string {
    return this.providerType;
  }

  getDefaultModel(): string {
    return CURRENT_MODELS[this.providerType];
  }

  getModelName(): string {
    return this.model;
  }

  isInitialized(): boolean {
    return this.modelInstance !== undefined;
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
      this.model,
      this.debugMode
    );

    // Return the actual debug file names created
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
    if (!this.isInitialized()) {
      throw new Error(`${this.providerType} provider not initialized`);
    }

    return await withAITracing(
      {
        provider: this.providerType,
        model: this.model,
        operation: 'chat',
      },
      async () => {
        const startTime = Date.now();

        try {
          // Use Vercel AI SDK generateText
          // Note: maxOutputTokens not specified - provider will use model's natural maximum
          const result = await generateText({
            model: this.modelInstance,
            prompt: message,
          });

          const response: AIResponse = {
            content: result.text,
            usage: {
              input_tokens:
                (result.totalUsage || result.usage).inputTokens || 0,
              output_tokens:
                (result.totalUsage || result.usage).outputTokens || 0,
            },
          };

          const durationMs = Date.now() - startTime;

          // Debug log the interaction if enabled
          if (this.debugMode) {
            const debugId = generateDebugId(operation);
            debugLogInteraction(
              debugId,
              message,
              response,
              operation,
              this.getProviderType(),
              this.model,
              this.debugMode
            );

            // PRD #154: Always use new evaluation dataset system
            const evaluationMetrics: EvaluationMetrics = {
              // Core execution data
              operation,
              sdk: this.getProviderType(),
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              durationMs,

              // Required fields
              iterationCount: 1,
              toolCallCount: 0,
              status: 'completed',
              completionReason: 'stop',
              modelVersion: this.model,

              // Required evaluation context - NO DEFAULTS, must be provided
              test_scenario: operation,
              ai_response_summary: response.content,
              user_intent: evaluationContext?.user_intent || '',
              interaction_id: evaluationContext?.interaction_id || '',

              // Optional performance data
              ...(response.usage.cache_creation_input_tokens && {
                cacheCreationTokens: response.usage.cache_creation_input_tokens,
              }),
              ...(response.usage.cache_read_input_tokens && {
                cacheReadTokens: response.usage.cache_read_input_tokens,
              }),
            };

            // Calculate cache hit rate if applicable
            if (
              response.usage.cache_read_input_tokens &&
              response.usage.input_tokens > 0
            ) {
              evaluationMetrics.cacheHitRate = Math.round(
                (response.usage.cache_read_input_tokens /
                  response.usage.input_tokens) *
                  100
              );
            }

            logEvaluationDataset(evaluationMetrics, this.debugMode);
          }

          return response;
        } catch (error) {
          // Log the prompt that caused the error for debugging
          if (this.debugMode) {
            const debugId = generateDebugId(operation);
            debugLogPromptOnly(
              debugId,
              message,
              operation,
              this.getProviderType(),
              this.model,
              this.debugMode
            );
          }

          // Generate dataset for failed AI interaction
          if (this.debugMode && evaluationContext) {
            const failureMetrics: EvaluationMetrics = {
              operation,
              user_intent: evaluationContext.user_intent || '',
              ai_response_summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
              durationMs: Date.now() - startTime,
              inputTokens: 0,
              outputTokens: 0,
              iterationCount: 0,
              toolCallCount: 0,
              status: 'failed',
              completionReason: 'error',
              sdk: this.getProviderType(),
              modelVersion: this.model,
              test_scenario: operation,
              interaction_id:
                evaluationContext.interaction_id || generateDebugId(operation),
              failure_analysis: {
                failure_type: 'error',
                failure_reason: `${this.providerType} API error: ${error instanceof Error ? error.message : String(error)}`,
                time_to_failure: Date.now() - startTime,
              },
            };

            logEvaluationDataset(failureMetrics, this.debugMode);
          }

          throw new Error(`${this.providerType} API error: ${error}`);
        }
      },
      (response: AIResponse) => ({
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens,
        cacheCreationTokens: response.usage.cache_creation_input_tokens,
      })
    );
  }

  /**
   * Agentic tool loop using Vercel AI SDK
   *
   * Implements multi-turn tool calling using generateText with maxSteps.
   * The Vercel AI SDK handles the conversation loop automatically.
   *
   * Provider-specific caching:
   * - Anthropic: Manual cache control via providerOptions
   * - OpenAI: Automatic caching (no code changes needed)
   * - Google: Check Gemini caching capabilities
   *
   * See PRD #143 Milestone 2.5 for Vercel provider implementation details.
   */
  async toolLoop(config: ToolLoopConfig): Promise<AgenticResult> {
    if (!this.isInitialized()) {
      throw new Error(`${this.providerType} provider not initialized`);
    }

    return await withAITracing(
      {
        provider: this.providerType,
        model: this.model,
        operation: 'tool_loop',
      },
      async () => {
        const startTime = Date.now();
        const maxIterations = config.maxIterations || 20;
        const operation = config.operation || 'tool-loop';

        // Convert AITool[] to Vercel AI SDK tool format
        const tools: Record<string, any> = {};

        for (let i = 0; i < config.tools.length; i++) {
          const aiTool = config.tools[i];
          const isLastTool = i === config.tools.length - 1;

          const toolDef = tool({
            description: aiTool.description,
            inputSchema: jsonSchema(aiTool.inputSchema),
            execute: async (input: any) => {
              return await config.toolExecutor(aiTool.name, input);
            },
          });

          // Add cache control ONLY to last tool for Anthropic (max 4 cache breakpoints)
          // This caches the system prompt + all tools together
          if (
            (this.providerType === 'anthropic' ||
              this.providerType === 'anthropic_opus' ||
              this.providerType === 'anthropic_haiku') &&
            isLastTool
          ) {
            (toolDef as any).providerOptions = {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            };
          }
          // TODO: Check if Google Gemini supports caching in future SDK versions
          // Google Gemini may have caching capabilities - research providerOptions.google syntax
          // if (this.providerType === 'google' && isLastTool) {
          //   (toolDef as any).providerOptions = {
          //     google: { /* caching config if available */ }
          //   };
          // }

          tools[aiTool.name] = toolDef;
        }

        // Build messages array with system prompt caching for Anthropic
        // Anthropic caching requires system messages in messages array with providerOptions
        const messages: any[] = [];
        let systemParam: string | undefined;

        if (
          this.providerType === 'anthropic' ||
          this.providerType === 'anthropic_opus' ||
          this.providerType === 'anthropic_haiku'
        ) {
          // For Anthropic: Put system in messages array with cacheControl
          messages.push({
            role: 'system',
            content: config.systemPrompt,
            providerOptions: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          });
          // Don't use system parameter for Anthropic when caching
          systemParam = undefined;
        } else {
          // For OpenAI/Google: Use system parameter (string)
          systemParam = config.systemPrompt;
        }

        // Add user message
        messages.push({
          role: 'user',
          content: config.userMessage,
        });

        // TODO: Check if Google Gemini supports system prompt caching in future SDK versions
        // if (this.providerType === 'google') {
        //   messages.unshift({
        //     role: 'system',
        //     content: config.systemPrompt,
        //     providerOptions: {
        //       google: { /* caching config if available */ }
        //     }
        //   });
        //   systemParam = undefined;
        // }

        try {
          // Use Vercel AI SDK's generateText with stopWhen for automatic loop
          // Default is stepCountIs(1) - we need to increase for multi-step investigation
          // Note: maxOutputTokens not specified - provider will use model's natural maximum
          const generateConfig: any = {
            model: this.modelInstance,
            messages,
            tools,
            stopWhen: stepCountIs(maxIterations),
          };

          // Add system parameter for non-Anthropic providers
          if (systemParam) {
            generateConfig.system = systemParam;
          }

          const result = await generateText(generateConfig);

          // Log raw response immediately after generation (before any processing)
          let debugFiles: { promptFile: string; responseFile: string } | null =
            null;
          if (this.debugMode) {
            // Build the full conversation context like Anthropic provider does
            let finalPrompt = `System: ${config.systemPrompt}\n\n`;

            // Always include the original user intent first
            finalPrompt += `user: ${config.userMessage}\n\n`;

            // Then add the conversation history if available
            if (result.response?.messages) {
              finalPrompt += result.response.messages
                .map(msg => {
                  if (typeof msg.content === 'string') {
                    return `${msg.role}: ${msg.content}`;
                  } else if (Array.isArray(msg.content)) {
                    const contentParts = msg.content
                      .map(part => {
                        if (part.type === 'text') {
                          return (part as any).text;
                        } else if (part.type === 'tool-call') {
                          return `[TOOL_USE: ${(part as any).toolName}]`;
                        } else if (part.type === 'tool-result') {
                          const resultData =
                            (part as any).output ||
                            (part as any).result ||
                            (part as any).content;
                          if (typeof resultData === 'string') {
                            return `[TOOL_RESULT: ${(part as any).toolName}]\n${resultData}`;
                          } else if (resultData) {
                            return `[TOOL_RESULT: ${(part as any).toolName}]\n${JSON.stringify(resultData, null, 2)}`;
                          }
                          return `[TOOL_RESULT: ${(part as any).toolName}]`;
                        }
                        return `[${part.type}]`;
                      })
                      .join(' ');
                    return `${msg.role}: ${contentParts}`;
                  }
                  return `${msg.role}: [complex_content]`;
                })
                .join('\n\n');
            }

            // Create raw response content that includes ALL data from result
            let rawResponseContent = `# RAW RESPONSE DATA\n\n`;
            rawResponseContent += `**result.text**: ${result.text || '[EMPTY]'}\n\n`;

            if (result.steps && result.steps.length > 0) {
              rawResponseContent += `**Steps (${result.steps.length})**:\n`;
              result.steps.forEach((step, i) => {
                rawResponseContent += `\nStep ${i + 1}:\n`;
                rawResponseContent += `- text: ${step.text || '[EMPTY]'}\n`;
                if (step.toolCalls) {
                  rawResponseContent += `- toolCalls: ${step.toolCalls.length}\n`;
                }
                if (step.toolResults) {
                  rawResponseContent += `- toolResults: ${step.toolResults.length}\n`;
                }
              });
              rawResponseContent += '\n';
            }

            // Add the last step's text for easy access
            let lastStepText = '';
            if (result.steps && result.steps.length > 0) {
              for (let i = result.steps.length - 1; i >= 0; i--) {
                if (result.steps[i].text && result.steps[i].text.trim()) {
                  lastStepText = result.steps[i].text;
                  break;
                }
              }
            }
            rawResponseContent += `**Last step with text**: ${lastStepText || '[NONE]'}\n\n`;

            const usage = result.totalUsage || result.usage;
            const rawAiResponse = {
              content: rawResponseContent,
              usage: {
                input_tokens: usage.inputTokens || 0,
                output_tokens: usage.outputTokens || 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
            };

            debugFiles = this.logDebugIfEnabled(
              `${operation}-raw`,
              finalPrompt,
              rawAiResponse
            );
          }

          // Extract tool call history from steps
          const toolCallsExecuted: Array<{
            tool: string;
            input: any;
            output: any;
          }> = [];

          for (const step of result.steps || []) {
            for (const toolCall of step.toolCalls || []) {
              const toolResult = step.toolResults?.find(
                (tr: any) => tr.toolCallId === toolCall.toolCallId
              );

              toolCallsExecuted.push({
                tool: (toolCall as any).toolName,
                input: (toolCall as any).args,
                output: (toolResult as any)?.result,
              });
            }
          }

          // Normalize token metrics across providers
          // NOTE: Vercel AI SDK had token reporting bugs that were fixed in PR #8945 (merged Sept 26, 2025)
          // - GitHub Issue #8349: cache tokens only reflected last step, not summed across all steps
          // - GitHub Issue #8795: Token reporting issues with Anthropic provider (streaming)
          // Our version (5.0.60, released Oct 2, 2025) includes these fixes.
          // However, testing still shows ~70% fewer tokens reported vs Anthropic native SDK.
          // Root cause: We were using result.usage (final step only) instead of result.totalUsage (sum of all steps)!
          const usage = result.totalUsage || result.usage;
          let cacheReadTokens = 0;
          let cacheCreationTokens = 0;

          // Anthropic via Vercel uses cachedInputTokens (confirmed in AI SDK 5+)
          if ((usage as any).cachedInputTokens) {
            cacheReadTokens = (usage as any).cachedInputTokens;
          }
          // OpenAI uses cached_tokens or cachedTokens (automatic caching, no config needed)
          if ('cachedTokens' in usage || (usage as any).cached_tokens) {
            cacheReadTokens =
              (usage as any).cachedTokens || (usage as any).cached_tokens || 0;
          }
          // Anthropic native SDK uses separate cache_creation and cache_read fields
          if ((usage as any).cache_creation_input_tokens) {
            cacheCreationTokens = (usage as any).cache_creation_input_tokens;
          }
          if ((usage as any).cache_read_input_tokens) {
            cacheReadTokens = (usage as any).cache_read_input_tokens;
          }

          // TODO: Check if Google Gemini reports cache metrics in future SDK versions
          // Google Gemini may return cache-related metrics - check usage object structure
          // Possible fields: cachedTokens, cacheHits, or provider-specific naming
          // Add normalization logic here when Gemini caching is confirmed

          // Extract final text from the last step (result.text might be empty if last step had tool calls)
          let finalText = result.text;
          if (!finalText || finalText.trim().length === 0) {
            // If result.text is empty, find the last text response from steps
            for (let i = (result.steps || []).length - 1; i >= 0; i--) {
              const step = result.steps![i];
              if (step.text && step.text.trim().length > 0) {
                finalText = step.text;
                break;
              }
            }
          }

          // Log processed summary response (keep existing functionality)
          if (this.debugMode && debugFiles === null) {
            // Only log summary if we haven't already logged raw response
            let finalPrompt = `System: ${config.systemPrompt}\n\nuser: ${config.userMessage}`;

            const aiResponse: AIResponse = {
              content: finalText || '',
              usage: {
                input_tokens: usage.inputTokens || 0,
                output_tokens: usage.outputTokens || 0,
                cache_creation_input_tokens: cacheCreationTokens,
                cache_read_input_tokens: cacheReadTokens,
              },
            };

            debugFiles = this.logDebugIfEnabled(
              `${operation}-summary`,
              finalPrompt,
              aiResponse
            );
          }

          return createAndLogAgenticResult({
            finalMessage: finalText || '',
            iterations: result.steps?.length || 1,
            toolCallsExecuted,
            totalTokens: {
              input: usage.inputTokens || 0,
              output: usage.outputTokens || 0,
              cacheCreation: cacheCreationTokens,
              cacheRead: cacheReadTokens,
            },
            status: 'success',
            completionReason: 'investigation_complete',
            modelVersion: this.model,
            operation: `${operation}-summary`,
            sdk: this.getProviderType(),
            startTime,
            debugMode: this.debugMode,
            debugFiles,
            evaluationContext: config.evaluationContext,
            interaction_id: config.interaction_id,
          });
        } catch (error) {
          // Return error result with extended metrics
          return createAndLogAgenticResult({
            finalMessage: `Error during investigation: ${error instanceof Error ? error.message : String(error)}`,
            iterations: 0,
            toolCallsExecuted: [],
            totalTokens: {
              input: 0,
              output: 0,
              cacheCreation: 0,
              cacheRead: 0,
            },
            status: 'failed',
            completionReason: 'error',
            modelVersion: this.model,
            operation: `${operation}-error`,
            sdk: this.getProviderType(),
            startTime,
            debugMode: this.debugMode,
            evaluationContext: config.evaluationContext,
            interaction_id: config.interaction_id,
          });
        }
      },
      (result: AgenticResult) => ({
        inputTokens: result.totalTokens.input,
        outputTokens: result.totalTokens.output,
        cacheReadTokens: result.totalTokens.cacheRead,
        cacheCreationTokens: result.totalTokens.cacheCreation,
      })
    );
  }
}
