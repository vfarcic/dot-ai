/**
 * Plugin Client for dot-ai Plugin System
 *
 * HTTP client for communicating with agentic plugins.
 * Handles describe and invoke hooks via POST /execute endpoint.
 *
 * PRD #343: kubectl Plugin Migration
 */

import {
  PluginConfig,
  ExecuteRequest,
  DescribeResponse,
  InvokePayload,
  InvokeResponse,
} from './plugin-types';
import { Logger } from './error-handling';

/**
 * Error thrown when plugin communication fails
 */
export class PluginClientError extends Error {
  constructor(
    message: string,
    public readonly pluginName: string,
    public readonly pluginUrl: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'PluginClientError';
  }
}

/**
 * HTTP client for a single plugin
 */
export class PluginClient {
  private readonly config: PluginConfig;
  private readonly logger: Logger;
  private readonly timeout: number;

  constructor(config: PluginConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Get plugin name
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Get plugin URL
   */
  get url(): string {
    return this.config.url;
  }

  /**
   * Call the describe hook to get tool definitions
   */
  async describe(): Promise<DescribeResponse> {
    const request: ExecuteRequest = {
      hook: 'describe',
    };

    this.logger.debug('Calling plugin describe hook', {
      plugin: this.config.name,
      url: this.config.url,
    });

    const response = await this.execute<DescribeResponse>(request);

    this.logger.debug('Plugin describe response', {
      plugin: this.config.name,
      version: response.version,
      toolCount: response.tools.length,
    });

    return response;
  }

  /**
   * Call the invoke hook to execute a tool
   */
  async invoke(
    tool: string,
    args: Record<string, unknown>,
    state: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<InvokeResponse> {
    const payload: InvokePayload = {
      tool,
      args,
      state,
    };

    const request: ExecuteRequest = {
      hook: 'invoke',
      sessionId,
      payload,
    };

    this.logger.debug('Calling plugin invoke hook', {
      plugin: this.config.name,
      tool,
      sessionId,
    });

    const response = await this.execute<InvokeResponse>(request);

    this.logger.debug('Plugin invoke response', {
      plugin: this.config.name,
      tool,
      success: response.success,
    });

    return response;
  }

  /**
   * Check if plugin is healthy/reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.describe();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute a request to the plugin's /execute endpoint
   */
  private async execute<T>(request: ExecuteRequest): Promise<T> {
    const executeUrl = `${this.config.url}/execute`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(executeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new PluginClientError(
          `Plugin returned HTTP ${response.status}: ${errorText}`,
          this.config.name,
          this.config.url
        );
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      if (error instanceof PluginClientError) {
        throw error;
      }

      const cause = error instanceof Error ? error : new Error(String(error));

      if (cause.name === 'AbortError') {
        throw new PluginClientError(
          `Plugin request timed out after ${this.timeout}ms`,
          this.config.name,
          this.config.url,
          cause
        );
      }

      throw new PluginClientError(
        `Failed to communicate with plugin: ${cause.message}`,
        this.config.name,
        this.config.url,
        cause
      );
    }
  }
}
