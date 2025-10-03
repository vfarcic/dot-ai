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
   * @returns AI response with content and usage statistics
   */
  sendMessage(message: string, operation?: string): Promise<AIResponse>;

  /**
   * Analyze user intent for clarification opportunities
   *
   * Used in: recommend.ts (intent clarification workflow)
   *
   * @param intent User's deployment intent
   * @param organizationalPatterns Optional organizational patterns context
   * @returns Structured analysis with clarification opportunities
   */
  analyzeIntentForClarification(
    intent: string,
    organizationalPatterns?: string
  ): Promise<IntentAnalysisResult>;

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
}
