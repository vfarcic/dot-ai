/**
 * Dual-mode authentication middleware for PRD #380.
 *
 * Validates Bearer tokens in two modes:
 * 1. JWT (HMAC-SHA256) — returns UserIdentity when valid
 * 2. Legacy DOT_AI_AUTH_TOKEN — constant-time comparison fallback
 *
 * All existing tests continue to pass because the legacy path is preserved.
 */

import { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { AuthResult } from './types';
import { verifyJwt, getJwtSecret } from './jwt';

/**
 * Check Bearer token authentication (dual-mode: JWT + legacy token).
 *
 * Order: JWT verification first, legacy DOT_AI_AUTH_TOKEN fallback second.
 * When neither auth method is configured, authentication is disabled (backward compatible).
 *
 * @param req - The incoming HTTP request
 * @returns AuthResult with optional UserIdentity when JWT auth succeeds
 */
export function checkBearerAuth(req: IncomingMessage): AuthResult {
  const legacyToken = process.env.DOT_AI_AUTH_TOKEN;
  const jwtSecret = process.env.DOT_AI_JWT_SECRET;

  // If no auth is configured, reject — DOT_AI_AUTH_TOKEN is required
  if (!legacyToken && !jwtSecret) {
    return {
      authorized: false,
      message:
        'Authentication is not configured. Set DOT_AI_AUTH_TOKEN in your deployment.',
    };
  }

  // Extract Authorization header
  const rawAuthHeader = req.headers['authorization'];
  if (!rawAuthHeader) {
    return {
      authorized: false,
      message:
        'Authentication required. Provide Authorization: Bearer <token> header.',
    };
  }

  // Normalize header to string (handle array case)
  const authHeader = Array.isArray(rawAuthHeader)
    ? (rawAuthHeader[0] ?? '')
    : rawAuthHeader;

  // Parse Bearer token (ReDoS-safe: indexOf instead of regex)
  const trimmedHeader = authHeader.trim();
  const spaceIndex = trimmedHeader.indexOf(' ');

  if (spaceIndex === -1) {
    return {
      authorized: false,
      message: 'Invalid authorization format. Expected: Bearer <token>',
    };
  }

  const scheme = trimmedHeader.slice(0, spaceIndex);
  const providedToken = trimmedHeader.slice(spaceIndex + 1).trim();

  // Validate Bearer scheme (case-insensitive per RFC 7235)
  if (scheme.toLowerCase() !== 'bearer') {
    return {
      authorized: false,
      message: 'Invalid authorization format. Expected: Bearer <token>',
    };
  }

  if (!providedToken) {
    return { authorized: false, message: 'Bearer token is empty.' };
  }

  // Mode 1: Try JWT verification
  const secret = jwtSecret || getJwtSecret();
  const claims = verifyJwt(providedToken, secret);
  if (claims) {
    return {
      authorized: true,
      identity: {
        userId: claims.sub,
        email: claims.email,
        groups: claims.groups ?? [],
        source: 'oauth',
      },
    };
  }

  // Mode 2: Fall back to legacy DOT_AI_AUTH_TOKEN comparison
  if (legacyToken) {
    const configuredBuffer = Buffer.from(legacyToken, 'utf8');
    const providedBuffer = Buffer.from(providedToken, 'utf8');

    if (configuredBuffer.length !== providedBuffer.length) {
      // Dummy comparison to maintain constant time
      timingSafeEqual(configuredBuffer, configuredBuffer);
      return { authorized: false, message: 'Invalid authentication token.' };
    }

    if (timingSafeEqual(configuredBuffer, providedBuffer)) {
      return {
        authorized: true,
        identity: { userId: 'anonymous', groups: [], source: 'token' },
      };
    }
  }

  return { authorized: false, message: 'Invalid authentication token.' };
}

/**
 * Check if authentication is enabled.
 * True when either legacy token or JWT secret is configured.
 */
export function isAuthEnabled(): boolean {
  return !!process.env.DOT_AI_AUTH_TOKEN || !!process.env.DOT_AI_JWT_SECRET;
}
