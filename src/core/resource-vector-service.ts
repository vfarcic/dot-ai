/**
 * Resource Vector Service
 *
 * Vector-based storage and retrieval for Kubernetes cluster resources.
 * Extends BaseVectorService to provide resource-specific operations.
 *
 * This service receives resource data from the dot-ai-controller and stores
 * it in Qdrant for semantic search capabilities.
 */

import { createHash } from 'crypto';
import { BaseVectorService } from './base-vector-service';
import { EmbeddingService } from './embedding-service';

/**
 * Cluster resource data structure
 * Matches the format sent by dot-ai-controller
 * Note: ID is constructed by MCP from namespace/apiVersion/kind/name
 */
export interface ClusterResource {
  namespace: string;                    // Kubernetes namespace or '_cluster' for cluster-scoped
  name: string;                         // Resource name
  kind: string;                         // Resource kind (Deployment, Service, etc.)
  apiVersion: string;                   // Full API version (apps/v1, v1, etc.)
  apiGroup?: string;                    // Derived from apiVersion (apps, '', etc.)
  labels: Record<string, string>;       // Resource labels
  annotations?: Record<string, string>; // Resource annotations (optional, for semantic search)
  createdAt: string;                    // ISO timestamp of resource creation
  updatedAt: string;                    // ISO timestamp of last update
}

/**
 * Resource sync request from controller
 */
export interface ResourceSyncRequest {
  upserts?: ClusterResource[];
  deletes?: string[];
  isResync?: boolean;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  upserted: number;
  deleted: number;
  failures: Array<{ id: string; error: string }>;
}

/**
 * Simplified resource identifier for tracking changes
 */
export interface ResourceIdentifier {
  namespace: string;
  kind: string;
  name: string;
  apiVersion: string;
}

/**
 * Result of a diff and sync operation
 */
export interface DiffSyncResult {
  inserted: number;
  updated: number;
  deleted: number;
  insertedResources: ResourceIdentifier[];
  updatedResources: ResourceIdentifier[];
  deletedResources: ResourceIdentifier[];
}

/**
 * Extract API group from apiVersion
 * e.g., 'apps/v1' -> 'apps', 'v1' -> ''
 */
export function extractApiGroup(apiVersion: string): string {
  const parts = apiVersion.split('/');
  return parts.length > 1 ? parts[0] : '';
}

/**
 * Build embedding text from resource data
 * Creates a semantic representation for vector search
 */
export function buildEmbeddingText(resource: ClusterResource): string {
  const parts: string[] = [
    `${resource.kind} ${resource.name}`,
    `namespace: ${resource.namespace}`,
    `apiVersion: ${resource.apiVersion}`,
  ];

  // Add API group if present
  const apiGroup = resource.apiGroup || extractApiGroup(resource.apiVersion);
  if (apiGroup) {
    parts.push(`group: ${apiGroup}`);
  }

  // Add meaningful labels (skip standard Kubernetes labels)
  if (resource.labels && Object.keys(resource.labels).length > 0) {
    const meaningfulLabels = Object.entries(resource.labels)
      .filter(([k]) => {
        // Skip standard Kubernetes labels that don't add semantic value
        const skipPrefixes = [
          'app.kubernetes.io/',
          'helm.sh/',
          'kubernetes.io/',
          'k8s.io/',
        ];
        return !skipPrefixes.some(prefix => k.startsWith(prefix));
      })
      .map(([k, v]) => `${k}=${v}`);

    if (meaningfulLabels.length > 0) {
      parts.push(`labels: ${meaningfulLabels.join(', ')}`);
    }

    // Also include app name from standard labels if present
    const appName = resource.labels['app.kubernetes.io/name'] ||
                    resource.labels['app'] ||
                    resource.labels['name'];
    if (appName) {
      parts.push(`app: ${appName}`);
    }
  }

  // Add meaningful annotations (skip standard Kubernetes/system annotations)
  if (resource.annotations && Object.keys(resource.annotations).length > 0) {
    const meaningfulAnnotations = Object.entries(resource.annotations)
      .filter(([k, v]) => {
        // Skip system annotations that don't add semantic value
        const skipPrefixes = [
          'kubectl.kubernetes.io/',
          'kubernetes.io/',
          'k8s.io/',
          'helm.sh/',
          'deployment.kubernetes.io/',
          'meta.helm.sh/',
          'argocd.argoproj.io/',
          'checksum/',
        ];
        // Also skip very long values (likely JSON blobs)
        return !skipPrefixes.some(prefix => k.startsWith(prefix)) && v.length < 500;
      })
      .map(([k, v]) => `${k}=${v}`);

    if (meaningfulAnnotations.length > 0) {
      parts.push(`annotations: ${meaningfulAnnotations.join(', ')}`);
    }
  }

  return parts.join(' | ');
}

/**
 * Generate resource ID from components
 * Format: namespace:apiVersion:kind:name
 */
export function generateResourceId(
  namespace: string,
  apiVersion: string,
  kind: string,
  name: string
): string {
  return `${namespace}:${apiVersion}:${kind}:${name}`;
}

/**
 * Generate a deterministic UUID from resource ID for Qdrant storage
 * Qdrant requires UUIDs or positive integers as point IDs
 * The hash is deterministic so the same resource ID always maps to the same UUID
 */
export function generateResourceUuid(resourceId: string): string {
  const hash = createHash('sha256').update(`resource-${resourceId}`).digest('hex');

  // Convert to UUID format: 8-4-4-4-12
  return `${hash.substring(0,8)}-${hash.substring(8,12)}-${hash.substring(12,16)}-${hash.substring(16,20)}-${hash.substring(20,32)}`;
}

/**
 * Stringify an object with sorted keys for reliable comparison
 * Ensures consistent ordering regardless of object creation order
 */
function sortedStringify(obj: Record<string, string> | undefined): string {
  if (!obj) return '{}';
  const sorted = Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = obj[key];
    return acc;
  }, {} as Record<string, string>);
  return JSON.stringify(sorted);
}

/**
 * Check if two resources have meaningful differences
 * Used for resync diff logic
 */
export function hasResourceChanged(existing: ClusterResource, incoming: ClusterResource): boolean {
  // Compare updatedAt timestamps
  if (existing.updatedAt !== incoming.updatedAt) {
    return true;
  }

  // Compare labels (with sorted keys for reliable comparison)
  if (sortedStringify(existing.labels) !== sortedStringify(incoming.labels)) {
    return true;
  }

  // Compare annotations (with sorted keys for reliable comparison)
  if (sortedStringify(existing.annotations) !== sortedStringify(incoming.annotations)) {
    return true;
  }

  return false;
}

/**
 * Vector service for storing and searching Kubernetes cluster resources
 */
export class ResourceVectorService extends BaseVectorService<ClusterResource> {

  constructor(
    collectionName: string = 'resources',
    embeddingService?: EmbeddingService
  ) {
    super(collectionName, embeddingService);
  }

  /**
   * Create searchable text from resource data for embedding generation
   */
  protected createSearchText(resource: ClusterResource): string {
    return buildEmbeddingText(resource);
  }

  /**
   * Extract unique ID from resource data
   * Always constructs from components and hashes to UUID for Qdrant
   */
  protected extractId(resource: ClusterResource): string {
    // Always construct ID from components (ignore any provided id)
    const resourceId = generateResourceId(
      resource.namespace,
      resource.apiVersion,
      resource.kind,
      resource.name
    );
    return generateResourceUuid(resourceId);
  }

  /**
   * Convert resource to storage payload format
   */
  protected createPayload(resource: ClusterResource): Record<string, unknown> {
    return {
      id: generateResourceId(resource.namespace, resource.apiVersion, resource.kind, resource.name),
      namespace: resource.namespace,
      name: resource.name,
      kind: resource.kind,
      apiVersion: resource.apiVersion,
      apiGroup: resource.apiGroup || extractApiGroup(resource.apiVersion),
      labels: resource.labels || {},
      annotations: resource.annotations || {},
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt
    };
  }

  /**
   * Convert storage payload back to resource object
   */
  protected payloadToData(payload: Record<string, unknown>): ClusterResource {
    return {
      namespace: (payload.namespace as string) || '',
      name: (payload.name as string) || '',
      kind: (payload.kind as string) || '',
      apiVersion: (payload.apiVersion as string) || '',
      apiGroup: (payload.apiGroup as string) || '',
      labels: (payload.labels as Record<string, string>) || {},
      annotations: (payload.annotations as Record<string, string>) || {},
      createdAt: (payload.createdAt as string) || new Date().toISOString(),
      updatedAt: (payload.updatedAt as string) || new Date().toISOString()
    };
  }

  /**
   * Store a resource in the vector database
   */
  async storeResource(resource: ClusterResource): Promise<void> {
    await this.storeData(resource);
  }

  /**
   * Upsert a resource (alias for storeResource for API consistency)
   */
  async upsertResource(resource: ClusterResource): Promise<void> {
    await this.storeResource(resource);
  }

  /**
   * Get a resource by ID
   * Accepts human-readable ID (namespace:apiVersion:kind:name) and converts to UUID
   */
  async getResource(id: string): Promise<ClusterResource | null> {
    const uuid = generateResourceUuid(id);
    return await this.getData(uuid);
  }

  /**
   * Delete a resource by ID (idempotent - ignores not found)
   * Accepts human-readable ID (namespace:apiVersion:kind:name) and converts to UUID
   */
  async deleteResource(id: string): Promise<void> {
    try {
      // Convert human-readable ID to UUID for Qdrant
      const uuid = generateResourceUuid(id);
      await this.deleteData(uuid);
    } catch (error) {
      // Idempotent delete - ignore "not found" errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.toLowerCase().includes('not found')) {
        throw error;
      }
      // Resource already deleted or never existed - this is fine
    }
  }

  /**
   * Delete all resources (for testing/reset)
   */
  async deleteAllResources(): Promise<void> {
    await this.deleteAllData();
  }

  /**
   * List all resources
   */
  async listResources(): Promise<ClusterResource[]> {
    return await this.getAllData();
  }

  /**
   * Semantic search for resources with optional exact filters
   * Combines semantic/keyword search with exact field filtering
   * Returns resources with their similarity scores for relevance ranking
   */
  async searchResources(
    query: string,
    filters?: { namespace?: string; kind?: string; apiVersion?: string },
    limit: number = 10,
    minScore?: number
  ): Promise<Array<{ resource: ClusterResource; score: number }>> {
    // Build Qdrant filter from simple parameters
    const qdrantFilter = this.buildQdrantFilter(filters);

    // Perform semantic search with filter and optional score threshold
    const results = await this.searchData(query, {
      limit,
      filter: qdrantFilter,
      scoreThreshold: minScore
    });

    return results.map(r => ({ resource: r.data, score: r.score }));
  }

  /**
   * Build Qdrant filter object from simple filter parameters
   */
  private buildQdrantFilter(filters?: { namespace?: string; kind?: string; apiVersion?: string }): Record<string, unknown> | undefined {
    if (!filters) return undefined;

    const conditions: Array<{ key: string; match: { value: string } }> = [];

    if (filters.namespace) {
      conditions.push({
        key: 'namespace',
        match: { value: filters.namespace }
      });
    }

    if (filters.kind) {
      conditions.push({
        key: 'kind',
        match: { value: filters.kind }
      });
    }

    if (filters.apiVersion) {
      conditions.push({
        key: 'apiVersion',
        match: { value: filters.apiVersion }
      });
    }

    if (conditions.length === 0) return undefined;

    return { must: conditions };
  }

  /**
   * Diff incoming resources against Qdrant and sync changes
   * Used for periodic resync operations
   */
  async diffAndSync(incoming: ClusterResource[]): Promise<DiffSyncResult> {
    // Helper to get human-readable ID from resource
    const getResourceKey = (r: ClusterResource) => generateResourceId(r.namespace, r.apiVersion, r.kind, r.name);

    // Helper to extract resource identifier
    const toResourceIdentifier = (r: ClusterResource): ResourceIdentifier => ({
      namespace: r.namespace,
      kind: r.kind,
      name: r.name,
      apiVersion: r.apiVersion
    });

    // Get all existing resources from Qdrant
    const existing = await this.listResources();
    const existingMap = new Map(existing.map(r => [getResourceKey(r), r]));
    const incomingMap = new Map(incoming.map(r => [getResourceKey(r), r]));

    const toInsert: ClusterResource[] = [];
    const toUpdate: ClusterResource[] = [];
    const toDeleteResources: ClusterResource[] = [];

    // Find new and changed resources
    for (const resource of incoming) {
      const resourceId = getResourceKey(resource);
      const existingResource = existingMap.get(resourceId);

      if (!existingResource) {
        toInsert.push(resource);
      } else if (hasResourceChanged(existingResource, resource)) {
        toUpdate.push(resource);
      }
    }

    // Find deleted resources (in Qdrant but not in incoming)
    for (const [id, resource] of existingMap.entries()) {
      if (!incomingMap.has(id)) {
        toDeleteResources.push(resource);
      }
    }

    // Apply changes
    for (const resource of [...toInsert, ...toUpdate]) {
      await this.storeResource(resource);
    }

    for (const resource of toDeleteResources) {
      const id = getResourceKey(resource);
      await this.deleteResource(id);
    }

    return {
      inserted: toInsert.length,
      updated: toUpdate.length,
      deleted: toDeleteResources.length,
      insertedResources: toInsert.map(toResourceIdentifier),
      updatedResources: toUpdate.map(toResourceIdentifier),
      deletedResources: toDeleteResources.map(toResourceIdentifier)
    };
  }
}
