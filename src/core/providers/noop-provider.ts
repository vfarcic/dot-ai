/**
 * No-Op AI Provider
 *
 * Placeholder provider used when no AI API keys are configured.
 * Allows the MCP server to start successfully even without AI capabilities,
 * enabling tools that don't require AI (e.g., prompts, project-setup) to function.
 */

import {
  AIProvider,
  AIResponse,
  AgenticResult,
  ToolLoopConfig
} from '../ai-provider.interface';

export class NoOpAIProvider implements AIProvider {
  private static readonly ERROR_MESSAGE =
    'AI provider is not available. No API keys configured. ' +
    'Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or another supported provider key.';

  /**
   * Creates a NoOp provider that doesn't require API keys
   */
  constructor() {
    // No initialization needed
  }

  /**
   * Always returns false since no actual AI provider is configured
   */
  isInitialized(): boolean {
    return false;
  }

  /**
   * Returns a placeholder model name
   */
  getDefaultModel(): string {
    return 'none';
  }

  /**
   * Returns the provider type
   */
  getProviderType(): string {
    return 'noop';
  }

  /**
   * Returns the model name
   */
  getModelName(): string {
    return 'none';
  }

  /**
   * Throws error explaining AI is not available
   */
  async sendMessage(
    _message: string,
    _operation?: string,
    _evaluationContext?: {
      user_intent?: string;
      interaction_id?: string;
    }
  ): Promise<AIResponse> {
    throw new Error(NoOpAIProvider.ERROR_MESSAGE);
  }

  /**
   * Throws error explaining AI is not available
   */
  async toolLoop(_config: ToolLoopConfig): Promise<AgenticResult> {
    throw new Error(NoOpAIProvider.ERROR_MESSAGE);
  }
}
