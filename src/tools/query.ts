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
import {
  KUBECTL_API_RESOURCES_TOOL,
  KUBECTL_GET_TOOL,
  KUBECTL_DESCRIBE_TOOL,
  KUBECTL_LOGS_TOOL,
  KUBECTL_EVENTS_TOOL,
  KUBECTL_GET_CRD_SCHEMA_TOOL,
  executeKubectlTools
} from '../core/kubectl-tools';
import * as fs from 'fs';
import * as path from 'path';

// Tool metadata for MCP registration
export const QUERY_TOOL_NAME = 'query';
export const QUERY_TOOL_DESCRIPTION = 'Natural language query interface for Kubernetes cluster intelligence. Ask questions about your cluster capabilities, resources, and status in plain English. Examples: "What databases can I deploy?", "Show me low complexity capabilities", "What operators are installed?"';

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

// Output interface
export interface QueryOutput {
  success: boolean;
  summary: string;
  toolsUsed: string[];
  iterations: number;
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
 */
export async function handleQueryTool(args: any): Promise<any> {
  const requestId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logger = new ConsoleLogger('QueryTool');

  try {
    // Validate input
    const intent = args.intent;
    if (!intent || typeof intent !== 'string') {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        'Intent is required and must be a string',
        { operation: 'input_validation', component: 'QueryTool' }
      );
    }

    logger.info('Processing query', { requestId, intent });

    // Initialize AI provider
    const aiProvider = createAIProvider();

    // Load system prompt
    const promptPath = path.join(__dirname, '..', '..', 'prompts', 'query-system.md');
    const systemPrompt = fs.readFileSync(promptPath, 'utf8');

    // Combined tool executor for capability, resource, and kubectl tools
    const executeQueryTools = async (toolName: string, input: any): Promise<any> => {
      // Route to appropriate executor based on tool name
      if (toolName.startsWith('search_capabilities') || toolName.startsWith('query_capabilities')) {
        return executeCapabilityTools(toolName, input);
      }
      if (toolName.startsWith('search_resources') || toolName.startsWith('query_resources')) {
        return executeResourceTools(toolName, input);
      }
      if (toolName.startsWith('kubectl_')) {
        return executeKubectlTools(toolName, input);
      }
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
        message: `Tool '${toolName}' is not implemented in query tool`
      };
    };

    // Read-only kubectl tools for live cluster queries
    const KUBECTL_READONLY_TOOLS = [
      KUBECTL_API_RESOURCES_TOOL,
      KUBECTL_GET_TOOL,
      KUBECTL_DESCRIBE_TOOL,
      KUBECTL_LOGS_TOOL,
      KUBECTL_EVENTS_TOOL,
      KUBECTL_GET_CRD_SCHEMA_TOOL
    ];

    // Execute tool loop with capability, resource, and kubectl tools
    const result = await aiProvider.toolLoop({
      systemPrompt,
      userMessage: intent,
      tools: [...CAPABILITY_TOOLS, ...RESOURCE_TOOLS, ...KUBECTL_READONLY_TOOLS],
      toolExecutor: executeQueryTools,
      maxIterations: 10,
      operation: 'query',
      evaluationContext: {
        user_intent: intent
      },
      interaction_id: args.interaction_id
    });

    // Extract data from execution record (reliable, not AI self-reporting)
    const toolsUsed = [...new Set(result.toolCallsExecuted.map(tc => tc.tool))];
    const summary = parseSummary(result.finalMessage);

    logger.info('Query completed', {
      requestId,
      iterations: result.iterations,
      toolsUsed
    });

    const output: QueryOutput = {
      success: true,
      summary,
      toolsUsed,
      iterations: result.iterations
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
