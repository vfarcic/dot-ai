/**
 * Impact Analysis Tool - Dependency & Blast Radius Analysis
 *
 * Accepts free-text input (kubectl commands, YAML manifests, or plain-English
 * descriptions) and uses AI reasoning to discover dependencies and assess
 * whether the operation is safe to proceed.
 *
 * PRD #405: Dependency & Impact Analysis
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity, ConsoleLogger } from '../core/error-handling';
import { createAIProvider } from '../core/ai-provider-factory';
import { CAPABILITY_TOOLS, executeCapabilityTools } from '../core/capability-tools';
import { RESOURCE_TOOLS, executeResourceTools, type SearchResourcesInput, type QueryResourcesInput } from '../core/resource-tools';
import { PluginManager } from '../core/plugin-manager';
import { GenericSessionManager } from '../core/generic-session-manager';
import { loadPrompt } from '../core/shared-prompt-loader';
import { getInternalTools, createInternalToolExecutor, cleanupOldClones } from '../core/internal-tools';

// Tool metadata for MCP registration
export const IMPACT_ANALYSIS_TOOL_NAME = 'impact_analysis';
export const IMPACT_ANALYSIS_TOOL_DESCRIPTION = 'Analyze the blast radius of a proposed Kubernetes operation. Accepts free-text input: kubectl commands (e.g., "kubectl delete pvc data-postgres-0 -n production"), YAML manifests, or plain-English descriptions (e.g., "what happens if I delete the postgres database?"). Returns whether the operation is safe and a detailed dependency analysis with confidence levels.';

// Zod schema for MCP registration
export const IMPACT_ANALYSIS_TOOL_INPUT_SCHEMA = {
  input: z.string().min(1).max(5000).describe(
    'The operation to analyze. Accepts kubectl commands, YAML manifests, or plain-English descriptions.'
  ),
  interaction_id: z.string().optional().describe(
    'INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.'
  ),
};

// Input interface
export interface ImpactAnalysisInput {
  input: string;
  interaction_id?: string;
}

// Output interface
export interface ImpactAnalysisOutput {
  success: boolean;
  safe: boolean;
  summary: string;
  sessionId?: string;
  agentInstructions: string;
  error?: {
    code: string;
    message: string;
  };
  content?: Array<{ type: string; text: string }>;
}

// Session data
interface ImpactAnalysisSessionData {
  toolName: 'impact_analysis';
  input: string;
  safe: boolean;
  summary: string;
  toolsUsed: string[];
  iterations: number;
  toolCallsExecuted: Array<{ tool: string; input: unknown; output: unknown }>;
}

/**
 * Parse the AI's final JSON response to extract safe and summary fields.
 */
function parseImpactAnalysis(aiResponse: string): { safe: boolean; summary: string } {
  try {
    const firstBraceIndex = aiResponse.indexOf('{');
    if (firstBraceIndex === -1) {
      return { safe: false, summary: aiResponse.trim() || 'Analysis completed but no structured output was produced.' };
    }

    // Track brace depth to find complete JSON object
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
      return { safe: false, summary: aiResponse.trim() || 'Analysis completed but no structured output was produced.' };
    }

    const jsonString = aiResponse.substring(firstBraceIndex, jsonEndIndex);
    const parsed = JSON.parse(jsonString);

    return {
      safe: typeof parsed.safe === 'boolean' ? parsed.safe : false,
      summary: parsed.summary || 'No summary provided',
    };
  } catch {
    return { safe: false, summary: aiResponse.trim() || 'Analysis completed but response could not be parsed.' };
  }
}

/**
 * Main impact analysis tool handler
 */
interface ImpactAnalysisToolArgs {
  input?: string;
  interaction_id?: string;
}

export async function handleImpactAnalysisTool(
  args: ImpactAnalysisToolArgs,
  pluginManager?: PluginManager
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const requestId = `impact_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const logger = new ConsoleLogger('ImpactAnalysisTool');

  try {
    // Validate input
    const input = args.input;
    if (!input || typeof input !== 'string') {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        'Input is required and must be a string',
        { operation: 'input_validation', component: 'ImpactAnalysisTool' }
      );
    }

    logger.info('Processing impact analysis', { requestId, inputLength: input.length });

    // Initialize AI provider
    const aiProvider = createAIProvider();

    // Load system prompt
    const systemPrompt = loadPrompt('impact-analysis-system');

    // Local executor for non-plugin tools
    const localToolExecutor = async (toolName: string, toolInput: unknown): Promise<unknown> => {
      if (toolName.startsWith('search_capabilities') || toolName.startsWith('query_capabilities')) {
        return executeCapabilityTools(toolName, toolInput as Record<string, unknown>);
      }
      if (toolName.startsWith('search_resources') || toolName.startsWith('query_resources')) {
        return executeResourceTools(toolName, toolInput as SearchResourcesInput | QueryResourcesInput);
      }
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
        message: `Tool '${toolName}' is not implemented in impact analysis tool`
      };
    };

    // Read-only kubectl tools from plugin
    const KUBECTL_READONLY_TOOL_NAMES = [
      'kubectl_api_resources',
      'kubectl_get',
      'kubectl_describe',
      'kubectl_events',
      'kubectl_get_crd_schema',
    ];
    const pluginKubectlTools = pluginManager
      ? pluginManager.getDiscoveredTools().filter(t => KUBECTL_READONLY_TOOL_NAMES.includes(t.name))
      : [];

    // Build tool list (kubectl + knowledge base + git/fs for GitOps verification)
    const tools = [...CAPABILITY_TOOLS, ...RESOURCE_TOOLS, ...pluginKubectlTools, ...getInternalTools()];

    // Clean up old clone directories (non-blocking)
    cleanupOldClones();

    // Chain executors: plugin tools (kubectl) → internal tools (git/fs) → local tools (capabilities/resources)
    // Internal executor handles git_clone, fs_read, fs_list; falls back to localToolExecutor for capability/resource tools
    const internalToolNames = new Set(['git_clone', 'fs_list', 'fs_read']);
    const internalExecutor = createInternalToolExecutor(requestId);
    const combinedLocalExecutor = async (toolName: string, toolInput: unknown): Promise<unknown> => {
      if (internalToolNames.has(toolName)) {
        return internalExecutor(toolName, toolInput);
      }
      return localToolExecutor(toolName, toolInput);
    };
    const toolExecutor = pluginManager
      ? pluginManager.createToolExecutor(combinedLocalExecutor)
      : combinedLocalExecutor;

    // Execute tool loop
    const result = await aiProvider.toolLoop({
      systemPrompt,
      userMessage: input,
      tools,
      toolExecutor,
      maxIterations: 30,
      operation: 'impact-analysis',
      evaluationContext: {
        user_intent: input
      },
      interaction_id: args.interaction_id
    });

    // Guard: if the AI call did not succeed, surface the real error instead of trying to parse
    if (result.status && result.status !== 'success') {
      throw new Error(`Impact analysis ${result.status}: ${result.finalMessage}`);
    }

    // Parse AI response
    const { safe, summary } = parseImpactAnalysis(result.finalMessage);

    // Extract tools used from execution record
    const toolsUsed = [...new Set(result.toolCallsExecuted.map(tc => tc.tool))];

    logger.info('Impact analysis completed', {
      requestId,
      safe,
      iterations: result.iterations,
      toolsUsed,
    });

    // Store session
    const sessionManager = new GenericSessionManager<ImpactAnalysisSessionData>('imp');
    const session = sessionManager.createSession({
      toolName: 'impact_analysis',
      input,
      safe,
      summary,
      toolsUsed,
      iterations: result.iterations,
      toolCallsExecuted: result.toolCallsExecuted,
    });

    const output: ImpactAnalysisOutput = {
      success: true,
      safe,
      summary,
      sessionId: session.sessionId,
      agentInstructions: safe
        ? 'Present the impact analysis summary to the user. The operation appears safe to proceed.'
        : 'Present the impact analysis summary to the user. The operation is NOT safe — highlight the risks and affected resources before the user proceeds.',
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(output, null, 2)
        }
      ]
    };

  } catch (error) {
    logger.error('Impact analysis failed', error as Error, { requestId });

    if (error instanceof Error && 'category' in error) {
      throw error;
    }

    throw ErrorHandler.createError(
      ErrorCategory.UNKNOWN,
      ErrorSeverity.HIGH,
      `Impact analysis tool failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        operation: 'impact_analysis_tool_execution',
        component: 'ImpactAnalysisTool',
        requestId,
        input: { input: args.input }
      }
    );
  }
}
