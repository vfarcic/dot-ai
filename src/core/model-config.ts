/**
 * Centralized Model Configuration
 * 
 * Single source of truth for model versions currently used across the system.
 * Update versions here to change them everywhere.
 */

export const CURRENT_MODELS = {
  anthropic: 'claude-sonnet-4-6',
  anthropic_opus: 'claude-opus-4-6',
  anthropic_haiku: 'claude-haiku-4-5-20251001',
  openai: 'gpt-5.1-codex',
  google: 'gemini-3.1-pro-preview',
  google_flash: 'gemini-3-flash-preview', // PRD #294: Gemini 3 Flash - faster/cheaper variant with same 1M context
  kimi: 'kimi-k2-0905-preview', // PRD #237: Moonshot AI Kimi K2 - standard model with 256K context
  kimi_thinking: 'kimi-k2-thinking', // PRD #237: Moonshot AI Kimi K2 - extended thinking variant
  xai: 'grok-4',
  host: 'host', // Delegates generation to the client via MCP Sampling
  openrouter: 'anthropic/claude-haiku-4.5', // PRD #194: OpenRouter default model (overridden by AI_MODEL env var)
  custom: 'gpt-5.1-codex', // PRD #194: Custom endpoint default model (overridden by AI_MODEL env var)
  amazon_bedrock: 'global.anthropic.claude-sonnet-4-6' // PRD #175: Amazon Bedrock default model (overridden by AI_MODEL env var)
} as const;

/**
 * Get current model for a provider
 */
export function getCurrentModel(provider: keyof typeof CURRENT_MODELS): string {
  return CURRENT_MODELS[provider];
}