/**
 * Unit Test: the mock-server's scrubCredentials really does mirror the real one.
 *
 * Its docblock claims the mirror, and the claim was load-bearing when the real
 * one gained a third pattern for a PAT used as the USERNAME (no colon) — a
 * working GitHub credential both earlier patterns left verbatim. A drifted copy
 * would let the mock-server echo one to a CLI test.
 */

import { describe, test, expect } from 'vitest';
import { scrubCredentials as real } from '../../../src/core/git-utils';
import { scrubCredentials as mock } from '../../../mock-server/prompts-override';

const INPUTS = [
  'https://ghp_PATSECRET@github.com/acme/demo.git',
  'https://x-access-token:ghs_secret@github.com/acme/demo.git',
  'https://user:s3cr3t@gitlab.corp/team/x.git',
  'https://user:pa:ss@host/r',
  'ssh://git@github.com/acme/demo.git',
  'ssh://gitlab-ci-token@gitlab.corp/x.git',
  'https://github.com:443/acme/demo.git',
  'https://github.com/acme/demo.git',
  'file:///tmp/unit/acme/demo.git',
  'git@github.com:acme/demo.git',
  'fatal: could not read https://github_pat_11ABCDE@github.com/a/b.git/info/refs',
  'no credentials here at all',
];

describe('mock-server scrubCredentials mirrors the real one', () => {
  test.each(INPUTS)('%s', input => {
    expect(mock(input)).toBe(real(input));
  });

  test('and both actually mask the no-colon PAT', () => {
    expect(mock('https://ghp_PATSECRET@github.com/acme/demo.git')).toBe(
      'https://***@github.com/acme/demo.git'
    );
  });
});
