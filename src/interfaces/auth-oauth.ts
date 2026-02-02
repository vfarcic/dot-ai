/**
 * OAuth Authentication Module for MCP Server
 *
 * PRD #360: User Authentication & Access Control
 *
 * Provides JWT validation using a public key fetched from the auth plugin.
 * The public key is cached at startup to enable local JWT validation
 * without per-request plugin calls.
 */

import * as jose from 'jose';
import { invokePluginTool, isPluginInitialized } from '../core/plugin-registry';
import { Logger, ConsoleLogger } from '../core/error-handling';

/**
 * JWK (JSON Web Key) format for RSA public key
 */
export interface JWKPublicKey {
  kty: 'RSA';
  n: string;
  e: string;
  alg: 'RS256';
  use: 'sig';
  kid: string;
}

/**
 * User context extracted from JWT claims
 */
export interface UserContext {
  /** User's unique identifier (sub claim) */
  id: string;
  /** User's display name */
  name?: string;
  /** User's email address */
  email?: string;
  /** OAuth provider used for authentication */
  provider?: string;
  /** Provider-specific user ID */
  providerId?: string;
  /** Scopes granted to this token */
  scopes?: string[];
}

/**
 * Result of OAuth token validation
 */
export interface OAuthAuthResult {
  authorized: boolean;
  message?: string;
  user?: UserContext;
}

/**
 * OAuth metadata types (RFC 9728 and RFC 8414)
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  scopes_supported: string[];
}

// Module state
let cachedPublicKey: jose.KeyLike | null = null;
let cachedKeyKid: string | null = null;
let keyFetchedAt: Date | null = null;
let initializationError: string | null = null;
let logger: Logger = new ConsoleLogger('auth-oauth');

/**
 * Initialize OAuth authentication by fetching the public key from the auth plugin.
 * Should be called once at startup after plugins are discovered.
 *
 * @param customLogger - Optional custom logger instance
 * @returns True if initialization succeeded, false otherwise
 */
export async function initializeOAuthAuth(customLogger?: Logger): Promise<boolean> {
  if (customLogger) {
    logger = customLogger;
  }

  // Check if plugin system is initialized
  if (!isPluginInitialized()) {
    logger.warn('Plugin system not initialized, OAuth auth will be unavailable');
    initializationError = 'Plugin system not initialized';
    return false;
  }

  try {
    logger.info('Fetching public key from auth plugin');

    const response = await invokePluginTool('agentic-tools', 'auth_get_public_key', {});

    if (!response.success) {
      const errorMsg = 'error' in response ? response.error.message : 'Unknown error';
      logger.error('Failed to fetch public key from plugin', new Error(errorMsg));
      initializationError = `Failed to fetch public key: ${errorMsg}`;
      return false;
    }

    // Parse the JWK from the plugin response
    const result = response.result as { success: boolean; data: string };
    if (!result.success) {
      logger.error('Plugin returned unsuccessful result', new Error('Plugin returned unsuccessful result'));
      initializationError = 'Plugin returned unsuccessful result';
      return false;
    }

    const jwkData: JWKPublicKey = typeof result.data === 'string'
      ? JSON.parse(result.data)
      : result.data;

    // Import the JWK as a KeyLike for jose
    cachedPublicKey = await jose.importJWK(jwkData, 'RS256') as jose.KeyLike;
    cachedKeyKid = jwkData.kid;
    keyFetchedAt = new Date();
    initializationError = null;

    logger.info('OAuth auth initialized successfully', {
      kid: cachedKeyKid,
      fetchedAt: keyFetchedAt.toISOString(),
    });

    return true;
  } catch (error) {
    const err = error as Error;
    logger.error('Error initializing OAuth auth', err);
    initializationError = `Initialization error: ${err.message}`;
    return false;
  }
}

/**
 * Check if OAuth authentication is initialized and ready
 */
export function isOAuthInitialized(): boolean {
  return cachedPublicKey !== null;
}

/**
 * Get the initialization error message if initialization failed
 */
export function getOAuthInitializationError(): string | null {
  return initializationError;
}

/**
 * Validate a JWT token using the cached public key
 *
 * @param token - JWT token to validate
 * @param expectedIssuer - Expected issuer (MCP server URL)
 * @param expectedAudience - Expected audience (resource identifier)
 * @returns Validation result with user context if successful
 */
export async function validateJWT(
  token: string,
  expectedIssuer?: string,
  expectedAudience?: string
): Promise<OAuthAuthResult> {
  if (!cachedPublicKey) {
    return {
      authorized: false,
      message: 'OAuth authentication not initialized',
    };
  }

  try {
    // Build verification options
    const options: jose.JWTVerifyOptions = {};
    if (expectedIssuer) {
      options.issuer = expectedIssuer;
    }
    if (expectedAudience) {
      options.audience = expectedAudience;
    }

    // Verify the token
    const { payload } = await jose.jwtVerify(token, cachedPublicKey, options);

    // Extract user context from claims
    const user: UserContext = {
      id: payload.sub as string,
      name: payload.name as string | undefined,
      email: payload.email as string | undefined,
      provider: payload.provider as string | undefined,
      providerId: payload.provider_id as string | undefined,
      scopes: payload.scope ? (payload.scope as string).split(' ') : undefined,
    };

    return {
      authorized: true,
      user,
    };
  } catch (error) {
    let message: string;

    if (error instanceof jose.errors.JWTExpired) {
      message = 'Token has expired';
    } else if (error instanceof jose.errors.JWTClaimValidationFailed) {
      message = `Token validation failed: ${error.message}`;
    } else if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      message = 'Token signature verification failed';
    } else {
      message = `Token validation failed: ${(error as Error).message}`;
    }

    logger.debug('JWT validation failed', { error: message });

    return {
      authorized: false,
      message,
    };
  }
}

/**
 * Fetch OAuth metadata from the auth plugin
 *
 * @param type - Type of metadata to fetch ('protected-resource' or 'authorization-server')
 * @param issuer - The issuer URL (MCP server base URL)
 * @returns Metadata object or null if fetch failed
 */
export async function fetchOAuthMetadata(
  type: 'protected-resource' | 'authorization-server',
  issuer: string
): Promise<ProtectedResourceMetadata | AuthorizationServerMetadata | null> {
  if (!isPluginInitialized()) {
    logger.warn('Plugin system not initialized, cannot fetch OAuth metadata');
    return null;
  }

  try {
    const response = await invokePluginTool('agentic-tools', 'auth_get_metadata', {
      type,
      issuer,
    });

    if (!response.success) {
      const errorMsg = 'error' in response ? response.error.message : 'Unknown error';
      logger.error('Failed to fetch OAuth metadata', new Error(errorMsg), { type });
      return null;
    }

    const result = response.result as { success: boolean; data: string };
    if (!result.success) {
      logger.error('Plugin returned unsuccessful metadata result', new Error('Unsuccessful result'));
      return null;
    }

    return typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
  } catch (error) {
    const err = error as Error;
    logger.error('Error fetching OAuth metadata', err, { type });
    return null;
  }
}

/**
 * Build the WWW-Authenticate header value for 401 responses
 * Per MCP Authorization spec, this should include resource_metadata URL
 *
 * @param issuer - The MCP server base URL
 * @returns WWW-Authenticate header value
 */
export function buildWWWAuthenticateHeader(issuer: string): string {
  const resourceMetadataUrl = `${issuer}/.well-known/oauth-protected-resource`;
  return `Bearer realm="${issuer}", resource_metadata="${resourceMetadataUrl}"`;
}

/**
 * Reset OAuth auth state (for testing only)
 * @internal
 */
export function resetOAuthAuth(): void {
  cachedPublicKey = null;
  cachedKeyKid = null;
  keyFetchedAt = null;
  initializationError = null;
}
