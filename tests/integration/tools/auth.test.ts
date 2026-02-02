/**
 * Authentication Integration Tests
 *
 * PRD #360: User Authentication & Access Control
 *
 * Tests for:
 * - Well-known OAuth endpoints (RFC 9728, RFC 8414)
 * - Admin token authentication
 * - 401 responses for unauthenticated requests
 * - Public endpoints accessibility
 */

import { describe, test, beforeAll, expect } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import { HttpRestApiClient } from '../helpers/http-client.js';

describe.concurrent('Authentication Integration Tests', () => {
  let integrationTest: IntegrationTest;
  let unauthenticatedClient: HttpRestApiClient;

  beforeAll(() => {
    integrationTest = new IntegrationTest();
    // Create a client without auth headers for testing 401 responses
    unauthenticatedClient = new HttpRestApiClient({});
  });

  describe('Well-Known Endpoints', () => {
    test('should return protected resource metadata without authentication', async () => {
      // Well-known endpoints should be public per OAuth spec
      const response = await unauthenticatedClient.get('/.well-known/oauth-protected-resource');

      const expectedResponse = {
        resource: expect.stringMatching(/^https?:\/\//),
        authorization_servers: expect.arrayContaining([expect.stringMatching(/^https?:\/\//)]),
        scopes_supported: expect.arrayContaining(['mcp:read', 'mcp:write', 'mcp:admin']),
      };

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject(expectedResponse);
    });

    test('should return authorization server metadata without authentication', async () => {
      // Well-known endpoints should be public per OAuth spec
      const response = await unauthenticatedClient.get('/.well-known/oauth-authorization-server');

      const expectedResponse = {
        issuer: expect.stringMatching(/^https?:\/\//),
        authorization_endpoint: expect.stringMatching(/\/oauth\/authorize$/),
        token_endpoint: expect.stringMatching(/\/oauth\/token$/),
        response_types_supported: expect.arrayContaining(['code']),
        grant_types_supported: expect.arrayContaining(['authorization_code', 'refresh_token']),
        code_challenge_methods_supported: expect.arrayContaining(['S256']),
        scopes_supported: expect.arrayContaining(['mcp:read', 'mcp:write', 'mcp:admin']),
      };

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject(expectedResponse);
    });

    test('should have consistent issuer across well-known endpoints', async () => {
      const [protectedResource, authServer] = await Promise.all([
        unauthenticatedClient.get('/.well-known/oauth-protected-resource'),
        unauthenticatedClient.get('/.well-known/oauth-authorization-server'),
      ]);

      expect(protectedResource.success).toBe(true);
      expect(authServer.success).toBe(true);

      // The resource should match the issuer
      expect(protectedResource.data.resource).toBe(authServer.data.issuer);

      // The authorization server should be listed in protected resource metadata
      expect(protectedResource.data.authorization_servers).toContain(authServer.data.issuer);
    });
  });

  describe('Public Endpoints', () => {
    test('should allow access to health endpoint without authentication', async () => {
      const response = await unauthenticatedClient.get('/healthz');

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        status: 'ok',
      });
    });

    test('should allow access to OpenAPI endpoint without authentication', async () => {
      const response = await unauthenticatedClient.get('/api/v1/openapi');

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        openapi: expect.stringMatching(/^3\./),
        info: expect.objectContaining({
          title: expect.any(String),
          version: expect.any(String),
        }),
        paths: expect.any(Object),
      });
    });
  });

  describe('Admin Token Authentication', () => {
    test('should allow access to protected endpoints with valid admin token', async () => {
      // The integrationTest.httpClient is configured with DOT_AI_AUTH_TOKEN
      const response = await integrationTest.httpClient.get('/api/v1/tools');

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        tools: expect.any(Array),
        total: expect.any(Number),
      });
    });

    test('should allow access to version tool with valid admin token', async () => {
      const response = await integrationTest.httpClient.post('/api/v1/tools/version', {});

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        result: expect.objectContaining({
          success: true,
        }),
        tool: 'version',
      });
    });
  });

  describe('Unauthenticated Access Denied', () => {
    test('should return 401 for tools endpoint without authentication', async () => {
      const response = await unauthenticatedClient.get('/api/v1/tools');

      expect(response.success).toBe(false);
      expect(response.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Authentication required'),
      });
    });

    test('should return 401 for tool execution without authentication', async () => {
      const response = await unauthenticatedClient.post('/api/v1/tools/version', {});

      expect(response.success).toBe(false);
      expect(response.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Authentication required'),
      });
    });

    test('should return 401 for resources endpoint without authentication', async () => {
      const response = await unauthenticatedClient.get('/api/v1/resources?kind=Pod&apiVersion=v1');

      expect(response.success).toBe(false);
      expect(response.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Authentication required'),
      });
    });
  });

  describe('Invalid Token Handling', () => {
    test('should return 401 for invalid admin token', async () => {
      const invalidTokenClient = new HttpRestApiClient({
        headers: {
          'Authorization': 'Bearer invalid-token-that-does-not-exist',
        },
      });

      const response = await invalidTokenClient.get('/api/v1/tools');

      expect(response.success).toBe(false);
      expect(response.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Invalid authentication token'),
      });
    });

    test('should return 401 for malformed authorization header', async () => {
      const malformedClient = new HttpRestApiClient({
        headers: {
          'Authorization': 'NotBearer some-token',
        },
      });

      const response = await malformedClient.get('/api/v1/tools');

      expect(response.success).toBe(false);
      expect(response.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Expected: Bearer'),
      });
    });

    test('should return 401 for empty bearer token', async () => {
      const emptyTokenClient = new HttpRestApiClient({
        headers: {
          'Authorization': 'Bearer ',
        },
      });

      const response = await emptyTokenClient.get('/api/v1/tools');

      expect(response.success).toBe(false);
      expect(response.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('empty'),
      });
    });
  });
});
