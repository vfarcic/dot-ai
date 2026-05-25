/**
 * Unit tests for makeCopilotTokenExchanger (PRD #587).
 *
 * Tests cover:
 * - Happy-path token fetch and caching
 * - Token served from cache when still valid
 * - Proactive refresh 2 min before expiry
 * - invalidate() clears the cache
 * - Exchange failure propagates as an Error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCopilotTokenExchanger } from '../../../../src/core/providers/copilot-token-exchanger';

const RAW_TOKEN = 'gho_testtoken123';
const EXCHANGE_URL = 'https://api.github.com/copilot_internal/v2/token';

// Helpers -------------------------------------------------------------------

function makeExchangeResponse(token: string, expiresInSeconds: number) {
  const expires_at = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return new Response(JSON.stringify({ token, expires_at }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------

describe('makeCopilotTokenExchanger', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // 1. Happy-path fetch
  // -------------------------------------------------------------------------

  it('calls the exchange endpoint with correct headers and returns the short-lived token', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      makeExchangeResponse('copilot-short-token', 1800)
    );
    globalThis.fetch = mockFetch;

    const exchanger = makeCopilotTokenExchanger(RAW_TOKEN);
    const token = await exchanger.getToken();

    expect(token).toBe('copilot-short-token');

    // Verify the exchange call
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(EXCHANGE_URL);
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe(`token ${RAW_TOKEN}`);
    expect(headers.get('Editor-Version')).toBe('vscode/1.104.1');
  });

  // -------------------------------------------------------------------------
  // 2. Cache hit — no second network call
  // -------------------------------------------------------------------------

  it('returns the cached token on a second call without hitting the network again', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeExchangeResponse('cached-token', 1800)
    );
    globalThis.fetch = mockFetch;

    const exchanger = makeCopilotTokenExchanger(RAW_TOKEN);
    const first = await exchanger.getToken();
    const second = await exchanger.getToken();

    expect(first).toBe('cached-token');
    expect(second).toBe('cached-token');
    expect(mockFetch).toHaveBeenCalledOnce(); // only one exchange
  });

  // -------------------------------------------------------------------------
  // 3. Proactive refresh when token expires within 2 minutes
  // -------------------------------------------------------------------------

  it('refreshes when token will expire within the 2-minute margin', async () => {
    // First token expires in 90 s (< 120 s margin → should refresh on second call)
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeExchangeResponse('expiring-soon-token', 90))
      .mockResolvedValueOnce(makeExchangeResponse('fresh-token', 1800));
    globalThis.fetch = mockFetch;

    const exchanger = makeCopilotTokenExchanger(RAW_TOKEN);
    await exchanger.getToken(); // populates cache with expiring-soon-token
    const second = await exchanger.getToken(); // should trigger refresh

    expect(second).toBe('fresh-token');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // 4. invalidate() forces a new exchange
  // -------------------------------------------------------------------------

  it('invalidate() clears the cache so the next getToken() fetches again', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeExchangeResponse('first-token', 1800))
      .mockResolvedValueOnce(makeExchangeResponse('second-token', 1800));
    globalThis.fetch = mockFetch;

    const exchanger = makeCopilotTokenExchanger(RAW_TOKEN);
    const first = await exchanger.getToken();
    exchanger.invalidate();
    const second = await exchanger.getToken();

    expect(first).toBe('first-token');
    expect(second).toBe('second-token');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // 5. Exchange failure throws
  // -------------------------------------------------------------------------

  it('throws when the exchange endpoint returns a non-ok status', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    );
    globalThis.fetch = mockFetch;

    const exchanger = makeCopilotTokenExchanger(RAW_TOKEN);
    await expect(exchanger.getToken()).rejects.toThrow(
      'Copilot token exchange failed: 401'
    );
  });

  it('throws when the network call itself rejects', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    globalThis.fetch = mockFetch;

    const exchanger = makeCopilotTokenExchanger(RAW_TOKEN);
    await expect(exchanger.getToken()).rejects.toThrow('Network error');
  });
});
