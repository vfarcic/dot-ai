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
  'Manage documentation validation sessions. Creates validation environments (pods), ' +
  'tracks sessions, and handles cleanup. Use action "start" to begin validating a docs repo, ' +
  '"status" to check a session, "list" to see all sessions, "finish" to end a session.';

// Input schema using Zod
export const VALIDATE_DOCS_TOOL_INPUT_SCHEMA = {
  action: z
    .enum(['start', 'status', 'list', 'finish'])
    .describe(
      'Action to perform: "start" creates session + pod, "status" checks session/pod, ' +
        '"list" shows all sessions, "finish" ends session and deletes pod.'
    ),
  repo: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Git repository URL or docs site URL to validate. Required for "start" action.'
    ),
  image: z
    .string()
    .optional()
    .describe(
      'Custom container image for the validation pod. Must include git. ' +
        'If omitted, uses default image (ubuntu:24.04).'
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      'Session ID from a previous start call. Required for "status" and "finish" actions.'
    ),
};

// Input type
export interface ValidateDocsInput {
  action: 'start' | 'status' | 'list' | 'finish';
  repo?: string;
  image?: string;
  sessionId?: string;
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
 * Handle 'start' action — create session and pod.
 */
async function handleStart(
  args: ValidateDocsInput,
  logger: Logger
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.repo) {
    return textResponse({
      success: false,
      error: 'repo is required for "start" action',
    });
  }

  if (!isPluginInitialized()) {
    return textResponse({
      success: false,
      error:
        'Plugin system not available. validateDocs requires agentic-tools plugin.',
    });
  }

  const namespace = DEFAULT_NAMESPACE;
  const ttlHours = getTtlHours();

  // Create session first to get the session ID
  const now = new Date().toISOString();
  const session = sessionManager.createSession({
    toolName: 'validateDocs',
    repo: args.repo,
    podName: '', // Will be updated after pod creation
    podNamespace: namespace,
    containerImage: args.image || '',
    pagesValidated: [],
    issuesFound: [],
    fixesApplied: [],
    feedbackHistory: [],
    status: 'active',
    lastActivityAt: now,
    ttlHours,
  });

  logger.info('Creating validation pod', {
    sessionId: session.sessionId,
    repo: args.repo,
  });

  // Create pod via plugin
  const createArgs: Record<string, unknown> = {
    sessionId: session.sessionId,
    namespace,
    ttlHours,
  };
  if (args.image) {
    createArgs.image = args.image;
  }

  const response = await invokePluginTool(
    PLUGIN_NAME,
    'docs_validate_create_pod',
    createArgs
  );

  if (!response.success) {
    // Clean up the session since pod creation failed
    sessionManager.deleteSession(session.sessionId);
    return textResponse({
      success: false,
      error: response.error?.message || 'Failed to create validation pod',
    });
  }

  // Parse pod creation result
  const result = response.result as {
    success?: boolean;
    data?: string;
    error?: string;
  };
  if (result.success === false) {
    sessionManager.deleteSession(session.sessionId);
    return textResponse({
      success: false,
      error: result.error || 'Failed to create validation pod',
    });
  }

  const podData = JSON.parse(result.data || '{}');

  // Update session with pod info
  sessionManager.updateSession(session.sessionId, {
    podName: podData.podName,
    containerImage: podData.image || args.image || 'ubuntu:24.04',
  });

  logger.info('Validation session started', {
    sessionId: session.sessionId,
    podName: podData.podName,
    namespace,
  });

  return textResponse({
    success: true,
    sessionId: session.sessionId,
    podName: podData.podName,
    namespace: podData.namespace,
    containerImage: podData.image,
    repo: args.repo,
    status: 'active',
    message: `Validation session started. Pod ${podData.podName} is running in namespace ${podData.namespace}.`,
  });
}

/**
 * Handle 'status' action — check session and pod status.
 */
async function handleStatus(
  args: ValidateDocsInput
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.sessionId) {
    return textResponse({
      success: false,
      error: 'sessionId is required for "status" action',
    });
  }

  const session = sessionManager.getSession(args.sessionId);
  if (!session) {
    return textResponse({
      success: false,
      error: `Session not found: ${args.sessionId}`,
    });
  }

  // Check pod status if session is active
  let podPhase = 'Unknown';
  if (session.data.status === 'active' && session.data.podName) {
    if (isPluginInitialized()) {
      const response = await invokePluginTool(
        PLUGIN_NAME,
        'docs_validate_pod_status',
        {
          podName: session.data.podName,
          namespace: session.data.podNamespace,
        }
      );

      if (response.success) {
        const result = response.result as { success?: boolean; data?: string };
        if (result.data) {
          const statusData = JSON.parse(result.data);
          podPhase = statusData.phase;
        }
      }
    }

    // Update lastActivityAt
    const now = new Date().toISOString();
    sessionManager.updateSession(args.sessionId, { lastActivityAt: now });
  } else if (session.data.status === 'finished') {
    podPhase = 'Terminated';
  }

  return textResponse({
    success: true,
    sessionId: session.sessionId,
    repo: session.data.repo,
    status: session.data.status,
    podName: session.data.podName,
    podNamespace: session.data.podNamespace,
    podStatus: podPhase,
    containerImage: session.data.containerImage,
    pagesValidated: session.data.pagesValidated.length,
    issuesFound: session.data.issuesFound.length,
    fixesApplied: session.data.fixesApplied.length,
    createdAt: session.createdAt,
    lastActivityAt: session.data.lastActivityAt,
  });
}

/**
 * Handle 'list' action — list all sessions.
 */
async function handleList(): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const sessionIds = sessionManager.listSessions();
  const sessions = sessionIds
    .map(id => {
      const session = sessionManager.getSession(id);
      if (!session) return null;
      return {
        sessionId: session.sessionId,
        repo: session.data.repo,
        status: session.data.status,
        podName: session.data.podName,
        podNamespace: session.data.podNamespace,
        createdAt: session.createdAt,
        lastActivityAt: session.data.lastActivityAt,
      };
    })
    .filter(Boolean);

  return textResponse({
    success: true,
    sessions,
    total: sessions.length,
  });
}

/**
 * Handle 'finish' action — end session and delete pod.
 */
async function handleFinish(
  args: ValidateDocsInput,
  logger: Logger
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.sessionId) {
    return textResponse({
      success: false,
      error: 'sessionId is required for "finish" action',
    });
  }

  const session = sessionManager.getSession(args.sessionId);
  if (!session) {
    return textResponse({
      success: false,
      error: `Session not found: ${args.sessionId}`,
    });
  }

  if (session.data.status === 'finished') {
    return textResponse({
      success: true,
      sessionId: session.sessionId,
      status: 'finished',
      podDeleted: false,
      message: 'Session was already finished.',
    });
  }

  // Delete the pod
  let podDeleted = false;
  if (session.data.podName && isPluginInitialized()) {
    const response = await invokePluginTool(
      PLUGIN_NAME,
      'docs_validate_delete_pod',
      {
        podName: session.data.podName,
        namespace: session.data.podNamespace,
      }
    );
    podDeleted = response.success === true;
  }

  // Update session status
  const now = new Date().toISOString();
  sessionManager.updateSession(args.sessionId, {
    status: 'finished',
    lastActivityAt: now,
  });

  logger.info('Validation session finished', {
    sessionId: args.sessionId,
    podDeleted,
  });

  return textResponse({
    success: true,
    sessionId: session.sessionId,
    status: 'finished',
    podDeleted,
    message: `Session finished. ${podDeleted ? 'Pod deleted.' : 'Pod was already gone.'} Session record retained.`,
  });
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
    case 'start':
      return handleStart(args, logger);
    case 'status':
      return handleStatus(args);
    case 'list':
      return handleList();
    case 'finish':
      return handleFinish(args, logger);
    default:
      return textResponse({
        success: false,
        error: `Unknown action: ${(args as { action: string }).action}`,
      });
  }
}
