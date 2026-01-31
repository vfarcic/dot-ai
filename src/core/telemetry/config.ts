/**
 * PostHog Telemetry Configuration
 *
 * Manages telemetry configuration from environment variables with sensible defaults.
 * Telemetry is opt-out (enabled by default) and can be disabled via DOT_AI_TELEMETRY=false.
 */

import { TelemetryConfig } from './types';
import { readFileSync } from 'fs';
import * as path from 'path';

/**
 * Default PostHog configuration
 * The API key is public and safe to expose - it can only write events, not read data.
 */
const DEFAULT_POSTHOG_KEY = 'phc_NALnABhyc3UNGS8fJlFiaR6Ry0OuunkRDSgaEOb8uZV';
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

/**
 * Load service version from package.json
 */
function getDotAiVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Get AI provider from environment
 */
function getAiProvider(): string {
  // Check explicit provider setting
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider) {
    return provider;
  }

  // Infer from available API keys
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GOOGLE_API_KEY) return 'google';
  if (process.env.XAI_API_KEY) return 'xai';
  if (process.env.AWS_ACCESS_KEY_ID) return 'amazon_bedrock';

  return 'unknown';
}

/**
 * Check if telemetry is enabled
 *
 * Default: enabled (opt-out model).
 * Users can disable with DOT_AI_TELEMETRY=false.
 */
function isTelemetryEnabled(): boolean {
  const telemetryEnv = process.env.DOT_AI_TELEMETRY?.toLowerCase();

  // Explicit disable
  if (telemetryEnv === 'false' || telemetryEnv === '0' || telemetryEnv === 'no' || telemetryEnv === 'off') {
    return false;
  }

  // Default: enabled
  return true;
}

/**
 * Check if debug mode is enabled
 */
function isDebugMode(): boolean {
  const debugEnv = process.env.DEBUG_DOT_AI?.toLowerCase();
  return debugEnv === 'true' || debugEnv === '1' || debugEnv === 'yes';
}

/**
 * Load telemetry configuration from environment variables
 */
export function loadTelemetryConfig(): TelemetryConfig {
  const config: TelemetryConfig = {
    enabled: isTelemetryEnabled(),
    posthogKey: process.env.DOT_AI_POSTHOG_KEY || DEFAULT_POSTHOG_KEY,
    posthogHost: process.env.DOT_AI_POSTHOG_HOST || DEFAULT_POSTHOG_HOST,
    dotAiVersion: getDotAiVersion(),
    aiProvider: getAiProvider(),
    debug: isDebugMode()
  };

  // Log configuration in debug mode
  if (config.debug) {
    console.log('[Telemetry] Configuration loaded:', {
      enabled: config.enabled,
      posthogHost: config.posthogHost,
      dotAiVersion: config.dotAiVersion,
      aiProvider: config.aiProvider,
    });
  }

  return config;
}
