/**
 * PostHog Telemetry Client
 *
 * Provides anonymous usage telemetry using PostHog.
 * Follows a singleton pattern with lazy initialization.
 */

import { PostHog } from 'posthog-node';
import * as k8s from '@kubernetes/client-node';
import { createHash } from 'crypto';
import {
  TelemetryConfig,
  TelemetryService,
  TelemetryEventName,
  TelemetryEventProperties,
  ToolExecutedEventProperties,
  ToolErrorEventProperties,
  ServerStartedEventProperties,
  ServerStoppedEventProperties,
  ClientConnectedEventProperties,
  BaseEventProperties,
  McpClientInfo
} from './types';
import { loadTelemetryConfig } from './config';

/**
 * Global telemetry instance (singleton pattern with lazy initialization)
 */
let telemetryInstance: PostHogTelemetry | null = null;

/**
 * Generate anonymous instance ID from Kubernetes cluster UID
 *
 * Uses SHA-256 hash of the kube-system namespace UID to create a stable,
 * anonymous identifier that's unique per cluster but doesn't reveal cluster identity.
 */
async function generateInstanceId(): Promise<string> {
  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);

    const response = await coreApi.readNamespace({ name: 'kube-system' });
    const namespaceUid = response.metadata?.uid;

    if (namespaceUid) {
      // Hash the UID for anonymity
      const hash = createHash('sha256').update(namespaceUid).digest('hex');
      return `cluster_${hash.substring(0, 16)}`;
    }
  } catch (error) {
    // Cluster not available - generate a random ID for this session
    // This handles local development without a cluster
  }

  // Fallback: generate random ID for non-cluster environments
  const randomId = createHash('sha256')
    .update(`${Date.now()}-${Math.random()}`)
    .digest('hex');
  return `local_${randomId.substring(0, 16)}`;
}

/**
 * PostHog Telemetry implementation
 */
class PostHogTelemetry implements TelemetryService {
  private client: PostHog | null = null;
  private config: TelemetryConfig;
  private instanceId: string | null = null;
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: TelemetryConfig) {
    this.config = config;
  }

  /**
   * Initialize the PostHog client (called lazily on first use)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Prevent multiple concurrent initializations
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log('[Telemetry] Telemetry is disabled, skipping initialization');
      }
      this.initialized = true;
      return;
    }

    try {
      // Generate instance ID
      this.instanceId = await generateInstanceId();

      // Initialize PostHog client
      this.client = new PostHog(this.config.posthogKey, {
        host: this.config.posthogHost,
        flushAt: 10, // Batch up to 10 events before sending
        flushInterval: 10000, // Or send every 10 seconds
      });

      this.initialized = true;

      if (this.config.debug) {
        console.log('[Telemetry] PostHog initialized successfully', {
          instanceId: this.instanceId,
          posthogHost: this.config.posthogHost,
        });
      }
    } catch (error) {
      console.error('[Telemetry] Failed to initialize PostHog:', error);
      // Don't throw - telemetry failures should never break the app
      this.initialized = true;
    }
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Detect if this is an internal/test instance
   * Used by PostHog to filter out internal users from analytics
   */
  private isInternalInstance(): boolean {
    // Test environments
    if (process.env.NODE_ENV === 'test') return true;

    // CI environments
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS) return true;

    return false;
  }

  /**
   * Get base properties included in all events
   */
  private getBaseProperties(): BaseEventProperties {
    return {
      dot_ai_version: this.config.dotAiVersion,
      ai_provider: this.config.aiProvider,
      is_internal: this.isInternalInstance(),
    };
  }

  /**
   * Track a telemetry event (fire-and-forget, async)
   */
  trackEvent(event: TelemetryEventName, properties: TelemetryEventProperties): void {
    if (!this.config.enabled) {
      return;
    }

    // Fire-and-forget initialization and capture
    this.initialize()
      .then(() => {
        if (this.client && this.instanceId) {
          this.client.capture({
            distinctId: this.instanceId,
            event,
            properties,
          });

          if (this.config.debug) {
            console.log('[Telemetry] Event captured:', { event, properties });
          }
        }
      })
      .catch((error) => {
        // Silently fail - telemetry should never break the app
        if (this.config.debug) {
          console.error('[Telemetry] Failed to capture event:', error);
        }
      });
  }

  /**
   * Track tool execution
   */
  trackToolExecution(tool: string, success: boolean, durationMs: number, mcpClient?: McpClientInfo): void {
    const properties: ToolExecutedEventProperties = {
      ...this.getBaseProperties(),
      tool,
      success,
      duration_ms: durationMs,
      ...(mcpClient && {
        mcp_client: mcpClient.name,
        mcp_client_version: mcpClient.version,
      }),
    };
    this.trackEvent('tool_executed', properties);
  }

  /**
   * Track tool error
   */
  trackToolError(tool: string, errorType: string, mcpClient?: McpClientInfo): void {
    const properties: ToolErrorEventProperties = {
      ...this.getBaseProperties(),
      tool,
      error_type: errorType,
      ...(mcpClient && {
        mcp_client: mcpClient.name,
        mcp_client_version: mcpClient.version,
      }),
    };
    this.trackEvent('tool_error', properties);
  }

  /**
   * Track MCP client connection
   */
  trackClientConnected(mcpClient: McpClientInfo, transport: string): void {
    const properties: ClientConnectedEventProperties = {
      ...this.getBaseProperties(),
      mcp_client: mcpClient.name,
      mcp_client_version: mcpClient.version,
      transport,
    };
    this.trackEvent('client_connected', properties);
  }

  /**
   * Track server start
   */
  trackServerStart(k8sVersion?: string, deploymentMethod?: string): void {
    const properties: ServerStartedEventProperties = {
      ...this.getBaseProperties(),
      k8s_version: k8sVersion,
      deployment_method: deploymentMethod,
    };
    this.trackEvent('server_started', properties);
  }

  /**
   * Track server stop
   */
  trackServerStop(uptimeSeconds: number): void {
    const properties: ServerStoppedEventProperties = {
      ...this.getBaseProperties(),
      uptime_seconds: uptimeSeconds,
    };
    this.trackEvent('server_stopped', properties);
  }

  /**
   * Flush pending events and shutdown
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      if (this.config.debug) {
        console.log('[Telemetry] Shutting down PostHog client...');
      }
      await this.client.shutdown();
      this.client = null;

      if (this.config.debug) {
        console.log('[Telemetry] PostHog client shut down successfully');
      }
    }
  }
}

/**
 * Get or create the global telemetry instance
 */
export function getTelemetry(): TelemetryService {
  if (!telemetryInstance) {
    const config = loadTelemetryConfig();
    telemetryInstance = new PostHogTelemetry(config);
  }
  return telemetryInstance;
}

/**
 * Shutdown the global telemetry instance
 */
export async function shutdownTelemetry(): Promise<void> {
  if (telemetryInstance) {
    await telemetryInstance.shutdown();
    telemetryInstance = null;
  }
}
