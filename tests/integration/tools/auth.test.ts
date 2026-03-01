/**
 * Integration Test: Authentication & OAuth Discovery (PRD #380 Tasks 2.1-2.2)
 *
 * Tests auth rejection, OAuth discovery metadata, client registration,
 * and WWW-Authenticate header on 401 responses.
 * Legacy token acceptance is already covered by all other integration tests
 * (IntegrationTest base class auto-injects DOT_AI_AUTH_TOKEN).
 */

import { describe, test, expect } from 'vitest';
import * as http from 'http';
import { HttpRestApiClient } from '../helpers/http-client.js';
import { createHash, randomBytes } from 'node:crypto';

// --- OAuth flow helpers ---

/** Make an HTTP request without following redirects. */
function rawHttp(
  urlStr: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const headers = { ...options.headers };
    if (options.body) {
      headers['Content-Length'] = Buffer.byteLength(options.body).toString();
    }
    const req = http.request(url, { method: options.method || 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk: string | Buffer) => (data += chunk));
      res.on('end', () =>
        resolve({ statusCode: res.statusCode || 0, headers: res.headers, body: data })
      );
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/** Generate PKCE code_verifier and S256 code_challenge. */
function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Fix URL port for the Kind cluster test environment.
 * Helm-generated URLs omit the Kind NodePort (e.g. 8180), but test
 * HTTP requests must go through it.
 */
function fixTestPort(locationUrl: string, mcpBase: string, dexBase: string): string {
  try {
    const parsed = new URL(locationUrl);
    const mcp = new URL(mcpBase);
    const dex = new URL(dexBase);
    if (parsed.hostname === mcp.hostname && parsed.port !== mcp.port) {
      parsed.port = mcp.port;
      return parsed.toString();
    }
    if (parsed.hostname === dex.hostname && parsed.port !== dex.port) {
      parsed.port = dex.port;
      return parsed.toString();
    }
  } catch {
    // URL parsing failed — return as-is
  }
  return locationUrl;
}

describe.concurrent('Authentication Integration', () => {
  const unauthenticatedClient = new HttpRestApiClient();
  const badTokenClient = new HttpRestApiClient({
    headers: { Authorization: 'Bearer wrong-token-value' },
  });

  describe('Rejection', () => {
    test('should reject request without Authorization header', async () => {
      const response = await unauthenticatedClient.post(
        '/api/v1/tools/version',
        { interaction_id: `auth_no_token_${Date.now()}` }
      );

      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: expect.stringContaining('Authentication required'),
        },
      });
    });

    test('should reject request with invalid token', async () => {
      const response = await badTokenClient.post(
        '/api/v1/tools/version',
        { interaction_id: `auth_bad_token_${Date.now()}` }
      );

      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: expect.stringContaining('Invalid authentication token'),
        },
      });
    });
  });

  describe('Public Endpoints', () => {
    test('should allow unauthenticated access to healthz', async () => {
      const response = await unauthenticatedClient.get('/healthz');

      expect(response).toMatchObject({
        success: true,
        data: { status: 'ok' },
      });
    });
  });

  describe('OAuth Discovery (RFC 9728 / RFC 8414)', () => {
    test('should return protected resource metadata and auth server metadata with consistent URLs', async () => {
      const resourceResponse = await unauthenticatedClient.get(
        '/.well-known/oauth-protected-resource'
      );

      expect(resourceResponse).toMatchObject({
        success: true,
        data: {
          resource: expect.stringMatching(/^https?:\/\/.+/),
          authorization_servers: expect.arrayContaining([
            expect.stringMatching(/^https?:\/\/.+/),
          ]),
        },
      });

      const serverResponse = await unauthenticatedClient.get(
        '/.well-known/oauth-authorization-server'
      );

      expect(serverResponse).toMatchObject({
        success: true,
        data: {
          issuer: expect.stringMatching(/^https?:\/\/.+/),
          authorization_endpoint: expect.stringContaining('/authorize'),
          token_endpoint: expect.stringContaining('/token'),
          registration_endpoint: expect.stringContaining('/register'),
          response_types_supported: ['code'],
          grant_types_supported: expect.arrayContaining(['authorization_code']),
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: expect.arrayContaining(['none']),
        },
      });

      // authorization_servers from resource metadata should match issuer
      expect(resourceResponse.data.authorization_servers).toContain(
        serverResponse.data.issuer
      );
    });
  });

  describe('Dynamic Client Registration (RFC 7591)', () => {
    test('should register client, reject invalid requests, and generate unique IDs', async () => {
      // Register a valid public client (token_endpoint_auth_method: 'none' matches real MCP clients)
      const registerResponse = await unauthenticatedClient.post('/register', {
        redirect_uris: ['http://127.0.0.1:9999/oauth/callback'],
        client_name: 'Integration Test Client',
        token_endpoint_auth_method: 'none',
      });

      expect(registerResponse).toMatchObject({
        success: true,
        data: {
          client_id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
          ),
          client_name: 'Integration Test Client',
          redirect_uris: expect.arrayContaining(['http://127.0.0.1:9999/oauth/callback']),
          token_endpoint_auth_method: 'none',
          client_id_issued_at: expect.any(Number),
        },
      });

      // Reject registration without redirect_uris
      const missingRedirectsResponse = await unauthenticatedClient.post(
        '/register',
        { client_name: 'Missing Redirects' }
      );

      expect(missingRedirectsResponse).toMatchObject({
        success: false,
        error: {
          code: 'HTTP_ERROR',
          message: 'HTTP 400',
          details: {
            error: 'invalid_client_metadata',
            error_description: expect.stringContaining('redirect_uris'),
          },
        },
      });

      // Reject registration with malformed redirect_uris (not valid URLs)
      const malformedRedirectsResponse = await unauthenticatedClient.post(
        '/register',
        { redirect_uris: ['not-a-valid-url'] }
      );

      expect(malformedRedirectsResponse).toMatchObject({
        success: false,
        error: {
          code: 'HTTP_ERROR',
          message: 'HTTP 400',
          details: {
            error: 'invalid_client_metadata',
            error_description: expect.stringContaining('Invalid URL'),
          },
        },
      });

      // Unique client_ids across registrations
      const secondResponse = await unauthenticatedClient.post('/register', {
        redirect_uris: ['http://127.0.0.1:9999/oauth/callback'],
        token_endpoint_auth_method: 'none',
      });

      expect(secondResponse.data?.client_id).toBeDefined();
      expect(registerResponse.data?.client_id).not.toBe(
        secondResponse.data?.client_id
      );
    });
  });

  describe('WWW-Authenticate Header', () => {
    test('should include WWW-Authenticate with resource_metadata on 401', async () => {
      const baseUrl = process.env.MCP_BASE_URL || 'http://localhost:3456';
      const url = new URL('/api/v1/tools/version', baseUrl);

      const response = await new Promise<{
        statusCode: number;
        headers: http.IncomingHttpHeaders;
      }>((resolve, reject) => {
        const req = http.request(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode || 0,
                headers: res.headers,
              });
            });
          }
        );
        req.on('error', reject);
        req.write(JSON.stringify({}));
        req.end();
      });

      expect(response.statusCode).toBe(401);

      const wwwAuth = response.headers['www-authenticate'];
      expect(wwwAuth).toBeDefined();
      expect(typeof wwwAuth).toBe('string');
      expect(wwwAuth).toMatch(/^Bearer\s+resource_metadata="/);
      expect(wwwAuth).toContain('/.well-known/oauth-protected-resource');
    });
  });
});

// --- OAuth Flow Tests (PRD #380 Task 2.3) ---
// Skipped when Dex env vars are not set so existing CI without Dex still passes.

const dexConfigured = !!(
  process.env.DEX_TEST_USER_EMAIL &&
  process.env.DEX_TEST_USER_PASSWORD &&
  process.env.DEX_ISSUER_URL
);

describe.skipIf(!dexConfigured)('OAuth Flow (PRD #380 Task 2.3)', () => {
  const mcpBaseUrl = process.env.MCP_BASE_URL || 'http://localhost:3456';
  const dexIssuerUrl = process.env.DEX_ISSUER_URL!;
  const dexEmail = process.env.DEX_TEST_USER_EMAIL!;
  const dexPassword = process.env.DEX_TEST_USER_PASSWORD!;
  const clientRedirectUri = 'http://127.0.0.1:9999/oauth/callback';

  test('should complete full OAuth flow: register → authorize → Dex login → callback → token → JWT auth', async () => {
    // Step 1: Register a public MCP client
    const registerRes = await rawHttp(`${mcpBaseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: [clientRedirectUri],
        client_name: 'OAuth Flow Test Client',
        token_endpoint_auth_method: 'none',
      }),
    });

    expect(registerRes.statusCode).toBe(201);
    const { client_id: clientId } = JSON.parse(registerRes.body);
    expect(clientId).toBeTruthy();

    // Step 2: Generate PKCE code_verifier + S256 code_challenge
    const { codeVerifier, codeChallenge } = generatePkce();

    // Step 3: Start authorization flow → should redirect to Dex
    const authorizeUrl = new URL('/authorize', mcpBaseUrl);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', clientRedirectUri);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('state', 'test-oauth-state');

    const authorizeRes = await rawHttp(authorizeUrl.toString());

    expect(authorizeRes.statusCode).toBe(302);
    expect(authorizeRes.headers.location).toContain('/auth');

    // Step 4: Follow Dex redirects until we reach the login form (HTTP 200)
    let currentUrl = authorizeRes.headers.location!;
    if (!currentUrl.startsWith('http')) {
      currentUrl = new URL(currentUrl, mcpBaseUrl).toString();
    }
    currentUrl = fixTestPort(currentUrl, mcpBaseUrl, dexIssuerUrl);

    let dexRes = await rawHttp(currentUrl);
    for (let i = 0; i < 5 && dexRes.statusCode >= 300 && dexRes.statusCode < 400; i++) {
      const nextLoc = dexRes.headers.location!;
      currentUrl = nextLoc.startsWith('http')
        ? fixTestPort(nextLoc, mcpBaseUrl, dexIssuerUrl)
        : fixTestPort(new URL(nextLoc, currentUrl).toString(), mcpBaseUrl, dexIssuerUrl);
      dexRes = await rawHttp(currentUrl);
    }

    expect(dexRes.statusCode).toBe(200);
    // Login form should contain a password field
    expect(dexRes.body).toContain('password');

    // Step 5: Submit Dex login form
    // Extract the auth request ID from the URL or a hidden form field
    const loginPageUrl = new URL(currentUrl);
    let reqParam = loginPageUrl.searchParams.get('req') || '';
    const hiddenMatch = dexRes.body.match(/name="req"\s+value="([^"]*)"/);
    if (hiddenMatch) reqParam = hiddenMatch[1];

    // Determine the POST URL from the form action attribute
    const actionMatch = dexRes.body.match(/action="([^"]*)"/);
    let loginPostUrl: string;
    if (actionMatch) {
      const action = actionMatch[1].replace(/&amp;/g, '&');
      loginPostUrl = action.startsWith('http')
        ? fixTestPort(action, mcpBaseUrl, dexIssuerUrl)
        : fixTestPort(new URL(action, currentUrl).toString(), mcpBaseUrl, dexIssuerUrl);
    } else {
      loginPostUrl = `${dexIssuerUrl}/auth/local/login${reqParam ? `?req=${reqParam}` : ''}`;
    }

    const loginBody = new URLSearchParams({
      login: dexEmail,
      password: dexPassword,
      ...(reqParam ? { req: reqParam } : {}),
    }).toString();

    const loginRes = await rawHttp(loginPostUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: loginBody,
    });

    // Dex should redirect (303) after successful login
    expect(loginRes.statusCode).toBeGreaterThanOrEqual(300);
    expect(loginRes.statusCode).toBeLessThan(400);

    // Step 6: Follow redirects from Dex → our /callback → client redirect_uri
    // Stop when we reach the client's redirect_uri (no server there to call)
    let nextLocation = loginRes.headers.location!;
    let dotAiAuthCode: string | null = null;
    let returnedState: string | null = null;

    for (let i = 0; i < 10; i++) {
      const absoluteUrl = nextLocation.startsWith('http')
        ? nextLocation
        : new URL(nextLocation, loginPostUrl).toString();

      // Client redirect_uri reached — extract the dot-ai auth code
      if (absoluteUrl.includes('127.0.0.1:9999')) {
        const finalUrl = new URL(absoluteUrl);
        dotAiAuthCode = finalUrl.searchParams.get('code');
        returnedState = finalUrl.searchParams.get('state');
        break;
      }

      const requestUrl = fixTestPort(absoluteUrl, mcpBaseUrl, dexIssuerUrl);
      const res = await rawHttp(requestUrl);

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        nextLocation = res.headers.location;
        continue;
      }

      throw new Error(`Unexpected HTTP ${res.statusCode} during redirect chain at ${requestUrl}`);
    }

    expect(dotAiAuthCode).toBeTruthy();
    expect(returnedState).toBe('test-oauth-state');

    // Step 7: Exchange authorization code for JWT access token
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: dotAiAuthCode!,
      redirect_uri: clientRedirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }).toString();

    const tokenRes = await rawHttp(`${mcpBaseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    expect(tokenRes.statusCode).toBe(200);
    const tokenData = JSON.parse(tokenRes.body);
    expect(tokenData).toMatchObject({
      access_token: expect.any(String),
      token_type: 'bearer',
      expires_in: 3600,
    });

    // Verify JWT structure (3 base64url segments)
    const jwtParts = tokenData.access_token.split('.');
    expect(jwtParts).toHaveLength(3);

    // Step 8: Use JWT to call an authenticated endpoint
    const jwtClient = new HttpRestApiClient({
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const versionResponse = await jwtClient.post('/api/v1/tools/version', {
      interaction_id: `oauth_jwt_auth_${Date.now()}`,
    });

    expect(versionResponse).toMatchObject({
      success: true,
      data: {
        result: {
          status: 'success',
        },
      },
    });
  }, 60000);

  describe('Error Handling', () => {
    test('should reject callback with missing parameters, invalid state, and unknown session', async () => {
      // Missing code and state
      const missingRes = await rawHttp(`${mcpBaseUrl}/callback`);
      expect(missingRes.statusCode).toBe(400);
      expect(missingRes.body).toContain('Missing code or state parameter');

      // Invalid state (no separator)
      const badStateRes = await rawHttp(
        `${mcpBaseUrl}/callback?code=fake&state=noseparator`
      );
      expect(badStateRes.statusCode).toBe(400);
      expect(badStateRes.body).toContain('Invalid state parameter');

      // Unknown session ID
      const unknownRes = await rawHttp(
        `${mcpBaseUrl}/callback?code=fake&state=${'a'.repeat(32)}|original`
      );
      expect(unknownRes.statusCode).toBe(400);
      expect(unknownRes.body).toContain('No pending auth request');
    });

    test('should reject token exchange with invalid authorization code', async () => {
      const registerRes = await rawHttp(`${mcpBaseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: [clientRedirectUri],
          token_endpoint_auth_method: 'none',
        }),
      });
      const { client_id: clientId } = JSON.parse(registerRes.body);

      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'nonexistent-authorization-code',
        redirect_uri: clientRedirectUri,
        client_id: clientId,
        code_verifier: randomBytes(32).toString('base64url'),
      }).toString();

      const tokenRes = await rawHttp(`${mcpBaseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody,
      });

      expect(tokenRes.statusCode).toBe(400);
      const errorData = JSON.parse(tokenRes.body);
      expect(errorData).toMatchObject({
        error: 'invalid_grant',
      });
    });
  });
});
