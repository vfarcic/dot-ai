/**
 * Documentation Validation Tool
 *
 * PRD #388: MCP tool for managing documentation validation sessions.
 * Thin orchestration layer — session CRUD and routing.
 * All Kubernetes operations delegated to plugin tools (docs_validate_*).
 */

import { z } from 'zod';
import { Logger } from '../core/error-handling';
import { DotAI } from '../core/index';
import { GenericSessionManager } from '../core/generic-session-manager';
import { invokePluginTool, isPluginInitialized } from '../core/plugin-registry';

// Plugin name for tool invocations
const PLUGIN_NAME = 'agentic-tools';

// Default configuration
const DEFAULT_NAMESPACE = 'dot-ai-docs-validation';
const DEFAULT_TTL_HOURS = 24;

// Tool metadata for MCP registration
export const VALIDATE_DOCS_TOOL_NAME = 'validateDocs';
export const VALIDATE_DOCS_TOOL_DESCRIPTION =
  'Validate and fix documentation pages. Detects broken code blocks, stale links, ' +
  'incorrect shell commands, and readability issues. ' +
  'Provide a git repo URL and a page path to validate a single page end-to-end.';

// Input schema using Zod
export const VALIDATE_DOCS_TOOL_INPUT_SCHEMA = {
  action: z
    .enum(['validate'])
    .default('validate')
    .describe('Action to perform. Defaults to "validate".'),
  repo: z.string().min(1).describe('Git repository URL to validate.'),
  page: z
    .string()
    .min(1)
    .describe(
      'Page path relative to repo root (e.g., "docs/getting-started.md").'
    ),
  image: z
    .string()
    .optional()
    .describe(
      'Custom container image for the validation pod. Must include git. ' +
        'If omitted, uses default image (ghcr.io/vfarcic/dot-ai-docs-validator:latest).'
    ),
};

// Input type
export interface ValidateDocsInput {
  action: 'validate';
  repo: string;
  page: string;
  image?: string;
}

// Session data type
export interface DocsValidationSessionData {
  toolName: 'validateDocs';
  repo: string;
  branch?: string;
  prUrl?: string;
  podName: string;
  podNamespace: string;
  containerImage: string;
  pagesValidated: Array<{
    path: string;
    title?: string;
    status: 'pending' | 'validated' | 'fixed' | 'skipped';
  }>;
  issuesFound: Array<{
    page: string;
    line?: number;
    type: 'readability' | 'syntax' | 'runtime' | 'broken-link';
    severity: 'low' | 'medium' | 'high';
    description: string;
    fixed: boolean;
  }>;
  fixesApplied: Array<{
    page: string;
    line?: number;
    description: string;
    reasoning: string;
    reverted: boolean;
  }>;
  feedbackHistory: Array<{
    feedback: string;
    actionsApplied: string[];
    timestamp: string;
  }>;
  status: 'active' | 'finished';
  lastActivityAt: string;
  ttlHours: number;
}

// Session manager with 'dvl' prefix
const sessionManager = new GenericSessionManager<DocsValidationSessionData>(
  'dvl'
);

/**
 * Get TTL hours from environment or use default.
 */
function getTtlHours(): number {
  const hours = parseInt(
    process.env.DOT_AI_DOCS_VALIDATION_TTL_HOURS || '',
    10
  );
  return isNaN(hours) ? DEFAULT_TTL_HOURS : hours;
}

/**
 * Build a standard text response.
 */
function textResponse(data: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Execute a command inside the validation pod via the plugin exec tool.
 */
async function execInPod(
  podName: string,
  namespace: string,
  command: string[],
  timeoutMs?: number
): Promise<{ stdout: string; stderr?: string; exitCode: number }> {
  const execArgs: Record<string, unknown> = {
    podName,
    namespace,
    command,
  };
  if (timeoutMs) {
    execArgs.timeoutMs = timeoutMs;
  }

  const response = await invokePluginTool(
    PLUGIN_NAME,
    'docs_validate_exec',
    execArgs
  );

  if (!response.success) {
    throw new Error(
      response.error?.message || 'Failed to execute command in pod'
    );
  }

  const result = response.result as { success?: boolean; data?: string };
  if (!result.data) {
    throw new Error('No data returned from exec');
  }

  return JSON.parse(result.data);
}

/**
 * Delete pod and mark session as finished. Safe to call multiple times.
 */
async function cleanupSession(
  sessionId: string,
  podName: string,
  podNamespace: string,
  logger: Logger
): Promise<void> {
  if (podName && isPluginInitialized()) {
    await invokePluginTool(PLUGIN_NAME, 'docs_validate_delete_pod', {
      podName,
      namespace: podNamespace,
    });
  }

  sessionManager.updateSession(sessionId, {
    status: 'finished',
    lastActivityAt: new Date().toISOString(),
  });

  logger.info('Validation session cleaned up', { sessionId });
}

/**
 * Handle 'validate' action — full end-to-end single-page validation.
 * Orchestrates: create session → create pod → clone repo → verify page → cleanup.
 */
async function handleValidate(
  args: ValidateDocsInput,
  logger: Logger
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!isPluginInitialized()) {
    return textResponse({
      success: false,
      error:
        'Plugin system not available. validateDocs requires agentic-tools plugin.',
    });
  }

  const namespace = DEFAULT_NAMESPACE;
  const ttlHours = getTtlHours();

  // Create session
  const session = sessionManager.createSession({
    toolName: 'validateDocs',
    repo: args.repo,
    podName: '',
    podNamespace: namespace,
    containerImage: args.image || '',
    pagesValidated: [{ path: args.page, status: 'pending' }],
    issuesFound: [],
    fixesApplied: [],
    feedbackHistory: [],
    status: 'active',
    lastActivityAt: new Date().toISOString(),
    ttlHours,
  });

  logger.info('Starting validation', {
    sessionId: session.sessionId,
    repo: args.repo,
    page: args.page,
  });

  // Create pod
  const createArgs: Record<string, unknown> = {
    sessionId: session.sessionId,
    namespace,
    ttlHours,
  };
  if (args.image) {
    createArgs.image = args.image;
  }

  const createResponse = await invokePluginTool(
    PLUGIN_NAME,
    'docs_validate_create_pod',
    createArgs
  );

  if (!createResponse.success) {
    sessionManager.deleteSession(session.sessionId);
    return textResponse({
      success: false,
      error: createResponse.error?.message || 'Failed to create validation pod',
    });
  }

  const createResult = createResponse.result as {
    success?: boolean;
    data?: string;
    error?: string;
  };
  if (createResult.success === false) {
    sessionManager.deleteSession(session.sessionId);
    return textResponse({
      success: false,
      error: createResult.error || 'Failed to create validation pod',
    });
  }

  const podData = JSON.parse(createResult.data || '{}');
  const podName = podData.podName;
  const containerImage =
    podData.image ||
    args.image ||
    'ghcr.io/vfarcic/dot-ai-docs-validator:latest';

  sessionManager.updateSession(session.sessionId, {
    podName,
    containerImage,
  });

  try {
    // Clone repo
    const cloneResult = await execInPod(
      podName,
      namespace,
      ['git', 'clone', '--depth', '1', '--quiet', args.repo, '/workspace'],
      180000
    );

    if (cloneResult.exitCode !== 0) {
      await cleanupSession(session.sessionId, podName, namespace, logger);
      return textResponse({
        success: false,
        sessionId: session.sessionId,
        error: `Failed to clone repository: ${cloneResult.stderr || 'unknown error'}`,
      });
    }

    // Verify page exists
    const checkResult = await execInPod(podName, namespace, [
      'test',
      '-f',
      `/workspace/${args.page}`,
    ]);

    if (checkResult.exitCode !== 0) {
      await cleanupSession(session.sessionId, podName, namespace, logger);
      return textResponse({
        success: false,
        sessionId: session.sessionId,
        error: `Page not found: ${args.page}`,
      });
    }

    // TODO: Milestone 2b — AI validation agent loop goes here

    // Update page status
    sessionManager.updateSession(session.sessionId, {
      pagesValidated: [{ path: args.page, status: 'validated' }],
    });

    // Cleanup pod, persist session
    await cleanupSession(session.sessionId, podName, namespace, logger);

    return textResponse({
      success: true,
      sessionId: session.sessionId,
      repo: args.repo,
      page: args.page,
      status: 'completed',
      message: `Validated ${args.page}. Pod cleaned up. Session record retained.`,
    });
  } catch (error) {
    // Ensure cleanup on unexpected errors
    await cleanupSession(session.sessionId, podName, namespace, logger);
    return textResponse({
      success: false,
      sessionId: session.sessionId,
      error: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Main handler for the validateDocs MCP tool.
 */
export async function handleValidateDocsTool(
  args: ValidateDocsInput,
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  logger.info(`Processing validateDocs action: ${args.action}`, { requestId });

  switch (args.action) {
    case 'validate':
      return handleValidate(args, logger);
    default:
      return textResponse({
        success: false,
        error: `Unknown action: ${(args as { action: string }).action}`,
      });
  }
}
