/**
 * Unit Tests: createPullRequest() shared helper (PRD #710 M1)
 *
 * The PR-creation half of git_create_pr now lives in git-utils.ts so pushToGit
 * can share it. These tests pin the extraction and the two deliberate fixes
 * that came with it:
 *   - decision 3: an empty commit returns an explicit `no_changes` result and
 *     pushes NOTHING, instead of asking GitHub to open a PR for a head branch
 *     that never reached the remote (raw 422).
 *   - decision 10: the base branch is fetched when the clone does not have it,
 *     so a non-default base works in the shallow single-branch clone that
 *     remediate's git_clone produces.
 * Plus: the outcome is unambiguous (`status`), the User-Agent is no longer
 * hardcoded to remediate, DOT_AI_GIT_CREATE_DRAFT_PRS still works, and
 * git_create_pr still validates paths and returns the shape remediate reads.
 *
 * The hardening pass that followed added: the head branch must be non-empty and
 * different from the base (so the helper can never write the protected branch),
 * the github.com host check is anchored rather than a substring match, the API
 * error body is scrubbed and capped, and "no changes" is a positive fact rather
 * than an inference from a missing commit sha.
 *
 * Git is real here, not mocked: the tests run against local bare repositories
 * served over file:// URLs. Only the GitHub API call is stubbed. A file:// URL
 * survives getAuthenticatedUrl() untouched (the WHATWG URL setters are no-ops
 * for file:), so the authenticated-push path runs exactly as it does in
 * production. Where a test needs the helper to see a GitHub remote, the clone's
 * origin is given a github.com URL while its `pushurl` keeps pointing at the
 * local bare repo (see pretendGitHubRemote) — the host check is anchored now, so
 * the old trick of naming the bare repo `…/github.com/acme/demo.git` no longer
 * (and must no longer) pass for GitHub.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'node:child_process';
import {
  createPullRequest,
  parseGitHubRemote,
  scrubCredentials,
} from '../../../src/core/git-utils';
import { createInternalToolExecutor } from '../../../src/core/internal-tools';
import type { GitCreatePrResult } from '../../../src/core/internal-tools';

const TMP_ROOT = path.resolve(process.cwd(), 'tmp', 'unit-create-pr');
// handleGitCreatePr resolves repoPath under ./tmp/gitops-clones/ — the wrapper
// tests need a real clone there. Only this session dir is created/removed.
const CLONES_SESSION = 'unit-create-pr-session';
const CLONES_DIR = path.resolve(process.cwd(), 'tmp', 'gitops-clones');

const MANIFEST = 'manifests/app.yaml';
const MANIFEST_CONTENT = 'apiVersion: v1\nkind: ConfigMap\n';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Create a bare repo at `<TMP_ROOT>/<remoteRelPath>` seeded with `main` (which
 * contains base.txt) plus one file-per-branch for each extra branch, and return
 * its file:// URL. A file:// remote is NOT GitHub, so unless a test calls
 * pretendGitHubRemote the helper takes its non-GitHub branch.
 */
function seedRemote(
  remoteRelPath: string,
  opts: { extraBranches?: string[]; mainFiles?: Record<string, string> } = {}
): string {
  const remoteDir = path.join(TMP_ROOT, remoteRelPath);
  fs.mkdirSync(path.dirname(remoteDir), { recursive: true });
  git(['init', '--bare', '-b', 'main', remoteDir], TMP_ROOT);

  const url = `file://${remoteDir}`;
  const seed = fs.mkdtempSync(path.join(TMP_ROOT, 'seed-'));
  git(['clone', '--quiet', url, seed], TMP_ROOT);
  git(['config', 'user.email', 'unit@test.local'], seed);
  git(['config', 'user.name', 'Unit Test'], seed);

  fs.writeFileSync(path.join(seed, 'base.txt'), 'base\n');
  for (const [file, content] of Object.entries(opts.mainFiles ?? {})) {
    fs.mkdirSync(path.dirname(path.join(seed, file)), { recursive: true });
    fs.writeFileSync(path.join(seed, file), content);
  }
  git(['add', '-A'], seed);
  git(['commit', '-m', 'seed'], seed);
  git(['push', '--quiet', 'origin', 'main'], seed);

  for (const branch of opts.extraBranches ?? []) {
    git(['checkout', '--quiet', '-b', branch], seed);
    fs.writeFileSync(path.join(seed, `${branch}.txt`), `${branch}\n`);
    git(['add', '-A'], seed);
    git(['commit', '-m', branch], seed);
    git(['push', '--quiet', 'origin', branch], seed);
    git(['checkout', '--quiet', 'main'], seed);
  }

  fs.rmSync(seed, { recursive: true, force: true });
  return url;
}

/** Clone exactly the way remediate's git_clone does: depth 1, no --branch. */
function shallowClone(url: string, targetDir: string): string {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  git(['clone', '--quiet', '--depth', '1', url, targetDir], TMP_ROOT);
  return targetDir;
}

/** A plain full clone: every branch gets a refs/remotes/origin/<name> ref. */
function fullClone(url: string, targetDir: string): string {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  git(['clone', '--quiet', url, targetDir], TMP_ROOT);
  return targetDir;
}

/**
 * Make `clone` look like a github.com checkout to createPullRequest while its
 * pushes still land in the local bare repo: `remote.origin.url` — what the
 * helper parses — becomes the github.com URL, and `remote.origin.pushurl` keeps
 * the file:// path git actually talks to. `git remote set-url origin <auth>`,
 * which pushRepo does around the push, only rewrites the fetch URL, so the
 * pushurl survives it.
 *
 * ⚠️ Only the PUSH is redirected. Anything that FETCHES — checkoutBaseBranch's
 * third arm, i.e. any `baseBranch` this clone has neither locally nor as an
 * origin/<base> ref — would talk to the real https://github.com/<ownerRepo>,
 * which does not exist. The bogus http proxy below turns that into an immediate
 * connection failure instead of a network round trip, so such a test fails
 * fast and loudly rather than hanging; a test that needs a fetched base must
 * not use this helper.
 */
function pretendGitHubRemote(
  clone: string,
  ownerRepo: string,
  fileUrl: string
): void {
  git(['remote', 'set-url', '--push', 'origin', fileUrl], clone);
  git(
    ['remote', 'set-url', 'origin', `https://github.com/${ownerRepo}.git`],
    clone
  );
  // Port 1 refuses instantly. A config key with no userinfo matches the
  // authenticated URL withAuthenticatedOrigin writes too.
  git(['config', 'http.proxy', 'http://127.0.0.1:1'], clone);
}

function remoteBranches(remoteRelPath: string): string[] {
  const out = git(
    ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
    path.join(TMP_ROOT, remoteRelPath)
  );
  return out.split('\n').filter(Boolean);
}

function remoteFiles(remoteRelPath: string, branch: string): string[] {
  const out = git(
    ['ls-tree', '-r', '--name-only', branch],
    path.join(TMP_ROOT, remoteRelPath)
  );
  return out.split('\n').filter(Boolean);
}

/** Stubbed GitHub API returning a created PR. */
function stubGitHubOk(
  html_url = 'https://github.com/acme/demo/pull/7',
  number = 7
) {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ html_url, number }),
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function requestBody(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(mock.mock.calls[0][1].body as string);
}

function requestHeaders(
  mock: ReturnType<typeof vi.fn>
): Record<string, string> {
  return mock.mock.calls[0][1].headers as Record<string, string>;
}

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'DOT_AI_GIT_TOKEN',
  'GITHUB_APP_ENABLED',
  'DOT_AI_GIT_CREATE_DRAFT_PRS',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
];

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  // Keep the developer's global/system git config out of these repositories
  // (commit signing, hooks, default branch) so the assertions are hermetic.
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.rmSync(path.join(CLONES_DIR, CLONES_SESSION), {
    recursive: true,
    force: true,
  });
});

beforeEach(() => {
  // pushRepo requires a credential before it will push; a file:// remote
  // ignores it, so any value exercises the real code path.
  process.env.DOT_AI_GIT_TOKEN = 'unit-test-token';
  delete process.env.GITHUB_APP_ENABLED;
  delete process.env.DOT_AI_GIT_CREATE_DRAFT_PRS;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPullRequest — head branch guard', () => {
  // PRD #710 success criterion 1: PR mode must never write the base branch.
  // pushRepo skips branch creation for a falsy `branch` and checks out an
  // existing branch when the name already exists, so without this guard both
  // cases commit and push onto the base branch that checkoutBaseBranch just
  // checked out — and only then collect a 422 for an empty/self-referencing
  // `head`, after the protected branch has already been written.
  let remoteRel: string;
  let url: string;
  let clone: string;
  let headBefore: string;
  let guardRepo = 0;

  beforeEach(() => {
    guardRepo += 1;
    remoteRel = `head-guard/repo-${guardRepo}.git`;
    url = seedRemote(remoteRel);
    clone = shallowClone(url, path.join(TMP_ROOT, `head-guard-${guardRepo}`));
    pretendGitHubRemote(clone, `acme/head-guard-${guardRepo}`, url);
    headBefore = git(['rev-parse', 'HEAD'], clone).trim();
  });

  /** Nothing was committed, pushed, or otherwise written anywhere. */
  function expectNothingWritten(fetchMock: ReturnType<typeof vi.fn>): void {
    expect(fetchMock).not.toHaveBeenCalled();
    expect(remoteBranches(remoteRel)).toEqual(['main']);
    expect(remoteFiles(remoteRel, 'main')).not.toContain(MANIFEST);
    expect(git(['rev-parse', 'HEAD'], clone).trim()).toBe(headBefore);
  }

  test('an empty branchName fails without touching the base branch', async () => {
    const fetchMock = stubGitHubOk();

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: no head branch',
      branchName: '',
      baseBranch: 'main',
    });

    expect(result).toMatchObject({ status: 'failed', success: false });
    expect('error' in result && result.error).toMatch(/branchName is required/);
    expectNothingWritten(fetchMock);
  });

  test('a missing branchName fails without touching the base branch', async () => {
    const fetchMock = stubGitHubOk();

    // A JavaScript caller that simply omits it — the type says string, the
    // runtime does not.
    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: undefined head branch',
      branchName: undefined as unknown as string,
      baseBranch: 'main',
    });

    expect(result).toMatchObject({ status: 'failed', success: false });
    expectNothingWritten(fetchMock);
  });

  test('branchName equal to baseBranch fails without pushing to it', async () => {
    const fetchMock = stubGitHubOk();

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: head is base',
      branchName: 'main',
      baseBranch: 'main',
    });

    expect(result).toMatchObject({ status: 'failed', success: false });
    expect('error' in result && result.error).toMatch(
      /must differ from baseBranch/
    );
    expectNothingWritten(fetchMock);
  });

  test('branchName equal to the DEFAULTED baseBranch fails too', async () => {
    const fetchMock = stubGitHubOk();

    // baseBranch omitted → defaults to 'main', so the collision is with the
    // default rather than with a supplied value.
    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: head is default base',
      branchName: 'main',
    });

    expect(result).toMatchObject({ status: 'failed', success: false });
    expectNothingWritten(fetchMock);
  });
});

describe('createPullRequest — empty diff (PRD #710 decision 3)', () => {
  test('returns an explicit no_changes result and pushes nothing', async () => {
    const remoteRel = 'empty-diff/repo.git';
    const url = seedRemote(remoteRel, {
      mainFiles: { [MANIFEST]: MANIFEST_CONTENT },
    });
    const clone = shallowClone(url, path.join(TMP_ROOT, 'empty-diff-clone'));
    const fetchMock = stubGitHubOk();

    // Same content that is already on main → the commit comes out empty.
    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'chore: no-op',
      branchName: 'dot-ai/no-op',
      baseBranch: 'main',
    });

    expect(result).toMatchObject({
      status: 'no_changes',
      success: true,
      branch: 'dot-ai/no-op',
      baseBranch: 'main',
      filesChanged: [],
    });
    expect(result).not.toHaveProperty('prUrl');
    expect(result).not.toHaveProperty('prNumber');
    expect('message' in result && result.message).toMatch(/No changes/i);

    // The head branch never reached the remote — which is exactly why calling
    // the GitHub API here produced a 422 before this fix.
    expect(remoteBranches(remoteRel)).toEqual(['main']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a real change on the same repo still opens a PR (no_changes is not sticky)', async () => {
    const remoteRel = 'changed/repo.git';
    const url = seedRemote(remoteRel, {
      mainFiles: { [MANIFEST]: MANIFEST_CONTENT },
    });
    const clone = shallowClone(url, path.join(TMP_ROOT, 'changed-clone'));
    pretendGitHubRemote(clone, 'acme/changed', url);
    stubGitHubOk('https://github.com/acme/changed/pull/3', 3);

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: `${MANIFEST_CONTENT}# changed\n` }],
      title: 'feat: change',
      branchName: 'dot-ai/changed',
      baseBranch: 'main',
    });

    expect(result).toMatchObject({
      status: 'created',
      success: true,
      prNumber: 3,
      branch: 'dot-ai/changed',
      filesChanged: [MANIFEST],
    });
    expect(remoteBranches(remoteRel)).toContain('dot-ai/changed');
  });

  test('a commit that fails with no output is a failure, not a no-changes result', async () => {
    // Emptiness is decided positively (`git diff --cached`), so a commit that
    // produces no sha for any OTHER reason — here a pre-commit hook that exits
    // non-zero silently, which simple-git resolves rather than rejects — is not
    // reported as "the files already match the base branch".
    const remoteRel = 'commit-fails/repo.git';
    const url = seedRemote(remoteRel);
    const clone = shallowClone(url, path.join(TMP_ROOT, 'commit-fails-clone'));
    const hook = path.join(clone, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const fetchMock = stubGitHubOk();

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: blocked by hook',
      branchName: 'dot-ai/hook-blocked',
      baseBranch: 'main',
    });

    expect(result).toMatchObject({ status: 'failed', success: false });
    expect('error' in result && result.error).not.toMatch(/No changes/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(remoteBranches(remoteRel)).toEqual(['main']);
  });
});

describe('createPullRequest — base ref fetch (PRD #710 decision 10)', () => {
  test('fetches a base branch missing from a shallow single-branch clone', async () => {
    const remoteRel = 'base-fetch/repo.git';
    const url = seedRemote(remoteRel, { extraBranches: ['develop'] });
    const clone = shallowClone(url, path.join(TMP_ROOT, 'base-fetch-clone'));
    stubGitHubOk();

    // Precondition — this is the latent remediate bug: git_clone's depth-1
    // clone has no ref for a non-default branch, so a plain checkout fails.
    expect(() => git(['rev-parse', '--verify', 'develop'], clone)).toThrow();

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'fix: against develop',
      branchName: 'dot-ai/from-develop',
      baseBranch: 'develop',
    });

    expect(result).toMatchObject({
      status: 'pushed_without_pr',
      success: true,
      baseBranch: 'develop',
      branch: 'dot-ai/from-develop',
      filesChanged: [MANIFEST],
    });

    // Branched off develop, not off the default branch: develop.txt exists on
    // the pushed head branch alongside the new manifest.
    const pushed = remoteFiles(remoteRel, 'dot-ai/from-develop');
    expect(pushed).toContain('develop.txt');
    expect(pushed).toContain(MANIFEST);
  });

  test('uses an existing origin/<base> tracking ref without fetching', async () => {
    // The middle arm: what a plain (non-shallow) clone gives you for a
    // non-default base — refs/remotes/origin/develop exists, no local develop —
    // and the arm where `checkout -B` meets an already-present tracking ref.
    const remoteRel = 'base-tracking/repo.git';
    const url = seedRemote(remoteRel, { extraBranches: ['develop'] });
    const clone = fullClone(url, path.join(TMP_ROOT, 'base-tracking-clone'));
    stubGitHubOk();

    // Preconditions for this arm: no local branch, but a tracking ref.
    expect(git(['branch', '--list', 'develop'], clone).trim()).toBe('');
    expect(
      git(
        ['rev-parse', '--verify', 'refs/remotes/origin/develop'],
        clone
      ).trim()
    ).toMatch(/^[0-9a-f]{40}$/);
    // `git clone` writes no FETCH_HEAD, so its appearance would mean a fetch ran.
    const fetchHead = path.join(clone, '.git', 'FETCH_HEAD');
    expect(fs.existsSync(fetchHead)).toBe(false);

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'fix: against tracked develop',
      branchName: 'dot-ai/from-tracked-develop',
      baseBranch: 'develop',
    });

    expect(result).toMatchObject({
      status: 'pushed_without_pr',
      success: true,
      baseBranch: 'develop',
      branch: 'dot-ai/from-tracked-develop',
      filesChanged: [MANIFEST],
    });
    expect(fs.existsSync(fetchHead)).toBe(false);

    // The head branch carries develop's content, not the default branch's.
    const pushed = remoteFiles(remoteRel, 'dot-ai/from-tracked-develop');
    expect(pushed).toContain('develop.txt');
    expect(pushed).toContain(MANIFEST);
  });

  test('uses the local base branch when the clone already has it', async () => {
    const remoteRel = 'base-local/repo.git';
    const url = seedRemote(remoteRel);
    const clone = shallowClone(url, path.join(TMP_ROOT, 'base-local-clone'));
    stubGitHubOk();

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'fix: against main',
      branchName: 'dot-ai/from-main',
      baseBranch: 'main',
    });

    expect(result).toMatchObject({
      status: 'pushed_without_pr',
      success: true,
      baseBranch: 'main',
    });
    expect(remoteFiles(remoteRel, 'dot-ai/from-main')).toContain('base.txt');
  });

  test('a base branch that exists nowhere fails instead of silently using the default', async () => {
    const remoteRel = 'base-missing/repo.git';
    const url = seedRemote(remoteRel);
    const clone = shallowClone(url, path.join(TMP_ROOT, 'base-missing-clone'));
    stubGitHubOk();

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'fix: nowhere',
      branchName: 'dot-ai/nowhere',
      baseBranch: 'does-not-exist',
    });

    expect(result).toMatchObject({ status: 'failed', success: false });
    expect(remoteBranches(remoteRel)).toEqual(['main']);
  });
});

describe('createPullRequest — GitHub API call', () => {
  // A fresh remote per test, so pushed head branches never collide. The clone's
  // origin is rewritten to a github.com URL (pushes still go to the local bare
  // repo) — that URL, not the directory layout, is what the helper parses.
  let apiRepo = 0;
  let clone: string;
  let remoteRel: string;

  beforeEach(() => {
    apiRepo += 1;
    remoteRel = `api/demo-${apiRepo}.git`;
    const url = seedRemote(remoteRel);
    clone = shallowClone(url, path.join(TMP_ROOT, `api-clone-${apiRepo}`));
    pretendGitHubRemote(clone, `acme/demo-${apiRepo}`, url);
  });

  test('opens the PR with the caller-supplied User-Agent and returns its URL and number', async () => {
    const fetchMock = stubGitHubOk('https://github.com/acme/demo/pull/42', 42);

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: add app',
      body: 'body text',
      branchName: 'dot-ai/head-1',
      baseBranch: 'main',
      userAgent: 'dot-ai-pushtogit',
    });

    expect(result).toMatchObject({
      status: 'created',
      success: true,
      prUrl: 'https://github.com/acme/demo/pull/42',
      prNumber: 42,
      branch: 'dot-ai/head-1',
      baseBranch: 'main',
      filesChanged: [MANIFEST],
    });

    const [apiUrl, init] = fetchMock.mock.calls[0];
    expect(String(apiUrl)).toMatch(
      /^https:\/\/api\.github\.com\/repos\/acme\/demo-\d+\/pulls$/
    );
    expect(init.method).toBe('POST');
    // The POST goes through the module's one fetchWithTimeout helper, so it
    // carries a timeout signal rather than having its own timeout mechanism.
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(requestHeaders(fetchMock)['User-Agent']).toBe('dot-ai-pushtogit');
    expect(requestHeaders(fetchMock).Authorization).toBe(
      'Bearer unit-test-token'
    );
    expect(requestBody(fetchMock)).toMatchObject({
      title: 'feat: add app',
      body: 'body text',
      head: 'dot-ai/head-1',
      base: 'main',
    });
    // Not a draft unless the test-only switch is set.
    expect(requestBody(fetchMock)).not.toHaveProperty('draft');
  });

  test('defaults the User-Agent when the caller supplies none', async () => {
    const fetchMock = stubGitHubOk();
    await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: default UA',
      branchName: 'dot-ai/head-2',
    });
    expect(requestHeaders(fetchMock)['User-Agent']).toBe('dot-ai');
  });

  test('DOT_AI_GIT_CREATE_DRAFT_PRS=true still opens a draft PR', async () => {
    process.env.DOT_AI_GIT_CREATE_DRAFT_PRS = 'true';
    const fetchMock = stubGitHubOk();
    await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: draft',
      branchName: 'dot-ai/head-3',
    });
    expect(requestBody(fetchMock).draft).toBe(true);
  });

  test('a GitHub API error is a failed result carrying the status and body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => '{"message":"Validation Failed"}',
      })
    );

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: rejected',
      branchName: 'dot-ai/head-4',
    });

    expect(result).toMatchObject({ status: 'failed', success: false });
    expect('error' in result && result.error).toContain(
      'GitHub API error (422)'
    );
    expect('error' in result && result.error).toContain('Validation Failed');
  });

  test('the API error body is credential-scrubbed and capped, not forwarded verbatim', async () => {
    // A third party's response text: it must be scrubbed like every other
    // message the helper returns, and bounded so a huge body is not echoed back.
    const body = `remote https://x-access-token:s3cr3t-token@github.com/acme/demo.git rejected ${'A'.repeat(4000)}`;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, text: async () => body })
    );

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: server error',
      branchName: 'dot-ai/head-5',
    });

    expect(result).toMatchObject({ status: 'failed', success: false });
    const error = 'error' in result ? result.error : '';
    expect(error).toContain('GitHub API error (500)');
    expect(error).not.toContain('s3cr3t-token');
    expect(error).toContain('***@github.com');
    expect(error).toContain('(truncated)');
    expect(error.length).toBeLessThan(700);
  });

  test('a ~100 KB error body does not stall the server (scrub is bounded and linear)', async () => {
    // This body is not crafted — it is the shape of an nginx / Cloudflare /
    // corporate-egress-proxy 5xx interstitial: many `https://…` (so many `//`
    // starts), many `:` inside style attributes, and NO `@` anywhere, which is
    // the worst case for a `//…:…@` scrub. With the earlier regex — whose two
    // `[^@]` runs overlapped and both crossed `/` and `:` — 110 KB of this took
    // 64 SECONDS of synchronous CPU, freezing the whole MCP server; the 30s
    // fetch timeout does not help because the stall is after the body is read.
    const chunk =
      '<a href="https://cdn.example.test/assets/app.css" style="color:#fff;margin:0;padding:0">upstream connect error</a>';
    const body = chunk.repeat(Math.ceil(100_000 / chunk.length));
    expect(body.length).toBeGreaterThan(100_000);
    expect(body).not.toContain('@');

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 502, text: async () => body })
    );

    const started = performance.now();
    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: proxy interstitial',
      branchName: 'dot-ai/head-6',
    });
    const elapsedMs = performance.now() - started;

    expect(result).toMatchObject({ status: 'failed', success: false });
    const error = 'error' in result ? result.error : '';
    expect(error).toContain('GitHub API error (502)');
    expect(error).toContain('(truncated)');
    expect(error.length).toBeLessThan(700);
    // Generous on purpose: the elapsed time includes a real clone/commit/push,
    // so the budget only has to separate "milliseconds of regex" from the tens
    // of seconds the unbounded super-linear scrub used to take.
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe('scrubCredentials — linear on hostile input', () => {
  // The scrub runs on text this module never produced and does not bound: git
  // stderr, an exception message, a third party's HTTP body. Bounding the one
  // API-body call site is not enough on its own — the regexes themselves must
  // not be super-linear.
  test('200 KB of `//`-and-`:`-rich text with no `@` returns promptly', () => {
    const chunk =
      'see https://cdn.example.test/a/b/c.css and style="color:#fff;margin:0" ';
    const input = chunk.repeat(Math.ceil(200_000 / chunk.length));
    expect(input).not.toContain('@');

    const started = performance.now();
    const output = scrubCredentials(input);
    const elapsedMs = performance.now() - started;

    // Nothing to scrub, so the text is returned as-is — the point is when.
    expect(output).toBe(input);
    expect(elapsedMs).toBeLessThan(500);
  });

  test('still scrubs the userinfo forms it is there for', () => {
    expect(
      scrubCredentials('https://x-access-token:ghs_secret@github.com/acme/demo')
    ).toBe('https://***@github.com/acme/demo');
    expect(
      scrubCredentials('fatal: https://user:s3cr3t@gitlab.corp/team/x.git')
    ).toBe('fatal: https://***@gitlab.corp/team/x.git');
    // A colon in the password half is still consumed up to the `@`.
    expect(scrubCredentials('https://user:pa:ss@host/r')).toBe(
      'https://***@host/r'
    );
    // A credential-free URL — including host:port and paths with colons — is
    // left alone.
    expect(scrubCredentials('https://github.com:443/acme/demo.git')).toBe(
      'https://github.com:443/acme/demo.git'
    );
  });
});

describe('parseGitHubRemote — anchored host check', () => {
  test.each([
    ['https://github.com/acme/demo.git', 'acme', 'demo'],
    ['https://github.com/acme/demo', 'acme', 'demo'],
    ['https://x-access-token:tok@github.com/acme/demo.git', 'acme', 'demo'],
    // scrubCredentials rewrites the userinfo before anything else sees the URL.
    ['https://***@github.com/acme/demo.git', 'acme', 'demo'],
    ['https://GitHub.com/acme/demo.git', 'acme', 'demo'],
    ['ssh://git@github.com/acme/demo.git', 'acme', 'demo'],
    // scp-style shorthand, which `new URL` cannot parse at all.
    ['git@github.com:acme/demo.git', 'acme', 'demo'],
    ['git@github.com:acme/demo', 'acme', 'demo'],
    ['github.com:acme/demo.git', 'acme', 'demo'],
    ['https://github.com/acme/demo.git\n', 'acme', 'demo'],
    ['https://github.com/acme/dot.ai_demo-1.git', 'acme', 'dot.ai_demo-1'],
    // github.com's own www alias: it clones fine via redirect and addresses the
    // same repository on api.github.com, so declining it would only mean a real
    // GitHub remote silently gets no PR.
    ['https://www.github.com/acme/demo.git', 'acme', 'demo'],
    ['git@www.github.com:acme/demo.git', 'acme', 'demo'],
    // A trailing slash is the same remote, not a third (empty) path segment.
    ['https://github.com/acme/demo.git/', 'acme', 'demo'],
    ['https://github.com/acme/demo/', 'acme', 'demo'],
    ['git@github.com:acme/demo.git/', 'acme', 'demo'],
  ])('%s → %s/%s', (remote, owner, repo) => {
    expect(parseGitHubRemote(remote)).toEqual({ owner, repo });
  });

  test.each([
    // The two cases a substring match on `github.com` accepted: an attacker's
    // host serving an attacker-chosen owner/repo, for which the server would
    // then POST to api.github.com under its own credential.
    'https://evil.example/github.com/victim/private.git',
    'https://notgithub.com/acme/demo.git',
    'https://github.com.evil.test/acme/demo.git',
    'git@notgithub.com:acme/demo.git',
    // Other hosts are out of scope by design (PRD #710 decision 7).
    'https://gitlab.com/acme/demo.git',
    'https://github.example.com/acme/demo.git',
    // What these tests' own remotes look like.
    'file:///tmp/unit/github.com/acme/demo.git',
    // Not exactly <owner>/<repo> on the host.
    'https://github.com/acme',
    'https://github.com/acme/demo/extra.git',
    'https://github.com//demo.git',
    'https://github.com/acme/..',
    '',
    'not a url at all',
    // Dot segments: legal per GITHUB_NAME_PATTERN (a dot belongs in both logins
    // and repo names) but they survive into the API URL, where fetch's own path
    // normalization then eats a literal segment — so `..`/`evil` would POST to
    // api.github.com/evil/pulls instead of /repos/../evil/pulls. Only the scp
    // branch and a repo whose `.git` suffix leaves a bare dot can produce them
    // (`new URL` normalizes the rest away).
    'git@github.com:../evil.git',
    'git@github.com:acme/...git',
    'git@github.com:../..git',
    'git@github.com:./demo.git',
    'https://github.com/acme/..git',
    'https://github.com/acme/...git',
    'https://www.github.com/acme/..git',
  ])('rejects %s', remote => {
    expect(parseGitHubRemote(remote)).toBeUndefined();
  });

  test('a look-alike remote reaches no API and reports the non-GitHub outcome', async () => {
    // End to end: the path shape that used to satisfy the substring match —
    // exactly how these tests used to fake GitHub — is now a non-GitHub remote.
    const remoteRel = 'github.com/acme/lookalike.git';
    const url = seedRemote(remoteRel);
    const clone = shallowClone(url, path.join(TMP_ROOT, 'lookalike-clone'));
    const fetchMock = stubGitHubOk();

    const result = await createPullRequest({
      repoPath: clone,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'feat: look-alike remote',
      branchName: 'dot-ai/lookalike',
      baseBranch: 'main',
    });

    expect(result).toMatchObject({
      status: 'pushed_without_pr',
      success: true,
      branch: 'dot-ai/lookalike',
    });
    // The message must not claim "the repository is not hosted on GitHub": an
    // anchored parser also declines github.com URLs in an unexpected shape, and
    // telling a user their GitHub repo is not on GitHub reads as a bug.
    expect('error' in result && result.error).toMatch(
      /could not be opened automatically/
    );
    expect('error' in result && result.error).not.toMatch(/not hosted/i);
    expect(fetchMock).not.toHaveBeenCalled();
    // The branch IS on the remote — only the PR is missing (decision 7).
    expect(remoteBranches(remoteRel)).toContain('dot-ai/lookalike');
  });
});

describe('git_create_pr wrapper — unchanged contract (PRD #710 M1)', () => {
  const executor = createInternalToolExecutor(CLONES_SESSION);

  test('still rejects a repoPath outside the clones directory', async () => {
    const result = (await executor('git_create_pr', {
      repoPath: '../../../etc',
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'Test PR',
      branchName: 'dot-ai/head',
    })) as GitCreatePrResult;

    expect(result).toMatchObject({
      status: 'failed',
      success: false,
      error: expect.stringContaining('Invalid repo path'),
    });
  });

  test('delegates to createPullRequest and returns the same success shape', async () => {
    const remoteRel = 'wrapper/repo.git';
    const url = seedRemote(remoteRel);
    const relativePath = path.join(CLONES_SESSION, 'wrapper');
    const clone = shallowClone(url, path.join(CLONES_DIR, relativePath));
    pretendGitHubRemote(clone, 'acme/wrapper', url);
    const fetchMock = stubGitHubOk(
      'https://github.com/acme/wrapper/pull/11',
      11
    );

    const result = (await executor('git_create_pr', {
      repoPath: relativePath,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'fix: remediation',
      body: '## Remediation',
      branchName: 'remediate/abc123-1',
      baseBranch: 'main',
    })) as GitCreatePrResult;

    // The shape remediate reads (remediate.ts) — unchanged apart from `status`.
    expect(result).toMatchObject({
      status: 'created',
      success: true,
      prUrl: 'https://github.com/acme/wrapper/pull/11',
      prNumber: 11,
      branch: 'remediate/abc123-1',
      baseBranch: 'main',
      filesChanged: [MANIFEST],
    });
    // Remediate keeps identifying itself to the GitHub API.
    expect(requestHeaders(fetchMock)['User-Agent']).toBe('dot-ai-remediate');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.github.com/repos/acme/wrapper/pulls'
    );
    expect(remoteBranches(remoteRel)).toContain('remediate/abc123-1');
  });

  test('surfaces the no-changes result through the tool as well', async () => {
    const remoteRel = 'wrapper-noop/repo.git';
    const url = seedRemote(remoteRel, {
      mainFiles: { [MANIFEST]: MANIFEST_CONTENT },
    });
    const relativePath = path.join(CLONES_SESSION, 'wrapper-noop');
    shallowClone(url, path.join(CLONES_DIR, relativePath));
    const fetchMock = stubGitHubOk();

    const result = (await executor('git_create_pr', {
      repoPath: relativePath,
      files: [{ path: MANIFEST, content: MANIFEST_CONTENT }],
      title: 'fix: already applied',
      branchName: 'remediate/abc123-2',
      baseBranch: 'main',
    })) as GitCreatePrResult;

    expect(result).toMatchObject({ status: 'no_changes', success: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(remoteBranches(remoteRel)).toEqual(['main']);
  });
});
