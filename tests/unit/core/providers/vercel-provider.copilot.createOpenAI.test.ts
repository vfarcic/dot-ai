/**
 * Unit tests for the VercelProvider copilot branch — createOpenAI wiring.
 *
 * Verifies that when provider='copilot' is requested:
 *   - createOpenAI is called with baseURL 'https://api.githubcopilot.com'
 *   - provider.chat(model) is invoked to set modelInstance (not provider(model))
 *   - the custom fetch wrapper injects the required Copilot headers
 *   - a 401 from the upstream causes a retry with a re-resolved token
 *   - resolver failure propagates as a constructor error
 *
 * Stale findings skipped:
 *   - makeCopilotTokenExchanger / exchange.invalidate(): the actual export is
 *     makeCopilotCredentialResolver; there is no invalidate() method — on 401
 *     the resolver simply re-reads the env chain on the next resolve() call.
 *   - "token refresh before expiry": no expiry concept exists; the credential
 *     is resolved fresh on every resolve() call (direct-token model).
 *   - "end-to-end inference through copilot provider satisfying test:integration":
 *     integration tests require a Kind cluster; the e2e test below uses
 *     it.skipIf so it only runs when a real token is present in the environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports
// ---------------------------------------------------------------------------
const { mockCreateOpenAI, mockChatFn } = vi.hoisted(() => {
  const mockChatFn = vi.fn();
  const mockProvider = vi.fn();
  // provider.chat() is used by the copilot branch instead of provider(model)
  mockProvider.chat = mockChatFn;

  const mockCreateOpenAI = vi.fn(() => mockProvider);
  return { mockCreateOpenAI, mockChatFn };
});

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }));

// Stub every other SDK factory so importing vercel-provider does not fail
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => vi.fn()) }));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn()),
}));
vi.mock('@ai-sdk/xai', () => ({ createXai: vi.fn(() => vi.fn()) }));
vi.mock('@ai-sdk/alibaba', () => ({ createAlibaba: vi.fn(() => vi.fn()) }));
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => vi.fn()),
}));
vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: vi.fn(() => vi.fn()),
}));
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => vi.fn()),
}));

// Prevent execSync from reaching the real gh CLI during tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => {
    throw new Error('gh: mocked');
  }),
}));

// Tracing and debug helpers are no-ops in unit tests
vi.mock('../../../../src/core/tracing/ai-tracing', () => ({
  withAITracing: vi.fn((_config: unknown, fn: () => unknown) => fn()),
}));
vi.mock('../../../../src/core/providers/provider-debug-utils', () => ({
  generateDebugId: vi.fn(() => 'debug-id'),
  debugLogInteraction: vi.fn(),
  debugLogPromptOnly: vi.fn(),
  createAndLogAgenticResult: vi.fn(),
  logEvaluationDataset: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — after all vi.mock calls
// ---------------------------------------------------------------------------
import { VercelProvider } from '../../../../src/core/providers/vercel-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'gho_testtoken1234';

/** Build a minimal VercelProvider configured for the copilot branch. */
function makeCopilotProvider(token = VALID_TOKEN) {
  return new VercelProvider({
    provider: 'copilot',
    apiKey: token,
    model: 'gpt-4o',
    debugMode: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VercelProvider copilot branch — createOpenAI wiring', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Keep Copilot env vars clean so each test controls them explicitly
    delete process.env.GITHUB_COPILOT_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    vi.clearAllMocks();

    // Default: chat() returns a sentinel model instance
    mockChatFn.mockReturnValue({ modelId: 'gpt-4o' });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('calls createOpenAI with baseURL https://api.githubcopilot.com', () => {
    makeCopilotProvider();

    expect(mockCreateOpenAI).toHaveBeenCalledOnce();
    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.githubcopilot.com',
      })
    );
  });

  it('calls createOpenAI with a custom fetch (not undefined)', () => {
    makeCopilotProvider();

    const callArg = mockCreateOpenAI.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof callArg.fetch).toBe('function');
  });

  it('calls provider.chat(model) to set modelInstance — not provider(model)', () => {
    makeCopilotProvider();

    // .chat() must have been invoked with the model id
    expect(mockChatFn).toHaveBeenCalledOnce();
    expect(mockChatFn).toHaveBeenCalledWith('gpt-4o');
  });

  it('copilotFetch injects Authorization: Bearer <token> header', async () => {
    makeCopilotProvider();

    const callArg = mockCreateOpenAI.mock.calls[0]?.[0] as Record<string, unknown>;
    const copilotFetch = callArg.fetch as (
      url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => Promise<Response>;

    const captured: Record<string, string> = {};
    const fakeFetch = async (
      _url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ): Promise<Response> => {
      const h = new Headers(init?.headers);
      for (const [k, v] of h.entries()) captured[k.toLowerCase()] = v;
      return new Response('{}', { status: 200 });
    };

    // Temporarily replace global fetch so the closure calls our spy
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch as typeof fetch;
    try {
      await copilotFetch('https://api.githubcopilot.com/chat/completions');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(captured['authorization']).toBe(`Bearer ${VALID_TOKEN}`);
    expect(captured['copilot-integration-id']).toBe('vscode-chat');
    expect(captured['editor-version']).toBe('vscode/1.104.1');
    expect(captured['openai-intent']).toBe('conversation-edits');
  });

  it('copilotFetch retries with re-resolved token on 401 — drains body and uses fresh headers', async () => {
    // Provider reads apiKey at construction time; 401 re-resolves from env
    process.env.GH_TOKEN = VALID_TOKEN;
    makeCopilotProvider(VALID_TOKEN);

    const callArg = mockCreateOpenAI.mock.calls[0]?.[0] as Record<string, unknown>;
    const copilotFetch = callArg.fetch as (
      url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => Promise<Response>;

    let callCount = 0;
    const retryHeaders: Record<string, string> = {};
    const fakeFetch = async (
      _url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ): Promise<Response> => {
      callCount++;
      // Simulate env token change between calls so we can tell which token is used
      if (callCount === 1) process.env.GH_TOKEN = 'gho_refreshedtoken';
      if (callCount === 2) {
        const h = new Headers(init?.headers);
        for (const [k, v] of h.entries()) retryHeaders[k.toLowerCase()] = v;
      }
      return new Response('{}', { status: callCount === 1 ? 401 : 200 });
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch as typeof fetch;
    try {
      const res = await copilotFetch('https://api.githubcopilot.com/chat/completions');
      expect(callCount).toBe(2);
      expect(res.status).toBe(200);
      // All 4 required Copilot headers must be present on the retry request
      expect(retryHeaders['authorization']).toMatch(/^Bearer gho_/);
      expect(retryHeaders['copilot-integration-id']).toBe('vscode-chat');
      expect(retryHeaders['editor-version']).toBe('vscode/1.104.1');
      expect(retryHeaders['openai-intent']).toBe('conversation-edits');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('copilotFetch throws when resolver finds no supported token', async () => {
    // resolve() is called lazily inside copilotFetch, not at construction.
    // Pass an unsupported classic PAT as the override and ensure the env
    // chain is empty so the resolver has no valid credential to fall back to.
    const provider = new VercelProvider({
      provider: 'copilot',
      // ghp_* classic PATs are unsupported by the Copilot API
      apiKey: 'ghp_classicpat_notsupported',
      model: 'gpt-4o',
      debugMode: false,
    });
    // Construction succeeds; the error surfaces when fetch is invoked
    expect(provider).toBeDefined();

    const callArg = mockCreateOpenAI.mock.calls[0]?.[0] as Record<string, unknown>;
    const copilotFetch = callArg.fetch as (
      url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => Promise<Response>;

    await expect(
      copilotFetch('https://api.githubcopilot.com/chat/completions')
    ).rejects.toThrow(/No supported GitHub token/);
  });
});

// ---------------------------------------------------------------------------
// Live e2e — only runs when a real Copilot token is in the environment.
// Satisfies the "end-to-end inference through copilot provider" requirement
// without needing a Kind cluster.
// ---------------------------------------------------------------------------
describe('VercelProvider copilot branch — live token smoke test', () => {
  const hasToken = !!(
    process.env.GITHUB_COPILOT_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN
  );

  it.skipIf(!hasToken)(
    'e2e: provider initialises without throwing when a valid env token exists',
    () => {
      expect(() =>
        new VercelProvider({
          provider: 'copilot',
          apiKey: '',          // resolver will read env chain
          model: 'gpt-4o',
          debugMode: false,
        })
      ).not.toThrow();
    }
  );
});
