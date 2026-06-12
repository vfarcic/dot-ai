/**
 * Mock MCP Server
 *
 * Lightweight HTTP server that serves fixture data for testing.
 * Uses Node.js built-in http module (no Express).
 *
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { matchRoute, getAllRoutes } from './routes.js';
import {
  applyPromptsRepoOverride,
  coerceOverrideParam,
  getOverridePathBranchFixture,
  isPromptsRoutePath,
  selectsOverridePathBranchSet,
  validatePromptsOverride,
} from './prompts-override.js';
import { BodyTooLargeError, readJsonBody } from './read-json-body.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Fixtures are in ../fixtures relative to dist/ (or ./fixtures when running from source)
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

/**
 * Set CORS headers for browser compatibility
 */
function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  // PRD #621 M2/M5: advertise the X-Dot-AI-Git-Token credential header so the
  // CLI's preflight succeeds, mirroring the real server's CORS allowlist.
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Dot-AI-Git-Token'
  );
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Load fixture file
 */
async function loadFixture(fixturePath: string): Promise<unknown> {
  const fullPath = join(FIXTURES_DIR, fixturePath);
  const content = await readFile(fullPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Handle incoming HTTP requests
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  // Health check endpoint
  if (path === '/health' && method === 'GET') {
    sendJson(res, 200, {
      status: 'healthy',
      service: 'mock-mcp-server',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // List all available routes (for debugging)
  if (path === '/routes' && method === 'GET') {
    const routes = getAllRoutes().map(r => ({
      method: r.method,
      path: r.path,
      description: r.description,
      hasFixture: !!r.fixture,
    }));
    sendJson(res, 200, { routes });
    return;
  }

  // Match against API routes
  const match = matchRoute(method, path);

  if (!match) {
    sendJson(res, 404, {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `No route matches ${method} ${path}`,
      },
    });
    return;
  }

  const { route, params } = match;

  // Handle redirect routes (e.g., /authorize)
  if (route.redirect) {
    const redirectUri =
      url.searchParams.get('redirect_uri') || 'http://localhost:3000/callback';
    const state = url.searchParams.get('state') || '';
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('code', 'mock-authorization-code-12345');
    if (state) redirectUrl.searchParams.set('state', state);
    res.writeHead(302, { Location: redirectUrl.toString() });
    res.end();
    return;
  }

  // Check if fixture is configured
  if (!route.fixture) {
    sendJson(res, 501, {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: `Route ${method} ${route.path} exists but has no fixture configured yet`,
        hint: 'This endpoint is recognized but awaiting fixture implementation',
      },
      route: {
        method: route.method,
        path: route.path,
        description: route.description,
        params,
      },
    });
    return;
  }

  // Load and return fixture. For prompts routes, mirror the real server's
  // per-request override contract (PRD #581 `repo`; PRD #621 `path`/`branch`
  // + X-Dot-AI-Git-Token header).
  try {
    const fixture = await loadFixture(route.fixture);
    let payload: unknown = fixture;
    if (isPromptsRoutePath(route.path)) {
      // Mirror the real server's override-source contract exactly:
      //   - POST /api/v1/prompts/refresh → repo/path/branch from the JSON BODY
      //     ONLY (the real handler reads bodyObj.repo/path/branch; query is not
      //     consulted for /refresh).
      //   - GET /api/v1/prompts and POST /api/v1/prompts/:name → from the QUERY.
      let repo: string | undefined;
      let pathParam: string | undefined;
      let branchParam: string | undefined;
      if (method === 'POST' && route.path === '/api/v1/prompts/refresh') {
        const body = await readJsonBody(req);
        repo = coerceOverrideParam(body?.['repo']);
        pathParam = coerceOverrideParam(body?.['path']);
        branchParam = coerceOverrideParam(body?.['branch']);
      } else {
        repo = coerceOverrideParam(url.searchParams.get('repo'));
        pathParam = coerceOverrideParam(url.searchParams.get('path'));
        branchParam = coerceOverrideParam(url.searchParams.get('branch'));
      }

      // The credential travels ONLY as the X-Dot-AI-Git-Token header. The mock
      // advertises it via CORS and tolerates it here, but it is intentionally
      // never read into — nor reflected by — the response, `source`, or logs.

      // Invalid path/branch (only meaningful with a repo override) → 400 with
      // credentials scrubbed, exactly as the real server.
      const validation = validatePromptsOverride({
        repo,
        path: pathParam,
        branch: branchParam,
      });
      if (!validation.ok) {
        sendJson(res, 400, {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validation.message },
        });
        return;
      }

      // A repo override carrying BOTH a path and a branch resolves a DISTINCT
      // prompt set (mirrors the real server resolving a subdir on a non-default
      // branch). Otherwise the default (root@main) fixture is used.
      let baseFixture: unknown = fixture;
      if (selectsOverridePathBranchSet({ repo, path: pathParam, branch: branchParam })) {
        const overrideFixture = getOverridePathBranchFixture(route.path);
        if (overrideFixture) {
          baseFixture = await loadFixture(overrideFixture);
        }
      }

      payload = applyPromptsRepoOverride(baseFixture, repo);
    }
    sendJson(res, 200, payload);
  } catch (error) {
    // F4: oversized body → 413, not 500.
    if (error instanceof BodyTooLargeError) {
      sendJson(res, 413, {
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: error.message,
        },
      });
      return;
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'FIXTURE_LOAD_ERROR',
        message: `Failed to load fixture: ${route.fixture}`,
        details: errorMessage,
      },
    });
  }
}

/**
 * Start the server
 */
const server = createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error('Unhandled error:', error);
    sendJson(res, 500, {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });
});

server.listen(PORT, () => {
  console.log(`Mock MCP Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  /health  - Health check`);
  console.log(`  GET  /routes  - List all routes`);
  console.log('');
  console.log('API routes (501 until fixtures are configured):');
  for (const route of getAllRoutes()) {
    const status = route.fixture ? '  [OK]' : '[TODO]';
    console.log(`  ${status} ${route.method.padEnd(6)} ${route.path}`);
  }
});
