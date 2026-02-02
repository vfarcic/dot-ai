/**
 * Auth Tool: Validate Token
 *
 * PRD #360: User Authentication & Access Control
 *
 * Validates a JWT token and returns its claims.
 * This is a fallback mechanism - normally MCP server validates tokens
 * locally using the cached public key. This tool is called only if
 * local validation fails (e.g., key rotation scenario).
 */

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
}

export const authValidateToken: AuthTool = {
  definition: {
    name: 'auth_validate_token',
    type: 'agentic',
    description:
      'Validates a JWT token and returns its claims. ' +
      'Used as a fallback when MCP server cannot validate the token locally. ' +
      'If issuer and audience are provided, full validation is performed. ' +
      'If only the token is provided, only signature verification is performed.',
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'The JWT token to validate',
        },
        issuer: {
          type: 'string',
          description:
            'Expected issuer (MCP server URL). If provided, issuer claim will be validated.',
        },
        audience: {
          type: 'string',
          description:
            'Expected audience (resource identifier). If provided, audience claim will be validated.',
        },
      },
      required: ['token'],
    },
  },

  handler: withAuthValidation(async (args) => {
    const token = requireParam<string>(args, 'token', 'auth_validate_token');
    const issuer = optionalParam<string | undefined>(args, 'issuer', undefined);
    const audience = optionalParam<string | undefined>(args, 'audience', undefined);

    // Basic token format validation
    const parts = token.split('.');
    if (parts.length !== 3) {
      const result: TokenValidationResult = {
        valid: false,
        error: 'Invalid token format: JWT must have 3 parts (header.payload.signature)',
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
