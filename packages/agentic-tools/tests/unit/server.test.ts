/**
 * Integration tests for agentic-tools HTTP server
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';

// Import server handlers directly for testing
import { handleDescribe } from '../../src/hooks/describe';
import { handleInvoke } from '../../src/hooks/invoke';

/**
 * Helper to make HTTP requests to the test server
 */
async function request(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json();
  return { status: response.status, data };
}

describe('agentic-tools server', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Create a test server
    server = createServer(async (req, res) => {
      const sendJson = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };

      const sendError = (status: number, message: string) => {
        sendJson(status, { error: message });
      };

      // Parse body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const bodyStr = Buffer.concat(chunks).toString('utf8');
      const body = bodyStr ? JSON.parse(bodyStr) : {};

      const { method, url } = req;

      if (method === 'GET' && url === '/health') {
        sendJson(200, { status: 'ok' });
        return;
      }

      if (method === 'GET' && url === '/ready') {
        sendJson(200, { status: 'ready' });
        return;
      }

      if (method === 'POST' && url === '/execute') {
        if (!body.hook) {
          sendError(400, 'Missing required field: hook');
          return;
        }

        if (body.hook === 'describe') {
          sendJson(200, handleDescribe());
          return;
        }

        if (body.hook === 'invoke') {
          if (!body.payload?.tool) {
            sendError(400, 'Missing required field: payload.tool');
            return;
          }
          const response = await handleInvoke(
            body.sessionId || 'test',
            body.payload
          );
          sendJson(200, response);
          return;
        }

        sendError(400, `Unknown hook: ${body.hook}`);
        return;
      }

      sendError(404, 'Not found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/health');
      expect(status).toBe(200);
      expect(data).toEqual({ status: 'ok' });
    });
  });

  describe('GET /ready', () => {
    it('should return ready status', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/ready');
      expect(status).toBe(200);
      expect(data).toEqual({ status: 'ready' });
    });
  });

  describe('POST /execute - describe hook', () => {
    it('should return plugin metadata and tools', async () => {
      const { status, data } = await request(baseUrl, 'POST', '/execute', {
        hook: 'describe'
      });

      expect(status).toBe(200);
      expect(data).toMatchObject({
        name: 'agentic-tools',
        version: '1.0.0',
        tools: expect.any(Array)
      });
    });

    it('should return empty tools array for M1', async () => {
      const { data } = await request(baseUrl, 'POST', '/execute', {
        hook: 'describe'
      });

      expect((data as { tools: unknown[] }).tools).toHaveLength(0);
    });
  });

  describe('POST /execute - invoke hook', () => {
    it('should return error for unknown tool', async () => {
      const { status, data } = await request(baseUrl, 'POST', '/execute', {
        hook: 'invoke',
        sessionId: 'test-session',
        payload: {
          tool: 'unknown_tool',
          args: {},
          state: {}
        }
      });

      expect(status).toBe(200);
      expect(data).toMatchObject({
        sessionId: 'test-session',
        success: false,
        error: {
          code: 'UNKNOWN_TOOL',
          message: expect.stringContaining('unknown_tool')
        }
      });
    });

    it('should require payload.tool', async () => {
      const { status, data } = await request(baseUrl, 'POST', '/execute', {
        hook: 'invoke',
        payload: {}
      });

      expect(status).toBe(400);
      expect(data).toMatchObject({
        error: expect.stringContaining('payload.tool')
      });
    });
  });

  describe('POST /execute - validation', () => {
    it('should require hook field', async () => {
      const { status, data } = await request(baseUrl, 'POST', '/execute', {});

      expect(status).toBe(400);
      expect(data).toMatchObject({
        error: expect.stringContaining('hook')
      });
    });

    it('should reject unknown hooks', async () => {
      const { status, data } = await request(baseUrl, 'POST', '/execute', {
        hook: 'unknown'
      });

      expect(status).toBe(400);
      expect(data).toMatchObject({
        error: expect.stringContaining('Unknown hook')
      });
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown paths', async () => {
      const { status, data } = await request(baseUrl, 'GET', '/unknown');
      expect(status).toBe(404);
      expect(data).toMatchObject({ error: 'Not found' });
    });
  });
});
