/**
 * Unit tests for CopilotCredentialResolver (copilot-token-exchanger.ts)
 *
 * Covers token resolution priority, supported/unsupported prefix filtering,
 * env chain fallback, and error when no token is available.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeCopilotCredentialResolver } from '../../../../src/core/providers/copilot-token-exchanger';

const VALID_GHO = 'gho_validtoken123';
const FINE_GRAINED_PAT = 'github_pat_validtoken123';
const VALID_GHU = 'ghu_validtoken123';
const CLASSIC_PAT = 'ghp_invalidClassicPat';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GITHUB_COPILOT_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
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
