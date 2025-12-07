/**
 * Authentication module for HTTP transport
 *
 * Provides Bearer token authentication for the MCP HTTP server.
 * Authentication is optional and only enabled when DOT_AI_AUTH_TOKEN is set.
 */

import { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export interface AuthResult {
  authorized: boolean;
  message?: string;
}

/**
 * Check Bearer token authentication for HTTP requests.
 *
 * Authentication is only required when DOT_AI_AUTH_TOKEN environment variable is set.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param req - The incoming HTTP request
 * @returns AuthResult indicating if request is authorized
 */
export function checkBearerAuth(req: IncomingMessage): AuthResult {
  const configuredToken = process.env.DOT_AI_AUTH_TOKEN;

  // If no token configured, authentication is disabled (backward compatible)
  if (!configuredToken) {
    return { authorized: true };
  }

  const authHeader = req.headers['authorization'];

  // Check if Authorization header is present
  if (!authHeader) {
    return {
      authorized: false,
      message: 'Authentication required. Provide Authorization: Bearer <token> header.'
    };
  }

  // Check if it's a Bearer token
  if (!authHeader.startsWith('Bearer ')) {
    return {
      authorized: false,
      message: 'Invalid authorization format. Expected: Bearer <token>'
    };
  }

  const providedToken = authHeader.slice(7); // Remove 'Bearer ' prefix

  // Check if token is empty
  if (!providedToken) {
    return { authorized: false, message: 'Bearer token is empty.' };
  }

  // Use constant-time comparison to prevent timing attacks
  // Both buffers must be same length for timingSafeEqual
  const configuredBuffer = Buffer.from(configuredToken, 'utf8');
  const providedBuffer = Buffer.from(providedToken, 'utf8');

  // If lengths differ, tokens don't match (but still do constant-time operation to avoid timing leak)
  if (configuredBuffer.length !== providedBuffer.length) {
    // Perform a dummy comparison to maintain constant time
    timingSafeEqual(configuredBuffer, configuredBuffer);
    return { authorized: false, message: 'Invalid authentication token.' };
  }

  if (!timingSafeEqual(configuredBuffer, providedBuffer)) {
    return { authorized: false, message: 'Invalid authentication token.' };
  }

  return { authorized: true };
}

/**
 * Check if authentication is enabled (DOT_AI_AUTH_TOKEN is set)
 */
export function isAuthEnabled(): boolean {
  return !!process.env.DOT_AI_AUTH_TOKEN;
}
