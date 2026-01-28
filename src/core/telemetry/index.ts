/**
 * PostHog Telemetry Module
 *
 * Public API for anonymous usage telemetry.
 *
 * Usage:
 *   import { getTelemetry, shutdownTelemetry } from './core/telemetry';
 *
 *   // Track tool execution
 *   getTelemetry().trackToolExecution('recommend', true, 1250);
 *
 *   // Track errors
 *   getTelemetry().trackToolError('deploy', 'KubernetesAPIError');
 *
 *   // Track server lifecycle
 *   getTelemetry().trackServerStart('1.29.0', 'helm');
 *   getTelemetry().trackServerStop(3600);
 *
 *   // Shutdown on exit
 *   await shutdownTelemetry();
 *
 * Configuration:
 *   - DOT_AI_TELEMETRY=false     Disable telemetry (opt-out)
 *   - DOT_AI_POSTHOG_KEY=xxx     Override default PostHog key
 *   - DOT_AI_POSTHOG_HOST=xxx    Override default PostHog host (for self-hosted)
 */

export * from './types';
export { loadTelemetryConfig } from './config';
export { getTelemetry, shutdownTelemetry, setTelemetryPluginManager } from './client';
