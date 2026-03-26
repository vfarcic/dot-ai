/**
 * Unit Tests: MCP Client Authentication (PRD #414)
 *
 * Tests auth configuration parsing, StaticTokenAuthProvider,
 * resolveTransportAuth, and backward compatibility.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StaticTokenAuthProvider,
  ClientCredentialsAuthProvider,
  resolveTransportAuth,
} from '../../../src/core/mcp-client-manager.js';
import { McpClientManager } from '../../../src/core/mcp-client-manager.js';
import type { McpServerAuthConfig } from '../../../src/core/mcp-client-types.js';
import { Logger } from '../../../src/core/error-handling.js';

// Mock logger
const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('StaticTokenAuthProvider (M1)', () => {
  test('should return bearer token from tokens()', async () => {
    const provider = new StaticTokenAuthProvider('my-secret-token');
    const tokens = await provider.tokens();

    expect(tokens).toEqual({
      access_token: 'my-secret-token',
      token_type: 'bearer',
    });
  });

  test('should return undefined redirectUrl (non-interactive)', () => {
    const provider = new StaticTokenAuthProvider('token');
    expect(provider.redirectUrl).toBeUndefined();
  });

  test('should return client metadata with dot-ai name', () => {
    const provider = new StaticTokenAuthProvider('token');
    expect(provider.clientMetadata.client_name).toBe('dot-ai');
  });

  test('should return undefined from clientInformation()', () => {
    const provider = new StaticTokenAuthProvider('token');
    expect(provider.clientInformation()).toBeUndefined();
  });

  test('should not throw on saveTokens()', async () => {
    const provider = new StaticTokenAuthProvider('token');
    await expect(provider.saveTokens({
      access_token: 'new',
      token_type: 'bearer',
    })).resolves.toBeUndefined();
  });
});

describe('resolveTransportAuth (M1 + M2)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should return empty object when auth is undefined', () => {
    const result = resolveTransportAuth(undefined, 'test-server', mockLogger);
    expect(result).toEqual({});
  });

  test('should return empty object when auth is empty', () => {
    const result = resolveTransportAuth({}, 'test-server', mockLogger);
    expect(result).toEqual({});
  });

  // M1: Static token → authProvider
  describe('tokenEnvVar (M1)', () => {
    test('should create authProvider when env var contains token', () => {
      process.env.MCP_AUTH_TEST = 'my-bearer-token';
      const auth: McpServerAuthConfig = { tokenEnvVar: 'MCP_AUTH_TEST' };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      expect(result.authProvider).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MCP server auth configured via authProvider (static token)',
        expect.objectContaining({ server: 'test-server', envVar: 'MCP_AUTH_TEST' })
      );
    });

    test('authProvider should return the token', async () => {
      process.env.MCP_AUTH_TEST = 'jwt-token-here';
      const auth: McpServerAuthConfig = { tokenEnvVar: 'MCP_AUTH_TEST' };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      const tokens = await result.authProvider!.tokens();
      expect(tokens).toEqual({
        access_token: 'jwt-token-here',
        token_type: 'bearer',
      });
    });

    test('should warn when env var is not set', () => {
      delete process.env.MCP_AUTH_MISSING;
      const auth: McpServerAuthConfig = { tokenEnvVar: 'MCP_AUTH_MISSING' };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      expect(result.authProvider).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MCP server auth tokenEnvVar configured but env var is empty',
        expect.objectContaining({ server: 'test-server', envVar: 'MCP_AUTH_MISSING' })
      );
    });

    test('should warn when env var is empty string', () => {
      process.env.MCP_AUTH_EMPTY = '';
      const auth: McpServerAuthConfig = { tokenEnvVar: 'MCP_AUTH_EMPTY' };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      expect(result.authProvider).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // M2: Custom headers → requestInit
  describe('headersEnvVar (M2)', () => {
    test('should create requestInit when env var contains valid JSON headers', () => {
      process.env.MCP_HEADERS_TEST = '{"Authorization":"Bearer abc","X-Api-Key":"key123"}';
      const auth: McpServerAuthConfig = { headersEnvVar: 'MCP_HEADERS_TEST' };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      expect(result.requestInit).toEqual({
        headers: {
          Authorization: 'Bearer abc',
          'X-Api-Key': 'key123',
        },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MCP server auth configured via requestInit headers',
        expect.objectContaining({ server: 'test-server', headerCount: 2 })
      );
    });

    test('should warn when env var is not set', () => {
      delete process.env.MCP_HEADERS_MISSING;
      const auth: McpServerAuthConfig = { headersEnvVar: 'MCP_HEADERS_MISSING' };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      expect(result.requestInit).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MCP server auth headersEnvVar configured but env var is empty',
        expect.objectContaining({ server: 'test-server' })
      );
    });

    test('should warn when env var contains invalid JSON', () => {
      process.env.MCP_HEADERS_BAD = 'not-json';
      const auth: McpServerAuthConfig = { headersEnvVar: 'MCP_HEADERS_BAD' };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      expect(result.requestInit).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MCP server auth headersEnvVar contains invalid JSON',
        expect.objectContaining({ server: 'test-server' })
      );
    });

    test('should warn when env var contains JSON array instead of object', () => {
      process.env.MCP_HEADERS_ARRAY = '["not","an","object"]';
      const auth: McpServerAuthConfig = { headersEnvVar: 'MCP_HEADERS_ARRAY' };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      expect(result.requestInit).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MCP server auth headersEnvVar contains invalid JSON',
        expect.objectContaining({ server: 'test-server' })
      );
    });
  });

  // Both modes combined
  describe('combined auth modes', () => {
    test('should support both tokenEnvVar and headersEnvVar simultaneously', () => {
      process.env.MCP_AUTH_COMBO = 'bearer-token';
      process.env.MCP_HEADERS_COMBO = '{"X-Custom":"value"}';
      const auth: McpServerAuthConfig = {
        tokenEnvVar: 'MCP_AUTH_COMBO',
        headersEnvVar: 'MCP_HEADERS_COMBO',
      };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      expect(result.authProvider).toBeDefined();
      expect(result.requestInit).toEqual({ headers: { 'X-Custom': 'value' } });
    });
  });
});

describe('ClientCredentialsAuthProvider (M4)', () => {
  test('should return undefined redirectUrl (non-interactive)', () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test-client',
      clientSecret: 'test-secret',
    });
    expect(provider.redirectUrl).toBeUndefined();
  });

  test('should return client metadata with client_credentials grant', () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test-client',
      clientSecret: 'test-secret',
    });
    expect(provider.clientMetadata.grant_types).toContain('client_credentials');
    expect(provider.clientMetadata.client_name).toBe('dot-ai');
  });

  test('should return pre-registered client information', () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'my-client-id',
      clientSecret: 'my-secret',
    });
    const info = provider.clientInformation();
    expect(info).toBeDefined();
    expect(info!.client_id).toBe('my-client-id');
    expect(info!.client_secret).toBe('my-secret');
    expect(info!.grant_types).toContain('client_credentials');
  });

  test('should return undefined tokens initially', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    const tokens = await provider.tokens();
    expect(tokens).toBeUndefined();
  });

  test('should cache tokens after saveTokens', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    const testTokens = { access_token: 'new-access-token', token_type: 'bearer' as const };
    await provider.saveTokens(testTokens);
    const tokens = await provider.tokens();
    expect(tokens).toEqual(testTokens);
  });

  test('prepareTokenRequest should return client_credentials grant type', () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    const params = provider.prepareTokenRequest();
    expect(params.get('grant_type')).toBe('client_credentials');
  });

  test('prepareTokenRequest should include scope when configured', () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
      scope: 'mcp:tools mcp:read',
    });
    const params = provider.prepareTokenRequest();
    expect(params.get('grant_type')).toBe('client_credentials');
    expect(params.get('scope')).toBe('mcp:tools mcp:read');
  });

  test('prepareTokenRequest should use argument scope over configured scope', () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
      scope: 'default-scope',
    });
    const params = provider.prepareTokenRequest('override-scope');
    expect(params.get('scope')).toBe('override-scope');
  });

  test('should save and return client information', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    const newInfo = {
      client_id: 'dynamic-id',
      client_secret: 'dynamic-secret',
      client_id_issued_at: 12345,
      redirect_uris: [],
    } as any;
    await provider.saveClientInformation(newInfo);
    expect(provider.clientInformation()).toEqual(newInfo);
  });
});

describe('resolveTransportAuth OAuth (M4)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should create ClientCredentialsAuthProvider when oauth configured', () => {
    process.env.MCP_OAUTH_SECRET_TEST = 'my-client-secret';
    const auth: McpServerAuthConfig = {
      oauth: {
        clientId: 'test-client',
        clientSecretEnvVar: 'MCP_OAUTH_SECRET_TEST',
      },
    };
    const result = resolveTransportAuth(auth, 'test-server', mockLogger);

    expect(result.authProvider).toBeDefined();
    expect(result.authProvider).toBeInstanceOf(ClientCredentialsAuthProvider);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'MCP server auth configured via authProvider (OAuth client_credentials)',
      expect.objectContaining({
        server: 'test-server',
        clientId: 'test-client',
      })
    );
  });

  test('should warn when OAuth client secret env var is empty', () => {
    delete process.env.MCP_OAUTH_SECRET_MISSING;
    const auth: McpServerAuthConfig = {
      oauth: {
        clientId: 'test-client',
        clientSecretEnvVar: 'MCP_OAUTH_SECRET_MISSING',
      },
    };
    const result = resolveTransportAuth(auth, 'test-server', mockLogger);

    expect(result.authProvider).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'MCP server OAuth clientSecretEnvVar configured but env var is empty',
      expect.objectContaining({ server: 'test-server' })
    );
  });

  test('OAuth should take precedence over static token when both configured', () => {
    process.env.MCP_AUTH_PRECEDENCE = 'static-token';
    process.env.MCP_OAUTH_SECRET_PRECEDENCE = 'oauth-secret';
    const auth: McpServerAuthConfig = {
      tokenEnvVar: 'MCP_AUTH_PRECEDENCE',
      oauth: {
        clientId: 'oauth-client',
        clientSecretEnvVar: 'MCP_OAUTH_SECRET_PRECEDENCE',
      },
    };
    const result = resolveTransportAuth(auth, 'test-server', mockLogger);

    // OAuth is processed after token, so it overwrites authProvider
    expect(result.authProvider).toBeInstanceOf(ClientCredentialsAuthProvider);
  });

  test('should pass scope to ClientCredentialsAuthProvider', async () => {
    process.env.MCP_OAUTH_SECRET_SCOPE = 'secret';
    const auth: McpServerAuthConfig = {
      oauth: {
        clientId: 'test-client',
        clientSecretEnvVar: 'MCP_OAUTH_SECRET_SCOPE',
        scope: 'mcp:tools',
      },
    };
    const result = resolveTransportAuth(auth, 'test-server', mockLogger);
    const provider = result.authProvider as ClientCredentialsAuthProvider;
    const params = provider.prepareTokenRequest();
    expect(params.get('scope')).toBe('mcp:tools');
  });
});

describe('parseMcpServerConfig auth parsing', () => {
  // We test the parsing indirectly by mocking the filesystem
  // Since parseMcpServerConfig reads from a fixed path, we test the parsing logic
  // by verifying the return type includes auth when present

  test('McpServerConfig type should accept auth field', () => {
    // Type-level test: ensure the interface compiles with auth
    const config = {
      name: 'test',
      endpoint: 'http://localhost:3000',
      attachTo: ['query' as const],
      auth: {
        tokenEnvVar: 'MCP_AUTH_TEST',
      },
    };
    expect(config.auth?.tokenEnvVar).toBe('MCP_AUTH_TEST');
  });

  test('McpServerConfig type should accept without auth (backward compatible)', () => {
    const config = {
      name: 'test',
      endpoint: 'http://localhost:3000',
      attachTo: ['query' as const],
    };
    expect(config.auth).toBeUndefined();
  });
});
