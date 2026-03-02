/**
 * Git Operations Utility
 *
 * Provides git operations (clone, push) with support for:
 * - PAT (Personal Access Token) authentication
 * - GitHub App authentication (JWT + installation token)
 *
 * PRD #362: Git Operations for Recommend Tool
 */

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';

const TMP_DIR = './tmp';

function ensureTmpDir(): string {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  return TMP_DIR;
}

export interface GitAuthConfig {
  pat?: string;
  githubApp?: {
    appId: string;
    privateKey: string;
    installationId?: string;
  };
}

export interface GitCloneParams {
  repoUrl: string;
  branch?: string;
  targetDir?: string;
  depth?: number;
}

export interface GitCloneResult {
  success: boolean;
  localPath: string;
  branch: string;
  error?: string;
}

export interface GitPushParams {
  repoPath: string;
  files: Array<{
    path: string;
    content: string;
  }>;
  commitMessage: string;
  branch?: string;
  author?: {
    name: string;
    email: string;
  };
}

export interface GitPushResult {
  success: boolean;
  commitSha?: string;
  branch: string;
  filesAdded: string[];
  error?: string;
}

export interface GitHubAppToken {
  token: string;
  expiresAt: string;
}

/**
 * GitOperations class handles git operations with multiple auth methods
 */
export class GitOperations {
  private authConfig: GitAuthConfig;
  private logger: Console;
  private readonly fetchTimeoutMs = 30000;

  constructor(authConfig: GitAuthConfig) {
    this.authConfig = authConfig;
    this.logger = console;
  }

  /**
   * Fetch with timeout to prevent indefinite hangs
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = this.fetchTimeoutMs
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get authenticated URL with embedded credentials
   */
  private getAuthenticatedUrl(repoUrl: string, token: string): string {
    const url = new URL(repoUrl);
    url.username = 'x-access-token';
    url.password = token;
    return url.toString();
  }

  /**
   * Generate JWT for GitHub App authentication
   */
  private generateGitHubAppJWT(appId: string, privateKey: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60,
      exp: now + 10 * 60,
      iss: appId,
    };
    return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
  }

  /**
   * Get installation access token for GitHub App
   */
  private async getGitHubAppInstallationToken(
    appId: string,
    privateKey: string,
    installationId?: string
  ): Promise<GitHubAppToken> {
    const appJWT = this.generateGitHubAppJWT(appId, privateKey);

    let installId = installationId;

    if (!installId) {
      const installationsResponse = await this.fetchWithTimeout(
        'https://api.github.com/app/installations',
        {
          headers: {
            Authorization: `Bearer ${appJWT}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!installationsResponse.ok) {
        throw new Error(
          `Failed to list installations: ${installationsResponse.statusText}`
        );
      }

      const installations = (await installationsResponse.json()) as Array<{
        id: number;
      }>;
      if (installations.length === 0) {
        throw new Error('No GitHub App installations found');
      }

      installId = String(installations[0].id);
    }

    const tokenResponse = await this.fetchWithTimeout(
      `https://api.github.com/app/installations/${installId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${appJWT}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(
        `Failed to get installation token: ${tokenResponse.statusText}`
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      token: string;
      expires_at: string;
    };
    return {
      token: tokenData.token,
      expiresAt: tokenData.expires_at,
    };
  }

  /**
   * Get authentication token (PAT or GitHub App)
   */
  private async getAuthToken(): Promise<string> {
    if (this.authConfig.pat) {
      return this.authConfig.pat;
    }

    if (this.authConfig.githubApp) {
      const { appId, privateKey, installationId } = this.authConfig.githubApp;
      const tokenData = await this.getGitHubAppInstallationToken(
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

  /**
   * Clone a git repository
   */
  async clone(params: GitCloneParams): Promise<GitCloneResult> {
    const { repoUrl, branch, targetDir, depth } = params;

    try {
      const token = await this.getAuthToken();
      const authUrl = this.getAuthenticatedUrl(repoUrl, token);

      const localPath =
        targetDir || path.join(ensureTmpDir(), `git-clone-${Date.now()}`);

      const options: Partial<SimpleGitOptions> = {
        baseDir: process.cwd(),
        binary: 'git',
        maxConcurrentProcesses: 6,
      };

      const git: SimpleGit = simpleGit(options);

      const cloneOptions: string[] = [];
      if (branch) {
        cloneOptions.push('--branch', branch);
      }
      if (depth) {
        cloneOptions.push('--depth', String(depth));
      }

      this.logger.log('Cloning repository', { repoUrl, branch, localPath });

      await git.clone(authUrl, localPath, cloneOptions);

      const repoGit = simpleGit(localPath);
      const status = await repoGit.status();
      const currentBranch = status.current || branch || 'main';

      return {
        success: true,
        localPath,
        branch: currentBranch,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Clone failed', { error: errorMessage });
      return {
        success: false,
        localPath: '',
        branch: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Push files to a git repository
   */
  async push(params: GitPushParams): Promise<GitPushResult> {
    const { repoPath, files, commitMessage, branch, author } = params;

    try {
      const git: SimpleGit = simpleGit(repoPath);

      if (branch) {
        const branches = await git.branchLocal();
        if (!branches.all.includes(branch)) {
          await git.checkoutLocalBranch(branch);
        } else {
          await git.checkout(branch);
        }
      }

      for (const file of files) {
        const fullPath = path.join(repoPath, file.path);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, file.content);
      }

      await git.add(files.map(f => f.path));

      // Configure git identity (use provided author or fallback to env vars/defaults)
      const gitUserName =
        author?.name || process.env.GIT_AUTHOR_NAME || 'dot-ai-bot';
      const gitUserEmail =
        author?.email ||
        process.env.GIT_AUTHOR_EMAIL ||
        'dot-ai@users.noreply.github.com';
      await git.addConfig('user.name', gitUserName);
      await git.addConfig('user.email', gitUserEmail);

      const commitResult = await git.commit(commitMessage);

      // Handle empty commit (no changes to commit)
      if (!commitResult.commit) {
        this.logger.log('No changes to commit, skipping push');
        return {
          success: true,
          commitSha: undefined,
          branch: (await git.status()).current || 'main',
          filesAdded: [],
        };
      }

      const commitSha = commitResult.commit;

      const token = await this.getAuthToken();
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');

      if (origin) {
        const repoUrl = origin.refs.fetch;
        const authUrl = this.getAuthenticatedUrl(repoUrl, token);
        await git.remote(['set-url', 'origin', authUrl]);
      }

      const currentBranch = (await git.status()).current || 'main';
      await git.push('origin', currentBranch, ['--set-upstream']);

      return {
        success: true,
        commitSha,
        branch: currentBranch,
        filesAdded: files.map(f => f.path),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Push failed', { error: errorMessage });
      return {
        success: false,
        branch: '',
        filesAdded: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Check if a repository exists locally
   */
  static isRepo(localPath: string): boolean {
    return fs.existsSync(path.join(localPath, '.git'));
  }

  /**
   * Clean up a cloned repository
   */
  static cleanup(localPath: string): void {
    if (fs.existsSync(localPath)) {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  }
}

/**
 * Get git auth configuration from environment variables
 */
export function getGitAuthConfigFromEnv(): GitAuthConfig {
  const pat = process.env.GIT_TOKEN;
  const githubAppEnabled = process.env.GITHUB_APP_ENABLED === 'true';

  if (pat) {
    return { pat };
  }

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

/**
 * Singleton instance for git operations
 */
let gitOperationsInstance: GitOperations | null = null;

export function getGitOperations(): GitOperations {
  if (!gitOperationsInstance) {
    const authConfig = getGitAuthConfigFromEnv();
    gitOperationsInstance = new GitOperations(authConfig);
  }
  return gitOperationsInstance;
}

export function resetGitOperations(): void {
  gitOperationsInstance = null;
}
