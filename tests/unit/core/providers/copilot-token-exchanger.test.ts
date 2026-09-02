/**
 * Unit tests for CopilotCredentialResolver (copilot-token-exchanger.ts)
 *
 * Covers token resolution priority, supported/unsupported prefix filtering,
 * env chain fallback, and error when no token is available.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  COPILOT_TOKEN_ENV_VARS,
  findSupportedCopilotTokenInEnv,
  makeCopilotCredentialResolver,
} from '../../../../src/core/providers/copilot-token-exchanger';

const VALID_GHO = 'gho_validtoken123';
const FINE_GRAINED_PAT = 'github_pat_validtoken123';
const VALID_GHU = 'ghu_validtoken123';
const CLASSIC_PAT = 'ghp_invalidClassicPat';

// Snapshot the ambient chain once, so tests are isolated from the developer's
// real credentials without destroying them for the rest of the worker.
const ORIGINAL_TOKEN_ENV = Object.fromEntries(
  COPILOT_TOKEN_ENV_VARS.map(key => [key, process.env[key]])
);

// Clear BEFORE each test, not only after: clearing only in afterEach made this
// file pass by accident, since the first afterEach wiped the ambient vars for
// the rest of the worker. Any single test run in isolation (`vitest -t ...`)
// with an ambient gho_ token then failed. (#759)
beforeEach(() => {
  for (const key of COPILOT_TOKEN_ENV_VARS) delete process.env[key];
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of COPILOT_TOKEN_ENV_VARS) {
    const original = ORIGINAL_TOKEN_ENV[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe('makeCopilotCredentialResolver', () => {
  it('returns overrideToken immediately when it is a supported prefix', () => {
    const resolver = makeCopilotCredentialResolver(VALID_GHO);
    expect(resolver.resolve()).toBe(VALID_GHO);
  });

  it('falls through to env chain when overrideToken has unsupported prefix', () => {
    process.env.GITHUB_COPILOT_TOKEN = FINE_GRAINED_PAT;
    process.env.GH_TOKEN = VALID_GHU;
    const resolver = makeCopilotCredentialResolver(CLASSIC_PAT);
    expect(resolver.resolve()).toBe(VALID_GHU);
  });

  it('resolves GITHUB_COPILOT_TOKEN first in env chain', () => {
    process.env.GITHUB_COPILOT_TOKEN = VALID_GHO;
    process.env.GH_TOKEN = VALID_GHU;
    const resolver = makeCopilotCredentialResolver();
    expect(resolver.resolve()).toBe(VALID_GHO);
  });

  it('falls back to GH_TOKEN when GITHUB_COPILOT_TOKEN is absent', () => {
    process.env.GH_TOKEN = VALID_GHU;
    const resolver = makeCopilotCredentialResolver();
    expect(resolver.resolve()).toBe(VALID_GHU);
  });

  it('falls back to GITHUB_TOKEN when GH_TOKEN is absent', () => {
    process.env.GITHUB_TOKEN = VALID_GHU;
    const resolver = makeCopilotCredentialResolver();
    expect(resolver.resolve()).toBe(VALID_GHU);
  });

  it('skips env vars with unsupported PAT prefixes', () => {
    process.env.GITHUB_COPILOT_TOKEN = CLASSIC_PAT; // should be skipped
    process.env.GH_TOKEN = FINE_GRAINED_PAT; // should be skipped
    process.env.GITHUB_TOKEN = VALID_GHU; // should be used
    const resolver = makeCopilotCredentialResolver();
    expect(resolver.resolve()).toBe(VALID_GHU);
  });

  it('throws a PAT-specific message when only personal access tokens are configured', () => {
    process.env.GITHUB_COPILOT_TOKEN = FINE_GRAINED_PAT;
    process.env.GH_TOKEN = CLASSIC_PAT;
    const resolver = makeCopilotCredentialResolver();
    expect(() => resolver.resolve()).toThrow(
      /Personal access tokens \(github_pat_\* and ghp_\*\) are not supported/
    );
  });

  it('throws when no supported token is found and env chain is empty', () => {
    // No env vars, no override — ghp_ is unsupported prefix so treated as absent
    const resolver = makeCopilotCredentialResolver('ghp_invalid');
    expect(() => resolver.resolve()).toThrow(/No supported GitHub token/);
  });

  it('accepts ghu_* tokens via override', () => {
    const resolver = makeCopilotCredentialResolver(VALID_GHU);
    expect(resolver.resolve()).toBe(VALID_GHU);
  });
});

describe('findSupportedCopilotTokenInEnv', () => {
  it('returns undefined when the chain is empty', () => {
    expect(findSupportedCopilotTokenInEnv()).toBeUndefined();
  });

  it('returns undefined when the chain holds only unsupported PATs', () => {
    process.env.GITHUB_COPILOT_TOKEN = CLASSIC_PAT;
    process.env.GH_TOKEN = FINE_GRAINED_PAT;
    expect(findSupportedCopilotTokenInEnv()).toBeUndefined();
  });

  it('honours chain priority when several slots hold supported tokens', () => {
    process.env.GITHUB_COPILOT_TOKEN = VALID_GHO;
    process.env.GH_TOKEN = VALID_GHU;
    expect(findSupportedCopilotTokenInEnv()).toBe(VALID_GHO);
  });

  // The bug behind #759 item A: a first-*set*-wins gate reported "no usable
  // token" whenever an unsupported token sat in an earlier slot, even though
  // resolve() would happily have used the good one further down the chain.
  it('is first-supported-wins: an unsupported earlier slot does not mask a later good one', () => {
    process.env.GITHUB_COPILOT_TOKEN = CLASSIC_PAT;
    process.env.GH_TOKEN = VALID_GHU;
    expect(findSupportedCopilotTokenInEnv()).toBe(VALID_GHU);
  });

  it('agrees with resolve() for every chain shape, so a gate built on it cannot drift', () => {
    const shapes: Array<Record<string, string>> = [
      {},
      { GITHUB_COPILOT_TOKEN: VALID_GHO },
      { GH_TOKEN: VALID_GHU },
      { GITHUB_TOKEN: VALID_GHO },
      { GITHUB_COPILOT_TOKEN: CLASSIC_PAT },
      { GITHUB_COPILOT_TOKEN: FINE_GRAINED_PAT, GH_TOKEN: VALID_GHU },
      { GITHUB_COPILOT_TOKEN: CLASSIC_PAT, GITHUB_TOKEN: VALID_GHO },
      { GITHUB_COPILOT_TOKEN: VALID_GHO, GH_TOKEN: CLASSIC_PAT },
    ];

    for (const shape of shapes) {
      for (const key of COPILOT_TOKEN_ENV_VARS) delete process.env[key];
      Object.assign(process.env, shape);

      const found = findSupportedCopilotTokenInEnv();
      const resolver = makeCopilotCredentialResolver();

      if (found === undefined) {
        expect(() => resolver.resolve()).toThrow(/No supported GitHub token/);
      } else {
        expect(resolver.resolve()).toBe(found);
      }
    }
  });

  it('reads the env object it is given rather than only process.env', () => {
    expect(findSupportedCopilotTokenInEnv({ GH_TOKEN: VALID_GHU })).toBe(
      VALID_GHU
    );
  });
});
