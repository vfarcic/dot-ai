/**
 * Unit Tests: Mock Server Fixtures
 *
 * Validates that all mock server routes with fixture references
 * point to valid JSON files with the expected response structure.
 */

import { describe, test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MOCK_SERVER_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'mock-server'
);
const FIXTURES_DIR = join(MOCK_SERVER_DIR, 'fixtures');

/**
 * Load and parse a fixture file
 */
async function loadFixture(relativePath: string): Promise<unknown> {
  const content = await readFile(join(FIXTURES_DIR, relativePath), 'utf-8');
  return JSON.parse(content);
}

describe('Mock Server Fixtures', () => {
  describe('GET /api/v1/tools - Tool Discovery', () => {
    test('should have valid fixture with tools array and metadata', async () => {
      const fixture = (await loadFixture(
        'tools/discovery-success.json'
      )) as any;

      expect(fixture).toMatchObject({
        success: true,
        data: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
              description: expect.any(String),
              parameters: expect.any(Array),
            }),
          ]),
          total: expect.any(Number),
        },
        meta: {
          timestamp: expect.any(String),
          version: '1.0.0',
        },
      });

      // Verify specific tools exist with correct structure
      const toolNames = fixture.data.tools.map((t: any) => t.name);
      expect(toolNames).toContain('query');
      expect(toolNames).toContain('recommend');
      expect(toolNames).toContain('remediate');

      // Verify parameters have required fields
      for (const tool of fixture.data.tools) {
        for (const param of tool.parameters) {
          expect(param).toMatchObject({
            name: expect.any(String),
            type: expect.any(String),
            description: expect.any(String),
            required: expect.any(Boolean),
          });
        }
      }

      // Verify total matches actual array length
      expect(fixture.data.total).toBe(fixture.data.tools.length);
    });
  });

  describe('GET /api/v1/prompts - List Prompts', () => {
    test('should have valid fixture with prompts array and arguments', async () => {
      const fixture = (await loadFixture('prompts/list-success.json')) as any;

      expect(fixture).toMatchObject({
        success: true,
        data: {
          prompts: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
              description: expect.any(String),
              arguments: expect.any(Array),
            }),
          ]),
        },
        meta: {
          timestamp: expect.any(String),
          version: '1.0.0',
        },
      });

      // Verify specific prompts exist
      const promptNames = fixture.data.prompts.map((p: any) => p.name);
      expect(promptNames).toContain('troubleshoot-pod');
      expect(promptNames).toContain('explain-resource');
      expect(promptNames).toContain('security-review');

      // Verify arguments have required fields
      for (const prompt of fixture.data.prompts) {
        for (const arg of prompt.arguments) {
          expect(arg).toMatchObject({
            name: expect.any(String),
            description: expect.any(String),
            required: expect.any(Boolean),
          });
        }
      }
    });
  });

  describe('GET /api/v1/users - List Users', () => {
    test('should have valid fixture with users array and total', async () => {
      const fixture = (await loadFixture('users/list-success.json')) as any;

      expect(fixture).toMatchObject({
        success: true,
        data: {
          users: expect.arrayContaining([
            expect.objectContaining({
              email: expect.any(String),
            }),
          ]),
          total: expect.any(Number),
        },
        meta: {
          timestamp: expect.any(String),
          version: '1.0.0',
        },
      });

      // Verify total matches actual array length
      expect(fixture.data.total).toBe(fixture.data.users.length);

      // Verify admin user exists
      const emails = fixture.data.users.map((u: any) => u.email);
      expect(emails).toContain('admin@dot-ai.local');
    });
  });

  describe('POST /api/v1/users - Create User', () => {
    test('should have valid fixture with created user email and message', async () => {
      const fixture = (await loadFixture('users/create-success.json')) as any;

      expect(fixture).toMatchObject({
        success: true,
        data: {
          email: expect.any(String),
          message: expect.any(String),
        },
        meta: {
          timestamp: expect.any(String),
          version: '1.0.0',
        },
      });
    });
  });

  describe('DELETE /api/v1/users/:email - Delete User', () => {
    test('should have valid fixture with deleted user email and message', async () => {
      const fixture = (await loadFixture('users/delete-success.json')) as any;

      expect(fixture).toMatchObject({
        success: true,
        data: {
          email: expect.any(String),
          message: expect.any(String),
        },
        meta: {
          timestamp: expect.any(String),
          version: '1.0.0',
        },
      });
    });
  });

  describe('POST /api/v1/prompts/:promptName - Get Prompt', () => {
    test('should have valid fixture with messages array', async () => {
      const fixture = (await loadFixture('prompts/get-success.json')) as any;

      expect(fixture).toMatchObject({
        success: true,
        data: {
          description: expect.any(String),
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.objectContaining({
                type: 'text',
                text: expect.any(String),
              }),
            }),
          ]),
        },
        meta: {
          timestamp: expect.any(String),
          version: '1.0.0',
        },
      });

      // Verify messages content is non-empty
      expect(fixture.data.messages.length).toBeGreaterThan(0);
      expect(fixture.data.messages[0].content.text.length).toBeGreaterThan(0);
    });
  });

  describe('OAuth Endpoints', () => {
    test('GET /.well-known/oauth-authorization-server should have valid metadata', async () => {
      const fixture = (await loadFixture('oauth/authorization-server-metadata.json')) as any;

      expect(fixture).toMatchObject({
        issuer: expect.any(String),
        authorization_endpoint: expect.stringContaining('/authorize'),
        token_endpoint: expect.stringContaining('/token'),
        registration_endpoint: expect.stringContaining('/register'),
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
      });
    });

    test('GET /.well-known/oauth-protected-resource should have valid metadata', async () => {
      const fixture = (await loadFixture('oauth/protected-resource-metadata.json')) as any;

      expect(fixture).toMatchObject({
        resource: expect.any(String),
        authorization_servers: expect.arrayContaining([expect.any(String)]),
        bearer_methods_supported: ['header'],
      });
    });

    test('POST /register should return client registration', async () => {
      const fixture = (await loadFixture('oauth/register-success.json')) as any;

      expect(fixture).toMatchObject({
        client_id: expect.any(String),
        client_id_issued_at: expect.any(Number),
        client_name: expect.any(String),
        redirect_uris: expect.arrayContaining([expect.any(String)]),
        grant_types: ['authorization_code'],
        response_types: ['code'],
      });
    });

    test('POST /token should return access token', async () => {
      const fixture = (await loadFixture('oauth/token-success.json')) as any;

      expect(fixture).toMatchObject({
        access_token: expect.any(String),
        token_type: 'bearer',
        expires_in: expect.any(Number),
      });
    });
  });
});
