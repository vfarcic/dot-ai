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

const FETCH_TIMEOUT_MS = 30000;
const GIT_TIMEOUT_MS = 120000; // 2 minutes for git operations

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

// ─── Clone ───

export interface CloneOptions {
  branch?: string;
  depth?: number;
}

export async function cloneRepo(
  repoUrl: string,
  targetDir: string,
  opts?: CloneOptions
): Promise<{ localPath: string; branch: string }> {
  const authConfig = getGitAuthConfigFromEnv();
  const token = await getAuthToken(authConfig);
  const authUrl = getAuthenticatedUrl(repoUrl, token);

  const git = simpleGit(gitOptions());

  const cloneOptions: string[] = [];
  if (opts?.branch) {
    cloneOptions.push('--branch', opts.branch);
  }
  if (opts?.depth) {
    cloneOptions.push('--depth', String(opts.depth));
  }

  await git.clone(authUrl, targetDir, cloneOptions);

  const repoGit = simpleGit(targetDir);
  const status = await repoGit.status();
  const branch = status.current || opts?.branch || 'main';

  return { localPath: targetDir, branch };
}

// ─── Pull ───

export async function pullRepo(
  repoPath: string
): Promise<{ branch: string }> {
  const authConfig = getGitAuthConfigFromEnv();
  const token = await getAuthToken(authConfig);

  const git = simpleGit(gitOptions(repoPath));

  const remotes = await git.getRemotes(true);
  const origin = remotes.find(r => r.name === 'origin');
  const originalOriginUrl = origin?.refs.fetch;

  if (originalOriginUrl) {
    const authUrl = getAuthenticatedUrl(originalOriginUrl, token);
    await git.remote(['set-url', 'origin', authUrl]);
  }

  try {
    await git.pull('origin', undefined, ['--ff-only']);
    const status = await git.status();
    return { branch: status.current || 'main' };
  } finally {
    // Restore original origin URL to prevent auth tokens persisting in .git/config
    if (originalOriginUrl) {
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

  const commitResult = await git.commit(commitMessage);

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
