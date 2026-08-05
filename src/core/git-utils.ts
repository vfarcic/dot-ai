/**
 * Git Utilities
 *
 * Shared git operations for the MCP server layer.
 * Provides authenticated clone, pull, and push using simple-git.
 *
 * PRD #362: Git Operations for Recommend Tool
 *
 * Environment variables:
 * - DOT_AI_GIT_TOKEN: PAT authentication token
 * - GITHUB_APP_ENABLED: Enable GitHub App authentication
 * - GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID: GitHub App config
 */

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { spawn } from 'node:child_process';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const FETCH_TIMEOUT_MS = 30000;
const GIT_TIMEOUT_MS = 120000; // 2 minutes for git operations

/**
 * Cap on how much of a GitHub API error body is echoed back to the caller. The
 * body is a third party's response text, so it is scrubbed and bounded rather
 * than forwarded wholesale.
 */
const MAX_API_ERROR_BODY_CHARS = 500;

/** The only host whose pull request API this module speaks (PRD #710 decision 7). */
const GITHUB_HOST = 'github.com';

/**
 * User-Agent sent to the GitHub API when a caller of createPullRequest() does
 * not supply one. Callers pass their own so the API log identifies the feature
 * that opened the PR.
 */
const DEFAULT_PR_USER_AGENT = 'dot-ai';

/**
 * Environment variable name through which a per-request override credential
 * (PRD #621 M3) is handed to the GIT_ASKPASS helper. The token travels in the
 * git child process's ENVIRONMENT — never on its argv (ps/proc) and never
 * embedded in the clone URL written to `.git/config`.
 */
export const ASKPASS_TOKEN_ENV = 'DOT_AI_GIT_ASKPASS_TOKEN';

/**
 * Environment variable naming the host the override token is bound to. The
 * GIT_ASKPASS helper emits the token ONLY when git's credential prompt names
 * this host, so a cross-host HTTP redirect can never obtain it (Decision 3).
 */
export const ASKPASS_HOST_ENV = 'DOT_AI_GIT_ASKPASS_HOST';

// ─── Auth types ───

export interface GitAuthConfig {
  pat?: string;
  githubApp?: {
    appId: string;
    privateKey: string;
    installationId?: string;
  };
}

interface GitHubAppToken {
  token: string;
  expiresAt: string;
}

// ─── Auth helpers ───

export function scrubCredentials(message: string): string {
  return message
    .replace(/\/\/x-access-token:[^@]+@/g, '//***@')
    .replace(/\/\/[^/:][^@]*:[^@]+@/g, '//***@');
}

export function getAuthenticatedUrl(repoUrl: string, token: string): string {
  const url = new URL(repoUrl);
  url.username = 'x-access-token';
  url.password = token;
  return url.toString();
}

/**
 * The single HTTP entry point for this module — the GitHub App token endpoints
 * and the pull request POST all go through it, so there is one timeout
 * mechanism and one default rather than two of each (CLAUDE.md rule 4).
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

function generateGitHubAppJWT(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 10 * 60, iss: appId },
    privateKey,
    { algorithm: 'RS256' }
  );
}

async function getGitHubAppInstallationToken(
  appId: string,
  privateKey: string,
  installationId?: string
): Promise<GitHubAppToken> {
  const appJWT = generateGitHubAppJWT(appId, privateKey);

  let installId = installationId;
  if (!installId) {
    const resp = await fetchWithTimeout(
      'https://api.github.com/app/installations',
      {
        headers: {
          Authorization: `Bearer ${appJWT}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    if (!resp.ok) {
      throw new Error(`Failed to list installations: ${resp.statusText}`);
    }
    const installations = (await resp.json()) as Array<{ id: number }>;
    if (installations.length === 0) {
      throw new Error('No GitHub App installations found');
    }
    installId = String(installations[0].id);
  }

  const tokenResp = await fetchWithTimeout(
    `https://api.github.com/app/installations/${installId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJWT}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );
  if (!tokenResp.ok) {
    throw new Error(
      `Failed to get installation token: ${tokenResp.statusText}`
    );
  }
  const data = (await tokenResp.json()) as {
    token: string;
    expires_at: string;
  };
  return { token: data.token, expiresAt: data.expires_at };
}

export async function getAuthToken(authConfig: GitAuthConfig): Promise<string> {
  if (authConfig.pat) return authConfig.pat;
  if (authConfig.githubApp) {
    const { appId, privateKey, installationId } = authConfig.githubApp;
    const tokenData = await getGitHubAppInstallationToken(
      appId,
      privateKey,
      installationId
    );
    return tokenData.token;
  }
  throw new Error(
    'No authentication method configured. Provide either PAT or GitHub App credentials.'
  );
}

export function getGitAuthConfigFromEnv(): GitAuthConfig {
  const pat = process.env.DOT_AI_GIT_TOKEN;
  const githubAppEnabled = process.env.GITHUB_APP_ENABLED === 'true';

  if (pat) return { pat };

  if (githubAppEnabled) {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
    if (!appId || !privateKey) {
      throw new Error(
        'GitHub App enabled but GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY not set'
      );
    }
    return {
      githubApp: {
        appId,
        privateKey: privateKey.replace(/\\n/g, '\n'),
        installationId,
      },
    };
  }

  return {};
}

// ─── Git options helper ───

function gitOptions(baseDir?: string): Partial<SimpleGitOptions> {
  return {
    baseDir: baseDir || process.cwd(),
    binary: 'git',
    maxConcurrentProcesses: 6,
    timeout: { block: GIT_TIMEOUT_MS },
  };
}

// ─── Path safety ───

/**
 * Sanitize a relative path to prevent directory traversal.
 * Rejects absolute paths and paths that escape the base directory.
 */
export function sanitizeRelativePath(relativePath: string): string {
  if (relativePath.startsWith('/')) {
    throw new Error('Relative path cannot be absolute');
  }
  const normalized = path.posix.normalize(relativePath);
  if (normalized.startsWith('..') || path.posix.isAbsolute(normalized)) {
    throw new Error('Relative path cannot escape target directory');
  }
  return normalized;
}

// ─── Clone ───

export interface CloneOptions {
  branch?: string;
  depth?: number;
  /**
   * Per-call git credential (PRD #621 M3). When supplied it OVERRIDES the
   * env/GitHub-App auth (`getGitAuthConfigFromEnv`) for this clone only
   * (Decision 4) and is scoped to the host in `repoUrl` with cross-host
   * redirect forwarding disabled (Decision 3 — see buildOverrideCloneAuth).
   * When omitted, the clone uses env auth exactly as before.
   */
  token?: string;
}

/**
 * PRD #621 M3 / Decision 3: build the clone URL + intended host for a
 * per-request override credential.
 *
 * The credential itself is NOT in the returned URL — it is the bare
 * `x-access-token` username only (the token is passed via a HOST-BOUND
 * GIT_ASKPASS helper, see cloneRepo / createAskpassScript). So the token never
 * lands on the git argv or in the cloned `.git/config` remote URL (MEDIUM-2/3).
 *
 * No `-c` git config is returned: the earlier `-c credential.helper=` was
 * REJECTED by simple-git's safety guard (allowUnsafeCredentialHelper), which
 * aborted the clone entirely; and `-c http.followRedirects=false` is dropped
 * per review finding R-1 (it blocked legitimate same-host redirects too). The
 * host-bound askpass makes following redirects provably safe — the token is
 * emitted ONLY for `host`, and libcurl already strips credentials on a
 * cross-host redirect by default.
 *
 * Returned as plain data so the auth decision is unit-testable without spawning
 * git. The token is intentionally NOT a parameter — it never influences this
 * (URL/argv) surface.
 */
export function buildOverrideCloneAuth(repoUrl: string): {
  cloneUrl: string;
  host: string;
} {
  const url = new URL(repoUrl);
  const host = url.host;
  url.username = 'x-access-token';
  url.password = '';
  return { cloneUrl: url.toString(), host };
}

/**
 * Create a throwaway, HOST-BOUND GIT_ASKPASS helper script. The script holds NO
 * secret — it echoes the token from the environment (ASKPASS_TOKEN_ENV) ONLY
 * when git's credential prompt (passed as $1) names the intended host
 * (ASKPASS_HOST_ENV), delimited by `@`/`//` before and a closing quote after.
 * For any other host — e.g. after an HTTP redirect, or a look-alike like
 * `github.com.evil.test` — it emits nothing, so the token can never reach a
 * different host (Decision 3). The token never touches disk. The script lives
 * in its own 0700 temp dir; `cleanup` removes it.
 */
function createAskpassScript(): { scriptPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ai-askpass-'));
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* best-effort hardening */
  }
  const scriptPath = path.join(dir, 'askpass.sh');
  // Host-bound match: require the intended host immediately after `@` or `//`
  // and immediately before the closing `'` git puts around the URL, so neither
  // a different redirect host nor a look-alike suffix matches.
  const script = [
    '#!/bin/sh',
    'case "$1" in',
    `  *"@$${ASKPASS_HOST_ENV}'"*|*"//$${ASKPASS_HOST_ENV}'"*)`,
    `    printf '%s\\n' "$${ASKPASS_TOKEN_ENV}"`,
    '    ;;',
    'esac',
    '',
  ].join('\n');
  fs.writeFileSync(scriptPath, script, { mode: 0o700 });
  return {
    scriptPath,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup; the script holds no secret */
      }
    },
  };
}

/**
 * PRD #621 M3: clone an OVERRIDE repo using a per-request token, via a
 * HOST-BOUND GIT_ASKPASS helper.
 *
 * This deliberately spawns `git` DIRECTLY rather than going through simple-git:
 * simple-git's safety scanner rejects the env vars this approach relies on
 * (GIT_ASKPASS → allowUnsafeAskPass) and even flags inherited vars like EDITOR
 * / PAGER, which aborts the clone before it starts. A direct spawn lets us pass
 * the full process.env (PATH/HOME/proxy/TLS) plus the askpass wiring with no
 * argument/env guard interference, while still keeping:
 *   - the token OFF the argv (the URL carries only the `x-access-token`
 *     username) and OUT of .git/config (MEDIUM-2/MEDIUM-3);
 *   - the token bound to the source host so a cross-host redirect can't obtain
 *     it (Decision 3 — host-bound askpass + libcurl's default cross-host
 *     credential stripping). Redirects are NOT disabled (review finding R-1),
 *     so legitimate same-host redirects still work.
 */
async function cloneWithOverrideToken(
  repoUrl: string,
  targetDir: string,
  opts: CloneOptions & { token: string }
): Promise<{ localPath: string; branch: string }> {
  const { cloneUrl, host } = buildOverrideCloneAuth(repoUrl);
  const askpass = createAskpassScript();

  const args = ['clone'];
  if (opts.branch) {
    args.push('--branch', opts.branch);
  }
  if (opts.depth) {
    args.push('--depth', String(opts.depth));
  }
  // `--` terminates option parsing so the URL/dir can never be read as flags.
  args.push('--', cloneUrl, targetDir);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_ASKPASS: askpass.scriptPath,
    // Never fall back to an interactive terminal prompt if askpass yields nothing.
    GIT_TERMINAL_PROMPT: '0',
    [ASKPASS_TOKEN_ENV]: opts.token,
    [ASKPASS_HOST_ENV]: host,
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('git', args, {
        env,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      // The 'error', 'close', and timeout handlers can each race to settle this
      // promise (e.g. 'close' still fires after a kill or a spawn 'error'). A
      // promise only settles once, but the LATER handlers would still run their
      // logic on an already-settled promise. Guard so the FIRST settle wins and
      // every subsequent handler is a no-op, and clear the timeout on settle so
      // no dangling timer fires afterwards.
      let settled = false;
      const timerRef: { id?: ReturnType<typeof setTimeout> } = {};
      const settle = (action: () => void): void => {
        if (settled) return;
        settled = true;
        if (timerRef.id) clearTimeout(timerRef.id);
        action();
      };

      timerRef.id = setTimeout(() => {
        settle(() => {
          child.kill('SIGKILL');
          reject(new Error(`git clone timed out after ${GIT_TIMEOUT_MS}ms`));
        });
      }, GIT_TIMEOUT_MS);
      child.stderr?.on('data', chunk => {
        stderr += chunk.toString();
      });
      child.on('error', err => {
        settle(() => reject(err));
      });
      child.on('close', code => {
        settle(() => {
          if (code === 0) {
            resolve();
          } else {
            // stderr carries only the username-only URL (no token), so it is
            // safe to surface; the caller scrubs it again as defense-in-depth.
            reject(
              new Error(`git clone exited with code ${code}: ${stderr.trim()}`)
            );
          }
        });
      });
    });
  } finally {
    // Remove the askpass helper as soon as the clone finishes (success or
    // failure). It holds no secret, but leaving temp files around is untidy.
    askpass.cleanup();
  }

  return { localPath: targetDir, branch: opts.branch || 'main' };
}

export async function cloneRepo(
  repoUrl: string,
  targetDir: string,
  opts?: CloneOptions
): Promise<{ localPath: string; branch: string }> {
  // PRD #621 M3 / Decision 4: a per-request override credential takes precedence
  // over env auth for THIS clone only and uses the host-bound GIT_ASKPASS path.
  if (opts?.token) {
    return cloneWithOverrideToken(repoUrl, targetDir, {
      ...opts,
      token: opts.token,
    });
  }

  // Env/GitHub-App auth path (unchanged): credentials come from
  // getGitAuthConfigFromEnv and are embedded in the URL as before.
  const authConfig = getGitAuthConfigFromEnv();
  let cloneUrl: string;
  if (authConfig.pat || authConfig.githubApp) {
    const token = await getAuthToken(authConfig);
    cloneUrl = getAuthenticatedUrl(repoUrl, token);
  } else {
    cloneUrl = repoUrl;
  }

  const git = simpleGit(gitOptions());

  const cloneOptions: string[] = [];
  if (opts?.branch) {
    cloneOptions.push('--branch', opts.branch);
  }
  if (opts?.depth) {
    cloneOptions.push('--depth', String(opts.depth));
  }

  await git.clone(cloneUrl, targetDir, cloneOptions);

  const repoGit = simpleGit(targetDir);
  const status = await repoGit.status();
  const branch = status.current || opts?.branch || 'main';

  return { localPath: targetDir, branch };
}

// ─── Pull ───

export async function pullRepo(repoPath: string): Promise<{ branch: string }> {
  const authConfig = getGitAuthConfigFromEnv();
  const hasAuth = !!(authConfig.pat || authConfig.githubApp);

  const git = simpleGit(gitOptions(repoPath));

  let originalOriginUrl: string | undefined;

  if (hasAuth) {
    const token = await getAuthToken(authConfig);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    originalOriginUrl = origin?.refs.fetch;

    if (originalOriginUrl) {
      const authUrl = getAuthenticatedUrl(originalOriginUrl, token);
      await git.remote(['set-url', 'origin', authUrl]);
    }
  }

  try {
    await git.pull('origin', undefined, ['--ff-only']);
    const status = await git.status();
    return { branch: status.current || 'main' };
  } finally {
    // Restore original origin URL to prevent auth tokens persisting in .git/config
    if (hasAuth && originalOriginUrl) {
      await git.remote(['set-url', 'origin', originalOriginUrl]);
    }
  }
}

// ─── Push ───

export interface PushOptions {
  branch?: string;
  author?: { name: string; email: string };
}

export interface PushResult {
  commitSha: string | undefined;
  branch: string;
  filesAdded: string[];
  /**
   * Why nothing was committed or pushed, set whenever `commitSha` is undefined
   * (PRD #710 M1). It exists so callers can tell the two cases apart instead of
   * inferring both from a missing sha:
   * - `nothing_staged` — a POSITIVE fact: `git diff --cached` came back empty,
   *   so the files already match HEAD and there was nothing to commit.
   * - `commit_failed` — the index DID hold staged changes but `git commit`
   *   produced no revision (e.g. a hook that fails with empty stderr, which
   *   simple-git resolves rather than rejects). That is a failure, not an
   *   empty diff, and must not be reported as "no changes".
   */
  noCommitReason?: 'nothing_staged' | 'commit_failed';
}

export async function pushRepo(
  repoPath: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string,
  opts?: PushOptions
): Promise<PushResult> {
  const git = simpleGit(gitOptions(repoPath));

  if (opts?.branch) {
    const branches = await git.branchLocal();
    if (!branches.all.includes(opts.branch)) {
      await git.checkoutLocalBranch(opts.branch);
    } else {
      await git.checkout(opts.branch);
    }
  }

  for (const file of files) {
    const repoRoot = path.resolve(repoPath);
    const fullPath = path.resolve(repoPath, file.path);
    if (!fullPath.startsWith(repoRoot + path.sep) && fullPath !== repoRoot) {
      throw new Error(
        `Path traversal detected: "${file.path}" attempts to write outside repository directory`
      );
    }
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, file.content);
  }

  // `--` terminates option parsing so a file named e.g. `--all` is read as a
  // pathspec and never as a git option (same house style as the clone above).
  await git.add(['--', ...files.map(f => f.path)]);

  // Decide "nothing to commit" POSITIVELY here, rather than letting the caller
  // infer it from a missing commit sha further down: `git commit` also yields no
  // sha when it FAILS with empty stderr, and the two outcomes are not the same
  // (PRD #710 M1).
  const stagedChanges = await git.diff(['--cached', '--name-only']);
  if (stagedChanges.trim().length === 0) {
    return {
      commitSha: undefined,
      branch: (await git.status()).current || 'main',
      filesAdded: [],
      noCommitReason: 'nothing_staged',
    };
  }

  const gitUserName =
    opts?.author?.name || process.env.GIT_AUTHOR_NAME || 'dot-ai-bot';
  const gitUserEmail =
    opts?.author?.email ||
    process.env.GIT_AUTHOR_EMAIL ||
    'dot-ai@users.noreply.github.com';
  await git.addConfig('user.name', gitUserName);
  await git.addConfig('user.email', gitUserEmail);

  const finalMessage = process.env.CI === 'true'
    ? `${commitMessage} [skip ci]`
    : commitMessage;
  const commitResult = await git.commit(finalMessage);

  if (!commitResult.commit) {
    // The index was not empty (checked above), so git had something to commit
    // and produced no revision anyway — a failure, not an empty diff.
    return {
      commitSha: undefined,
      branch: (await git.status()).current || 'main',
      filesAdded: [],
      noCommitReason: 'commit_failed',
    };
  }

  const authConfig = getGitAuthConfigFromEnv();
  const token = await getAuthToken(authConfig);
  const remotes = await git.getRemotes(true);
  const origin = remotes.find(r => r.name === 'origin');
  let originalOriginUrl: string | undefined;

  if (origin) {
    originalOriginUrl = origin.refs.fetch;
    const authUrl = getAuthenticatedUrl(originalOriginUrl, token);
    await git.remote(['set-url', 'origin', authUrl]);
  }

  try {
    const currentBranch = (await git.status()).current || 'main';
    await git.push('origin', currentBranch, ['--set-upstream']);
    return {
      commitSha: commitResult.commit,
      branch: currentBranch,
      filesAdded: files.map(f => f.path),
    };
  } finally {
    if (origin && originalOriginUrl) {
      await git.remote(['set-url', 'origin', originalOriginUrl]);
    }
  }
}

// ─── Pull request creation (PRD #710 M1) ───

export interface CreatePullRequestInput {
  /**
   * Absolute path to an existing checkout of the repository. Callers that
   * accept a client-supplied path are responsible for validating it BEFORE
   * calling (see validatePathWithinClones in internal-tools.ts).
   */
  repoPath: string;
  /** Files to write, add and commit onto the head branch. */
  files: Array<{ path: string; content: string }>;
  /** Commit message and pull request title. */
  title: string;
  /** Pull request body. Defaults to empty. */
  body?: string;
  /**
   * Head branch to create the commit on. Server-generated by every caller —
   * it must never come from a client parameter.
   */
  branchName: string;
  /** Base branch the pull request targets. Defaults to 'main'. */
  baseBranch?: string;
  /** User-Agent for the GitHub API call. Defaults to DEFAULT_PR_USER_AGENT. */
  userAgent?: string;
}

/**
 * Outcome of createPullRequest(). `status` is the discriminator: a caller must
 * never infer "PR created" from `success` alone, because two of the three
 * successful outcomes deliberately do NOT produce a pull request.
 */
export type CreatePullRequestResult =
  | {
      /** Branch pushed and a pull request opened. */
      status: 'created';
      success: true;
      prUrl: string;
      prNumber: number;
      branch: string;
      baseBranch: string;
      filesChanged: string[];
    }
  | {
      /**
       * The files already match the base branch, so the commit was empty.
       * Nothing was pushed and no pull request exists (PRD #710 decision 3).
       */
      status: 'no_changes';
      success: true;
      branch: string;
      baseBranch: string;
      filesChanged: string[];
      message: string;
    }
  | {
      /**
       * The branch WAS pushed but no pull request was opened, because the
       * remote is not github.com. GitLab/Bitbucket/GHES are out of scope
       * (PRD #710 decision 7); the caller must surface this as an incomplete
       * outcome needing a manual PR/MR.
       */
      status: 'pushed_without_pr';
      success: true;
      branch: string;
      baseBranch: string;
      filesChanged: string[];
      error: string;
    }
  | {
      /** Nothing usable happened. `error` is credential-scrubbed. */
      status: 'failed';
      success: false;
      error: string;
    };

/**
 * Split a git remote URL into host and path, covering both forms git accepts:
 * a real URL (`https://…`, `ssh://…`, `file://…`) and the scp-like
 * `[user@]host:path` shorthand, which `new URL` either rejects outright
 * (`git@github.com:o/r.git`) or silently misreads as a scheme
 * (`github.com:o/r.git` → protocol `github.com:`, empty host).
 */
function splitRemoteUrl(
  remoteUrl: string
): { host: string; path: string } | undefined {
  const trimmed = remoteUrl.trim();

  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      // hostname, not host: a port is irrelevant to WHOSE host this is, and
      // `new URL` keeps any embedded credentials out of it.
      return { host: url.hostname, path: url.pathname };
    } catch {
      return undefined;
    }
  }

  const scp = trimmed.match(/^(?:[^@/]+@)?([^@/:]+):(.+)$/);
  if (!scp) return undefined;
  return { host: scp[1], path: `/${scp[2]}` };
}

/** GitHub owner logins and repository names use exactly this character set. */
const GITHUB_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * `{ owner, repo }` when `remoteUrl` points at github.com, undefined for any
 * other host — so the caller falls into the non-GitHub branch.
 *
 * The host is decided by PARSING the URL and comparing the hostname exactly.
 * Searching the string for `github.com` instead — what this replaces — also
 * accepts `https://evil.example/github.com/victim/private.git` (→ victim/private)
 * and `https://notgithub.com/owner/repo.git` (→ owner/repo), which would send an
 * authenticated POST for an attacker-chosen owner/repo. The token itself cannot
 * reach the attacker's host (the API URL is a hardcoded api.github.com template),
 * but the API's differing answers would form an existence-and-access oracle for
 * private repositories the server's credential can reach.
 *
 * Anything that is not exactly `<owner>/<repo>` on that host is rejected, which
 * also rules out traversal segments in the owner/repo the API URL is built from.
 */
export function parseGitHubRemote(
  remoteUrl: string
): { owner: string; repo: string } | undefined {
  const split = splitRemoteUrl(remoteUrl);
  if (!split || split.host.toLowerCase() !== GITHUB_HOST) return undefined;

  const segments = split.path.replace(/^\/+/, '').split('/');
  if (segments.length !== 2) return undefined;

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, '');
  if (!GITHUB_NAME_PATTERN.test(owner) || !GITHUB_NAME_PATTERN.test(repo)) {
    return undefined;
  }
  return { owner, repo };
}

/**
 * True when `ref` resolves in this repository. `rev-parse --verify --quiet`
 * exits 1 with EMPTY output for a missing ref, and simple-git resolves rather
 * than throws on that, so the output — not the absence of an exception — is
 * what decides.
 */
async function refExists(git: SimpleGit, ref: string): Promise<boolean> {
  try {
    const sha = await git.raw(['rev-parse', '--verify', '--quiet', ref]);
    return sha.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Run `fn` with origin temporarily rewritten to an authenticated URL, then
 * restore it — the same pattern pushRepo/pullRepo use, so a token never
 * persists in .git/config. Falls through unchanged when no env credential is
 * configured or the remote URL cannot carry one (e.g. an SSH remote).
 */
async function withAuthenticatedOrigin<T>(
  git: SimpleGit,
  fn: () => Promise<T>
): Promise<T> {
  const authConfig = getGitAuthConfigFromEnv();
  if (!authConfig.pat && !authConfig.githubApp) return fn();

  const remotes = await git.getRemotes(true);
  const originalUrl = remotes.find(r => r.name === 'origin')?.refs.fetch;
  if (!originalUrl) return fn();

  let authUrl: string;
  try {
    const token = await getAuthToken(authConfig);
    authUrl = getAuthenticatedUrl(originalUrl, token);
  } catch {
    return fn();
  }

  await git.remote(['set-url', 'origin', authUrl]);
  try {
    return await fn();
  } finally {
    try {
      await git.remote(['set-url', 'origin', originalUrl]);
    } catch {
      // Never let a failing restore REPLACE fn()'s error — that error is the one
      // the caller needs in order to understand what went wrong. The token then
      // stays in this checkout's .git/config, which is the lesser harm: the
      // clone is a throwaway, and losing the real error is not recoverable.
    }
  }
}

/**
 * Check out `baseBranch`, fetching it from origin when this clone does not have
 * it (PRD #710 decision 10).
 *
 * A shallow single-branch clone — what remediate's git_clone produces
 * (`depth: 1`, no `--branch`) — contains only the default branch's ref, so a
 * plain `git checkout <non-default base>` fails. Fetching just that one ref at
 * depth 1 makes the helper independent of how the caller cloned.
 *
 * Three arms, in order: a local branch of that name is checked out as-is; an
 * existing `refs/remotes/origin/<base>` is used WITHOUT being refreshed (see
 * createPullRequest's contract note); otherwise that one ref is fetched.
 *
 * `baseBranch` must name a BRANCH: the fetch refspec is `+refs/heads/<base>`,
 * so a tag or a raw SHA cannot resolve here.
 */
async function checkoutBaseBranch(
  git: SimpleGit,
  baseBranch: string
): Promise<void> {
  const local = await git.branchLocal();
  if (local.all.includes(baseBranch)) {
    await git.checkout(baseBranch);
    return;
  }

  const remoteRef = `refs/remotes/origin/${baseBranch}`;
  if (!(await refExists(git, remoteRef))) {
    await withAuthenticatedOrigin(git, () =>
      git.fetch([
        '--depth',
        '1',
        'origin',
        `+refs/heads/${baseBranch}:${remoteRef}`,
      ])
    );
  }
  await git.checkout(['-B', baseBranch, remoteRef]);
}

/**
 * Create a pull request from a set of file changes.
 *
 * Shared by remediate's `git_create_pr` internal tool and (from PRD #710 M2)
 * `pushToGit`'s PR mode. The steps are: check out the base branch → write,
 * commit and push the files onto `branchName` → resolve the `origin` remote →
 * `POST /repos/{owner}/{repo}/pulls`.
 *
 * Assumptions about the checkout:
 * - `repoPath` is an existing clone with an `origin` remote. Path validation is
 *   the caller's job — this helper applies none.
 * - The base branch does NOT need to be present locally or checked out; it is
 *   fetched when missing (decision 10). A shallow clone is fine.
 * - Credentials come from the environment (`getGitAuthConfigFromEnv`), for both
 *   the push and the GitHub API call.
 * - `branchName` must be a non-empty branch name different from `baseBranch`,
 *   and is server-generated by every caller — never a client parameter.
 *
 * Two contract points worth knowing before adding a third caller:
 * - When `refs/remotes/origin/<baseBranch>` is ALREADY present, it is used as of
 *   the clone — nothing is re-fetched — so the pull request is based on however
 *   stale that ref is. Harmless for the current callers (remediate clones fresh
 *   at depth 1; pushToGit clones with `--branch <base>`); a caller reusing a
 *   long-lived checkout must pull it itself.
 * - `baseBranch` is strictly a BRANCH. A tag or SHA used to work by accident
 *   (the old `git.checkout(<sha>)` produced a detached HEAD); it now takes the
 *   `+refs/heads/<x>` fetch path and returns `failed`. That is deliberate:
 *   remediate derives the base from an Argo CD `targetRevision`, which is not
 *   always a branch, and a clean `failed` beats a confusing checkout error.
 *
 * Never throws for an expected failure — every outcome is a
 * CreatePullRequestResult, discriminated by `status`:
 * - `created` — branch pushed, PR opened.
 * - `no_changes` — there was nothing to commit, so nothing was pushed and no PR
 *   was opened (decision 3). Without this check the GitHub API is asked to open
 *   a PR for a head branch that never reached the remote and answers 422. It is
 *   reported only when the index is verifiably empty, never inferred from a
 *   commit that produced no revision — that is a `failed`.
 * - `pushed_without_pr` — non-GitHub remote: the branch IS on the remote but a
 *   PR/MR must be opened manually (decision 7).
 * - `failed` — validation (a missing head branch, or one equal to the base), git,
 *   or GitHub API failure. Messages are scrubbed of credentials.
 */
export async function createPullRequest(
  input: CreatePullRequestInput
): Promise<CreatePullRequestResult> {
  const {
    repoPath,
    files,
    title,
    body = '',
    branchName,
    userAgent = DEFAULT_PR_USER_AGENT,
  } = input;
  const baseBranch = input.baseBranch || 'main';

  // Validate the head branch BEFORE anything is checked out. pushRepo skips
  // branch creation entirely for a falsy `branch`, and checks out an existing
  // branch when the name already exists — so either of these would commit and
  // push onto the base branch that checkoutBaseBranch just checked out, i.e.
  // write the protected branch (the one thing PR mode must never do, PRD #710
  // success criterion 1), and only THEN collect a 422 from the GitHub API for
  // an empty or self-referencing `head`. Neither is reachable from today's
  // callers; the guarantee should rest on a check, not on two names not
  // coinciding.
  if (!branchName) {
    return {
      status: 'failed',
      success: false,
      error:
        'branchName is required: a pull request needs a head branch to push the changes to',
    };
  }
  if (branchName === baseBranch) {
    return {
      status: 'failed',
      success: false,
      error: `branchName must differ from baseBranch ("${baseBranch}"): a pull request cannot be opened from a branch onto itself, and pushing to it would write the base branch directly`,
    };
  }

  try {
    const git = simpleGit(gitOptions(repoPath));

    await checkoutBaseBranch(git, baseBranch);

    const pushResult = await pushRepo(repoPath, files, title, {
      branch: branchName,
    });

    // pushRepo returns WITHOUT pushing when there was nothing to commit, so the
    // head branch does not exist on the remote and no PR can reference it. The
    // reason is explicit: an empty index is "no changes", a commit that failed
    // despite a non-empty index is a failure and must not read as "no changes".
    if (!pushResult.commitSha) {
      if (pushResult.noCommitReason === 'commit_failed') {
        return {
          status: 'failed',
          success: false,
          error:
            'Commit produced no revision even though the changes were staged — a commit hook may have rejected it. Nothing was pushed and no pull request was created.',
        };
      }
      return {
        status: 'no_changes',
        success: true,
        branch: branchName,
        baseBranch,
        filesChanged: [],
        message: `No changes to propose: the files already match ${baseBranch}. Nothing was pushed and no pull request was created.`,
      };
    }

    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin?.refs?.fetch) {
      return {
        status: 'failed',
        success: false,
        error: 'Could not find origin remote URL',
      };
    }
    const gitHubRepo = parseGitHubRemote(origin.refs.fetch);
    if (!gitHubRepo) {
      return {
        status: 'pushed_without_pr',
        success: true,
        branch: branchName,
        baseBranch,
        filesChanged: pushResult.filesAdded,
        error:
          'Automatic PR creation is only supported for GitHub repositories. Changes were pushed to the branch — create a PR/MR manually.',
      };
    }

    // Minted only now that the remote is known to be GitHub: a GitLab remote
    // should not mint an installation token it will never use.
    const token = await getAuthToken(getGitAuthConfigFromEnv());

    const prResponse = await fetchWithTimeout(
      `https://api.github.com/repos/${gitHubRepo.owner}/${gitHubRepo.repo}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
          'User-Agent': userAgent,
        },
        body: JSON.stringify({
          title,
          body,
          head: branchName,
          base: baseBranch,
          // Test-only switch: integration tests set this so PRs they create
          // don't trigger CodeRabbit (which has drafts: false in .coderabbit.yaml).
          // Production never sets this env var.
          ...(process.env.DOT_AI_GIT_CREATE_DRAFT_PRS === 'true' && {
            draft: true,
          }),
        }),
      }
    );

    if (!prResponse.ok) {
      // A third party's response text: scrub it like every other message this
      // helper returns (the result type promises that) and cap it, so an
      // unexpectedly large body is not echoed back wholesale. Scrub first, then
      // truncate, so a credential cannot survive by straddling the cut.
      const scrubbedBody = scrubCredentials(await prResponse.text());
      const detail =
        scrubbedBody.length > MAX_API_ERROR_BODY_CHARS
          ? `${scrubbedBody.slice(0, MAX_API_ERROR_BODY_CHARS)}… (truncated)`
          : scrubbedBody;
      return {
        status: 'failed',
        success: false,
        error: `GitHub API error (${prResponse.status}): ${detail}`,
      };
    }

    const prData = (await prResponse.json()) as {
      html_url: string;
      number: number;
    };

    return {
      status: 'created',
      success: true,
      prUrl: prData.html_url,
      prNumber: prData.number,
      branch: branchName,
      baseBranch,
      filesChanged: pushResult.filesAdded,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      success: false,
      error: scrubCredentials(message),
    };
  }
}
