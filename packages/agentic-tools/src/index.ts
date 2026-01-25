#!/usr/bin/env node
/**
 * Agentic Tools Plugin - HTTP Server
 *
 * Exposes kubectl and other agentic tools via HTTP interface.
 * dot-ai discovers tools via POST /execute {hook: "describe"}
 * dot-ai invokes tools via POST /execute {hook: "invoke", ...}
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { handleDescribe } from './hooks/describe';
import { handleInvoke } from './hooks/invoke';
import { ExecuteRequest } from './types';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Send error response
 */
function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

/**
 * Handle POST /execute requests
 */
async function handleExecute(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: ExecuteRequest;

  try {
    body = await parseBody(req) as ExecuteRequest;
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  if (!body.hook) {
    sendError(res, 400, 'Missing required field: hook');
    return;
  }

  switch (body.hook) {
    case 'describe': {
      const response = handleDescribe();
      sendJson(res, 200, response);
      break;
    }

    case 'invoke': {
      if (!body.payload) {
        sendError(res, 400, 'Missing required field: payload');
        return;
      }
      if (!body.payload.tool) {
        sendError(res, 400, 'Missing required field: payload.tool');
        return;
      }

      const sessionId = body.sessionId || 'anonymous';
      const response = await handleInvoke(sessionId, {
        tool: body.payload.tool,
        args: body.payload.args || {},
        state: body.payload.state || {}
      });
      sendJson(res, 200, response);
      break;
    }

    default:
      sendError(res, 400, `Unknown hook: ${body.hook}`);
  }
}

/**
 * Main request handler
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { method, url } = req;

  // Health check endpoint
  if (method === 'GET' && url === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  // Readiness check endpoint
  if (method === 'GET' && url === '/ready') {
    sendJson(res, 200, { status: 'ready' });
    return;
  }

  // Main execute endpoint
  if (method === 'POST' && url === '/execute') {
    await handleExecute(req, res);
    return;
  }

  // 404 for everything else
  sendError(res, 404, 'Not found');
}

/**
 * Create and start the HTTP server
 */
const server = createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error('Unhandled error:', error);
    sendError(res, 500, 'Internal server error');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`agentic-tools plugin listening on ${HOST}:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /health  - Health check');
  console.log('  GET  /ready   - Readiness check');
  console.log('  POST /execute - Hook dispatcher (describe, invoke)');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
