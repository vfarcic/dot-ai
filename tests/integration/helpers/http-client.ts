/**
 * HTTP REST API Client for Integration Tests
 *
 * Provides a simple HTTP client for testing REST API endpoints.
 * Handles request/response formatting and error handling.
 */

import { IncomingMessage } from 'http';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface RestApiResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    version: string;
  };
}

export interface HttpClientOptions {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class HttpRestApiClient {
  private baseUrl: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;

  constructor(options: HttpClientOptions = {}) {
    // Use MCP_BASE_URL from environment if set (for in-cluster testing), otherwise default to localhost
    this.baseUrl = options.baseUrl || process.env.MCP_BASE_URL || 'http://localhost:3456';
    this.timeout = options.timeout || 1800000; // Default to 30 minutes for integration tests (slower AI providers)
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };
  }

  /**
   * Make GET request to API endpoint
   */
  async get(path: string, headers?: Record<string, string>): Promise<RestApiResponse> {
    return this.request('GET', path, undefined, headers);
  }

  /**
   * Make POST request to API endpoint
   */
  async post(path: string, body?: any, headers?: Record<string, string>): Promise<RestApiResponse> {
    return this.request('POST', path, body, headers);
  }

  /**
   * Make PUT request to API endpoint
   */
  async put(path: string, body?: any, headers?: Record<string, string>): Promise<RestApiResponse> {
    return this.request('PUT', path, body, headers);
  }

  /**
   * Make DELETE request to API endpoint
   */
  async delete(path: string, headers?: Record<string, string>): Promise<RestApiResponse> {
    return this.request('DELETE', path, undefined, headers);
  }

  /**
   * Make generic HTTP request
   */
  private async request(
    method: string,
    path: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<RestApiResponse> {
    const url = new URL(path, this.baseUrl);
    const requestHeaders = { ...this.defaultHeaders, ...headers };

    const requestBody = body ? JSON.stringify(body) : undefined;
    if (requestBody) {
      requestHeaders['Content-Length'] = Buffer.byteLength(requestBody).toString();
    }

    const options = {
      method,
      headers: requestHeaders,
    };

    return new Promise((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(url, options, (res: IncomingMessage) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = this.parseResponse(data, res.statusCode || 500);
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error}`));
          }
        });
      });

      req.setTimeout(this.timeout);

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      });

      if (requestBody) {
        req.write(requestBody);
      }

      req.end();
    });
  }

  /**
   * Parse HTTP response into standard format
   */
  private parseResponse(data: string, statusCode: number): RestApiResponse {
    // Handle empty responses
    if (!data.trim()) {
      return {
        success: statusCode >= 200 && statusCode < 300,
        error: statusCode >= 400 ? {
          code: 'EMPTY_RESPONSE',
          message: `HTTP ${statusCode}: Empty response`,
        } : undefined,
      };
    }

    try {
      const parsed = JSON.parse(data);

      // If already in REST API format, return as-is
      if (typeof parsed === 'object' && 'success' in parsed) {
        return parsed;
      }

      // Wrap raw response in REST API format
      return {
        success: statusCode >= 200 && statusCode < 300,
        data: parsed,
        error: statusCode >= 400 ? {
          code: 'HTTP_ERROR',
          message: `HTTP ${statusCode}`,
          details: parsed,
        } : undefined,
      };
    } catch (error) {
      // Handle non-JSON responses
      return {
        success: statusCode >= 200 && statusCode < 300,
        data: statusCode < 400 ? data : undefined,
        error: statusCode >= 400 ? {
          code: 'INVALID_JSON',
          message: `HTTP ${statusCode}: ${data}`,
        } : undefined,
      };
    }
  }

  /**
   * Set base URL for all requests
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /**
   * Set timeout for all requests
   */
  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  /**
   * Add default header for all requests
   */
  setDefaultHeader(name: string, value: string): void {
    this.defaultHeaders[name] = value;
  }
}