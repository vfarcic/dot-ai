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
 * Semantic search for cluster resources by name, kind, labels, and annotations
 */
export const SEARCH_RESOURCES_TOOL: AITool = {
  name: 'search_resources',
  description: `Search for Kubernetes resources in the cluster inventory using semantic search. Searches resource names, kinds, labels, and annotations stored in Vector DB.

This tool is useful for:
- Finding resources by partial name match (e.g., "nginx" finds nginx-deployment, nginx-service)
- Finding resources by kind (e.g., "deployments" finds all Deployment resources)
- Finding resources by label values (e.g., "frontend" finds resources with tier=frontend label)
- Finding resources by annotation content (e.g., "team platform" finds resources with team=platform annotation)

You can optionally filter results by namespace, kind, or apiVersion to narrow the search scope:
- Search "nginx" within namespace "production": query="nginx", namespace="production"
- Search "database" within Deployments only: query="database", kind="Deployment", apiVersion="apps/v1"
- Search across all resources: query="nginx" (no filters)

Note: For conceptual queries like "what databases are running", use the semantic bridge pattern:
1. Use search_capabilities to find what KINDS relate to "database"
2. Then use query_resources to find instances of those kinds

For live cluster status, use kubectl tools after finding resources.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query matching resource names, kinds, labels, or annotations (e.g., "nginx", "frontend", "team platform")'
      },
      namespace: {
        type: 'string',
        description: 'Optional: Filter results to this namespace only (exact match)'
      },
      kind: {
        type: 'string',
        description: 'Optional: Filter results to this resource kind only (exact match, e.g., "Deployment", "Service")'
      },
      apiVersion: {
        type: 'string',
        description: 'Optional: Filter results to this API version only (exact match, e.g., "apps/v1", "v1")'
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
export async function getResourceService(): Promise<ResourceVectorService> {
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
        const { query, namespace, kind, apiVersion, limit = 10 } = input;

        if (!query) {
          return {
            success: false,
            error: VALIDATION_MESSAGES.MISSING_PARAMETER('query'),
            message: 'search_resources requires a query parameter'
          };
        }

        const service = await getResourceService();

        // Build filters from optional parameters
        const filters: { namespace?: string; kind?: string; apiVersion?: string } = {};
        if (namespace) filters.namespace = namespace;
        if (kind) filters.kind = kind;
        if (apiVersion) filters.apiVersion = apiVersion;

        // Use searchResources with filters
        const results = await service.searchResources(
          query,
          Object.keys(filters).length > 0 ? filters : undefined,
          limit
        );

        // Transform results to a clean format for AI consumption
        const formattedResources = results.map(({ resource: r, score }) => ({
          id: (r as any).id,
          namespace: r.namespace,
          name: r.name,
          kind: r.kind,
          apiVersion: r.apiVersion,
          apiGroup: r.apiGroup,
          labels: r.labels,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          score
        }));

        // Build message with filter info
        const filterInfo = Object.keys(filters).length > 0
          ? ` (filtered by ${Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(', ')})`
          : '';

        return {
          success: true,
          data: formattedResources,
          count: formattedResources.length,
          message: `Found ${formattedResources.length} resources matching "${query}"${filterInfo}`
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
 * Fetch a single resource from Kubernetes API
 *
 * @param name - Resource name
 * @param namespace - Resource namespace (or '_cluster' for cluster-scoped)
 * @param kind - Resource kind
 * @param apiGroup - API group (empty string for core resources)
 * @param field - Optional: specific field to return (e.g., 'status', 'spec', 'metadata'). If omitted, returns full resource.
 * @returns The resource (or specific field) or undefined if not available
 */
export async function fetchResource(
  name: string,
  namespace: string,
  kind: string,
  apiGroup: string,
  field?: string
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

    // Return specific field or full resource
    return field ? parsed[field] : parsed;
  } catch {
    // Return undefined if we can't fetch resource (may not exist or not accessible)
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
      const status = await fetchResource(
        resource.name,
        resource.namespace,
        resource.kind,
        resource.apiGroup,
        'status'
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

// ============================================================================
// Events Query Functions (PRD #328)
// Fetch Kubernetes events for specific resources
// ============================================================================

/**
 * Kubernetes event information
 */
export interface KubernetesEvent {
  reason: string;
  message: string;
  type: 'Normal' | 'Warning';
  count: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  source: {
    component: string;
    host?: string;
  };
  involvedObject: {
    kind: string;
    name: string;
    namespace?: string;
    uid?: string;
  };
}

/**
 * Options for fetching resource events
 */
export interface GetResourceEventsOptions {
  name: string;           // Required: Resource name
  kind: string;           // Required: Resource kind
  namespace?: string;     // Optional: Namespace (for namespaced resources)
  uid?: string;           // Optional: Resource UID for precise filtering
}

/**
 * Result of fetching resource events
 */
export interface GetResourceEventsResult {
  events: KubernetesEvent[];
  count: number;
}

/**
 * Get Kubernetes events for a specific resource
 * Queries the K8s API using field selectors on involvedObject fields
 *
 * @param options - Filter options for events
 * @returns Array of events sorted by lastTimestamp descending
 */
export async function getResourceEvents(options: GetResourceEventsOptions): Promise<GetResourceEventsResult> {
  const { name, kind, namespace, uid } = options;

  // Build field selector for involvedObject filtering
  const fieldSelectors: string[] = [
    `involvedObject.name=${name}`,
    `involvedObject.kind=${kind}`
  ];

  // Add UID filter if provided (more precise)
  if (uid) {
    fieldSelectors.push(`involvedObject.uid=${uid}`);
  }

  // Build kubectl command
  const cmdArgs = ['get', 'events', '-o', 'json', `--field-selector=${fieldSelectors.join(',')}`];

  // Add namespace flag for scoped query
  if (namespace) {
    cmdArgs.push('-n', namespace);
  } else {
    // For cluster-scoped resources, query all namespaces
    cmdArgs.push('--all-namespaces');
  }

  try {
    const output = await executeKubectl(cmdArgs);
    const parsed = JSON.parse(output);

    // Transform K8s event objects to our interface
    const events: KubernetesEvent[] = (parsed.items || []).map((item: any) => ({
      reason: item.reason || '',
      message: item.message || '',
      type: item.type || 'Normal',
      count: item.count || 1,
      firstTimestamp: item.firstTimestamp || item.eventTime || null,
      lastTimestamp: item.lastTimestamp || item.eventTime || null,
      source: {
        component: item.source?.component || item.reportingComponent || '',
        host: item.source?.host || item.reportingInstance || undefined
      },
      involvedObject: {
        kind: item.involvedObject?.kind || '',
        name: item.involvedObject?.name || '',
        namespace: item.involvedObject?.namespace || undefined,
        uid: item.involvedObject?.uid || undefined
      }
    }));

    // Sort by lastTimestamp descending (most recent first)
    events.sort((a, b) => {
      const timeA = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
      const timeB = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
      return timeB - timeA;
    });

    return {
      events,
      count: events.length
    };
  } catch {
    // Return empty array if we can't fetch events (resource may not exist or no events)
    return {
      events: [],
      count: 0
    };
  }
}

// ============================================================================
// Pod Logs Query Functions (PRD #328)
// Fetch container logs from pods
// ============================================================================

/**
 * Options for fetching pod logs
 */
export interface GetPodLogsOptions {
  name: string;           // Required: Pod name
  namespace: string;      // Required: Namespace (pods are always namespaced)
  container?: string;     // Optional: Container name for multi-container pods
  tailLines?: number;     // Optional: Number of lines to return (default: 100)
}

/**
 * Result of fetching pod logs
 */
export interface GetPodLogsResult {
  logs: string;
  container: string;      // The container logs were fetched from
  containerCount: number; // Total containers in pod (for UI to know if selection needed)
}

/**
 * Error thrown when pod has multiple containers and none specified
 */
export class ContainerRequiredError extends Error {
  containers: string[];

  constructor(containers: string[]) {
    super('Pod has multiple containers. Please specify a container.');
    this.name = 'ContainerRequiredError';
    this.containers = containers;
  }
}

/**
 * Get container logs from a pod
 * Reuses executeKubectl infrastructure (same as AI kubectl_logs tool)
 *
 * @param options - Options for fetching logs
 * @returns Log content and container information
 * @throws ContainerRequiredError if pod has multiple containers and none specified
 */
export async function getPodLogs(options: GetPodLogsOptions): Promise<GetPodLogsResult> {
  const { name, namespace, container, tailLines = 100 } = options;

  // First, get pod spec to determine container count
  const podCmdArgs = ['get', `pod/${name}`, '-n', namespace, '-o', 'json'];
  const podOutput = await executeKubectl(podCmdArgs);
  const pod = JSON.parse(podOutput);

  // Get all container names (spec.containers + spec.initContainers)
  const containers: string[] = [
    ...(pod.spec?.containers || []).map((c: any) => c.name),
    ...(pod.spec?.initContainers || []).map((c: any) => c.name)
  ];
  const containerCount = containers.length;

  // Determine which container to fetch logs from
  let targetContainer: string;

  if (container) {
    // Container explicitly specified
    if (!containers.includes(container)) {
      throw new Error(`Container '${container}' not found in pod. Available containers: ${containers.join(', ')}`);
    }
    targetContainer = container;
  } else if (containerCount === 1) {
    // Single container pod - use it
    targetContainer = containers[0];
  } else if (containerCount > 1) {
    // Multiple containers - require explicit selection
    throw new ContainerRequiredError(containers);
  } else {
    throw new Error('Pod has no containers');
  }

  // Build kubectl logs command
  const cmdArgs = ['logs', name, '-n', namespace, '-c', targetContainer, `--tail=${tailLines}`];

  const logs = await executeKubectl(cmdArgs);

  return {
    logs,
    container: targetContainer,
    containerCount
  };
}
