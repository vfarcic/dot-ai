/**
 * Internal Agentic-Loop Tools (PRD #407, PRD #408)
 *
 * Tools that run locally in the MCP server, available to the AI
 * during investigation loops alongside plugin tools. NOT exposed
 * to client agents — only the AI inside toolLoop() calls these.
 *
 * Tools:
 * - git_clone: Clone a Git repo
 * - fs_list: List files at a path
 * - fs_read: Read a file at a path
 * - git_create_pr: Create a PR with file changes (PRD #408)
 *
 * All filesystem operations are scoped to ./tmp/gitops-clones/
 * to prevent path traversal attacks.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AITool, ToolExecutor } from './ai-provider.interface.js';
import {
  cloneRepo,
  scrubCredentials,
  sanitizeRelativePath,
  pushRepo,
  getGitAuthConfigFromEnv,
  getAuthToken,
} from './git-utils.js';
import { sanitizeIntentForLabel } from './solution-utils.js';
import simpleGit from 'simple-git';

const CLONES_SUBDIR = 'gitops-clones';
const MAX_FILE_SIZE = 100 * 1024; // 100KB
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Path security ───

function getClonesDir(): string {
  return path.resolve(process.cwd(), 'tmp', CLONES_SUBDIR);
}

/**
 * Validate that a relative path is safe and resolve it within the clones directory.
 * Uses sanitizeRelativePath for traversal checks, then resolves to absolute.
 * Exported for testing.
 */
export function validatePathWithinClones(inputPath: string): string {
  // Decode URL-encoded characters (e.g., %2e%2e/ for ../) before validation
  let decoded: string;
  try {
    decoded = decodeURIComponent(inputPath);
  } catch {
    decoded = inputPath;
  }
  const sanitized = sanitizeRelativePath(decoded);
  return path.resolve(getClonesDir(), sanitized);
}

// ─── Repo name sanitization ───

function repoUrlToDirectoryName(repoUrl: string): string {
  try {
    const url = new URL(repoUrl);
    const repoPath = url.pathname
      .replace(/^\//, '')
      .replace(/\.git$/, '');
    return sanitizeIntentForLabel(repoPath);
  } catch {
    return sanitizeIntentForLabel(repoUrl.slice(0, 63));
  }
}

// ─── Tool definitions ───

export function getInternalTools(): AITool[] {
  return [
    {
      name: 'git_clone',
      description:
        'Clone a Git repository. Returns a relative path to the cloned repo.',
      inputSchema: {
        type: 'object',
        properties: {
          repoUrl: {
            type: 'string',
            description: 'Repository URL (HTTPS)',
          },
        },
        required: ['repoUrl'],
      },
    },
    {
      name: 'fs_list',
      description:
        'List files and directories at a relative path within the working directory.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to list',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'fs_read',
      description:
        'Read file contents at a relative path within the working directory.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to file',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'git_create_pr',
      description:
        'Create a pull request with file changes in a previously cloned repository. Writes files, creates a branch, commits, pushes, and opens a PR via GitHub API.',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: {
            type: 'string',
            description:
              'Relative path to the cloned repo (as returned by git_clone)',
          },
          files: {
            type: 'array',
            description:
              'Files to create or modify — provide complete new file content',
            items: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'File path relative to repo root',
                },
                content: {
                  type: 'string',
                  description: 'Complete new file content',
                },
              },
              required: ['path', 'content'],
            },
          },
          title: {
            type: 'string',
            description: 'PR title',
          },
          body: {
            type: 'string',
            description: 'PR description with context',
          },
          branchName: {
            type: 'string',
            description: 'Branch name for the PR',
          },
          baseBranch: {
            type: 'string',
            description: 'Branch to target (default: main)',
          },
        },
        required: ['repoPath', 'files', 'title', 'branchName'],
      },
    },
  ];
}

// ─── Handlers ───

async function handleGitClone(
  args: Record<string, unknown>,
  sessionId: string
): Promise<unknown> {
  const repoUrl = args.repoUrl as string;
  if (!repoUrl) {
    return 'Error: repoUrl is required';
  }

  const repoName = repoUrlToDirectoryName(repoUrl);
  const relativePath = path.join(sessionId, repoName);
  const targetDir = path.join(getClonesDir(), relativePath);

  if (fs.existsSync(targetDir)) {
    return { localPath: relativePath, message: 'Repository already cloned' };
  }

  const parentDir = path.dirname(targetDir);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  try {
    const result = await cloneRepo(repoUrl, targetDir, { depth: 1 });
    return { localPath: relativePath, branch: result.branch };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error cloning repository: ${scrubCredentials(message)}`;
  }
}

function handleFsList(args: Record<string, unknown>): unknown {
  const inputPath = args.path as string;
  if (!inputPath) {
    return 'Error: path is required';
  }

  let resolved: string;
  try {
    resolved = validatePathWithinClones(inputPath);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (!fs.existsSync(resolved)) {
    return `Error: path does not exist: ${inputPath}`;
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return `Error: path is not a directory: ${inputPath}`;
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? 'directory' : 'file',
  }));
}

function handleFsRead(args: Record<string, unknown>): unknown {
  const inputPath = args.path as string;
  if (!inputPath) {
    return 'Error: path is required';
  }

  let resolved: string;
  try {
    resolved = validatePathWithinClones(inputPath);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (!fs.existsSync(resolved)) {
    return `Error: file does not exist: ${inputPath}`;
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return `Error: path is a directory, not a file: ${inputPath}`;
  }

  // Binary detection: check first 8KB for null bytes
  const detectBuffer = Buffer.alloc(Math.min(8192, stat.size));
  const fd = fs.openSync(resolved, 'r');
  try {
    fs.readSync(fd, detectBuffer, 0, detectBuffer.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (detectBuffer.includes(0)) {
    return 'Binary file, cannot display';
  }

  if (stat.size > MAX_FILE_SIZE) {
    const buffer = Buffer.alloc(MAX_FILE_SIZE);
    const fd = fs.openSync(resolved, 'r');
    try {
      const bytesRead = fs.readSync(fd, buffer, 0, MAX_FILE_SIZE, 0);
      const content = buffer.toString('utf-8', 0, bytesRead);
      return `${content}\n\n[Truncated: file exceeds ${MAX_FILE_SIZE / 1024}KB limit]`;
    } finally {
      fs.closeSync(fd);
    }
  }

  return fs.readFileSync(resolved, 'utf-8');
}

export interface GitCreatePrInput {
  repoPath: string;
  files: Array<{ path: string; content: string }>;
  title: string;
  body?: string;
  branchName: string;
  baseBranch?: string;
}

export type GitCreatePrResult =
  | { success: true; prUrl: string; prNumber: number; branch: string; baseBranch: string; filesChanged: string[] }
  | { success: true; branch: string; baseBranch: string; filesChanged: string[]; error: string }
  | { success: false; error: string };

async function handleGitCreatePr(
  args: Record<string, unknown>
): Promise<GitCreatePrResult> {
  const repoPath = args.repoPath as string;
  const files = args.files as Array<{ path: string; content: string }>;
  const title = args.title as string;
  const body = (args.body as string) || '';
  const branchName = args.branchName as string;
  const baseBranch = (args.baseBranch as string) || 'main';

  if (!repoPath) {
    return { success: false, error: 'repoPath is required' };
  }
  if (!files || !Array.isArray(files) || files.length === 0) {
    return { success: false, error: 'files array is required and must not be empty' };
  }
  if (!title) {
    return { success: false, error: 'title is required' };
  }
  if (!branchName) {
    return { success: false, error: 'branchName is required' };
  }

  let resolvedRepoPath: string;
  try {
    resolvedRepoPath = validatePathWithinClones(repoPath);
  } catch (err) {
    return {
      success: false,
      error: `Invalid repo path: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!fs.existsSync(resolvedRepoPath)) {
    return {
      success: false,
      error: `Repository not found at path: ${repoPath}. It may have been cleaned up.`,
    };
  }

  const stat = fs.statSync(resolvedRepoPath);
  if (!stat.isDirectory()) {
    return { success: false, error: `Path is not a directory: ${repoPath}` };
  }

  try {
    const pushResult = await pushRepo(resolvedRepoPath, files, title, {
      branch: branchName,
    });

    const authConfig = getGitAuthConfigFromEnv();
    const token = await getAuthToken(authConfig);

    const git = simpleGit(resolvedRepoPath);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin?.refs?.fetch) {
      return { success: false, error: 'Could not find origin remote URL' };
    }
    const remoteUrl = scrubCredentials(origin.refs.fetch);

    const repoMatch = remoteUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (!repoMatch) {
      return {
        success: true,
        branch: branchName,
        baseBranch,
        filesChanged: pushResult.filesAdded,
        error: 'Automatic PR creation is only supported for GitHub repositories. Changes were pushed to the branch — create a PR/MR manually.',
      };
    }
    const ownerRepo = repoMatch[1].replace(/\.git$/, '');
    const [owner, repo] = ownerRepo.split('/');

    const prResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
          'User-Agent': 'dot-ai-remediate',
        },
        body: JSON.stringify({
          title,
          body,
          head: branchName,
          base: baseBranch,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!prResponse.ok) {
      const errorBody = await prResponse.text();
      return {
        success: false,
        error: `GitHub API error (${prResponse.status}): ${errorBody}`,
      };
    }

    const prData = (await prResponse.json()) as {
      html_url: string;
      number: number;
    };

    return {
      success: true,
      prUrl: prData.html_url,
      prNumber: prData.number,
      branch: branchName,
      baseBranch,
      filesChanged: pushResult.filesAdded,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: scrubCredentials(message) };
  }
}

// ─── Combined executor ───

/**
 * Create a ToolExecutor that handles internal agentic-loop tools.
 * Designed to be passed as the fallbackExecutor to pluginManager.createToolExecutor().
 */
export function createInternalToolExecutor(sessionId: string): ToolExecutor {
  const handlers: Record<
    string,
    (args: Record<string, unknown>) => unknown | Promise<unknown>
  > = {
    git_clone: (args) => handleGitClone(args, sessionId),
    fs_list: handleFsList,
    fs_read: handleFsRead,
    git_create_pr: handleGitCreatePr,
  };

  return async (toolName: string, input: unknown): Promise<unknown> => {
    const handler = handlers[toolName];
    if (!handler) {
      return `Error: unknown internal tool: ${toolName}`;
    }
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return 'Error: tool input must be an object';
    }
    return handler(input as Record<string, unknown>);
  };
}

// ─── TTL cleanup ───

/**
 * Remove session clone directories older than the TTL.
 * Called at the start of each new remediate investigation.
 * Non-blocking: runs cleanup in the background without delaying investigation.
 */
export function cleanupOldClones(maxAgeMs: number = DEFAULT_TTL_MS): void {
  const clonesDir = getClonesDir();

  fs.promises.access(clonesDir).then(async () => {
    const now = Date.now();
    const entries = await fs.promises.readdir(clonesDir);
    for (const entry of entries) {
      const entryPath = path.join(clonesDir, entry);
      try {
        const stat = await fs.promises.stat(entryPath);
        if (stat.isDirectory() && now - stat.mtimeMs > maxAgeMs) {
          await fs.promises.rm(entryPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore errors during cleanup (e.g., concurrent deletion)
      }
    }
  }).catch(() => {
    // Directory doesn't exist yet, nothing to clean
  });
}
