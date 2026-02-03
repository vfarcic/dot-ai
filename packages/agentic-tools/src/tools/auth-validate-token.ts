/**
 * Auth Tool: Validate Token
 *
 * PRD #360: User Authentication & Access Control
 *
 * Validates ANY token (admin token OR JWT) and returns user claims.
 * This is the PRIMARY validation method - MCP has zero auth logic and
 * delegates all validation to this tool (with caching).
 *
 * Validation order:
 * 1. Check if token matches admin token → return admin user
 * 2. Check if token is a valid JWT → return user claims
 * 3. Otherwise → return invalid
 */

import { timingSafeEqual } from 'node:crypto';
import { requireParam, optionalParam } from './base';
import {
  AuthTool,
  verifyJWT,
  verifyJWTSignatureOnly,
  authSuccessResult,
  authErrorResult,
  withAuthValidation,
  JWTClaims,
} from './auth-base';

/**
 * Token validation result
 */
interface TokenValidationResult {
  valid: boolean;
  claims?: JWTClaims;
  error?: string;
  /** Whether this is an admin token (vs user JWT) */
  isAdmin?: boolean;
}

/**
 * Get admin token from environment
 */
function getAdminToken(): string | null {
  return process.env.DOT_AI_AUTH_ADMIN_TOKEN || process.env.DOT_AI_AUTH_TOKEN || null;
}

/**
 * Check if token matches admin token using constant-time comparison
 */
function isAdminToken(token: string): boolean {
  const adminToken = getAdminToken();
  if (!adminToken) {
    return false;
  }

  const adminBuffer = Buffer.from(adminToken, 'utf8');
  const tokenBuffer = Buffer.from(token, 'utf8');

  // If lengths differ, not a match
  if (adminBuffer.length !== tokenBuffer.length) {
    // Perform dummy comparison to maintain constant time
    timingSafeEqual(adminBuffer, adminBuffer);
    return false;
  }

  return timingSafeEqual(adminBuffer, tokenBuffer);
}

/**
 * Create admin user claims
 */
function createAdminClaims(): JWTClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: 'admin',
    iss: 'dot-ai',
    aud: 'dot-ai',
    exp: now + 3600, // 1 hour from now (for cache TTL)
    iat: now,
    jti: `admin-${now}`,
    name: 'Admin',
    provider: 'admin_token',
  };
}

export const authValidateToken: AuthTool = {
  definition: {
    name: 'auth_validate_token',
    type: 'agentic',
    description:
      'Validates ANY token (admin token OR JWT) and returns user claims. ' +
      'This is the primary validation method - MCP delegates all auth to this tool. ' +
      'Checks admin token first, then JWT validation.',
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'The token to validate (admin token or JWT)',
        },
        issuer: {
          type: 'string',
          description:
            'Expected issuer (MCP server URL). Used for JWT validation.',
        },
        audience: {
          type: 'string',
          description:
            'Expected audience (resource identifier). Used for JWT validation.',
        },
      },
      required: ['token'],
    },
  },

  handler: withAuthValidation(async (args) => {
    const token = requireParam<string>(args, 'token', 'auth_validate_token');
    const issuer = optionalParam<string | undefined>(args, 'issuer', undefined);
    const audience = optionalParam<string | undefined>(args, 'audience', undefined);

    // PRIORITY 1: Check if this is the admin token
    if (isAdminToken(token)) {
      const result: TokenValidationResult = {
        valid: true,
        claims: createAdminClaims(),
        isAdmin: true,
      };
      return authSuccessResult(result, 'Admin token validated successfully');
    }

    // PRIORITY 2: Try JWT validation
    // Basic token format validation for JWT
    const parts = token.split('.');
    if (parts.length !== 3) {
      const result: TokenValidationResult = {
        valid: false,
        error: 'Invalid token: not an admin token and not a valid JWT format',
      };
      return authSuccessResult(result, 'Token validation failed');
    }

    try {
      let claims: JWTClaims | null;

      if (issuer && audience) {
        // Full validation with issuer and audience checks
        claims = await verifyJWT(token, issuer, audience);
      } else {
        // Signature-only validation
        claims = await verifyJWTSignatureOnly(token);
        if (!claims) {
          const result: TokenValidationResult = {
            valid: false,
            error: 'Token signature verification failed',
          };
          return authSuccessResult(result, 'Token validation failed');
        }
      }

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (claims.exp && claims.exp < now) {
        const result: TokenValidationResult = {
          valid: false,
          error: 'Token has expired',
          claims, // Include claims even though expired, for debugging
        };
        return authSuccessResult(result, 'Token validation failed: expired');
      }

      const result: TokenValidationResult = {
        valid: true,
        claims,
        isAdmin: false,
      };
      return authSuccessResult(result, 'Token validated successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const result: TokenValidationResult = {
        valid: false,
        error: errorMessage,
      };
      return authSuccessResult(result, `Token validation failed: ${errorMessage}`);
    }
  }),
};
