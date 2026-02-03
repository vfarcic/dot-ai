/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.1
 *
 * PRD #360: User Authentication & Access Control - Milestone 2
 *
 * Implements RFC 7636 PKCE with S256 code challenge method.
 * Used to prevent authorization code interception attacks.
 */

import { createHash, randomBytes } from 'crypto';

/**
 * Generate a cryptographically random code verifier
 *
 * Per RFC 7636, the code verifier must be:
 * - 43-128 characters long
 * - Use only unreserved characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 *
 * We use base64url encoding (no padding) which satisfies these requirements.
 *
 * @returns A random code verifier string (43-128 chars)
 */
export function generateCodeVerifier(): string {
  // 32 bytes = 43 base64url characters (without padding)
  // This is the minimum length per RFC 7636
  const buffer = randomBytes(32);
  return base64UrlEncode(buffer);
}

/**
 * Compute the S256 code challenge from a code verifier
 *
 * Per RFC 7636:
 * code_challenge = BASE64URL(SHA256(code_verifier))
 *
 * @param codeVerifier - The code verifier to hash
 * @returns The S256 code challenge
 */
export function computeCodeChallenge(codeVerifier: string): string {
  const hash = createHash('sha256').update(codeVerifier, 'ascii').digest();
  return base64UrlEncode(hash);
}

/**
 * Generate a cryptographically random state parameter
 *
 * The state parameter is used for CSRF protection and to maintain
 * state between the authorization request and callback.
 *
 * @returns A random state string (32 bytes, base64url encoded = 43 chars)
 */
export function generateState(): string {
  const buffer = randomBytes(32);
  return base64UrlEncode(buffer);
}

/**
 * Verify that a code challenge matches a code verifier
 *
 * @param codeVerifier - The original code verifier
 * @param codeChallenge - The code challenge to verify
 * @param method - The code challenge method (only 'S256' supported)
 * @returns True if the challenge matches
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: 'S256' = 'S256'
): boolean {
  if (method !== 'S256') {
    throw new Error(`Unsupported code challenge method: ${method}`);
  }

  const expectedChallenge = computeCodeChallenge(codeVerifier);
  return constantTimeCompare(expectedChallenge, codeChallenge);
}

/**
 * Base64url encode a buffer without padding
 *
 * Per RFC 4648 Section 5, base64url uses:
 * - '+' replaced with '-'
 * - '/' replaced with '_'
 * - No padding ('=')
 *
 * @param buffer - The buffer to encode
 * @returns Base64url encoded string without padding
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Constant-time string comparison to prevent timing attacks
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }

  return result === 0;
}
