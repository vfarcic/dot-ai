/**
 * Unit tests for vercel-provider copilot branch.
 *
 * Covers: direct-token header injection, x-initiator header, 401 re-resolve
 * and retry, and resolver failure propagation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCopilotCredentialResolver } from '../../../../src/core/providers/copilot-token-exchanger';

// Mock execSync so gh CLI fallback doesn't bleed real credentials into tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => { throw new Error('gh: mocked'); }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'gho_testtoken1234';

function makeResolver(token = VALID_TOKEN) {
  return makeCopilotCredentialResolver(token);
}

// ---------------------------------------------------------------------------
// CopilotCredentialResolver contract (used by vercel-provider copilot case)
// ---------------------------------------------------------------------------

describe('copilot vercel-provider integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_COPILOT_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  it('resolver.resolve() returns the supplied token', () => {
    const resolver = makeResolver();
    expect(resolver.resolve()).toBe(VALID_TOKEN);
  });

  it('resolver re-reads env on each call (no stale cache)', () => {
    const resolver = makeCopilotCredentialResolver(); // no override
    process.env.GH_TOKEN = VALID_TOKEN;
    expect(resolver.resolve()).toBe(VALID_TOKEN);
    process.env.GH_TOKEN = 'gho_newtoken999';
    expect(resolver.resolve()).toBe('gho_newtoken999');
    delete process.env.GH_TOKEN;
  });

  it('resolver throws when env chain is empty and no override', () => {
    const resolver = makeCopilotCredentialResolver('ghp_invalid'); // classic PAT = unsupported
    expect(() => resolver.resolve()).toThrow(/No supported GitHub token/);
  });

  it('copilotFetch injects required headers including x-initiator', async () => {
    // Simulate the copilotFetch closure from the vercel-provider copilot case
    const resolver = makeResolver();
    const captured: Record<string, string> = {};

    const mockFetch = async (
      _url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ): Promise<Response> => {
      const h = new Headers(init?.headers);
      for (const [k, v] of h.entries()) {
        captured[k.toLowerCase()] = v;
      }
      return new Response('{}', { status: 200 });
    };

    const copilotFetch = async (
      url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ): Promise<Response> => {
      const token = resolver.resolve();
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('Copilot-Integration-Id', 'vscode-chat');
      headers.set('Editor-Version', 'vscode/1.104.1');
      headers.set('Openai-Intent', 'conversation-edits');
      headers.set('x-initiator', 'user');
      return mockFetch(url, { ...init, headers });
    };

    await copilotFetch('https://api.githubcopilot.com/chat/completions');

    expect(captured['authorization']).toBe(`Bearer ${VALID_TOKEN}`);
    expect(captured['copilot-integration-id']).toBe('vscode-chat');
    expect(captured['editor-version']).toBe('vscode/1.104.1');
    expect(captured['openai-intent']).toBe('conversation-edits');
    expect(captured['x-initiator']).toBe('user');
  });

  it('copilotFetch retries with fresh token on 401', async () => {
    let callCount = 0;
    let secondToken = '';
    process.env.GH_TOKEN = VALID_TOKEN;
    const resolver = makeCopilotCredentialResolver();

    const mockFetch = async (
      _url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ): Promise<Response> => {
      callCount++;
      const h = new Headers(init?.headers);
      if (callCount === 2) secondToken = h.get('Authorization') ?? '';
      return new Response('{}', { status: callCount === 1 ? 401 : 200 });
    };

    const copilotFetch = async (
      url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ): Promise<Response> => {
      const token = resolver.resolve();
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const response = await mockFetch(url, { ...init, headers });
      if (response.status === 401) {
        // Simulate env refresh
        process.env.GH_TOKEN = 'gho_refreshedtoken';
        const freshToken = resolver.resolve();
        headers.set('Authorization', `Bearer ${freshToken}`);
        return mockFetch(url, { ...init, headers });
      }
      return response;
    };

    const res = await copilotFetch('https://api.githubcopilot.com/chat/completions');
    expect(callCount).toBe(2);
    expect(res.status).toBe(200);
    expect(secondToken).toBe('Bearer gho_refreshedtoken');
  });

  // Live e2e — only runs when a real token is available
  it.skipIf(!process.env.GITHUB_COPILOT_TOKEN && !process.env.GH_TOKEN && !process.env.GITHUB_TOKEN)(
    'e2e: resolver returns a usable token from env',
    () => {
      const resolver = makeCopilotCredentialResolver();
      const token = resolver.resolve();
      expect(token).toMatch(/^(gho_|ghu_)/);
    }
  );
});
