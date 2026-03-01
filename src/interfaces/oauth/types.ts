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
  source: 'oauth';
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
 * Registered OAuth client (RFC 7591).
 * Stored in-memory; clients re-register on server restart.
 */
export interface OAuthClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_id_issued_at: number;
}

/**
 * Dynamic Client Registration request body (RFC 7591).
 */
export interface ClientRegistrationRequest {
  redirect_uris: string[];
  client_name?: string;
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

/**
 * Dynamic Client Registration response body (RFC 7591).
 */
export interface ClientRegistrationResponse {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_id_issued_at: number;
}
