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
import { AITool, ToolExecutor } from '../core/ai-provider.interface';
import * as fs from 'fs';
import * as path from 'path';

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
    type: 'readability' | 'syntax' | 'runtime' | 'broken-link';
    severity: 'low' | 'medium' | 'high';
    description: string;
    originalText?: string;
    fixed: boolean;
  }>;
  fixesApplied: Array<{
    page: string;
    description: string;
    reasoning: string;
    originalText?: string;
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
 * Create a simplified 'exec' AITool for the validation AI agent.
 * The AI only specifies `command`; podName/namespace/workdir are handled by the executor.
 */
function createExecAITool(): AITool {
  return {
    name: 'exec',
    description:
      'Execute a bash command. ' +
      'The working directory is the repository root. Use relative paths ' +
      '(e.g., ["cat", "docs/page.md"]).',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Command and arguments to execute (e.g., ["cat", "docs/page.md"])',
        },
      },
      required: ['command'],
    },
  };
}

/**
 * Create a 'patch_file' AITool for targeted file edits.
 * Replaces the first occurrence of old_content with new_content in the file.
 */
function createPatchFileAITool(): AITool {
  return {
    name: 'patch_file',
    description:
      'Replace content in a file. Finds the first occurrence of old_content and replaces it with new_content. ' +
      'Use paths relative to the repository root (e.g., "docs/page.md"). ' +
      'old_content must match exactly what is in the file, including whitespace and newlines.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Path to the file relative to repo root (e.g., "docs/page.md")',
        },
        old_content: {
          type: 'string',
          description: 'The exact text to find and replace',
        },
        new_content: {
          type: 'string',
          description: 'The replacement text',
        },
      },
      required: ['path', 'old_content', 'new_content'],
    },
  };
}

/**
 * Create a tool executor for the validation AI agent.
 * Routes 'exec' and 'patch_file' calls to the pod, injecting podName/namespace
 * and running all commands from /workspace.
 */
function createValidationToolExecutor(
  podName: string,
  namespace: string
): ToolExecutor {
  return async (toolName: string, input: unknown): Promise<unknown> => {
    if (toolName === 'exec') {
      const execInput = input as { command: string[] };
      if (!execInput.command || !Array.isArray(execInput.command)) {
        return {
          stdout: '',
          stderr: 'command must be a non-empty array',
          exitCode: 1,
        };
      }
      // Wrap command to run from /workspace
      const wrappedCommand = [
        'sh',
        '-c',
        `cd /workspace && ${execInput.command.map(c => `'${c.replace(/'/g, "'\\''")}'`).join(' ')}`,
      ];
      try {
        return await execInPod(podName, namespace, wrappedCommand);
      } catch (error) {
        return {
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        };
      }
    }

    if (toolName === 'patch_file') {
      const patchInput = input as {
        path: string;
        old_content: string;
        new_content: string;
      };
      if (
        !patchInput.path ||
        !patchInput.old_content ||
        patchInput.new_content === undefined
      ) {
        return {
          stdout: '',
          stderr: 'path, old_content, and new_content are required',
          exitCode: 1,
        };
      }
      // Resolve path relative to /workspace
      const filePath = patchInput.path.startsWith('/')
        ? patchInput.path
        : `/workspace/${patchInput.path}`;
      // Base64-encode old and new content to avoid shell escaping issues.
      // Uses only base64/sed/awk — no python3 dependency.
      const oldB64 = Buffer.from(patchInput.old_content).toString('base64');
      const newB64 = Buffer.from(patchInput.new_content).toString('base64');
      const script = [
        `echo '${oldB64}' | base64 -d > /tmp/_patch_old`,
        `echo '${newB64}' | base64 -d > /tmp/_patch_new`,
        // awk script: read old/new from files, replace first occurrence in target
        `awk '` +
          `BEGIN { while ((getline line < "/tmp/_patch_old") > 0) old = old (old ? "\\n" : "") line; ` +
          `while ((getline line < "/tmp/_patch_new") > 0) new = new (new ? "\\n" : "") line } ` +
          `{ buf = buf (NR>1 ? "\\n" : "") $0 } ` +
          `END { idx = index(buf, old); ` +
          `if (idx == 0) { print "ERROR: old_content not found in file" > "/dev/stderr"; exit 1 } ` +
          `printf "%s", substr(buf, 1, idx-1) new substr(buf, idx+length(old)); }` +
          `' '${filePath}' > /tmp/_patch_out`,
        `mv /tmp/_patch_out '${filePath}'`,
        `echo OK`,
      ].join(' && ');
      try {
        return await execInPod(podName, namespace, ['sh', '-c', script]);
      } catch (error) {
        return {
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        };
      }
    }

    return { stdout: '', stderr: `Unknown tool: ${toolName}`, exitCode: 1 };
  };
}

/**
 * AI validation response matching the system prompt output format.
 */
interface AIValidationResponse {
  pageStatus: 'validated' | 'fixed' | 'skipped';
  summary: string;
  issuesFound: Array<{
    type: 'readability' | 'syntax' | 'runtime' | 'broken-link';
    severity: 'low' | 'medium' | 'high';
    description: string;
    originalText?: string;
  }>;
  fixesApplied: Array<{
    description: string;
    reasoning: string;
    originalText?: string;
  }>;
}

/**
 * Parse AI validation response from the final message.
 * Extracts JSON using brace-tracking (same algorithm as remediate.ts parseAIFinalAnalysis).
 */
function parseAIValidationResponse(aiResponse: string): AIValidationResponse {
  const firstBraceIndex = aiResponse.indexOf('{');
  if (firstBraceIndex === -1) {
    throw new Error('No JSON found in AI validation response');
  }

  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let jsonEndIndex = -1;

  for (let i = firstBraceIndex; i < aiResponse.length; i++) {
    const char = aiResponse[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') braceCount++;
    if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        jsonEndIndex = i + 1;
        break;
      }
    }
  }

  if (jsonEndIndex === -1) {
    throw new Error(
      'Could not find complete JSON object in AI validation response'
    );
  }

  const jsonStr = aiResponse.substring(firstBraceIndex, jsonEndIndex);
  const parsed = JSON.parse(jsonStr);

  return {
    pageStatus: parsed.pageStatus || 'validated',
    summary: parsed.summary || '',
    issuesFound: Array.isArray(parsed.issuesFound) ? parsed.issuesFound : [],
    fixesApplied: Array.isArray(parsed.fixesApplied) ? parsed.fixesApplied : [],
  };
}

/**
 * Handle 'validate' action — full end-to-end single-page validation.
 * Orchestrates: create session → create pod → clone repo → verify page → AI validation → cleanup.
 */
async function handleValidate(
  args: ValidateDocsInput,
  logger: Logger,
  dotAI: DotAI
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

    // AI Validation Agent Loop (Milestone 2b)
    const aiProvider = dotAI.ai;

    const promptPath = path.join(
      __dirname,
      '..',
      '..',
      'prompts',
      'validate-docs-system.md'
    );
    const systemPrompt = fs.readFileSync(promptPath, 'utf8');

    const execTool = createExecAITool();
    const patchFileTool = createPatchFileAITool();
    const toolExecutor = createValidationToolExecutor(podName, namespace);

    logger.info('Starting AI validation agent loop', {
      sessionId: session.sessionId,
      page: args.page,
    });

    const result = await aiProvider.toolLoop({
      systemPrompt,
      userMessage: `Validate the documentation page at ${args.page}`,
      tools: [execTool, patchFileTool],
      toolExecutor,
      maxIterations: 20,
      operation: 'validate-docs',
    });

    logger.info('AI validation completed', {
      sessionId: session.sessionId,
      iterations: result.iterations,
      toolCalls: result.toolCallsExecuted.length,
    });

    // Parse AI response
    let validationResult: AIValidationResponse;
    try {
      validationResult = parseAIValidationResponse(result.finalMessage);
    } catch (parseError) {
      logger.warn('Failed to parse AI validation response', {
        sessionId: session.sessionId,
        error:
          parseError instanceof Error ? parseError.message : String(parseError),
      });
      validationResult = {
        pageStatus: 'validated',
        summary: result.finalMessage.substring(0, 500),
        issuesFound: [],
        fixesApplied: [],
      };
    }

    // Safety check: verify only the target file was modified
    const diffResult = await execInPod(podName, namespace, [
      'sh',
      '-c',
      'cd /workspace && git diff --name-only',
    ]);
    if (diffResult.exitCode === 0 && diffResult.stdout.trim()) {
      const modifiedFiles = diffResult.stdout
        .trim()
        .split('\n')
        .filter(f => f.trim());
      const unexpectedFiles = modifiedFiles.filter(f => f !== args.page);
      if (unexpectedFiles.length > 0) {
        logger.warn('AI modified unexpected files, reverting', {
          sessionId: session.sessionId,
          unexpectedFiles,
        });
        // Revert unexpected files, keep target page changes
        for (const file of unexpectedFiles) {
          await execInPod(podName, namespace, [
            'sh',
            '-c',
            `cd /workspace && git checkout -- '${file}'`,
          ]);
        }
      }
    }

    // Map AI results to session data types
    const issuesFound = validationResult.issuesFound.map(issue => ({
      page: args.page,
      type: issue.type,
      severity: issue.severity,
      description: issue.description,
      originalText: issue.originalText,
      fixed: validationResult.fixesApplied.some(
        fix => fix.originalText === issue.originalText
      ),
    }));

    const fixesApplied = validationResult.fixesApplied.map(fix => ({
      page: args.page,
      description: fix.description,
      reasoning: fix.reasoning,
      originalText: fix.originalText,
      reverted: false,
    }));

    // Update session with validation results
    sessionManager.updateSession(session.sessionId, {
      pagesValidated: [
        { path: args.page, status: validationResult.pageStatus },
      ],
      issuesFound,
      fixesApplied,
    });

    // Cleanup pod, persist session
    await cleanupSession(session.sessionId, podName, namespace, logger);

    return textResponse({
      success: true,
      sessionId: session.sessionId,
      repo: args.repo,
      page: args.page,
      status: 'completed',
      pageStatus: validationResult.pageStatus,
      summary: validationResult.summary,
      issuesFound,
      fixesApplied,
      iterations: result.iterations,
      toolCalls: result.toolCallsExecuted.length,
      message: `Validated ${args.page}. ${issuesFound.length} issue(s) found, ${fixesApplied.length} fix(es) applied. Pod cleaned up. Session record retained.`,
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
      return handleValidate(args, logger, dotAI);
    default:
      return textResponse({
        success: false,
        error: `Unknown action: ${(args as { action: string }).action}`,
      });
  }
}
