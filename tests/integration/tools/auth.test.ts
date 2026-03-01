/**
 * Integration Test: Authentication (PRD #380 Task 2.1)
 *
 * Tests auth rejection for unauthenticated/invalid requests.
 * Legacy token acceptance is already covered by all other integration tests
 * (IntegrationTest base class auto-injects DOT_AI_AUTH_TOKEN).
 */

import { describe, test, expect } from 'vitest';
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
});
