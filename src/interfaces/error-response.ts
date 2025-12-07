/**
 * Shared error response formatting for HTTP interfaces
 *
 * Provides consistent error response format across MCP server and REST API.
 */

import { ServerResponse } from 'node:http';

export interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Format an error response body in the standard REST API format.
 *
 * @param code - Error code (e.g., 'UNAUTHORIZED', 'INTERNAL_ERROR')
 * @param message - Human-readable error message
 * @param details - Optional additional details
 * @returns Formatted error response body
 */
export function formatErrorResponse(
  code: string,
  message: string,
  details?: unknown
): ErrorResponseBody {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && { details })
    }
  };
}

/**
 * Send an error response with consistent formatting.
 *
 * @param res - HTTP server response
 * @param statusCode - HTTP status code
 * @param code - Error code
 * @param message - Human-readable error message
 * @param details - Optional additional details
 */
export function sendErrorResponse(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): void {
  const body = formatErrorResponse(code, message, details);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
