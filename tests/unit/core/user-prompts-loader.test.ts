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
 *   - Override input validation rejects bad scheme / traversal / branch
 *   - A failing override clone returns empty without corrupting the env-var
 *     cache state, and a subsequent no-override call recovers
 *   - Credentials in an override URL are scrubbed from all log output, including
 *     errors propagated through the outer catch
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

import { cloneRepo } from '../../../src/core/git-utils.js';
import {
  loadUserPrompts,
  clearUserPromptsCache,
  getUserPromptsCacheState,
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
      const { logger, calls } = makeCapturingLogger();
      const result = await loadUserPrompts(logger, false, {
        repoUrl: credUrl,
      });

      expect(result).toEqual([]);
      expect(cloneRepo).not.toHaveBeenCalled();
      expect(calls.some(c => c.level === 'error')).toBe(true);
    });

    test('rejects unparseable repoUrl', async () => {
      const result = await loadUserPrompts(
        makeCapturingLogger().logger,
        false,
        {
          repoUrl: 'not a url at all',
        }
      );
      expect(result).toEqual([]);
      expect(cloneRepo).not.toHaveBeenCalled();
    });

    test.each(['../etc', 'a/../../escape', '/absolute/path'])(
      'rejects unsafe subPath %s',
      async subPath => {
        const result = await loadUserPrompts(
          makeCapturingLogger().logger,
          false,
          {
            repoUrl: OVERRIDE_REPO,
            subPath,
          }
        );
        expect(result).toEqual([]);
        expect(cloneRepo).not.toHaveBeenCalled();
      }
    );

    test('rejects subPath containing a null byte', async () => {
      const result = await loadUserPrompts(
        makeCapturingLogger().logger,
        false,
        {
          repoUrl: OVERRIDE_REPO,
          subPath: 'safe/\0bad',
        }
      );
      expect(result).toEqual([]);
      expect(cloneRepo).not.toHaveBeenCalled();
    });

    test.each(['feature; rm -rf /', 'foo$(whoami)', 'name with spaces'])(
      'rejects invalid branch %s',
      async branch => {
        const result = await loadUserPrompts(
          makeCapturingLogger().logger,
          false,
          {
            repoUrl: OVERRIDE_REPO,
            branch,
          }
        );
        expect(result).toEqual([]);
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
      const malformedResult = await loadUserPrompts(
        malformedLogger.logger,
        false,
        { repoUrl: 'https://invalid.example.test/missing.git' }
      );
      expect(malformedResult).toEqual([]);
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
      const result = await loadUserPrompts(logger, false, { repoUrl: credUrl });

      expect(result).toEqual([]);
      const serialized = JSON.stringify(calls);
      expect(serialized).not.toContain(secret);
      expect(serialized).toContain('***@github.com/example-org/private.git');
    });

    test('token-bearing git errors are scrubbed in the outer "Failed to load user prompts" log', async () => {
      const secret = 'tok_outer_catch_secret_42';
      const tokenUrl = `https://x-access-token:${secret}@github.com/example-org/private.git`;

      vi.mocked(cloneRepo).mockReset();
      vi.mocked(cloneRepo).mockImplementation(
        makeFailingClone(`Cloning into 'foo'... fatal: ${tokenUrl} not found`)
      );

      const { logger, calls } = makeCapturingLogger();
      const result = await loadUserPrompts(logger, false, {
        repoUrl: 'https://github.com/example-org/private.git',
      });

      expect(result).toEqual([]);
      const outerErrors = calls.filter(
        c =>
          c.level === 'error' &&
          c.message ===
            'Failed to load user prompts, falling back to built-in only'
      );
      expect(outerErrors.length).toBeGreaterThan(0);
      expect(JSON.stringify(outerErrors)).not.toContain(secret);
    });
  });
});
