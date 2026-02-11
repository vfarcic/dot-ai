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
});
