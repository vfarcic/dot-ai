/**
 * AI Provider Interface
 *
 * Provider-agnostic abstraction for AI services supporting multiple providers
 * through Vercel AI SDK (19+ providers supported).
 *
 * This interface is extracted from actual ClaudeIntegration usage patterns
 * across the codebase, ensuring backward compatibility and minimal migration effort.
 *
 * Phase 1 Implementation (PRD 73): Anthropic, OpenAI, Google
 * Future: AWS Bedrock, Mistral, Groq, Ollama, etc.
 */

/**
 * Standard AI response structure
 */
export interface AIResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * Impact level for clarification opportunities
 */
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Clarification category types
 */
export type ClarificationCategory =
  | 'TECHNICAL_SPECIFICATIONS'
  | 'ARCHITECTURAL_CONTEXT'
  | 'OPERATIONAL_REQUIREMENTS'
  | 'SECURITY_COMPLIANCE'
  | 'ORGANIZATIONAL_ALIGNMENT';

/**
 * Clarification opportunity structure
 */
export interface ClarificationOpportunity {
  category: ClarificationCategory;
  missingContext: string;
  impactLevel: ImpactLevel;
  reasoning: string;
  suggestedQuestions?: string[];
  patternAlignment?: string;
}

/**
 * Intent analysis result structure
 */
export interface IntentAnalysisResult {
  clarificationOpportunities: ClarificationOpportunity[];
  overallAssessment: {
    enhancementPotential: ImpactLevel;
    primaryGaps: string[];
    recommendedFocus: string;
  };
  intentQuality: {
    currentSpecificity: string;
    strengthAreas: string[];
    improvementAreas: string[];
  };
}

/**
 * AI Provider configuration
 */
export interface AIProviderConfig {
  /** API key for the provider */
  apiKey: string;

  /** Provider type (extensible string - supports any Vercel AI SDK provider) */
  provider: string;

  /** Optional model override (defaults to provider-specific default) */
  model?: string;

  /** Enable debug mode for logging AI interactions */
  debugMode?: boolean;
}

/**
 * Tool definition for AI providers
 * Defines a tool that the AI can call during agentic loops
 */
export interface AITool {
  /** Unique tool name (e.g., 'kubectl_get', 'search_capabilities') */
  name: string;

  /** Human-readable description of what the tool does and when to use it */
  description: string;

  /** JSON schema for tool input parameters */
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Tool executor function type
 * Called by the provider when AI requests a tool execution
 */
export type ToolExecutor = (toolName: string, input: any) => Promise<any>;

/**
 * Configuration for agentic tool loop
 */
export interface ToolLoopConfig {
  /** System prompt with context and strategic guidance */
  systemPrompt: string;

  /** User message/query to respond to */
  userMessage: string;

  /** Available tools for this workflow (scoped to workflow needs) */
  tools: AITool[];

  /** Function to execute tool calls */
  toolExecutor: ToolExecutor;

  /** Maximum number of AI iterations (default: 20) */
  maxIterations?: number;

  /** Optional callback invoked after each iteration */
  onIteration?: (iteration: number, toolCalls: any[]) => void;

  /** Optional operation identifier for metrics and debugging */
  operation?: string;

  /** PRD #154: Evaluation context for dataset generation */
  evaluationContext?: {
    user_intent?: string;
  };

  /** PRD #154: Interaction ID for dataset generation pairing */
  interaction_id?: string;
}

/**
 * Result from agentic tool loop
 */
export interface AgenticResult {
  /** Final text response from AI after completing tool loop */
  finalMessage: string;

  /** Number of iterations executed */
  iterations: number;

  /** All tool calls executed during the loop */
  toolCallsExecuted: Array<{
    tool: string;
    input: any;
    output: any;
  }>;

  /** Token usage statistics including cache metrics */
  totalTokens: {
    input: number;
    output: number;
    cacheCreation?: number;
    cacheRead?: number;
  };

  /** Execution status (PRD #143 Decision 5) */
  status?: 'success' | 'failed' | 'timeout' | 'parse_error';

  /** Reason for loop completion (PRD #143 Decision 5) */
  completionReason?: 'investigation_complete' | 'max_iterations' | 'parse_failure' | 'model_stopped' | 'error';

  /** Specific model version used (PRD #143 Decision 5) */
  modelVersion?: string;

  /** Debug files created during toolLoop execution (PRD #154) */
  debugFiles?: {
    full_prompt: string;
    full_response: string;
  };
}

/**
 * AI Provider Interface
 *
 * Minimal interface based on actual usage across 10 dependent files.
 * Only includes methods that are currently called in production code.
 */
export interface AIProvider {
  /**
   * Send a message to the AI service
   *
   * Primary method for all AI interactions. Supports streaming for long operations.
   * Used in: recommend.ts, answer-question.ts, generate-manifests.ts, remediate.ts,
   *          schema.ts, unified-creation-session.ts, platform-operations.ts
   *
   * @param message The message/prompt to send
   * @param operation Optional operation identifier for debugging (e.g., 'deployment', 'intent-analysis')
   * @param evaluationContext Optional evaluation context for dataset generation (PRD #154)
   * @returns AI response with content and usage statistics
   */
  sendMessage(
    message: string, 
    operation?: string,
    evaluationContext?: {
      user_intent?: string;
      interaction_id?: string;
    }
  ): Promise<AIResponse>;

  /**
   * Check if the provider is properly initialized
   *
   * Used in: schema.ts (pre-flight check before AI calls)
   *
   * @returns true if provider is ready to use, false otherwise
   */
  isInitialized(): boolean;

  /**
   * Get the default model for this provider
   *
   * NEW: Required to replace hardcoded model at claude.ts:181
   * Each provider has different model naming conventions.
   *
   * @returns Model identifier (e.g., 'claude-sonnet-4-5', 'gpt-4o', 'gemini-1.5-pro')
   */
  getDefaultModel(): string;

  /**
   * Get the provider type
   *
   * NEW: Useful for debugging and logging
   *
   * @returns Provider identifier (e.g., 'anthropic', 'openai', 'google')
   */
  getProviderType(): string;

  /**
   * Execute agentic loop with tool calling (NEW - PRD #136)
   *
   * AI autonomously decides which tools to call and when to stop.
   * Supports multi-turn conversations with tool execution.
   *
   * NOTE: Currently NOT USED in codebase. PRD #136 analysis showed JSON-based loops
   * achieve same goals without SDK overhead. Kept for potential future use.
   *
   * IMPLEMENTATION STATUS:
   * - AnthropicProvider: ✅ Implemented
   * - VercelAIProvider: ❌ Not implemented (not needed for current workflows)
   *
   * @param config Tool loop configuration with system prompt, tools, and executor
   * @returns Agentic result with final message, iterations, tool calls, and token usage
   */
  toolLoop(config: ToolLoopConfig): Promise<AgenticResult>;

}
