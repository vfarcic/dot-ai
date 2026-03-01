/**
 * Base Vector Service
 *
 * Generic vector operations that can be extended for different data types
 * (patterns, capabilities, dependencies, etc.)
 *
 * PRD #359: Now calls plugin directly instead of going through VectorDBService.
 */

import { EmbeddingService } from './embedding-service';
import { invokePluginTool, isPluginInitialized } from './plugin-registry';

const PLUGIN_NAME = 'agentic-tools';

export interface BaseSearchOptions {
  limit?: number;
  scoreThreshold?: number;
  keywordWeight?: number; // Weight for keyword vs semantic search
  filter?: Record<string, unknown>; // Qdrant filter object for exact filtering
}

export interface BaseSearchResult<T> {
  data: T;
  score: number;
  matchType: 'keyword' | 'semantic' | 'hybrid';
}

export interface SearchMode {
  semantic: boolean;
  provider?: string;
  reason?: string;
}

/**
 * Document stored in vector database
 */
export interface VectorDocument {
  id: string;
  payload: Record<string, unknown>;
  vector?: number[];
}

/**
 * Search result from vector similarity search
 */
interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

/**
 * Collection statistics from plugin
 */
interface CollectionStats {
  pointsCount: number;
  vectorSize: number;
  status: string;
  exists: boolean;
  url: string;
}

/**
 * Abstract base class for vector-based data services
 */
export abstract class BaseVectorService<T> {
  protected embeddingService: EmbeddingService;
  protected collectionName: string;

  constructor(collectionName: string, embeddingService?: EmbeddingService) {
    this.collectionName = collectionName;
    this.embeddingService = embeddingService || new EmbeddingService();
  }

  /**
   * Invoke a plugin tool and extract the result
   * @throws Error if plugin returns an error response
   */
  private async invokePlugin<R>(
    tool: string,
    args: Record<string, unknown>
  ): Promise<R> {
    const response = await invokePluginTool(PLUGIN_NAME, tool, args);

    if (!response.success) {
      const error = response.error as { message?: string } | string | undefined;
      const message =
        typeof error === 'object' && error?.message
          ? error.message
          : String(error || `Plugin tool ${tool} failed`);
      throw new Error(message);
    }

    // Plugin tools return ToolResult: { success, data, message, error? }
    // We need to extract the data field, and check for tool-level errors
    const toolResult = response.result as
      | { success?: boolean; data?: R; error?: string; message?: string }
      | null
      | undefined;

    // Handle missing or malformed result
    if (!toolResult || typeof toolResult !== 'object') {
      throw new Error(`Plugin tool ${tool} returned invalid result`);
    }

    // Check for tool-level errors (use strict equality to handle undefined gracefully)
    if (toolResult.success === false) {
      throw new Error(
        toolResult.error || toolResult.message || `Plugin tool ${tool} failed`
      );
    }

    return toolResult.data as R;
  }

  /**
   * Initialize the collection
   */
  async initialize(): Promise<void> {
    // Use embedding dimensions if available, otherwise default to 1536 (OpenAI default)
    const dimensions = this.embeddingService.isAvailable()
      ? this.embeddingService.getDimensions()
      : 1536;

    await this.invokePlugin<void>('collection_initialize', {
      collection: this.collectionName,
      vectorSize: dimensions,
      createTextIndex: true,
    });
  }

  /**
   * Check if collection exists without creating it
   */
  async collectionExists(): Promise<boolean> {
    try {
      const stats = await this.invokePlugin<CollectionStats>(
        'collection_stats',
        {
          collection: this.collectionName,
        }
      );
      return stats.exists;
    } catch {
      return false;
    }
  }

  /**
   * Health check for Vector DB connection
   */
  async healthCheck(): Promise<boolean> {
    if (!isPluginInitialized()) {
      return false;
    }

    try {
      await this.invokePlugin<CollectionStats>('collection_stats', {
        collection: this.collectionName,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Store data in Vector DB with semantic embedding
   */
  async storeData(data: T): Promise<void> {
    const searchText = this.createSearchText(data);
    const id = this.extractId(data);

    // Generate embedding - required for vector storage
    let embedding: number[];
    if (this.embeddingService.isAvailable()) {
      try {
        embedding = await this.embeddingService.generateEmbedding(searchText);
      } catch (error) {
        // Fail immediately with clear error about embedding generation
        throw new Error(
          `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        );
      }
    } else {
      // Embedding service not available - fail with clear error
      throw new Error(
        'Embedding service not available - cannot store data in vector collection'
      );
    }

    await this.invokePlugin<void>('vector_store', {
      collection: this.collectionName,
      id,
      embedding,
      payload: {
        ...this.createPayload(data),
        searchText: searchText,
        hasEmbedding: true,
      },
    });
  }

  /**
   * Search for data using hybrid semantic + keyword matching
   */
  async searchData(
    query: string,
    options: BaseSearchOptions = {}
  ): Promise<BaseSearchResult<T>[]> {
    // Fail immediately if embedding service not available - no graceful fallback
    if (!this.embeddingService.isAvailable()) {
      throw new Error(
        'Embedding service not available - cannot perform semantic search'
      );
    }

    // Extract keywords for keyword search
    const queryKeywords = this.extractKeywords(query);

    if (queryKeywords.length === 0) {
      return [];
    }

    const limit = options.limit || 10;
    const scoreThreshold = options.scoreThreshold || 0.01;

    // Perform hybrid search (semantic + keyword)
    try {
      return await this.hybridSearch(query, queryKeywords, {
        limit,
        scoreThreshold,
        filter: options.filter,
      });
    } catch (error) {
      // Fail immediately - no fallback to keyword-only search
      throw new Error(
        `Semantic search failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }

  /**
   * Get data by ID
   */
  async getData(id: string): Promise<T | null> {
    const document = await this.invokePlugin<VectorDocument | null>(
      'vector_get',
      {
        collection: this.collectionName,
        id,
      }
    );

    if (!document) {
      return null;
    }
    const data = this.payloadToData(document.payload);
    // Set the ID from the document
    (data as T & { id: string }).id = document.id;
    return data;
  }

  /**
   * Delete data by ID
   */
  async deleteData(id: string): Promise<void> {
    await this.invokePlugin<void>('vector_delete', {
      collection: this.collectionName,
      id,
    });
  }

  /**
   * Delete all data (preserves collection structure)
   */
  async deleteAllData(): Promise<void> {
    await this.invokePlugin<void>('vector_delete_all', {
      collection: this.collectionName,
    });
  }

  /**
   * Query data with Qdrant filter (no semantic search)
   * @param filter - Qdrant filter object constructed by AI
   * @param limit - Maximum results to return
   */
  async queryWithFilter(
    filter: Record<string, unknown>,
    limit: number = 100
  ): Promise<T[]> {
    const documents = await this.invokePlugin<VectorDocument[]>(
      'vector_query',
      {
        collection: this.collectionName,
        filter,
        limit,
      }
    );

    return documents.map(doc => {
      const data = this.payloadToData(doc.payload);
      (data as T & { id: string }).id = doc.id;
      return data;
    });
  }

  /**
   * Get all data (limited)
   */
  async getAllData(limit?: number): Promise<T[]> {
    const documents = await this.invokePlugin<VectorDocument[]>('vector_list', {
      collection: this.collectionName,
      limit: limit ?? 10000,
    });

    return documents.map(doc => {
      const data = this.payloadToData(doc.payload);
      (data as T & { id: string }).id = doc.id;
      return data;
    });
  }

  /**
   * Get total count of data items
   */
  async getDataCount(): Promise<number> {
    try {
      const stats = await this.invokePlugin<CollectionStats>(
        'collection_stats',
        {
          collection: this.collectionName,
        }
      );
      return stats.pointsCount || 0;
    } catch {
      // Fallback: get all and count
      const data = await this.getAllData();
      return data.length;
    }
  }

  /**
   * Get current search mode (semantic vs keyword-only)
   */
  getSearchMode(): SearchMode {
    const status = this.embeddingService.getStatus();
    return {
      semantic: status.available,
      provider: status.provider || undefined,
      reason:
        status.reason ||
        (status.available ? 'Embedding service available' : undefined),
    };
  }

  // Abstract methods that must be implemented by subclasses
  protected abstract createSearchText(data: T): string;
  protected abstract extractId(data: T): string;
  protected abstract createPayload(data: T): Record<string, unknown>;
  protected abstract payloadToData(payload: Record<string, unknown>): T;

  // Virtual methods that can be overridden by subclasses
  protected extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  /**
   * Hybrid search combining semantic and keyword matching
   */
  private async hybridSearch(
    query: string,
    queryKeywords: string[],
    options: {
      limit: number;
      scoreThreshold: number;
      filter?: Record<string, unknown>;
    }
  ): Promise<BaseSearchResult<T>[]> {
    // Generate query embedding - required for semantic search
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding for semantic search');
    }

    // Semantic search using vector similarity
    const semanticResults = await this.invokePlugin<SearchResult[]>(
      'vector_search',
      {
        collection: this.collectionName,
        embedding: queryEmbedding,
        limit: options.limit * 2, // Get more candidates for hybrid ranking
        scoreThreshold: 0.1, // Very permissive threshold for single-word queries
        filter: options.filter,
      }
    );

    // Keyword search
    const keywordResults = await this.invokePlugin<SearchResult[]>(
      'vector_search_keywords',
      {
        collection: this.collectionName,
        keywords: queryKeywords,
        limit: options.limit * 2,
        filter: options.filter,
      }
    );

    // Combine and rank results
    return this.combineHybridResults(
      semanticResults,
      keywordResults,
      queryKeywords,
      options
    );
  }

  /**
   * Combine semantic and keyword results with hybrid ranking
   * Keyword matches are prioritized for exact term matches
   */
  private combineHybridResults(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
    queryKeywords: string[],
    options: { limit: number; scoreThreshold: number }
  ): BaseSearchResult<T>[] {
    const combinedResults = new Map<string, BaseSearchResult<T>>();

    // Add semantic results with weighted score
    for (const result of semanticResults) {
      const data = this.payloadToData(result.payload);
      (data as T & { id: string }).id = result.id;
      combinedResults.set(result.id, {
        data,
        score: result.score * 0.5, // Semantic gets 50% weight
        matchType: 'semantic',
      });
    }

    // Add or boost keyword results
    for (const result of keywordResults) {
      const existing = combinedResults.get(result.id);
      if (existing) {
        // Hybrid match: ADD keyword score to semantic score (capped at 1.0)
        // This ensures exact keyword matches rank higher
        existing.score = Math.min(1.0, existing.score + result.score * 0.5);
        existing.matchType = 'hybrid';
      } else {
        const data = this.payloadToData(result.payload);
        (data as T & { id: string }).id = result.id;
        combinedResults.set(result.id, {
          data,
          score: result.score * 0.5, // Keyword-only gets 50% weight
          matchType: 'keyword',
        });
      }
    }

    // Sort by score and apply limits
    return Array.from(combinedResults.values())
      .filter(result => result.score >= options.scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit);
  }
}
