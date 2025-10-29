/**
 * OpenTelemetry Tracing Types
 *
 * Type definitions for distributed tracing configuration and interfaces.
 */

import { Span, SpanOptions, Context } from '@opentelemetry/api';

/**
 * Tracing configuration options
 */
export interface TracingConfig {
  /** Service name for identification in traces (default: "dot-ai-mcp") */
  serviceName: string;

  /** Service version for tracking deployments (default: package.json version) */
  serviceVersion: string;

  /** Exporter type: console (dev), otlp (production), jaeger, zipkin */
  exporterType: 'console' | 'otlp' | 'jaeger' | 'zipkin';

  /** OTLP exporter endpoint (e.g., http://localhost:4318) */
  otlpEndpoint?: string;

  /** Enable tracing (default: true) */
  enabled: boolean;

  /** Sampling probability (0.0 to 1.0, default: 1.0 for always-on) */
  samplingProbability: number;

  /** Enable debug mode for verbose logging */
  debug: boolean;
}

/**
 * Span wrapper with utility methods
 */
export interface TracedSpan {
  /** The underlying OpenTelemetry span */
  span: Span;

  /** End the span successfully */
  end(): void;

  /** End the span with an error */
  endWithError(error: Error): void;

  /** Add custom attributes to the span */
  setAttributes(attributes: Record<string, string | number | boolean>): void;

  /** Add an event to the span */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
}

/**
 * Tracer service interface
 */
export interface TracerService {
  /** Initialize the tracer (called lazily on first use) */
  initialize(): void;

  /** Check if tracing is enabled */
  isEnabled(): boolean;

  /** Create a new span */
  startSpan(name: string, options?: SpanOptions, context?: Context): TracedSpan;

  /** Shutdown the tracer gracefully */
  shutdown(): Promise<void>;
}

/**
 * Span kind enumeration (re-export for convenience)
 */
export enum SpanKind {
  /** Internal operation (business logic, workflows) */
  INTERNAL = 0,

  /** Incoming request (HTTP server, MCP entry point) */
  SERVER = 1,

  /** Outgoing request (AI provider, K8s API, Vector DB, HTTP client) */
  CLIENT = 2,

  /** Message producer */
  PRODUCER = 3,

  /** Message consumer */
  CONSUMER = 4
}

/**
 * Common semantic convention attribute namespaces
 */
export const SemanticAttributes = {
  /** HTTP attributes (http.request.method, http.response.status_code) */
  HTTP: 'http',

  /** GenAI attributes (gen_ai.operation.name, gen_ai.provider.name) */
  GEN_AI: 'gen_ai',

  /** Database attributes (db.system.name, db.operation.name, db.collection.name) */
  DATABASE: 'db',

  /** Kubernetes attributes (k8s.operation, k8s.resource.kind, k8s.namespace) */
  KUBERNETES: 'k8s',

  /** Server attributes (server.address, server.port) */
  SERVER: 'server',

  /** Network attributes (network.peer.address, network.peer.port) */
  NETWORK: 'network'
} as const;
