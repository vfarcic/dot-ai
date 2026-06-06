/**
 * Unit Tests: computePromptsSource (PRD #581)
 *
 * The `source` field in /api/v1/prompts responses is the CLI tagging key per
 * the PRD wire contract. The CLI writes this string verbatim into the
 * `source:` frontmatter of every skill file it generates, and uses it to wipe
 * only its own slice on subsequent invocations. The contract must therefore
 * be:
 *
 *   - override supplied              → override.repoUrl
 *   - no override, env-var configured → DOT_AI_USER_PROMPTS_REPO
 *   - no override, no env-var         → "built-in"
 *
 * These tests cover the pure function so the REST and MCP layers can share
 * a stable implementation without each duplicating the env-var lookup.
 */

import { describe, test, expect, beforeEach, afterAll } from 'vitest';
import { computePromptsSource } from '../../../src/core/user-prompts-loader';

describe('computePromptsSource (PRD #581)', () => {
  const savedRepo = process.env.DOT_AI_USER_PROMPTS_REPO;

  beforeEach(() => {
    delete process.env.DOT_AI_USER_PROMPTS_REPO;
  });

  afterAll(() => {
    if (savedRepo !== undefined)
      process.env.DOT_AI_USER_PROMPTS_REPO = savedRepo;
  });

  test('returns "built-in" when no override and no env-var repo is configured', () => {
    expect(computePromptsSource(undefined)).toBe('built-in');
  });

  test('returns env-var URL when no override but DOT_AI_USER_PROMPTS_REPO is set', () => {
    process.env.DOT_AI_USER_PROMPTS_REPO =
      'https://github.com/org/env-repo.git';
    expect(computePromptsSource(undefined)).toBe(
      'https://github.com/org/env-repo.git'
    );
  });

  test('returns override URL verbatim when override is supplied (regardless of env-var)', () => {
    process.env.DOT_AI_USER_PROMPTS_REPO =
      'https://github.com/org/env-repo.git';
    expect(
      computePromptsSource({
        repoUrl: 'https://github.com/orgA/skills',
      })
    ).toBe('https://github.com/orgA/skills');
  });

  test('returns override URL even when env-var is unset', () => {
    expect(
      computePromptsSource({
        repoUrl: 'https://github.com/orgB/skills',
      })
    ).toBe('https://github.com/orgB/skills');
  });

  // F1: source must NOT echo credentials embedded in the URL. The CLI writes
  // this value into skill frontmatter on disk; an unscrubbed value would
  // persist a token there.
  test('scrubs credentials from override URL before returning', () => {
    const result = computePromptsSource({
      repoUrl: 'https://user:s3cret-tok@github.com/orgA/skills',
    });
    expect(result).not.toContain('s3cret-tok');
    expect(result).toMatch(/^https:\/\/\*{3}:\*{3}@github\.com\/orgA\/skills/);
  });

  test('scrubs credentials from env-var URL before returning', () => {
    process.env.DOT_AI_USER_PROMPTS_REPO =
      'https://x-access-token:env-tok@github.com/org/env-repo.git';
    const result = computePromptsSource(undefined);
    expect(result).not.toContain('env-tok');
    expect(result).toContain('***@github.com/org/env-repo.git');
  });

  // Stability: the CLI relies on a stable source value to identify "skills it
  // wrote". scrubSourceUrl is deterministic, so two identical
  // credential-bearing inputs must produce the same scrubbed output.
  test('source value is stable across calls for the same credential-bearing input', () => {
    const input = { repoUrl: 'https://user:s3cret-tok@github.com/orgA/skills' };
    expect(computePromptsSource(input)).toBe(computePromptsSource(input));
  });

  // CodeRabbit Major A: query-string secrets must be redacted in `source`,
  // not just userinfo. The CLI writes this value into on-disk skill frontmatter
  // verbatim, so an unscrubbed ?access_token=... persists across invocations.
  describe('query-string credential redaction (CodeRabbit Major A)', () => {
    test('redacts ?access_token= value', () => {
      const result = computePromptsSource({
        repoUrl: 'https://github.com/foo/bar?access_token=ghp_supersecret123',
      });
      expect(result).not.toContain('ghp_supersecret123');
      expect(result).toContain('access_token=***');
    });

    test('redacts ?token= value and preserves non-credential params', () => {
      const result = computePromptsSource({
        repoUrl: 'https://github.com/foo/bar?token=abc&page=2',
      });
      expect(result).not.toContain('abc');
      expect(result).toContain('token=***');
      expect(result).toContain('page=2');
    });

    test.each(['Token', 'TOKEN', 'ApiKey', 'API_KEY', 'private_token'])(
      'is case-insensitive: %s value is redacted',
      paramName => {
        const result = computePromptsSource({
          repoUrl: `https://github.com/foo/bar?${paramName}=raw-secret-xyz`,
        });
        expect(result).not.toContain('raw-secret-xyz');
        expect(result).toContain(`${paramName}=***`);
      }
    );

    test.each(['secret', 'password', 'auth', 'credential'])(
      'redacts ?%s= value',
      paramName => {
        const result = computePromptsSource({
          repoUrl: `https://github.com/foo/bar?${paramName}=raw-value-zzz`,
        });
        expect(result).not.toContain('raw-value-zzz');
        expect(result).toContain(`${paramName}=***`);
      }
    );

    test('scrubs BOTH userinfo and query params when present together', () => {
      const result = computePromptsSource({
        repoUrl: 'https://user:pwd@host.example.test/repo?secret=x',
      });
      // userinfo scrub from sanitizeUrlForLogging.
      expect(result).not.toContain('pwd');
      expect(result).toContain('***:***@host.example.test');
      // query-param scrub from the new helper.
      expect(result).not.toContain('secret=x');
      expect(result).toContain('secret=***');
    });

    test('does not touch non-credential query params', () => {
      const result = computePromptsSource({
        repoUrl: 'https://github.com/foo/bar?page=2&sort=asc&ref=v1.0',
      });
      expect(result).toContain('page=2');
      expect(result).toContain('sort=asc');
      expect(result).toContain('ref=v1.0');
    });

    test('query-scrub is stable: same input twice → same output', () => {
      const input = {
        repoUrl: 'https://github.com/a/b?access_token=tok&page=2',
      };
      expect(computePromptsSource(input)).toBe(computePromptsSource(input));
    });

    test('scrubs query-string credentials in env-var path too', () => {
      process.env.DOT_AI_USER_PROMPTS_REPO =
        'https://github.com/org/env-repo.git?api_key=env_secret_42';
      const result = computePromptsSource(undefined);
      expect(result).not.toContain('env_secret_42');
      expect(result).toContain('api_key=***');
    });
  });
});
