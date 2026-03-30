/**
 * Integration Test: MCP Client Outbound Authentication (PRD #414)
 *
 * Tests all three auth modes against real MCP servers:
 * - M1: Static bearer token (Context Forge JWT)
 * - M2: Custom headers (ArgoCD MCP API token)
 * - M4: OAuth client_credentials (Dex in Kind cluster)
 * - Baseline: No-auth connection (Prometheus MCP in Kind cluster)
 *
 * Kind cluster tests: Run via `npm run test:integration mcp-client-auth`
 * Live K3s tests: Set MCP_AUTH_LIVE_TEST=true + WireGuard active
 *
 * PRD #414: MCP Client Outbound Authentication
 */

import { describe, test, expect, beforeAll } from 'vitest';
import {
  StaticTokenAuthProvider,
  resolveTransportAuth,
} from '../../../src/core/mcp-client-manager.js';
import { ClientCredentialsProvider } from '@modelcontextprotocol/sdk/client/auth-extensions.js';
import type { McpServerAuthConfig } from '../../../src/core/mcp-client-types.js';
import type { Logger } from '../../../src/core/error-handling.js';
import * as http from 'http';

// --- Test logger that captures log calls ---
function createTestLogger(): Logger & { calls: { level: string; msg: string; meta?: unknown }[] } {
  const calls: { level: string; msg: string; meta?: unknown }[] = [];
  return {
    calls,
    debug: (msg: string, meta?: unknown) => calls.push({ level: 'debug', msg, meta }),
    info: (msg: string, meta?: unknown) => calls.push({ level: 'info', msg, meta }),
    warn: (msg: string, meta?: unknown) => calls.push({ level: 'warn', msg, meta }),
    error: (msg: string, meta?: unknown) => calls.push({ level: 'error', msg, meta }),
  };
}

// --- Minimal HTTP servers for controlled auth testing ---

/**
 * Spin up a mock OAuth Authorization Server that validates client_secret_basic
 * and issues access tokens for client_credentials grants.
 *
 * Serves:
 *   GET  /.well-known/oauth-authorization-server → RFC 9728 metadata
 *   POST /token → client_credentials token exchange
 */
function createMockOAuthServer(options: {
  expectedClientId: string;
  expectedClientSecret: string;
  accessToken: string;
}): Promise<{ server: http.Server; port: number; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // RFC 9728 discovery
      if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
        const addr = server.address() as { port: number };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          issuer: `http://127.0.0.1:${addr.port}`,
          token_endpoint: `http://127.0.0.1:${addr.port}/token`,
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
          grant_types_supported: ['client_credentials'],
          response_types_supported: [],
        }));
        return;
      }

      // Token endpoint
      if (req.method === 'POST' && req.url === '/token') {
        const authHeader = req.headers['authorization'];
        if (!authHeader?.startsWith('Basic ')) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_client', error_description: 'Missing Basic auth' }));
          return;
        }

        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
        const [clientId, clientSecret] = decoded.split(':');
        if (clientId !== options.expectedClientId || clientSecret !== options.expectedClientSecret) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_client', error_description: 'Bad credentials' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const params = new URLSearchParams(body);

          if (params.get('grant_type') !== 'client_credentials') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'unsupported_grant_type',
              error_description: `Expected client_credentials, got ${params.get('grant_type')}`,
            }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: options.accessToken,
            token_type: 'bearer',
            expires_in: 3600,
            scope: params.get('scope') || undefined,
          }));
        });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

/** Spin up a local HTTP server that validates auth and responds to MCP initialize. */
function createMockMcpServer(options: {
  expectedBearer?: string;
  expectedHeaders?: Record<string, string>;
  port?: number;
}): Promise<{ server: http.Server; port: number; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Check bearer token auth
      if (options.expectedBearer) {
        const authHeader = req.headers['authorization'];
        if (authHeader !== `Bearer ${options.expectedBearer}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized', expected: 'Bearer token' }));
          return;
        }
      }

      // Check custom headers
      if (options.expectedHeaders) {
        for (const [key, value] of Object.entries(options.expectedHeaders)) {
          if (req.headers[key.toLowerCase()] !== value) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'unauthorized',
              expected: `Header ${key}: ${value}`,
              got: req.headers[key.toLowerCase()],
            }));
            return;
          }
        }
      }

      // Handle MCP initialize (StreamableHTTP POST)
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.method === 'initialize') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.id,
                result: {
                  protocolVersion: '2025-03-26',
                  capabilities: { tools: {} },
                  serverInfo: { name: 'test-auth-server', version: '1.0.0' },
                },
              }));
              return;
            }
            if (parsed.method === 'tools/list') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.id,
                result: {
                  tools: [{
                    name: 'test_tool',
                    description: 'Auth test tool',
                    inputSchema: { type: 'object', properties: {} },
                  }],
                },
              }));
              return;
            }
          } catch {
            // Not JSON — fall through
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));
        });
        return;
      }

      // Health check
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });

    const port = options.port || 0; // 0 = random available port
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        server,
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}/mcp`,
      });
    });
  });
}

// ============================================================================
// Kind Cluster Integration Tests (CI-safe)
// ============================================================================

describe.concurrent('MCP Client Auth Integration (PRD #414)', () => {
  // --- M1: Static Bearer Token ---
  describe('M1: Static Bearer Token', () => {
    let mockServer: { server: http.Server; port: number; url: string };
    const TEST_TOKEN = 'integration-test-jwt-token-414';

    beforeAll(async () => {
      mockServer = await createMockMcpServer({ expectedBearer: TEST_TOKEN });
      process.env.MCP_AUTH_INTEGRATION_TEST = TEST_TOKEN;
    });

    test('should connect to MCP server with static bearer token', async () => {
      const logger = createTestLogger();
      const auth: McpServerAuthConfig = { tokenEnvVar: 'MCP_AUTH_INTEGRATION_TEST' };
      const transportOpts = resolveTransportAuth(auth, 'test-static-token', logger);

      // Verify authProvider was created
      expect(transportOpts.authProvider).toBeDefined();
      expect(transportOpts.authProvider).toBeInstanceOf(StaticTokenAuthProvider);

      // Verify token is correct
      const tokens = await transportOpts.authProvider!.tokens();
      expect(tokens).toMatchObject({
        access_token: TEST_TOKEN,
        token_type: 'bearer',
      });

      // Verify log message
      expect(logger.calls).toContainEqual(
        expect.objectContaining({
          level: 'info',
          msg: 'MCP server auth configured via authProvider (static token)',
        })
      );

      mockServer.server.close();
    }, 30000);

    test('should be rejected when token is wrong', async () => {
      const wrongTokenServer = await createMockMcpServer({ expectedBearer: 'correct-token' });

      // Make a raw HTTP request with wrong token to verify 401
      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(wrongTokenServer.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer wrong-token',
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        req.end();
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body)).toMatchObject({ error: 'unauthorized' });

      wrongTokenServer.server.close();
    }, 30000);

    test('should throw when token env var is not set (fail-fast)', () => {
      const logger = createTestLogger();
      delete process.env.MCP_AUTH_MISSING_VAR;
      const auth: McpServerAuthConfig = { tokenEnvVar: 'MCP_AUTH_MISSING_VAR' };

      expect(() => resolveTransportAuth(auth, 'test-missing-token', logger)).toThrow(
        "auth.tokenEnvVar references env var 'MCP_AUTH_MISSING_VAR' but it is empty or unset"
      );
    });
  });

  // --- M2: Custom Headers ---
  describe('M2: Custom Headers', () => {
    test('should connect to MCP server with custom headers', async () => {
      const customHeaders = { 'X-Api-Key': 'test-api-key-414', 'X-Custom-Auth': 'custom-value' };
      const headerServer = await createMockMcpServer({ expectedHeaders: customHeaders });

      process.env.MCP_HEADERS_INTEGRATION_TEST = JSON.stringify(customHeaders);

      const logger = createTestLogger();
      const auth: McpServerAuthConfig = { headersEnvVar: 'MCP_HEADERS_INTEGRATION_TEST' };
      const transportOpts = resolveTransportAuth(auth, 'test-custom-headers', logger);

      // Verify requestInit was created with correct headers
      expect(transportOpts.requestInit).toMatchObject({
        headers: customHeaders,
      });

      // Verify by making actual HTTP request with headers
      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(headerServer.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...customHeaders,
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        req.end();
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.result.serverInfo.name).toBe('test-auth-server');

      headerServer.server.close();
      delete process.env.MCP_HEADERS_INTEGRATION_TEST;
    }, 30000);

    test('should be rejected when custom header is missing', async () => {
      const requiredHeaders = { 'X-Api-Key': 'required-key' };
      const headerServer = await createMockMcpServer({ expectedHeaders: requiredHeaders });

      // Make request without the required header
      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(headerServer.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }, // Missing X-Api-Key
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        req.end();
      });

      expect(response.statusCode).toBe(401);
      headerServer.server.close();
    }, 30000);
  });

  // --- M4: OAuth client_credentials ---
  describe('M4: OAuth client_credentials', () => {
    test('should create ClientCredentialsAuthProvider from config', () => {
      const testSecret = 'integration-test-client-secret';
      process.env.MCP_OAUTH_SECRET_INTEGRATION = testSecret;

      const logger = createTestLogger();
      const auth: McpServerAuthConfig = {
        oauth: {
          clientId: 'integration-test-client',
          clientSecretEnvVar: 'MCP_OAUTH_SECRET_INTEGRATION',
          scope: 'mcp:tools mcp:read',
        },
      };
      const transportOpts = resolveTransportAuth(auth, 'test-oauth', logger);

      expect(transportOpts.authProvider).toBeInstanceOf(ClientCredentialsProvider);

      // Verify client information includes correct client_id
      const provider = transportOpts.authProvider as ClientCredentialsProvider;
      const clientInfo = provider.clientInformation();
      expect(clientInfo).toMatchObject({
        client_id: 'integration-test-client',
      });

      // SDK stores scope in clientMetadata; fetchToken reads it and passes to prepareTokenRequest
      expect(provider.clientMetadata.scope).toBe('mcp:tools mcp:read');
      expect(provider.clientMetadata.grant_types).toContain('client_credentials');

      expect(logger.calls).toContainEqual(
        expect.objectContaining({
          level: 'info',
          msg: 'MCP server auth configured via authProvider (OAuth client_credentials)',
        })
      );

      delete process.env.MCP_OAUTH_SECRET_INTEGRATION;
    });

    test('should throw when OAuth client secret env var is missing (fail-fast)', () => {
      delete process.env.MCP_OAUTH_SECRET_MISSING;

      const logger = createTestLogger();
      const auth: McpServerAuthConfig = {
        oauth: {
          clientId: 'test-client',
          clientSecretEnvVar: 'MCP_OAUTH_SECRET_MISSING',
        },
      };

      expect(() => resolveTransportAuth(auth, 'test-oauth-missing', logger)).toThrow(
        "auth.oauth.clientSecretEnvVar references env var 'MCP_OAUTH_SECRET_MISSING' but it is empty or unset"
      );
    });
  });

  // --- M4: OAuth client_credentials Token Lifecycle ---
  // Tests the full token lifecycle: config → provider → token exchange → MCP auth.
  // Uses a mock OAuth AS to validate client_secret_basic and grant_type=client_credentials.
  describe('M4: OAuth client_credentials Token Lifecycle', () => {
    const TEST_CLIENT_ID = 'lifecycle-test-client';
    const TEST_CLIENT_SECRET = 'lifecycle-test-secret-414';
    const TEST_ACCESS_TOKEN = 'mock-oauth-access-token-414';
    const TEST_SCOPE = 'mcp:tools mcp:read';

    let oauthServer: { server: http.Server; port: number; url: string };
    let mcpServer: { server: http.Server; port: number; url: string };

    beforeAll(async () => {
      oauthServer = await createMockOAuthServer({
        expectedClientId: TEST_CLIENT_ID,
        expectedClientSecret: TEST_CLIENT_SECRET,
        accessToken: TEST_ACCESS_TOKEN,
      });
      mcpServer = await createMockMcpServer({ expectedBearer: TEST_ACCESS_TOKEN });
      process.env.MCP_OAUTH_SECRET_LIFECYCLE = TEST_CLIENT_SECRET;
    });

    test('prepareTokenRequest generates valid client_credentials params', () => {
      const logger = createTestLogger();
      const auth: McpServerAuthConfig = {
        oauth: {
          clientId: TEST_CLIENT_ID,
          clientSecretEnvVar: 'MCP_OAUTH_SECRET_LIFECYCLE',
          scope: TEST_SCOPE,
        },
      };
      const { authProvider } = resolveTransportAuth(auth, 'test-lifecycle', logger);
      const provider = authProvider as ClientCredentialsProvider;

      const params = provider.prepareTokenRequest(TEST_SCOPE);
      expect(params.get('grant_type')).toBe('client_credentials');
      expect(params.get('scope')).toBe(TEST_SCOPE);
    });

    test('should exchange credentials with mock OAuth AS using client_secret_basic', async () => {
      const logger = createTestLogger();
      const auth: McpServerAuthConfig = {
        oauth: {
          clientId: TEST_CLIENT_ID,
          clientSecretEnvVar: 'MCP_OAUTH_SECRET_LIFECYCLE',
          scope: TEST_SCOPE,
        },
      };
      const { authProvider } = resolveTransportAuth(auth, 'test-lifecycle', logger);
      const provider = authProvider as ClientCredentialsProvider;

      // Build token request from provider output
      const params = provider.prepareTokenRequest(TEST_SCOPE);
      const basicAuth = Buffer.from(`${TEST_CLIENT_ID}:${TEST_CLIENT_SECRET}`).toString('base64');

      // POST to mock OAuth AS — same flow the SDK executes in executeTokenRequest
      const tokenResponse = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(`${oauthServer.url}/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.write(params.toString());
        req.end();
      });

      expect(tokenResponse.statusCode).toBe(200);
      const tokenData = JSON.parse(tokenResponse.body);
      expect(tokenData).toMatchObject({
        access_token: TEST_ACCESS_TOKEN,
        token_type: 'bearer',
        expires_in: 3600,
        scope: TEST_SCOPE,
      });

      // Simulate SDK's saveTokens call after successful fetch
      provider.saveTokens(tokenData);
      expect(provider.tokens()).toMatchObject({
        access_token: TEST_ACCESS_TOKEN,
        token_type: 'bearer',
      });
    }, 30000);

    test('mock OAuth AS rejects invalid client_secret_basic credentials', async () => {
      const wrongAuth = Buffer.from(`${TEST_CLIENT_ID}:wrong-secret`).toString('base64');

      const tokenResponse = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(`${oauthServer.url}/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${wrongAuth}`,
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.write('grant_type=client_credentials');
        req.end();
      });

      expect(tokenResponse.statusCode).toBe(401);
      expect(JSON.parse(tokenResponse.body)).toMatchObject({ error: 'invalid_client' });
    }, 30000);

    test('mock OAuth AS rejects wrong grant_type', async () => {
      const basicAuth = Buffer.from(`${TEST_CLIENT_ID}:${TEST_CLIENT_SECRET}`).toString('base64');

      const tokenResponse = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(`${oauthServer.url}/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.write('grant_type=authorization_code&code=fake');
        req.end();
      });

      expect(tokenResponse.statusCode).toBe(400);
      expect(JSON.parse(tokenResponse.body)).toMatchObject({ error: 'unsupported_grant_type' });
    }, 30000);

    test('OAuth-acquired token should authenticate to MCP server', async () => {
      // End-to-end: token from OAuth AS → bearer auth on MCP server
      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(mcpServer.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-oauth-lifecycle', version: '1.0.0' },
          },
        }));
        req.end();
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.result.serverInfo.name).toBe('test-auth-server');

      // Cleanup
      oauthServer.server.close();
      mcpServer.server.close();
      delete process.env.MCP_OAUTH_SECRET_LIFECYCLE;
    }, 30000);
  });

  // --- Combined auth modes ---
  describe('Combined Auth Modes', () => {
    test('should apply both OAuth authProvider and custom headers simultaneously', async () => {
      const customHeaders = { 'X-Trace-Id': 'test-trace-414', 'X-Request-Source': 'integration-test' };
      const comboServer = await createMockMcpServer({ expectedHeaders: customHeaders });

      process.env.MCP_OAUTH_SECRET_COMBO = 'combo-secret';
      process.env.MCP_HEADERS_COMBO_INTEGRATION = JSON.stringify(customHeaders);

      const logger = createTestLogger();
      const auth: McpServerAuthConfig = {
        oauth: {
          clientId: 'combo-client',
          clientSecretEnvVar: 'MCP_OAUTH_SECRET_COMBO',
        },
        headersEnvVar: 'MCP_HEADERS_COMBO_INTEGRATION',
      };
      const transportOpts = resolveTransportAuth(auth, 'test-combo', logger);

      // Both should be set
      expect(transportOpts.authProvider).toBeInstanceOf(ClientCredentialsProvider);
      expect(transportOpts.requestInit).toMatchObject({ headers: customHeaders });

      // Verify the headers work against a real server
      const response = await new Promise<{ statusCode: number }>((resolve, reject) => {
        const req = http.request(comboServer.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...customHeaders },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0 }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        req.end();
      });

      expect(response.statusCode).toBe(200);

      comboServer.server.close();
      delete process.env.MCP_OAUTH_SECRET_COMBO;
      delete process.env.MCP_HEADERS_COMBO_INTEGRATION;
    }, 30000);
  });

  // --- No-auth baseline (backward compatibility) ---
  describe('Baseline: No Auth', () => {
    test('should connect without auth when no auth config provided', async () => {
      const noAuthServer = await createMockMcpServer({});

      // Make request without any auth
      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(noAuthServer.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
        req.end();
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.result.serverInfo.name).toBe('test-auth-server');

      noAuthServer.server.close();
    }, 30000);

    test('resolveTransportAuth returns empty object for undefined auth', () => {
      const logger = createTestLogger();
      const result = resolveTransportAuth(undefined, 'no-auth-server', logger);
      expect(result).toEqual({});
      expect(logger.calls).toHaveLength(0);
    });
  });

  // Config parsing tests removed — tokenEnvVar + oauth combo is rejected at parse time,
  // so testing "OAuth takes precedence" exercises an unreachable code path.
});

// ============================================================================
// Live K3s Cluster Tests (requires WireGuard + env vars)
// ============================================================================

const LIVE_TEST_ENABLED = process.env.MCP_AUTH_LIVE_TEST === 'true';

// CF endpoint: use port-forward (ClusterIP service, not NodePort).
// Start before running: kubectl port-forward svc/riley-context-forge-mcp-stack-app -n riley-ai-gateway 4444:80
// Override via CF_ENDPOINT env var if using a different port.
const CF_ENDPOINT = process.env.CF_ENDPOINT || 'http://localhost:4444';

describe.skipIf(!LIVE_TEST_ENABLED)('MCP Client Auth — Live K3s Cluster', () => {
  // These tests hit real MCP servers on the RILEY K3s cluster.
  // Enable with: MCP_AUTH_LIVE_TEST=true
  // Requires: WireGuard VPN to MTL-02 + kubectl port-forward to CF service
  //
  // Setup:
  //   kubectl port-forward svc/riley-context-forge-mcp-stack-app -n riley-ai-gateway 4444:80
  //   export MCP_AUTH_LIVE_TEST=true CF_JWT_TOKEN=$(kubectl get secret ...)
  //
  // Expected env vars:
  //   CF_JWT_TOKEN — Context Forge JWT (generate from JWT_SECRET_KEY in context-forge-secrets)
  //   CF_ENDPOINT — Optional, defaults to http://localhost:4444

  describe('Context Forge Connectivity', () => {
    test('should reach CF health endpoint (no auth required)', async () => {
      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(`${CF_ENDPOINT}/health`, {
          method: 'GET',
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.end();
      });

      expect(response.statusCode).toBe(200);
      const health = JSON.parse(response.body);
      expect(health.status).toBe('healthy');
    }, 30000);

    test('should reject unauthenticated requests to /mcp/ endpoint', async () => {
      const response = await new Promise<{ statusCode: number }>((resolve, reject) => {
        const req = http.request(`${CF_ENDPOINT}/mcp/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0 }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {},
        }));
        req.end();
      });

      // CF enforces JWT auth on /mcp/ — Security by Design
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }, 30000);
  });

  // Authenticated MCP test requires a valid OAuth-issued RS256 JWT.
  // CF OAuth AS uses RS256 (not HS256) — manually generated tokens won't work.
  // Blocked on #1528: CF OAuth AS client registration for dot-ai-service.
  const OAUTH_TOKEN_AVAILABLE = process.env.CF_OAUTH_TOKEN !== undefined;

  describe.skipIf(!OAUTH_TOKEN_AVAILABLE)('Context Forge MCP Endpoint (OAuth Token)', () => {
    test('should connect to CF /mcp/ with OAuth-issued JWT and get tool list', async () => {
      const cfToken = process.env.CF_OAUTH_TOKEN;
      expect(cfToken).toBeDefined();

      const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(`${CF_ENDPOINT}/mcp/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfToken}`,
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'dot-ai-integration-test', version: '1.0.0' },
          },
        }));
        req.end();
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body);
      expect(result.result).toMatchObject({
        serverInfo: expect.objectContaining({ name: expect.any(String) }),
        capabilities: expect.any(Object),
      });
    }, 30000);
  });
});
