/**
 * Mock-server helpers for PRD #581: per-request user prompts repo override.
 *
 * The real server validates and clones the override repo. The mock-server only
 * needs to mirror the wire contract — specifically, when a `repo` parameter is
 * supplied the response's `data.source` echoes that URL verbatim so CLI tagging
 * tests can verify the round-trip.
 *
 * Extracted from server.ts so it can be unit-tested without starting the HTTP
 * listener.
 */

export function isPromptsRoutePath(path: string): boolean {
  return (
    path === '/api/v1/prompts' ||
    path === '/api/v1/prompts/refresh' ||
    /^\/api\/v1\/prompts\/[^/]+$/.test(path)
  );
}

export function applyPromptsRepoOverride(
  fixture: unknown,
  repo: string | undefined
): unknown {
  if (!repo) return fixture;
  if (!fixture || typeof fixture !== 'object') return fixture;
  const f = fixture as { data?: unknown };
  if (!f.data || typeof f.data !== 'object') return fixture;
  return {
    ...f,
    data: {
      ...(f.data as Record<string, unknown>),
      source: repo,
    },
  };
}
