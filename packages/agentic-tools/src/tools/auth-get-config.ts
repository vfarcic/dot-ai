/**
 * Auth Tool: Get Config
 *
 * PRD #360: User Authentication & Access Control - Milestone 3
 *
 * Returns the complete auth configuration from the plugin.
 * MCP server calls this at startup to get auth settings.
 * Plugin is the single source of truth for all auth configuration.
 */

import { AuthTool, authSuccessResult, authErrorResult, withAuthValidation } from './auth-base';

/**
 * Auth mode: 'none' (admin token only) or 'oauth' (admin token + OAuth)
 */
export type AuthMode = 'none' | 'oauth';

/**
 * Auth configuration returned by this tool
 */
export interface AuthConfig {
  /** Auth mode: 'none' or 'oauth' */
  mode: AuthMode;
  /** Admin bypass token (always works in both modes) */
  admin_token: string;
  /** Issuer URL for JWT tokens */
  issuer: string;
  /** Whether test mode is enabled (allows test provider) */
  test_mode_enabled: boolean;
}

/**
 * Get auth mode from environment
 */
function getAuthMode(): AuthMode {
  const mode = process.env.DOT_AI_AUTH_MODE?.toLowerCase();
  if (mode === 'oauth') {
    return 'oauth';
  }
  return 'none';
}

/**
 * Get admin token from environment
 */
function getAdminToken(): string {
  return process.env.DOT_AI_AUTH_ADMIN_TOKEN || process.env.DOT_AI_AUTH_TOKEN || '';
}

/**
 * Get issuer URL from environment
 */
function getIssuer(): string {
  return process.env.DOT_AI_AUTH_ISSUER || 'http://localhost:3000';
}

/**
 * Check if test mode is enabled
 */
function isTestModeEnabled(): boolean {
  return process.env.DOT_AI_AUTH_TEST_MODE === 'true';
}

/**
 * auth_get_config tool
 *
 * Returns the complete auth configuration from the plugin.
 * This makes the plugin the single source of truth for auth config.
 */
export const authGetConfig: AuthTool = {
  definition: {
    name: 'auth_get_config',
    type: 'agentic',
    description:
      'Returns the complete auth configuration from the plugin. ' +
      'MCP server calls this at startup to get auth settings. ' +
      'Plugin is the single source of truth for all auth configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  handler: withAuthValidation(async () => {
    try {
      const adminToken = getAdminToken();

      if (!adminToken) {
        return authErrorResult(
          'configuration_error',
          'DOT_AI_AUTH_ADMIN_TOKEN or DOT_AI_AUTH_TOKEN must be set'
        );
      }

      const config: AuthConfig = {
        mode: getAuthMode(),
        admin_token: adminToken,
        issuer: getIssuer(),
        test_mode_enabled: isTestModeEnabled(),
      };

      return authSuccessResult(config, 'Auth config retrieved successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return authErrorResult(message, 'Failed to retrieve auth config');
    }
  }),
};
