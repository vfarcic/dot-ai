/**
 * Auth Tool: Test Provider
 *
 * PRD #360: User Authentication & Access Control - Milestone 3
 *
 * Provides a test provider for integration testing.
 * Issues JWTs without browser flow, using the same signing code as GitHub provider.
 * Uses the same access control (GITHUB_ALLOWED_USERS/ORGS) as the real provider.
 * Only enabled when DOT_AI_AUTH_TEST_MODE=true.
 */

import { AuthTool, authSuccessResult, authErrorResult, withAuthValidation, signJWT } from './auth-base';
import { generateRefreshToken, storeRefreshToken } from './auth-refresh-store';

/**
 * Access token TTL (1 hour) - same as GitHub provider
 */
const ACCESS_TOKEN_TTL = '1h';

/**
 * Input schema for auth_get_test_token tool
 */
interface GetTestTokenInput {
  /** Test user ID (e.g., 'vfarcic') - must be in GITHUB_ALLOWED_USERS if configured */
  user_id: string;
  /** Test user name (optional) */
  name?: string;
  /** Test user email (optional) */
  email?: string;
  /** Scopes to grant (optional, defaults to 'mcp:read mcp:write') */
  scope?: string;
}

/**
 * Output schema for auth_get_test_token tool
 */
interface GetTestTokenOutput {
  /** JWT access token issued by dot-ai */
  access_token: string;
  /** Token type (always 'Bearer') */
  token_type: 'Bearer';
  /** Seconds until expiration */
  expires_in: number;
  /** Refresh token for obtaining new access tokens */
  refresh_token: string;
  /** Granted scopes */
  scope: string;
}

/**
 * Check if test mode is enabled
 */
function isTestModeEnabled(): boolean {
  return process.env.DOT_AI_AUTH_TEST_MODE === 'true';
}

/**
 * Get issuer URL from environment
 */
function getIssuer(): string {
  return process.env.DOT_AI_AUTH_ISSUER || 'http://localhost:3000';
}

/**
 * Check if user is in allowed users list (same as GitHub provider)
 */
function isUserAllowed(userId: string): { allowed: boolean; reason?: string } {
  const allowedUsersEnv = process.env.GITHUB_ALLOWED_USERS;

  // No restriction configured - allow all
  if (!allowedUsersEnv) {
    return { allowed: true };
  }

  const allowedUsers = allowedUsersEnv.split(',').map((u) => u.trim()).filter((u) => u);

  // Empty after parsing - allow all
  if (allowedUsers.length === 0) {
    return { allowed: true };
  }

  // Check if user is in allowlist
  const isAllowed = allowedUsers.some((allowed) => allowed.toLowerCase() === userId.toLowerCase());

  if (isAllowed) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `User '${userId}' is not in GITHUB_ALLOWED_USERS: ${allowedUsers.join(', ')}`,
  };
}

/**
 * auth_get_test_token tool
 *
 * Issues a JWT for a test user without browser flow.
 * Only available when DOT_AI_AUTH_TEST_MODE=true.
 * Uses the same JWT signing code and access control as the GitHub provider.
 */
export const authGetTestToken: AuthTool = {
  definition: {
    name: 'auth_get_test_token',
    type: 'agentic',
    description:
      'Issues a JWT for a test user without browser flow. ' +
      'Only available when DOT_AI_AUTH_TEST_MODE=true. ' +
      'Uses the same access control (GITHUB_ALLOWED_USERS) and JWT signing as the GitHub provider.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        user_id: {
          type: 'string',
          description: 'User ID - must be in GITHUB_ALLOWED_USERS if configured',
        },
        name: {
          type: 'string',
          description: 'User display name (optional)',
        },
        email: {
          type: 'string',
          description: 'User email (optional)',
        },
        scope: {
          type: 'string',
          description: 'Scopes to grant (optional, defaults to "mcp:read mcp:write")',
        },
      },
      required: ['user_id'],
    },
  },

  handler: withAuthValidation(async (args: Record<string, unknown>) => {
    // Check if test mode is enabled
    if (!isTestModeEnabled()) {
      return authErrorResult(
        'test_mode_disabled',
        'Test provider is only available when DOT_AI_AUTH_TEST_MODE=true'
      );
    }

    const input = args as unknown as GetTestTokenInput;

    // Validate required parameters
    if (!input.user_id) {
      return authErrorResult('invalid_request', 'user_id is required');
    }

    // Check access control - same rules as GitHub provider
    const accessCheck = isUserAllowed(input.user_id);
    if (!accessCheck.allowed) {
      return authErrorResult('access_denied', accessCheck.reason || 'Access denied');
    }

    const issuer = getIssuer();
    const scope = input.scope || 'mcp:read mcp:write';

    // Build JWT claims - same structure as GitHub provider
    const claims = {
      sub: `test:${input.user_id}`,
      iss: issuer,
      aud: issuer,
      name: input.name || input.user_id,
      email: input.email || `${input.user_id}@test.local`,
      provider: 'test',
      provider_id: input.user_id,
      scope,
    };

    // Sign JWT using the same code as GitHub provider
    const accessToken = await signJWT(claims, ACCESS_TOKEN_TTL);

    // Generate and store refresh token (same as GitHub provider)
    const refreshToken = generateRefreshToken();
    storeRefreshToken(refreshToken, claims);

    // Calculate expires_in (1 hour = 3600 seconds)
    const expiresIn = 3600;

    const output: GetTestTokenOutput = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope,
    };

    return authSuccessResult(output, 'Test token issued successfully');
  }),
};
