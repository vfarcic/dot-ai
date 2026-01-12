/**
 * Base Vector Service
 * 
 * Generic vector operations that can be extended for different data types
 * (patterns, capabilities, dependencies, etc.)
 */

import { VectorDBService, VectorDocument } from './vector-db-service';
import { EmbeddingService } from './embedding-service';

export interface BaseSearchOptions {
  limit?: number;
  scoreThreshold?: number;
  keywordWeight?: number; // Weight for keyword vs semantic search
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
 * Abstract base class for vector-based data services
 */
export abstract class BaseVectorService<T> {
  protected vectorDB: VectorDBService;
  protected embeddingService: EmbeddingService;
  protected collectionName: string;

  constructor(collectionName: string, vectorDB?: VectorDBService, embeddingService?: EmbeddingService) {
    this.collectionName = collectionName;
    this.vectorDB = vectorDB || new VectorDBService({ collectionName });
    this.embeddingService = embeddingService || new EmbeddingService();
  }

  /**
   * Initialize the collection
   */
  async initialize(): Promise<void> {
    // Use embedding dimensions if available, otherwise default to 1536 (OpenAI default)
    const dimensions = this.embeddingService.isAvailable() ?
      this.embeddingService.getDimensions() :
      1536;
    await this.vectorDB.initializeCollection(dimensions);
  }

  /**
   * Check if collection exists without creating it
   */
  async collectionExists(): Promise<boolean> {
    return await this.vectorDB.collectionExists();
  }

  /**
   * Health check for Vector DB connection
   */
  async healthCheck(): Promise<boolean> {
    return await this.vectorDB.healthCheck();
  }

  /**
   * Store data in Vector DB with optional semantic embedding
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
        throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // Embedding service not available - fail with clear error
      throw new Error('Embedding service not available - cannot store data in vector collection');
    }

    const document: VectorDocument = {
      id,
      payload: {
        ...this.createPayload(data),
        searchText: searchText,
        hasEmbedding: true
      },
      vector: embedding
    };

    await this.vectorDB.upsertDocument(document);
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
      throw new Error('Embedding service not available - cannot perform semantic search');
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
      return await this.hybridSearch(query, queryKeywords, { limit, scoreThreshold });
    } catch (error) {
      // Fail immediately - no fallback to keyword-only search
      throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get data by ID
   */
  async getData(id: string): Promise<T | null> {
    const document = await this.vectorDB.getDocument(id);
    if (!document) {
      return null;
    }
    const data = this.payloadToData(document.payload);
    // Set the ID from the document
    (data as any).id = document.id;
    return data;
  }

  /**
   * Delete data by ID
   */
  async deleteData(id: string): Promise<void> {
    await this.vectorDB.deleteDocument(id);
  }

  /**
   * Delete all data (recreate collection)
   */
  async deleteAllData(): Promise<void> {
    await this.vectorDB.deleteAllDocuments();
  }

  /**
   * Query data with Qdrant filter (no semantic search)
   * @param filter - Qdrant filter object constructed by AI
   * @param limit - Maximum results to return
   */
  async queryWithFilter(filter: any, limit: number = 100): Promise<T[]> {
    const documents = await this.vectorDB.scrollWithFilter(filter, limit);
    return documents.map(doc => {
      const data = this.payloadToData(doc.payload);
      (data as any).id = doc.id;
      return data;
    });
  }

  /**
   * Get all data (limited)
   */
  async getAllData(limit?: number): Promise<T[]> {
    const documents = await this.vectorDB.getAllDocuments(limit);
    return documents.map(doc => {
      const data = this.payloadToData(doc.payload);
      (data as any).id = doc.id;
      return data;
    });
  }

  /**
   * Get total count of data items
   */
  async getDataCount(): Promise<number> {
    try {
      const info = await this.vectorDB.getCollectionInfo();
      return info.points_count || 0;
    } catch (error) {
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
      reason: status.reason || (status.available ? 'Embedding service available' : undefined)
    };
  }

  // Abstract methods that must be implemented by subclasses
  protected abstract createSearchText(data: T): string;
  protected abstract extractId(data: T): string;
  protected abstract createPayload(data: T): Record<string, any>;
  protected abstract payloadToData(payload: Record<string, any>): T;

  // Virtual methods that can be overridden by subclasses
  protected extractKeywords(query: string): string[] {
    return query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
  }

  /**
   * Hybrid search combining semantic and keyword matching
   */
  private async hybridSearch(
    query: string, 
    queryKeywords: string[],
    options: { limit: number; scoreThreshold: number }
  ): Promise<BaseSearchResult<T>[]> {
    // Generate query embedding - required for semantic search
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding for semantic search');
    }

    // Semantic search using vector similarity
    const semanticResults = await this.vectorDB.searchSimilar(
      queryEmbedding,
      {
        limit: options.limit * 2, // Get more candidates for hybrid ranking
        scoreThreshold: 0.1 // Very permissive threshold for single-word queries
      }
    );

    // Keyword search
    const keywordResults = await this.vectorDB.searchByKeywords(
      queryKeywords,
      {
        limit: options.limit * 2,
        scoreThreshold: 0.1
      }
    );

    // Combine and rank results
    return this.combineHybridResults(semanticResults, keywordResults, queryKeywords, options);
  }


  /**
   * Combine semantic and keyword results with hybrid ranking
   */
  private combineHybridResults(
    semanticResults: any[],
    keywordResults: any[],
    queryKeywords: string[],
    options: { limit: number; scoreThreshold: number }
  ): BaseSearchResult<T>[] {
    const combinedResults = new Map<string, BaseSearchResult<T>>();
    
    // Add semantic results
    for (const result of semanticResults) {
      const data = this.payloadToData(result.payload);
      (data as any).id = result.id;
      combinedResults.set(result.id, {
        data,
        score: result.score * 0.7, // Weight semantic similarity
        matchType: 'semantic'
      });
    }
    
    // Add or boost keyword results
    for (const result of keywordResults) {
      const existing = combinedResults.get(result.id);
      if (existing) {
        // Boost score for hybrid match
        existing.score = Math.max(existing.score, result.score * 0.8);
        existing.matchType = 'hybrid';
      } else {
        const data = this.payloadToData(result.payload);
        (data as any).id = result.id;
        combinedResults.set(result.id, {
          data,
          score: result.score * 0.6, // Weight keyword matching
          matchType: 'keyword'
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