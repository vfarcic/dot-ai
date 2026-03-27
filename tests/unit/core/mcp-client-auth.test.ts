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

  test('codeVerifier should return empty string', async () => {
    const provider = new StaticTokenAuthProvider('token');
    await expect(provider.codeVerifier()).resolves.toBe('');
  });

  test('saveCodeVerifier should not throw', async () => {
    const provider = new StaticTokenAuthProvider('token');
    await expect(provider.saveCodeVerifier('verifier')).resolves.toBeUndefined();
  });

  test('invalidateCredentials("tokens") should not throw', async () => {
    const provider = new StaticTokenAuthProvider('token');
    await expect(provider.invalidateCredentials('tokens')).resolves.toBeUndefined();
  });

  test('saveDiscoveryState should be a no-op', async () => {
    const provider = new StaticTokenAuthProvider('token');
    const state = { authorizationServerUrl: 'https://auth.example.com' };
    await expect(provider.saveDiscoveryState(state)).resolves.toBeUndefined();
  });

  test('discoveryState should always return undefined', async () => {
    const provider = new StaticTokenAuthProvider('token');
    const result = await provider.discoveryState();
    expect(result).toBeUndefined();
  });
});

describe('ClientCredentialsAuthProvider codeVerifier (M4)', () => {
  test('codeVerifier should return empty string initially', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    await expect(provider.codeVerifier()).resolves.toBe('');
  });

  test('saveCodeVerifier should persist and return the verifier', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    await provider.saveCodeVerifier('my-pkce-verifier');
    await expect(provider.codeVerifier()).resolves.toBe('my-pkce-verifier');
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

    test('should throw when env var is not set (fail-fast)', () => {
      delete process.env.MCP_AUTH_MISSING;
      const auth: McpServerAuthConfig = { tokenEnvVar: 'MCP_AUTH_MISSING' };

      expect(() => resolveTransportAuth(auth, 'test-server', mockLogger)).toThrow(
        "auth.tokenEnvVar references env var 'MCP_AUTH_MISSING' but it is empty or unset"
      );
    });

    test('should throw when env var is empty string (fail-fast)', () => {
      process.env.MCP_AUTH_EMPTY = '';
      const auth: McpServerAuthConfig = { tokenEnvVar: 'MCP_AUTH_EMPTY' };

      expect(() => resolveTransportAuth(auth, 'test-server', mockLogger)).toThrow(
        "auth.tokenEnvVar references env var 'MCP_AUTH_EMPTY' but it is empty or unset"
      );
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

    test('should throw when env var is not set (fail-fast)', () => {
      delete process.env.MCP_HEADERS_MISSING;
      const auth: McpServerAuthConfig = { headersEnvVar: 'MCP_HEADERS_MISSING' };

      expect(() => resolveTransportAuth(auth, 'test-server', mockLogger)).toThrow(
        "auth.headersEnvVar references env var 'MCP_HEADERS_MISSING' but it is empty or unset"
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

    test('should reject non-string header values', () => {
      process.env.MCP_HEADERS_NONSTR = '{"X-Number":123,"X-Bool":true}';
      const auth: McpServerAuthConfig = { headersEnvVar: 'MCP_HEADERS_NONSTR' };
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

    test('should support oauth combined with headersEnvVar', () => {
      process.env.MCP_OAUTH_SECRET_COMBO = 'oauth-secret';
      process.env.MCP_HEADERS_OAUTH_COMBO = '{"X-Trace-Id":"abc"}';
      const auth: McpServerAuthConfig = {
        oauth: {
          clientId: 'combo-client',
          clientSecretEnvVar: 'MCP_OAUTH_SECRET_COMBO',
        },
        headersEnvVar: 'MCP_HEADERS_OAUTH_COMBO',
      };
      const result = resolveTransportAuth(auth, 'test-server', mockLogger);

      expect(result.authProvider).toBeInstanceOf(ClientCredentialsAuthProvider);
      expect(result.requestInit).toEqual({ headers: { 'X-Trace-Id': 'abc' } });
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

  test('invalidateCredentials("tokens") should clear cached tokens', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    await provider.saveTokens({ access_token: 'cached', token_type: 'bearer' });
    expect(await provider.tokens()).toBeDefined();

    await provider.invalidateCredentials('tokens');
    expect(await provider.tokens()).toBeUndefined();
  });

  test('invalidateCredentials("all") should clear tokens and discovery state', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    await provider.saveTokens({ access_token: 'cached', token_type: 'bearer' });
    await provider.saveDiscoveryState({ authorizationServerUrl: 'https://auth.example.com' });

    await provider.invalidateCredentials('all');
    expect(await provider.tokens()).toBeUndefined();
    expect(await provider.discoveryState()).toBeUndefined();
  });

  test('invalidateCredentials("discovery") should clear only discovery state', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    await provider.saveTokens({ access_token: 'cached', token_type: 'bearer' });
    await provider.saveDiscoveryState({ authorizationServerUrl: 'https://auth.example.com' });

    await provider.invalidateCredentials('discovery');
    // Tokens should remain
    expect(await provider.tokens()).toEqual({ access_token: 'cached', token_type: 'bearer' });
    // Discovery state should be cleared
    expect(await provider.discoveryState()).toBeUndefined();
  });

  test('saveDiscoveryState then discoveryState should return saved state', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    const state = {
      authorizationServerUrl: 'https://auth.example.com',
      resourceMetadataUrl: 'https://resource.example.com/.well-known/oauth-protected-resource',
    };
    await provider.saveDiscoveryState(state);
    expect(await provider.discoveryState()).toEqual(state);
  });

  test('discoveryState should return undefined initially', async () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    expect(await provider.discoveryState()).toBeUndefined();
  });

  test('prepareTokenRequest should include resource when configured', () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
      resource: 'https://mcp.example.com/',
    });
    const params = provider.prepareTokenRequest();
    expect(params.get('grant_type')).toBe('client_credentials');
    expect(params.get('resource')).toBe('https://mcp.example.com/');
  });

  test('prepareTokenRequest should omit resource when not configured', () => {
    const provider = new ClientCredentialsAuthProvider({
      clientId: 'test',
      clientSecret: 'secret',
    });
    const params = provider.prepareTokenRequest();
    expect(params.get('resource')).toBeNull();
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

  test('should throw when OAuth client secret env var is empty (fail-fast)', () => {
    delete process.env.MCP_OAUTH_SECRET_MISSING;
    const auth: McpServerAuthConfig = {
      oauth: {
        clientId: 'test-client',
        clientSecretEnvVar: 'MCP_OAUTH_SECRET_MISSING',
      },
    };

    expect(() => resolveTransportAuth(auth, 'test-server', mockLogger)).toThrow(
      "auth.oauth.clientSecretEnvVar references env var 'MCP_OAUTH_SECRET_MISSING' but it is empty or unset"
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

let mockFileContent: string | null = null;
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const CONFIG_PATH = '/etc/dot-ai-mcp/mcp-servers.json';
  return {
    ...actual,
    existsSync: (p: string) => {
      if (p === CONFIG_PATH && mockFileContent !== null) return true;
      return actual.existsSync(p);
    },
    readFileSync: (p: string | URL, encoding?: any) => {
      if (String(p) === CONFIG_PATH && mockFileContent !== null) return mockFileContent;
      return actual.readFileSync(p, encoding);
    },
  };
});

describe('parseMcpServerConfig auth parsing', () => {
  const baseServer = { name: 'test', endpoint: 'http://localhost:3000', attachTo: ['query'] };

  function mockConfigFile(content: string) {
    mockFileContent = content;
  }

  afterEach(() => {
    mockFileContent = null;
  });

  test('should parse valid tokenEnvVar auth config', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: { tokenEnvVar: 'MCP_AUTH_TEST' } }]));
    const configs = McpClientManager.parseMcpServerConfig();
    expect(configs[0].auth?.tokenEnvVar).toBe('MCP_AUTH_TEST');
  });

  test('should parse valid headersEnvVar auth config', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: { headersEnvVar: 'MCP_HEADERS_TEST' } }]));
    const configs = McpClientManager.parseMcpServerConfig();
    expect(configs[0].auth?.headersEnvVar).toBe('MCP_HEADERS_TEST');
  });

  test('should parse valid OAuth auth config', () => {
    mockConfigFile(JSON.stringify([{
      ...baseServer,
      auth: { oauth: { clientId: 'my-client', clientSecretEnvVar: 'MCP_OAUTH_SECRET', scope: 'mcp:tools' } },
    }]));
    const configs = McpClientManager.parseMcpServerConfig();
    expect(configs[0].auth?.oauth?.clientId).toBe('my-client');
    expect(configs[0].auth?.oauth?.scope).toBe('mcp:tools');
  });

  test('should parse config without auth (backward compatible)', () => {
    mockConfigFile(JSON.stringify([baseServer]));
    const configs = McpClientManager.parseMcpServerConfig();
    expect(configs[0].auth).toBeUndefined();
  });

  test('should throw on auth: [] (array)', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: [] }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('auth must be an object');
  });

  test('should throw on auth: true (non-object)', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: true }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('auth must be an object');
  });

  test('should throw on tokenEnvVar: 123 (non-string)', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: { tokenEnvVar: 123 } }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('auth.tokenEnvVar must be a non-empty string');
  });

  test('should throw on tokenEnvVar: "" (empty string)', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: { tokenEnvVar: '' } }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('auth.tokenEnvVar must be a non-empty string');
  });

  test('should throw on headersEnvVar: "  " (whitespace only)', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: { headersEnvVar: '  ' } }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('auth.headersEnvVar must be a non-empty string');
  });

  test('should throw on empty auth object (no valid fields)', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: {} }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('contains no valid auth fields');
  });

  test('should throw on oauth: [] (array)', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: { oauth: [] } }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('auth.oauth must be an object');
  });

  test('should throw on oauth missing clientId', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: { oauth: { clientSecretEnvVar: 'SECRET' } } }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow("missing required 'clientId'");
  });

  test('should throw on oauth.scope: "" (empty string)', () => {
    mockConfigFile(JSON.stringify([{
      ...baseServer,
      auth: { oauth: { clientId: 'c', clientSecretEnvVar: 'S', scope: '' } },
    }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('auth.oauth.scope must be a non-empty string');
  });

  test('should throw on oauth.scope: "  " (whitespace only)', () => {
    mockConfigFile(JSON.stringify([{
      ...baseServer,
      auth: { oauth: { clientId: 'c', clientSecretEnvVar: 'S', scope: '   ' } },
    }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('auth.oauth.scope must be a non-empty string');
  });

  test('should throw on oauth.clientId: "" (empty string)', () => {
    mockConfigFile(JSON.stringify([{
      ...baseServer,
      auth: { oauth: { clientId: '', clientSecretEnvVar: 'SECRET' } },
    }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow("missing required 'clientId'");
  });

  test('should throw on oauth.clientSecretEnvVar: "" (empty string)', () => {
    mockConfigFile(JSON.stringify([{
      ...baseServer,
      auth: { oauth: { clientId: 'c', clientSecretEnvVar: '' } },
    }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow("missing required 'clientSecretEnvVar'");
  });

  test('should throw on auth with only unknown properties', () => {
    mockConfigFile(JSON.stringify([{ ...baseServer, auth: { typoKey: 'value' } }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('contains no valid auth fields');
  });

  test('should throw when both tokenEnvVar and oauth are present (mutually exclusive)', () => {
    mockConfigFile(JSON.stringify([{
      ...baseServer,
      auth: {
        tokenEnvVar: 'MCP_AUTH_TEST',
        oauth: { clientId: 'c', clientSecretEnvVar: 'S' },
      },
    }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow(
      "specifies both 'tokenEnvVar' and 'oauth' — these are mutually exclusive"
    );
  });

  test('should parse valid oauth.resource field', () => {
    mockConfigFile(JSON.stringify([{
      ...baseServer,
      auth: { oauth: { clientId: 'c', clientSecretEnvVar: 'S', resource: 'https://mcp.example.com/' } },
    }]));
    const configs = McpClientManager.parseMcpServerConfig();
    expect(configs[0].auth?.oauth?.resource).toBe('https://mcp.example.com/');
  });

  test('should throw on oauth.resource: "" (empty string)', () => {
    mockConfigFile(JSON.stringify([{
      ...baseServer,
      auth: { oauth: { clientId: 'c', clientSecretEnvVar: 'S', resource: '' } },
    }]));
    expect(() => McpClientManager.parseMcpServerConfig()).toThrow('auth.oauth.resource must be a non-empty string');
  });
});
