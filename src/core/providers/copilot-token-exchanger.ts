/**
 * GitHub Copilot Token Exchanger
 *
 * Exchanges a long-lived GitHub OAuth token (gho_* / github_pat_*) for
 * short-lived Copilot API tokens.  Tokens are cached in-memory and
 * refreshed 2 minutes before expiry.  On 401 responses from the Copilot
 * API the caller should call invalidate() then retry once.
 *
 * PRD #587: GitHub Copilot Provider
 */

const EXCHANGE_URL = 'https://api.github.com/copilot_internal/v2/token';
const REFRESH_MARGIN_MS = 120_000; // 2 minutes

interface ExchangedToken {
  token: string;
  expiresAt: number; // Unix ms
}

export interface CopilotTokenExchanger {
  getToken(): Promise<string>;
  invalidate(): void;
}

/**
 * Create a Copilot token exchanger for the given long-lived OAuth token.
 *
 * @param rawToken  Long-lived gho_* or github_pat_* token from GITHUB_COPILOT_TOKEN
 * @returns         Object with getToken() and invalidate() methods
 */
export function makeCopilotTokenExchanger(
  rawToken: string
): CopilotTokenExchanger {
  let cache: ExchangedToken | null = null;

  async function exchange(): Promise<ExchangedToken> {
    const res = await fetch(EXCHANGE_URL, {
      headers: {
        Authorization: `token ${rawToken}`,
        'User-Agent': 'dot-ai/1.0',
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.104.1',
      },
    });

    if (!res.ok) {
      throw new Error(`Copilot token exchange failed: ${res.status}`);
    }

    const data = (await res.json()) as { token: string; expires_at: number };
    return { token: data.token, expiresAt: data.expires_at * 1000 };
  }

  return {
    async getToken(): Promise<string> {
      if (cache && Date.now() < cache.expiresAt - REFRESH_MARGIN_MS) {
        return cache.token;
      }
      cache = await exchange();
      return cache.token;
    },

    invalidate(): void {
      cache = null;
    },
  };
}
