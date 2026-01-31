/**
 * Capability Tools for AI-Powered Cluster Intelligence
 *
 * Shared tool definitions and executor for capability vector DB operations.
 * Used by query, recommend, and other cluster intelligence workflows.
 *
 * PRD #291: Cluster Query Tool - Natural Language Cluster Intelligence
 */

import { AITool } from './ai-provider.interface';
import { CapabilityVectorService } from './capability-vector-service';
import { VALIDATION_MESSAGES } from './constants/validation';

/**
 * Tool: search_capabilities
 * Semantic search for cluster capabilities by intent/concept
 */
export const SEARCH_CAPABILITIES_TOOL: AITool = {
  name: 'search_capabilities',
  description: `Semantic search for cluster capabilities. Use this to find what KINDS of resources relate to a concept (e.g., "database" returns StatefulSet, CNPG Cluster, Crossplane RDS). Returns capability definitions with semantic meaning, not actual resource instances.

This tool is essential for the "semantic bridge" pattern:
1. User asks about a concept (e.g., "databases", "message queues", "web servers")
2. This tool finds which resource KINDS relate to that concept
3. Then use query_resources or kubectl_get to find actual instances of those kinds

Example: "database" might return capabilities for StatefulSet, clusters.postgresql.cnpg.io, compositions.apiextensions.crossplane.io (RDS), etc.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Semantic search query (e.g., "database", "message queue", "web server", "monitoring", "ingress controller")'
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10)'
      }
    },
    required: ['query']
  }
};

/**
 * Tool: query_capabilities
 * Filter-based query for capabilities using Qdrant filter syntax
 */
export const QUERY_CAPABILITIES_TOOL: AITool = {
  name: 'query_capabilities',
  description: `Query capabilities using Qdrant filter syntax. Use this when you need to filter by specific fields like provider, complexity, or group - NOT for semantic/conceptual searches.

Available payload fields for filtering:
- resourceName: string (e.g., "Deployment", "StatefulSet", "Cluster")
- group: string (e.g., "apps", "postgresql.cnpg.io", "apiextensions.crossplane.io")
- apiVersion: string (e.g., "apps/v1", "postgresql.cnpg.io/v1")
- providers: string[] (e.g., ["kubernetes", "crossplane", "cnpg"])
- complexity: string ("low", "medium", "high")
- capabilities: string[] (e.g., ["stateless-workload", "database", "networking"])
- abstractions: string[] (e.g., ["container", "pod", "service"])
- description: string (human-readable description)
- useCase: string (recommended use cases)

Qdrant filter syntax examples:
- Filter by complexity: { "must": [{ "key": "complexity", "match": { "value": "low" } }] }
- Filter by provider: { "must": [{ "key": "providers", "match": { "any": ["crossplane"] } }] }
- Filter by group: { "must": [{ "key": "group", "match": { "value": "postgresql.cnpg.io" } }] }
- Combined filter: { "must": [{ "key": "complexity", "match": { "value": "low" } }, { "key": "providers", "match": { "any": ["kubernetes"] } }] }`,
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'object',
        description: 'Qdrant filter object with must/should/must_not conditions'
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 100)'
      }
    },
    required: ['filter']
  }
};

/**
 * All capability tools for cluster intelligence
 * Convenient array for passing to toolLoop()
 */
export const CAPABILITY_TOOLS: AITool[] = [
  SEARCH_CAPABILITIES_TOOL,
  QUERY_CAPABILITIES_TOOL
];

/**
 * Shared CapabilityVectorService instance for tool execution
 * Initialized lazily on first use
 */
let capabilityService: CapabilityVectorService | null = null;

/**
 * Get or create the capability vector service
 * Uses lazy initialization to avoid startup errors when Qdrant isn't ready
 * Respects QDRANT_CAPABILITIES_COLLECTION env var for collection name
 */
async function getCapabilityService(): Promise<CapabilityVectorService> {
  if (!capabilityService) {
    const collectionName = process.env.QDRANT_CAPABILITIES_COLLECTION || 'capabilities';
    capabilityService = new CapabilityVectorService(collectionName);
    await capabilityService.initialize();
  }
  return capabilityService;
}

/**
 * Tool executor for capability-based tools
 * Handles execution and error handling for all capability tool calls
 *
 * @param toolName - Name of the tool to execute
 * @param input - Tool input parameters
 * @returns Tool execution result
 */
export async function executeCapabilityTools(toolName: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    switch (toolName) {
      case 'search_capabilities': {
        const { query, limit = 10 } = input;

        if (!query) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('query'),
            message: 'search_capabilities requires a query parameter'
          };
        }

        const service = await getCapabilityService();
        const results = await service.searchCapabilities(query as string, { limit: limit as number });

        // Transform results to a clean format for AI consumption
        const capabilities = results.map(r => ({
          resourceName: r.data.resourceName,
          group: r.data.group,
          apiVersion: r.data.apiVersion,
          complexity: r.data.complexity,
          providers: r.data.providers,
          capabilities: r.data.capabilities,
          description: r.data.description,
          useCase: r.data.useCase,
          score: r.score,
          matchType: r.matchType
        }));

        return {
          success: true,
          data: capabilities,
          count: capabilities.length,
          message: `Found ${capabilities.length} capabilities matching "${query}"`
        };
      }

      case 'query_capabilities': {
        const { filter, limit = 100 } = input;

        if (!filter) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('filter'),
            message: 'query_capabilities requires a filter parameter with Qdrant filter syntax'
          };
        }

        const service = await getCapabilityService();
        const results = await service.queryWithFilter(filter as Record<string, unknown>, limit as number);

        // Transform results to a clean format for AI consumption
        const capabilities = results.map(r => ({
          resourceName: r.resourceName,
          group: r.group,
          apiVersion: r.apiVersion,
          complexity: r.complexity,
          providers: r.providers,
          capabilities: r.capabilities,
          description: r.description,
          useCase: r.useCase
        }));

        return {
          success: true,
          data: capabilities,
          count: capabilities.length,
          message: `Found ${capabilities.length} capabilities matching filter`
        };
      }

      default:
        return {
          success: false,
          error: `Unknown capability tool: ${toolName}`,
          message: `Tool '${toolName}' is not implemented`
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      message: `Failed to execute ${toolName}: ${errorMessage}`
    };
  }
}

/**
 * Reset the capability service (useful for testing)
 */
export function resetCapabilityService(): void {
  capabilityService = null;
}
