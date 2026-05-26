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
  // wrote". sanitizeUrlForLogging is deterministic, so two identical
  // credential-bearing inputs must produce the same scrubbed output.
  test('source value is stable across calls for the same credential-bearing input', () => {
    const input = { repoUrl: 'https://user:s3cret-tok@github.com/orgA/skills' };
    expect(computePromptsSource(input)).toBe(computePromptsSource(input));
  });
});
