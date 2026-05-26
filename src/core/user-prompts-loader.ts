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
import {
  cloneRepo,
  pullRepo,
  sanitizeRelativePath,
  scrubCredentials,
} from './git-utils';
import { Prompt, PromptFile, loadPromptFile } from '../tools/prompts';

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
 * Per-request override for user prompts repository.
 * When supplied to loadUserPrompts(), bypasses DOT_AI_USER_PROMPTS_REPO env vars
 * for that call while reusing DOT_AI_GIT_TOKEN and the cache TTL.
 */
export interface UserPromptsOverride {
  repoUrl: string;
  branch?: string;
  subPath?: string;
}

/**
 * Cache state for tracking repository freshness.
 * Cache is invalidated when any of repoUrl, branch, or subPath changes,
 * so we record all three on every clone.
 */
interface CacheState {
  lastPullTime: number;
  localPath: string;
  repoUrl: string;
  branch: string;
  subPath: string;
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
 * Compute the `source` value the REST endpoints expose in their responses.
 * The CLI (vfarcic/dot-ai-cli) uses this string verbatim to tag the skill
 * files it writes, so:
 *   - per-request override supplied  → override.repoUrl
 *   - no override, env-var configured → DOT_AI_USER_PROMPTS_REPO
 *   - no override, no env-var         → "built-in"
 *
 * URLs flow through scrubSourceUrl before returning, which scrubs BOTH:
 *   - userinfo credentials (https://user:token@host/repo)
 *   - credential-bearing query params (?access_token=... etc — CodeRabbit
 *     Major A)
 *
 * Stability is preserved: scrubSourceUrl is deterministic (fixed `***`
 * placeholder), so two identical credential-bearing inputs produce the same
 * scrubbed source — keeping the CLI's "wipe only my own slice" invariant
 * intact.
 */
export function computePromptsSource(override?: UserPromptsOverride): string {
  if (override?.repoUrl) {
    return scrubSourceUrl(override.repoUrl);
  }
  const envRepo = process.env.DOT_AI_USER_PROMPTS_REPO;
  if (envRepo) {
    return scrubSourceUrl(envRepo);
  }
  return 'built-in';
}

/**
 * Build a UserPromptsConfig from a per-request override.
 * Reuses DOT_AI_GIT_TOKEN and DOT_AI_USER_PROMPTS_CACHE_TTL from the environment;
 * branch and subPath fall back to the same defaults as the env-var path.
 *
 * Validates the override inputs before returning:
 *   - repoUrl scheme must be http or https (prevents file://, ssh://, etc.)
 *   - subPath must be a relative path inside the cache directory (no '..',
 *     no absolute, no null bytes)
 *   - branch must match the git-safe character set used elsewhere
 *
 * Throws Error with a credential-scrubbed message on any validation failure.
 */
export function getUserPromptsConfigFromOverride(
  override: UserPromptsOverride
): UserPromptsConfig {
  // F1: repoUrl scheme must be http/https
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(override.repoUrl);
  } catch {
    throw new Error(
      `Invalid override repoUrl: ${sanitizeUrlForLogging(override.repoUrl)} (failed to parse)`
    );
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Invalid override repoUrl scheme: ${parsedUrl.protocol} (only http and https are allowed) for ${sanitizeUrlForLogging(override.repoUrl)}`
    );
  }

  // F2: subPath must be a safe relative path
  let normalizedSubPath = '';
  if (override.subPath) {
    if (override.subPath.includes('\0')) {
      throw new Error('Invalid override subPath: contains null byte');
    }
    try {
      normalizedSubPath = sanitizeRelativePath(override.subPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Invalid override subPath: ${message}`, { cause: error });
    }
  }

  // F3: branch (if supplied) must match the git-safe character set
  const branch = override.branch || 'main';
  if (override.branch !== undefined && !isValidGitBranch(override.branch)) {
    throw new Error(`Invalid override branch name: ${override.branch}`);
  }

  const parsedTtl = parseInt(
    process.env.DOT_AI_USER_PROMPTS_CACHE_TTL || '86400',
    10
  );
  const cacheTtlSeconds =
    Number.isNaN(parsedTtl) || parsedTtl < 0 ? 86400 : parsedTtl;

  return {
    repoUrl: override.repoUrl,
    branch,
    subPath: normalizedSubPath,
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
 * Query-param names whose values look credential-bearing. Conservative
 * allowlist-on-redaction — case-insensitive substring match.
 */
const CREDENTIAL_PARAM_RE = /token|key|secret|password|auth|credential/i;

/**
 * Source-only deep scrub for URLs that flow into the response body and the
 * on-disk skill frontmatter the CLI writes (PRD #581 / CodeRabbit Major A).
 *
 * In addition to the userinfo scrub from sanitizeUrlForLogging, redacts the
 * VALUES of query parameters whose names look credential-bearing (token, key,
 * secret, password, auth, credential — case-insensitive). The placeholder is
 * a fixed string so the output is deterministic — same input always produces
 * the same source, preserving the CLI's "tag-and-wipe-by-source" invariant.
 *
 * Scope: ONLY called from computePromptsSource. NOT a general-purpose
 * replacement for sanitizeUrlForLogging — the broader hygiene of the shared
 * helper was deferred per the M2 follow-up scope.
 */
export function scrubSourceUrl(url: string): string {
  // Userinfo scrub first; this also handles "//user:pass@" via the regex
  // fallback when URL parsing fails.
  const userinfoScrubbed = sanitizeUrlForLogging(url);
  try {
    const parsed = new URL(userinfoScrubbed);
    let mutated = false;
    for (const name of [...parsed.searchParams.keys()]) {
      if (CREDENTIAL_PARAM_RE.test(name)) {
        parsed.searchParams.set(name, '***');
        mutated = true;
      }
    }
    return mutated ? parsed.toString() : userinfoScrubbed;
  } catch {
    // Unparseable; return the userinfo-scrubbed form unchanged. Query-param
    // scrubbing on unparseable URLs is meaningless — there's no reliable
    // boundary to walk.
    return userinfoScrubbed;
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
  // Validate branch name as defense-in-depth
  if (!isValidGitBranch(config.branch)) {
    throw new Error(`Invalid branch name: ${config.branch}`);
  }

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

    await cloneRepo(config.repoUrl, localPath, {
      branch: config.branch,
      depth: 1,
    });

    logger.info('Successfully cloned user prompts repository', {
      url: sanitizedUrl,
      branch: config.branch,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const sanitizedError = scrubCredentials(
      config.gitToken
        ? errorMessage.replaceAll(config.gitToken, '***')
        : errorMessage
    );

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
    await pullRepo(localPath);

    logger.debug('Successfully pulled user prompts repository', {
      url: sanitizedUrl,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const sanitizedError = scrubCredentials(
      config.gitToken
        ? errorMessage.replaceAll(config.gitToken, '***')
        : errorMessage
    );

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

  // Check if we need to clone or pull. The cache is invalidated when any of
  // (repoUrl, branch, subPath) differs from the cached entry so that, for
  // example, a future override with a different branch but the same repoUrl
  // won't serve stale content from the previous clone.
  const cacheMisses =
    cacheState !== null &&
    (cacheState.repoUrl !== config.repoUrl ||
      cacheState.branch !== config.branch ||
      cacheState.subPath !== config.subPath);
  if (!cacheState || !fs.existsSync(cacheState.localPath) || cacheMisses) {
    // First time, cache directory deleted, or cached coordinates differ - clone fresh
    if (cacheMisses) {
      logger.debug(
        'Cached repo coordinates differ from requested, re-cloning',
        {
          cachedUrl: sanitizeUrlForLogging(cacheState!.repoUrl),
          cachedBranch: cacheState!.branch,
          cachedSubPath: cacheState!.subPath,
          requestedUrl: sanitizeUrlForLogging(config.repoUrl),
          requestedBranch: config.branch,
          requestedSubPath: config.subPath,
        }
      );
    }
    await cloneRepository(config, localPath, logger);
    cacheState = {
      lastPullTime: now,
      localPath,
      repoUrl: config.repoUrl,
      branch: config.branch,
      subPath: config.subPath,
    };
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

const SKILL_FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file (before base64 encoding)
const SKILL_FILENAME = 'SKILL.md';

/**
 * Recursively collect all files in a skill folder (excluding SKILL.md at root),
 * returning them as base64-encoded PromptFile objects.
 */
function collectSkillFiles(
  dirPath: string,
  basePath: string,
  logger: Logger
): PromptFile[] {
  const files: PromptFile[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      files.push(...collectSkillFiles(fullPath, basePath, logger));
    } else if (entry.isFile()) {
      if (entry.name === SKILL_FILENAME && dirPath === basePath) continue;

      const stat = fs.statSync(fullPath);
      if (stat.size > SKILL_FILE_MAX_BYTES) {
        logger.warn('Skill file exceeds size limit, skipping', {
          file: relativePath,
          size: stat.size,
          limit: SKILL_FILE_MAX_BYTES,
        });
        continue;
      }

      const content = fs.readFileSync(fullPath);
      files.push({
        path: relativePath,
        content: content.toString('base64'),
      });
    }
  }

  return files;
}

/**
 * Load a skill folder (directory containing SKILL.md) as a Prompt with supporting files.
 * Returns null if the directory does not contain SKILL.md.
 */
function loadSkillFolder(
  dirPath: string,
  dirName: string,
  logger: Logger
): Prompt | null {
  const skillMdPath = path.join(dirPath, SKILL_FILENAME);

  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  const prompt = loadPromptFile(skillMdPath, 'user', dirName);

  const supportingFiles = collectSkillFiles(dirPath, dirPath, logger);

  if (supportingFiles.length > 0) {
    prompt.files = supportingFiles;
  }

  return prompt;
}

/**
 * Load user prompts from a git repository.
 *
 * When `override` is supplied, fetches from that repository for this call only,
 * ignoring DOT_AI_USER_PROMPTS_REPO env vars. Otherwise, uses env-var configuration.
 * Returns empty array if not configured or on error.
 */
export async function loadUserPrompts(
  logger: Logger,
  forceRefresh: boolean = false,
  override?: UserPromptsOverride
): Promise<Prompt[]> {
  let config: UserPromptsConfig | null;
  try {
    // Override validation can throw on bad scheme / traversal / branch — keep
    // the call inside the catch so a malformed per-request override returns
    // [] rather than propagating an exception to the caller.
    config = override
      ? getUserPromptsConfigFromOverride(override)
      : getUserPromptsConfig();
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Unknown error';
    const safeMessage = scrubCredentials(rawMessage);
    logger.error(
      'Failed to load user prompts, falling back to built-in only',
      new Error(safeMessage)
    );
    return [];
  }

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

    // Load flat .md files and skill folders from the prompts directory
    const entries = fs.readdirSync(promptsDir, { withFileTypes: true });
    const prompts: Prompt[] = [];
    const loadedNames = new Set<string>();

    // 1. Load flat .md files (existing behavior)
    const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));
    for (const entry of mdFiles) {
      try {
        const filePath = path.join(promptsDir, entry.name);
        const prompt = loadPromptFile(filePath, 'user');
        prompts.push(prompt);
        loadedNames.add(prompt.name);
        logger.debug('Loaded user prompt', {
          name: prompt.name,
          file: entry.name,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Failed to load user prompt file, skipping', {
          file: entry.name,
          error: errorMessage,
        });
      }
    }

    // 2. Load skill folders (directories containing SKILL.md)
    const directories = entries.filter(
      e => e.isDirectory() && !e.name.startsWith('.')
    );
    for (const dir of directories) {
      try {
        const dirPath = path.join(promptsDir, dir.name);
        const prompt = loadSkillFolder(dirPath, dir.name, logger);
        if (prompt) {
          if (loadedNames.has(prompt.name)) {
            logger.warn(
              'Skill folder name collision with existing prompt, skipping',
              {
                name: prompt.name,
                dir: dir.name,
              }
            );
            continue;
          }
          prompts.push(prompt);
          loadedNames.add(prompt.name);
          logger.debug('Loaded user skill folder', {
            name: prompt.name,
            dir: dir.name,
            filesCount: prompt.files?.length ?? 0,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Failed to load skill folder, skipping', {
          dir: dir.name,
          error: errorMessage,
        });
      }
    }

    logger.info('Loaded user prompts from repository', {
      total: prompts.length,
      url: sanitizeUrlForLogging(config.repoUrl),
    });

    return prompts;
  } catch (error) {
    // F5: scrub credentials before they reach loggers/callers. Underlying git
    // errors can echo the authenticated URL (with embedded token) verbatim.
    const rawMessage = error instanceof Error ? error.message : 'Unknown error';
    const safeMessage = scrubCredentials(
      config.gitToken
        ? rawMessage.replaceAll(config.gitToken, '***')
        : rawMessage
    );
    logger.error(
      'Failed to load user prompts, falling back to built-in only',
      new Error(safeMessage)
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
