/**
 * Centralized Model Configuration
 *
 * Single source of truth for model versions currently used across the system.
 * Update versions here to change them everywhere.
 */

export const CURRENT_MODELS = {
  anthropic: 'claude-sonnet-5',
  anthropic_opus: 'claude-opus-5',
  anthropic_haiku: 'claude-haiku-4-5-20251001', // Still the current Haiku - no 5-generation Haiku exists
  openai: 'gpt-5.6-terra',
  google: 'gemini-3.1-pro-preview', // Still the flagship Gemini and still preview-only - no GA promotion, no 3.2+ Pro
  google_flash: 'gemini-3.6-flash', // Gemini 3.6 Flash - GA (no longer a preview pin); full-Flash tier restored after the 3.1 generation shipped Flash-Lite only
  kimi: 'kimi-k3', // Moonshot AI Kimi K3 - 1M context; replaces kimi-k2.5, which sunsets 2026-08-31
  alibaba: 'qwen3.7-plus', // Alibaba Qwen 3.7-Plus - 1M context, multimodal (vision), GA since 2026-06-01
  xai: 'grok-4.5', // Grok 4.5 - 500K context, native video input
  host: 'host', // Delegates generation to the client via MCP Sampling
  openrouter: 'anthropic/claude-haiku-4.5', // PRD #194: OpenRouter default model (overridden by AI_MODEL env var)
  custom: 'gpt-5.6-terra', // PRD #194: Custom endpoint default model (overridden by AI_MODEL env var)
  amazon_bedrock: 'global.anthropic.claude-sonnet-5', // PRD #175: Amazon Bedrock default model (overridden by AI_MODEL env var)
  copilot: 'claude-sonnet-5', // PRD #587: GitHub Copilot provider - catalog ID (dot notation only for minor versions, e.g. claude-sonnet-4.6); Copilot supports both /chat/completions and /v1/messages for Claude
} as const;

/**
 * Get current model for a provider
 */
export function getCurrentModel(provider: keyof typeof CURRENT_MODELS): string {
  return CURRENT_MODELS[provider];
}
