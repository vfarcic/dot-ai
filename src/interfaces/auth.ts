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

  const rawAuthHeader = req.headers['authorization'];

  // Check if Authorization header is present
  if (!rawAuthHeader) {
    return {
      authorized: false,
      message: 'Authentication required. Provide Authorization: Bearer <token> header.'
    };
  }

  // Normalize header to string (handle array case)
  const authHeader = Array.isArray(rawAuthHeader)
    ? (rawAuthHeader[0] ?? '')
    : rawAuthHeader;

  // Parse Bearer token (case-insensitive per RFC 7235)
  // Use split instead of regex to avoid ReDoS vulnerability
  const trimmedHeader = authHeader.trim();
  const spaceIndex = trimmedHeader.indexOf(' ');

  if (spaceIndex === -1) {
    return {
      authorized: false,
      message: 'Invalid authorization format. Expected: Bearer <token>'
    };
  }

  const scheme = trimmedHeader.slice(0, spaceIndex);
  const providedToken = trimmedHeader.slice(spaceIndex + 1).trim();

  // Validate Bearer scheme (case-insensitive)
  if (scheme.toLowerCase() !== 'bearer') {
    return {
      authorized: false,
      message: 'Invalid authorization format. Expected: Bearer <token>'
    };
  }

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
