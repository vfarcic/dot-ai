/**
 * Auth Refresh Token Tool
 *
 * PRD #360: User Authentication & Access Control - Milestone 2
 *
 * Exchanges a refresh token for a new access token.
 * Implements refresh token rotation for security.
 */

import { AuthTool, authSuccessResult, authErrorResult, withAuthValidation, signJWT } from './auth-base';
import {
  getRefreshTokenData,
  generateRefreshToken,
  storeRefreshToken,
  rotateRefreshToken,
} from './auth-refresh-store';

/**
 * Access token TTL (1 hour)
 */
const ACCESS_TOKEN_TTL = '1h';

/**
 * Input schema for auth_refresh_token tool
 */
interface RefreshTokenInput {
  /** The refresh token from a previous authentication */
  refresh_token: string;
  /** Optional: request reduced scopes */
  scope?: string;
}

/**
 * Output schema for auth_refresh_token tool
 */
interface RefreshTokenOutput {
  /** New JWT access token */
  access_token: string;
  /** Token type (always 'Bearer') */
  token_type: 'Bearer';
  /** Seconds until expiration */
  expires_in: number;
  /** New refresh token (old one is invalidated) */
  refresh_token: string;
  /** Granted scopes */
  scope: string;
}

/**
 * auth_refresh_token tool
 *
 * Exchanges a refresh token for a new access token.
 * The old refresh token is rotated (invalidated) and a new one is issued.
 */
export const authRefreshToken: AuthTool = {
  definition: {
    name: 'auth_refresh_token',
    type: 'agentic',
    description:
      'Exchanges a refresh token for a new access token. ' +
      'The old refresh token is invalidated and a new one is issued (rotation).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        refresh_token: {
          type: 'string',
          description: 'The refresh token from a previous authentication',
        },
        scope: {
          type: 'string',
          description: 'Optional: request reduced scopes (cannot exceed original scopes)',
        },
      },
      required: ['refresh_token'],
    },
  },

  handler: withAuthValidation(async (args: Record<string, unknown>) => {
    const input = args as unknown as RefreshTokenInput;

    // Validate required parameters
    if (!input.refresh_token) {
      return authErrorResult('invalid_request', 'refresh_token is required');
    }

    // Retrieve refresh token data
    const tokenData = getRefreshTokenData(input.refresh_token);
    if (!tokenData) {
      return authErrorResult('invalid_grant', 'Invalid or expired refresh token');
    }

    // Determine scopes
    // If scope is requested, it must be a subset of the original scope
    let scope = tokenData.claims.scope || 'mcp:read mcp:write';
    if (input.scope) {
      const originalScopes = scope.split(' ');
      const requestedScopes = input.scope.split(' ');
      const invalidScopes = requestedScopes.filter((s) => !originalScopes.includes(s));

      if (invalidScopes.length > 0) {
        return authErrorResult(
          'invalid_scope',
          `Requested scopes exceed original grant: ${invalidScopes.join(', ')}`
        );
      }

      scope = input.scope;
    }

    // Build JWT claims with updated scope
    const claims = {
      ...tokenData.claims,
      scope,
    };

    // Sign new JWT
    const accessToken = await signJWT(claims, ACCESS_TOKEN_TTL);

    // Rotate the old refresh token (mark as used)
    rotateRefreshToken(input.refresh_token);

    // Generate and store new refresh token
    const newRefreshToken = generateRefreshToken();
    storeRefreshToken(newRefreshToken, claims);

    // Calculate expires_in (1 hour = 3600 seconds)
    const expiresIn = 3600;

    const output: RefreshTokenOutput = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope,
    };

    return authSuccessResult(output, 'Token refresh successful');
  }),
};
