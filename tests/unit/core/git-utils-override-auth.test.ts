/**
 * Unit Tests: per-request override clone auth (PRD #621 M3, Decisions 3 & 4;
 * remediation MEDIUM-2/MEDIUM-3/R-1 + the CI clone-failure fix)
 *
 * The token-bearing override clone spawns `git` DIRECTLY (not via simple-git,
 * whose safety scanner rejected the GIT_ASKPASS / credential.helper wiring and
 * aborted the clone). These tests pin:
 *   - buildOverrideCloneAuth returns a username-only URL (token NOT in the URL)
 *     scoped to the source host.
 *   - cloneRepo's token path puts the token NOWHERE on the git argv (it rides a
 *     HOST-BOUND GIT_ASKPASS helper in the child ENV) and the clone URL (which
 *     becomes .git/config) carries no token.
 *   - the GIT_ASKPASS helper is HOST-BOUND: it emits the token ONLY for the
 *     intended host, and nothing for a different/look-alike host (Decision 3).
 *   - the helper holds no secret, is executable, and is removed after the clone.
 *   - the env-credential path is unchanged (simple-git, no spawn, no askpass).
 *
 * child_process.spawn and simple-git are mocked so the decision is observed
 * without performing a real clone.
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
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';

const { mockSpawn, mockClone, mockStatus } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockClone: vi.fn(),
  mockStatus: vi.fn(),
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: mockSpawn };
});

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({ clone: mockClone, status: mockStatus })),
}));

import {
  cloneRepo,
  buildOverrideCloneAuth,
  getAuthenticatedUrl,
  ASKPASS_TOKEN_ENV,
  ASKPASS_HOST_ENV,
} from '../../../src/core/git-utils';

const REPO = 'https://github.com/example-org/private.git';
const TOKEN = 'per-call-secret-tok';

/** Fake child process that closes with `exitCode` on the next tick. */
function makeChild(exitCode = 0, stderr = ''): EventEmitter {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    kill: () => void;
  };
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  setImmediate(() => {
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', exitCode);
  });
  return child;
}

describe('buildOverrideCloneAuth (PRD #621 M3 / Decision 3)', () => {
  test('returns a username-only URL scoped to the source host (NO token in the URL)', () => {
    const { cloneUrl, host } = buildOverrideCloneAuth(REPO);
    const parsed = new URL(cloneUrl);
    expect(parsed.host).toBe(new URL(REPO).host);
    expect(host).toBe('github.com');
    // Only the (non-secret) username is present; the token is supplied via
    // GIT_ASKPASS, never embedded here.
    expect(parsed.username).toBe('x-access-token');
    expect(parsed.password).toBe('');
  });

  test('preserves a non-default port in the host', () => {
    const { cloneUrl, host } = buildOverrideCloneAuth(
      'https://forgejo.example.com:3000/org/repo.git'
    );
    expect(host).toBe('forgejo.example.com:3000');
    expect(cloneUrl).toContain('x-access-token@forgejo.example.com:3000');
  });
});

describe('cloneRepo per-call token (PRD #621 M3 / Decisions 3 & 4)', () => {
  const savedToken = process.env.DOT_AI_GIT_TOKEN;
  const savedAppEnabled = process.env.GITHUB_APP_ENABLED;

  let lastSpawn:
    | { cmd: string; args: string[]; env: NodeJS.ProcessEnv }
    | undefined;
  let askpass: { scriptPath: string; content: string; mode: number } | undefined;

  beforeEach(() => {
    lastSpawn = undefined;
    askpass = undefined;
    mockSpawn.mockReset();
    mockSpawn.mockImplementation(
      (cmd: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
        lastSpawn = { cmd, args, env: options.env };
        const scriptPath = options.env?.GIT_ASKPASS as string | undefined;
        if (scriptPath && fs.existsSync(scriptPath)) {
          askpass = {
            scriptPath,
            content: fs.readFileSync(scriptPath, 'utf8'),
            mode: fs.statSync(scriptPath).mode,
          };
        }
        return makeChild(0);
      }
    );
    mockClone.mockReset();
    mockClone.mockResolvedValue(undefined);
    mockStatus.mockReset();
    mockStatus.mockResolvedValue({ current: 'main' });
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

  test('spawns git directly (NOT simple-git) for a token clone', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', {
      token: TOKEN,
      branch: 'feature-x',
      depth: 1,
    });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockClone).not.toHaveBeenCalled();
    expect(lastSpawn!.cmd).toBe('git');
  });

  test('the token is NOT on the git argv, and the clone URL has no token — MEDIUM-2/3', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', {
      token: TOKEN,
      branch: 'feature-x',
      depth: 1,
    });
    const { args } = lastSpawn!;
    // The URL git is given (and persists as origin in .git/config) is
    // username-only.
    expect(args).toContain(
      'https://x-access-token@github.com/example-org/private.git'
    );
    expect(args).toEqual(
      expect.arrayContaining(['clone', '--branch', 'feature-x', '--depth', '1'])
    );
    // Token appears NOWHERE on the argv.
    expect(JSON.stringify(args)).not.toContain(TOKEN);
  });

  test('the token + intended host ride the child ENV via GIT_ASKPASS', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', { token: TOKEN });
    const env = lastSpawn!.env;
    expect(env[ASKPASS_TOKEN_ENV]).toBe(TOKEN);
    expect(env[ASKPASS_HOST_ENV]).toBe('github.com');
    expect(typeof env.GIT_ASKPASS).toBe('string');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    // Full process.env is carried through (PATH etc.).
    expect(env.PATH ?? env.Path).toBeDefined();
  });

  test('the GIT_ASKPASS helper holds NO secret, is executable, and is removed after the clone', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', { token: TOKEN });
    expect(askpass).toBeDefined();
    // Reads the token from the env var — does NOT contain the token.
    expect(askpass!.content).toContain(ASKPASS_TOKEN_ENV);
    expect(askpass!.content).not.toContain(TOKEN);
    // Owner-executable.
    expect(askpass!.mode & 0o100).toBe(0o100);
    // Cleaned up once the clone finished.
    expect(fs.existsSync(askpass!.scriptPath)).toBe(false);
  });

  // Decision 3, the core security property: the helper emits the token ONLY for
  // the intended host. We execute the EXACT generated script against the
  // credential prompts git would produce.
  test('the GIT_ASKPASS helper is HOST-BOUND — token only for the intended host (Decision 3)', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', { token: TOKEN });
    const host = lastSpawn!.env[ASKPASS_HOST_ENV] as string;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'askpass-hostbound-'));
    const scriptPath = path.join(dir, 'askpass.sh');
    fs.writeFileSync(scriptPath, askpass!.content, { mode: 0o700 });
    const run = (prompt: string): string =>
      execFileSync(scriptPath, [prompt], {
        env: { [ASKPASS_TOKEN_ENV]: TOKEN, [ASKPASS_HOST_ENV]: host },
        encoding: 'utf8',
      }).trim();

    try {
      // Intended host → emits the token.
      expect(run(`Password for 'https://x-access-token@${host}': `)).toBe(
        TOKEN
      );
      // Different host (e.g. after a cross-host redirect) → emits nothing.
      expect(run(`Password for 'https://x-access-token@evil.test': `)).toBe('');
      // Look-alike suffix host → emits nothing (delimiter-bounded match).
      expect(
        run(`Password for 'https://x-access-token@${host}.evil.test': `)
      ).toBe('');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the per-call token OVERRIDES the env credential (Decision 4)', async () => {
    process.env.DOT_AI_GIT_TOKEN = 'env-tok-should-not-be-used';
    await cloneRepo(REPO, '/tmp/clone-target', { token: TOKEN });
    // Token path used (spawn), env path (simple-git) not used.
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockClone).not.toHaveBeenCalled();
    expect(JSON.stringify(lastSpawn!.args)).not.toContain(
      'env-tok-should-not-be-used'
    );
    expect(lastSpawn!.env[ASKPASS_TOKEN_ENV]).toBe(TOKEN);
  });

  test('a non-zero git exit rejects with the (token-free) stderr', async () => {
    mockSpawn.mockReset();
    mockSpawn.mockImplementation(() =>
      makeChild(128, 'fatal: Authentication failed')
    );
    await expect(
      cloneRepo(REPO, '/tmp/clone-target', { token: TOKEN })
    ).rejects.toThrow(/git clone exited with code 128/);
  });
});

describe('cloneRepo env path — unchanged (no token)', () => {
  const savedToken = process.env.DOT_AI_GIT_TOKEN;
  const savedAppEnabled = process.env.GITHUB_APP_ENABLED;

  beforeEach(() => {
    mockSpawn.mockReset();
    mockClone.mockReset();
    mockClone.mockResolvedValue(undefined);
    mockStatus.mockReset();
    mockStatus.mockResolvedValue({ current: 'main' });
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

  test('env token → simple-git clone with the env-authenticated URL, NO spawn, NO askpass', async () => {
    process.env.DOT_AI_GIT_TOKEN = 'env-tok';
    await cloneRepo(REPO, '/tmp/clone-target', { branch: 'main', depth: 1 });
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockClone).toHaveBeenCalledTimes(1);
    const [url] = mockClone.mock.calls[0];
    expect(url).toBe(getAuthenticatedUrl(REPO, 'env-tok'));
  });

  test('no token and no env auth clones unauthenticated (public repo, unchanged)', async () => {
    await cloneRepo(REPO, '/tmp/clone-target', {});
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockClone).toHaveBeenCalledTimes(1);
    const [url] = mockClone.mock.calls[0];
    expect(url).toBe(REPO);
  });
});
