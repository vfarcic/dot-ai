/**
 * HTTP Server Tracing Module
 *
 * Provides manual SERVER span creation for incoming HTTP requests.
 * Follows OpenTelemetry HTTP semantic conventions.
 */

import {
  trace,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  Span,
} from '@opentelemetry/api';
import { IncomingMessage, ServerResponse } from 'node:http';
import { getTracer } from './tracer';

/**
 * HTTP semantic convention attributes
 * Based on OpenTelemetry HTTP semantic conventions
 */
interface HttpServerSpanAttributes {
  'http.request.method': string;
  'url.path': string;
  'url.scheme': string;
  'http.route'?: string;
  'server.address'?: string;
  'server.port'?: number;
  'client.address'?: string;
  'user_agent.original'?: string;
  'http.response.status_code'?: number;
}

/**
 * Extract trace context from HTTP headers
 * Follows W3C Trace Context specification
 */
function extractTraceContext(req: IncomingMessage) {
  return propagation.extract(context.active(), req.headers);
}

/**
 * Build span attributes from HTTP request
 */
function buildSpanAttributes(req: IncomingMessage): Partial<HttpServerSpanAttributes> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  const attributes: Partial<HttpServerSpanAttributes> = {
    'http.request.method': req.method || 'UNKNOWN',
    'url.path': url.pathname,
    'url.scheme': url.protocol.replace(':', ''),
    'http.route': url.pathname, // Can be enhanced with route templates
  };

  // Add optional attributes
  if (req.headers.host) {
    const [hostname, port] = req.headers.host.split(':');
    attributes['server.address'] = hostname;
    if (port) {
      attributes['server.port'] = parseInt(port, 10);
    }
  }

  // Client address (from headers or socket)
  const clientAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress;

  if (clientAddress) {
    attributes['client.address'] = clientAddress;
  }

  // User agent
  if (req.headers['user-agent']) {
    attributes['user_agent.original'] = req.headers['user-agent'];
  }

  return attributes;
}

/**
 * Create and manage HTTP SERVER span for incoming request
 *
 * Returns a function to end the span with response status code
 */
export function createHttpServerSpan(
  req: IncomingMessage
): { span: Span; endSpan: (statusCode: number) => void } {
  const tracerService = getTracer();

  if (!tracerService.isEnabled()) {
    // Return no-op if tracing is disabled
    const noopSpan = trace.getTracer('noop').startSpan('noop');
    return {
      span: noopSpan,
      endSpan: () => noopSpan.end(),
    };
  }

  // Extract parent trace context from headers
  const parentContext = extractTraceContext(req);

  // Build span name: "{METHOD} {route}"
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const spanName = `${req.method} ${url.pathname}`;

  // Get tracer instance
  const tracer = trace.getTracer('dot-ai-mcp');

  // Create SERVER span with parent context
  const span = tracer.startSpan(
    spanName,
    {
      kind: SpanKind.SERVER,
      attributes: buildSpanAttributes(req),
    },
    parentContext
  );

  // Make this span active for downstream operations
  const activeContext = trace.setSpan(parentContext, span);
  context.with(activeContext, () => {
    // Context is now active for any operations that happen within this request
  });

  // Return span and cleanup function
  return {
    span,
    endSpan: (statusCode: number) => {
      // Set response status code
      span.setAttribute('http.response.status_code', statusCode);

      // Set span status based on HTTP status code
      if (statusCode >= 500) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      span.end();
    },
  };
}

/**
 * Wrap HTTP request handler with tracing
 *
 * This is a higher-order function that wraps an existing HTTP request handler
 * with automatic SERVER span creation and management.
 *
 * @param handler - Original HTTP request handler
 * @returns Wrapped handler with tracing
 */
export function withHttpServerTracing(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const { span, endSpan } = createHttpServerSpan(req);

    try {
      // Set span as active context
      await context.with(trace.setSpan(context.active(), span), async () => {
        await handler(req, res);
      });

      // End span with actual response status code
      endSpan(res.statusCode);
    } catch (error) {
      // Record exception and end span with error
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.end();

      throw error;
    }
  };
}
