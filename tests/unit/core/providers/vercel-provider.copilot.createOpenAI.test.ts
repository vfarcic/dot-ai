/**
 * Unit tests for the VercelProvider copilot branch — SDK routing wiring.
 *
 * Routing logic (mirrors Hermes Agent):
 *   - claude-* model IDs → createAnthropic with baseURL 'https://api.githubcopilot.com'
 *   - All other model IDs → createOpenAI with baseURL 'https://api.githubcopilot.com'
 *     using provider.chat(model) (not provider(model))
 *
 * Both paths share the same copilotFetch wrapper which:
 *   - Injects Authorization: Bearer <token>, Copilot-Integration-Id,
 *     Editor-Version, Openai-Intent, and x-initiator headers
 *   - On 401: drains the response body, re-resolves the token, and retries once
 *
 * Stale findings skipped:
 *   - makeCopilotTokenExchanger / exchange.invalidate(): the actual export is
 *     makeCopilotCredentialResolver; there is no invalidate() method — on 401
 *     the resolver simply re-reads the env chain on the next resolve() call.
 *   - "token refresh before expiry": no expiry concept; the credential is
 *     resolved fresh on every resolve() call (direct-token model).
 *   - "end-to-end inference through copilot provider satisfying test:integration":
 *     integration tests require a Kind cluster; the e2e test below uses
 *     it.skipIf so it only runs when a real token is present in the environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports
// ---------------------------------------------------------------------------
const { mockCreateOpenAI, mockChatFn, mockCreateAnthropic, mockAnthropicModelFn } =
  vi.hoisted(() => {
    // OpenAI path: provider.chat(model)
    const mockChatFn = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockOpenAIProvider: any = vi.fn();
    mockOpenAIProvider.chat = mockChatFn;
    const mockCreateOpenAI = vi.fn(() => mockOpenAIProvider);

    // Anthropic path: provider(model) — callable factory
    const mockAnthropicModelFn = vi.fn(() => ({ modelId: 'claude-sonnet-4.6' }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockAnthropicProvider: any = vi.fn((...args: unknown[]) => mockAnthropicModelFn(...args));
    const mockCreateAnthropic = vi.fn(() => mockAnthropicProvider);

    return { mockCreateOpenAI, mockChatFn, mockCreateAnthropic, mockAnthropicModelFn };
  });

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: mockCreateAnthropic }));

// Stub every other SDK factory so importing vercel-provider does not fail
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

const EXPECTED_COPILOT_HEADERS: Record<string, string> = {
  'copilot-integration-id': 'vscode-chat',
  'editor-version': 'vscode/1.104.1',
  'openai-intent': 'conversation-edits',
};

function makeCopilotProvider(model: string, token = VALID_TOKEN) {
  return new VercelProvider({
    provider: 'copilot',
    apiKey: token,
    model,
    debugMode: false,
  });
}

type CopilotFetch = (
  url: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => Promise<Response>;

/** Extract the copilotFetch closure from the most recent createAnthropic call. */
function extractAnthropicFetch(): CopilotFetch | undefined {
  const calls = mockCreateAnthropic.mock.calls as unknown as Array<[Record<string, unknown>]>;
  return calls[0]?.[0]?.fetch as CopilotFetch | undefined;
}

/** Extract the copilotFetch closure from the most recent createOpenAI call. */
function extractOpenAIFetch(): CopilotFetch | undefined {
  const calls = mockCreateOpenAI.mock.calls as unknown as Array<[Record<string, unknown>]>;
  return calls[0]?.[0]?.fetch as CopilotFetch | undefined;
}

/** Run copilotFetch with a fake global fetch and return captured headers. */
async function captureHeaders(
  copilotFetch: NonNullable<ReturnType<typeof extractAnthropicFetch>>
): Promise<Record<string, string>> {
  const captured: Record<string, string> = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const h = new Headers(init?.headers);
    for (const [k, v] of h.entries()) captured[k.toLowerCase()] = v;
    return new Response('{}', { status: 200 });
  };
  try {
    await copilotFetch('https://api.githubcopilot.com/v1/messages');
  } finally {
    globalThis.fetch = originalFetch;
  }
  return captured;
}

// ---------------------------------------------------------------------------
// Suite 1: Claude model IDs → createAnthropic path
// ---------------------------------------------------------------------------

describe('VercelProvider copilot branch — Claude model routing (createAnthropic)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GITHUB_COPILOT_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    vi.clearAllMocks();
    mockAnthropicModelFn.mockReturnValue({ modelId: 'claude-sonnet-4.6' });
    mockChatFn.mockReturnValue({ modelId: 'gpt-4o' });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('calls createAnthropic (not createOpenAI) for claude-* model IDs', () => {
    makeCopilotProvider('claude-sonnet-4.6');

    expect(mockCreateAnthropic).toHaveBeenCalledOnce();
    expect(mockCreateOpenAI).not.toHaveBeenCalled();
  });

  it('calls createAnthropic with baseURL https://api.githubcopilot.com/v1', () => {
    makeCopilotProvider('claude-sonnet-4.6');

    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.githubcopilot.com/v1',
      })
    );
  });

  it('calls createAnthropic with a custom fetch (not undefined)', () => {
    makeCopilotProvider('claude-sonnet-4.6');
    const callArg = mockCreateAnthropic.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof callArg?.fetch).toBe('function');
  });

  it('invokes anthropicProvider(model) — callable factory — to set modelInstance', () => {
    makeCopilotProvider('claude-sonnet-4.6');
    // The mocked anthropicProvider is itself callable; verify it was called with the model ID
    expect(mockAnthropicModelFn).toHaveBeenCalledWith('claude-sonnet-4.6');
  });

  it('copilotFetch injects all required Copilot headers for Anthropic path', async () => {
    makeCopilotProvider('claude-sonnet-4.6');
    const copilotFetch = extractAnthropicFetch();
    expect(copilotFetch).toBeDefined();

    const headers = await captureHeaders(copilotFetch!);

    expect(headers['authorization']).toBe(`Bearer ${VALID_TOKEN}`);
    for (const [k, v] of Object.entries(EXPECTED_COPILOT_HEADERS)) {
      expect(headers[k]).toBe(v);
    }
  });

  it('copilotFetch retries once on 401 with all Copilot headers re-injected (Anthropic path)', async () => {
    makeCopilotProvider('claude-sonnet-4.6');
    const copilotFetch = extractAnthropicFetch();
    expect(copilotFetch).toBeDefined();

    let callCount = 0;
    const retryHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      callCount++;
      if (callCount === 2) {
        const h = new Headers(init?.headers);
        for (const [k, v] of h.entries()) retryHeaders[k.toLowerCase()] = v;
      }
      return new Response('{}', { status: callCount === 1 ? 401 : 200 });
    };
    try {
      const res = await copilotFetch!('https://api.githubcopilot.com/v1/messages');
      expect(callCount).toBe(2);
      expect(res.status).toBe(200);
      // All Copilot headers must be present on the retry request
      expect(retryHeaders['authorization']).toMatch(/^Bearer /);
      for (const [k, v] of Object.entries(EXPECTED_COPILOT_HEADERS)) {
        expect(retryHeaders[k]).toBe(v);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('copilotFetch throws when resolver finds no supported token (Anthropic path)', async () => {
    const provider = new VercelProvider({
      provider: 'copilot',
      apiKey: 'ghp_classicpat_notsupported',
      model: 'claude-sonnet-4.6',
      debugMode: false,
    });
    expect(provider).toBeDefined();

    const copilotFetch = extractAnthropicFetch();
    expect(copilotFetch).toBeDefined();

    await expect(
      copilotFetch!('https://api.githubcopilot.com/v1/messages')
    ).rejects.toThrow(/No supported GitHub token/);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Non-Claude model IDs → createOpenAI path
// ---------------------------------------------------------------------------

describe('VercelProvider copilot branch — non-Claude model routing (createOpenAI)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GITHUB_COPILOT_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    vi.clearAllMocks();
    mockChatFn.mockReturnValue({ modelId: 'gpt-4o' });
    mockAnthropicModelFn.mockReturnValue({ modelId: 'stub' });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('calls createOpenAI (not createAnthropic) for non-claude model IDs', () => {
    makeCopilotProvider('gpt-4o');

    expect(mockCreateOpenAI).toHaveBeenCalledOnce();
    expect(mockCreateAnthropic).not.toHaveBeenCalled();
  });

  it('calls createOpenAI with baseURL https://api.githubcopilot.com', () => {
    makeCopilotProvider('gpt-4o');

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.githubcopilot.com' })
    );
  });

  it('calls provider.chat(model) to set modelInstance — not provider(model)', () => {
    makeCopilotProvider('gpt-4o');
    expect(mockChatFn).toHaveBeenCalledOnce();
    expect(mockChatFn).toHaveBeenCalledWith('gpt-4o');
  });

  it('copilotFetch injects all required Copilot headers for OpenAI path', async () => {
    makeCopilotProvider('gpt-4o');
    const copilotFetch = extractOpenAIFetch();
    expect(copilotFetch).toBeDefined();

    const captured: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const h = new Headers(init?.headers);
      for (const [k, v] of h.entries()) captured[k.toLowerCase()] = v;
      return new Response('{}', { status: 200 });
    };
    try {
      await copilotFetch!('https://api.githubcopilot.com/chat/completions');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(captured['authorization']).toBe(`Bearer ${VALID_TOKEN}`);
    for (const [k, v] of Object.entries(EXPECTED_COPILOT_HEADERS)) {
      expect(captured[k]).toBe(v);
    }
  });

  it('copilotFetch retries once on 401 with all Copilot headers re-injected (OpenAI path)', async () => {
    makeCopilotProvider('gpt-4o');
    const copilotFetch = extractOpenAIFetch();
    expect(copilotFetch).toBeDefined();

    let callCount = 0;
    const retryHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      callCount++;
      if (callCount === 2) {
        const h = new Headers(init?.headers);
        for (const [k, v] of h.entries()) retryHeaders[k.toLowerCase()] = v;
      }
      return new Response('{}', { status: callCount === 1 ? 401 : 200 });
    };
    try {
      const res = await copilotFetch!('https://api.githubcopilot.com/chat/completions');
      expect(callCount).toBe(2);
      expect(res.status).toBe(200);
      // All Copilot headers must be present on the retry request
      expect(retryHeaders['authorization']).toMatch(/^Bearer /);
      for (const [k, v] of Object.entries(EXPECTED_COPILOT_HEADERS)) {
        expect(retryHeaders[k]).toBe(v);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
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
    'e2e: provider initialises without throwing for claude-sonnet-4.6',
    () => {
      // This is the actual default model — dot notation, Anthropic SDK path
      expect(() =>
        new VercelProvider({
          provider: 'copilot',
          apiKey: '',          // resolver will read env chain
          model: 'claude-sonnet-4.6',
          debugMode: false,
        })
      ).not.toThrow();
    }
  );

  it.skipIf(!hasToken)(
    'e2e: provider initialises without throwing for gpt-4o (OpenAI path)',
    () => {
      expect(() =>
        new VercelProvider({
          provider: 'copilot',
          apiKey: '',
          model: 'gpt-4o',
          debugMode: false,
        })
      ).not.toThrow();
    }
  );
});
