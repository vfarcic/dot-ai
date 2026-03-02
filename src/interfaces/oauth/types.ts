/**
 * OAuth type definitions for PRD #380: Gateway Auth & RBAC
 *
 * Defines the identity contract, authentication result, and JWT claims
 * used throughout the OAuth + dual-mode auth system.
 */

/**
 * User identity extracted from OAuth tokens.
 * Populated when authentication succeeds via JWT (not legacy token).
 */
export interface UserIdentity {
  userId: string;
  email?: string;
  groups: string[];
  source: 'oauth' | 'token';
}

/**
 * Authentication result from the dual-mode middleware.
 * When JWT auth succeeds, `identity` contains the user's claims.
 * When legacy token auth succeeds, `identity` is undefined.
 */
export interface AuthResult {
  authorized: boolean;
  message?: string;
  identity?: UserIdentity;
}

/**
 * JWT payload claims for dot-ai access tokens.
 * HMAC-SHA256 signed using node:crypto.
 */
export interface JwtClaims {
  sub: string;
  email?: string;
  groups: string[];
  iat: number;
  exp: number;
}

/**
 * Pending authorization request.
 * Created when /authorize is called, before redirecting to Dex.
 * Maps a session ID to the original client request params.
 */
export interface PendingAuthRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  state: string;
  createdAt: number;
}

/**
 * Issued authorization code.
 * Created after Dex callback, consumed by /token.
 */
export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  userIdentity: UserIdentity;
  createdAt: number;
  expiresAt: number;
}

/**
 * Token request body (POST /token).
 * RFC 6749 requires application/x-www-form-urlencoded.
 */
export interface TokenRequest {
  grant_type: string;
  code: string;
  redirect_uri: string;
  client_id: string;
  code_verifier: string;
}

/**
 * Token response body.
 */
export interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
}

/**
 * Dex OIDC provider configuration.
 *
 * Two separate URLs are needed because in Kubernetes the MCP server pod
 * can't reach Dex via the external ingress hostname (it resolves to
 * the pod itself). Browser redirects use issuerUrl (external); server-
 * to-server token exchange uses tokenEndpoint (in-cluster service URL).
 */
export interface DexConfig {
  issuerUrl: string;       // External Dex URL (for browser authorize redirects)
  tokenEndpoint: string;   // Dex token endpoint (in-cluster URL for k8s, or issuerUrl/token for local dev)
  clientId: string;
  clientSecret: string;
}
