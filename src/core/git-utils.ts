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

import simpleGit, { SimpleGitOptions } from 'simple-git';
import { spawn } from 'node:child_process';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const FETCH_TIMEOUT_MS = 30000;
const GIT_TIMEOUT_MS = 120000; // 2 minutes for git operations

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

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`git clone timed out after ${GIT_TIMEOUT_MS}ms`));
      }, GIT_TIMEOUT_MS);
      child.stderr?.on('data', chunk => {
        stderr += chunk.toString();
      });
      child.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          // stderr carries only the username-only URL (no token), so it is safe
          // to surface; the caller scrubs it again as defense-in-depth.
          reject(
            new Error(`git clone exited with code ${code}: ${stderr.trim()}`)
          );
        }
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

  await git.add(files.map(f => f.path));

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
    return {
      commitSha: undefined,
      branch: (await git.status()).current || 'main',
      filesAdded: [],
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
