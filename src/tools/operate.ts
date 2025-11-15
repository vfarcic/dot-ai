/**
 * Operate Tool - AI-powered Kubernetes application operations
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity, Logger, ConsoleLogger } from '../core/error-handling';
import { GenericSessionManager } from '../core/generic-session-manager';
import { PatternVectorService } from '../core/pattern-vector-service';
import { PolicyVectorService } from '../core/policy-vector-service';
import { CapabilityVectorService } from '../core/capability-vector-service';
import { OrganizationalPattern, PolicyIntent } from '../core/organizational-types';
import { ResourceCapability } from '../core/capabilities';

// Tool metadata for direct MCP registration
export const OPERATE_TOOL_NAME = 'operate';
export const OPERATE_TOOL_DESCRIPTION = 'AI-powered Kubernetes application operations tool for Day 2 operations. Handles updates, scaling, enhancements, rollbacks, and deletions through natural language intents. Analyzes current state, applies organizational patterns and policies, validates changes via dry-run, and executes approved operations safely.';

// Zod schema for MCP registration
export const OPERATE_TOOL_INPUT_SCHEMA = {
  intent: z.string().min(1).max(2000).optional().describe('User intent for operation: "update X to Y", "scale Z", "make W HA", etc.'),
  sessionId: z.string().optional().describe('Session ID from previous operate call'),
  executeChoice: z.number().min(1).max(1).optional().describe('Execute approved changes (1=execute)'),
  refinedIntent: z.string().min(1).max(2000).optional().describe('Clarified intent if user wants to provide more details'),
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.')
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
export interface OperateSessionData {
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
  status: 'analyzing' | 'analysis_complete' | 'executing' | 'executed_successfully' | 'executed_with_errors' | 'failed';
  executionResults?: ExecutionResult[];
}

// Full session type (GenericSession wraps the data)
export type OperateSession = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  data: OperateSessionData;
};

export interface EmbeddedContext {
  patterns: OrganizationalPattern[];
  policies: PolicyIntent[];
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
  analysis?: {
    summary: string;
    currentState: any;
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
  nextAction?: string;
}

// Session manager instance
const sessionManager = new GenericSessionManager<OperateSessionData>('opr');

// Initialize logger
const logger = new ConsoleLogger('OperateTool');

/**
 * Embed context (patterns, policies, capabilities) for AI analysis
 * @param intent User's operational intent
 * @returns Embedded context with patterns, policies, and capabilities
 * @throws Error if capabilities are not available (mandatory)
 */
export async function embedContext(intent: string, logger: Logger): Promise<EmbeddedContext> {
  const context: EmbeddedContext = {
    patterns: [],
    policies: [],
    capabilities: []
  };

  // Search for relevant patterns (optional - non-blocking)
  try {
    const patternService = new PatternVectorService();
    const patternResults = await patternService.searchPatterns(intent, { limit: 5 });
    context.patterns = patternResults.map(result => result.data);
    logger.info(`Found ${context.patterns.length} relevant organizational patterns`);
  } catch (error) {
    logger.warn('Pattern search failed, continuing without patterns', { error });
  }

  // Search for relevant policies (optional - non-blocking)
  try {
    const policyService = new PolicyVectorService();
    const policyResults = await policyService.searchPolicyIntents(intent, { limit: 5 });
    context.policies = policyResults.map(result => result.data);
    logger.info(`Found ${context.policies.length} relevant organizational policies`);
  } catch (error) {
    logger.warn('Policy search failed, continuing without policies', { error });
  }

  // Search for relevant cluster capabilities (MANDATORY)
  try {
    // Use QDRANT_CAPABILITIES_COLLECTION env var for collection name
    // Integration tests set this to 'capabilities-policies' (pre-populated test data)
    // Production uses default 'capabilities' collection
    const collectionName = process.env.QDRANT_CAPABILITIES_COLLECTION || 'capabilities';
    const capabilityService = new CapabilityVectorService(collectionName);
    const capabilityResults = await capabilityService.searchCapabilities(intent, { limit: 50 });

    if (capabilityResults.length === 0) {
      throw new Error(
        `No cluster capabilities found for intent "${intent}". Please scan your cluster first:\n` +
        `Run: manageOrgData({ dataType: "capabilities", operation: "scan" })\n` +
        `Note: Capabilities are required to understand what resources and operators are available in the cluster.`
      );
    }

    context.capabilities = capabilityResults.map(result => result.data);
    logger.info(`Found ${context.capabilities.length} relevant cluster capabilities`);
  } catch (error) {
    // If it's our specific "no capabilities" error, re-throw it
    if (error instanceof Error && error.message.includes('No cluster capabilities found')) {
      throw error;
    }

    // Otherwise, it's a capability service initialization or retrieval error
    throw new Error(
      `Capability service not available for intent "${intent}". Please scan your cluster first:\n` +
      `Run: manageOrgData({ dataType: "capabilities", operation: "scan" })\n` +
      `Note: Vector DB is required for capability-based operations.\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return context;
}

/**
 * Format patterns for template placeholder
 */
export function formatPatterns(patterns: OrganizationalPattern[]): string {
  if (patterns.length === 0) {
    return 'No organizational patterns found matching this intent.';
  }

  let formatted = '';
  patterns.forEach((pattern, index) => {
    formatted += `### Pattern ${index + 1}: ${pattern.description}\n\n`;
    formatted += `**Triggers:** ${pattern.triggers.join(', ')}\n\n`;
    formatted += `**Suggested Resources:** ${pattern.suggestedResources.join(', ')}\n\n`;
    formatted += `**Rationale:** ${pattern.rationale}\n\n`;
    if (index < patterns.length - 1) {
      formatted += '---\n\n';
    }
  });

  return formatted;
}

/**
 * Format policies for template placeholder
 */
export function formatPolicies(policies: PolicyIntent[]): string {
  if (policies.length === 0) {
    return 'No organizational policies found matching this intent.';
  }

  let formatted = '';
  policies.forEach((policy, index) => {
    formatted += `### Policy ${index + 1}: ${policy.description}\n\n`;
    if (policy.triggers && policy.triggers.length > 0) {
      formatted += `**Applies to:** ${policy.triggers.join(', ')}\n\n`;
    }
    formatted += `**Rationale:** ${policy.rationale}\n\n`;
    if (index < policies.length - 1) {
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
 */
export async function operate(args: OperateInput): Promise<OperateOutput> {
  try {
    // Route 1: Execute approved operation
    if (args.sessionId && args.executeChoice) {
      // Import and delegate to execution workflow
      const { executeOperations } = await import('./operate-execution');
      return await executeOperations(args.sessionId, logger, sessionManager);
    }

    // Route 2: Refine intent with more context
    if (args.sessionId && args.refinedIntent) {
      // Import and delegate to analysis workflow with refined intent
      const { analyzeIntent } = await import('./operate-analysis');
      return await analyzeIntent(args.refinedIntent, logger, sessionManager, args.sessionId, args.interaction_id);
    }

    // Route 3: New operation analysis
    if (args.intent) {
      // Import and delegate to analysis workflow
      const { analyzeIntent } = await import('./operate-analysis');
      return await analyzeIntent(args.intent, logger, sessionManager, undefined, args.interaction_id);
    }

    // Invalid input
    throw ErrorHandler.createError(
      ErrorCategory.VALIDATION,
      ErrorSeverity.HIGH,
      'Invalid input: must provide either intent (for new operation) or sessionId + executeChoice (for execution)',
      {
        operation: 'operate',
        component: 'OperateTool'
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Operate tool error: ${errorMsg}`);

    return {
      status: 'failed',
      sessionId: args.sessionId || 'unknown',
      message: `Operation failed: ${errorMsg}`
    };
  }
}

/**
 * MCP handler for operate tool
 * Wraps the main operate function with consistent return format
 */
export async function handleOperateTool(args: any): Promise<any> {
  const result = await operate(args);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2)
    }]
  };
}
