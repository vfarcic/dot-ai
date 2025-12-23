/**
 * Resource Tools for AI-Powered Cluster Intelligence
 *
 * Shared tool definitions and executor for resource vector DB operations.
 * Used by query and other cluster intelligence workflows.
 *
 * PRD #291: Cluster Query Tool - Natural Language Cluster Intelligence
 */

import { AITool } from './ai-provider.interface';
import { ResourceVectorService } from './resource-vector-service';

/**
 * Tool: search_resources
 * Semantic search for cluster resources by name, kind, and labels
 */
export const SEARCH_RESOURCES_TOOL: AITool = {
  name: 'search_resources',
  description: `Search for Kubernetes resources in the cluster inventory by name, kind, or labels. This searches the resource metadata stored in Vector DB.

This tool is useful for:
- Finding resources by partial name match (e.g., "nginx" finds nginx-deployment, nginx-service)
- Finding resources by kind (e.g., "deployments" finds all Deployment resources)
- Finding resources by label values (e.g., "frontend" finds resources with tier=frontend label)

Note: This does NOT provide rich semantic understanding like search_capabilities. It matches against resource names, kinds, and label values - not conceptual descriptions. For example, searching "database" will NOT find a StatefulSet unless it has "database" in its name or labels.

For conceptual queries like "what databases are running", use the semantic bridge pattern:
1. Use search_capabilities to find what KINDS relate to "database"
2. Then use query_resources to find instances of those kinds

For live cluster status, use kubectl tools after finding resources.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query matching resource names, kinds, or label values (e.g., "nginx", "Deployment", "frontend")'
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
 * Tool: query_resources
 * Filter-based query for resources using Qdrant filter syntax
 */
export const QUERY_RESOURCES_TOOL: AITool = {
  name: 'query_resources',
  description: `Query cluster resources using Qdrant filter syntax. Use this when you need to filter by specific fields like kind, namespace, or labels.

This is the primary tool for finding resource instances after using search_capabilities to identify relevant kinds.

Available payload fields for filtering:
- id: string (format: namespace:apiVersion:kind:name)
- namespace: string (e.g., "default", "kube-system", "_cluster" for cluster-scoped)
- name: string (resource name)
- kind: string (e.g., "Deployment", "Service", "Pod", "StatefulSet")
- apiVersion: string (e.g., "apps/v1", "v1")
- apiGroup: string (e.g., "apps", "", "postgresql.cnpg.io")
- labels: object (e.g., { "app": "nginx", "env": "prod" })
- annotations: object (resource annotations)
- createdAt: string (ISO timestamp)
- updatedAt: string (ISO timestamp)

Qdrant filter syntax examples:
- Filter by kind: { "must": [{ "key": "kind", "match": { "value": "Deployment" } }] }
- Filter by namespace: { "must": [{ "key": "namespace", "match": { "value": "default" } }] }
- Filter by multiple kinds: { "must": [{ "key": "kind", "match": { "any": ["Deployment", "StatefulSet"] } }] }
- Filter by label: { "must": [{ "key": "labels.app", "match": { "value": "nginx" } }] }
- Combined filter: { "must": [{ "key": "kind", "match": { "value": "Deployment" } }, { "key": "namespace", "match": { "value": "production" } }] }

Note: This queries the resource inventory in Vector DB, not live cluster state.`,
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
 * All resource tools for cluster intelligence
 * Convenient array for passing to toolLoop()
 */
export const RESOURCE_TOOLS: AITool[] = [
  SEARCH_RESOURCES_TOOL,
  QUERY_RESOURCES_TOOL
];

/**
 * Shared ResourceVectorService instance for tool execution
 * Initialized lazily on first use
 */
let resourceService: ResourceVectorService | null = null;

/**
 * Get or create the resource vector service
 * Uses lazy initialization to avoid startup errors when Qdrant isn't ready
 * Respects QDRANT_RESOURCES_COLLECTION env var for collection name
 */
async function getResourceService(): Promise<ResourceVectorService> {
  if (!resourceService) {
    const collectionName = process.env.QDRANT_RESOURCES_COLLECTION || 'resources';
    resourceService = new ResourceVectorService(collectionName);
    await resourceService.initialize();
  }
  return resourceService;
}

/**
 * Tool executor for resource-based tools
 * Handles execution and error handling for all resource tool calls
 *
 * @param toolName - Name of the tool to execute
 * @param input - Tool input parameters
 * @returns Tool execution result
 */
export async function executeResourceTools(toolName: string, input: any): Promise<any> {
  try {
    switch (toolName) {
      case 'search_resources': {
        const { query, limit = 10 } = input;

        if (!query) {
          return {
            success: false,
            error: 'Missing required parameter: query',
            message: 'search_resources requires a query parameter'
          };
        }

        const service = await getResourceService();
        const results = await service.searchData(query, { limit });

        // Transform results to a clean format for AI consumption
        const resources = results.map(r => ({
          id: (r.data as any).id,
          namespace: r.data.namespace,
          name: r.data.name,
          kind: r.data.kind,
          apiVersion: r.data.apiVersion,
          apiGroup: r.data.apiGroup,
          labels: r.data.labels,
          createdAt: r.data.createdAt,
          updatedAt: r.data.updatedAt,
          score: r.score,
          matchType: r.matchType
        }));

        return {
          success: true,
          data: resources,
          count: resources.length,
          message: `Found ${resources.length} resources matching "${query}"`
        };
      }

      case 'query_resources': {
        const { filter, limit = 100 } = input;

        if (!filter) {
          return {
            success: false,
            error: 'Missing required parameter: filter',
            message: 'query_resources requires a filter parameter with Qdrant filter syntax'
          };
        }

        const service = await getResourceService();
        const results = await service.queryWithFilter(filter, limit);

        // Transform results to a clean format for AI consumption
        const resources = results.map(r => ({
          id: (r as any).id,
          namespace: r.namespace,
          name: r.name,
          kind: r.kind,
          apiVersion: r.apiVersion,
          apiGroup: r.apiGroup,
          labels: r.labels,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        }));

        return {
          success: true,
          data: resources,
          count: resources.length,
          message: `Found ${resources.length} resources matching filter`
        };
      }

      default:
        return {
          success: false,
          error: `Unknown resource tool: ${toolName}`,
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
 * Reset the resource service (useful for testing)
 */
export function resetResourceService(): void {
  resourceService = null;
}
