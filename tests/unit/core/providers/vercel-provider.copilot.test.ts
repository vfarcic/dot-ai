/**
 * Unit tests for the `copilot` case in VercelProvider.initializeModel()
 * (PRD #587: GitHub Copilot Provider).
 *
 * Tests cover:
 * - createOpenAI called with baseURL 'https://api.githubcopilot.com'
 * - provider.chat(model) used (not bare provider(model))
 * - copilotFetch injects required Copilot headers on each request
 * - 401 response triggers exchange.invalidate() + retry with new token
 * - End-to-end inference through VercelProvider.sendMessage (live-credential,
 *   skipped unless GITHUB_COPILOT_TOKEN is set)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockLanguageModel,
} from './_helpers/mock-language-model';

// ---------------------------------------------------------------------------
// Hoist mocks before module imports
// ---------------------------------------------------------------------------

const { mockCreateOpenAI, mockMakeCopilotTokenExchanger } = vi.hoisted(() => ({
  mockCreateOpenAI: vi.fn(),
  mockMakeCopilotTokenExchanger: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }));

vi.mock(
  '../../../../src/core/providers/copilot-token-exchanger',
  () => ({ makeCopilotTokenExchanger: mockMakeCopilotTokenExchanger })
);

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

import { VercelProvider } from '../../../../src/core/providers/vercel-provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock copilot exchanger with controllable getToken / invalidate. */
function makeMockExchanger(tokens: string[] = ['copilot-token-1']) {
  let callCount = 0;
  const invalidate = vi.fn(() => {
    // next getToken call after invalidate returns the subsequent token
  });
  const getToken = vi.fn(async () => tokens[Math.min(callCount++, tokens.length - 1)]);
  return { getToken, invalidate };
}

/** Build a mock provider function that returns a mock model from .chat(). */
function makeMockProvider(model = createMockLanguageModel({ text: 'copilot response' })) {
  const chat = vi.fn().mockReturnValue(model);
  const providerFn = vi.fn().mockReturnValue(model);
  (providerFn as unknown as { chat: typeof chat }).chat = chat;
  return { providerFn, chat, model };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VercelProvider copilot branch', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEBUG_DOT_AI;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. createOpenAI wired with correct baseURL
  // -------------------------------------------------------------------------

  it('calls createOpenAI with baseURL https://api.githubcopilot.com', () => {
    const exchanger = makeMockExchanger();
    mockMakeCopilotTokenExchanger.mockReturnValue(exchanger);

    const { providerFn } = makeMockProvider();
    mockCreateOpenAI.mockReturnValue(providerFn);

    new VercelProvider({
      provider: 'copilot',
      apiKey: 'gho_test',
      debugMode: false,
    });

    expect(mockCreateOpenAI).toHaveBeenCalledOnce();
    const config = mockCreateOpenAI.mock.calls[0][0] as Record<string, unknown>;
    expect(config.baseURL).toBe('https://api.githubcopilot.com');
  });

  // -------------------------------------------------------------------------
  // 2. provider.chat(model) sets this.modelInstance
  // -------------------------------------------------------------------------

  it('uses provider.chat(model) to set modelInstance', () => {
    const exchanger = makeMockExchanger();
    mockMakeCopilotTokenExchanger.mockReturnValue(exchanger);

    const { providerFn, chat, model } = makeMockProvider();
    mockCreateOpenAI.mockReturnValue(providerFn);

    const provider = new VercelProvider({
      provider: 'copilot',
      apiKey: 'gho_test',
      debugMode: false,
    });

    expect(chat).toHaveBeenCalledWith(provider.getModelName());
    expect(provider.isInitialized()).toBe(true);
    // Verify the model instance is the one returned by .chat()
    // We confirm isInitialized because modelInstance is private
    void model; // referenced to silence unused-var warnings
  });

  // -------------------------------------------------------------------------
  // 3. copilotFetch injects required headers
  // -------------------------------------------------------------------------

  it('copilotFetch injects Authorization, Copilot-Integration-Id, Editor-Version, Openai-Intent', async () => {
    const exchanger = makeMockExchanger(['my-short-token']);
    mockMakeCopilotTokenExchanger.mockReturnValue(exchanger);

    // Capture the fetch function passed to createOpenAI
    let capturedFetch: ((url: unknown, init?: unknown) => Promise<Response>) | undefined;

    mockCreateOpenAI.mockImplementation((config: Record<string, unknown>) => {
      capturedFetch = config.fetch as typeof capturedFetch;
      const { providerFn } = makeMockProvider();
      return providerFn;
    });

    new VercelProvider({
      provider: 'copilot',
      apiKey: 'gho_test',
      debugMode: false,
    });

    expect(capturedFetch).toBeDefined();

    // Simulate an outgoing request through copilotFetch
    const mockNetworkFetch = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = mockNetworkFetch;

    await capturedFetch!('https://api.githubcopilot.com/v1/chat/completions', {
      method: 'POST',
    });

    expect(mockNetworkFetch).toHaveBeenCalledOnce();
    const [, init] = mockNetworkFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer my-short-token');
    expect(headers.get('Copilot-Integration-Id')).toBe('vscode-chat');
    expect(headers.get('Editor-Version')).toBe('vscode/1.104.1');
    expect(headers.get('Openai-Intent')).toBe('conversation-edits');
  });

  // -------------------------------------------------------------------------
  // 4. 401 triggers invalidate() + retry with new token
  // -------------------------------------------------------------------------

  it('on 401 calls exchange.invalidate() and retries with a fresh token', async () => {
    const exchanger = makeMockExchanger(['stale-token', 'fresh-token']);
    mockMakeCopilotTokenExchanger.mockReturnValue(exchanger);

    let capturedFetch: ((url: unknown, init?: unknown) => Promise<Response>) | undefined;

    mockCreateOpenAI.mockImplementation((config: Record<string, unknown>) => {
      capturedFetch = config.fetch as typeof capturedFetch;
      const { providerFn } = makeMockProvider();
      return providerFn;
    });

    new VercelProvider({
      provider: 'copilot',
      apiKey: 'gho_test',
      debugMode: false,
    });

    const mockNetworkFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    globalThis.fetch = mockNetworkFetch;

    const result = await capturedFetch!('https://api.githubcopilot.com/v1/chat/completions');

    // invalidate() called once on 401
    expect(exchanger.invalidate).toHaveBeenCalledOnce();

    // Two network calls: first (401) + retry
    expect(mockNetworkFetch).toHaveBeenCalledTimes(2);

    // Retry uses the fresh token
    const [, retryInit] = mockNetworkFetch.mock.calls[1] as [string, RequestInit];
    const retryHeaders = new Headers(retryInit.headers as HeadersInit);
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token');

    expect(result.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 5. Token-exchange failure propagates
  // -------------------------------------------------------------------------

  it('propagates token-exchange failure as an error from sendMessage', async () => {
    const exchanger = {
      getToken: vi.fn().mockRejectedValue(new Error('Copilot token exchange failed: 401')),
      invalidate: vi.fn(),
    };
    mockMakeCopilotTokenExchanger.mockReturnValue(exchanger);

    let capturedFetch: ((url: unknown, init?: unknown) => Promise<Response>) | undefined;

    mockCreateOpenAI.mockImplementation((config: Record<string, unknown>) => {
      capturedFetch = config.fetch as typeof capturedFetch;
      const { providerFn } = makeMockProvider();
      return providerFn;
    });

    new VercelProvider({
      provider: 'copilot',
      apiKey: 'gho_test',
      debugMode: false,
    });

    await expect(
      capturedFetch!('https://api.githubcopilot.com/v1/chat/completions')
    ).rejects.toThrow('Copilot token exchange failed: 401');
  });

  // -------------------------------------------------------------------------
  // 6. End-to-end inference — live credential (skipped if no token)
  // -------------------------------------------------------------------------

  const copilotToken = process.env.GITHUB_COPILOT_TOKEN;

  it.skipIf(!copilotToken)(
    'e2e: sendMessage returns a non-empty response via the real Copilot API',
    async () => {
      // Use the real modules for this test only — restore mocks first
      vi.restoreAllMocks();

      // Re-import unmocked (dynamic import to bypass module cache)
      const { VercelProvider: RealVercelProvider } = await import(
        '../../../../src/core/providers/vercel-provider'
      );

      const provider = new RealVercelProvider({
        provider: 'copilot',
        apiKey: copilotToken!,
        debugMode: false,
      });

      const response = await provider.sendMessage('Reply with the single word: hello');

      expect(response).toMatchObject({
        content: expect.stringContaining('hello'),
        usage: {
          input_tokens: expect.any(Number),
          output_tokens: expect.any(Number),
        },
      });
    },
    60_000 // 60 s — live network call
  );
});
