/**
 * Authentication module for HTTP transport
 *
 * PRD #360: User Authentication & Access Control
 *
 * Authentication is ALWAYS required. Two modes are supported:
 * - none: Only admin token authentication (DOT_AI_AUTH_TOKEN)
 * - oauth: OAuth 2.1 for users, admin token also works
 *
 * The admin token (DOT_AI_AUTH_TOKEN) ALWAYS works regardless of mode:
 * - First-time setup access before OAuth is configured
 * - Emergency access if OAuth provider is down
 * - CI/CD and headless environment access
 */

import { IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
  validateJWT,
  isOAuthInitialized,
  buildWWWAuthenticateHeader,
  UserContext,
} from './auth-oauth';

/**
 * Authentication mode
 * - none: Only admin token works (default)
 * - oauth: OAuth 2.1 enabled for users, admin token also works
 */
export type AuthMode = 'none' | 'oauth';

/**
 * Result of authentication check
 */
export interface AuthResult {
  /** Whether the request is authorized */
  authorized: boolean;
  /** Error message if not authorized */
  message?: string;
  /** WWW-Authenticate header value for 401 responses */
  wwwAuthenticate?: string;
  /** User context if authenticated via OAuth */
  user?: UserContext;
  /** Whether this is admin/token-based auth (vs user/OAuth) */
  isAdmin?: boolean;
}

/**
 * Get the configured authentication mode
 */
export function getAuthMode(): AuthMode {
  const mode = process.env.DOT_AI_AUTH_MODE?.toLowerCase();
  if (mode === 'oauth') {
    return 'oauth';
  }
  return 'none';
}

/**
 * Get the configured issuer URL for OAuth
 */
export function getAuthIssuer(): string {
  return process.env.DOT_AI_AUTH_ISSUER || '';
}

/**
 * Check if admin token is configured (DOT_AI_AUTH_TOKEN is set)
 */
export function isAdminTokenConfigured(): boolean {
  return !!process.env.DOT_AI_AUTH_TOKEN;
}

/**
 * Authenticate an incoming request
 *
 * Authentication flow:
 * 1. Admin token (DOT_AI_AUTH_TOKEN) is always checked first
 * 2. In 'oauth' mode, JWT validation is tried if admin token doesn't match
 * 3. In 'none' mode, only admin token works
 *
 * @param req - The incoming HTTP request
 * @returns AuthResult indicating if request is authorized
 */
export async function checkAuth(req: IncomingMessage): Promise<AuthResult> {
  const mode = getAuthMode();
  const issuer = getAuthIssuer();

  // Get the Authorization header
  const rawAuthHeader = req.headers['authorization'];
  const authHeader = Array.isArray(rawAuthHeader)
    ? (rawAuthHeader[0] ?? '')
    : (rawAuthHeader ?? '');

  // No auth header - authentication is always required
  if (!authHeader) {
    return {
      authorized: false,
      message: 'Authentication required. Provide Authorization: Bearer <token> header.',
      wwwAuthenticate: mode === 'oauth' && issuer ? buildWWWAuthenticateHeader(issuer) : undefined,
    };
  }

  // Parse the Bearer token
  const trimmedHeader = authHeader.trim();
  const spaceIndex = trimmedHeader.indexOf(' ');

  if (spaceIndex === -1) {
    return {
      authorized: false,
      message: 'Invalid authorization format. Expected: Bearer <token>',
      wwwAuthenticate: mode === 'oauth' && issuer ? buildWWWAuthenticateHeader(issuer) : undefined,
    };
  }

  const scheme = trimmedHeader.slice(0, spaceIndex);
  const token = trimmedHeader.slice(spaceIndex + 1).trim();

  if (scheme.toLowerCase() !== 'bearer') {
    return {
      authorized: false,
      message: 'Invalid authorization format. Expected: Bearer <token>',
      wwwAuthenticate: mode === 'oauth' && issuer ? buildWWWAuthenticateHeader(issuer) : undefined,
    };
  }

  if (!token) {
    return {
      authorized: false,
      message: 'Bearer token is empty.',
      wwwAuthenticate: mode === 'oauth' && issuer ? buildWWWAuthenticateHeader(issuer) : undefined,
    };
  }

  // PRIORITY 1: Always check admin token first
  const adminResult = validateAsAdminToken(token);
  if (adminResult.authorized) {
    return adminResult;
  }

  // PRIORITY 2: In oauth mode, try JWT validation
  if (mode === 'oauth') {
    if (!isOAuthInitialized()) {
      return {
        authorized: false,
        message: 'OAuth authentication not initialized. Contact administrator.',
        wwwAuthenticate: issuer ? buildWWWAuthenticateHeader(issuer) : undefined,
      };
    }

    const jwtResult = await validateAsJWT(token, issuer);
    return {
      ...jwtResult,
      wwwAuthenticate: !jwtResult.authorized && issuer ? buildWWWAuthenticateHeader(issuer) : undefined,
    };
  }

  // Mode is 'none' and admin token didn't match
  return {
    authorized: false,
    message: 'Invalid authentication token.',
  };
}

/**
 * Validate a token as the admin token (DOT_AI_AUTH_TOKEN)
 */
function validateAsAdminToken(token: string): AuthResult {
  const configuredToken = process.env.DOT_AI_AUTH_TOKEN;

  if (!configuredToken) {
    return { authorized: false, message: 'Admin token not configured.' };
  }

  // Use constant-time comparison to prevent timing attacks
  const configuredBuffer = Buffer.from(configuredToken, 'utf8');
  const providedBuffer = Buffer.from(token, 'utf8');

  // If lengths differ, tokens don't match
  if (configuredBuffer.length !== providedBuffer.length) {
    // Perform a dummy comparison to maintain constant time
    timingSafeEqual(configuredBuffer, configuredBuffer);
    return { authorized: false, message: 'Invalid authentication token.' };
  }

  if (!timingSafeEqual(configuredBuffer, providedBuffer)) {
    return { authorized: false, message: 'Invalid authentication token.' };
  }

  return { authorized: true, isAdmin: true };
}

/**
 * Validate a token as a JWT
 */
async function validateAsJWT(token: string, issuer: string): Promise<AuthResult> {
  const result = await validateJWT(token, issuer || undefined, issuer || undefined);

  if (!result.authorized) {
    return result;
  }

  return {
    authorized: true,
    user: result.user,
    isAdmin: false,
  };
}

// Re-export UserContext for convenience
export type { UserContext } from './auth-oauth';
