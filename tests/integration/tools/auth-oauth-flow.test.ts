/**
 * OAuth Flow Integration Tests
 *
 * PRD #360: User Authentication & Access Control - Milestone 2
 *
 * Tests for the complete OAuth 2.1 authorization flow:
 * - /oauth/authorize endpoint (initiate flow)
 * - /oauth/callback endpoint (receive callback)
 * - /oauth/token endpoint (token exchange and refresh)
 * - PKCE validation
 * - Error handling
 *
 * Note: These tests validate the OAuth infrastructure without requiring
 * actual GitHub credentials. Full end-to-end testing with GitHub requires
 * manual testing or a separate e2e test suite with real credentials.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import { HttpRestApiClient } from '../helpers/http-client.js';

describe.concurrent('OAuth Flow Integration Tests', () => {
  let integrationTest: IntegrationTest;
  let unauthenticatedClient: HttpRestApiClient;

  beforeAll(() => {
    integrationTest = new IntegrationTest();
    unauthenticatedClient = new HttpRestApiClient({});
  });

  describe('OAuth Authorization Endpoint', () => {
    test('should reject authorize request missing response_type', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/authorize?redirect_uri=http://localhost:3000/callback&state=test-state&code_challenge=test-challenge&code_challenge_method=S256'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('response_type'),
      });
    });

    test('should reject authorize request with wrong response_type', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/authorize?response_type=token&redirect_uri=http://localhost:3000/callback&state=test-state&code_challenge=test-challenge&code_challenge_method=S256'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('"code"'),
      });
    });

    test('should reject authorize request missing redirect_uri', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/authorize?response_type=code&state=test-state&code_challenge=test-challenge&code_challenge_method=S256'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('redirect_uri'),
      });
    });

    test('should reject authorize request missing state', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/authorize?response_type=code&redirect_uri=http://localhost:3000/callback&code_challenge=test-challenge&code_challenge_method=S256'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('state'),
      });
    });

    test('should reject authorize request missing code_challenge', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/authorize?response_type=code&redirect_uri=http://localhost:3000/callback&state=test-state&code_challenge_method=S256'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('code_challenge'),
      });
    });

    test('should reject authorize request with non-S256 code_challenge_method', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/authorize?response_type=code&redirect_uri=http://localhost:3000/callback&state=test-state&code_challenge=test-challenge&code_challenge_method=plain'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('S256'),
      });
    });

    test('should reject authorize request missing code_challenge_method', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/authorize?response_type=code&redirect_uri=http://localhost:3000/callback&state=test-state&code_challenge=test-challenge'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('code_challenge_method'),
      });
    });
  });

  describe('OAuth Callback Endpoint', () => {
    test('should reject callback with missing state', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/callback?code=test-code'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('state'),
      });
    });

    test('should reject callback with invalid state', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/callback?code=test-code&state=invalid-state-that-does-not-exist'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_grant',
        error_description: expect.stringContaining('Invalid or expired state'),
      });
    });

    test('should handle GitHub error in callback', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/callback?error=access_denied&error_description=User%20denied%20access&state=test-state'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'access_denied',
        error_description: 'User denied access',
      });
    });

    test('should reject callback missing code when no error', async () => {
      const response = await unauthenticatedClient.get(
        '/oauth/callback?state=test-state'
      );

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('code'),
      });
    });
  });

  describe('OAuth Token Endpoint', () => {
    test('should reject token request with missing grant_type', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        code: 'test-code',
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: 'test-verifier',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('grant_type'),
      });
    });

    test('should reject token request with unsupported grant_type', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'password',
        username: 'test',
        password: 'test',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'unsupported_grant_type',
        error_description: expect.stringContaining('password'),
      });
    });

    test('should reject authorization_code grant with missing code', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'authorization_code',
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: 'test-verifier',
        state: 'test-state',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('code'),
      });
    });

    test('should reject authorization_code grant with missing redirect_uri', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'authorization_code',
        code: 'test-code',
        code_verifier: 'test-verifier',
        state: 'test-state',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('redirect_uri'),
      });
    });

    test('should reject authorization_code grant with missing code_verifier', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'authorization_code',
        code: 'test-code',
        redirect_uri: 'http://localhost:3000/callback',
        state: 'test-state',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('code_verifier'),
      });
    });

    test('should reject authorization_code grant with missing state', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'authorization_code',
        code: 'test-code',
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: 'test-verifier',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('state'),
      });
    });

    test('should reject refresh_token grant with missing refresh_token', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'refresh_token',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_request',
        error_description: expect.stringContaining('refresh_token'),
      });
    });

    test('should reject refresh_token grant with invalid refresh_token', async () => {
      const response = await unauthenticatedClient.post('/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: 'invalid-refresh-token-that-does-not-exist',
      });

      expect(response.success).toBe(false);
      expect(response.data).toMatchObject({
        error: 'invalid_grant',
        error_description: expect.stringContaining('Invalid or expired'),
      });
    });
  });

  describe('OAuth Endpoints Accessibility', () => {
    test('should allow access to /oauth/authorize without authentication', async () => {
      // The endpoint should be accessible (even if it returns an error for missing params)
      const response = await unauthenticatedClient.get('/oauth/authorize');

      // Should return an OAuth error, not a 401 authentication error
      expect(response.data).toMatchObject({
        error: expect.stringMatching(/^(invalid_request|server_error)$/),
      });
    });

    test('should allow access to /oauth/callback without authentication', async () => {
      // The endpoint should be accessible (even if it returns an error for missing params)
      const response = await unauthenticatedClient.get('/oauth/callback');

      // Should return an OAuth error, not a 401 authentication error
      expect(response.data).toMatchObject({
        error: expect.stringMatching(/^(invalid_request|server_error)$/),
      });
    });

    test('should allow access to /oauth/token without authentication', async () => {
      // The endpoint should be accessible (even if it returns an error for missing params)
      const response = await unauthenticatedClient.post('/oauth/token', {});

      // Should return an OAuth error, not a 401 authentication error
      expect(response.data).toMatchObject({
        error: expect.stringMatching(/^(invalid_request|server_error)$/),
      });
    });
  });

  describe('Authorization Server Metadata Consistency', () => {
    test('should have OAuth endpoints matching authorization server metadata', async () => {
      // Get the metadata
      const metadataResponse = await unauthenticatedClient.get('/.well-known/oauth-authorization-server');
      expect(metadataResponse.success).toBe(true);

      const metadata = metadataResponse.data;

      // Verify the authorize endpoint exists and matches metadata
      expect(metadata.authorization_endpoint).toMatch(/\/oauth\/authorize$/);
      expect(metadata.token_endpoint).toMatch(/\/oauth\/token$/);

      // Verify PKCE is required (S256)
      expect(metadata.code_challenge_methods_supported).toContain('S256');

      // Verify supported grant types
      expect(metadata.grant_types_supported).toContain('authorization_code');
      expect(metadata.grant_types_supported).toContain('refresh_token');
    });
  });
});
