/**
 * OpenTelemetry Tracer Service
 *
 * Provides lazy initialization and management of distributed tracing.
 * Follows OpenTelemetry best practices with support for multiple exporters.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  trace,
  context,
  SpanStatusCode,
  Span,
  SpanOptions,
  Context,
} from '@opentelemetry/api';
import { TracingConfig, TracedSpan, TracerService } from './types';
import { loadTracingConfig, validateTracingConfig } from './config';

/**
 * Global tracer instance (singleton pattern with lazy initialization)
 */
let tracerInstance: OpenTelemetryTracer | null = null;

/**
 * OpenTelemetry Tracer implementation
 */
class OpenTelemetryTracer implements TracerService {
  private sdk: NodeSDK | null = null;
  private config: TracingConfig;
  private initialized: boolean = false;

  constructor(config: TracingConfig) {
    this.config = config;
  }

  /**
   * Initialize the OpenTelemetry SDK (called lazily on first use)
   */
  initialize(): void {
    if (this.initialized) {
      return; // Already initialized
    }

    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log('[Tracing] Tracing is disabled, skipping initialization');
      }
      return;
    }

    try {
      // Validate configuration
      validateTracingConfig(this.config);

      // Create resource with service identification
      const serviceResource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: this.config.serviceName,
        [ATTR_SERVICE_VERSION]: this.config.serviceVersion,
      });
      const resource = defaultResource().merge(serviceResource);

      // Create exporter based on configuration
      const traceExporter = this.createExporter();

      // Initialize Node SDK without auto-instrumentation
      // All operations are manually instrumented with descriptive spans
      this.sdk = new NodeSDK({
        resource,
        traceExporter,
        instrumentations: [], // No auto-instrumentation needed
      });

      // Start the SDK
      this.sdk.start();
      this.initialized = true;

      if (this.config.debug) {
        console.log('[Tracing] OpenTelemetry initialized successfully', {
          serviceName: this.config.serviceName,
          serviceVersion: this.config.serviceVersion,
          exporterType: this.config.exporterType,
        });
      }
    } catch (error) {
      console.error('[Tracing] Failed to initialize OpenTelemetry:', error);
      throw error;
    }
  }

  /**
   * Create exporter based on configuration
   */
  private createExporter() {
    switch (this.config.exporterType) {
      case 'console':
        if (this.config.debug) {
          console.log('[Tracing] Using console exporter (outputs to stderr)');
        }
        return new ConsoleSpanExporter();

      case 'otlp':
        if (this.config.debug) {
          console.log('[Tracing] Using OTLP exporter', {
            endpoint: this.config.otlpEndpoint || 'http://localhost:4318/v1/traces'
          });
        }
        return new OTLPTraceExporter({
          url: this.config.otlpEndpoint || 'http://localhost:4318/v1/traces',
        });

      case 'jaeger':
        // Jaeger exporter will be added in Phase 3
        throw new Error('Jaeger exporter not yet implemented - coming in Phase 3');

      case 'zipkin':
        // Zipkin exporter will be added in Phase 3
        throw new Error('Zipkin exporter not yet implemented - coming in Phase 3');

      default:
        throw new Error(`Unknown exporter type: ${this.config.exporterType}`);
    }
  }

  /**
   * Check if tracing is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Create a new span with utility methods
   */
  startSpan(name: string, options?: SpanOptions, parentContext?: Context): TracedSpan {
    if (!this.config.enabled) {
      // Return a no-op span if tracing is disabled
      return this.createNoOpSpan();
    }

    // Lazy initialization on first span creation
    if (!this.initialized) {
      this.initialize();
    }

    const tracer = trace.getTracer(this.config.serviceName, this.config.serviceVersion);
    const ctx = parentContext || context.active();
    const span = tracer.startSpan(name, options, ctx);

    return this.wrapSpan(span);
  }

  /**
   * Wrap an OpenTelemetry span with utility methods
   */
  private wrapSpan(span: Span): TracedSpan {
    return {
      span,

      end(): void {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      },

      endWithError(error: Error): void {
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.end();
      },

      setAttributes(attributes: Record<string, string | number | boolean>): void {
        span.setAttributes(attributes);
      },

      addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
        span.addEvent(name, attributes);
      },
    };
  }

  /**
   * Create a no-op span for when tracing is disabled
   */
  private createNoOpSpan(): TracedSpan {
    const noopSpan = trace.getTracer('noop').startSpan('noop');
    return this.wrapSpan(noopSpan);
  }

  /**
   * Shutdown the tracer gracefully
   */
  async shutdown(): Promise<void> {
    if (this.sdk && this.initialized) {
      if (this.config.debug) {
        console.log('[Tracing] Shutting down OpenTelemetry SDK...');
      }
      await this.sdk.shutdown();
      this.initialized = false;

      if (this.config.debug) {
        console.log('[Tracing] OpenTelemetry SDK shut down successfully');
      }
    }
  }
}

/**
 * Get or create the global tracer instance
 */
export function getTracer(): TracerService {
  if (!tracerInstance) {
    const config = loadTracingConfig();
    tracerInstance = new OpenTelemetryTracer(config);
  }
  return tracerInstance;
}

/**
 * Shutdown the global tracer instance
 */
export async function shutdownTracer(): Promise<void> {
  if (tracerInstance) {
    await tracerInstance.shutdown();
    tracerInstance = null;
  }
}

/**
 * Helper function to wrap async operations with tracing
 */
export async function withSpan<T>(
  name: string,
  fn: (span: TracedSpan) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, options);

  try {
    const result = await fn(span);
    span.end();
    return result;
  } catch (error) {
    span.endWithError(error as Error);
    throw error;
  }
}
