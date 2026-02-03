/**
 * Authentication module for HTTP transport
 *
 * PRD #360: User Authentication & Access Control
 *
 * MCP has ZERO auth logic - all validation is delegated to the plugin.
 * The plugin's auth_validate_token handles both admin tokens and JWTs.
 * MCP just calls the plugin and caches the result.
 */

import { IncomingMessage } from 'node:http';
import {
  validateTokenWithCache,
  isOAuthInitialized,
  buildWWWAuthenticateHeader,
  getAuthConfig,
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
  /** User context if authenticated */
  user?: UserContext;
  /** Whether this is admin/token-based auth (vs user/OAuth) */
  isAdmin?: boolean;
}

/**
 * Get the configured authentication mode
 * Reads from plugin config (single source of truth), falls back to env var
 */
export function getAuthMode(): AuthMode {
  // Try plugin config first (single source of truth)
  const config = getAuthConfig();
  if (config) {
    return config.mode;
  }
  // Fallback to env var (for startup before plugin is initialized)
  const mode = process.env.DOT_AI_AUTH_MODE?.toLowerCase();
  if (mode === 'oauth') {
    return 'oauth';
  }
  return 'none';
}

/**
 * Get the configured issuer URL for OAuth
 * Reads from plugin config (single source of truth), falls back to env var
 */
export function getAuthIssuer(): string {
  // Try plugin config first (single source of truth)
  const config = getAuthConfig();
  if (config) {
    return config.issuer;
  }
  // Fallback to env var (for startup before plugin is initialized)
  return process.env.DOT_AI_AUTH_ISSUER || '';
}

/**
 * Check if admin token is configured
 * Reads from plugin config (single source of truth), falls back to env var
 */
export function isAdminTokenConfigured(): boolean {
  const config = getAuthConfig();
  if (config) {
    return !!config.admin_token;
  }
  return !!process.env.DOT_AI_AUTH_TOKEN;
}

/**
 * Authenticate an incoming request
 *
 * MCP has ZERO auth logic - all validation is delegated to the plugin.
 * The plugin's auth_validate_token handles both admin tokens and JWTs.
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

  // Check if auth system is initialized
  if (!isOAuthInitialized()) {
    return {
      authorized: false,
      message: 'Authentication system not initialized. Contact administrator.',
      wwwAuthenticate: issuer ? buildWWWAuthenticateHeader(issuer) : undefined,
    };
  }

  // Delegate ALL validation to plugin (admin token AND JWTs)
  // Plugin's auth_validate_token handles both cases
  const result = await validateTokenWithCache(token);

  if (!result.authorized) {
    return {
      ...result,
      wwwAuthenticate: mode === 'oauth' && issuer ? buildWWWAuthenticateHeader(issuer) : undefined,
    };
  }

  return {
    authorized: true,
    user: result.user,
    isAdmin: result.user?.provider === 'admin_token',
  };
}

// Re-export UserContext for convenience
export type { UserContext } from './auth-oauth';
