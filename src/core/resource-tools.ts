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
import { VALIDATION_MESSAGES } from './constants/validation';
import { executeKubectl } from './kubernetes-utils';

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
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('query'),
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
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('filter'),
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

// ============================================================================
// Dashboard Query Functions (PRD #328)
// Interface-agnostic query operations for structured resource data
// ============================================================================

/**
 * Resource kind information with count
 */
export interface ResourceKindInfo {
  kind: string;
  apiGroup: string;
  apiVersion: string;
  count: number;
}

/**
 * Options for listing resources
 */
export interface ListResourcesOptions {
  kind: string;           // Required: Resource kind to filter by
  apiGroup?: string;      // Optional: API group filter
  apiVersion?: string;    // Optional: Full apiVersion filter (e.g., "apps/v1")
  namespace?: string;     // Optional: Namespace filter
  limit?: number;         // Optional: Max results (default: 100, max: 1000)
  offset?: number;        // Optional: Skip N results for pagination (default: 0)
  includeStatus?: boolean; // Optional: Fetch live status from K8s API
}

/**
 * Resource item for list response
 */
export interface ResourceListItem {
  name: string;
  namespace: string;
  kind: string;
  apiGroup: string;
  apiVersion: string;
  labels: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  status?: object;  // Raw K8s status object when includeStatus: true
}

/**
 * Result of listing resources with pagination info
 */
export interface ListResourcesResult {
  resources: ResourceListItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Get all unique resource kinds with counts
 * Groups resources by kind+apiGroup+apiVersion and counts each group
 *
 * @param namespace - Optional namespace to filter by
 * @returns Array of resource kinds sorted by count descending
 */
export async function getResourceKinds(namespace?: string): Promise<ResourceKindInfo[]> {
  const service = await getResourceService();
  const allResources = await service.getAllData();

  // Group by kind+apiGroup+apiVersion
  const kindMap = new Map<string, ResourceKindInfo>();

  for (const resource of allResources) {
    // Filter by namespace if provided
    if (namespace !== undefined && resource.namespace !== namespace) {
      continue;
    }

    const apiGroup = resource.apiGroup || '';
    const key = `${resource.kind}:${apiGroup}:${resource.apiVersion}`;

    const existing = kindMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      kindMap.set(key, {
        kind: resource.kind,
        apiGroup,
        apiVersion: resource.apiVersion,
        count: 1
      });
    }
  }

  // Sort by count descending
  return Array.from(kindMap.values()).sort((a, b) => b.count - a.count);
}

/**
 * Fetch live status for a single resource from Kubernetes API
 *
 * @param name - Resource name
 * @param namespace - Resource namespace (or '_cluster' for cluster-scoped)
 * @param kind - Resource kind
 * @param apiGroup - API group (empty string for core resources)
 * @returns The status object or undefined if not available
 */
async function fetchResourceStatus(
  name: string,
  namespace: string,
  kind: string,
  apiGroup: string
): Promise<object | undefined> {
  try {
    // Build resource identifier for kubectl
    // For core resources (empty apiGroup), use kind directly. For others, use kind.group format
    const resourceType = apiGroup ? `${kind.toLowerCase()}.${apiGroup}` : kind.toLowerCase();
    const resourceId = `${resourceType}/${name}`;

    // Build kubectl command
    const cmdArgs = ['get', resourceId, '-o', 'json'];

    // Add namespace for namespaced resources
    if (namespace && namespace !== '_cluster') {
      cmdArgs.push('-n', namespace);
    }

    const output = await executeKubectl(cmdArgs);
    const parsed = JSON.parse(output);

    return parsed.status;
  } catch {
    // Return undefined if we can't fetch status (resource may not exist or not accessible)
    return undefined;
  }
}

/**
 * List resources with filtering and pagination
 *
 * @param options - Filter and pagination options
 * @returns Paginated list of resources
 */
export async function listResources(options: ListResourcesOptions): Promise<ListResourcesResult> {
  const { kind, apiGroup, apiVersion, namespace, limit = 100, offset = 0, includeStatus = false } = options;

  // Clamp limit to max 1000
  const effectiveLimit = Math.min(Math.max(1, limit), 1000);
  const effectiveOffset = Math.max(0, offset);

  const service = await getResourceService();
  const allResources = await service.getAllData();

  // Filter resources
  const filtered = allResources.filter(resource => {
    // Kind filter (required)
    if (resource.kind !== kind) {
      return false;
    }

    // API group filter (optional)
    if (apiGroup !== undefined) {
      const resourceApiGroup = resource.apiGroup || '';
      if (resourceApiGroup !== apiGroup) {
        return false;
      }
    }

    // API version filter (optional) - exact match
    if (apiVersion !== undefined && resource.apiVersion !== apiVersion) {
      return false;
    }

    // Namespace filter (optional)
    if (namespace !== undefined && resource.namespace !== namespace) {
      return false;
    }

    return true;
  });

  // Get total count before pagination
  const total = filtered.length;

  // Apply pagination
  const paginated = filtered.slice(effectiveOffset, effectiveOffset + effectiveLimit);

  // Transform to response format
  let resources: ResourceListItem[] = paginated.map(r => ({
    name: r.name,
    namespace: r.namespace,
    kind: r.kind,
    apiGroup: r.apiGroup || '',
    apiVersion: r.apiVersion,
    labels: r.labels || {},
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }));

  // Enrich with live status if requested
  if (includeStatus && resources.length > 0) {
    // Fetch status for all resources in parallel
    const statusPromises = resources.map(async (resource) => {
      const status = await fetchResourceStatus(
        resource.name,
        resource.namespace,
        resource.kind,
        resource.apiGroup
      );
      return { ...resource, status };
    });

    resources = await Promise.all(statusPromises);
  }

  return {
    resources,
    total,
    limit: effectiveLimit,
    offset: effectiveOffset
  };
}

/**
 * Get all unique namespaces from resources
 * Filters out '_cluster' marker for cluster-scoped resources
 *
 * @returns Sorted array of namespace names
 */
export async function getNamespaces(): Promise<string[]> {
  const service = await getResourceService();
  const allResources = await service.getAllData();

  // Extract unique namespaces
  const namespaceSet = new Set<string>();

  for (const resource of allResources) {
    // Filter out '_cluster' marker for cluster-scoped resources
    if (resource.namespace && resource.namespace !== '_cluster') {
      namespaceSet.add(resource.namespace);
    }
  }

  // Sort alphabetically
  return Array.from(namespaceSet).sort();
}
