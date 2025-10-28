/**
 * Centralized Model Configuration
 * 
 * Single source of truth for model versions currently used across the system.
 * Update versions here to change them everywhere.
 */

export const CURRENT_MODELS = {
  anthropic: 'claude-sonnet-4-5-20250929',
  anthropic_haiku: 'claude-haiku-4-5-20251001',
  openai: 'gpt-5',
  openai_pro: 'gpt-5-pro',
  google: 'gemini-2.5-pro',
  google_fast: 'gemini-2.5-flash',
  xai: 'grok-4',
  xai_fast: 'grok-4-fast-reasoning',
  mistral: 'mistral-large-latest',
  deepseek: 'deepseek-reasoner',
  openrouter: 'anthropic/claude-haiku-4.5', // PRD #194: OpenRouter default model (overridden by AI_MODEL env var)
  custom: 'gpt-5' // PRD #194: Custom endpoint default model (overridden by AI_MODEL env var)
} as const;

/**
 * Get current model for a provider
 */
export function getCurrentModel(provider: keyof typeof CURRENT_MODELS): string {
  return CURRENT_MODELS[provider];
}