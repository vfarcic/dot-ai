/**
 * In-memory store for OAuth registered clients (RFC 7591).
 *
 * Clients re-register on server restart, which is expected behavior
 * per the MCP Authorization spec — clients handle 401 and re-register.
 */

import { randomUUID } from 'node:crypto';
import type {
  OAuthClient,
  ClientRegistrationRequest,
  ClientRegistrationResponse,
} from './types';

/** Registered clients keyed by client_id. */
const clients = new Map<string, OAuthClient>();

/**
 * Register a new OAuth client.
 * Generates a unique client_id and stores client metadata.
 */
export function registerClient(
  request: ClientRegistrationRequest
): ClientRegistrationResponse {
  const clientId = randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const client: OAuthClient = {
    client_id: clientId,
    client_name: request.client_name,
    redirect_uris: request.redirect_uris,
    grant_types: request.grant_types ?? ['authorization_code'],
    response_types: request.response_types ?? ['code'],
    token_endpoint_auth_method: request.token_endpoint_auth_method ?? 'none',
    client_id_issued_at: now,
  };

  clients.set(clientId, client);

  return {
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    grant_types: client.grant_types,
    response_types: client.response_types,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    client_id_issued_at: client.client_id_issued_at,
  };
}

/**
 * Look up a registered client by ID.
 */
export function getClient(clientId: string): OAuthClient | undefined {
  return clients.get(clientId);
}

/**
 * Clear all registered clients. For testing only.
 * @internal
 */
export function _clearClients(): void {
  clients.clear();
}
