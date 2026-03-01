/**
 * OAuth endpoint handlers for PRD #380 Task 2.2.
 *
 * Implements:
 * - GET /.well-known/oauth-protected-resource (RFC 9728)
 * - GET /.well-known/oauth-authorization-server (RFC 8414)
 * - POST /register (RFC 7591)
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { registerClient } from './store';
import type { ClientRegistrationRequest } from './types';

/**
 * Derive the external base URL from the incoming request.
 *
 * Uses the Host header (reflects external hostname behind ingress)
 * and x-forwarded-proto for protocol detection.
 */
export function getBaseUrl(req: IncomingMessage): string {
  const host = req.headers.host || 'localhost';
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = typeof forwardedProto === 'string' ? forwardedProto : 'http';
  return `${proto}://${host}`;
}

/**
 * Handle GET /.well-known/oauth-protected-resource
 * Returns Protected Resource Metadata per RFC 9728.
 */
export function handleProtectedResourceMetadata(
  req: IncomingMessage,
  res: ServerResponse
): void {
  const baseUrl = getBaseUrl(req);

  const metadata = {
    resource: baseUrl,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
  };

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  });
  res.end(JSON.stringify(metadata));
}

/**
 * Handle GET /.well-known/oauth-authorization-server
 * Returns Authorization Server Metadata per RFC 8414.
 *
 * Note: /authorize and /token are declared here but
 * implemented in Task 2.3 (Dex integration).
 */
export function handleAuthServerMetadata(
  req: IncomingMessage,
  res: ServerResponse
): void {
  const baseUrl = getBaseUrl(req);

  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
  });
  res.end(JSON.stringify(metadata));
}

/**
 * Handle POST /register
 * Dynamic Client Registration per RFC 7591.
 *
 * Errors use RFC 7591 format ({ error, error_description }),
 * not the dot-ai REST API format.
 */
export function handleClientRegistration(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown
): void {
  if (!body || typeof body !== 'object') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'invalid_client_metadata',
        error_description: 'Request body must be a JSON object',
      })
    );
    return;
  }

  const request = body as ClientRegistrationRequest;

  if (
    !Array.isArray(request.redirect_uris) ||
    request.redirect_uris.length === 0
  ) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'invalid_client_metadata',
        error_description:
          'redirect_uris is required and must be a non-empty array',
      })
    );
    return;
  }

  const invalidUri = request.redirect_uris.find(
    (uri) => typeof uri !== 'string' || uri.length === 0
  );
  if (invalidUri !== undefined) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'invalid_redirect_uri',
        error_description: 'Each redirect_uri must be a non-empty string',
      })
    );
    return;
  }

  const response = registerClient(request);

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}
