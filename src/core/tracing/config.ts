/**
 * OpenTelemetry Tracing Configuration
 *
 * Manages tracing configuration from environment variables with sensible defaults.
 */

import { TracingConfig } from './types';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Load service version from package.json
 */
function getServiceVersion(): string {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || '0.0.0';
  } catch (error) {
    console.error('Failed to load service version from package.json:', error);
    return '0.0.0';
  }
}

/**
 * Determine exporter type from environment variables
 */
function getExporterType(): TracingConfig['exporterType'] {
  const exporterEnv = process.env.OTEL_EXPORTER_TYPE?.toLowerCase();

  // Check for OTLP endpoint - if set, use OTLP exporter
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return 'otlp';
  }

  // Explicit exporter type
  switch (exporterEnv) {
    case 'otlp':
      return 'otlp';
    case 'jaeger':
      return 'jaeger';
    case 'zipkin':
      return 'zipkin';
    case 'console':
      return 'console';
    default:
      // Default to console for local development (zero-config)
      return 'console';
  }
}

/**
 * Get sampling probability from environment
 */
function getSamplingProbability(): number {
  const samplingEnv = process.env.OTEL_SAMPLING_PROBABILITY;
  if (!samplingEnv) {
    return 1.0; // Always-on sampling by default
  }

  const probability = parseFloat(samplingEnv);
  if (isNaN(probability) || probability < 0 || probability > 1) {
    console.warn(`Invalid OTEL_SAMPLING_PROBABILITY: ${samplingEnv}, using 1.0`);
    return 1.0;
  }

  return probability;
}

/**
 * Check if tracing is enabled
 *
 * Default: disabled to avoid console noise.
 * Users can enable with OTEL_TRACING_ENABLED=true when they want observability.
 */
function isTracingEnabled(): boolean {
  const enabledEnv = process.env.OTEL_TRACING_ENABLED?.toLowerCase();

  // Explicit enable
  if (enabledEnv === 'true' || enabledEnv === '1' || enabledEnv === 'yes') {
    return true;
  }

  // Explicit disable
  if (enabledEnv === 'false' || enabledEnv === '0' || enabledEnv === 'no') {
    return false;
  }

  // Default: disabled to keep logs clean
  return false;
}

/**
 * Check if debug mode is enabled
 */
function isDebugMode(): boolean {
  const debugEnv = process.env.OTEL_DEBUG?.toLowerCase();
  return debugEnv === 'true' || debugEnv === '1' || debugEnv === 'yes';
}

/**
 * Load tracing configuration from environment variables
 */
export function loadTracingConfig(): TracingConfig {
  const config: TracingConfig = {
    serviceName: process.env.OTEL_SERVICE_NAME || 'dot-ai-mcp',
    serviceVersion: getServiceVersion(),
    exporterType: getExporterType(),
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    enabled: isTracingEnabled(),
    samplingProbability: getSamplingProbability(),
    debug: isDebugMode()
  };

  // Log configuration in debug mode
  if (config.debug) {
    console.log('[Tracing] Configuration loaded:', {
      serviceName: config.serviceName,
      serviceVersion: config.serviceVersion,
      exporterType: config.exporterType,
      otlpEndpoint: config.otlpEndpoint,
      enabled: config.enabled,
      samplingProbability: config.samplingProbability
    });
  }

  return config;
}

/**
 * Validate tracing configuration
 */
export function validateTracingConfig(config: TracingConfig): void {
  // Validate OTLP endpoint if OTLP exporter is selected
  if (config.exporterType === 'otlp' && !config.otlpEndpoint) {
    throw new Error(
      'OTLP exporter requires OTEL_EXPORTER_OTLP_ENDPOINT environment variable'
    );
  }

  // Validate sampling probability
  if (config.samplingProbability < 0 || config.samplingProbability > 1) {
    throw new Error(
      `Invalid sampling probability: ${config.samplingProbability} (must be between 0.0 and 1.0)`
    );
  }

  // Warn about production configurations
  if (config.exporterType === 'console' && process.env.NODE_ENV === 'production') {
    console.warn(
      '[Tracing] Warning: Using console exporter in production. ' +
      'Consider using OTLP, Jaeger, or Zipkin exporter for production deployments.'
    );
  }
}
