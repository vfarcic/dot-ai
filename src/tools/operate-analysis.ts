import { GenericSessionManager } from '../core/generic-session-manager';
import { PluginManager } from '../core/plugin-manager';
import {
  isMcpClientInitialized,
  getMcpClientManager,
} from '../core/mcp-client-registry';
import { createAIProvider } from '../core/ai-provider-factory';
import { Logger } from '../core/error-handling';
import { loadPromptOrThrow } from '../core/shared-prompt-loader';
import { getVisualizationUrl } from '../core/visualization';
import { extractJsonFromAIResponse } from '../core/platform-utils';
import {
  buildUntrustedEvidenceBlock,
  neutraliseBoundaryTokens,
  withUntrustedContentBoundary,
} from '../core/untrusted-content';
import {
  EmbeddedContext,
  OperateSessionData,
  OperateSession,
  ProposedChanges,
  embedContext,
  formatKnowledgeContext,
  formatCapabilities,
} from './operate';

/**
 * Parsed AI response for operate analysis
 */
interface ParsedOperateResponse {
  analysis: string;
  currentState: unknown;
  proposedChanges: ProposedChanges;
  commands: string[];
  dryRunValidation: {
    status: 'success' | 'failed';
    details: string;
  };
  patternsApplied: string[];
  capabilitiesUsed: string[];
  policiesChecked: string[];
  risks: {
    level: 'low' | 'medium' | 'high';
    description: string;
  };
  validationIntent: string;
}

/**
 * Result type for operate analysis
 */
interface OperateAnalysisResult {
  status: 'awaiting_user_approval';
  sessionId: string;
  visualizationUrl?: string;
  analysis: {
    summary: string;
    currentState: unknown;
    proposedChanges: ProposedChanges;
    commands: string[];
    dryRunValidation: {
      status: 'success' | 'failed';
      details: string;
    };
    patternsApplied: string[];
    capabilitiesUsed: string[];
    policiesChecked: string[];
    risks: {
      level: 'low' | 'medium' | 'high';
      description: string;
    };
    validationIntent: string;
  };
  message: string;
  agentInstructions: string;
}

/**
 * Analyzes user intent and generates operational proposal using AI tool loop
 *
 * PRD #343: pluginManager is required - all kubectl operations go through plugin.
 *
 * @param intent - User's operational intent (e.g., "update my-api to v2.0")
 * @param logger - Logger instance
 * @param sessionManager - Session manager instance
 * @param pluginManager - Plugin manager for kubectl operations
 * @param sessionId - Optional session ID for refinement
 * @param interaction_id - Optional interaction ID for eval datasets
 * @param evidence - PRD #811 M4: optional material the caller quoted rather than
 *   wrote, composed into the user message inside an untrusted-content boundary
 * @returns Operation output with proposed changes
 */
export async function analyzeIntent(
  intent: string,
  logger: Logger,
  sessionManager: GenericSessionManager<OperateSessionData>,
  pluginManager: PluginManager,
  sessionId?: string,
  interaction_id?: string,
  evidence?: string
): Promise<OperateAnalysisResult> {
  logger.info('Starting operate analysis', { intent, sessionId });

  // 1. Embed context (patterns, policies, capabilities)
  // Only the operator's own request steers the vector search: `evidence` is
  // attacker-influenceable text, and letting it choose which capabilities and
  // knowledge get embedded would be a way to steer the operation from outside
  // the authoritative channel.
  const context = await embedContext(intent, logger);

  // 2. Load prompts (static system + dynamic user message)
  const systemPrompt = loadSystemPrompt();
  const userMessage = buildUserMessage(intent, context, evidence);

  // 3. Execute AI tool loop with kubectl tools (PRD #343: via plugin)
  const aiResult = await executeToolLoop(
    systemPrompt,
    userMessage,
    logger,
    pluginManager,
    interaction_id
  );

  // 4. Parse AI response into structured format
  const proposedChanges = parseAIResponse(aiResult, logger);

  // 5. Create and save session
  const session = await saveAnalysisSession(
    intent,
    context,
    proposedChanges,
    sessionManager,
    sessionId,
    interaction_id,
    logger
  );

  logger.info('Operate analysis complete', { sessionId: session.sessionId });

  // PRD #320: Generate visualization URL for analysis response
  const visualizationUrl = getVisualizationUrl(session.sessionId);

  // 6. Return formatted output for user
  return {
    status: 'awaiting_user_approval',
    sessionId: session.sessionId,
    ...(visualizationUrl && { visualizationUrl }), // PRD #320: Include visualization URL if WEB_UI_BASE_URL is set
    analysis: {
      summary: proposedChanges.analysis,
      currentState: proposedChanges.currentState,
      proposedChanges: session.data.proposedChanges,
      commands: session.data.commands,
      dryRunValidation: session.data.dryRunValidation,
      patternsApplied: session.data.patternsApplied,
      capabilitiesUsed: session.data.capabilitiesUsed,
      policiesChecked: session.data.policiesChecked,
      risks: session.data.risks,
      validationIntent: session.data.validationIntent,
    },
    message:
      'Operational proposal generated successfully. Review changes and execute with operate(sessionId, executeChoice=1).',
    agentInstructions: `Review the proposed changes. You can call operate({ sessionId: "${session.sessionId}", executeChoice: 1 }) to execute directly, or run impact_analysis first to understand the blast radius and downstream dependencies before executing.`,
  };
}

/**
 * Loads static system prompt from prompts/operate-system.md
 * This prompt is cacheable across all operate calls
 */
function loadSystemPrompt(): string {
  return loadPromptOrThrow('operate-system');
}

/**
 * Builds dynamic user message with the operator's request and embedded context.
 * Uses template from prompts/operate-user.md and formatting functions from operate.ts.
 *
 * PRD #375: Unified Knowledge Base — uses single knowledgeContext instead of
 * separate patterns/policies sections.
 *
 * PRD #811 M4: the caller's `evidence`, when there is any, is delimited by
 * {@link buildUntrustedEvidenceBlock} and framed by the template as data. When
 * there is none the template emits no `# Quoted Evidence` section and no
 * region at all, so callers that send `intent` alone get the message they have
 * always got — for any `intent` that carries no boundary token, the one thing
 * {@link neutraliseBoundaryTokens} rewrites. That guard is on the *trusted*
 * field on purpose: a laundered `intent` could otherwise open an
 * `<untrusted_evidence>` region of its own, or emit a balanced pair ahead of the
 * real one, and no honest operator types a boundary tag into a request.
 *
 * **All three interpolations are guarded, not just `intent`.** This template has
 * two other slots, and both are triple-stache and both are writable by someone:
 * `knowledgeContext` carries `chunk.content` straight out of Qdrant ingest with
 * no escaping, and `capabilities` carries CRD descriptions anyone who can
 * `kubectl apply` a CRD chooses. Guarding `intent` alone would leave the forgery
 * the guard exists to stop available through either of them — a balanced
 * `<untrusted_evidence>…</untrusted_evidence>` pair emitted ahead of the real
 * region makes everything after it, including this template's own trailing
 * instruction, read as trusted message text the attacker wrote. Whether those
 * two deserve a fence and a channel of their own is a separate question the PRD's
 * threat model does not answer; neutralising them is the structural half, and it
 * is a no-op for honest content.
 *
 * Exported so the claim above is testable as behaviour rather than as a grep
 * over this file — the three slots reach the model through one composed string,
 * and counting the regions in it is what says no slot forged one.
 */
export function buildUserMessage(
  intent: string,
  context: EmbeddedContext,
  evidence?: string
): string {
  // Format context sections using shared formatting functions
  const knowledgeContextText = formatKnowledgeContext(context.knowledgeChunks);
  const capabilitiesText = formatCapabilities(context.capabilities);

  // Use loadPrompt with Handlebars template variables
  return loadPromptOrThrow('operate-user', {
    intent: neutraliseBoundaryTokens(intent),
    evidenceBlock: buildUntrustedEvidenceBlock(evidence),
    knowledgeContext: neutraliseBoundaryTokens(knowledgeContextText),
    capabilities: neutraliseBoundaryTokens(capabilitiesText),
  });
}

/** Kubectl and Helm tool names for investigation and dry-run validation */
const KUBECTL_INVESTIGATION_TOOL_NAMES = [
  'kubectl_get',
  'kubectl_describe',
  'kubectl_logs',
  'kubectl_events',
  'kubectl_api_resources',
  'kubectl_get_crd_schema',
  'kubectl_get_resource_json',
  // Dry-run tools for validation
  'kubectl_patch_dryrun',
  'kubectl_apply_dryrun',
  'kubectl_delete_dryrun',
  // Helm investigation tools (PRD #251: Helm Day-2 operations)
  'helm_list',
  'helm_status',
  'helm_history',
  'helm_get_values',
  // Helm dry-run validation (PRD #251)
  'helm_install_dryrun',
];

/**
 * Executes AI tool loop with kubectl investigation tools
 * AI autonomously inspects cluster and validates changes with dry-run
 *
 * PRD #343: Kubectl tools are routed through the plugin system.
 *
 * @param systemPrompt - Static instructions (cacheable)
 * @param userMessage - Dynamic content with intent and context
 * @param logger - Logger instance
 * @param pluginManager - Plugin manager for kubectl operations
 * @param interaction_id - Optional interaction ID for eval datasets
 * @returns AI's final response
 * @throws Error if AI fails to converge within 30 iterations
 */
async function executeToolLoop(
  systemPrompt: string,
  userMessage: string,
  logger: Logger,
  pluginManager: PluginManager,
  interaction_id?: string
): Promise<string> {
  logger.debug('Starting AI tool loop for operate analysis');

  // PRD #343: Get kubectl tools from plugin
  const kubectlTools = pluginManager
    .getDiscoveredTools()
    .filter(t => KUBECTL_INVESTIGATION_TOOL_NAMES.includes(t.name));

  if (kubectlTools.length === 0) {
    throw new Error(
      'No kubectl tools available from plugin. Ensure agentic-tools plugin is running.'
    );
  }

  // PRD #358: Get MCP server tools attached to operate
  const mcpTools = isMcpClientInitialized()
    ? getMcpClientManager()!.getToolsForOperation('operate')
    : [];

  const allTools = [...kubectlTools, ...mcpTools];

  logger.debug('Using investigation tools', {
    kubectlToolCount: kubectlTools.length,
    mcpToolCount: mcpTools.length,
    tools: allTools.map(t => t.name),
  });

  // PRD #343: Create tool executor that routes through plugin
  // PRD #358: Chain MCP executor with plugin executor as fallback
  const pluginExecutor = pluginManager.createToolExecutor();
  const composedExecutor = isMcpClientInitialized()
    ? getMcpClientManager()!.createToolExecutor(pluginExecutor)
    : pluginExecutor;

  // PRD #811: every result of this loop re-enters model context delimited as
  // untrusted, and `prompts/operate-system.md` tells the model what that
  // delimiter means. Wrapped around the *composed* executor so plugin output
  // and attached MCP servers are both covered.
  const toolExecutor = withUntrustedContentBoundary(composedExecutor);

  const aiProvider = createAIProvider();

  const result = await aiProvider.toolLoop({
    systemPrompt,
    userMessage,
    tools: allTools,
    toolExecutor: toolExecutor,
    maxIterations: 30,
    operation: 'operate-analysis',
    evaluationContext: {
      user_intent: userMessage.substring(0, 200), // First 200 chars as context
    },
    interaction_id,
  });

  logger.debug('AI tool loop completed', {
    iterations: result.iterations,
    toolCallsExecuted: result.toolCallsExecuted.length,
    responseLength: result.finalMessage.length,
  });

  return result.finalMessage;
}

/**
 * Parses AI response into structured ProposedChanges format
 * Enforces strict JSON parsing with validation
 *
 * @param response - AI's final response
 * @param logger - Logger instance
 * @returns Parsed proposed changes
 * @throws Error if response is not valid JSON or missing required fields
 */
function parseAIResponse(
  response: string,
  logger: Logger
): ParsedOperateResponse {
  logger.debug('Parsing AI response');

  try {
    // Robustly extract the JSON object from the AI response. Reuses the shared
    // extractor (platform-utils), also used by recommend/schema/evaluators: it
    // handles ```json / ``` code fences AND tolerates prose before or after the
    // JSON object. Previously a stray sentence the model appended inside the
    // ```json block made JSON.parse fail with "Unexpected non-whitespace
    // character after JSON" — an intermittent operate flake.
    const parsed = extractJsonFromAIResponse(response) as ParsedOperateResponse;

    // Validate required fields
    if (!parsed.analysis || typeof parsed.analysis !== 'string') {
      throw new Error('AI response missing required "analysis" field (string)');
    }

    if (!parsed.commands || !Array.isArray(parsed.commands)) {
      throw new Error('AI response missing required "commands" array');
    }

    if (parsed.commands.length === 0) {
      throw new Error(
        'AI response has empty "commands" array - no operations proposed'
      );
    }

    if (
      !parsed.dryRunValidation ||
      typeof parsed.dryRunValidation !== 'object'
    ) {
      throw new Error('AI response missing required "dryRunValidation" object');
    }

    // Trust AI's claim but log for audit trail
    logger.info('AI dry-run validation status', {
      validation: parsed.dryRunValidation,
      status: parsed.dryRunValidation.status,
    });

    // Ensure proposedChanges structure exists
    if (!parsed.proposedChanges) {
      parsed.proposedChanges = { create: [], update: [], delete: [] };
    }

    // Validate proposedChanges structure
    const changes = parsed.proposedChanges;
    if (!Array.isArray(changes.create)) changes.create = [];
    if (!Array.isArray(changes.update)) changes.update = [];
    if (!Array.isArray(changes.delete)) changes.delete = [];

    // Ensure metadata arrays exist
    if (!Array.isArray(parsed.patternsApplied)) parsed.patternsApplied = [];
    if (!Array.isArray(parsed.capabilitiesUsed)) parsed.capabilitiesUsed = [];
    if (!Array.isArray(parsed.policiesChecked)) parsed.policiesChecked = [];

    // Ensure risks object exists
    if (!parsed.risks) {
      parsed.risks = {
        level: 'low',
        description: 'No specific risks identified',
      };
    }

    // Ensure validationIntent exists
    if (
      !parsed.validationIntent ||
      typeof parsed.validationIntent !== 'string'
    ) {
      parsed.validationIntent =
        'Validate that the operation completed successfully';
    }

    logger.debug('AI response parsed successfully', {
      commandCount: parsed.commands.length,
      createCount: changes.create.length,
      updateCount: changes.update.length,
      deleteCount: changes.delete.length,
    });

    return parsed;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to parse AI response: ${errorMsg}`);
    throw new Error(`Invalid AI response format: ${errorMsg}`, {
      cause: error,
    });
  }
}

/**
 * Saves analysis session to disk using GenericSessionManager
 *
 * @param intent - User's operational intent
 * @param context - Embedded context
 * @param proposedChanges - Parsed AI proposal
 * @param sessionManager - Session manager instance
 * @param sessionId - Optional existing session ID for updates
 * @param interaction_id - Optional interaction ID for eval datasets
 * @param logger - Logger instance
 * @returns Saved session
 */
async function saveAnalysisSession(
  intent: string,
  context: EmbeddedContext,
  proposedChanges: ParsedOperateResponse,
  sessionManager: GenericSessionManager<OperateSessionData>,
  sessionId: string | undefined,
  interaction_id: string | undefined,
  logger: Logger
): Promise<OperateSession> {
  const sessionData: OperateSessionData = {
    toolName: 'operate', // PRD #320: Tool identifier for visualization prompt selection
    intent,
    interaction_id,
    context,
    proposedChanges: proposedChanges.proposedChanges,
    commands: proposedChanges.commands,
    dryRunValidation: proposedChanges.dryRunValidation,
    patternsApplied: proposedChanges.patternsApplied,
    capabilitiesUsed: proposedChanges.capabilitiesUsed,
    policiesChecked: proposedChanges.policiesChecked,
    risks: proposedChanges.risks,
    validationIntent: proposedChanges.validationIntent,
    status: 'analysis_complete',
  };

  if (sessionId) {
    // Update existing session (refinement case)
    logger.debug('Updating existing operate session', { sessionId });
    await sessionManager.replaceSession(sessionId, sessionData);
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Failed to retrieve session ${sessionId} after update`);
    }
    return session;
  } else {
    // Create new session
    logger.debug('Creating new operate session');
    const session = await sessionManager.createSession(sessionData);
    logger.info('Operate session created', { sessionId: session.sessionId });
    return session;
  }
}
