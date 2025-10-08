/**
 * Centralized Model Configuration
 * 
 * Single source of truth for model versions currently used across the system.
 * Update versions here to change them everywhere.
 */

export const CURRENT_MODELS = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-5', 
  google: 'gemini-2.5-pro'
} as const;

/**
 * Get current model for a provider
 */
export function getCurrentModel(provider: keyof typeof CURRENT_MODELS): string {
  return CURRENT_MODELS[provider];
}