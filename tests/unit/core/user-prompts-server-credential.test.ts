/**
 * Unit Tests: the SERVER's git credential is never handed to a client-named host
 * (PRD #710 — finding C, fourth instance: the `?repo=` user-prompts override).
 *
 * The hole these tests close: `GET /api/v1/prompts?repo=https://attacker.example/x.git`
 * with NO X-Dot-AI-Git-Token header reaches cloneRepo's env-auth path, which
 * embeds DOT_AI_GIT_TOKEN (or a freshly minted GitHub App installation token)
 * into whatever URL it was given. getUserPromptsConfigFromOverride validates
 * that URL's SCHEME and nothing about its host, so any caller able to reach the
 * endpoint could have the server's credential delivered to a host they control
 * — the same class pushToGit was gated against, on a path that was left open.
 *
 * The remedy DEGRADES rather than refuses: the clone still happens, just
 * unauthenticated, so every PUBLIC repository on every host keeps working. Only
 * a PRIVATE repo on a non-allowlisted host changes, and it has a mechanism —
 * the per-request X-Dot-AI-Git-Token header from PRD #621, which these tests
 * pin as untouched for any host.
 *
 * The seam is deliberately END-TO-END for the decision that matters: git-utils
 * is REAL here (unlike user-prompts-loader.test.ts, which mocks cloneRepo), and
 * only `simple-git` / `spawn` are doubled. So each test observes the exact URL
 * and auth material git itself would have received — the leak is proven at the
 * place it would actually happen, not at an intermediate option object.
 *
 * Isolation: this file chdirs into a private sandbox, because the loader's cache
 * directory is `<cwd>/tmp/user-prompts` and a second test file cloning (or
 * clearing) that shared slot would race user-prompts-loader.test.ts.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'node:events';

const {
  mockSpawn,
  mockClone,
  mockStatus,
  mockGetRemotes,
  mockRemote,
  mockPull,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockClone: vi.fn(),
  mockStatus: vi.fn(),
  mockGetRemotes: vi.fn(),
  mockRemote: vi.fn(),
  mockPull: vi.fn(),
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: mockSpawn };
});

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    clone: mockClone,
    status: mockStatus,
    getRemotes: mockGetRemotes,
    remote: mockRemote,
    pull: mockPull,
  })),
}));

import {
  getAuthenticatedUrl,
  ALLOWED_REPO_HOSTS_ENV,
  ASKPASS_TOKEN_ENV,
  ASKPASS_HOST_ENV,
} from '../../../src/core/git-utils';
import {
  loadUserPrompts,
  clearUserPromptsCache,
  UserPromptsOverrideError,
} from '../../../src/core/user-prompts-loader';
import type { Logger } from '../../../src/core/error-handling';

const SERVER_TOKEN = 'ghp_serverEnvCredentialSecret';
const CLIENT_TOKEN = 'client-forwarded-credential-secret';
const ALLOWED_REPO = 'https://github.com/example-org/prompts.git';
const FOREIGN_REPO = 'https://attacker.example/x.git';
const CORP_REPO = 'https://gitlab.corp/team/prompts.git';
/**
 * An ALLOWED host over a scheme that may not carry the credential — the case
 * whose refusal a host-only message describes self-contradictorily. `http://` is
 * the only such scheme that gets this far: getUserPromptsConfigFromOverride
 * rejects ssh/git/file URLs outright, before any credential decision.
 */
const HTTP_ALLOWED_HOST_REPO = 'http://github.com/example-org/prompts.git';

const SANDBOX = path.resolve(process.cwd(), 'tmp', 'unit-prompts-server-cred');

interface CapturedCall {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
  errorMessage?: string;
}

function makeCapturingLogger(): { logger: Logger; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const logger: Logger = {
    debug: (message, data) => calls.push({ level: 'debug', message, data }),
    info: (message, data) => calls.push({ level: 'info', message, data }),
    warn: (message, data) => calls.push({ level: 'warn', message, data }),
    error: (message, error, data) =>
      calls.push({
        level: 'error',
        message,
        data,
        errorMessage: error?.message,
      }),
  };
  return { logger, calls };
}

/** A tiny but valid prompts directory, so the loader's scan+parse completes. */
function writePromptsDir(targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, 'prd-710-test.md'),
    [
      '---',
      'name: prd-710-test',
      'description: Test prompt for the PRD 710 credential gate',
      '---',
      '',
      'Body content.',
    ].join('\n')
  );
}

/** The URL `git clone` was given by the env-auth (simple-git) path. */
function clonedUrl(): string {
  expect(mockClone).toHaveBeenCalledTimes(1);
  return mockClone.mock.calls[0][0] as string;
}

const ENV_KEYS = [
  'DOT_AI_GIT_TOKEN',
  'GITHUB_APP_ENABLED',
  'DOT_AI_USER_PROMPTS_REPO',
  'DOT_AI_USER_PROMPTS_BRANCH',
  'DOT_AI_USER_PROMPTS_PATH',
  'DOT_AI_USER_PROMPTS_CACHE_TTL',
  ALLOWED_REPO_HOSTS_ENV,
];
const savedEnv: Record<string, string | undefined> = {};
let originalCwd: string;

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  originalCwd = process.cwd();
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(SANDBOX, { recursive: true });
  process.chdir(SANDBOX);
});

afterAll(() => {
  process.chdir(originalCwd);
  clearUserPromptsCache();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  fs.rmSync(SANDBOX, { recursive: true, force: true });
});

beforeEach(() => {
  clearUserPromptsCache();
  for (const key of ENV_KEYS) delete process.env[key];
  // The server HAS a credential in every test below — the question is only ever
  // whether it is attached to the URL the client named.
  process.env.DOT_AI_GIT_TOKEN = SERVER_TOKEN;

  mockSpawn.mockReset();
  mockClone.mockReset();
  mockClone.mockImplementation(async (_url: string, targetDir: string) => {
    writePromptsDir(targetDir);
  });
  mockStatus.mockReset();
  mockStatus.mockResolvedValue({ current: 'main' });
  mockGetRemotes.mockReset();
  mockRemote.mockReset();
  mockRemote.mockResolvedValue(undefined);
  mockPull.mockReset();
  mockPull.mockResolvedValue(undefined);
});

// ───────────────────────────────────────────────────────────────────────────
// The leak, and its remedy
// ───────────────────────────────────────────────────────────────────────────

describe('client-supplied ?repo= override (the fourth instance)', () => {
  test('the server credential is NOT attached to a non-allowlisted host', async () => {
    const { logger } = makeCapturingLogger();
    await loadUserPrompts(logger, false, { repoUrl: FOREIGN_REPO });

    // Before the fix this was getAuthenticatedUrl(FOREIGN_REPO, SERVER_TOKEN),
    // i.e. the server's PAT delivered as basic auth to a host the caller chose
    // (and written into that clone's .git/config).
    expect(clonedUrl()).toBe(FOREIGN_REPO);
    expect(clonedUrl()).not.toContain(SERVER_TOKEN);
    expect(new URL(clonedUrl()).username).toBe('');
  });

  test('the clone still PROCEEDS unauthenticated — degrade, not refuse', async () => {
    const { logger } = makeCapturingLogger();
    const prompts = await loadUserPrompts(logger, false, {
      repoUrl: FOREIGN_REPO,
    });

    // A public repository on any host keeps working exactly as before: the
    // request is not rejected, the clone is not skipped, the prompts load.
    expect(mockClone).toHaveBeenCalledTimes(1);
    expect(prompts).toMatchObject([{ name: 'prd-710-test' }]);
  });

  test('an ALLOWLISTED host still receives the server credential', async () => {
    const { logger } = makeCapturingLogger();
    await loadUserPrompts(logger, false, { repoUrl: ALLOWED_REPO });

    expect(clonedUrl()).toBe(getAuthenticatedUrl(ALLOWED_REPO, SERVER_TOKEN));
  });

  test('adding the host to the allowlist restores the credential', async () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com,gitlab.corp';
    const { logger } = makeCapturingLogger();
    await loadUserPrompts(logger, false, { repoUrl: CORP_REPO });

    // The one operator action that changes the outcome is the same value
    // pushToGit is gated on — no second config knob for this path.
    expect(clonedUrl()).toBe(getAuthenticatedUrl(CORP_REPO, SERVER_TOKEN));
  });

  test('an explicitly EMPTY allowlist withholds the credential even for github.com', async () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = '';
    const { logger } = makeCapturingLogger();
    await loadUserPrompts(logger, false, { repoUrl: ALLOWED_REPO });

    expect(clonedUrl()).toBe(ALLOWED_REPO);
    expect(clonedUrl()).not.toContain(SERVER_TOKEN);
  });

  test('a GitHub App is not even MINTED for a non-allowlisted host', async () => {
    // No PAT, App enabled but unconfigured: reading the env at all would throw
    // (and minting would be an outbound API call carrying the App JWT). The
    // credential is withheld before either can happen.
    delete process.env.DOT_AI_GIT_TOKEN;
    process.env.GITHUB_APP_ENABLED = 'true';

    const { logger } = makeCapturingLogger();
    await loadUserPrompts(logger, false, { repoUrl: FOREIGN_REPO });

    expect(clonedUrl()).toBe(FOREIGN_REPO);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// What the gate must NOT touch
// ───────────────────────────────────────────────────────────────────────────

describe('paths the gate leaves alone', () => {
  test("the operator's DOT_AI_USER_PROMPTS_REPO is not gated, on any host", async () => {
    // Not client-supplied: the operator chose this destination, and is the same
    // person who edits the allowlist. Gating it would break their private
    // GitLab prompts repo while protecting nothing.
    process.env.DOT_AI_USER_PROMPTS_REPO = CORP_REPO;
    const { logger } = makeCapturingLogger();
    await loadUserPrompts(logger);

    expect(clonedUrl()).toBe(getAuthenticatedUrl(CORP_REPO, SERVER_TOKEN));
  });

  test('a forwarded X-Dot-AI-Git-Token is used for a NON-allowlisted host (PRD #621 intact)', async () => {
    let spawnedArgs: string[] = [];
    let spawnedEnv: NodeJS.ProcessEnv = {};
    mockSpawn.mockImplementation(
      (_cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
        spawnedArgs = args;
        spawnedEnv = opts.env;
        writePromptsDir(args[args.length - 1]);
        const child = new EventEmitter() as EventEmitter & {
          stderr: EventEmitter;
          kill: () => void;
        };
        child.stderr = new EventEmitter();
        child.kill = vi.fn();
        setImmediate(() => child.emit('close', 0));
        return child;
      }
    );

    const { logger, calls } = makeCapturingLogger();
    const prompts = await loadUserPrompts(logger, false, {
      repoUrl: FOREIGN_REPO,
      gitToken: CLIENT_TOKEN,
    });

    // The client's own credential is honoured, host-bound, for a host the
    // allowlist does not cover: only the SERVER's credential is gated.
    expect(prompts).toMatchObject([{ name: 'prd-710-test' }]);
    expect(spawnedEnv[ASKPASS_TOKEN_ENV]).toBe(CLIENT_TOKEN);
    expect(spawnedEnv[ASKPASS_HOST_ENV]).toBe('attacker.example');
    // …and the server's credential is nowhere in the auth material.
    expect(spawnedEnv[ASKPASS_TOKEN_ENV]).not.toBe(SERVER_TOKEN);
    expect(spawnedArgs.join(' ')).not.toContain(SERVER_TOKEN);
    expect(spawnedArgs.join(' ')).not.toContain(CLIENT_TOKEN);
    // No env-auth clone happened, and nothing was withheld to warn about.
    expect(mockClone).not.toHaveBeenCalled();
    expect(
      calls.filter(c => c.message.startsWith('Withholding the server git'))
    ).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The pull path — the same leak one cache TTL later
// ───────────────────────────────────────────────────────────────────────────

describe('refreshing a cached client-supplied clone', () => {
  /**
   * Prime the shared cache, then force the refresh (pull) path, handing back
   * what the REFRESH call logged.
   */
  async function cloneThenRefresh(repoUrl: string): Promise<CapturedCall[]> {
    mockGetRemotes.mockResolvedValue([
      { name: 'origin', refs: { fetch: repoUrl } },
    ]);
    await loadUserPrompts(makeCapturingLogger().logger, false, { repoUrl });
    expect(mockClone).toHaveBeenCalledTimes(1);
    const refresh = makeCapturingLogger();
    await loadUserPrompts(refresh.logger, true, { repoUrl });
    expect(mockPull).toHaveBeenCalledTimes(1);
    return refresh.calls;
  }

  test('origin is NOT rewritten with the server credential for a non-allowlisted host', async () => {
    const refreshLog = await cloneThenRefresh(FOREIGN_REPO);

    // pullRepo rewrites `origin` to the authenticated URL before pulling, and
    // `origin` here is the URL the client supplied — so gating only the clone
    // would have leaked the credential on the first refresh instead.
    expect(mockRemote).not.toHaveBeenCalled();
    expect(JSON.stringify(mockRemote.mock.calls)).not.toContain(SERVER_TOKEN);
    // Observable on this path too, and phrased for what a pull actually does.
    const warn = refreshLog.find(
      c =>
        c.level === 'warn' &&
        c.message === 'Withholding the server git credential from this pull'
    );
    expect(warn).toBeDefined();
    expect(warn!.data).toMatchObject({ host: 'attacker.example' });
  });

  test('origin IS rewritten with the server credential for an allowlisted host', async () => {
    await cloneThenRefresh(ALLOWED_REPO);

    // The refresh of an allowed repository is unchanged: authenticate, pull,
    // then restore the credential-free URL.
    expect(mockRemote.mock.calls[0][0]).toEqual([
      'set-url',
      'origin',
      getAuthenticatedUrl(ALLOWED_REPO, SERVER_TOKEN),
    ]);
    expect(mockRemote.mock.calls[1][0]).toEqual([
      'set-url',
      'origin',
      ALLOWED_REPO,
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Observability of the degradation
// ───────────────────────────────────────────────────────────────────────────

describe('observability', () => {
  test('withholding is logged with the host, the allowlist and the way out', async () => {
    const { logger, calls } = makeCapturingLogger();
    await loadUserPrompts(logger, false, { repoUrl: FOREIGN_REPO });

    const warn = calls.find(
      c =>
        c.level === 'warn' &&
        c.message === 'Withholding the server git credential from this clone'
    );
    expect(warn).toBeDefined();
    expect(warn!.data).toMatchObject({
      host: 'attacker.example',
      allowedHosts: ['github.com'],
    });
    expect(JSON.stringify(warn!.data)).toContain('gitops.allowedRepoHosts');
    expect(JSON.stringify(warn!.data)).toContain('X-Dot-AI-Git-Token');
  });

  test('the log line never carries the credential from the URL', async () => {
    const secret = 'tok_in_the_override_url';
    const { logger, calls } = makeCapturingLogger();
    await loadUserPrompts(logger, false, {
      repoUrl: `https://x-access-token:${secret}@attacker.example/x.git`,
    });

    expect(JSON.stringify(calls)).not.toContain(secret);
    expect(JSON.stringify(calls)).not.toContain(SERVER_TOKEN);
  });

  test('a failed unauthenticated clone points at the header mechanism', async () => {
    // What a private repo returns to an unauthenticated caller: a bare "not
    // found" that otherwise reads as a typo or an outage.
    mockClone.mockReset();
    mockClone.mockRejectedValue(
      new Error("fatal: repository 'https://attacker.example/x.git/' not found")
    );

    const { logger } = makeCapturingLogger();
    const error = await loadUserPrompts(logger, false, {
      repoUrl: FOREIGN_REPO,
    }).catch(e => e);

    expect(error).toBeInstanceOf(UserPromptsOverrideError);
    expect(error.message).toContain('not found');
    expect(error.message).toContain('attacker.example');
    expect(error.message).toContain('X-Dot-AI-Git-Token');
    expect(error.message).toContain('gitops.allowedRepoHosts');
    expect(error.message).not.toContain(SERVER_TOKEN);
  });

  // ── The scheme half of the gate, reported as itself ──
  //
  // `http://` is the one non-https scheme that reaches here (the override
  // validator rejects the rest outright), and on the DEFAULT allowlist
  // `http://github.com/x.git` is refused for its scheme while its host IS
  // allowed. Both explanations used to be host-only, so they claimed host
  // "github.com" was not on an allowlist reading "github.com" — self-
  // contradictory, and it sent the reader to change a correct chart value.

  test('a scheme refusal is logged as a scheme problem, not a host one', async () => {
    const { logger, calls } = makeCapturingLogger();
    await loadUserPrompts(logger, false, { repoUrl: HTTP_ALLOWED_HOST_REPO });

    // The credential really is withheld — this is the gate, not just wording.
    expect(clonedUrl()).toBe(HTTP_ALLOWED_HOST_REPO);
    expect(clonedUrl()).not.toContain(SERVER_TOKEN);

    const warn = calls.find(
      c =>
        c.level === 'warn' &&
        c.message === 'Withholding the server git credential from this clone'
    );
    expect(warn).toBeDefined();
    const reason = warn!.data!.reason as string;
    expect(reason).toContain('scheme');
    expect(reason).toContain('https://');
    expect(reason).not.toContain('its host is not on');
    // The remedy is the caller's, not the operator's or the header's.
    expect(warn!.data!.consequence).toContain('https://');
    expect(warn!.data!.consequence).not.toContain('X-Dot-AI-Git-Token');
  });

  test('a host refusal keeps saying host, on both the clone and the pull path', async () => {
    // The wording of this branch is quoted in the docs, so it is pinned here
    // rather than left to drift when the scheme branch was added beside it.
    mockGetRemotes.mockResolvedValue([
      { name: 'origin', refs: { fetch: FOREIGN_REPO } },
    ]);
    await loadUserPrompts(makeCapturingLogger().logger, false, {
      repoUrl: FOREIGN_REPO,
    });
    const refresh = makeCapturingLogger();
    await loadUserPrompts(refresh.logger, true, { repoUrl: FOREIGN_REPO });

    const warn = refresh.calls.find(
      c =>
        c.level === 'warn' &&
        c.message === 'Withholding the server git credential from this pull'
    );
    expect(warn!.data!.reason).toBe(
      'the repository URL came from the request and its host is not on the "gitops.allowedRepoHosts" allowlist'
    );
    expect(warn!.data!.consequence).toBe(
      'pulling unauthenticated; a private repository keeps serving the cached copy instead of refreshing, unless the request supplies its own credential in the X-Dot-AI-Git-Token header'
    );
  });

  test('a failed clone over http blames the scheme and offers the https fix', async () => {
    mockClone.mockReset();
    mockClone.mockRejectedValue(
      new Error(
        "fatal: repository 'http://github.com/acme/private.git/' not found"
      )
    );

    const { logger } = makeCapturingLogger();
    const error = await loadUserPrompts(logger, false, {
      repoUrl: HTTP_ALLOWED_HOST_REPO,
    }).catch(e => e);

    expect(error).toBeInstanceOf(UserPromptsOverrideError);
    expect(error.message).toContain('"http://" cannot carry it');
    expect(error.message).toContain('https://');
    // The two host remedies are absent: neither fixes a scheme refusal, and the
    // header one would put the caller's own token on a cleartext request.
    expect(error.message).not.toContain(
      'is not on the "gitops.allowedRepoHosts" allowlist'
    );
    expect(error.message).not.toContain('add the host');
    expect(error.message).not.toContain('X-Dot-AI-Git-Token');
    expect(error.message).not.toContain(SERVER_TOKEN);
  });

  test('the scheme explanation echoes only the scheme, never a credential', async () => {
    const secret = 'tok_in_the_http_override_url';
    mockClone.mockReset();
    mockClone.mockRejectedValue(new Error('fatal: repository not found'));

    const { logger, calls } = makeCapturingLogger();
    const error = await loadUserPrompts(logger, false, {
      repoUrl: `http://x-access-token:${secret}@github.com/acme/private.git`,
    }).catch(e => e);

    expect(error.message).toContain('"http://" cannot carry it');
    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(calls)).not.toContain(secret);
  });

  test('a clone failure on an ALLOWED host says nothing about withholding', async () => {
    mockClone.mockReset();
    mockClone.mockRejectedValue(new Error('fatal: repository not found'));

    const { logger } = makeCapturingLogger();
    const error = await loadUserPrompts(logger, false, {
      repoUrl: ALLOWED_REPO,
    }).catch(e => e);

    expect(error).toBeInstanceOf(UserPromptsOverrideError);
    expect(error.message).not.toContain('X-Dot-AI-Git-Token');
  });
});
