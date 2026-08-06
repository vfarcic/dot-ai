/**
 * Unit Tests: four pre-existing security findings closed before PRD #710's PR.
 *
 * None of the four is a regression from PRD #710 — all are live in v1.25.0 —
 * but PR mode makes `repoUrl` client-supplied on a second code path, so they are
 * fixed here rather than deferred.
 *
 * A. pushRepo's containment check was LEXICAL (path.resolve + startsWith), so a
 *    symlink committed in the target repository redirected the write outside the
 *    clone: `targetPath: "link"` passes pushToGit's own validation (no `..`, no
 *    leading `/`), and the file write happens BEFORE the `git add` that would
 *    complain about a path outside the work tree.
 * B. scrubCredentials masked userinfo only when it contained a `:`, so a PAT used
 *    as the USERNAME — which GitHub accepts as a working credential, no password
 *    needed — reached the log line, the session file and the response body
 *    verbatim.
 * C. The server's token was embedded into whatever URL the client supplied, so
 *    any caller with `execute` on `recommend` could have DOT_AI_GIT_TOKEN (or a
 *    GitHub App installation token) delivered to a host they control.
 * D. Containment alone still allowed a write into `<clone>/.git/**`, which stays
 *    under the repository root — and `.git/config` is CODE: pushRepo's own next
 *    `git add` reads it, so `core.fsmonitor` runs a command of the writer's
 *    choosing as the server. See that section's header for both callers.
 *
 * Git is real here — the symlink escape and the config execution only reproduce
 * against an actual checkout, which is the whole point of the findings.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'node:child_process';
import {
  pushRepo,
  scrubCredentials,
  getAllowedRepoHosts,
  isRepoHostAllowed,
  describeDisallowedRepoHost,
  classifyRepoCredentialRefusal,
  suggestedActionsForDisallowedRepo,
  ALLOWED_REPO_HOSTS_ENV,
} from '../../../src/core/git-utils';

const TMP_ROOT = path.resolve(process.cwd(), 'tmp', 'unit-git-security');

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  'DOT_AI_GIT_TOKEN',
  'GITHUB_APP_ENABLED',
  ALLOWED_REPO_HOSTS_ENV,
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
];

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  // Keep the developer's global/system git config out of these repositories.
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

// ───────────────────────────────────────────────────────────────────────────
// Finding A — symlink write-escape past pushRepo's traversal guard
// ───────────────────────────────────────────────────────────────────────────

describe('pushRepo — symlink write escape (finding A)', () => {
  let caseIndex = 0;
  let sandbox: string;
  let clone: string;
  let outside: string;

  /**
   * A real checkout of a real (bare) remote, with `link` → a sibling directory
   * OUTSIDE the clone: exactly what the auditor's reproduction used. The remote
   * exists so the success cases can push, and so a blocked case can be shown to
   * have written nothing anywhere.
   */
  beforeEach(() => {
    caseIndex += 1;
    process.env.DOT_AI_GIT_TOKEN = 'unit-test-token';
    sandbox = path.join(TMP_ROOT, `symlink-${caseIndex}`);
    clone = path.join(sandbox, 'clone');
    outside = path.join(sandbox, 'outside');
    const remote = path.join(sandbox, 'remote.git');
    fs.mkdirSync(sandbox, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    git(['init', '--bare', '-b', 'main', remote], sandbox);
    git(['clone', '--quiet', `file://${remote}`, clone], sandbox);
    git(['config', 'user.email', 'unit@test.local'], clone);
    git(['config', 'user.name', 'Unit Test'], clone);
    fs.writeFileSync(path.join(clone, 'base.txt'), 'base\n');
    git(['add', '-A'], clone);
    git(['commit', '-m', 'seed'], clone);
    git(['push', '--quiet', 'origin', 'main'], clone);
  });

  /** Run pushRepo and hand back the rejection instead of throwing. */
  async function attempt(
    repoPath: string,
    filePath: string,
    content: string
  ): Promise<string> {
    try {
      await pushRepo(repoPath, [{ path: filePath, content }], 'feat: attempt');
      return '';
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  test('a symlinked directory inside the clone cannot redirect the write outside it', async () => {
    // The symlink is the attack: `targetPath: "link"` survives pushToGit's own
    // validation (no `..`, no leading `/`, no `\`), and the lexical check saw
    // only `<clone>/link/escape.yaml`, which starts with `<clone>/`.
    fs.symlinkSync(outside, path.join(clone, 'link'), 'dir');

    const error = await attempt(clone, 'link/escape.yaml', 'owned: true\n');

    // THE finding: before the fix this file existed. `git add` did reject the
    // pathspec afterwards ("beyond a symbolic link"), but the write had already
    // landed outside the clone.
    expect(fs.existsSync(path.join(outside, 'escape.yaml'))).toBe(false);
    expect(error).toMatch(/outside repository directory/);
  });

  test('a symlinked FILE inside the clone cannot redirect the write outside it', async () => {
    // The final component, not a parent: `fs.writeFileSync` follows it and
    // overwrites whatever it points at — and here git raises nothing at all,
    // because the staged blob is a perfectly ordinary file.
    const victim = path.join(outside, 'victim.yaml');
    fs.writeFileSync(victim, 'original\n');
    fs.symlinkSync(victim, path.join(clone, 'pointer.yaml'), 'file');

    const error = await attempt(clone, 'pointer.yaml', 'overwritten\n');

    expect(fs.readFileSync(victim, 'utf8')).toBe('original\n');
    expect(error).toMatch(/outside repository directory/);
  });

  test('a symlink DEEPER than the first path component is caught too', async () => {
    fs.mkdirSync(path.join(clone, 'apps'), { recursive: true });
    fs.symlinkSync(outside, path.join(clone, 'apps', 'link'), 'dir');

    const error = await attempt(
      clone,
      'apps/link/nested/escape.yaml',
      'owned: true\n'
    );

    expect(fs.existsSync(path.join(outside, 'nested'))).toBe(false);
    expect(error).toMatch(/outside repository directory/);
  });

  test('the lexical case it always caught still fails', async () => {
    const error = await attempt(clone, '../escape.yaml', 'owned: true\n');

    expect(fs.existsSync(path.join(sandbox, 'escape.yaml'))).toBe(false);
    expect(error).toMatch(/Path traversal detected/);
  });

  test('an ordinary nested write still works, including directories that do not exist yet', async () => {
    // The fix must not break the normal path: several levels of missing
    // directories under the clone are created and written as before.
    const result = await pushRepo(
      clone,
      [{ path: 'apps/team/db/app.yaml', content: 'kind: ConfigMap\n' }],
      'feat: nested'
    );

    expect(result.commitSha).toBeTruthy();
    expect(result.filesAdded).toEqual(['apps/team/db/app.yaml']);
    expect(
      fs.readFileSync(path.join(clone, 'apps/team/db/app.yaml'), 'utf8')
    ).toBe('kind: ConfigMap\n');
  });

  test('overwriting an existing ordinary file still works', async () => {
    const result = await pushRepo(
      clone,
      [{ path: 'base.txt', content: 'replaced\n' }],
      'feat: overwrite in place'
    );

    expect(result.commitSha).toBeTruthy();
    expect(fs.readFileSync(path.join(clone, 'base.txt'), 'utf8')).toBe(
      'replaced\n'
    );
  });

  test('a DANGLING symlink cannot be used to create a file outside the clone', async () => {
    // The case the containment check alone cannot see: a dangling link has
    // nothing to resolve, so the path looks contained right up to the moment
    // `fs.writeFileSync` follows it — and for a dangling link it CREATES the
    // target. This is what O_NOFOLLOW is for.
    const victim = path.join(outside, 'created-by-escape.yaml');
    fs.symlinkSync(victim, path.join(clone, 'dangling.yaml'), 'file');

    const error = await attempt(clone, 'dangling.yaml', 'owned: true\n');

    expect(fs.existsSync(victim)).toBe(false);
    expect(error).toMatch(/symbolic link/);
  });

  test('a symlinked FINAL component is refused even when it resolves INSIDE the clone', async () => {
    // Policy: never write THROUGH a link. A generated manifest has no reason to
    // be one, `git add` declines such a pathspec anyway, and the alternative is
    // deciding per-link whether following it is safe.
    fs.mkdirSync(path.join(clone, 'real'), { recursive: true });
    fs.writeFileSync(path.join(clone, 'real/app.yaml'), 'original\n');
    fs.symlinkSync(
      path.join(clone, 'real/app.yaml'),
      path.join(clone, 'inner.yaml'),
      'file'
    );

    const error = await attempt(clone, 'inner.yaml', 'kind: ConfigMap\n');

    expect(fs.readFileSync(path.join(clone, 'real/app.yaml'), 'utf8')).toBe(
      'original\n'
    );
    expect(error).toMatch(/symbolic link/);
  });

  test('a clone reached through a symlinked ANCESTOR is still writable', async () => {
    // The containment check resolves both sides, so a repoPath that itself
    // traverses a symlink (a symlinked ./tmp, /tmp → /private/tmp on macOS) must
    // not read as an escape.
    const aliasDir = path.join(sandbox, 'alias');
    fs.symlinkSync(clone, aliasDir, 'dir');

    const result = await pushRepo(
      aliasDir,
      [{ path: 'apps/app.yaml', content: 'kind: ConfigMap\n' }],
      'feat: via symlinked ancestor'
    );

    expect(result.commitSha).toBeTruthy();
    expect(fs.readFileSync(path.join(clone, 'apps/app.yaml'), 'utf8')).toBe(
      'kind: ConfigMap\n'
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Finding D — a write into `<clone>/.git/**` is command execution as the server
//
// Containment is not enough: `<clone>/.git/config` IS under the repository root,
// and it is not data — git reads it on the very next command. pushRepo writes the
// files and THEN runs `git add` / `git status`, so a `core.fsmonitor` entry lands
// in the config a moment before git executes it, as the MCP server process (which
// holds DOT_AI_GIT_TOKEN, the GitHub App private key and the pod's service-account
// token). The push then completes normally and reports success — no error, no
// warning, no log line.
//
// Both callers of pushRepo reach it, so the guard belongs here rather than in
// either of them:
// - pushToGit — `targetPath` is client-controlled and its own validation rejects
//   ``, a leading `/`, a leading `~`, `\` and `..`, but not `.git`; the basename
//   comes from AI-generated `relativePath`s that only pass sanitizeRelativePath,
//   which accepts `config`.
// - remediate's git_create_pr — the AI's `files` array is passed VERBATIM, with
//   no path validation at all. pushRepo is the only guard, and no client
//   parameter is needed to steer it.
// ───────────────────────────────────────────────────────────────────────────

describe('pushRepo — writes into the git directory (finding D)', () => {
  let caseIndex = 0;
  let sandbox: string;
  let clone: string;
  let remote: string;
  let marker: string;
  let originalConfig: string;

  beforeEach(() => {
    caseIndex += 1;
    process.env.DOT_AI_GIT_TOKEN = 'unit-test-token';
    sandbox = path.join(TMP_ROOT, `gitdir-${caseIndex}`);
    clone = path.join(sandbox, 'clone');
    remote = path.join(sandbox, 'remote.git');
    marker = path.join(sandbox, 'COMMAND-EXECUTED');
    fs.mkdirSync(sandbox, { recursive: true });
    git(['init', '--bare', '-b', 'main', remote], sandbox);
    git(['clone', '--quiet', `file://${remote}`, clone], sandbox);
    git(['config', 'user.email', 'unit@test.local'], clone);
    git(['config', 'user.name', 'Unit Test'], clone);
    fs.writeFileSync(path.join(clone, 'base.txt'), 'base\n');
    git(['add', '-A'], clone);
    git(['commit', '-m', 'seed'], clone);
    git(['push', '--quiet', 'origin', 'main'], clone);
    originalConfig = fs.readFileSync(path.join(clone, '.git/config'), 'utf8');
  });

  /**
   * A `.git/config` that runs `touch <marker>` the next time git refreshes the
   * index, with `origin` restored so the push it hijacks still succeeds — the
   * auditor's exact payload. `core.fsmonitor` is run by `refresh_index`, i.e. by
   * pushRepo's own `git add`.
   */
  function fsmonitorPayload(): string {
    return [
      '[core]',
      `\tfsmonitor = "touch ${marker}"`,
      '[remote "origin"]',
      `\turl = file://${remote}`,
      '\tfetch = +refs/heads/*:refs/remotes/origin/*',
      '',
    ].join('\n');
  }

  async function attempt(
    filePath: string,
    content: string
  ): Promise<{ error: string; commitSha?: string }> {
    try {
      const result = await pushRepo(
        clone,
        [
          { path: 'apps/manifests.yaml', content: 'kind: ConfigMap\n' },
          { path: filePath, content },
        ],
        'feat: attempt'
      );
      return { error: '', commitSha: result.commitSha };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Neither the payload nor its effect landed. */
  function expectNothingHappened(): void {
    expect(fs.existsSync(marker)).toBe(false);
    expect(fs.readFileSync(path.join(clone, '.git/config'), 'utf8')).toBe(
      originalConfig
    );
    expect(fs.existsSync(path.join(clone, 'apps/manifests.yaml'))).toBe(false);
  }

  test('.git/config cannot be written, so the fsmonitor payload never executes', async () => {
    const { error } = await attempt('.git/config', fsmonitorPayload());

    // THE finding: before the fix this run reported
    // `filesAdded: ["apps/manifests.yaml", ".git/config"]` with no error, the
    // config was clobbered, and the marker existed — arbitrary command
    // execution in the MCP server container.
    expect(error).toMatch(/git directory/);
    expectNothingHappened();
  });

  test('a symlink INSIDE the clone pointing at .git cannot reach it either', async () => {
    // Bypasses a lexical check completely — `g/config` names no `.git` component
    // — which is why the guard has to run on the RESOLVED path.
    fs.symlinkSync(path.join(clone, '.git'), path.join(clone, 'g'), 'dir');

    const { error } = await attempt('g/config', fsmonitorPayload());

    expect(error).toMatch(/git directory/);
    expectNothingHappened();
  });

  test('a symlinked .git ANCESTOR deeper in the tree is caught too', async () => {
    fs.mkdirSync(path.join(clone, 'apps'), { recursive: true });
    fs.symlinkSync(path.join(clone, '.git'), path.join(clone, 'apps/g'), 'dir');

    const { error } = await attempt('apps/g/hooks/pre-commit', '#!/bin/sh\n');

    expect(error).toMatch(/git directory/);
    expect(fs.existsSync(path.join(clone, '.git/hooks/pre-commit'))).toBe(
      false
    );
  });

  test('the whole git directory is refused, not just config', async () => {
    for (const target of [
      '.git/hooks/pre-commit',
      '.git/info/exclude',
      '.git/HEAD',
      '.git', // a FILE named .git — the submodule shape
      'sub/.git/config', // a nested control directory
    ]) {
      const { error } = await attempt(target, 'payload\n');
      expect(error).toMatch(/git directory/);
    }
    expect(fs.existsSync(path.join(clone, '.git/hooks/pre-commit'))).toBe(
      false
    );
    expect(fs.readFileSync(path.join(clone, '.git/HEAD'), 'utf8')).toContain(
      'refs/heads/main'
    );
  });

  test('case-folded and trailing-space spellings of .git are refused', async () => {
    // ext4 keeps these distinct, so on Linux they create a harmless new
    // directory rather than reaching the real one. They are refused anyway: on a
    // case-insensitive or trailing-space-stripping filesystem the same string
    // opens git's own directory, and nothing legitimate is spelled this way.
    for (const target of [
      '.GIT/config',
      '.Git/config',
      '.git /config',
      '.git./config',
    ]) {
      const { error } = await attempt(target, fsmonitorPayload());
      expect(error).toMatch(/git directory/);
    }
    expectNothingHappened();
    for (const stray of ['.GIT', '.Git', '.git ', '.git.']) {
      expect(fs.existsSync(path.join(clone, stray))).toBe(false);
    }
  });

  test('paths that merely LOOK like the git directory still work', async () => {
    // The guard compares whole path components, so none of these is affected —
    // and `.github/workflows` in particular is a thing real GitOps repos push.
    const result = await pushRepo(
      clone,
      [
        { path: '.gitignore', content: 'node_modules\n' },
        { path: '.github/workflows/ci.yaml', content: 'name: ci\n' },
        { path: '.gitops/apps/app.yaml', content: 'kind: ConfigMap\n' },
        { path: 'apps/gitconfig', content: 'not a config\n' },
        { path: 'apps/my.git.yaml', content: 'kind: ConfigMap\n' },
      ],
      'feat: names near the git directory'
    );

    expect(result.commitSha).toBeTruthy();
    expect(result.filesAdded).toHaveLength(5);
    expect(fs.existsSync(marker)).toBe(false);
    expect(
      fs.readFileSync(path.join(clone, '.github/workflows/ci.yaml'), 'utf8')
    ).toBe('name: ci\n');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Finding B — a PAT used as the username was never scrubbed
// ───────────────────────────────────────────────────────────────────────────

describe('scrubCredentials — userinfo with no colon (finding B)', () => {
  test('masks a PAT used as the username', () => {
    // GitHub accepts a PAT as the username with no password at all, so this is a
    // WORKING credential — and it reached the log line, the session file and the
    // response body untouched.
    expect(
      scrubCredentials('https://ghp_PATSECRET@github.com/acme/demo.git')
    ).toBe('https://***@github.com/acme/demo.git');
    expect(
      scrubCredentials(
        'fatal: could not read https://github_pat_11ABCDE@github.com/acme/demo.git/info/refs'
      )
    ).toBe(
      'fatal: could not read https://***@github.com/acme/demo.git/info/refs'
    );
    expect(
      scrubCredentials('https://glpat-ABCDEF@gitlab.corp/team/x.git')
    ).toBe('https://***@gitlab.corp/team/x.git');
  });

  test('leaves the one universally non-secret userinfo readable', () => {
    // `git` is the userinfo of every ssh remote and can never be a credential —
    // masking it would only make error messages harder to diagnose.
    expect(scrubCredentials('ssh://git@github.com/acme/demo.git')).toBe(
      'ssh://git@github.com/acme/demo.git'
    );
    // Case-insensitively, and only when it is the WHOLE userinfo.
    expect(scrubCredentials('ssh://GIT@github.com/acme/demo.git')).toBe(
      'ssh://GIT@github.com/acme/demo.git'
    );
    expect(scrubCredentials('ssh://gitlab-ci-token@gitlab.corp/x.git')).toBe(
      'ssh://***@gitlab.corp/x.git'
    );
  });

  test('does not regress what was already scrubbed', () => {
    expect(
      scrubCredentials('https://x-access-token:ghs_secret@github.com/acme/demo')
    ).toBe('https://***@github.com/acme/demo');
    expect(
      scrubCredentials('fatal: https://user:s3cr3t@gitlab.corp/team/x.git')
    ).toBe('fatal: https://***@gitlab.corp/team/x.git');
    expect(scrubCredentials('https://user:pa:ss@host/r')).toBe(
      'https://***@host/r'
    );
  });

  test('leaves credential-free text alone', () => {
    for (const text of [
      'https://github.com:443/acme/demo.git',
      'https://github.com/acme/demo.git',
      'file:///tmp/unit/acme/demo.git',
      'git@github.com:acme/demo.git', // scp-style: no `//`, so no userinfo span
      'see https://cdn.example.test/a/b.css and color:#fff',
      'user@example.com wrote in',
    ]) {
      expect(scrubCredentials(text)).toBe(text);
    }
  });

  test('is linear on adversarial input', () => {
    // The whole function runs on text this module never produced and does not
    // bound (git stderr, a proxy's HTML error page). A previous version was a
    // catastrophic-backtracking ReDoS: 110 KB took 64 s of synchronous CPU.
    const cases = [
      // Many `//` spans, no `@` anywhere — the shape that used to blow up.
      'see https://cdn.example.test/a/b/c.css style="color:#fff;margin:0" '.repeat(
        3_000
      ),
      // One enormous userinfo-shaped run that never terminates in `@`.
      `https://${'A'.repeat(200_000)}`,
      // Alternating `//` and `:` with the `@` only at the very end.
      `${'//user:pass'.repeat(20_000)}@host`,
    ];

    for (const input of cases) {
      const started = performance.now();
      scrubCredentials(input);
      expect(performance.now() - started).toBeLessThan(500);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Finding C — repository host allowlist
// ───────────────────────────────────────────────────────────────────────────

describe('repository host allowlist (finding C)', () => {
  beforeEach(() => {
    delete process.env[ALLOWED_REPO_HOSTS_ENV];
  });

  test('defaults to github.com when the env var is absent', () => {
    // Absent is NOT "allow everything": a deployment that predates the chart
    // value, or a server started outside the chart, gets the secure default.
    expect(getAllowedRepoHosts()).toEqual(['github.com']);
    expect(isRepoHostAllowed('https://github.com/acme/demo.git')).toBe(true);
    expect(isRepoHostAllowed('https://attacker.example/x.git')).toBe(false);
  });

  test('an explicitly EMPTY list denies everything', () => {
    // The one thing it must never mean is "allow everything".
    process.env[ALLOWED_REPO_HOSTS_ENV] = '';
    expect(getAllowedRepoHosts()).toEqual([]);
    expect(isRepoHostAllowed('https://github.com/acme/demo.git')).toBe(false);
    expect(isRepoHostAllowed('https://attacker.example/x.git')).toBe(false);
  });

  test('honours a configured list, trimming and lowercasing entries', () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = ' GitLab.Corp , github.com ,,';
    expect(getAllowedRepoHosts()).toEqual(['gitlab.corp', 'github.com']);
    expect(isRepoHostAllowed('https://gitlab.corp/team/x.git')).toBe(true);
    expect(isRepoHostAllowed('https://GITLAB.CORP/team/x.git')).toBe(true);
    expect(isRepoHostAllowed('https://bitbucket.org/team/x.git')).toBe(false);
  });

  test('an entry written with a port still matches the host', () => {
    // The token reaches the HOST whichever port answers, so port granularity
    // would buy no safety while silently failing the operator who wrote one.
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'gitlab.corp:8443';
    expect(getAllowedRepoHosts()).toEqual(['gitlab.corp']);
    expect(isRepoHostAllowed('https://gitlab.corp:8443/team/x.git')).toBe(true);
    expect(isRepoHostAllowed('https://gitlab.corp/team/x.git')).toBe(true);
    expect(isRepoHostAllowed('https://other.corp:8443/team/x.git')).toBe(false);
  });

  test('compares the parsed hostname, never a substring', () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    for (const url of [
      // The shapes a substring match would wave through.
      'https://attacker.example/github.com/victim/private.git',
      'https://notgithub.com/acme/demo.git',
      'https://github.com.evil.test/acme/demo.git',
      'https://attacker.example/?x=github.com',
      'https://attacker.example/#github.com',
      // Userinfo cannot smuggle the host either.
      'https://github.com@attacker.example/x.git',
      'https://github.com:tok@attacker.example/x.git',
    ]) {
      expect(isRepoHostAllowed(url)).toBe(false);
    }
    // A port does not change WHOSE host it is.
    expect(isRepoHostAllowed('https://github.com:443/acme/demo.git')).toBe(
      true
    );
  });

  test('only https may carry the credential, whatever the host', () => {
    // The gate used to be host-only, so every one of these named an ALLOWED host
    // and reached getAuthenticatedUrl, which embedded the token: `http://` made
    // it basic-auth material on a cleartext request, and `ssh://` had git pass
    // `x-access-token:<token>` as the SSH username. pushToGit's schema already
    // said HTTPS — this makes that contract real.
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    for (const url of [
      'http://github.com/acme/demo.git',
      'HTTP://github.com/acme/demo.git',
      'ssh://github.com/acme/demo.git',
      'git://github.com/acme/demo.git',
      'ftp://github.com/acme/demo.git',
      // scp-style shorthand: a real remote form, but not an https URL.
      'git@github.com:acme/demo.git',
      'github.com:acme/demo.git',
      // file:// has no host to allowlist, so it was already denied — and WHATWG
      // URL refuses userinfo on it, so it never could have carried a token.
      'file:///tmp/unit/acme/demo.git',
    ]) {
      expect(isRepoHostAllowed(url)).toBe(false);
    }
    expect(isRepoHostAllowed('https://github.com/acme/demo.git')).toBe(true);
    // Case in the scheme is not significant to a URL, and must not be here.
    expect(isRepoHostAllowed('HTTPS://github.com/acme/demo.git')).toBe(true);
  });

  test('a refused SCHEME is reported as a scheme problem, not as a host one', () => {
    // "host github.com is not allowed. Currently allowed: github.com" would send
    // an operator to change the chart value that is already correct.
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    const message = describeDisallowedRepoHost('http://github.com/acme/x.git');
    expect(message).toContain('"http://" is not allowed');
    expect(message).toContain('https://');
    expect(message).not.toContain('gitops.allowedRepoHosts');

    // The scp-style shorthand has no scheme to name, so it is described by shape.
    expect(describeDisallowedRepoHost('git@github.com:acme/x.git')).toMatch(
      /scp-style/
    );

    // A disallowed host over https is still a host problem.
    expect(
      describeDisallowedRepoHost('https://attacker.example/x.git')
    ).toContain('gitops.allowedRepoHosts');
  });

  test('an unparseable remote is rejected, not waved through', () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    for (const url of ['', '   ', 'not a url at all', 'https://']) {
      expect(isRepoHostAllowed(url)).toBe(false);
    }
  });

  test('the rejection message names the host and the value to change', () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    const message = describeDisallowedRepoHost(
      'https://attacker.example/x.git'
    );
    expect(message).toContain('attacker.example');
    expect(message).toContain('gitops.allowedRepoHosts');
    expect(message).toContain('github.com');
  });

  test('the rejection message never echoes a credential from the URL', () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    const message = describeDisallowedRepoHost(
      'https://ghp_PATSECRET@attacker.example/x.git'
    );
    expect(message).not.toContain('ghp_PATSECRET');
  });

  test('a MISSING url is reported as missing, not as a disallowed host', () => {
    // The stage dispatch defaults an omitted repoUrl to '', which reaches the
    // same gate — "host … is not allowed" would point at the wrong problem.
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    const message = describeDisallowedRepoHost('');
    expect(message).toMatch(/No repository URL was supplied/);
    expect(message).not.toMatch(/is not allowed/);
  });

  test('an unparseable but non-empty url says the host could not be parsed', () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    expect(describeDisallowedRepoHost('not a url at all')).toMatch(
      /does not name a host/
    );
  });

  test('an empty allowlist says so rather than listing nothing', () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = '';
    const message = describeDisallowedRepoHost('https://github.com/acme/x.git');
    expect(message).toContain('github.com');
    expect(message).toContain('gitops.allowedRepoHosts');
    expect(message).toMatch(/empty/i);
  });

  test('the cause classifier and the gate are the same decision', () => {
    // Every explanation of a refusal is derived from the classifier, so a URL
    // the gate refuses must always have a cause to name, and one it allows must
    // never produce one. Drift here is how a scheme refusal came to be
    // explained as a host refusal on the prompts path.
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    for (const url of [
      'https://github.com/acme/x.git',
      'https://GitHub.com:443/acme/x.git',
      'https://attacker.example/x.git',
      'https://github.com@attacker.example/x.git',
      'http://github.com/acme/x.git',
      'ssh://github.com/acme/x.git',
      'git@github.com:acme/x.git',
      'file:///tmp/unit/x.git',
      'not a url at all',
      'https://',
      '',
      '   ',
    ]) {
      expect(classifyRepoCredentialRefusal(url) === undefined).toBe(
        isRepoHostAllowed(url)
      );
    }
  });

  test('the classifier names which half refused, and what a message needs', () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';
    expect(classifyRepoCredentialRefusal('')).toEqual({ cause: 'no-url' });
    expect(
      classifyRepoCredentialRefusal('http://github.com/acme/x.git')
    ).toEqual({ cause: 'scheme', scheme: 'http:' });
    expect(classifyRepoCredentialRefusal('git@github.com:acme/x.git')).toEqual({
      cause: 'shorthand',
    });
    expect(
      classifyRepoCredentialRefusal('https://attacker.example/x.git')
    ).toEqual({ cause: 'host', host: 'attacker.example' });
    expect(classifyRepoCredentialRefusal('not a url at all')).toEqual({
      cause: 'unparseable',
    });
    expect(
      classifyRepoCredentialRefusal('https://github.com/acme/x.git')
    ).toBeUndefined();
  });

  test('the suggested actions point at the fix for THAT cause', () => {
    process.env[ALLOWED_REPO_HOSTS_ENV] = 'github.com';

    // A scheme refusal is the caller's to fix, so the operator action — and the
    // chart value that is already correct — must not appear.
    const scheme = suggestedActionsForDisallowedRepo(
      'http://github.com/acme/x.git'
    ).join(' | ');
    expect(scheme).toContain('https://');
    expect(scheme).not.toContain('gitops.allowedRepoHosts');
    expect(
      suggestedActionsForDisallowedRepo('git@github.com:acme/x.git')[0]
    ).toContain('https://');

    // A host refusal keeps both of the actions it always had.
    expect(
      suggestedActionsForDisallowedRepo('https://attacker.example/x.git')
    ).toEqual([
      'Push to a repository on an allowed host',
      'Ask your platform operator to add the host to the gitops.allowedRepoHosts Helm value',
    ]);

    // The remaining two causes are client-side input problems, not allowlist
    // ones either.
    for (const url of ['', 'not a url at all']) {
      const advice = suggestedActionsForDisallowedRepo(url).join(' | ');
      expect(advice).toContain('repoUrl');
      expect(advice).not.toContain('gitops.allowedRepoHosts');
    }
  });
});
