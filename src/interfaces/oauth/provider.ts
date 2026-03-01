/**
 * MCP SDK OAuth Server Provider for PRD #380.
 *
 * Implements the SDK's OAuthServerProvider interface with:
 * - In-memory client store (clients re-register on restart per MCP spec)
 * - Dual-mode token verification (JWT + legacy DOT_AI_AUTH_TOKEN)
 * - Stub authorize/token methods (Dex integration in Task 2.3)
 */

import { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  ServerError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { verifyJwt, getJwtSecret } from './jwt';

/**
 * In-memory client store for OAuth registered clients.
 * Clients re-register on server restart per the MCP Authorization spec.
 */
export class DotAIClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>
  ): OAuthClientInformationFull {
    // SDK pre-populates client_id, client_secret, timestamps before calling this.
    // The Omit type is the interface contract, but the actual object has all fields.
    const fullClient = client as OAuthClientInformationFull;
    this.clients.set(fullClient.client_id, fullClient);
    return fullClient;
  }

  /** Clear all registered clients. For testing only. @internal */
  _clearClients(): void {
    this.clients.clear();
  }
}

/**
 * OAuth Server Provider for dot-ai.
 *
 * Acts as the OAuth Authorization Server for MCP clients.
 * Token verification supports dual-mode: JWT first, legacy token fallback.
 * Authorization flow stubs throw ServerError until Dex is integrated (Task 2.3).
 */
export class DotAIOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: DotAIClientsStore;

  constructor() {
    this.clientsStore = new DotAIClientsStore();
  }

  async authorize(
    _client: OAuthClientInformationFull,
    _params: AuthorizationParams,
    _res: Response
  ): Promise<void> {
    throw new ServerError(
      'Authorization not available — Dex integration pending (Task 2.3)'
    );
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    _authorizationCode: string
  ): Promise<string> {
    throw new ServerError(
      'Not implemented — Dex integration pending (Task 2.3)'
    );
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    _authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    throw new ServerError(
      'Token exchange not available — Dex integration pending (Task 2.3)'
    );
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    _refreshToken: string,
    _scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    throw new ServerError('Refresh tokens not supported');
  }

  /**
   * Verify an access token (dual-mode: JWT + legacy token).
   *
   * 1. If no auth configured → anonymous access (backward compatible)
   * 2. Try JWT verification → returns AuthInfo with identity in `extra`
   * 3. Fall back to legacy DOT_AI_AUTH_TOKEN → returns AuthInfo without identity
   * 4. Throw InvalidTokenError on failure
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const legacyToken = process.env.DOT_AI_AUTH_TOKEN;
    const jwtSecretEnv = process.env.DOT_AI_JWT_SECRET;

    // No auth configured → allow all (backward compatible)
    if (!legacyToken && !jwtSecretEnv) {
      return {
        token,
        clientId: 'anonymous',
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
    }

    // Mode 1: JWT verification
    const secret = jwtSecretEnv || getJwtSecret();
    const claims = verifyJwt(token, secret);
    if (claims) {
      return {
        token,
        clientId: claims.sub,
        scopes: [],
        expiresAt: claims.exp,
        extra: {
          identity: {
            userId: claims.sub,
            email: claims.email,
            groups: claims.groups ?? [],
            source: 'oauth',
          },
        },
      };
    }

    // Mode 2: Legacy DOT_AI_AUTH_TOKEN comparison
    if (legacyToken) {
      const configuredBuffer = Buffer.from(legacyToken, 'utf8');
      const providedBuffer = Buffer.from(token, 'utf8');

      let isMatch = false;
      if (configuredBuffer.length === providedBuffer.length) {
        isMatch = timingSafeEqual(configuredBuffer, providedBuffer);
      } else {
        // Dummy comparison to maintain constant time
        timingSafeEqual(configuredBuffer, configuredBuffer);
      }

      if (isMatch) {
        return {
          token,
          clientId: 'legacy',
          scopes: [],
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        };
      }
    }

    throw new InvalidTokenError('Invalid authentication token.');
  }
}
