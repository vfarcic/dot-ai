/**
 * Operate Tool - AI-powered Kubernetes application operations
 */

import { z } from 'zod';
import {
  ErrorHandler,
  ErrorCategory,
  ErrorSeverity,
  Logger,
  ConsoleLogger,
} from '../core/error-handling';
import { GenericSessionManager } from '../core/generic-session-manager';
import { PluginManager } from '../core/plugin-manager';
import { getCurrentIdentity } from '../interfaces/request-context';
import { checkToolAccess } from '../core/rbac';
import { CapabilityVectorService } from '../core/capability-vector-service';
import { KnowledgeSearchResultItem } from '../core/knowledge-types';
import { searchKnowledgeBase } from '../core/knowledge-service';
import { ResourceCapability } from '../core/capabilities';
import { BaseVisualizationData } from '../core/visualization';
import { buildAgentDisplayBlock } from '../core/index';

// Tool metadata for direct MCP registration
export const OPERATE_TOOL_NAME = 'operate';
export const OPERATE_TOOL_DESCRIPTION =
  'AI-powered Kubernetes application operations tool for Day 2 operations. Handles updates, scaling, enhancements, rollbacks, and deletions through natural language intents. Analyzes current state, applies organizational patterns and policies, validates changes via dry-run, and executes approved operations safely.';

// Zod schema for MCP registration
export const OPERATE_TOOL_INPUT_SCHEMA = {
  intent: z
    .string()
    .min(1)
    .max(2000)
    .optional()
    .describe(
      'User intent for operation: "update X to Y", "scale Z", "make W HA", etc.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID from previous operate call'),
  executeChoice: z
    .number()
    .min(1)
    .max(1)
    .optional()
    .describe('Execute approved changes (1=execute)'),
  refinedIntent: z
    .string()
    .min(1)
    .max(2000)
    .optional()
    .describe('Clarified intent if user wants to provide more details'),
  interaction_id: z
    .string()
    .optional()
    .describe(
      'INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.'
    ),
};

// Core interfaces
export interface OperateInput {
  intent?: string;
  sessionId?: string;
  executeChoice?: number;
  refinedIntent?: string;
  interaction_id?: string;
}

// Session data stored by GenericSessionManager
// PRD #320: Extends BaseVisualizationData for visualization support
export interface OperateSessionData extends BaseVisualizationData {
  toolName: 'operate'; // PRD #320: Tool identifier for visualization prompt selection
  intent: string;
  interaction_id?: string;
  context: EmbeddedContext;
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
  status:
    | 'analyzing'
    | 'analysis_complete'
    | 'executing'
    | 'executed_successfully'
    | 'executed_with_errors'
    | 'failed';
  executionResults?: ExecutionResult[];
}

// Full session type (GenericSession wraps the data)
export type OperateSession = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  data: OperateSessionData;
};

/**
 * Embedded context for operate analysis.
 * PRD #375: Unified Knowledge Base — patterns and policies are now unified
 * in the knowledge-base collection. knowledgeChunks replaces separate
 * patterns[] and policies[] fields. Chunks include tags for type identification.
 */
export interface EmbeddedContext {
  /** Knowledge chunks from unified knowledge base (includes policy, pattern, and general content) */
  knowledgeChunks: KnowledgeSearchResultItem[];
  capabilities: ResourceCapability[];
}

export interface ProposedChanges {
  create: ResourceChange[];
  update: ResourceChange[];
  delete: ResourceChange[];
}

export interface ResourceChange {
  kind: string;
  name: string;
  namespace?: string;
  manifest?: string;
  changes?: string;
  rationale: string;
}

export interface ExecutionResult {
  command: string;
  success: boolean;
  output?: string;
  error?: string;
  timestamp: Date;
}

export interface OperateOutput {
  status: 'success' | 'failed' | 'awaiting_user_approval';
  sessionId: string;
  visualizationUrl?: string; // PRD #320: URL to open visualization in Web UI
  analysis?: {
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
  execution?: {
    results: ExecutionResult[];
    validation: string;
  };
  message: string;
  agentInstructions?: string;
}

// Session manager instance
const sessionManager = new GenericSessionManager<OperateSessionData>('opr');

// Initialize logger
const logger = new ConsoleLogger('OperateTool');

/**
 * Embed context (knowledge, capabilities) for AI analysis.
 *
 * PRD #375: Unified Knowledge Base — searches single knowledge-base collection
 * instead of separate pattern/policy collections. Results include tags so the
 * AI can distinguish policy, pattern, and general knowledge content.
 *
 * @param intent User's operational intent
 * @param logger Logger instance
 * @returns Embedded context with knowledge chunks and capabilities
 * @throws Error if capabilities are not available (mandatory)
 */
export async function embedContext(
  intent: string,
  logger: Logger
): Promise<EmbeddedContext> {
  const context: EmbeddedContext = {
    knowledgeChunks: [],
    capabilities: [],
  };

  // Search unified knowledge base (optional - non-blocking)
  // Results include tags so AI can see which are policies, patterns, or general content
  try {
    const knowledgeResult = await searchKnowledgeBase({ query: intent, limit: 20 });
    if (knowledgeResult.success) {
      context.knowledgeChunks = knowledgeResult.chunks;
      logger.info(
        `Found ${context.knowledgeChunks.length} relevant knowledge chunks (unified knowledge base)`
      );
    } else {
      logger.warn('Knowledge base search failed, continuing without organizational context', {
        error: knowledgeResult.error,
      });
    }
  } catch (error) {
    logger.warn('Knowledge base search failed, continuing without organizational context', {
      error,
    });
  }

  // Search for relevant cluster capabilities (MANDATORY)
  try {
    // Use QDRANT_CAPABILITIES_COLLECTION env var for collection name
    // Integration tests set this to 'capabilities-policies' (pre-populated test data)
    // Production uses default 'capabilities' collection
    const collectionName =
      process.env.QDRANT_CAPABILITIES_COLLECTION || 'capabilities';
    const capabilityService = new CapabilityVectorService(collectionName);
    const capabilityResults = await capabilityService.searchCapabilities(
      intent,
      { limit: 50 }
    );

    if (capabilityResults.length === 0) {
      throw new Error(
        `No cluster capabilities found for intent "${intent}". Please scan your cluster first:\n` +
          `Run: manageOrgData({ dataType: "capabilities", operation: "scan" })\n` +
          `Note: Capabilities are required to understand what resources and operators are available in the cluster.`
      );
    }

    context.capabilities = capabilityResults.map(result => result.data);
    logger.info(
      `Found ${context.capabilities.length} relevant cluster capabilities`
    );
  } catch (error) {
    // If it's our specific "no capabilities" error, re-throw it
    if (
      error instanceof Error &&
      error.message.includes('No cluster capabilities found')
    ) {
      throw error;
    }

    // Otherwise, it's a capability service initialization or retrieval error
    throw new Error(
      `Capability service not available for intent "${intent}". Please scan your cluster first:\n` +
        `Run: manageOrgData({ dataType: "capabilities", operation: "scan" })\n` +
        `Note: Vector DB is required for capability-based operations.\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  return context;
}

/**
 * Format knowledge chunks for template placeholder.
 *
 * PRD #375: Unified Knowledge Base — replaces separate formatPatterns/formatPolicies.
 * Chunks include tags so the AI can interpret what type each result represents.
 * Tags: "policy" = enforcement rule, "pattern" = reusable architecture, [] = general content.
 */
export function formatKnowledgeContext(chunks: KnowledgeSearchResultItem[]): string {
  if (chunks.length === 0) {
    return 'No relevant organizational knowledge found matching this intent.';
  }

  let formatted = '';
  chunks.forEach((chunk, index) => {
    const typeLabel = chunk.tags.length > 0
      ? chunk.tags.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' + ')
      : 'General';
    formatted += `### Knowledge ${index + 1} [${typeLabel}]\n\n`;
    formatted += `**Source:** ${chunk.uri}\n\n`;
    formatted += (chunk.content.length > 300 ? chunk.content.substring(0, 300) + '...' : chunk.content) + '\n\n';
    if (index < chunks.length - 1) {
      formatted += '---\n\n';
    }
  });

  return formatted;
}

/**
 * Format capabilities for template placeholder
 * Capabilities are already ordered by relevance from vector search
 */
export function formatCapabilities(capabilities: ResourceCapability[]): string {
  if (capabilities.length === 0) {
    return 'No custom capabilities detected. Only standard Kubernetes resources available.';
  }

  // List capabilities in order received (most relevant first from vector search)
  let formatted = '';
  capabilities.forEach(cap => {
    const apiInfo = cap.apiVersion || cap.group || 'core';
    formatted += `- **${cap.resourceName}** (${apiInfo}): ${cap.description || 'Custom resource'}\n`;
    if (cap.capabilities && cap.capabilities.length > 0) {
      formatted += `  Capabilities: ${cap.capabilities.join(', ')}\n`;
    }
  });

  return formatted;
}

/**
 * Main operate tool entry point
 *
 * PRD #343: pluginManager is required - all kubectl operations go through plugin.
 */
export async function operate(
  args: OperateInput,
  pluginManager: PluginManager
): Promise<OperateOutput> {
  try {
    // Route 1: Execute approved operation
    if (args.sessionId && args.executeChoice) {
      // Import and delegate to execution workflow (PRD #359: uses unified registry)
      const { executeOperations } = await import('./operate-execution');
      return await executeOperations(args.sessionId, logger, sessionManager);
    }

    // Route 2: Refine intent with more context
    if (args.sessionId && args.refinedIntent) {
      // Import and delegate to analysis workflow with refined intent
      const { analyzeIntent } = await import('./operate-analysis');
      return await analyzeIntent(
        args.refinedIntent,
        logger,
        sessionManager,
        pluginManager,
        args.sessionId,
        args.interaction_id
      );
    }

    // Route 3: New operation analysis
    if (args.intent) {
      // Import and delegate to analysis workflow
      const { analyzeIntent } = await import('./operate-analysis');
      return await analyzeIntent(
        args.intent,
        logger,
        sessionManager,
        pluginManager,
        undefined,
        args.interaction_id
      );
    }

    // Invalid input
    throw ErrorHandler.createError(
      ErrorCategory.VALIDATION,
      ErrorSeverity.HIGH,
      'Invalid input: must provide either intent (for new operation) or sessionId + executeChoice (for execution)',
      {
        operation: 'operate',
        component: 'OperateTool',
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Operate tool error: ${errorMsg}`);

    return {
      status: 'failed',
      sessionId: args.sessionId || 'unknown',
      message: `Operation failed: ${errorMsg}`,
    };
  }
}

/**
 * MCP handler for operate tool
 * Wraps the main operate function with consistent return format
 *
 * PRD #343: pluginManager is required - all kubectl operations go through plugin.
 */
export async function handleOperateTool(
  args: OperateInput,
  pluginManager: PluginManager
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // PRD #392 Milestone 2: execution route requires 'apply' verb
  if (args.sessionId && args.executeChoice) {
    const identity = getCurrentIdentity();
    const rbacResult = await checkToolAccess(identity, {
      toolName: 'operate',
      verb: 'apply',
    });
    if (!rbacResult.allowed) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'FORBIDDEN',
              message: `Access denied: executing operations requires 'apply' permission on 'operate'. You can analyze and plan operations, but applying changes requires additional authorization.`,
              tool: 'operate',
              user: identity?.email,
            }),
          },
        ],
      };
    }
  }

  const result = await operate(args, pluginManager);

  // PRD #392 Milestone 2: If analysis complete, check apply permission to adjust guidance
  if (result.status === 'awaiting_user_approval') {
    const identity = getCurrentIdentity();
    const applyResult = await checkToolAccess(identity, {
      toolName: 'operate',
      verb: 'apply',
    });
    if (!applyResult.allowed) {
      result.message = `Operational proposal generated successfully. Executing operations requires 'apply' permission on 'operate', which is not granted for the current user. Review the proposed changes and apply them manually using kubectl or your GitOps workflow.`;
      result.agentInstructions = `Review the proposed changes. To apply them, use kubectl or push to Git — executing via operate requires 'apply' permission.`;
    }
  }

  // Build content blocks - JSON for REST API, agent instruction for MCP agents
  const content: Array<{ type: 'text'; text: string }> = [
    {
      type: 'text' as const,
      text: JSON.stringify(result, null, 2),
    },
  ];

  // Add agent instruction block if visualization URL is present
  const agentDisplayBlock = buildAgentDisplayBlock({
    visualizationUrl: result.visualizationUrl,
  });
  if (agentDisplayBlock) {
    content.push(agentDisplayBlock);
  }

  return { content };
}
