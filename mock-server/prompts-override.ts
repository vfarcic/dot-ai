/**
 * Mock-server helpers for the per-request user prompts repo override.
 *
 * The real server validates and clones the override repo. The mock-server only
 * needs to mirror the wire CONTRACT so the companion CLI (vfarcic/dot-ai-cli)
 * can test against it:
 *
 *   PRD #581 — `repo`:
 *     when a `repo` parameter is supplied the response's `data.source` echoes
 *     that URL (credentials scrubbed) so CLI tagging tests can verify the
 *     round-trip.
 *
 *   PRD #621 M5 — `path` / `branch` / token:
 *     - `?path=` / `?branch=` (query on GET list & POST get-by-name) and `path`
 *       / `branch` (JSON body on POST /refresh) select a DISTINCT prompt set
 *       when BOTH are supplied alongside a repo override — mirroring the real
 *       server resolving a subdir on a non-default branch.
 *     - invalid `path` (traversal/absolute/null-byte) or `branch` (illegal
 *       chars) → request-scoped 400 with credentials scrubbed.
 *     - the credential travels ONLY as the X-Dot-AI-Git-Token header (never
 *       query/body) and is accepted but NEVER echoed; `source` is unaffected by
 *       path/branch/token.
 *
 * Extracted from server.ts so it can be unit-tested without starting the HTTP
 * listener.
 */

import { posix } from 'node:path';

export function isPromptsRoutePath(path: string): boolean {
  return (
    path === '/api/v1/prompts' ||
    path === '/api/v1/prompts/refresh' ||
    /^\/api\/v1\/prompts\/[^/]+$/.test(path)
  );
}

/**
 * Query-param names whose values look credential-bearing. Mirrors the real
 * server's scrubSourceUrl allowlist (case-insensitive substring match).
 */
const CREDENTIAL_PARAM_RE = /token|key|secret|password|auth|credential/i;

/**
 * Scrub userinfo (https://user:pass@host) from a URL. Mirrors the real
 * server's sanitizeUrlForLogging.
 */
function scrubUserinfo(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return url.replace(/\/\/[^@]+@/, '//***@');
  }
}

/**
 * Scrub a repo URL before it is echoed into `data.source`. Removes BOTH
 * userinfo credentials and credential-bearing query-param values (deterministic
 * `***` placeholder, so the scrubbed value is stable per repo — the CLI relies
 * on a stable source for skill tagging). Mirrors the real server's
 * scrubSourceUrl. A credential-free URL is returned unchanged.
 */
export function scrubRepoUrl(url: string): string {
  const userinfoScrubbed = scrubUserinfo(url);
  try {
    const parsed = new URL(userinfoScrubbed);
    let mutated = false;
    for (const name of [...parsed.searchParams.keys()]) {
      if (CREDENTIAL_PARAM_RE.test(name)) {
        parsed.searchParams.set(name, '***');
        mutated = true;
      }
    }
    return mutated ? parsed.toString() : userinfoScrubbed;
  } catch {
    return userinfoScrubbed;
  }
}

/**
 * Scrub credentials embedded in a free-text message. Mirrors the real server's
 * git-utils scrubCredentials (used on validation-error messages as
 * defense-in-depth).
 */
export function scrubCredentials(message: string): string {
  return message
    .replace(/\/\/x-access-token:[^@]+@/g, '//***@')
    .replace(/\/\/[^/:][^@]*:[^@]+@/g, '//***@');
}

/**
 * Coerce an override param (repo/path/branch) supplied via query string or JSON
 * body: non-strings and empty/whitespace-only values become `undefined`
 * (treated as not supplied); otherwise the trimmed value. Mirrors the real
 * server's coerceOverrideStringParam emptiness handling.
 */
export function coerceOverrideParam(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Branch character set accepted by the real server (isValidGitBranch). */
const VALID_BRANCH_RE = /^[a-zA-Z0-9_.\-/]+$/;

/**
 * Reject a subPath that escapes the repo root, is absolute, or contains a null
 * byte. Mirrors the real server's sanitizeRelativePath.
 */
function assertSafeSubPath(subPath: string): void {
  if (subPath.includes('\0')) {
    throw new Error('contains null byte');
  }
  if (subPath.startsWith('/')) {
    throw new Error('Relative path cannot be absolute');
  }
  const normalized = posix.normalize(subPath);
  if (normalized.startsWith('..') || posix.isAbsolute(normalized)) {
    throw new Error('Relative path cannot escape target directory');
  }
}

export interface PromptsOverrideParams {
  repo?: string;
  path?: string;
  branch?: string;
}

export type OverrideValidation =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Validate the override path/branch. Path/branch only qualify a repo override,
 * so without a `repo` they are ignored (no 400) — exactly as the real server's
 * extractPromptsOverride drops them when no repo is present. With a repo, an
 * invalid path or branch yields a request-scoped 400 message (credentials
 * scrubbed). Mirrors getUserPromptsConfigFromOverride's validation.
 */
export function validatePromptsOverride(
  params: PromptsOverrideParams
): OverrideValidation {
  if (!params.repo) {
    return { ok: true };
  }
  if (params.path !== undefined) {
    try {
      assertSafeSubPath(params.path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'invalid';
      return {
        ok: false,
        message: scrubCredentials(`Invalid override subPath: ${detail}`),
      };
    }
  }
  if (params.branch !== undefined && !VALID_BRANCH_RE.test(params.branch)) {
    return {
      ok: false,
      message: scrubCredentials(
        `Invalid override branch name: ${params.branch}`
      ),
    };
  }
  return { ok: true };
}

/**
 * Fixture serving the DISTINCT prompt set for an override that carries BOTH a
 * path and a branch (keyed by route path). Mirrors the real server resolving a
 * subdir on a non-default branch — the marker prompt is reachable only when
 * both flow through.
 */
const OVERRIDE_PATH_BRANCH_FIXTURES: Record<string, string> = {
  '/api/v1/prompts': 'prompts/list-override-path-branch.json',
  '/api/v1/prompts/refresh': 'prompts/refresh-override-path-branch.json',
  '/api/v1/prompts/:promptName': 'prompts/get-override-path-branch.json',
};

/**
 * Return the path+branch override fixture for a prompts route, or undefined if
 * the route has no distinct override fixture.
 */
export function getOverridePathBranchFixture(
  routePath: string
): string | undefined {
  return OVERRIDE_PATH_BRANCH_FIXTURES[routePath];
}

/**
 * Whether a request resolves the DISTINCT path+branch prompt set: a repo
 * override carrying BOTH a (valid) path and branch.
 */
export function selectsOverridePathBranchSet(
  params: PromptsOverrideParams
): boolean {
  return Boolean(params.repo && params.path && params.branch);
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
      // `source` echoes the override repo with credentials scrubbed, and is
      // unaffected by path/branch/token (PRD #621 M5 contract).
      source: scrubRepoUrl(repo),
    },
  };
}
