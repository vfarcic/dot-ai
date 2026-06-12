/**
 * Unit Tests: per-request override clone auth (PRD #621 M3, Decisions 3 & 4;
 * remediation MEDIUM-2/MEDIUM-3/R-1)
 *
 * Covers the security-critical clone-auth behavior that integration tests
 * cannot honestly exercise (no controllable second-auth-realm/redirecting git
 * host on the shared deployed server):
 *
 *   - buildOverrideCloneAuth scopes the credential to the source host via a
 *     username-only URL and emits git config that disables cross-host redirect
 *     forwarding (Decision 3) — and the TOKEN is NOT in that URL.
 *   - cloneRepo, given a per-call token, hands the token to git via GIT_ASKPASS
 *     (in the child ENV), so the token is NOT on the git argv (ps/proc) and NOT
 *     in the clone URL that becomes .git/config (MEDIUM-2/MEDIUM-3). The token
 *     overrides env auth (Decision 4). Without a token it falls back to env auth
 *     exactly as before, with no askpass and no redirect config (parity).
 *   - the askpass helper script holds NO secret (reads the token from the env)
 *     and is removed after the clone.
 *
 * simple-git is mocked so the auth/URL/config/env decision is observed without
 * spawning git.
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import * as fs from 'fs';

const { mockClone, mockStatus, mockEnv, gitMock } = vi.hoisted(() => {
  const mockClone = vi.fn();
  const mockStatus = vi.fn();
  const mockEnv = vi.fn();
  const gitMock = { clone: mockClone, status: mockStatus, env: mockEnv };
  return { mockClone, mockStatus, mockEnv, gitMock };
});

vi.mock('simple-git', () => ({
  default: vi.fn(() => gitMock),
}));

import {
  cloneRepo,
  buildOverrideCloneAuth,
  getAuthenticatedUrl,
  scrubCredentials,
  ASKPASS_TOKEN_ENV,
} from '../../../src/core/git-utils';

const REPO = 'https://github.com/example-org/private.git';
const TOKEN = 'per-call-secret-tok';

describe('buildOverrideCloneAuth (PRD #621 M3 / Decision 3)', () => {
  test('returns a username-only URL scoped to the source host (NO token in the URL)', () => {
    const { cloneUrl } = buildOverrideCloneAuth(REPO);
    const parsed = new URL(cloneUrl);
    // Credential is scoped to the SAME host as the source repo (URL userinfo is
    // per-origin) — it cannot reach any other host.
    expect(parsed.host).toBe(new URL(REPO).host);
    // Only the (non-secret) username is present; the token is supplied via
    // GIT_ASKPASS, never embedded here.
    expect(parsed.username).toBe('x-access-token');
    expect(parsed.password).toBe('');
  });

  test('disables HTTP redirect following so a redirect cannot present the credential to another host', () => {
    const { configArgs } = buildOverrideCloneAuth(REPO);
    // -c http.followRedirects=false → git never follows a redirect (Decision 3,
    // defense-in-depth; kept even with GIT_ASKPASS).
    expect(configArgs).toEqual(
      expect.arrayContaining(['-c', 'http.followRedirects=false'])
    );
    // -c credential.helper= → no credential helper observes/persists the secret.
    expect(configArgs).toEqual(
      expect.arrayContaining(['-c', 'credential.helper='])
    );
  });
});

describe('cloneRepo per-call token (PRD #621 M3 / Decisions 3 & 4)', () => {
  const savedToken = process.env.DOT_AI_GIT_TOKEN;
  const savedAppEnabled = process.env.GITHUB_APP_ENABLED;

  beforeEach(() => {
    mockClone.mockReset();
    mockStatus.mockReset();
    mockEnv.mockReset();
    mockClone.mockResolvedValue(undefined);
    mockStatus.mockResolvedValue({ current: 'main' });
    // .env() must be chainable — return the same git mock.
    mockEnv.mockReturnValue(gitMock);
    delete process.env.DOT_AI_GIT_TOKEN;
    delete process.env.GITHUB_APP_ENABLED;
  });

  afterEach(() => {
    if (savedToken !== undefined) process.env.DOT_AI_GIT_TOKEN = savedToken;
    else delete process.env.DOT_AI_GIT_TOKEN;
    if (savedAppEnabled !== undefined)
      process.env.GITHUB_APP_ENABLED = savedAppEnabled;
    else delete process.env.GITHUB_APP_ENABLED;
  });

  test('the token is NOT on the git argv (clone url/options) — MEDIUM-3', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', {
      token: TOKEN,
      branch: 'feature-x',
      depth: 1,
    });

    expect(mockClone).toHaveBeenCalledTimes(1);
    const [url, dir, options] = mockClone.mock.calls[0];
    // The clone URL carries only the username — never the token.
    expect(url).toBe('https://x-access-token@github.com/example-org/private.git');
    expect(dir).toBe('/tmp/clone-target');
    // Token appears NOWHERE on the argv (url, dir, or any option).
    expect(JSON.stringify([url, dir, ...options])).not.toContain(TOKEN);
    // Redirect-scoping + branch/depth config is still present.
    expect(options).toEqual(
      expect.arrayContaining([
        '-c',
        'http.followRedirects=false',
        '-c',
        'credential.helper=',
        '--branch',
        'feature-x',
        '--depth',
        '1',
      ])
    );
  });

  test('the token is NOT in the clone URL that becomes .git/config — MEDIUM-2', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', { token: TOKEN });
    const [url] = mockClone.mock.calls[0];
    // git persists the clone URL verbatim as the `origin` remote in
    // .git/config; a username-only URL means the token is never written there.
    expect(url).not.toContain(TOKEN);
    expect(scrubCredentials(url)).not.toContain(TOKEN);
  });

  test('the token is handed to git via GIT_ASKPASS in the child ENV (not argv)', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', { token: TOKEN });

    expect(mockEnv).toHaveBeenCalledTimes(1);
    const env = mockEnv.mock.calls[0][0];
    expect(env[ASKPASS_TOKEN_ENV]).toBe(TOKEN);
    expect(typeof env.GIT_ASKPASS).toBe('string');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    // process.env is carried through so the child keeps PATH etc.
    expect(env.PATH ?? env.Path).toBeDefined();
  });

  test('the GIT_ASKPASS helper holds NO secret and is removed after the clone', async () => {
    let captured: { path: string; content: string; mode: number } | undefined;
    mockClone.mockImplementation(async () => {
      const env = mockEnv.mock.calls.at(-1)?.[0];
      const scriptPath: string | undefined = env?.GIT_ASKPASS;
      if (scriptPath && fs.existsSync(scriptPath)) {
        captured = {
          path: scriptPath,
          content: fs.readFileSync(scriptPath, 'utf8'),
          mode: fs.statSync(scriptPath).mode,
        };
      }
    });

    await cloneRepo(REPO, '/tmp/clone-target', { token: TOKEN });

    expect(captured).toBeDefined();
    // The script reads the token from the env var — it does NOT contain the token.
    expect(captured!.content).toContain(ASKPASS_TOKEN_ENV);
    expect(captured!.content).not.toContain(TOKEN);
    // Owner-executable.
    expect(captured!.mode & 0o100).toBe(0o100);
    // Cleaned up once the clone finished — no askpass residue.
    expect(fs.existsSync(captured!.path)).toBe(false);
  });

  test('the per-call token OVERRIDES the env credential (Decision 4)', async () => {
    process.env.DOT_AI_GIT_TOKEN = 'env-tok-should-not-be-used';

    await cloneRepo(REPO, '/tmp/clone-target', { token: TOKEN });

    const [url] = mockClone.mock.calls[0];
    // Neither the env token nor the per-call token is in the URL.
    expect(url).not.toContain('env-tok-should-not-be-used');
    expect(url).not.toContain(TOKEN);
    // The per-call token (not the env token) is what reaches git via askpass.
    const env = mockEnv.mock.calls[0][0];
    expect(env[ASKPASS_TOKEN_ENV]).toBe(TOKEN);
  });

  test('without a per-call token, falls back to env auth — no askpass, no redirect config (parity)', async () => {
    process.env.DOT_AI_GIT_TOKEN = 'env-tok';

    await cloneRepo(REPO, '/tmp/clone-target', { branch: 'main', depth: 1 });

    const [url, , options] = mockClone.mock.calls[0];
    // Env-authenticated URL, exactly as before PRD #621.
    expect(url).toBe(getAuthenticatedUrl(REPO, 'env-tok'));
    // No GIT_ASKPASS wiring and no redirect-scoping config on the env path.
    expect(mockEnv).not.toHaveBeenCalled();
    expect(options).not.toContain('http.followRedirects=false');
    expect(options).not.toContain('credential.helper=');
  });

  test('no token and no env auth clones unauthenticated (public repo, unchanged)', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', {});

    const [url, , options] = mockClone.mock.calls[0];
    expect(url).toBe(REPO);
    expect(mockEnv).not.toHaveBeenCalled();
    expect(options).not.toContain('http.followRedirects=false');
  });
});
