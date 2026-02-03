/**
 * Auth Exchange Code Tool
 *
 * PRD #360: User Authentication & Access Control - Milestone 2
 *
 * Exchanges a GitHub authorization code for a dot-ai JWT.
 * Fetches GitHub user info and validates org membership if configured.
 */

import { AuthTool, authSuccessResult, authErrorResult, withAuthValidation, signJWT } from './auth-base';
import { getOAuthFlowState, deleteOAuthFlowState } from './auth-state-store';
import { generateRefreshToken, storeRefreshToken } from './auth-refresh-store';

/**
 * GitHub OAuth token endpoint
 */
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/**
 * GitHub API base URL
 */
const GITHUB_API_URL = 'https://api.github.com';

/**
 * Access token TTL (1 hour)
 */
const ACCESS_TOKEN_TTL = '1h';

/**
 * Input schema for auth_exchange_code tool
 */
interface ExchangeCodeInput {
  /** Authorization code from GitHub callback */
  code: string;
  /** State parameter from the original authorization request */
  state: string;
  /** Redirect URI (must match the original request) */
  redirect_uri: string;
}

/**
 * Output schema for auth_exchange_code tool
 */
interface ExchangeCodeOutput {
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
 * GitHub user info from /user endpoint
 */
interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

/**
 * GitHub email from /user/emails endpoint
 */
interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

/**
 * GitHub org from /user/orgs endpoint
 */
interface GitHubOrg {
  login: string;
  id: number;
}

/**
 * Exchange authorization code for GitHub access token
 */
async function exchangeCodeForGitHubToken(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ access_token: string; token_type: string; scope: string } | { error: string; error_description: string }> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { error: 'server_error', error_description: 'GitHub OAuth not configured' };
  }

  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  return response.json() as Promise<{ access_token: string; token_type: string; scope: string } | { error: string; error_description: string }>;
}

/**
 * Fetch GitHub user info
 */
async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub user: ${response.status}`);
  }

  return response.json() as Promise<GitHubUser>;
}

/**
 * Fetch GitHub user emails
 */
async function fetchGitHubEmails(accessToken: string): Promise<GitHubEmail[]> {
  const response = await fetch(`${GITHUB_API_URL}/user/emails`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    // Email scope might not be granted
    return [];
  }

  return response.json() as Promise<GitHubEmail[]>;
}

/**
 * Fetch GitHub user organizations
 */
async function fetchGitHubOrgs(accessToken: string): Promise<GitHubOrg[]> {
  const response = await fetch(`${GITHUB_API_URL}/user/orgs`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    // Org scope might not be granted
    return [];
  }

  return response.json() as Promise<GitHubOrg[]>;
}

/**
 * Get the primary verified email from the list
 */
function getPrimaryEmail(emails: GitHubEmail[], fallbackEmail: string | null): string | undefined {
  // First, try to find a primary verified email
  const primaryVerified = emails.find((e) => e.primary && e.verified);
  if (primaryVerified) {
    return primaryVerified.email;
  }

  // Then, try any verified email
  const anyVerified = emails.find((e) => e.verified);
  if (anyVerified) {
    return anyVerified.email;
  }

  // Fall back to the email from user profile
  return fallbackEmail ?? undefined;
}

/**
 * Check if user is a member of any allowed org
 */
function isUserInAllowedOrgs(userOrgs: GitHubOrg[], allowedOrgs: string[]): boolean {
  if (allowedOrgs.length === 0) {
    return true; // No restriction
  }

  const userOrgLogins = userOrgs.map((o) => o.login.toLowerCase());
  return allowedOrgs.some((allowed) => userOrgLogins.includes(allowed.toLowerCase()));
}

/**
 * Check if user is in the allowed users list
 */
function isUserInAllowedUsers(userLogin: string, allowedUsers: string[]): boolean {
  if (allowedUsers.length === 0) {
    return true; // No restriction
  }

  return allowedUsers.some((allowed) => allowed.toLowerCase() === userLogin.toLowerCase());
}

/**
 * Check if user passes access control (orgs OR users allowlist)
 * If both are configured, user must match at least one
 */
function checkAccessControl(
  userLogin: string,
  userOrgs: GitHubOrg[],
  allowedOrgs: string[],
  allowedUsers: string[]
): { allowed: boolean; reason?: string } {
  const hasOrgRestriction = allowedOrgs.length > 0;
  const hasUserRestriction = allowedUsers.length > 0;

  // No restrictions configured
  if (!hasOrgRestriction && !hasUserRestriction) {
    return { allowed: true };
  }

  // Check user allowlist first (more specific)
  if (hasUserRestriction && isUserInAllowedUsers(userLogin, allowedUsers)) {
    return { allowed: true };
  }

  // Check org allowlist
  if (hasOrgRestriction && isUserInAllowedOrgs(userOrgs, allowedOrgs)) {
    return { allowed: true };
  }

  // Build rejection reason
  const reasons: string[] = [];
  if (hasUserRestriction) {
    reasons.push(`allowed users: ${allowedUsers.join(', ')}`);
  }
  if (hasOrgRestriction) {
    reasons.push(`allowed orgs: ${allowedOrgs.join(', ')}`);
  }

  return {
    allowed: false,
    reason: `User '${userLogin}' is not in ${reasons.join(' or ')}`,
  };
}

/**
 * auth_exchange_code tool
 *
 * Exchanges a GitHub authorization code for a dot-ai JWT.
 * Validates PKCE, fetches user info, and issues tokens.
 */
export const authExchangeCode: AuthTool = {
  definition: {
    name: 'auth_exchange_code',
    type: 'agentic',
    description:
      'Exchanges a GitHub authorization code for a dot-ai JWT access token. ' +
      'Validates PKCE code verifier, fetches GitHub user info, and issues tokens.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'The authorization code from GitHub callback',
        },
        state: {
          type: 'string',
          description: 'The state parameter from the authorization request',
        },
        redirect_uri: {
          type: 'string',
          description: 'The redirect URI (must match the original request)',
        },
      },
      required: ['code', 'state', 'redirect_uri'],
    },
  },

  handler: withAuthValidation(async (args: Record<string, unknown>) => {
    const input = args as unknown as ExchangeCodeInput;

    // Validate required parameters
    if (!input.code) {
      return authErrorResult('invalid_request', 'code is required');
    }

    if (!input.state) {
      return authErrorResult('invalid_request', 'state is required');
    }

    if (!input.redirect_uri) {
      return authErrorResult('invalid_request', 'redirect_uri is required');
    }

    // Retrieve and validate flow state
    const flowState = getOAuthFlowState(input.state);
    if (!flowState) {
      return authErrorResult('invalid_grant', 'Invalid or expired state parameter');
    }

    // Validate redirect_uri matches
    if (flowState.redirectUri !== input.redirect_uri) {
      return authErrorResult('invalid_grant', 'redirect_uri does not match');
    }

    // Exchange code for GitHub access token
    const tokenResponse = await exchangeCodeForGitHubToken(
      input.code,
      input.redirect_uri,
      flowState.codeVerifier
    );

    if ('error' in tokenResponse) {
      return authErrorResult(tokenResponse.error, tokenResponse.error_description || 'Token exchange failed');
    }

    const githubToken = tokenResponse.access_token;

    // Fetch GitHub user info
    let user: GitHubUser;
    try {
      user = await fetchGitHubUser(githubToken);
    } catch (error) {
      return authErrorResult('server_error', `Failed to fetch user info: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Fetch user emails
    const emails = await fetchGitHubEmails(githubToken);
    const primaryEmail = getPrimaryEmail(emails, user.email);

    // Parse allowed orgs and users from environment
    const allowedOrgsEnv = process.env.GITHUB_ALLOWED_ORGS;
    const allowedUsersEnv = process.env.GITHUB_ALLOWED_USERS;
    const allowedOrgs = allowedOrgsEnv ? allowedOrgsEnv.split(',').map((o) => o.trim()).filter((o) => o) : [];
    const allowedUsers = allowedUsersEnv ? allowedUsersEnv.split(',').map((u) => u.trim()).filter((u) => u) : [];

    // Check access control (orgs OR users)
    const userOrgs = await fetchGitHubOrgs(githubToken);
    const accessCheck = checkAccessControl(user.login, userOrgs, allowedOrgs, allowedUsers);

    if (!accessCheck.allowed) {
      return authErrorResult('access_denied', accessCheck.reason || 'Access denied');
    }

    // Build JWT claims
    const claims = {
      sub: `github:${user.id}`,
      iss: flowState.issuer,
      aud: flowState.issuer,
      name: user.name || user.login,
      email: primaryEmail,
      provider: 'github',
      provider_id: user.id.toString(),
      scope: flowState.scope,
    };

    // Sign JWT
    const accessToken = await signJWT(claims, ACCESS_TOKEN_TTL);

    // Generate and store refresh token
    const refreshToken = generateRefreshToken();
    storeRefreshToken(refreshToken, claims);

    // Clean up flow state
    deleteOAuthFlowState(input.state);

    // Calculate expires_in (1 hour = 3600 seconds)
    const expiresIn = 3600;

    const output: ExchangeCodeOutput = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: flowState.scope,
    };

    return authSuccessResult(output, 'Token exchange successful');
  }),
};
