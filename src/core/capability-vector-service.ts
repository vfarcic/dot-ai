/**
 * Capability Vector Service
 * 
 * Vector-based storage and retrieval for resource capabilities
 * Extends BaseVectorService to provide capability-specific operations
 */

import { BaseVectorService, BaseSearchOptions, BaseSearchResult } from './base-vector-service';
import { VectorDBService } from './vector-db-service';
import { EmbeddingService } from './embedding-service';
import { CapabilityInferenceEngine, ResourceCapability, PrinterColumn } from './capabilities';

// Re-export for backward compatibility
export type { ResourceCapability, PrinterColumn };

export interface CapabilitySearchOptions extends BaseSearchOptions {
  complexityFilter?: 'low' | 'medium' | 'high';
  providerFilter?: string[];
}

/**
 * Vector service for storing and searching resource capabilities
 */
export class CapabilityVectorService extends BaseVectorService<ResourceCapability> {

  constructor(collectionName: string = 'capabilities', vectorDB?: VectorDBService, embeddingService?: EmbeddingService) {
    super(collectionName, vectorDB, embeddingService);
  }

  /**
   * Create searchable text from capability data for embedding generation
   */
  protected createSearchText(capability: ResourceCapability): string {
    return [
      capability.resourceName,
      ...capability.capabilities,
      ...capability.providers,
      ...capability.abstractions,
      capability.description,
      capability.useCase,
      capability.complexity
    ].join(' ');
  }

  /**
   * Extract unique ID from capability data
   */
  protected extractId(capability: ResourceCapability): string {
    return CapabilityInferenceEngine.generateCapabilityId(capability.resourceName);
  }

  /**
   * Convert capability to storage payload format
   */
  protected createPayload(capability: ResourceCapability): Record<string, any> {
    return {
      resourceName: capability.resourceName,
      apiVersion: capability.apiVersion,
      version: capability.version,
      group: capability.group,
      capabilities: capability.capabilities,
      providers: capability.providers,
      abstractions: capability.abstractions,
      complexity: capability.complexity,
      description: capability.description,
      useCase: capability.useCase,
      printerColumns: capability.printerColumns,
      confidence: capability.confidence,
      analyzedAt: capability.analyzedAt
    };
  }

  /**
   * Convert storage payload back to capability object
   */
  protected payloadToData(payload: Record<string, any>): ResourceCapability {
    return {
      resourceName: payload.resourceName,
      apiVersion: payload.apiVersion,
      version: payload.version,
      group: payload.group,
      capabilities: payload.capabilities || [],
      providers: payload.providers || [],
      abstractions: payload.abstractions || [],
      complexity: payload.complexity || 'medium',
      description: payload.description || '',
      useCase: payload.useCase || '',
      printerColumns: payload.printerColumns,
      confidence: payload.confidence || 0,
      analyzedAt: payload.analyzedAt || new Date().toISOString()
    };
  }

  /**
   * Store a capability in the vector database
   */
  async storeCapability(capability: ResourceCapability): Promise<void> {
    await this.storeData(capability);
  }

  /**
   * Search capabilities by user intent with optional filters
   */
  async searchCapabilities(
    intent: string, 
    options: CapabilitySearchOptions = {}
  ): Promise<BaseSearchResult<ResourceCapability>[]> {
    const results = await this.searchData(intent, options);
    
    // Apply complexity filter if specified
    if (options.complexityFilter) {
      return results.filter((result: BaseSearchResult<ResourceCapability>) => result.data.complexity === options.complexityFilter);
    }
    
    // Apply provider filter if specified  
    if (options.providerFilter && options.providerFilter.length > 0) {
      return results.filter((result: BaseSearchResult<ResourceCapability>) => 
        result.data.providers.some((provider: string) => 
          options.providerFilter!.includes(provider)
        )
      );
    }
    
    return results;
  }

  /**
   * Get capability by ID
   * Used by MCP operations with IDs from list/search results
   */
  async getCapability(id: string): Promise<ResourceCapability | null> {
    return await this.getData(id);
  }

  /**
   * Get capability by kind and apiVersion
   * Used for JSON format lookup from dashboard UI
   *
   * @param kind - Resource kind (e.g., "Deployment", "Cluster")
   * @param apiVersion - Full apiVersion (e.g., "apps/v1", "postgresql.cnpg.io/v1")
   * @returns Matching capability or null if not found
   */
  async getCapabilityByKindApiVersion(kind: string, apiVersion: string): Promise<ResourceCapability | null> {
    // Build Qdrant filter for exact apiVersion match
    const filter = {
      must: [
        { key: 'apiVersion', match: { value: apiVersion } }
      ]
    };

    const results = await this.queryWithFilter(filter, 100);

    if (results.length === 0) {
      return null;
    }

    // Find matching capability by kind
    // For standard resources: resourceName === kind (case insensitive)
    // For CRDs: resourceName matches plural.group pattern (e.g., "Cluster" -> "clusters.devopstoolkit.live")
    const kindLower = kind.toLowerCase();
    const match = results.find(cap => {
      const resourceNameLower = cap.resourceName.toLowerCase();
      // Exact match
      if (resourceNameLower === kindLower) return true;
      // Pluralized exact match (e.g., "deployment" -> "deployments")
      if (resourceNameLower === kindLower + 's' || resourceNameLower === kindLower + 'es') return true;
      // CRD format: plural.group (e.g., "cluster" -> "clusters.devopstoolkit.live")
      // Must match kind+plural followed by a dot to avoid false positives like "cluster" matching "clusterroles"
      if (resourceNameLower.startsWith(kindLower + 's.') || resourceNameLower.startsWith(kindLower + 'es.')) return true;
      // Handle -y -> -ies pluralization (e.g., "policy" -> "policies.group")
      if (kindLower.endsWith('y')) {
        const stem = kindLower.slice(0, -1);
        if (resourceNameLower === stem + 'ies' || resourceNameLower.startsWith(stem + 'ies.')) return true;
      }
      return false;
    });

    return match || null;
  }

  /**
   * Delete capability by resource name
   */
  async deleteCapability(resourceName: string): Promise<void> {
    const capabilityId = CapabilityInferenceEngine.generateCapabilityId(resourceName);
    await this.deleteData(capabilityId);
  }

  /**
   * Delete capability by ID (for MCP tool interface)
   */
  async deleteCapabilityById(id: string): Promise<void> {
    await this.deleteData(id);
  }

  /**
   * Delete all capabilities efficiently by recreating collection
   */
  async deleteAllCapabilities(): Promise<void> {
    await this.deleteAllData();
  }

  /**
   * List all capabilities with optional pagination
   */
  async getAllCapabilities(limit?: number): Promise<ResourceCapability[]> {
    return await this.getAllData(limit);
  }

  /**
   * Get count of stored capabilities
   */
  async getCapabilitiesCount(): Promise<number> {
    // Use getAllData to get count since base class doesn't expose getCount
    const allCapabilities = await this.getAllData(); // Get all capabilities to count them
    return allCapabilities.length;
  }
}