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
import {
  AIProvider,
  AIResponse,
  AIProviderConfig,
  ToolLoopConfig,
  AgenticResult
} from '../ai-provider.interface';
import { generateDebugId, debugLogInteraction, createAndLogAgenticResult, logEvaluationDataset, EvaluationMetrics } from './provider-debug-utils';
import { CURRENT_MODELS } from '../model-config';

type SupportedProvider = keyof typeof CURRENT_MODELS;

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

    if (!['openai', 'openai_pro', 'google', 'anthropic'].includes(this.providerType)) {
      throw new Error(`Unsupported provider: ${this.providerType}. Must be 'openai', 'openai_pro', 'google', or 'anthropic'`);
    }
  }

  private initializeModel(): void {
    try {
      switch (this.providerType) {
        case 'openai':
        case 'openai_pro': {
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
    return 'vercel';
  }

  getDefaultModel(): string {
    return CURRENT_MODELS[this.providerType];
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
    debugLogInteraction(debugId, prompt, response, operation, this.getProviderType(), this.model, this.debugMode);
    
    // Return the actual debug file names created
    return {
      promptFile: `${debugId}_prompt.md`,
      responseFile: `${debugId}_response.md`
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
          input_tokens: (result.totalUsage || result.usage).inputTokens || 0,
          output_tokens: (result.totalUsage || result.usage).outputTokens || 0
        }
      };

      const durationMs = Date.now() - startTime;

      // Debug log the interaction if enabled
      if (this.debugMode) {
        const debugId = generateDebugId(operation);
        debugLogInteraction(debugId, message, response, operation, this.getProviderType(), this.model, this.debugMode);
        
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
          ...(response.usage.cache_creation_input_tokens && { cacheCreationTokens: response.usage.cache_creation_input_tokens }),
          ...(response.usage.cache_read_input_tokens && { cacheReadTokens: response.usage.cache_read_input_tokens })
        };
        
        // Calculate cache hit rate if applicable
        if (response.usage.cache_read_input_tokens && response.usage.input_tokens > 0) {
          evaluationMetrics.cacheHitRate = Math.round((response.usage.cache_read_input_tokens / response.usage.input_tokens) * 100);
        }
        
        logEvaluationDataset(evaluationMetrics, this.debugMode);
      }

      return response;

    } catch (error) {
      throw new Error(`${this.providerType} API error: ${error}`);
    }
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
        }
      });

      // Add cache control ONLY to last tool for Anthropic (max 4 cache breakpoints)
      // This caches the system prompt + all tools together
      if (this.providerType === 'anthropic' && isLastTool) {
        (toolDef as any).providerOptions = {
          anthropic: {
            cacheControl: { type: 'ephemeral' }
          }
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

    if (this.providerType === 'anthropic') {
      // For Anthropic: Put system in messages array with cacheControl
      messages.push({
        role: 'system',
        content: config.systemPrompt,
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' }
          }
        }
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
      content: config.userMessage
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
      const generateConfig: any = {
        model: this.modelInstance,
        messages,
        tools,
        stopWhen: stepCountIs(maxIterations)
      };

      // Add system parameter for non-Anthropic providers
      if (systemParam) {
        generateConfig.system = systemParam;
      }

      const result = await generateText(generateConfig);


      // Extract tool call history from steps
      const toolCallsExecuted: Array<{ tool: string; input: any; output: any }> = [];

      for (const step of result.steps || []) {
        for (const toolCall of step.toolCalls || []) {
          const toolResult = step.toolResults?.find(
            (tr: any) => tr.toolCallId === toolCall.toolCallId
          );

          toolCallsExecuted.push({
            tool: (toolCall as any).toolName,
            input: (toolCall as any).args,
            output: (toolResult as any)?.result
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
        cacheReadTokens = (usage as any).cachedTokens || (usage as any).cached_tokens || 0;
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

      // Log debug for summary operations to capture complete prompts/responses for evaluation
      let debugFiles: { promptFile: string; responseFile: string } | null = null;
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
                const contentParts = msg.content.map(part => {
                  if (part.type === 'text') {
                    return (part as any).text;
                  } else if (part.type === 'tool-call') {
                    return `[TOOL_USE: ${(part as any).toolName}]`;
                  } else if (part.type === 'tool-result') {
                    const resultData = (part as any).output || (part as any).result || (part as any).content;
                    if (typeof resultData === 'string') {
                      return `[TOOL_RESULT: ${(part as any).toolName}]\n${resultData}`;
                    } else if (resultData) {
                      return `[TOOL_RESULT: ${(part as any).toolName}]\n${JSON.stringify(resultData, null, 2)}`;
                    }
                    return `[TOOL_RESULT: ${(part as any).toolName}]`;
                  }
                  return `[${part.type}]`;
                }).join(' ');
                return `${msg.role}: ${contentParts}`;
              }
              return `${msg.role}: [complex_content]`;
            })
            .join('\n\n');
        }
        
        const aiResponse: AIResponse = {
          content: finalText || '',
          usage: {
            input_tokens: usage.inputTokens || 0,
            output_tokens: usage.outputTokens || 0,
            cache_creation_input_tokens: cacheCreationTokens,
            cache_read_input_tokens: cacheReadTokens
          }
        };
        
        debugFiles = this.logDebugIfEnabled(`${operation}-summary`, finalPrompt, aiResponse);
      }

      return createAndLogAgenticResult({
        finalMessage: finalText || '',
        iterations: result.steps?.length || 1,
        toolCallsExecuted,
        totalTokens: {
          input: usage.inputTokens || 0,
          output: usage.outputTokens || 0,
          cacheCreation: cacheCreationTokens,
          cacheRead: cacheReadTokens
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
        interaction_id: config.interaction_id
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
          cacheRead: 0
        },
        status: 'failed',
        completionReason: 'error',
        modelVersion: this.model,
        operation: `${operation}-error`,
        sdk: this.getProviderType(),
        startTime,
        debugMode: this.debugMode,
        evaluationContext: config.evaluationContext,
        interaction_id: config.interaction_id
      });
    }
  }

}
