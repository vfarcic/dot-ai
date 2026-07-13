/**
 * Unit Tests: User Prompts Loader (Override)
 *
 * Exercises the per-request override added in PRD #581 milestone 1 plus the
 * validation/scrubbing follow-ups. Verifies:
 *   - Omitted/undefined `override` arg keeps existing behavior (and the second
 *     call serves from cache, proving the param doesn't perturb caching)
 *   - A supplied override fetches from the override repo and ignores
 *     `DOT_AI_USER_PROMPTS_REPO`
 *   - Cache is invalidated when any of (repoUrl, branch, subPath) changes
 *   - Consecutive calls with the same override repoUrl serve from cache
 *   - Override input validation rejects bad scheme / traversal / branch by
 *     THROWING UserPromptsOverrideError (issue #575 — an explicit per-request
 *     override must surface its failure, not silently fall back to built-in)
 *   - A failing override clone throws UserPromptsOverrideError without corrupting
 *     the env-var cache state, and a subsequent no-override call recovers
 *   - Credentials in an override URL are scrubbed from all log output AND from
 *     the thrown error message, including errors propagated through the outer catch
 *
 * Network IO is mocked at the `cloneRepo`/`pullRepo` boundary so tests remain
 * deterministic. The loader logic, cache invalidation, scrubCredentials, and
 * sanitizeUrlForLogging all still run end-to-end.
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

vi.mock('../../../src/core/git-utils.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/core/git-utils.js')
  >('../../../src/core/git-utils.js');
  return {
    ...actual,
    cloneRepo: vi.fn(),
    pullRepo: vi.fn(),
  };
});

// fs is real for every test EXCEPT when fsMockState.failIsolatedRmSync is set,
// in which case rmSync on the per-request isolated dir throws — letting us
// exercise the cleanup-failure-warns path (MEDIUM-2). vitest can't spy on a
// built-in module's ESM named export, so we mock the module and delegate.
const fsMockState = vi.hoisted(() => ({ failIsolatedRmSync: false }));
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: actual,
    rmSync: (p: import('fs').PathLike, opts?: import('fs').RmOptions) => {
      if (
        fsMockState.failIsolatedRmSync &&
        String(p).includes('user-prompts-override-')
      ) {
        throw new Error('simulated rmSync failure');
      }
      return actual.rmSync(p, opts);
    },
  };
});

import { cloneRepo } from '../../../src/core/git-utils.js';
import {
  loadUserPrompts,
  clearUserPromptsCache,
  getUserPromptsCacheState,
  getUserPromptsConfigFromOverride,
  getCacheDirectory,
  UserPromptsOverrideError,
} from '../../../src/core/user-prompts-loader.js';
import type { Logger } from '../../../src/core/error-handling.js';

const ENV_REPO = 'https://github.com/example-org/env-repo.git';
const OVERRIDE_REPO = 'https://github.com/example-org/override-repo.git';

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

// Mock that produces a tiny but valid prompts directory at targetDir, so the
// loader's scan + parse pipeline runs to completion.
function makeSuccessfulClone() {
  return vi.fn(async (_url: string, targetDir: string) => {
    fs.mkdirSync(targetDir, { recursive: true });
    const promptBody = [
      '---',
      'name: prd-581-test',
      'description: Test prompt for PRD 581 loader override',
      '---',
      '',
      'Body content for the test prompt.',
    ].join('\n');
    fs.writeFileSync(path.join(targetDir, 'prd-581-test.md'), promptBody);
    return { localPath: targetDir, branch: 'main' };
  });
}

function makeFailingClone(message: string) {
  return vi.fn(async () => {
    throw new Error(message);
  });
}

describe('User Prompts Loader Override', () => {
  const savedEnv = {
    repo: process.env.DOT_AI_USER_PROMPTS_REPO,
    repoPath: process.env.DOT_AI_USER_PROMPTS_PATH,
    branch: process.env.DOT_AI_USER_PROMPTS_BRANCH,
    ttl: process.env.DOT_AI_USER_PROMPTS_CACHE_TTL,
    token: process.env.DOT_AI_GIT_TOKEN,
  };

  beforeAll(() => {
    // One-time guard: confirm the git-utils mock applied — if it didn't, every
    // test would silently hit real network. Cheap, prevents confusing failures.
    expect(vi.isMockFunction(cloneRepo)).toBe(true);
  });

  beforeEach(() => {
    clearUserPromptsCache();
    delete process.env.DOT_AI_USER_PROMPTS_REPO;
    delete process.env.DOT_AI_USER_PROMPTS_PATH;
    delete process.env.DOT_AI_USER_PROMPTS_BRANCH;
    delete process.env.DOT_AI_USER_PROMPTS_CACHE_TTL;
    delete process.env.DOT_AI_GIT_TOKEN;
    vi.mocked(cloneRepo).mockReset();
    vi.mocked(cloneRepo).mockImplementation(makeSuccessfulClone());
  });

  afterAll(() => {
    clearUserPromptsCache();
    if (savedEnv.repo !== undefined)
      process.env.DOT_AI_USER_PROMPTS_REPO = savedEnv.repo;
    if (savedEnv.repoPath !== undefined)
      process.env.DOT_AI_USER_PROMPTS_PATH = savedEnv.repoPath;
    if (savedEnv.branch !== undefined)
      process.env.DOT_AI_USER_PROMPTS_BRANCH = savedEnv.branch;
    if (savedEnv.ttl !== undefined)
      process.env.DOT_AI_USER_PROMPTS_CACHE_TTL = savedEnv.ttl;
    if (savedEnv.token !== undefined)
      process.env.DOT_AI_GIT_TOKEN = savedEnv.token;
  });

  describe('Behavior parity (no override vs undefined override)', () => {
    test('undefined override is byte-identical to no override and second call serves from cache', async () => {
      process.env.DOT_AI_USER_PROMPTS_REPO = ENV_REPO;

      const a = makeCapturingLogger();
      const promptsA = await loadUserPrompts(a.logger);

      const b = makeCapturingLogger();
      const promptsB = await loadUserPrompts(b.logger, false, undefined);

      expect(promptsA).toEqual(promptsB);
      // The second call must NOT have re-cloned.
      expect(cloneRepo).toHaveBeenCalledTimes(1);
      expect(vi.mocked(cloneRepo).mock.calls[0][0]).toBe(ENV_REPO);
      // The second logger should have observed the cache-hit debug line, not
      // a clone line — proving the cache path was taken.
      expect(
        b.calls.some(c => c.message === 'Using cached user prompts repository')
      ).toBe(true);
      expect(
        b.calls.some(c => c.message === 'Cloning user prompts repository')
      ).toBe(false);
    });
  });

  describe('Override behavior', () => {
    test('override fetches from override repo and ignores DOT_AI_USER_PROMPTS_REPO', async () => {
      process.env.DOT_AI_USER_PROMPTS_REPO = ENV_REPO;

      const { logger } = makeCapturingLogger();
      const prompts = await loadUserPrompts(logger, false, {
        repoUrl: OVERRIDE_REPO,
      });

      expect(cloneRepo).toHaveBeenCalledTimes(1);
      expect(vi.mocked(cloneRepo).mock.calls[0][0]).toBe(OVERRIDE_REPO);
      expect(getUserPromptsCacheState()).toMatchObject({
        repoUrl: OVERRIDE_REPO,
        branch: 'main',
        subPath: '',
      });
      expect(prompts).toMatchObject([
        {
          name: 'prd-581-test',
          description: 'Test prompt for PRD 581 loader override',
        },
      ]);
    });

    test('two consecutive calls with the same override repo serve the second from cache', async () => {
      await loadUserPrompts(makeCapturingLogger().logger, false, {
        repoUrl: OVERRIDE_REPO,
      });
      const second = makeCapturingLogger();
      const result = await loadUserPrompts(second.logger, false, {
        repoUrl: OVERRIDE_REPO,
      });

      expect(cloneRepo).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject([{ name: 'prd-581-test' }]);
      expect(
        second.calls.some(
          c => c.message === 'Using cached user prompts repository'
        )
      ).toBe(true);
      expect(
        second.calls.some(c => c.message === 'Cloning user prompts repository')
      ).toBe(false);
    });

    test('different branch on the same repoUrl forces a fresh clone', async () => {
      await loadUserPrompts(makeCapturingLogger().logger, false, {
        repoUrl: OVERRIDE_REPO,
        branch: 'main',
      });
      expect(cloneRepo).toHaveBeenCalledTimes(1);

      const second = makeCapturingLogger();
      await loadUserPrompts(second.logger, false, {
        repoUrl: OVERRIDE_REPO,
        branch: 'release-1.0',
      });

      expect(cloneRepo).toHaveBeenCalledTimes(2);
      expect(vi.mocked(cloneRepo).mock.calls[1][2]).toMatchObject({
        branch: 'release-1.0',
      });
      expect(getUserPromptsCacheState()).toMatchObject({
        repoUrl: OVERRIDE_REPO,
        branch: 'release-1.0',
      });
    });
  });

  describe('Override input validation', () => {
    test.each([
      'file:///etc/passwd',
      'ssh://git@github.com/example/repo.git',
      'git://github.com/example/repo.git',
    ])('rejects non-http(s) scheme %s', async credUrl => {
      // issue #575: a malformed PER-REQUEST override must surface as an error,
      // not silently fall back to built-in prompts (which `toEqual([])` was).
      const { logger, calls } = makeCapturingLogger();
      await expect(
        loadUserPrompts(logger, false, { repoUrl: credUrl })
      ).rejects.toBeInstanceOf(UserPromptsOverrideError);

      expect(cloneRepo).not.toHaveBeenCalled();
      expect(calls.some(c => c.level === 'error')).toBe(true);
    });

    test('rejects unparseable repoUrl', async () => {
      await expect(
        loadUserPrompts(makeCapturingLogger().logger, false, {
          repoUrl: 'not a url at all',
        })
      ).rejects.toBeInstanceOf(UserPromptsOverrideError);
      expect(cloneRepo).not.toHaveBeenCalled();
    });

    test.each(['../etc', 'a/../../escape', '/absolute/path'])(
      'rejects unsafe subPath %s',
      async subPath => {
        await expect(
          loadUserPrompts(makeCapturingLogger().logger, false, {
            repoUrl: OVERRIDE_REPO,
            subPath,
          })
        ).rejects.toBeInstanceOf(UserPromptsOverrideError);
        expect(cloneRepo).not.toHaveBeenCalled();
      }
    );

    test('rejects subPath containing a null byte', async () => {
      await expect(
        loadUserPrompts(makeCapturingLogger().logger, false, {
          repoUrl: OVERRIDE_REPO,
          subPath: 'safe/\0bad',
        })
      ).rejects.toBeInstanceOf(UserPromptsOverrideError);
      expect(cloneRepo).not.toHaveBeenCalled();
    });

    test.each(['feature; rm -rf /', 'foo$(whoami)', 'name with spaces'])(
      'rejects invalid branch %s',
      async branch => {
        await expect(
          loadUserPrompts(makeCapturingLogger().logger, false, {
            repoUrl: OVERRIDE_REPO,
            branch,
          })
        ).rejects.toBeInstanceOf(UserPromptsOverrideError);
        expect(cloneRepo).not.toHaveBeenCalled();
      }
    );
  });

  describe('Failure isolation', () => {
    test('malformed override does not corrupt env-var cache; next no-override call succeeds', async () => {
      process.env.DOT_AI_USER_PROMPTS_REPO = ENV_REPO;

      // 1. Populate cache from env-var.
      const initialLogger = makeCapturingLogger();
      const initial = await loadUserPrompts(initialLogger.logger);
      expect(initial.length).toBeGreaterThan(0);
      expect(getUserPromptsCacheState()).toMatchObject({ repoUrl: ENV_REPO });

      // 2. Override with a URL that's structurally valid but unreachable; the
      //    cloneRepo mock simulates the failure.
      vi.mocked(cloneRepo).mockReset();
      vi.mocked(cloneRepo).mockImplementation(
        makeFailingClone('fatal: repository not found')
      );
      const malformedLogger = makeCapturingLogger();
      // issue #575: the failed override now surfaces as an error instead of
      // returning [] — but it must still NOT corrupt the env-var cache.
      await expect(
        loadUserPrompts(malformedLogger.logger, false, {
          repoUrl: 'https://invalid.example.test/missing.git',
        })
      ).rejects.toBeInstanceOf(UserPromptsOverrideError);
      // In-memory cacheState still tracks the env-var repo URL.
      expect(getUserPromptsCacheState()).toMatchObject({ repoUrl: ENV_REPO });

      // 3. Subsequent no-override call recovers — disk was wiped, so the
      //    loader re-clones the env-var repo.
      vi.mocked(cloneRepo).mockReset();
      vi.mocked(cloneRepo).mockImplementation(makeSuccessfulClone());
      const restoredLogger = makeCapturingLogger();
      const restored = await loadUserPrompts(restoredLogger.logger);
      expect(restored).toEqual(initial);
      expect(getUserPromptsCacheState()).toMatchObject({ repoUrl: ENV_REPO });
      expect(vi.mocked(cloneRepo).mock.calls[0][0]).toBe(ENV_REPO);
    });
  });

  describe('Credential scrubbing', () => {
    test('credentials in override repoUrl are scrubbed from log output', async () => {
      const secret = 'sup3r-secret-token-xyz';
      const credUrl = `https://user:${secret}@github.com/example-org/private.git`;

      vi.mocked(cloneRepo).mockReset();
      vi.mocked(cloneRepo).mockImplementation(
        makeFailingClone(`fatal: could not access ${credUrl}`)
      );

      const { logger, calls } = makeCapturingLogger();
      // issue #575: the override failure is surfaced; the credential must be
      // scrubbed from BOTH the log output and the thrown error message (which
      // the REST layer now returns to the client).
      const err = await loadUserPrompts(logger, false, {
        repoUrl: credUrl,
      }).catch(e => e);

      expect(err).toBeInstanceOf(UserPromptsOverrideError);
      expect(err.message).not.toContain(secret);
      const serialized = JSON.stringify(calls);
      expect(serialized).not.toContain(secret);
      expect(serialized).toContain('***@github.com/example-org/private.git');
    });

    test('token-bearing git errors are scrubbed in the outer override-failure log and thrown error', async () => {
      const secret = 'tok_outer_catch_secret_42';
      const tokenUrl = `https://x-access-token:${secret}@github.com/example-org/private.git`;

      vi.mocked(cloneRepo).mockReset();
      vi.mocked(cloneRepo).mockImplementation(
        makeFailingClone(`Cloning into 'foo'... fatal: ${tokenUrl} not found`)
      );

      const { logger, calls } = makeCapturingLogger();
      const err = await loadUserPrompts(logger, false, {
        repoUrl: 'https://github.com/example-org/private.git',
      }).catch(e => e);

      expect(err).toBeInstanceOf(UserPromptsOverrideError);
      expect(err.message).not.toContain(secret);
      // issue #575: the outer catch now logs the override-failure message before
      // throwing (the env-var-fallback message is reserved for the no-override path).
      const outerErrors = calls.filter(
        c =>
          c.level === 'error' &&
          c.message === 'Failed to load per-request prompts override'
      );
      expect(outerErrors.length).toBeGreaterThan(0);
      expect(JSON.stringify(outerErrors)).not.toContain(secret);
    });
  });

  // PRD #621 M2/M3: per-request credential header (override.gitToken) +
  // clone-auth precedence + cache isolation (Decisions 2 & 4).
  describe('Credential override (PRD #621 M2/M3)', () => {
    // --- A: precedence / per-call token to cloneRepo ---
    describe('token precedence (Decision 4)', () => {
      test('getUserPromptsConfigFromOverride: override.gitToken wins over env', () => {
        process.env.DOT_AI_GIT_TOKEN = 'env-token';
        const config = getUserPromptsConfigFromOverride({
          repoUrl: OVERRIDE_REPO,
          gitToken: 'override-token',
        });
        expect(config.gitToken).toBe('override-token');
      });

      test('getUserPromptsConfigFromOverride: env used when no override token', () => {
        process.env.DOT_AI_GIT_TOKEN = 'env-token';
        const config = getUserPromptsConfigFromOverride({
          repoUrl: OVERRIDE_REPO,
        });
        expect(config.gitToken).toBe('env-token');
      });

      test('the override token is the per-call token cloneRepo receives', async () => {
        process.env.DOT_AI_GIT_TOKEN = 'env-token';
        await loadUserPrompts(makeCapturingLogger().logger, false, {
          repoUrl: OVERRIDE_REPO,
          gitToken: 'override-token',
        });
        expect(cloneRepo).toHaveBeenCalledTimes(1);
        // 3rd arg to cloneRepo is CloneOptions { branch, depth, token }.
        expect(vi.mocked(cloneRepo).mock.calls[0][2]).toMatchObject({
          token: 'override-token',
        });
      });

      test('no override token → cloneRepo receives token undefined (env auth path)', async () => {
        process.env.DOT_AI_GIT_TOKEN = 'env-token';
        await loadUserPrompts(makeCapturingLogger().logger, false, {
          repoUrl: OVERRIDE_REPO,
        });
        expect(vi.mocked(cloneRepo).mock.calls[0][2]).toMatchObject({
          token: undefined,
        });
      });
    });

    // --- B: cache isolation (Decision 2) ---
    describe('cache isolation (Decision 2)', () => {
      test('a token-bearing request clones in isolation and does NOT populate the shared cache', async () => {
        const result = await loadUserPrompts(
          makeCapturingLogger().logger,
          false,
          { repoUrl: OVERRIDE_REPO, gitToken: 'secret-token' }
        );
        // The clone still produces prompts...
        expect(result).toMatchObject([{ name: 'prd-581-test' }]);
        // ...but the shared cacheState was never written (isolated path).
        expect(getUserPromptsCacheState()).toBeNull();
        // The clone target was a throwaway dir, NOT the shared cache directory.
        const targetDir = vi.mocked(cloneRepo).mock.calls[0][1];
        expect(targetDir).not.toBe(getCacheDirectory());
        expect(targetDir).toContain('user-prompts-override-');
      });

      test('a later no-token request for the same coordinate is NOT served the token-bearing clone', async () => {
        // 1. Token-bearing request (isolated, leaves shared cache untouched).
        await loadUserPrompts(makeCapturingLogger().logger, false, {
          repoUrl: OVERRIDE_REPO,
          gitToken: 'secret-token',
        });
        expect(cloneRepo).toHaveBeenCalledTimes(1);
        expect(getUserPromptsCacheState()).toBeNull();

        // 2. No-token request for the SAME coordinate must clone fresh into the
        //    shared slot (it cannot be served the private isolated clone).
        await loadUserPrompts(makeCapturingLogger().logger, false, {
          repoUrl: OVERRIDE_REPO,
        });
        expect(cloneRepo).toHaveBeenCalledTimes(2);
        expect(vi.mocked(cloneRepo).mock.calls[1][1]).toBe(getCacheDirectory());
        expect(vi.mocked(cloneRepo).mock.calls[1][2]).toMatchObject({
          token: undefined,
        });
        expect(getUserPromptsCacheState()).toMatchObject({
          repoUrl: OVERRIDE_REPO,
        });
      });

      test('the cache key excludes the token (only coordinate fields are tracked)', async () => {
        await loadUserPrompts(makeCapturingLogger().logger, false, {
          repoUrl: OVERRIDE_REPO,
        });
        const state = getUserPromptsCacheState();
        expect(state).not.toBeNull();
        expect(Object.keys(state!).sort()).toEqual([
          'branch',
          'lastPullTime',
          'localPath',
          'repoUrl',
          'subPath',
        ]);
      });
    });

    // --- D: log/error scrubbing ---
    describe('credential scrubbing', () => {
      test('a forwarded token is scrubbed from clone-error log output', async () => {
        const secret = 'forwarded_tok_secret_99';
        vi.mocked(cloneRepo).mockReset();
        vi.mocked(cloneRepo).mockImplementation(
          makeFailingClone(
            `fatal: authentication failed for https://x-access-token:${secret}@github.com/example-org/private.git`
          )
        );

        const { logger, calls } = makeCapturingLogger();
        // issue #575: a forwarded-token clone failure surfaces as an error; the
        // token must be scrubbed from the logs and the thrown error message.
        const err = await loadUserPrompts(logger, false, {
          repoUrl: OVERRIDE_REPO,
          gitToken: secret,
        }).catch(e => e);

        expect(err).toBeInstanceOf(UserPromptsOverrideError);
        expect(err.message).not.toContain(secret);
        expect(JSON.stringify(calls)).not.toContain(secret);
      });
    });

    // MEDIUM-2: a failed cleanup of the isolated clone must WARN (not swallow),
    // so an rmSync failure is observable rather than silent.
    describe('isolation cleanup (MEDIUM-2)', () => {
      test('cleanup failure is warned, not swallowed', async () => {
        fsMockState.failIsolatedRmSync = true;
        const { logger, calls } = makeCapturingLogger();
        try {
          const result = await loadUserPrompts(logger, false, {
            repoUrl: OVERRIDE_REPO,
            gitToken: 'tok-cleanup',
          });
          // The clone+read still succeeded; only the cleanup failed.
          expect(result).toMatchObject([{ name: 'prd-581-test' }]);
          const warned = calls.some(
            c =>
              c.level === 'warn' &&
              c.message === 'Failed to remove isolated clone directory'
          );
          expect(warned).toBe(true);
        } finally {
          const cloneTarget = vi.mocked(cloneRepo).mock.calls.at(0)?.[1] as
            | string
            | undefined;
          fsMockState.failIsolatedRmSync = false;
          // Remove the dir the simulated failure left behind (rmSync now real).
          if (cloneTarget) {
            try {
              fs.rmSync(path.dirname(cloneTarget), {
                recursive: true,
                force: true,
              });
            } catch {
              /* best-effort */
            }
          }
        }
      });
    });
  });
});
