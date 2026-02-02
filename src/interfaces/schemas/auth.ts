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
