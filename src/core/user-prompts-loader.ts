/**
 * User Prompts Loader
 *
 * Loads user-defined prompts from a git repository.
 * Supports any git provider (GitHub, GitLab, Gitea, Forgejo, Bitbucket, etc.)
 *
 * Environment variables:
 * - DOT_AI_USER_PROMPTS_REPO: Git repository URL (required to enable)
 * - DOT_AI_USER_PROMPTS_BRANCH: Branch to use (default: main)
 * - DOT_AI_USER_PROMPTS_PATH: Subdirectory within repo (default: root)
 * - DOT_AI_GIT_TOKEN: Authentication token (optional)
 * - DOT_AI_USER_PROMPTS_CACHE_TTL: Cache TTL in seconds (default: 86400 = 24h)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './error-handling';
import { execAsync } from './platform-utils';
import { Prompt, loadPromptFile } from '../tools/prompts';

/**
 * Configuration for user prompts repository
 */
export interface UserPromptsConfig {
  repoUrl: string;
  branch: string;
  subPath: string;
  gitToken?: string;
  cacheTtlSeconds: number;
}

/**
 * Cache state for tracking repository freshness
 */
interface CacheState {
  lastPullTime: number;
  localPath: string;
}

// In-memory cache state (persists across requests within same process)
let cacheState: CacheState | null = null;

/**
 * Read user prompts configuration from environment variables
 * Returns null if DOT_AI_USER_PROMPTS_REPO is not set
 */
export function getUserPromptsConfig(): UserPromptsConfig | null {
  const repoUrl = process.env.DOT_AI_USER_PROMPTS_REPO;

  if (!repoUrl) {
    return null;
  }

  // Validate cache TTL - fallback to default if invalid or negative
  const parsedTtl = parseInt(
    process.env.DOT_AI_USER_PROMPTS_CACHE_TTL || '86400',
    10
  );
  const cacheTtlSeconds =
    Number.isNaN(parsedTtl) || parsedTtl < 0 ? 86400 : parsedTtl;

  return {
    repoUrl,
    branch: process.env.DOT_AI_USER_PROMPTS_BRANCH || 'main',
    subPath: process.env.DOT_AI_USER_PROMPTS_PATH || '',
    gitToken: process.env.DOT_AI_GIT_TOKEN,
    cacheTtlSeconds,
  };
}

/**
 * Get the cache directory for user prompts
 * Tries project-relative tmp first, falls back to system temp
 */
export function getCacheDirectory(): string {
  // Try project-relative tmp directory first
  const projectTmp = path.join(process.cwd(), 'tmp', 'user-prompts');

  try {
    // Ensure parent tmp directory exists
    const parentTmp = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(parentTmp)) {
      fs.mkdirSync(parentTmp, { recursive: true });
    }

    // Test if we can write to it
    const testFile = path.join(parentTmp, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    return projectTmp;
  } catch {
    // Fall back to system temp (works in Docker/K8s)
    return path.join(os.tmpdir(), 'dot-ai-user-prompts');
  }
}

/**
 * Insert authentication token into git URL
 * Works with any HTTPS git URL (GitHub, GitLab, Gitea, Bitbucket, etc.)
 */
export function insertTokenInUrl(url: string, token: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = token;
    return parsed.toString();
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Sanitize URL for logging (remove credentials)
 */
export function sanitizeUrlForLogging(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    // If URL parsing fails, do basic sanitization
    return url.replace(/\/\/[^@]+@/, '//***@');
  }
}

/**
 * Validate git branch name to prevent command injection
 * Allows alphanumeric characters, hyphens, underscores, slashes, and dots
 */
function isValidGitBranch(branch: string): boolean {
  return /^[a-zA-Z0-9_.\-/]+$/.test(branch);
}

/**
 * Clone the user prompts repository
 */
async function cloneRepository(
  config: UserPromptsConfig,
  localPath: string,
  logger: Logger
): Promise<void> {
  // Validate branch name to prevent command injection
  if (!isValidGitBranch(config.branch)) {
    throw new Error(`Invalid branch name: ${config.branch}`);
  }

  const authUrl = config.gitToken
    ? insertTokenInUrl(config.repoUrl, config.gitToken)
    : config.repoUrl;

  const sanitizedUrl = sanitizeUrlForLogging(config.repoUrl);

  logger.info('Cloning user prompts repository', {
    url: sanitizedUrl,
    branch: config.branch,
    localPath,
  });

  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(localPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Remove existing directory if it exists (clean clone)
    if (fs.existsSync(localPath)) {
      fs.rmSync(localPath, { recursive: true, force: true });
    }

    // Clone with shallow depth for faster operation
    const cloneCommand = `git clone --depth 1 --branch ${config.branch} "${authUrl}" "${localPath}"`;
    await execAsync(cloneCommand);

    logger.info('Successfully cloned user prompts repository', {
      url: sanitizedUrl,
      branch: config.branch,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    // Sanitize error message in case it contains the token
    const sanitizedError = config.gitToken
      ? errorMessage.replaceAll(config.gitToken, '***')
      : errorMessage;

    logger.error(
      'Failed to clone user prompts repository',
      new Error(sanitizedError),
      {
        url: sanitizedUrl,
        branch: config.branch,
      }
    );
    throw new Error(
      `Failed to clone user prompts repository: ${sanitizedError}`,
      { cause: error }
    );
  }
}

/**
 * Pull latest changes from the user prompts repository
 */
async function pullRepository(
  config: UserPromptsConfig,
  localPath: string,
  logger: Logger
): Promise<void> {
  const sanitizedUrl = sanitizeUrlForLogging(config.repoUrl);

  logger.debug('Pulling user prompts repository', {
    url: sanitizedUrl,
    localPath,
  });

  try {
    // Set up credentials for pull if token is provided
    if (config.gitToken) {
      const authUrl = insertTokenInUrl(config.repoUrl, config.gitToken);
      await execAsync(
        `git -C "${localPath}" remote set-url origin "${authUrl}"`
      );
    }

    await execAsync(`git -C "${localPath}" pull --ff-only`);

    logger.debug('Successfully pulled user prompts repository', {
      url: sanitizedUrl,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const sanitizedError = config.gitToken
      ? errorMessage.replaceAll(config.gitToken, '***')
      : errorMessage;

    logger.warn(
      'Failed to pull user prompts repository, using cached version',
      {
        url: sanitizedUrl,
        error: sanitizedError,
      }
    );
    // Don't throw - use cached version
  }
}

/**
 * Ensure the repository is cloned and up-to-date
 * Returns the path to the prompts directory within the repository
 */
async function ensureRepository(
  config: UserPromptsConfig,
  logger: Logger,
  forceRefresh: boolean = false
): Promise<string> {
  const localPath = getCacheDirectory();
  const now = Date.now();
  const ttlMs = config.cacheTtlSeconds * 1000;

  // Check if we need to clone or pull
  if (!cacheState || !fs.existsSync(cacheState.localPath)) {
    // First time or cache directory was deleted - clone
    await cloneRepository(config, localPath, logger);
    cacheState = { lastPullTime: now, localPath };
  } else if (forceRefresh || now - cacheState.lastPullTime >= ttlMs) {
    // Cache expired or force refresh - pull
    await pullRepository(config, localPath, logger);
    cacheState.lastPullTime = now;
  } else {
    logger.debug('Using cached user prompts repository', {
      localPath,
      cacheAge: Math.round((now - cacheState.lastPullTime) / 1000),
      ttl: config.cacheTtlSeconds,
    });
  }

  // Return path to prompts directory (with optional subPath)
  return config.subPath ? path.join(localPath, config.subPath) : localPath;
}

/**
 * Load user prompts from the configured git repository
 * Returns empty array if not configured or on error
 */
export async function loadUserPrompts(
  logger: Logger,
  forceRefresh: boolean = false
): Promise<Prompt[]> {
  const config = getUserPromptsConfig();

  if (!config) {
    logger.debug(
      'User prompts not configured (DOT_AI_USER_PROMPTS_REPO not set)'
    );
    return [];
  }

  try {
    const promptsDir = await ensureRepository(config, logger, forceRefresh);

    if (!fs.existsSync(promptsDir)) {
      logger.warn('User prompts directory not found in repository', {
        path: promptsDir,
        subPath: config.subPath,
      });
      return [];
    }

    // Load all .md files from the prompts directory
    const files = fs.readdirSync(promptsDir);
    const promptFiles = files.filter(file => file.endsWith('.md'));
    const prompts: Prompt[] = [];

    for (const file of promptFiles) {
      try {
        const filePath = path.join(promptsDir, file);
        const prompt = loadPromptFile(filePath, 'user');
        prompts.push(prompt);
        logger.debug('Loaded user prompt', { name: prompt.name, file });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Failed to load user prompt file, skipping', {
          file,
          error: errorMessage,
        });
        // Continue with other prompts
      }
    }

    logger.info('Loaded user prompts from repository', {
      total: prompts.length,
      url: sanitizeUrlForLogging(config.repoUrl),
    });

    return prompts;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      'Failed to load user prompts, falling back to built-in only',
      new Error(errorMessage)
    );
    return [];
  }
}

/**
 * Clear the cache state (useful for testing)
 */
export function clearUserPromptsCache(): void {
  cacheState = null;
}

/**
 * Get current cache state (for testing/debugging)
 */
export function getUserPromptsCacheState(): CacheState | null {
  return cacheState ? { ...cacheState } : null;
}
