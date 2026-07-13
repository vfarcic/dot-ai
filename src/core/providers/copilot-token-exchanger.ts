/**
 * GitHub Copilot Credential Resolver
 *
 * Resolves a GitHub token suitable for direct use against api.githubcopilot.com.
 * Hermes/dot-ai uses the raw token directly as the Bearer credential — no
 * token-exchange step is required and the exchange endpoint
 * (api.github.com/copilot_internal/v2/token) can return 404 for some account
 * types, so it is intentionally NOT used here.
 *
 * Supported token types (PATs / ghp_* and github_pat_* are NOT accepted):
 *   gho_*          OAuth token (recommended — via `gh auth login`)
 *   ghu_*          GitHub App installation token
 *
 * Token resolution priority:
 *   1. GITHUB_COPILOT_TOKEN env var
 *   2. GH_TOKEN env var
 *   3. GITHUB_TOKEN env var
 *
 * On HTTP 401, callers should invoke resolve() again to re-read the chain
 * (credentials may have been refreshed externally) and retry once.
 *
 * PRD #587: GitHub Copilot Provider
 */

const SUPPORTED_PREFIXES = ['gho_', 'ghu_'];

function isSupported(token: string): boolean {
  return SUPPORTED_PREFIXES.some((p) => token.startsWith(p));
}
export interface CopilotCredentialResolver {
  /**
   * Resolve a GitHub token from the environment chain / CLI.
   * Throws if no supported token is found.
   */
  resolve(): string;
}

/**
 * Create a CopilotCredentialResolver.
 *
 * @param overrideToken  Optional explicit token (e.g. from env at factory time).
 *                       If provided and supported it is returned immediately without
 *                       inspecting the env chain.
 */
export function makeCopilotCredentialResolver(
  overrideToken?: string
): CopilotCredentialResolver {
  return {
    resolve(): string {
      // 1. Explicit override (e.g. GITHUB_COPILOT_TOKEN passed by factory)
      if (overrideToken && isSupported(overrideToken)) {
        return overrideToken;
      }

      // 2. Env chain
      for (const envVar of ['GITHUB_COPILOT_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']) {
        const val = process.env[envVar];
        if (val && isSupported(val)) {
          return val;
        }
      }

      throw new Error(
        'No supported GitHub token found for Copilot. ' +
          'Set GITHUB_COPILOT_TOKEN (gho_* or ghu_*). ' +
          'Personal access tokens (github_pat_* and ghp_*) are not supported by api.githubcopilot.com. ' +
          'GH_TOKEN and GITHUB_TOKEN are also checked in that order.'
      );
    },
  };
}

// Re-export the interface under the old name so existing callers (tests) can
// continue to import CopilotTokenExchanger without breaking.
export type CopilotTokenExchanger = CopilotCredentialResolver;
