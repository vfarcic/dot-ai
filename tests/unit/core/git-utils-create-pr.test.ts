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
 * Git is real here, not mocked: the tests run against local bare repositories
 * served over file:// URLs. Only the GitHub API call is stubbed. A file:// URL
 * survives getAuthenticatedUrl() untouched (the WHATWG URL setters are no-ops
 * for file:), so the authenticated-push path runs exactly as it does in
 * production.
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
import { createPullRequest } from '../../../src/core/git-utils';
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
 * its file:// URL. `remoteRelPath` decides whether the remote looks like GitHub
 * to createPullRequest's `github\.com[/:]owner/repo` match.
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
    const remoteRel = 'github.com/acme/changed.git';
    const url = seedRemote(remoteRel, {
      mainFiles: { [MANIFEST]: MANIFEST_CONTENT },
    });
    const clone = shallowClone(url, path.join(TMP_ROOT, 'changed-clone'));
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
  // A fresh remote per test, so pushed head branches never collide. The
  // directory shape is what makes the remote look like GitHub to the helper.
  let apiRepo = 0;
  let clone: string;
  let remoteRel: string;

  beforeEach(() => {
    apiRepo += 1;
    remoteRel = `github.com/acme/demo-${apiRepo}.git`;
    const url = seedRemote(remoteRel);
    clone = shallowClone(url, path.join(TMP_ROOT, `api-clone-${apiRepo}`));
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
    const remoteRel = 'github.com/acme/wrapper.git';
    const url = seedRemote(remoteRel);
    const relativePath = path.join(CLONES_SESSION, 'wrapper');
    shallowClone(url, path.join(CLONES_DIR, relativePath));
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
    const remoteRel = 'github.com/acme/wrapper-noop.git';
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
