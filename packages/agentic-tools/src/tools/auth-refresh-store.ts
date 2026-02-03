/**
 * Refresh Token Store
 *
 * PRD #360: User Authentication & Access Control - Milestone 2
 *
 * In-memory store for refresh tokens. Each refresh token maps to
 * stored user claims that can be used to issue new access tokens.
 *
 * Refresh tokens are hashed before storage for security.
 * Tokens expire after 7 days by default.
 *
 * In production, this could be replaced with Redis or a database
 * for persistence and multi-replica deployments.
 */

import { createHash, randomBytes } from 'crypto';
import { JWTClaims } from './auth-base';

/**
 * Refresh token data stored in the store
 */
export interface RefreshTokenData {
  /** SHA256 hash of the actual token (we don't store plaintext) */
  tokenHash: string;
  /** User ID (e.g., 'github:12345') */
  userId: string;
  /** Stored claims for reissuing access tokens */
  claims: Omit<JWTClaims, 'exp' | 'iat' | 'jti'>;
  /** When this refresh token was created */
  createdAt: Date;
  /** When this refresh token expires */
  expiresAt: Date;
  /** Whether this token has been rotated (used and replaced) */
  rotated: boolean;
}

/**
 * Default TTL for refresh tokens (7 days)
 */
const DEFAULT_REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cleanup interval (1 hour)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * In-memory store for refresh tokens
 * Key: token hash
 * Value: RefreshTokenData
 */
const tokenStore = new Map<string, RefreshTokenData>();

/**
 * Cleanup timer reference
 */
let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Start periodic cleanup of expired tokens
 */
function startCleanupTimer(): void {
  if (cleanupTimer) {
    return;
  }

  cleanupTimer = setInterval(() => {
    cleanupExpiredTokens();
  }, CLEANUP_INTERVAL_MS);

  // Don't prevent process exit
  cleanupTimer.unref();
}

/**
 * Stop periodic cleanup (for testing)
 */
export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Remove expired and rotated tokens from the store
 */
function cleanupExpiredTokens(): void {
  const now = new Date();
  for (const [hash, data] of tokenStore.entries()) {
    if (data.expiresAt < now || data.rotated) {
      tokenStore.delete(hash);
    }
  }
}

/**
 * Hash a refresh token for storage
 *
 * @param token - The plaintext refresh token
 * @returns SHA256 hash of the token
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a new refresh token
 *
 * @returns A cryptographically random refresh token (64 hex characters)
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Store a refresh token
 *
 * @param token - The plaintext refresh token
 * @param claims - The JWT claims to store for reissue
 * @param ttlMs - Optional TTL in milliseconds (default: 7 days)
 */
export function storeRefreshToken(
  token: string,
  claims: Omit<JWTClaims, 'exp' | 'iat' | 'jti'>,
  ttlMs: number = DEFAULT_REFRESH_TOKEN_TTL_MS
): void {
  // Start cleanup timer on first store
  startCleanupTimer();

  const tokenHash = hashToken(token);
  const now = new Date();

  tokenStore.set(tokenHash, {
    tokenHash,
    userId: claims.sub,
    claims,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
    rotated: false,
  });
}

/**
 * Retrieve refresh token data
 *
 * @param token - The plaintext refresh token
 * @returns The token data if found and valid, null otherwise
 */
export function getRefreshTokenData(token: string): RefreshTokenData | null {
  const tokenHash = hashToken(token);
  const data = tokenStore.get(tokenHash);

  if (!data) {
    return null;
  }

  // Check if expired
  if (data.expiresAt < new Date()) {
    tokenStore.delete(tokenHash);
    return null;
  }

  // Check if already rotated (used)
  if (data.rotated) {
    // Token reuse detected - potential token theft
    // Delete the token and return null
    tokenStore.delete(tokenHash);
    return null;
  }

  return data;
}

/**
 * Mark a refresh token as rotated (used)
 * The old token will no longer be valid.
 *
 * @param token - The plaintext refresh token to rotate
 */
export function rotateRefreshToken(token: string): void {
  const tokenHash = hashToken(token);
  const data = tokenStore.get(tokenHash);

  if (data) {
    data.rotated = true;
  }
}

/**
 * Revoke a refresh token
 *
 * @param token - The plaintext refresh token to revoke
 * @returns True if the token was found and revoked
 */
export function revokeRefreshToken(token: string): boolean {
  const tokenHash = hashToken(token);
  return tokenStore.delete(tokenHash);
}

/**
 * Revoke all refresh tokens for a user
 *
 * @param userId - The user ID to revoke tokens for
 * @returns Number of tokens revoked
 */
export function revokeUserRefreshTokens(userId: string): number {
  let count = 0;
  for (const [hash, data] of tokenStore.entries()) {
    if (data.userId === userId) {
      tokenStore.delete(hash);
      count++;
    }
  }
  return count;
}

/**
 * Clear all refresh tokens (for testing)
 */
export function clearRefreshTokens(): void {
  tokenStore.clear();
}

/**
 * Get the number of stored tokens (for testing/monitoring)
 */
export function getRefreshTokenCount(): number {
  return tokenStore.size;
}
