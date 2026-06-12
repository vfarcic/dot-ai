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
 * URL carrying ONLY the `x-access-token` username (no password/token). This
 * scopes the credential to the host in `repoUrl` (URL userinfo is per-origin)
 * while keeping the secret OFF the URL — the token is supplied out-of-band via
 * GIT_ASKPASS, so it never lands on the git argv or in the cloned `.git/config`
 * remote URL (PRD #621 MEDIUM-2/MEDIUM-3).
 */
function getUsernameOnlyUrl(repoUrl: string): string {
  const url = new URL(repoUrl);
  url.username = 'x-access-token';
  url.password = '';
  return url.toString();
}

/**
 * PRD #621 M3 / Decision 3: build the clone URL + git config for a per-request
 * override credential.
 *
 * The credential itself is NOT in the returned URL — it is the bare
 * `x-access-token` username only (the token is passed via GIT_ASKPASS, see
 * cloneRepo). The git config additionally:
 *   - `http.followRedirects=false` — git must NOT follow an HTTP redirect, so a
 *     redirect can never cause the credential to be presented to a DIFFERENT
 *     host (the cross-host token-leak vector Decision 3 guards against). This is
 *     retained as a provable, defense-in-depth guarantee — see cloneRepo for
 *     why it is kept even with GIT_ASKPASS.
 *   - `credential.helper=` (empty) — resets the helper list so no system/user
 *     credential helper observes or persists the per-request secret (and git
 *     falls through to GIT_ASKPASS for the password).
 *
 * Returned as plain data so the auth/redirect decision is unit-testable without
 * spawning git. Note: the token is intentionally NOT a parameter — it never
 * influences this (URL/argv) surface.
 */
export function buildOverrideCloneAuth(repoUrl: string): {
  cloneUrl: string;
  configArgs: string[];
} {
  return {
    cloneUrl: getUsernameOnlyUrl(repoUrl),
    configArgs: [
      '-c',
      'http.followRedirects=false',
      '-c',
      'credential.helper=',
    ],
  };
}

/**
 * Create a throwaway GIT_ASKPASS helper script. The script is STATIC and holds
 * NO secret — it echoes the token from the environment (ASKPASS_TOKEN_ENV),
 * which git passes through to the spawned helper. The token therefore never
 * touches disk. The script lives in its own 0700 temp dir; `cleanup` removes it.
 */
function createAskpassScript(): { scriptPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ai-askpass-'));
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* best-effort hardening */
  }
  const scriptPath = path.join(dir, 'askpass.sh');
  fs.writeFileSync(
    scriptPath,
    `#!/bin/sh\nprintf '%s\\n' "$${ASKPASS_TOKEN_ENV}"\n`,
    { mode: 0o700 }
  );
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

export async function cloneRepo(
  repoUrl: string,
  targetDir: string,
  opts?: CloneOptions
): Promise<{ localPath: string; branch: string }> {
  let cloneUrl: string;
  // Git-level `-c key=value` flags that must precede other clone args.
  const configArgs: string[] = [];
  let askpass: { scriptPath: string; cleanup: () => void } | undefined;
  let envOverride: Record<string, string> | undefined;

  if (opts?.token) {
    // PRD #621 M3 / Decision 4: a per-request override credential takes
    // precedence over env auth for THIS clone only, scoped to the source host
    // with no cross-host redirect forwarding (Decision 3). The token is handed
    // to git via GIT_ASKPASS (in the child ENVIRONMENT), never on the argv or
    // in the clone URL — so it can't be read from ps/proc or persist in the
    // throwaway .git/config (MEDIUM-2/MEDIUM-3).
    const auth = buildOverrideCloneAuth(repoUrl);
    cloneUrl = auth.cloneUrl;
    configArgs.push(...auth.configArgs);
    askpass = createAskpassScript();
    envOverride = {
      // simple-git's .env(obj) REPLACES the child env, so carry process.env
      // through (PATH etc.) and layer the askpass wiring on top.
      ...(process.env as Record<string, string>),
      GIT_ASKPASS: askpass.scriptPath,
      // Never fall back to an interactive terminal prompt if askpass fails.
      GIT_TERMINAL_PROMPT: '0',
      [ASKPASS_TOKEN_ENV]: opts.token,
    };
  } else {
    const authConfig = getGitAuthConfigFromEnv();
    // Use authenticated URL if credentials are available, otherwise clone unauthenticated (public repos)
    if (authConfig.pat || authConfig.githubApp) {
      const token = await getAuthToken(authConfig);
      cloneUrl = getAuthenticatedUrl(repoUrl, token);
    } else {
      cloneUrl = repoUrl;
    }
  }

  try {
    let git = simpleGit(gitOptions());
    if (envOverride) {
      git = git.env(envOverride);
    }

    const cloneOptions: string[] = [...configArgs];
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
  } finally {
    // Remove the askpass helper as soon as the clone finishes (success or
    // failure). It holds no secret, but leaving temp files around is untidy.
    askpass?.cleanup();
  }
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
