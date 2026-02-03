/**
 * OAuth Authentication Schemas
 *
 * PRD #360: User Authentication & Access Control
 *
 * Zod schemas for OAuth 2.1 metadata endpoints:
 * - Protected Resource Metadata (RFC 9728)
 * - Authorization Server Metadata (RFC 8414)
 */

import { z } from 'zod';

/**
 * Protected Resource Metadata (RFC 9728)
 * Returned by /.well-known/oauth-protected-resource
 */
export const ProtectedResourceMetadataSchema = z.object({
  resource: z.string().url().describe('The resource identifier (MCP server URL)'),
  authorization_servers: z.array(z.string().url()).describe('Authorization servers that can issue tokens for this resource'),
  scopes_supported: z.array(z.string()).describe('Scopes supported by this resource'),
});

export type ProtectedResourceMetadata = z.infer<typeof ProtectedResourceMetadataSchema>;

/**
 * Authorization Server Metadata (RFC 8414)
 * Returned by /.well-known/oauth-authorization-server
 */
export const AuthorizationServerMetadataSchema = z.object({
  issuer: z.string().url().describe('The authorization server issuer identifier'),
  authorization_endpoint: z.string().url().describe('URL of the authorization endpoint'),
  token_endpoint: z.string().url().describe('URL of the token endpoint'),
  response_types_supported: z.array(z.string()).describe('Supported OAuth 2.0 response types'),
  grant_types_supported: z.array(z.string()).describe('Supported OAuth 2.0 grant types'),
  code_challenge_methods_supported: z.array(z.string()).describe('Supported PKCE code challenge methods'),
  scopes_supported: z.array(z.string()).describe('Scopes supported by this authorization server'),
});

export type AuthorizationServerMetadata = z.infer<typeof AuthorizationServerMetadataSchema>;

/**
 * Error response for auth endpoints
 */
export const AuthErrorResponseSchema = z.object({
  error: z.string().describe('Error code'),
  error_description: z.string().optional().describe('Human-readable error description'),
});

export type AuthErrorResponse = z.infer<typeof AuthErrorResponseSchema>;

// =============================================================================
// OAuth Flow Schemas (PRD #360 Milestone 2)
// =============================================================================

/**
 * OAuth authorization request query parameters
 * GET /oauth/authorize
 */
export const OAuthAuthorizeQuerySchema = z.object({
  response_type: z.literal('code').describe('Must be "code" for authorization code flow'),
  client_id: z.string().optional().describe('OAuth client ID (optional for MCP clients)'),
  redirect_uri: z.string().url().describe('Callback URL for authorization code'),
  scope: z.string().optional().describe('Requested OAuth scopes'),
  state: z.string().describe('CSRF protection state parameter'),
  code_challenge: z.string().describe('PKCE code challenge'),
  code_challenge_method: z.literal('S256').describe('PKCE method (must be S256)'),
});

export type OAuthAuthorizeQuery = z.infer<typeof OAuthAuthorizeQuerySchema>;

/**
 * OAuth callback query parameters
 * GET /oauth/callback
 */
export const OAuthCallbackQuerySchema = z.object({
  code: z.string().optional().describe('Authorization code from identity provider'),
  state: z.string().describe('State parameter for CSRF validation'),
  error: z.string().optional().describe('Error code if authorization failed'),
  error_description: z.string().optional().describe('Error description'),
});

export type OAuthCallbackQuery = z.infer<typeof OAuthCallbackQuerySchema>;

/**
 * OAuth token request for authorization code grant
 */
export const OAuthTokenAuthCodeRequestSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string().describe('Authorization code from callback'),
  redirect_uri: z.string().url().describe('Must match the original redirect_uri'),
  code_verifier: z.string().describe('PKCE code verifier'),
});

/**
 * OAuth token request for refresh token grant
 */
export const OAuthTokenRefreshRequestSchema = z.object({
  grant_type: z.literal('refresh_token'),
  refresh_token: z.string().describe('Refresh token from previous authentication'),
  scope: z.string().optional().describe('Request reduced scopes'),
});

/**
 * OAuth token request for test token grant (PRD #360)
 * Only available when DOT_AI_AUTH_TEST_MODE=true
 */
export const OAuthTokenTestRequestSchema = z.object({
  grant_type: z.literal('test_token'),
  user_id: z.string().describe('User identifier (must be in GITHUB_ALLOWED_USERS list)'),
  name: z.string().optional().describe('Display name for the user'),
  email: z.string().email().optional().describe('Email address for the user'),
  scope: z.string().optional().describe('OAuth scopes (default: mcp:read mcp:write)'),
});

/**
 * OAuth token request body
 * POST /oauth/token
 */
export const OAuthTokenRequestSchema = z.discriminatedUnion('grant_type', [
  OAuthTokenAuthCodeRequestSchema,
  OAuthTokenRefreshRequestSchema,
  OAuthTokenTestRequestSchema,
]);

export type OAuthTokenRequest = z.infer<typeof OAuthTokenRequestSchema>;

/**
 * OAuth token response
 */
export const OAuthTokenResponseSchema = z.object({
  access_token: z.string().describe('JWT access token'),
  token_type: z.literal('Bearer').describe('Token type'),
  expires_in: z.number().describe('Seconds until token expiration'),
  refresh_token: z.string().optional().describe('Refresh token for obtaining new access tokens'),
  scope: z.string().describe('Granted scopes'),
});

export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;

/**
 * Standard OAuth error codes
 */
export const OAuthErrorCodeSchema = z.enum([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
]);

export type OAuthErrorCode = z.infer<typeof OAuthErrorCodeSchema>;

/**
 * OAuth error response (RFC 6749 Section 5.2)
 */
export const OAuthErrorResponseSchema = z.object({
  error: OAuthErrorCodeSchema.describe('OAuth error code'),
  error_description: z.string().optional().describe('Human-readable error description'),
  error_uri: z.string().url().optional().describe('URI with more information about the error'),
});

export type OAuthErrorResponse = z.infer<typeof OAuthErrorResponseSchema>;
