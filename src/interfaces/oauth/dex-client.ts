/**
 * Lightweight Dex OIDC client for PRD #380, Task 2.3.
 *
 * Three pure utility functions using only node:http/node:https.
 * No external dependencies. Dex is trusted in-cluster, so ID tokens
 * are decoded without signature verification.
 */

import * as http from 'node:http';
import * as https from 'node:https';
import type { DexConfig } from './types';

/**
 * Build the Dex OIDC authorization URL for the browser redirect.
 *
 * Uses dexConfig.issuerUrl (the external Dex URL) because this URL
 * is followed by the user's browser, not the MCP server.
 */
export function buildAuthorizeUrl(
  dexConfig: DexConfig,
  params: {
    redirectUri: string;
    state: string;
    scope?: string;
  }
): string {
  const base = dexConfig.issuerUrl.replace(/\/$/, '');
  const url = new URL(`${base}/auth`);
  url.searchParams.set('client_id', dexConfig.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scope ?? 'openid email profile groups');
  url.searchParams.set('state', params.state);
  return url.toString();
}

/**
 * Exchange a Dex authorization code for tokens.
 *
 * Uses dexConfig.tokenEndpoint (the in-cluster URL) for server-to-server
 * communication. Posts application/x-www-form-urlencoded with client credentials.
 */
export async function exchangeDexCode(
  dexConfig: DexConfig,
  code: string,
  redirectUri: string
): Promise<{ idToken: string; accessToken: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: dexConfig.clientId,
    client_secret: dexConfig.clientSecret,
  }).toString();

  const tokenUrl = new URL(dexConfig.tokenEndpoint);
  const transport = tokenUrl.protocol === 'https:' ? https : http;

  const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const req = transport.request(
      tokenUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: data });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (response.statusCode !== 200) {
    throw new Error(
      `Dex token exchange failed (HTTP ${response.statusCode}): ${response.body}`
    );
  }

  const parsed = JSON.parse(response.body);
  if (!parsed.id_token) {
    throw new Error('Dex token response missing id_token');
  }

  return {
    idToken: parsed.id_token,
    accessToken: parsed.access_token ?? '',
  };
}

/**
 * Decode a Dex ID token payload without signature verification.
 *
 * Dex is trusted in-cluster — the token was received directly from
 * Dex's token endpoint over the internal network. No JWKS needed.
 */
export function parseIdToken(idToken: string): {
  sub: string;
  email?: string;
  groups?: string[];
} {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format — expected 3 segments');
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (!payload.sub) {
    throw new Error('ID token missing sub claim');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    groups: payload.groups,
  };
}
