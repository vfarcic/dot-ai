/**
 * Unit Tests: extractPromptsOverride (PRD #581 `repo`, PRD #621 M1 `path`/`branch`)
 *
 * extractPromptsOverride is the single place the REST prompts handlers turn a
 * request's `repo` / `path` / `branch` inputs into a UserPromptsOverride. The
 * three handlers (GET list, POST :name, POST /refresh) all delegate to it, so
 * pinning its behavior here covers the handler wiring without needing a live
 * cluster (the integration tests in tests/integration/tools/prompts.test.ts
 * exercise the end-to-end clone path).
 *
 * The contract this file pins:
 *   - PRD #581: `repo` threads into override.repoUrl; non-string / bad-scheme
 *     inputs are rejected with a credential-scrubbed 400.
 *   - PRD #621 M1: `path` → override.subPath, `branch` → override.branch, both
 *     optional and additive. Omitting them is byte-identical to PRD #581
 *     (override carries `repoUrl` only — the non-negotiable backward-compat
 *     guarantee). Invalid path/branch are rejected with a scrubbed 400 BEFORE
 *     any clone/cache mutation.
 */

import { describe, test, expect } from 'vitest';
import { extractPromptsOverride } from '../../../src/interfaces/rest-api';

const REPO = 'https://github.com/vfarcic/dot-ai-test-prompts.git';

describe('extractPromptsOverride', () => {
  describe('no override (no repo supplied)', () => {
    test('undefined repo → ok with undefined override', () => {
      const result = extractPromptsOverride(undefined);
      expect(result).toEqual({ ok: true, override: undefined });
    });

    test('null repo (searchParams.get miss) → ok with undefined override', () => {
      const result = extractPromptsOverride(null);
      expect(result).toEqual({ ok: true, override: undefined });
    });

    test('empty/whitespace repo → ok with undefined override', () => {
      expect(extractPromptsOverride('')).toEqual({
        ok: true,
        override: undefined,
      });
      expect(extractPromptsOverride('   ')).toEqual({
        ok: true,
        override: undefined,
      });
    });

    test('path/branch are ignored when no repo is supplied', () => {
      // path/branch only qualify an override; without a repo there is no
      // override, so they must not produce one (env-var path stays in charge).
      const result = extractPromptsOverride(null, 'skills', 'feature');
      expect(result).toEqual({ ok: true, override: undefined });
    });
  });

  describe('backward compatibility — repo only (PRD #581 parity)', () => {
    test('repo only → override carries repoUrl ONLY (no subPath, no branch)', () => {
      const result = extractPromptsOverride(REPO);
      // Byte-identical to PRD #581: exactly { repoUrl } and nothing else.
      expect(result).toEqual({ ok: true, override: { repoUrl: REPO } });
    });

    test('repo is trimmed', () => {
      const result = extractPromptsOverride(`  ${REPO}  `);
      expect(result).toEqual({ ok: true, override: { repoUrl: REPO } });
    });

    test('empty path/branch alongside repo do not add keys (still repoUrl only)', () => {
      // An explicit empty `?path=`/`?branch=` must be treated as absent so the
      // downstream defaults ('' / 'main') are preserved and an empty-string
      // branch never reaches isValidGitBranch.
      const result = extractPromptsOverride(REPO, '', '');
      expect(result).toEqual({ ok: true, override: { repoUrl: REPO } });
    });

    test('whitespace-only path/branch are treated as absent', () => {
      const result = extractPromptsOverride(REPO, '   ', '   ');
      expect(result).toEqual({ ok: true, override: { repoUrl: REPO } });
    });

    test('null path/branch (searchParams.get miss) → repoUrl only', () => {
      const result = extractPromptsOverride(REPO, null, null);
      expect(result).toEqual({ ok: true, override: { repoUrl: REPO } });
    });
  });

  describe('path threading (PRD #621 M1)', () => {
    test('path → override.subPath', () => {
      const result = extractPromptsOverride(REPO, 'skills');
      expect(result).toEqual({
        ok: true,
        override: { repoUrl: REPO, subPath: 'skills' },
      });
    });

    test('nested path is preserved', () => {
      const result = extractPromptsOverride(REPO, 'a/b/c');
      expect(result).toMatchObject({
        ok: true,
        override: { repoUrl: REPO, subPath: 'a/b/c' },
      });
    });

    test('path is trimmed', () => {
      const result = extractPromptsOverride(REPO, '  skills  ');
      expect(result).toMatchObject({
        ok: true,
        override: { repoUrl: REPO, subPath: 'skills' },
      });
    });
  });

  describe('branch threading (PRD #621 M1)', () => {
    test('branch → override.branch', () => {
      const result = extractPromptsOverride(REPO, undefined, 'my-feature');
      expect(result).toEqual({
        ok: true,
        override: { repoUrl: REPO, branch: 'my-feature' },
      });
    });

    test('branch with slashes/dots is preserved', () => {
      const result = extractPromptsOverride(
        REPO,
        undefined,
        'release/v1.2.3'
      );
      expect(result).toMatchObject({
        ok: true,
        override: { repoUrl: REPO, branch: 'release/v1.2.3' },
      });
    });

    test('branch is trimmed', () => {
      const result = extractPromptsOverride(REPO, undefined, '  main  ');
      expect(result).toMatchObject({
        ok: true,
        override: { repoUrl: REPO, branch: 'main' },
      });
    });
  });

  describe('path + branch together', () => {
    test('both thread into the override', () => {
      const result = extractPromptsOverride(REPO, 'prd621-skills', 'fixture');
      expect(result).toEqual({
        ok: true,
        override: {
          repoUrl: REPO,
          subPath: 'prd621-skills',
          branch: 'fixture',
        },
      });
    });
  });

  describe('type validation (avoid 500 on malformed body)', () => {
    test('non-string repo (array) → 400', () => {
      const result = extractPromptsOverride(['a', 'b']);
      expect(result).toEqual({
        ok: false,
        message: 'repo must be a string (got array)',
      });
    });

    test('non-string repo (number) → 400', () => {
      const result = extractPromptsOverride(42);
      expect(result).toEqual({
        ok: false,
        message: 'repo must be a string (got number)',
      });
    });

    test('non-string path (array) → 400', () => {
      const result = extractPromptsOverride(REPO, ['skills', 'other']);
      expect(result).toEqual({
        ok: false,
        message: 'path must be a string (got array)',
      });
    });

    test('non-string path (number) → 400', () => {
      const result = extractPromptsOverride(REPO, 7);
      expect(result).toEqual({
        ok: false,
        message: 'path must be a string (got number)',
      });
    });

    test('non-string branch (array) → 400', () => {
      const result = extractPromptsOverride(REPO, undefined, ['a', 'b']);
      expect(result).toEqual({
        ok: false,
        message: 'branch must be a string (got array)',
      });
    });

    test('non-string branch (object) → 400', () => {
      const result = extractPromptsOverride(REPO, undefined, { x: 1 });
      expect(result).toEqual({
        ok: false,
        message: 'branch must be a string (got object)',
      });
    });
  });

  describe('downstream validation (rejected before any clone)', () => {
    test('bad repo scheme → 400 mentioning scheme', () => {
      const result = extractPromptsOverride(
        'ssh://git@github.com/example/repo.git'
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('scheme');
      }
    });

    test('path traversal → 400 mentioning subPath', () => {
      const result = extractPromptsOverride(REPO, '../../etc/passwd');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('subPath');
      }
    });

    test('invalid branch name → 400 mentioning branch', () => {
      const result = extractPromptsOverride(
        REPO,
        undefined,
        'bad branch name!!'
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('branch');
      }
    });
  });

  describe('credential header threading (PRD #621 M2)', () => {
    test('gitToken → override.gitToken when a repo override is present', () => {
      const result = extractPromptsOverride(REPO, undefined, undefined, 'tok123');
      expect(result).toEqual({
        ok: true,
        override: { repoUrl: REPO, gitToken: 'tok123' },
      });
    });

    test('gitToken threads alongside path and branch', () => {
      const result = extractPromptsOverride(REPO, 'skills', 'feat', 'tok123');
      expect(result).toEqual({
        ok: true,
        override: {
          repoUrl: REPO,
          subPath: 'skills',
          branch: 'feat',
          gitToken: 'tok123',
        },
      });
    });

    test('absent gitToken → no gitToken key (repoUrl only)', () => {
      const result = extractPromptsOverride(REPO, undefined, undefined, undefined);
      expect(result).toEqual({ ok: true, override: { repoUrl: REPO } });
    });

    // Header-inert-without-override (PRD #621 M2/M4, test F): a forwarded token
    // with NO ?repo= override must NOT create an override — the env-var path is
    // untouched and the token is dropped before it is ever read.
    test('gitToken with no repo (null) → override undefined (header is inert)', () => {
      const result = extractPromptsOverride(null, undefined, undefined, 'tok123');
      expect(result).toEqual({ ok: true, override: undefined });
    });

    test('gitToken with empty repo → override undefined (header is inert)', () => {
      const result = extractPromptsOverride('   ', undefined, undefined, 'tok123');
      expect(result).toEqual({ ok: true, override: undefined });
    });
  });

  describe('ingested source selection (PRD #647 D1)', () => {
    test('source param → ingested override (precedence over repo, no clone params)', () => {
      const result = extractPromptsOverride(
        REPO,
        'skills',
        'feature',
        'tok123',
        'local:team-dev'
      );
      // ?source= is the explicit ingested signal: it wins over ?repo= and the
      // clone-qualifying params do not apply.
      expect(result).toEqual({
        ok: true,
        override: { repoUrl: 'local:team-dev', ingestedSource: 'local:team-dev' },
      });
    });

    test('source param is trimmed', () => {
      const result = extractPromptsOverride(
        null,
        undefined,
        undefined,
        undefined,
        '  local:team-dev  '
      );
      expect(result).toEqual({
        ok: true,
        override: { repoUrl: 'local:team-dev', ingestedSource: 'local:team-dev' },
      });
    });

    test('a git-URL identifier is accepted verbatim as an ingested source', () => {
      const url = 'https://gitlab.corp.internal/team/skills';
      const result = extractPromptsOverride(
        null,
        undefined,
        undefined,
        undefined,
        url
      );
      expect(result).toEqual({
        ok: true,
        override: { repoUrl: url, ingestedSource: url },
      });
    });

    test('empty/whitespace source falls through to the repo/clone path', () => {
      // No source signal → behaves exactly as before (repoUrl only).
      expect(
        extractPromptsOverride(REPO, undefined, undefined, undefined, '')
      ).toEqual({ ok: true, override: { repoUrl: REPO } });
      expect(
        extractPromptsOverride(REPO, undefined, undefined, undefined, '   ')
      ).toEqual({ ok: true, override: { repoUrl: REPO } });
      // null (searchParams.get miss) likewise falls through.
      expect(
        extractPromptsOverride(REPO, undefined, undefined, undefined, null)
      ).toEqual({ ok: true, override: { repoUrl: REPO } });
    });
  });

  describe('credential scrubbing on validation failure (HARD CONSTRAINT 3)', () => {
    const secret = 'unit_secret_token_xyz';

    test('bad scheme with embedded credential → secret not echoed', () => {
      const result = extractPromptsOverride(
        `ssh://user:${secret}@github.com/example/repo.git`
      );
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(secret);
    });

    test('invalid path with credential in repoUrl → secret not echoed', () => {
      const credUrl = `https://user:${secret}@github.com/vfarcic/dot-ai-test-prompts.git`;
      const result = extractPromptsOverride(credUrl, '../../etc/passwd');
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(secret);
    });

    test('invalid branch with credential in repoUrl → secret not echoed', () => {
      const credUrl = `https://user:${secret}@github.com/vfarcic/dot-ai-test-prompts.git`;
      const result = extractPromptsOverride(
        credUrl,
        undefined,
        'bad branch name!!'
      );
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(secret);
    });
  });
});
