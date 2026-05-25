# PRD #587: GitHub Copilot Provider

## Status

Draft

## Problem

dot-ai supports several AI providers but none that work with a GitHub Copilot subscription. Developers running homelab clusters who already pay for Copilot cannot use dot-ai without also paying for a separate per-token API (Anthropic, OpenAI, etc.).

The `host` provider (delegating to the MCP client) was previously the only "no API key" path and has since been removed.

## Corrected Understanding

Earlier versions of this PRD incorrectly stated that no static token exists for Copilot. This is wrong.

The actual Copilot auth flow (as used by Hermes Agent, the gh CLI, and opencode):

1. A long-lived GitHub OAuth token (`gho_*`) is obtained via `gh auth login` once, interactively. This token does not expire on its own.
2. Before each Copilot API call, that token is exchanged for a short-lived Copilot API token via `GET https://api.github.com/copilot_internal/v2/token`.
3. The short-lived token (TTL ~30 min) is cached in-memory and refreshed 2 minutes before expiry.
4. Requests to `https://api.githubcopilot.com` use the short-lived token plus specific headers:
   - `Copilot-Integration-Id: vscode-chat`
   - `Editor-Version: vscode/1.104.1`
   - `Openai-Intent: conversation-edits`

The long-lived `gho_*` token is stable enough to store in a Kubernetes Secret.

## Supported Token Types

Per GitHub's documentation and empirical testing:

| Token prefix | Type | Supported |
|---|---|---|
| `gho_` | OAuth token (gh auth login) | Yes |
| `github_pat_` | Fine-grained PAT (Copilot Requests permission) | Yes |
| `ghu_` | GitHub App token | Yes |
| `ghp_` | Classic PAT | **No** |

## Solution

Add a `copilot` provider to dot-ai's `VercelProvider` using a custom `fetch` wrapper that handles the short-lived token exchange transparently.

### Env Vars

| Variable | Description |
|---|---|
| `AI_PROVIDER=copilot` | Selects the provider |
| `GITHUB_COPILOT_TOKEN` | Long-lived `gho_*` or `github_pat_*` token |
| `AI_MODEL` | (optional) Override model, default: `claude-sonnet-4-6` |

### Architecture

No new npm dependencies. Fits within the existing `VercelProvider` switch block using a custom `fetch` wrapper on `createOpenAI`.

```typescript
// src/core/providers/copilot-token-exchanger.ts

const EXCHANGE_URL = 'https://api.github.com/copilot_internal/v2/token';
const REFRESH_MARGIN_MS = 120_000; // 2 min

interface ExchangedToken { token: string; expiresAt: number; }

export function makeCopilotTokenExchanger(rawToken: string): () => Promise<string> {
  let cache: ExchangedToken | null = null;

  return async function getToken(): Promise<string> {
    if (cache && Date.now() < cache.expiresAt - REFRESH_MARGIN_MS) {
      return cache.token;
    }
    const res = await fetch(EXCHANGE_URL, {
      headers: {
        Authorization: `token ${rawToken}`,
        'User-Agent': 'dot-ai/1.0',
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.104.1',
      },
    });
    if (!res.ok) throw new Error(`Copilot token exchange failed: ${res.status}`);
    const data = await res.json() as { token: string; expires_at: number };
    cache = { token: data.token, expiresAt: data.expires_at * 1000 };
    return cache.token;
  };
}
```

```typescript
// vercel-provider.ts — new switch case
case 'copilot': {
  const exchange = makeCopilotTokenExchanger(this.apiKey);
  provider = createOpenAI({
    apiKey: 'unused',
    baseURL: 'https://api.githubcopilot.com',
    fetch: async (url, init) => {
      const apiToken = await exchange();
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${apiToken}`);
      headers.set('Copilot-Integration-Id', 'vscode-chat');
      headers.set('Editor-Version', 'vscode/1.104.1');
      headers.set('Openai-Intent', 'conversation-edits');
      return globalThis.fetch(url, { ...init, headers });
    },
  });
  break;
}
```

### File Changes

1. `src/core/model-config.ts` — add `copilot: 'claude-sonnet-4-6'` to `CURRENT_MODELS`
2. `src/core/ai-provider-factory.ts` — add `copilot: 'GITHUB_COPILOT_TOKEN'` to `PROVIDER_ENV_KEYS`
3. `src/core/providers/copilot-token-exchanger.ts` — new file, token exchange + in-memory cache
4. `src/core/providers/vercel-provider.ts` — add `copilot` switch case

## Out of Scope

- Device flow inside dot-ai (operator runs `gh auth login` once at setup time)
- Multi-replica token persistence (in-memory cache per pod is sufficient; exchange call is cheap)
- Token type detection/validation at startup (will surface as a 401 on first use)

## Open Questions (for maintainer)

1. Preferred env var name: `GITHUB_COPILOT_TOKEN` or `COPILOT_API_KEY`?
2. Default model: `claude-sonnet-4-6` or `gpt-4o`? (Both are available via Copilot API)
3. Should `expires_at` be treated as seconds (current assumption) or milliseconds?
