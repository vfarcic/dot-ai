/**
 * Kubernetes Client Tracing Utilities
 *
 * Generic tracing wrappers for Kubernetes operations:
 * 1. Transparent proxy for @kubernetes/client-node API clients
 * 2. Wrapper for kubectl CLI command execution
 *
 * Uses CLIENT span kind with k8s.* semantic conventions
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';

/**
 * Configuration for kubectl command tracing
 */
export interface KubectlConfig {
  context?: string;
  namespace?: string;
  kubeconfig?: string;
  timeout?: number;
  stdin?: string;
}

/**
 * Create traced Kubernetes API client using JavaScript Proxy
 *
 * Transparently wraps ANY Kubernetes API client method with tracing.
 * No code changes needed in calling code - just wrap the client once.
 *
 * @param apiClient Original K8s API client instance
 * @param apiType API client type (e.g., 'CoreV1Api', 'AppsV1Api')
 * @returns Proxied client with automatic tracing for all methods
 *
 * @example
 * const coreApi = createTracedK8sClient(
 *   kc.makeApiClient(k8s.CoreV1Api),
 *   'CoreV1Api'
 * );
 * await coreApi.listNamespace(); // Automatically traced as "k8s.listNamespace"
 */
export function createTracedK8sClient<T extends object>(
  apiClient: T,
  apiType: string
): T {
  const tracer = trace.getTracer('dot-ai-mcp');

  return new Proxy(apiClient, {
    get(target: T, prop: string | symbol, receiver: any) {
      const original = Reflect.get(target, prop, receiver);

      // Only wrap functions (API methods), not properties
      if (typeof original !== 'function') {
        return original;
      }

      // Return wrapped function with tracing
      return function (this: any, ...args: any[]) {
        const methodName = String(prop);
        const spanName = `k8s.${methodName}`;

        return tracer.startActiveSpan(
          spanName,
          {
            kind: SpanKind.CLIENT,
            attributes: {
              'k8s.client': 'kubernetes-client-node',
              'k8s.api': apiType,
              'k8s.method': methodName,
            },
          },
          async (span) => {
            try {
              // Execute the original K8s API method
              const result = await original.apply(target, args);

              // Add response metadata if available
              if (result?.response?.statusCode) {
                span.setAttribute(
                  'http.response.status_code',
                  result.response.statusCode
                );
              }

              span.setStatus({ code: SpanStatusCode.OK });
              return result;
            } catch (error) {
              // Record K8s API error
              span.recordException(error as Error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message:
                  error instanceof Error ? error.message : String(error),
              });

              // Add K8s-specific error attributes
              if (error instanceof Error && 'statusCode' in error) {
                span.setAttribute(
                  'k8s.error.status_code',
                  (error as any).statusCode
                );
              }

              throw error;
            } finally {
              span.end();
            }
          }
        );
      };
    },
  });
}

/**
 * Tracing wrapper for kubectl CLI command execution
 *
 * Wraps kubectl command execution with OpenTelemetry tracing spans.
 * Captures command details, operation type, and execution results.
 *
 * @param args kubectl command arguments (e.g., ['get', 'pods', '-n', 'default'])
 * @param config kubectl execution configuration
 * @param handler Function that executes the actual kubectl command
 * @returns kubectl command output
 *
 * @example
 * const output = await withKubectlTracing(
 *   ['get', 'crd', '-o', 'json'],
 *   { kubeconfig: '/path/to/config' },
 *   async () => execAsync('kubectl get crd -o json')
 * );
 */
export async function withKubectlTracing(
  args: string[],
  config: KubectlConfig | undefined,
  handler: () => Promise<string>
): Promise<string> {
  const tracer = trace.getTracer('dot-ai-mcp');

  // Parse operation and resource from args
  const operation = args[0] || 'unknown'; // 'get', 'apply', 'delete', etc.
  const resource = args[1] || 'unknown'; // 'pods', 'crd', 'deployments', etc.
  const spanName = `kubectl ${operation} ${resource}`;

  return await tracer.startActiveSpan(
    spanName,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'k8s.client': 'kubectl',
        'k8s.command': 'kubectl',
        'k8s.operation': operation,
        'k8s.resource': resource,
        'k8s.args': args.join(' '),
        ...(config?.namespace && { 'k8s.namespace': config.namespace }),
        ...(config?.context && { 'k8s.context': config.context }),
        ...(config?.kubeconfig && { 'k8s.kubeconfig': config.kubeconfig }),
      },
    },
    async (span) => {
      const startTime = Date.now();

      try {
        // Execute the kubectl command
        const result = await context.with(
          trace.setSpan(context.active(), span),
          handler
        );

        // Add execution metrics
        span.setAttribute('k8s.duration_ms', Date.now() - startTime);
        span.setAttribute('k8s.output_size_bytes', result.length);
        span.setStatus({ code: SpanStatusCode.OK });

        return result;
      } catch (error) {
        // Record kubectl error with details
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });

        // Parse kubectl error for additional context
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('not found')) {
          span.setAttribute('k8s.error.type', 'NotFound');
        } else if (errorMessage.includes('forbidden')) {
          span.setAttribute('k8s.error.type', 'Forbidden');
        } else if (errorMessage.includes('timeout')) {
          span.setAttribute('k8s.error.type', 'Timeout');
        }

        throw error;
      } finally {
        span.end();
      }
    }
  );
}
