/**
 * JWT signing and verification using node:crypto HMAC-SHA256.
 *
 * No external libraries — implements the minimal JWT subset needed
 * for dot-ai access tokens (HS256 only).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { JwtClaims } from './types';

const JWT_HEADER = Buffer.from(
  JSON.stringify({ alg: 'HS256', typ: 'JWT' })
).toString('base64url');

/** Cached auto-generated secret (per-process). */
let cachedSecret: string | undefined;

/**
 * Returns the JWT signing secret.
 * Uses DOT_AI_JWT_SECRET env var if set, otherwise generates
 * a random 32-byte hex secret cached for the process lifetime.
 */
export function getJwtSecret(): string {
  const envSecret = process.env.DOT_AI_JWT_SECRET;
  if (envSecret) {
    return envSecret;
  }
  if (!cachedSecret) {
    cachedSecret = randomBytes(32).toString('hex');
  }
  return cachedSecret;
}

/**
 * Reset the cached secret. Only for testing.
 * @internal
 */
export function _resetCachedSecret(): void {
  cachedSecret = undefined;
}

/**
 * Sign a JWT with HMAC-SHA256.
 *
 * @param claims - The JWT payload claims
 * @param secret - The signing secret
 * @returns Encoded JWT string (header.payload.signature)
 */
export function signJwt(claims: JwtClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = `${JWT_HEADER}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verify a JWT signed with HMAC-SHA256.
 *
 * Performs timing-safe signature comparison and expiry check.
 *
 * @param token - The JWT string to verify
 * @param secret - The signing secret
 * @returns Decoded claims if valid, null otherwise
 */
export function verifyJwt(token: string, secret: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;

  // Recompute expected signature
  const data = `${header}.${payload}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(data)
    .digest('base64url');

  // Timing-safe comparison
  const sigBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

  if (sigBuffer.length !== expectedBuffer.length) {
    // Dummy comparison to maintain constant time
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return null;
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  // Decode and validate claims
  let claims: JwtClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // Validate identity claims
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    return null;
  }
  if (claims.groups !== undefined && !Array.isArray(claims.groups)) {
    return null;
  }

  // Check expiration (strict: exp === now is treated as expired)
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) {
    return null;
  }

  return claims;
}
