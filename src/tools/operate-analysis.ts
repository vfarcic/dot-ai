import { GenericSessionManager } from '../core/generic-session-manager';
import { KUBECTL_INVESTIGATION_TOOLS, executeKubectlTools } from '../core/kubectl-tools';
import { createAIProvider } from '../core/ai-provider-factory';
import { Logger } from '../core/error-handling';
import { loadPrompt } from '../core/shared-prompt-loader';
import { getVisualizationUrl } from '../core/visualization';
import {
  EmbeddedContext,
  OperateSessionData,
  OperateSession,
  embedContext,
  formatPatterns,
  formatPolicies,
  formatCapabilities
} from './operate';

/**
 * Analyzes user intent and generates operational proposal using AI tool loop
 *
 * @param intent - User's operational intent (e.g., "update my-api to v2.0")
 * @param logger - Logger instance
 * @param sessionManager - Session manager instance
 * @param sessionId - Optional session ID for refinement
 * @param interaction_id - Optional interaction ID for eval datasets
 * @returns Operation output with proposed changes
 */
export async function analyzeIntent(
  intent: string,
  logger: Logger,
  sessionManager: GenericSessionManager<OperateSessionData>,
  sessionId?: string,
  interaction_id?: string
): Promise<any> {
  logger.info('Starting operate analysis', { intent, sessionId });

  // 1. Embed context (patterns, policies, capabilities)
  const context = await embedContext(intent, logger);

  // 2. Load prompts (static system + dynamic user message)
  const systemPrompt = loadSystemPrompt();
  const userMessage = buildUserMessage(intent, context);

  // 3. Execute AI tool loop with kubectl tools
  const aiResult = await executeToolLoop(systemPrompt, userMessage, logger, interaction_id);

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
    ...(visualizationUrl && { visualizationUrl }),  // PRD #320: Include visualization URL if WEB_UI_BASE_URL is set
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
      validationIntent: session.data.validationIntent
    },
    message: 'Operational proposal generated successfully. Review changes and execute with operate(sessionId, executeChoice=1).',
    nextAction: `Review the proposed changes and call operate({ sessionId: "${session.sessionId}", executeChoice: 1 }) to execute.`
  };
}

/**
 * Loads static system prompt from prompts/operate-system.md
 * This prompt is cacheable across all operate calls
 */
function loadSystemPrompt(): string {
  return loadPrompt('operate-system');
}

/**
 * Builds dynamic user message with intent and embedded context
 * Uses template from prompts/operate-user.md and formatting functions from operate.ts
 */
function buildUserMessage(intent: string, context: EmbeddedContext): string {
  // Format context sections using shared formatting functions
  const patternsText = formatPatterns(context.patterns);
  const policiesText = formatPolicies(context.policies);
  const capabilitiesText = formatCapabilities(context.capabilities);

  // Use loadPrompt with Handlebars template variables
  return loadPrompt('operate-user', {
    intent,
    patterns: patternsText,
    policies: policiesText,
    capabilities: capabilitiesText
  });
}

/**
 * Executes AI tool loop with kubectl investigation tools
 * AI autonomously inspects cluster and validates changes with dry-run
 *
 * @param systemPrompt - Static instructions (cacheable)
 * @param userMessage - Dynamic content with intent and context
 * @param logger - Logger instance
 * @param interaction_id - Optional interaction ID for eval datasets
 * @returns AI's final response
 * @throws Error if AI fails to converge within 30 iterations
 */
async function executeToolLoop(
  systemPrompt: string,
  userMessage: string,
  logger: Logger,
  interaction_id?: string
): Promise<string> {
  logger.debug('Starting AI tool loop for operate analysis');

  const aiProvider = createAIProvider();

  const result = await aiProvider.toolLoop({
    systemPrompt,
    userMessage,
    tools: KUBECTL_INVESTIGATION_TOOLS,
    toolExecutor: executeKubectlTools,
    maxIterations: 30,
    operation: 'operate-analysis',
    evaluationContext: {
      user_intent: userMessage.substring(0, 200) // First 200 chars as context
    },
    interaction_id
  });

  logger.debug('AI tool loop completed', {
    iterations: result.iterations,
    toolCallsExecuted: result.toolCallsExecuted.length,
    responseLength: result.finalMessage.length
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
function parseAIResponse(response: string, logger: Logger): any {
  logger.debug('Parsing AI response');

  // Try to extract JSON from code block first (Claude format)
  const jsonMatch = response.match(/```json\n([\s\S]+?)\n```/);

  let jsonContent: string;
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
  } else {
    // Fallback: try to parse raw JSON response (Gemini format)
    // Look for JSON object starting with { and ending with }
    const rawJsonMatch = response.match(/^\s*(\{[\s\S]*\})\s*$/);
    if (rawJsonMatch) {
      jsonContent = rawJsonMatch[1];
      logger.debug('Parsing raw JSON response (no code block wrapper)');
    } else {
      const truncatedResponse = response.substring(0, 500);
      logger.error(`AI response not valid JSON. Response: ${truncatedResponse}`);
      throw new Error(
        'AI did not return structured JSON response. Expected JSON object or ```json code block.'
      );
    }
  }

  try {
    const parsed = JSON.parse(jsonContent);

    // Validate required fields
    if (!parsed.analysis || typeof parsed.analysis !== 'string') {
      throw new Error('AI response missing required "analysis" field (string)');
    }

    if (!parsed.commands || !Array.isArray(parsed.commands)) {
      throw new Error('AI response missing required "commands" array');
    }

    if (parsed.commands.length === 0) {
      throw new Error('AI response has empty "commands" array - no operations proposed');
    }

    if (!parsed.dryRunValidation || typeof parsed.dryRunValidation !== 'object') {
      throw new Error('AI response missing required "dryRunValidation" object');
    }

    // Trust AI's claim but log for audit trail
    logger.info('AI dry-run validation status', {
      validation: parsed.dryRunValidation,
      status: parsed.dryRunValidation.status
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
      parsed.risks = { level: 'low', description: 'No specific risks identified' };
    }

    // Ensure validationIntent exists
    if (!parsed.validationIntent || typeof parsed.validationIntent !== 'string') {
      parsed.validationIntent = 'Validate that the operation completed successfully';
    }

    logger.debug('AI response parsed successfully', {
      commandCount: parsed.commands.length,
      createCount: changes.create.length,
      updateCount: changes.update.length,
      deleteCount: changes.delete.length
    });

    return parsed;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to parse AI response: ${errorMsg}`);
    throw new Error(`Invalid AI response format: ${errorMsg}`);
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
  proposedChanges: any,
  sessionManager: GenericSessionManager<OperateSessionData>,
  sessionId: string | undefined,
  interaction_id: string | undefined,
  logger: Logger
): Promise<OperateSession> {
  const sessionData: OperateSessionData = {
    toolName: 'operate',  // PRD #320: Tool identifier for visualization prompt selection
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
    status: 'analysis_complete'
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
