/**
 * Base utilities for auth tools
 *
 * PRD #360: User Authentication & Access Control
 *
 * Provides RSA key pair management, JWT signing/verification, and
 * common utilities for auth tool implementations.
 */

import * as jose from 'jose';
import { ToolDefinition } from '../types';
import { ToolResult, ValidationError } from './base';

/**
 * JWT claims structure for dot-ai tokens
 */
export interface JWTClaims {
  /** Subject - user identifier */
  sub: string;
  /** Issuer - MCP server URL */
  iss: string;
  /** Audience - resource identifier */
  aud: string;
  /** Expiration time (Unix timestamp) */
  exp: number;
  /** Issued at (Unix timestamp) */
  iat: number;
  /** JWT ID - unique token identifier */
  jti: string;
  /** User's display name */
  name?: string;
  /** User's email address */
  email?: string;
  /** OAuth provider (e.g., 'github', 'google') */
  provider?: string;
  /** Provider-specific user ID */
  provider_id?: string;
  /** Scopes granted to this token */
  scope?: string;
}

/**
 * JWK (JSON Web Key) public key format
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
 * Self-contained auth tool definition
 * Combines the tool definition (for describe hook) with its handler (for invoke hook)
 */
export interface AuthTool {
  /** Tool definition for the describe hook */
  definition: ToolDefinition;
  /** Handler function for the invoke hook */
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Key pair storage (in-memory for MVP)
 * In production, consider persisting to Kubernetes Secret
 */
interface KeyPairStorage {
  privateKey: jose.KeyLike;
  publicKey: jose.KeyLike;
  publicKeyJWK: JWKPublicKey;
  kid: string;
  createdAt: Date;
}

let keyPairStorage: KeyPairStorage | null = null;

/**
 * Get or create the RSA key pair for JWT signing
 * Keys are generated once and cached in memory
 */
export async function getOrCreateKeyPair(): Promise<KeyPairStorage> {
  if (keyPairStorage) {
    return keyPairStorage;
  }

  // Generate RS256 (RSA with SHA-256) key pair
  const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
    modulusLength: 2048,
  });

  // Generate a unique key ID based on timestamp
  const kid = `dot-ai-auth-key-${Date.now()}`;

  // Export public key to JWK format
  const jwk = await jose.exportJWK(publicKey);

  const publicKeyJWK: JWKPublicKey = {
    kty: 'RSA',
    n: jwk.n as string,
    e: jwk.e as string,
    alg: 'RS256',
    use: 'sig',
    kid,
  };

  keyPairStorage = {
    privateKey,
    publicKey,
    publicKeyJWK,
    kid,
    createdAt: new Date(),
  };

  return keyPairStorage;
}

/**
 * Get the public key in JWK format
 * Used by MCP server to cache the key for local JWT validation
 */
export async function getPublicKeyJWK(): Promise<JWKPublicKey> {
  const keyPair = await getOrCreateKeyPair();
  return keyPair.publicKeyJWK;
}

/**
 * Sign a JWT with the plugin's private key
 *
 * @param claims - JWT claims to include in the token
 * @param expiresIn - Token expiration time (e.g., '1h', '7d')
 * @returns Signed JWT string
 */
export async function signJWT(
  claims: Omit<JWTClaims, 'iat' | 'exp' | 'jti'>,
  expiresIn: string = '1h'
): Promise<string> {
  const keyPair = await getOrCreateKeyPair();

  const jwt = await new jose.SignJWT({
    name: claims.name,
    email: claims.email,
    provider: claims.provider,
    provider_id: claims.provider_id,
    scope: claims.scope,
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyPair.kid })
    .setSubject(claims.sub)
    .setIssuer(claims.iss)
    .setAudience(claims.aud)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setJti(generateJTI())
    .sign(keyPair.privateKey);

  return jwt;
}

/**
 * Verify a JWT and return its claims
 *
 * @param token - JWT string to verify
 * @param expectedIssuer - Expected issuer (MCP server URL)
 * @param expectedAudience - Expected audience (resource identifier)
 * @returns Verified JWT claims
 * @throws Error if token is invalid, expired, or claims don't match
 */
export async function verifyJWT(
  token: string,
  expectedIssuer: string,
  expectedAudience: string
): Promise<JWTClaims> {
  const keyPair = await getOrCreateKeyPair();

  try {
    const { payload } = await jose.jwtVerify(token, keyPair.publicKey, {
      issuer: expectedIssuer,
      audience: expectedAudience,
    });

    return {
      sub: payload.sub as string,
      iss: payload.iss as string,
      aud: payload.aud as string,
      exp: payload.exp as number,
      iat: payload.iat as number,
      jti: payload.jti as string,
      name: payload.name as string | undefined,
      email: payload.email as string | undefined,
      provider: payload.provider as string | undefined,
      provider_id: payload.provider_id as string | undefined,
      scope: payload.scope as string | undefined,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw new Error('Token has expired');
    }
    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      throw new Error(`Token validation failed: ${error.message}`);
    }
    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      throw new Error('Token signature verification failed');
    }
    throw new Error(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verify a JWT without checking issuer/audience (for fallback validation)
 * Returns claims if signature is valid, regardless of other claims
 *
 * @param token - JWT string to verify
 * @returns Verified JWT claims or null if invalid
 */
export async function verifyJWTSignatureOnly(token: string): Promise<JWTClaims | null> {
  const keyPair = await getOrCreateKeyPair();

  try {
    const { payload } = await jose.jwtVerify(token, keyPair.publicKey);

    return {
      sub: payload.sub as string,
      iss: payload.iss as string,
      aud: payload.aud as string,
      exp: payload.exp as number,
      iat: payload.iat as number,
      jti: payload.jti as string,
      name: payload.name as string | undefined,
      email: payload.email as string | undefined,
      provider: payload.provider as string | undefined,
      provider_id: payload.provider_id as string | undefined,
      scope: payload.scope as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a unique JWT ID (jti claim)
 */
function generateJTI(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
}

/**
 * OAuth metadata types
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

/**
 * Default scopes supported by dot-ai
 */
export const SUPPORTED_SCOPES = ['mcp:read', 'mcp:write', 'mcp:admin'];

/**
 * Generate Protected Resource Metadata (RFC 9728)
 */
export function generateProtectedResourceMetadata(issuer: string): ProtectedResourceMetadata {
  return {
    resource: issuer,
    authorization_servers: [issuer],
    scopes_supported: SUPPORTED_SCOPES,
  };
}

/**
 * Generate Authorization Server Metadata (RFC 8414)
 */
export function generateAuthorizationServerMetadata(issuer: string): AuthorizationServerMetadata {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: SUPPORTED_SCOPES,
  };
}

/**
 * Create a successful auth tool result
 */
export function authSuccessResult(data: unknown, message: string): ToolResult {
  return {
    success: true,
    data: typeof data === 'string' ? data : JSON.stringify(data),
    message,
  };
}

/**
 * Create an error auth tool result
 */
export function authErrorResult(error: string, message: string): ToolResult {
  return {
    success: false,
    error,
    message,
  };
}

/**
 * Wrap an auth tool handler to catch errors and return proper error results
 */
export function withAuthValidation(
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
): (args: Record<string, unknown>) => Promise<ToolResult> {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof ValidationError) {
        return authErrorResult(
          `Missing required parameter: ${error.param}`,
          `${error.toolName} requires parameter: ${error.param}`
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      return authErrorResult(message, `Auth operation failed: ${message}`);
    }
  };
}

/**
 * Reset key pair storage (for testing only)
 * @internal
 */
export function resetKeyPairStorage(): void {
  keyPairStorage = null;
}
