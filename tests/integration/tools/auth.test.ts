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
          bearer_methods_supported: ['header'],
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
          grant_types_supported: ['authorization_code'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
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
      // Register a valid client
      const registerResponse = await unauthenticatedClient.post('/register', {
        redirect_uris: ['http://127.0.0.1:9999/oauth/callback'],
        client_name: 'Integration Test Client',
      });

      expect(registerResponse).toMatchObject({
        success: true,
        data: {
          client_id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
          ),
          client_name: 'Integration Test Client',
          redirect_uris: ['http://127.0.0.1:9999/oauth/callback'],
          grant_types: ['authorization_code'],
          response_types: ['code'],
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

      // Reject registration with empty redirect_uris
      const emptyRedirectsResponse = await unauthenticatedClient.post(
        '/register',
        { redirect_uris: [] }
      );

      expect(emptyRedirectsResponse).toMatchObject({
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

      // Unique client_ids across registrations
      const secondResponse = await unauthenticatedClient.post('/register', {
        redirect_uris: ['http://127.0.0.1:9999/oauth/callback'],
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
