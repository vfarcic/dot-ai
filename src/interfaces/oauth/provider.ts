/**
 * MCP SDK OAuth Server Provider for PRD #380.
 *
 * Implements the SDK's OAuthServerProvider interface with:
 * - In-memory client store (clients re-register on restart per MCP spec)
 * - Dual-mode token verification (JWT + legacy DOT_AI_AUTH_TOKEN)
 * - Dex OIDC integration for authorize/callback/token flow (Task 2.3)
 */

import type { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  ServerError,
  InvalidTokenError,
  InvalidGrantError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { verifyJwt, signJwt, getJwtSecret } from './jwt';
import type { DexConfig, PendingAuthRequest, AuthorizationCode } from './types';
import { buildAuthorizeUrl, exchangeDexCode, parseIdToken } from './dex-client';

/**
 * Safely extract a single string from an Express query parameter.
 * Query params can be string, string[], or undefined when tampered.
 */
function extractQueryParam(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

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

/** Max age for pending auth requests (10 minutes). */
const PENDING_REQUEST_TTL_MS = 10 * 60 * 1000;

/** Max age for authorization codes (5 minutes). */
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;

/** Separator between session ID and original state in the Dex state param. */
const STATE_SEPARATOR = '|';

/**
 * OAuth Server Provider for dot-ai.
 *
 * Acts as the OAuth Authorization Server for MCP clients. On authorize,
 * redirects the browser to Dex for authentication, then exchanges the
 * Dex code for an ID token and issues a dot-ai JWT.
 *
 * Token verification supports dual-mode: JWT first, legacy token fallback.
 */
export class DotAIOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: DotAIClientsStore;
  private pendingRequests = new Map<string, PendingAuthRequest>();
  private authCodes = new Map<string, AuthorizationCode>();
  private dexConfig: DexConfig | null;
  private dotAiExternalUrl: string;

  constructor() {
    this.clientsStore = new DotAIClientsStore();
    this.dexConfig = this.loadDexConfig();
    this.dotAiExternalUrl = (process.env.DOT_AI_EXTERNAL_URL || '').replace(/\/$/, '');
  }

  private loadDexConfig(): DexConfig | null {
    const issuerUrl = process.env.DEX_ISSUER_URL;
    const clientId = process.env.DEX_CLIENT_ID;
    const clientSecret = process.env.DEX_CLIENT_SECRET;
    if (!issuerUrl || !clientId || !clientSecret) {
      return null;
    }
    const tokenEndpoint = process.env.DEX_TOKEN_ENDPOINT
      || `${issuerUrl.replace(/\/$/, '')}/token`;
    return { issuerUrl, tokenEndpoint, clientId, clientSecret };
  }

  /**
   * Start the authorization flow by redirecting the browser to Dex.
   *
   * Stores the pending auth request (PKCE challenge, redirect URI, state)
   * keyed by a random session ID, then encodes sessionId|originalState
   * in the Dex state param so the callback can recover the pending request.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    if (!this.dexConfig) {
      throw new ServerError('Dex not configured (set DEX_ISSUER_URL, DEX_CLIENT_ID, DEX_CLIENT_SECRET)');
    }

    const sessionId = randomBytes(16).toString('hex');

    const pending: PendingAuthRequest = {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: 'S256',
      state: params.state ?? '',
      createdAt: Date.now(),
    };
    this.pendingRequests.set(sessionId, pending);

    const dexState = `${sessionId}${STATE_SEPARATOR}${params.state ?? ''}`;
    const callbackUrl = `${this.dotAiExternalUrl}/callback`;

    const dexAuthUrl = buildAuthorizeUrl(this.dexConfig, {
      redirectUri: callbackUrl,
      state: dexState,
    });

    res.redirect(302, dexAuthUrl);
  }

  /**
   * Return the PKCE code challenge for a given authorization code.
   *
   * Called by the SDK's tokenHandler BEFORE exchangeAuthorizationCode.
   * Do NOT delete the code here — it is consumed in exchangeAuthorizationCode.
   */
  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const record = this.authCodes.get(authorizationCode);
    if (!record) {
      throw new InvalidGrantError('Authorization code not found or expired');
    }

    if (Date.now() > record.expiresAt) {
      this.authCodes.delete(authorizationCode);
      throw new InvalidGrantError('Authorization code expired');
    }

    return record.codeChallenge;
  }

  /**
   * Exchange a dot-ai authorization code for a JWT access token.
   *
   * Called by the SDK's tokenHandler AFTER PKCE verification passes.
   * Consumes the authorization code (one-time use) and signs a JWT
   * containing the user's identity from the Dex ID token.
   */
  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const record = this.authCodes.get(authorizationCode);
    if (!record) {
      throw new InvalidGrantError('Authorization code not found or expired');
    }

    if (Date.now() > record.expiresAt) {
      this.authCodes.delete(authorizationCode);
      throw new InvalidGrantError('Authorization code expired');
    }

    // Consume the authorization code (one-time use)
    this.authCodes.delete(authorizationCode);

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 1 hour
    const secret = getJwtSecret();

    const accessToken = signJwt({
      sub: record.userIdentity.userId,
      email: record.userIdentity.email,
      groups: record.userIdentity.groups,
      iat: now,
      exp: now + expiresIn,
    }, secret);

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: expiresIn,
    };
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
   * Handle the Dex OIDC callback after user authenticates.
   *
   * Receives the redirect from Dex with ?code=DEX_CODE&state=sessionId|originalState.
   * Exchanges the Dex code for an ID token, extracts user identity,
   * creates a dot-ai authorization code, and redirects to the MCP client.
   */
  async handleCallback(req: Request, res: Response): Promise<void> {
    const dexCode = extractQueryParam(req.query.code);
    const encodedState = extractQueryParam(req.query.state);
    const error = extractQueryParam(req.query.error);

    if (error) {
      const sessionId = encodedState?.split(STATE_SEPARATOR)[0];
      const pending = sessionId ? this.pendingRequests.get(sessionId) : undefined;
      if (pending) {
        this.pendingRequests.delete(sessionId!);
        const errUrl = new URL(pending.redirectUri);
        errUrl.searchParams.set('error', 'access_denied');
        errUrl.searchParams.set('error_description',
          extractQueryParam(req.query.error_description) ?? 'Authentication failed');
        if (pending.state) errUrl.searchParams.set('state', pending.state);
        res.redirect(302, errUrl.toString());
      } else {
        res.status(400).send('Authentication failed and no pending session found');
      }
      return;
    }

    if (!dexCode || !encodedState) {
      res.status(400).send('Missing code or state parameter');
      return;
    }

    const separatorIndex = encodedState.indexOf(STATE_SEPARATOR);
    if (separatorIndex === -1) {
      res.status(400).send('Invalid state parameter');
      return;
    }
    const sessionId = encodedState.slice(0, separatorIndex);
    const originalState = encodedState.slice(separatorIndex + 1);

    const pending = this.pendingRequests.get(sessionId);
    if (!pending) {
      res.status(400).send('No pending auth request for this session (expired or invalid)');
      return;
    }

    if (Date.now() - pending.createdAt > PENDING_REQUEST_TTL_MS) {
      this.pendingRequests.delete(sessionId);
      res.status(400).send('Auth request expired');
      return;
    }

    this.pendingRequests.delete(sessionId);

    if (!this.dexConfig) {
      res.status(500).send('Dex not configured');
      return;
    }

    try {
      const callbackUrl = `${this.dotAiExternalUrl}/callback`;
      const { idToken } = await exchangeDexCode(this.dexConfig, dexCode, callbackUrl);
      const claims = parseIdToken(idToken);

      const userIdentity = {
        userId: claims.sub,
        email: claims.email,
        groups: claims.groups ?? [],
        source: 'oauth' as const,
      };

      const dotAiCode = randomBytes(32).toString('hex');
      const authCode: AuthorizationCode = {
        code: dotAiCode,
        clientId: pending.clientId,
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        codeChallengeMethod: 'S256',
        userIdentity,
        createdAt: Date.now(),
        expiresAt: Date.now() + AUTH_CODE_TTL_MS,
      };
      this.authCodes.set(dotAiCode, authCode);

      const redirectUrl = new URL(pending.redirectUri);
      redirectUrl.searchParams.set('code', dotAiCode);
      if (originalState) redirectUrl.searchParams.set('state', originalState);

      res.redirect(302, redirectUrl.toString());
    } catch {
      const errUrl = new URL(pending.redirectUri);
      errUrl.searchParams.set('error', 'server_error');
      errUrl.searchParams.set('error_description', 'Failed to exchange code with identity provider');
      if (originalState) errUrl.searchParams.set('state', originalState);
      res.redirect(302, errUrl.toString());
    }
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
