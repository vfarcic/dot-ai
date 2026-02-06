/**
 * Test Provider & JWT Authentication Integration Tests
 *
 * PRD #360: User Authentication & Access Control - Milestone 3
 *
 * Tests for:
 * - Test token grant via /oauth/token (grant_type=test_token)
 * - Allowed users access control (GITHUB_ALLOWED_USERS)
 * - JWT authentication flow
 * - Token validation (via API access)
 * - Refresh token flow
 * - Token claims verification
 * - Security edge cases
 *
 * NOT covered (requires real GitHub OAuth flow):
 * - Allowed orgs access control (GITHUB_ALLOWED_ORGS) - tested via real GitHub callback
 * - GitHub user/org membership verification - requires live GitHub API
 *
 * Test configuration (set in run-integration-tests.sh):
 * - auth.testMode=true
 * - auth.github.allowedUsers="allowed-user-1,allowed-user-2,test-user"
 * - auth.github.allowedOrgs="allowed-org-1,allowed-org-2"
 */

import { describe, test, beforeAll, expect } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import { HttpRestApiClient } from '../helpers/http-client.js';

describe.concurrent('Test Provider & JWT Authentication', () => {
  let integrationTest: IntegrationTest;
  let unauthenticatedClient: HttpRestApiClient;

  beforeAll(() => {
    integrationTest = new IntegrationTest();
    unauthenticatedClient = new HttpRestApiClient({});
  });

  describe('Test Token Grant - Allowed Users', () => {
    test('should issue JWT for allowed user via test_token grant', async () => {
      // 'allowed-user-1' is in GITHUB_ALLOWED_USERS configured in test script
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-1',
        name: 'Allowed User One',
        email: 'allowed1@test.local',
      });

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        access_token: expect.any(String),
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: expect.any(String),
        scope: 'mcp:read mcp:write',
      });

      // Verify token is a valid JWT format (header.payload.signature)
      const token = response.data.access_token;
      const parts = token.split('.');
      expect(parts.length).toBe(3);
    });

    test('should issue JWT for another allowed user', async () => {
      // 'allowed-user-2' is also in GITHUB_ALLOWED_USERS
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-2',
      });

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        access_token: expect.any(String),
        token_type: 'Bearer',
      });
    });

    test('should issue JWT with case-insensitive user matching', async () => {
      // User matching should be case-insensitive
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'ALLOWED-USER-1', // Uppercase version
      });

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        access_token: expect.any(String),
      });
    });

    test('should reject non-allowed user', async () => {
      // 'unauthorized-user' is NOT in GITHUB_ALLOWED_USERS
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'unauthorized-user',
      });

      // OAuth error response format
      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'access_denied',
        error_description: expect.stringContaining('unauthorized-user'),
      });
    });

    test('should reject empty user_id', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: '',
      });

      // OAuth error response format
      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: expect.stringMatching(/invalid_request|access_denied/),
        error_description: expect.any(String),
      });
    });

    test('should reject missing user_id', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('user_id'),
      });
    });

    test('should issue JWT with custom scope', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-1',
        scope: 'mcp:read mcp:write mcp:admin',
      });

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        scope: 'mcp:read mcp:write mcp:admin',
      });
    });
  });

  describe('JWT Authentication Flow', () => {
    test('should authenticate API requests with JWT from test_token grant', async () => {
      // Step 1: Get a JWT via test_token grant
      const tokenResponse = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'test-user',
        name: 'Test User',
      });

      expect(tokenResponse.success).toBe(true);
      const accessToken = tokenResponse.data.access_token;

      // Step 2: Use JWT to access protected endpoint
      const jwtClient = new HttpRestApiClient({
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const response = await jwtClient.get('/api/v1/tools');

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        tools: expect.any(Array),
        total: expect.any(Number),
      });
    });

    test('should authenticate tool execution with JWT', async () => {
      // Get JWT
      const tokenResponse = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'test-user',
      });

      const accessToken = tokenResponse.data.access_token;

      const jwtClient = new HttpRestApiClient({
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      // Execute a tool with JWT auth
      const response = await jwtClient.post('/api/v1/tools/version', {});

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        result: expect.objectContaining({
          status: 'success',
        }),
        tool: 'version',
      });
    });
  });

  describe('Token Validation via API Access', () => {
    test('should accept valid JWT for protected endpoints', async () => {
      // Get JWT
      const tokenResponse = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-1',
      });

      expect(tokenResponse.success).toBe(true);
      const accessToken = tokenResponse.data.access_token;

      const jwtClient = new HttpRestApiClient({
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      // Token should be accepted
      const response = await jwtClient.get('/api/v1/tools');
      expect(response.success).toBe(true);
    });

    test('should reject invalid token for protected endpoints', async () => {
      const invalidClient = new HttpRestApiClient({
        headers: {
          'Authorization': 'Bearer invalid-token-not-jwt-format',
        },
      });

      const response = await invalidClient.get('/api/v1/tools');

      expect(response.success).toBe(false);
      expect(response.error).toMatchObject({
        code: 'UNAUTHORIZED',
        message: expect.stringContaining('Invalid token'),
      });
    });

    test('should reject malformed JWT for protected endpoints', async () => {
      // JWT format but invalid signature
      const malformedJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0In0.invalid-signature';

      const malformedClient = new HttpRestApiClient({
        headers: {
          'Authorization': `Bearer ${malformedJwt}`,
        },
      });

      const response = await malformedClient.get('/api/v1/tools');

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Refresh Token Flow', () => {
    test('should refresh access token using refresh_token grant', async () => {
      // Step 1: Get initial tokens via test_token grant
      const tokenResponse = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-1',
      });

      expect(tokenResponse.success).toBe(true);
      const refreshToken = tokenResponse.data.refresh_token;

      // Step 2: Exchange refresh token for new access token
      const refreshResponse = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      expect(refreshResponse.success).toBe(true);
      expect(refreshResponse.data).toMatchObject({
        access_token: expect.any(String),
        token_type: 'Bearer',
        expires_in: expect.any(Number),
        refresh_token: expect.any(String),
        scope: expect.any(String),
      });

      // Verify new access token works
      const jwtClient = new HttpRestApiClient({
        headers: {
          'Authorization': `Bearer ${refreshResponse.data.access_token}`,
        },
      });

      const apiResponse = await jwtClient.get('/api/v1/tools');
      expect(apiResponse.success).toBe(true);
    });

    test('should reject invalid refresh token', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: 'invalid-refresh-token',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_grant',
        error_description: expect.stringContaining('Invalid or expired'),
      });
    });

    test('should reject reused refresh token (rotation)', async () => {
      // Get tokens
      const tokenResponse = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-1',
      });

      const refreshToken = tokenResponse.data.refresh_token;

      // First refresh - should succeed
      const firstRefresh = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      expect(firstRefresh.success).toBe(true);

      // Second refresh with same token - should fail (token was rotated)
      const secondRefresh = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken, // Same token again
      });

      expect(secondRefresh.success).toBe(false);
      expect(secondRefresh.data).toMatchObject({
        error: 'invalid_grant',
      });
    });
  });

  describe('Multiple Token Types Coexistence', () => {
    test('should accept both admin token and JWT for same endpoint', async () => {
      // Get JWT via test_token grant
      const tokenResponse = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-1',
      });

      const accessToken = tokenResponse.data.access_token;

      // Test with admin token
      const adminResponse = await integrationTest.httpClient.get('/api/v1/tools');
      expect(adminResponse.success).toBe(true);

      // Test with JWT
      const jwtClient = new HttpRestApiClient({
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const jwtResponse = await jwtClient.get('/api/v1/tools');
      expect(jwtResponse.success).toBe(true);

      // Both should return same structure
      expect(adminResponse.data.tools.length).toBe(jwtResponse.data.tools.length);
    });
  });

  describe('Token Claims Verification', () => {
    test('should include correct claims in JWT', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-1',
        name: 'Claims Test User',
        email: 'claims@test.local',
        scope: 'mcp:read mcp:admin',
      });

      expect(response.success).toBe(true);
      const accessToken = response.data.access_token;

      // Decode JWT payload (base64url) to verify claims
      const payloadBase64 = accessToken.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

      expect(payload).toMatchObject({
        sub: 'test:allowed-user-1',
        iss: expect.stringMatching(/^https?:\/\//),
        aud: expect.stringMatching(/^https?:\/\//),
        exp: expect.any(Number),
        iat: expect.any(Number),
        name: 'Claims Test User',
        email: 'claims@test.local',
        provider: 'test',
        provider_id: 'allowed-user-1',
        scope: 'mcp:read mcp:admin',
      });

      // Verify timestamps are reasonable
      const now = Math.floor(Date.now() / 1000);
      expect(payload.iat).toBeLessThanOrEqual(now + 5); // Allow 5s clock skew
      expect(payload.exp).toBeGreaterThan(now);
      expect(payload.exp - payload.iat).toBe(3600); // 1 hour TTL
    });

    test('should use default values for optional claims', async () => {
      // Use allowed-user-2 with no optional params to test defaults
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-2',
        // No name, email, or scope provided
      });

      expect(response.success).toBe(true);
      const accessToken = response.data.access_token;

      // Decode JWT payload
      const payloadBase64 = accessToken.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

      // Defaults should be applied
      expect(payload.name).toBe('allowed-user-2'); // Defaults to user_id
      expect(payload.email).toBe('allowed-user-2@test.local'); // Defaults to user_id@test.local
      expect(payload.scope).toBe('mcp:read mcp:write'); // Default scope
    });
  });

  describe('User Context Propagation to Tool Handlers', () => {
    test('should propagate JWT user context to version tool response', async () => {
      // Get JWT with specific user claims
      const tokenResponse = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'test_token',
        user_id: 'allowed-user-1',
        name: 'Context Test User',
        email: 'context@test.local',
        scope: 'mcp:read mcp:write',
      });

      expect(tokenResponse.success).toBe(true);
      const accessToken = tokenResponse.data.access_token;

      // Call version tool with JWT - user context should be propagated
      const jwtClient = new HttpRestApiClient({
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      const versionResponse = await jwtClient.post('/api/v1/tools/version', {});

      expect(versionResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'success',
            authenticatedUser: {
              id: 'test:allowed-user-1',
              name: 'Context Test User',
              email: 'context@test.local',
              provider: 'test',
              providerId: 'allowed-user-1',
              scopes: ['mcp:read', 'mcp:write'],
            },
          },
        },
      });
    });

    test('should propagate admin token context to version tool response', async () => {
      // Call version tool with admin token
      const versionResponse = await integrationTest.httpClient.post('/api/v1/tools/version', {});

      expect(versionResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'success',
            authenticatedUser: {
              id: 'admin',
              name: 'Admin',
              provider: 'admin_token',
            },
          },
        },
      });
    });
  });

  describe('Security Edge Cases', () => {
    test('should use constant-time comparison for admin token', async () => {
      // This test ensures timing attacks are mitigated
      // We can't directly test timing, but we verify that:
      // 1. Wrong token is rejected
      // 2. Partial match is rejected
      // 3. Different length token is rejected

      const wrongToken = new HttpRestApiClient({
        headers: { 'Authorization': 'Bearer wrong-token' },
      });
      const partialToken = new HttpRestApiClient({
        headers: { 'Authorization': 'Bearer test-auth-token' }, // Missing '-integration'
      });
      const longToken = new HttpRestApiClient({
        headers: { 'Authorization': 'Bearer test-auth-token-integration-extra-stuff' },
      });

      const [wrongResponse, partialResponse, longResponse] = await Promise.all([
        wrongToken.get('/api/v1/tools'),
        partialToken.get('/api/v1/tools'),
        longToken.get('/api/v1/tools'),
      ]);

      // All should be rejected with same error type
      expect(wrongResponse.success).toBe(false);
      expect(partialResponse.success).toBe(false);
      expect(longResponse.success).toBe(false);

      expect(wrongResponse.error?.code).toBe('UNAUTHORIZED');
      expect(partialResponse.error?.code).toBe('UNAUTHORIZED');
      expect(longResponse.error?.code).toBe('UNAUTHORIZED');
    });

    test('should not leak information in error messages', async () => {
      const invalidClient = new HttpRestApiClient({
        headers: { 'Authorization': 'Bearer invalid' },
      });

      const response = await invalidClient.get('/api/v1/tools');

      expect(response.success).toBe(false);
      // Error message should not reveal admin token or valid tokens
      expect(response.error?.message).not.toContain('test-auth-token-integration');
      expect(response.error?.message).not.toMatch(/eyJ/); // No JWT fragments
    });
  });
});
