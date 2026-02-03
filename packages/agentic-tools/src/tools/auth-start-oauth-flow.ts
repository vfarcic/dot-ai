/**
 * Auth Start OAuth Flow Tool
 *
 * PRD #360: User Authentication & Access Control - Milestone 2
 *
 * Initiates the OAuth 2.1 authorization flow with PKCE.
 * Returns the GitHub authorization URL that the client should redirect to.
 */

import { AuthTool, authSuccessResult, authErrorResult, withAuthValidation } from './auth-base';
import { generateCodeVerifier, computeCodeChallenge, generateState } from './auth-pkce';
import { storeOAuthFlowState } from './auth-state-store';

/**
 * GitHub OAuth authorization endpoint
 */
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

/**
 * Default GitHub OAuth scopes
 * - user:email: Read user's email addresses
 * - read:org: Read org membership (for allowed_orgs validation)
 */
const DEFAULT_GITHUB_SCOPES = 'user:email read:org';

/**
 * Input schema for auth_start_oauth_flow tool
 */
interface StartOAuthFlowInput {
  /** Redirect URI where GitHub will send the callback */
  redirect_uri: string;
  /** OAuth scopes to request (default: 'mcp:read mcp:write') */
  scope?: string;
  /** Issuer URL for JWT generation (MCP server base URL) */
  issuer: string;
}

/**
 * Output schema for auth_start_oauth_flow tool
 */
interface StartOAuthFlowOutput {
  /** Full GitHub authorization URL to redirect to */
  authorization_url: string;
  /** State parameter for this flow (also included in URL) */
  state: string;
}

/**
 * Build the GitHub authorization URL with all required parameters
 */
function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);

  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('response_type', 'code');

  return url.toString();
}

/**
 * auth_start_oauth_flow tool
 *
 * Initiates the OAuth 2.1 authorization flow with PKCE.
 * Generates state and PKCE parameters, stores them, and returns
 * the GitHub authorization URL.
 */
export const authStartOAuthFlow: AuthTool = {
  definition: {
    name: 'auth_start_oauth_flow',
    type: 'agentic',
    description:
      'Initiates the OAuth 2.1 authorization flow with PKCE. ' +
      'Returns a GitHub authorization URL that the client should redirect to. ' +
      'The state parameter must be preserved and sent back during the callback.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        redirect_uri: {
          type: 'string',
          description: 'The callback URL where GitHub will redirect after authorization',
        },
        scope: {
          type: 'string',
          description: 'OAuth scopes to request (default: mcp:read mcp:write)',
        },
        issuer: {
          type: 'string',
          description: 'The MCP server issuer URL (used for JWT generation)',
        },
      },
      required: ['redirect_uri', 'issuer'],
    },
  },

  handler: withAuthValidation(async (args: Record<string, unknown>) => {
    const input = args as unknown as StartOAuthFlowInput;

    // Validate required parameters
    if (!input.redirect_uri) {
      return authErrorResult('invalid_request', 'redirect_uri is required');
    }

    if (!input.issuer) {
      return authErrorResult('invalid_request', 'issuer is required');
    }

    // Validate redirect_uri is a valid URL
    try {
      new URL(input.redirect_uri);
    } catch {
      return authErrorResult('invalid_request', 'redirect_uri must be a valid URL');
    }

    // Get GitHub client ID from environment
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return authErrorResult(
        'server_error',
        'GitHub OAuth not configured. Set GITHUB_CLIENT_ID environment variable.'
      );
    }

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = computeCodeChallenge(codeVerifier);

    // Generate state for CSRF protection
    const state = generateState();

    // Determine scopes
    const mcpScope = input.scope || 'mcp:read mcp:write';

    // Store flow state for validation in callback
    storeOAuthFlowState(state, {
      codeVerifier,
      codeChallenge,
      redirectUri: input.redirect_uri,
      scope: mcpScope,
      issuer: input.issuer,
    });

    // Build authorization URL
    const authorizationUrl = buildAuthorizationUrl({
      clientId,
      redirectUri: input.redirect_uri,
      scope: DEFAULT_GITHUB_SCOPES,
      state,
      codeChallenge,
    });

    const output: StartOAuthFlowOutput = {
      authorization_url: authorizationUrl,
      state,
    };

    return authSuccessResult(output, 'OAuth flow initiated successfully');
  }),
};
