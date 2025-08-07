/**
 * Capability Vector Service
 * 
 * Vector-based storage and retrieval for resource capabilities
 * Extends BaseVectorService to provide capability-specific operations
 */

import { BaseVectorService, BaseSearchOptions, BaseSearchResult } from './base-vector-service';
import { VectorDBService } from './vector-db-service';
import { EmbeddingService } from './embedding-service';
import { CapabilityInferenceEngine } from './capabilities';

export interface ResourceCapability {
  resourceName: string;
  capabilities: string[];
  providers: string[];
  abstractions: string[];
  complexity: 'low' | 'medium' | 'high';
  description: string;
  useCase: string;
  confidence: number;
  analyzedAt: string;
}

export interface CapabilitySearchOptions extends BaseSearchOptions {
  complexityFilter?: 'low' | 'medium' | 'high';
  providerFilter?: string[];
}

/**
 * Vector service for storing and searching resource capabilities
 */
export class CapabilityVectorService extends BaseVectorService<ResourceCapability> {
  
  constructor(vectorDB?: VectorDBService, embeddingService?: EmbeddingService) {
    super('capabilities', vectorDB, embeddingService);
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
      capabilities: capability.capabilities,
      providers: capability.providers,
      abstractions: capability.abstractions,
      complexity: capability.complexity,
      description: capability.description,
      useCase: capability.useCase,
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
      capabilities: payload.capabilities || [],
      providers: payload.providers || [],
      abstractions: payload.abstractions || [],
      complexity: payload.complexity || 'medium',
      description: payload.description || '',
      useCase: payload.useCase || '',
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
   * Get capability by ID or resource name
   * Handles both Vector DB IDs (from list operations) and resource names
   */
  async getCapability(idOrResourceName: string): Promise<ResourceCapability | null> {
    // First try direct ID lookup (for Vector DB IDs from list operations)
    let capability = await this.getData(idOrResourceName);
    
    if (!capability) {
      // If not found, try generating ID from resource name (for direct resource queries)
      const generatedId = CapabilityInferenceEngine.generateCapabilityId(idOrResourceName);
      if (generatedId !== idOrResourceName) {
        capability = await this.getData(generatedId);
      }
    }
    
    
    return capability;
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