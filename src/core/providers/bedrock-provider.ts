/**
 * Bedrock AI Provider Implementation
 *
 * Implements AIProvider interface using AWS Bedrock SDK.
 * Supports multiple model families through a unified interface.
 * Can authenticate using either Bedrock API keys or AWS credentials.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";
import {
  AIProvider,
  AIResponse,
  AIProviderConfig,
  ToolLoopConfig,
  AgenticResult
} from '../ai-provider.interface';
import { generateDebugId, debugLogInteraction, createAndLogAgenticResult } from './provider-debug-utils';
import { getCurrentModel } from '../model-config';

/**
 * Supported model providers on Bedrock and their prompt formats
 */
type BedrockModelProvider = 'anthropic' | 'amazon' | 'meta' | 'cohere' | 'ai21' | 'mistral';

/**
 * Bedrock Provider Implementation for AWS Bedrock
 */
export class BedrockProvider implements AIProvider {
  private client: BedrockRuntimeClient;
  private model: string;
  private debugMode: boolean;
  private apiKey?: string;
  private region: string;

  constructor(config: AIProviderConfig) {
    this.model = config.model || this.getDefaultModel();
    this.debugMode = config.debugMode ?? (process.env.DEBUG_DOT_AI === 'true');
    this.region = process.env.AWS_REGION || 'us-east-1';

    // Initialize client with appropriate authentication
    const clientOptions: any = {
      region: this.region
    };

    // Check if API key authentication is available
    if (process.env.BEDROCK_API_KEY) {
      this.apiKey = process.env.BEDROCK_API_KEY;
      clientOptions.apiKey = this.apiKey;
    } else {
      // Validate AWS credentials are available
      this.validateAwsCredentials();
    }

    this.client = new BedrockRuntimeClient(clientOptions);
  }

  private validateAwsCredentials(): void {
    const hasCredentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
    const hasRegion = process.env.AWS_REGION;

    if (!hasCredentials && !process.env.BEDROCK_API_KEY) {
      throw new Error('Either BEDROCK_API_KEY or AWS credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) must be set');
    }

    if (!hasRegion) {
      throw new Error('AWS_REGION must be set for Bedrock provider');
    }
  }

  getProviderType(): string {
    return 'bedrock';
  }

  getDefaultModel(): string {
    return getCurrentModel('bedrock');
  }

  getModelName(): string {
    return this.model;
  }

  getSDKProvider(): string {
    // Extract provider from model ID (e.g., "anthropic" from "anthropic.claude-3-sonnet")
    return this.model.split('.')[0];
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

  async sendMessage(
    message: string,
    operation: string = 'generic',
    _evaluationContext?: {
      user_intent?: string;
      interaction_id?: string;
    }
  ): Promise<AIResponse> {
    if (!this.isInitialized()) {
      throw new Error('Bedrock client not initialized');
    }

    try {
      // Determine model-specific request format
      const modelProvider = this.getModelProvider();
      const requestBody = this.formatRequestForModel(modelProvider, message);

      // Send request to Bedrock
      const command = new InvokeModelCommand({
        modelId: this.model,
        body: JSON.stringify(requestBody)
      });

      // Execute the command
      const response = await this.client.send(command);

      // Parse the response based on the model provider
      const parsedResponse = this.parseResponseFromModel(modelProvider, response);

      // Log debug information if enabled
      this.logDebugIfEnabled(operation, message, parsedResponse);

      // Return the response
      return parsedResponse;
    } catch (error) {
      throw new Error(`Bedrock API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract model provider from model ID
   * @returns Provider name (e.g., "anthropic" from "anthropic.claude-3-sonnet")
   */
  private getModelProvider(): BedrockModelProvider {
    const providerName = this.model.split('.')[0] as BedrockModelProvider;

    // Validate provider is supported
    const supportedProviders: BedrockModelProvider[] = [
      'anthropic', 'amazon', 'meta', 'cohere', 'ai21', 'mistral'
    ];

    if (!supportedProviders.includes(providerName)) {
      throw new Error(`Unsupported Bedrock model provider: ${providerName}`);
    }

    return providerName;
  }

  /**
   * Format request based on model provider's requirements
   */
  private formatRequestForModel(provider: BedrockModelProvider, message: string): any {
    switch (provider) {
      case 'anthropic':
        return {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 4096,
          messages: [{ role: "user", content: message }]
        };

      case 'amazon':
        return {
          inputText: message,
          textGenerationConfig: {
            maxTokenCount: 4096,
            temperature: 0.7
          }
        };

      case 'meta':
        return {
          prompt: message,
          max_gen_len: 4096
        };

      case 'cohere':
        return {
          prompt: message,
          max_tokens: 4096
        };

      case 'ai21':
        return {
          prompt: message,
          maxTokens: 4096
        };

      case 'mistral':
        return {
          prompt: message,
          max_tokens: 4096
        };

      default:
        throw new Error(`Unsupported model provider: ${provider}`);
    }
  }

  /**
   * Parse response based on model provider's format
   */
  private parseResponseFromModel(provider: BedrockModelProvider, response: any): AIResponse {
    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;

    switch (provider) {
      case 'anthropic':
        content = responseBody.content?.[0]?.text || '';
        inputTokens = responseBody.usage?.input_tokens || 0;
        outputTokens = responseBody.usage?.output_tokens || 0;
        break;

      case 'amazon':
        content = responseBody.results?.[0]?.outputText || responseBody.outputText || '';
        inputTokens = responseBody.usage?.inputTokenCount || 0;
        outputTokens = responseBody.usage?.outputTokenCount || 0;
        break;

      case 'meta':
        content = responseBody.generation || '';
        inputTokens = responseBody.usage?.input_tokens || 0;
        outputTokens = responseBody.usage?.output_tokens || 0;
        break;

      case 'cohere':
        content = responseBody.generations?.[0]?.text || '';
        inputTokens = responseBody.meta?.billed_units?.input_tokens || 0;
        outputTokens = responseBody.meta?.billed_units?.output_tokens || 0;
        break;

      case 'ai21':
        content = responseBody.completions?.[0]?.data?.text || '';
        // AI21 doesn't provide token counts in the same way
        inputTokens = 0;
        outputTokens = 0;
        break;

      case 'mistral':
        content = responseBody.outputs?.[0]?.text || '';
        inputTokens = responseBody.usage?.input_tokens || 0;
        outputTokens = responseBody.usage?.output_tokens || 0;
        break;

      default:
        throw new Error(`Unsupported model provider: ${provider}`);
    }

    return {
      content,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens
      }
    };
  }

  /**
   * Agentic tool loop implementation for Bedrock
   *
   * Implements a multi-turn tool calling conversation with the model.
   * Currently only supports Anthropic models on Bedrock as they have
   * the most robust tool calling capabilities.
   */
  async toolLoop(config: ToolLoopConfig): Promise<AgenticResult> {
    if (!this.isInitialized()) {
      throw new Error('Bedrock client not initialized');
    }

    const startTime = Date.now();
    const modelProvider = this.getModelProvider();

    // Currently only anthropic models support tool calling on Bedrock
    if (modelProvider !== 'anthropic') {
      throw new Error(`Tool calling not supported for ${modelProvider} models on Bedrock`);
    }

    const maxIterations = config.maxIterations || 20;
    const operation = config.operation || 'tool-loop';

    let iterations = 0;
    const toolCallsExecuted: Array<{ tool: string; input: any; output: any }> = [];
    const totalTokens = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };

    // Initialize conversation with system prompt and user message
    let messages = [
      { role: "user", content: config.userMessage }
    ];

    // Convert AITool[] to Anthropic Tool format
    const tools = config.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }));

    try {
      while (iterations < maxIterations) {
        iterations++;

        // Build request body for Anthropic model
        const requestBody = {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 4096,
          system: config.systemPrompt,
          messages,
          tools
        };

        // Send request to Bedrock
        const command = new InvokeModelCommand({
          modelId: this.model,
          body: JSON.stringify(requestBody)
        });

        // Execute the command
        const response = await this.client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));

        // Track token usage
        if (responseBody.usage) {
          totalTokens.input += responseBody.usage.input_tokens || 0;
          totalTokens.output += responseBody.usage.output_tokens || 0;
        }

        // Check if AI wants to use tools
        const content = responseBody.content || [];
        const toolUses = content.filter((c: any) => c.type === 'tool_use');

        // Add AI response to conversation
        messages.push({ role: "assistant", content: responseBody.content });

        // If no tool calls, we're done
        if (toolUses.length === 0) {
          const textContent = content.find((c: any) => c.type === 'text');

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
            evaluationContext: config.evaluationContext,
            interaction_id: config.interaction_id
          });
        }

        // Execute all requested tools in parallel
        const toolResults = [];

        for (const toolUse of toolUses) {
          try {
            // Execute the tool
            const result = await config.toolExecutor(toolUse.name, toolUse.input);

            // Track tool call
            toolCallsExecuted.push({
              tool: toolUse.name,
              input: toolUse.input,
              output: result
            });

            // Add tool result
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            });
          } catch (error) {
            // Add error result
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
            });
          }
        }

        // Add tool results to conversation
        messages.push({
          role: "user",
          content: JSON.stringify(toolResults)
        });

        // Invoke iteration callback if provided
        if (config.onIteration) {
          config.onIteration(iterations, toolCallsExecuted);
        }
      }

      // Reached max iterations
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
        debugMode: this.debugMode,
        evaluationContext: config.evaluationContext,
        interaction_id: config.interaction_id
      });

    } catch (error) {
      // Return error result
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
        debugMode: this.debugMode,
        evaluationContext: config.evaluationContext,
        interaction_id: config.interaction_id
      });
    }
  }
}