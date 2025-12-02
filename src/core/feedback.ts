/**
 * User Feedback Collection Module
 *
 * Manages feedback prompts shown to users at workflow completion.
 * Uses Google Forms for collecting feedback without requiring backend infrastructure.
 *
 * Configuration via environment variables:
 * - DOT_AI_FEEDBACK_ENABLED: Enable/disable feedback prompts (default: true)
 * - DOT_AI_FEEDBACK_PROBABILITY: Probability of showing prompt 0.0-1.0 (default: 0.05)
 * - DOT_AI_FEEDBACK_URL: Google Form URL (default: https://forms.gle/dJcDXtsxhCCwgxtT6)
 */

/**
 * Feedback configuration loaded from environment variables
 */
export interface FeedbackConfig {
  /** Whether feedback prompts are enabled */
  enabled: boolean;
  /** Probability of showing feedback prompt (0.0 to 1.0) */
  probability: number;
  /** Google Form URL for feedback collection */
  formUrl: string;
}

/** Default Google Form URL for feedback collection */
const DEFAULT_FEEDBACK_URL = 'https://forms.gle/dJcDXtsxhCCwgxtT6';

/** Default probability of showing feedback prompt (5%) */
const DEFAULT_FEEDBACK_PROBABILITY = 0.05;

/**
 * Parse boolean from environment variable string
 * Supports: true/false, 1/0, yes/no (case-insensitive)
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const lowered = value.toLowerCase();

  if (lowered === 'true' || lowered === '1' || lowered === 'yes') {
    return true;
  }

  if (lowered === 'false' || lowered === '0' || lowered === 'no') {
    return false;
  }

  return defaultValue;
}

/**
 * Parse probability from environment variable string
 * Validates range 0.0 to 1.0, returns default if invalid
 */
function parseProbability(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const probability = parseFloat(value);

  if (isNaN(probability) || probability < 0 || probability > 1) {
    console.warn(`Invalid DOT_AI_FEEDBACK_PROBABILITY: ${value}, using ${defaultValue}`);
    return defaultValue;
  }

  return probability;
}

/**
 * Load feedback configuration from environment variables
 */
export function loadFeedbackConfig(): FeedbackConfig {
  return {
    enabled: parseBoolean(process.env.DOT_AI_FEEDBACK_ENABLED, true),
    probability: parseProbability(process.env.DOT_AI_FEEDBACK_PROBABILITY, DEFAULT_FEEDBACK_PROBABILITY),
    formUrl: process.env.DOT_AI_FEEDBACK_URL || DEFAULT_FEEDBACK_URL
  };
}

/**
 * Determine if feedback prompt should be shown based on configuration
 * Uses random probability check when feedback is enabled
 */
export function shouldShowFeedback(config: FeedbackConfig): boolean {
  if (!config.enabled) {
    return false;
  }

  return Math.random() < config.probability;
}

/**
 * Generate the feedback message to append to tool responses
 */
export function getFeedbackMessage(config: FeedbackConfig): string {
  return `

════════════════════════════════════════════════════
📣 Help us improve dot-ai!
Share your feedback: ${config.formUrl}
(Disable feedback: DOT_AI_FEEDBACK_ENABLED=false)
════════════════════════════════════════════════════`;
}

/**
 * Check if feedback should be shown and return the message if so
 * Convenience function combining shouldShowFeedback and getFeedbackMessage
 *
 * @returns Feedback message string if should be shown, empty string otherwise
 */
export function maybeGetFeedbackMessage(config?: FeedbackConfig): string {
  const feedbackConfig = config || loadFeedbackConfig();

  if (shouldShowFeedback(feedbackConfig)) {
    return getFeedbackMessage(feedbackConfig);
  }

  return '';
}
