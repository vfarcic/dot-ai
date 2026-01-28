/**
 * Query Tool - Natural Language Cluster Intelligence
 *
 * Provides natural language query interface to discover and understand
 * cluster capabilities and resources.
 *
 * PRD #291: Cluster Query Tool - Natural Language Cluster Intelligence
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity, ConsoleLogger } from '../core/error-handling';
import { createAIProvider } from '../core/ai-provider-factory';
import { CAPABILITY_TOOLS, executeCapabilityTools } from '../core/capability-tools';
import { RESOURCE_TOOLS, executeResourceTools } from '../core/resource-tools';
import { PluginManager } from '../core/plugin-manager';
import { GenericSessionManager } from '../core/generic-session-manager';
import {
  getVisualizationUrl,
  parseVisualizationResponse,
  VISUALIZATION_PREFIX,
  CachedVisualization
} from '../core/visualization';
import { MERMAID_TOOLS, executeMermaidTools } from '../core/mermaid-tools';
import { loadPrompt } from '../core/shared-prompt-loader';

// Tool metadata for MCP registration
export const QUERY_TOOL_NAME = 'query';
export const QUERY_TOOL_DESCRIPTION = 'Natural language query interface for Kubernetes cluster intelligence. Ask any questions about your cluster resources, capabilities, and status in plain English. Examples: "What databases are running?", "Describe the nginx deployment", "Show me pods in the kube-system namespace", "What operators are installed?", "Is my-postgres healthy?"';

// Zod schema for MCP registration
export const QUERY_TOOL_INPUT_SCHEMA = {
  intent: z.string().min(1).max(1000).describe('Natural language query about the cluster'),
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.')
};

// Input interface
export interface QueryInput {
  intent: string;
  interaction_id?: string;
}

// Session data stored for visualization (PRD #317, PRD #320)
export interface QuerySessionData {
  toolName: 'query';  // PRD #320: Tool identifier for visualization endpoint
  intent: string;
  summary: string;
  toolsUsed: string[];
  iterations: number;
  toolCallsExecuted: Array<{
    tool: string;
    input: any;
    output: any;
  }>;
  // Cached visualization to avoid re-generation on subsequent requests
  cachedVisualization?: CachedVisualization;
}

// Output interface
export interface QueryOutput {
  success: boolean;
  summary: string;
  toolsUsed: string[];
  iterations: number;
  sessionId?: string;
  visualizationUrl?: string;  // PRD #317: URL to open visualization in Web UI
  guidance: string;  // Agent instructions for presenting the response
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Parse the AI's final JSON response for summary only
 */
function parseSummary(aiResponse: string): string {
  try {
    // Find JSON in the response
    const firstBraceIndex = aiResponse.indexOf('{');
    if (firstBraceIndex === -1) {
      // No JSON found, use the response as summary
      return aiResponse.trim() || 'No summary provided';
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
      return aiResponse.trim() || 'No summary provided';
    }

    const jsonString = aiResponse.substring(firstBraceIndex, jsonEndIndex);
    const parsed = JSON.parse(jsonString);

    return parsed.summary || 'No summary provided';
  } catch (error) {
    // If parsing fails, use the raw response as summary
    return aiResponse.trim() || 'No summary provided';
  }
}

/**
 * Main query tool handler
 *
 * PRD #343: When pluginManager is provided, kubectl tools are routed through
 * the plugin system instead of local execution.
 */
export async function handleQueryTool(
  args: any,
  pluginManager?: PluginManager
): Promise<any> {
  const requestId = `query_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const logger = new ConsoleLogger('QueryTool');

  try {
    // Validate input
    let intent = args.intent;
    if (!intent || typeof intent !== 'string') {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        'Intent is required and must be a string',
        { operation: 'input_validation', component: 'QueryTool' }
      );
    }

    // Detect visualization mode and strip prefix
    const visualizationMode = intent.startsWith(VISUALIZATION_PREFIX);
    if (visualizationMode) {
      intent = intent.slice(VISUALIZATION_PREFIX.length).trim();
    }

    logger.info('Processing query', { requestId, intent, visualizationMode });

    // Initialize AI provider
    const aiProvider = createAIProvider();

    // Load system prompt with appropriate output instructions
    const systemPrompt = loadPrompt('query-system', {
      outputInstructions: visualizationMode
        ? loadPrompt('partials/visualization-output')
        : loadPrompt('partials/query-simple-output')
    });

    // Local executor for non-plugin tools (capability, resource, mermaid)
    const localToolExecutor = async (toolName: string, input: any): Promise<any> => {
      if (toolName.startsWith('search_capabilities') || toolName.startsWith('query_capabilities')) {
        return executeCapabilityTools(toolName, input);
      }
      if (toolName.startsWith('search_resources') || toolName.startsWith('query_resources')) {
        return executeResourceTools(toolName, input);
      }
      if (toolName === 'validate_mermaid') {
        return executeMermaidTools(toolName, input);
      }
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
        message: `Tool '${toolName}' is not implemented in query tool`
      };
    };

    // PRD #343: Use plugin executor when pluginManager is available
    // kubectl tools route through plugin HTTP, others use local executor
    const executeQueryTools = pluginManager
      ? pluginManager.createToolExecutor(localToolExecutor)
      : localToolExecutor;

    // PRD #343: Get kubectl tools from plugin (read-only tools for query)
    // Only include kubectl tools when plugin provides them
    const KUBECTL_READONLY_TOOL_NAMES = [
      'kubectl_api_resources',
      'kubectl_get',
      'kubectl_describe',
      'kubectl_logs',
      'kubectl_events',
      'kubectl_get_crd_schema'
    ];
    const pluginKubectlTools = pluginManager
      ? pluginManager.getDiscoveredTools().filter(t => KUBECTL_READONLY_TOOL_NAMES.includes(t.name))
      : [];

    // Build tool list - add mermaid tools when in visualization mode
    // kubectl tools only available when plugin is configured
    const tools = visualizationMode
      ? [...CAPABILITY_TOOLS, ...RESOURCE_TOOLS, ...pluginKubectlTools, ...MERMAID_TOOLS]
      : [...CAPABILITY_TOOLS, ...RESOURCE_TOOLS, ...pluginKubectlTools];

    // Execute tool loop with capability, resource, and kubectl tools
    const result = await aiProvider.toolLoop({
      systemPrompt,
      userMessage: intent,
      tools,
      toolExecutor: executeQueryTools,
      maxIterations: 30,
      operation: 'query',
      evaluationContext: {
        user_intent: intent
      },
      interaction_id: args.interaction_id
    });

    // Extract data from execution record (reliable, not AI self-reporting)
    const toolsUsed = [...new Set(result.toolCallsExecuted.map(tc => tc.tool))];

    logger.info('Query completed', {
      requestId,
      iterations: result.iterations,
      toolsUsed,
      visualizationMode
    });

    // Handle visualization mode - return visualization response with sessionId for caching
    if (visualizationMode) {
      const visualizationResponse = parseVisualizationResponse(result.finalMessage, toolsUsed);

      // Create session with cached visualization for URL caching/bookmarking (PRD #328)
      const sessionManager = new GenericSessionManager<QuerySessionData>('qry');
      const session = sessionManager.createSession({
        toolName: 'query',
        intent,
        summary: visualizationResponse.title, // Use title as summary for visualization sessions
        toolsUsed,
        iterations: result.iterations,
        toolCallsExecuted: result.toolCallsExecuted,
        cachedVisualization: {
          title: visualizationResponse.title,
          visualizations: visualizationResponse.visualizations,
          insights: visualizationResponse.insights,
          generatedAt: new Date().toISOString()
        }
      });

      logger.info('Visualization session created', {
        requestId,
        sessionId: session.sessionId
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              sessionId: session.sessionId,
              ...visualizationResponse
            }, null, 2)
          }
        ]
      };
    }

    // Normal mode - return summary with session for later visualization
    const summary = parseSummary(result.finalMessage);

    // Store session for visualization (PRD #317, PRD #320)
    const sessionManager = new GenericSessionManager<QuerySessionData>('qry');
    const session = sessionManager.createSession({
      toolName: 'query',  // PRD #320: Tool identifier for visualization endpoint
      intent,
      summary,
      toolsUsed,
      iterations: result.iterations,
      toolCallsExecuted: result.toolCallsExecuted
    });

    // PRD #317: Include visualization URL when WEB_UI_BASE_URL is configured
    const visualizationUrl = getVisualizationUrl(session.sessionId);

    logger.info('Session created for visualization', {
      requestId,
      sessionId: session.sessionId,
      ...(visualizationUrl && { visualizationUrl })
    });

    const guidance = visualizationUrl
      ? 'Present the summary to the user. Include the visualizationUrl at the end of your response.'
      : 'Present the summary to the user.';

    const output: QueryOutput = {
      success: true,
      summary,
      toolsUsed,
      iterations: result.iterations,
      sessionId: session.sessionId,
      ...(visualizationUrl && { visualizationUrl }),
      guidance
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
    logger.error('Query failed', error as Error, { requestId });

    if (error instanceof Error && 'category' in error) {
      throw error;
    }

    throw ErrorHandler.createError(
      ErrorCategory.UNKNOWN,
      ErrorSeverity.HIGH,
      `Query tool failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        operation: 'query_tool_execution',
        component: 'QueryTool',
        requestId,
        input: { intent: args.intent }
      }
    );
  }
}
