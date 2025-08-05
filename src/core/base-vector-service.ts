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
    
    // Try to generate embedding if service is available
    let embedding: number[] | null = null;
    if (this.embeddingService.isAvailable()) {
      try {
        embedding = await this.embeddingService.generateEmbedding(searchText);
      } catch (error) {
        // Log but don't fail - fall back to keyword-only storage
        console.warn(`Failed to generate embedding for ${this.collectionName}, using keyword-only storage:`, error);
      }
    }

    const document: VectorDocument = {
      id,
      payload: {
        ...this.createPayload(data),
        searchText: searchText,
        hasEmbedding: embedding !== null
      },
      vector: embedding || undefined
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
    // Extract keywords for keyword search
    const queryKeywords = this.extractKeywords(query);
    
    if (queryKeywords.length === 0) {
      return [];
    }

    const limit = options.limit || 10;
    const scoreThreshold = options.scoreThreshold || 0.1;
    
    // Try semantic search first if embeddings available
    if (this.embeddingService.isAvailable()) {
      try {
        return await this.hybridSearch(query, queryKeywords, { limit, scoreThreshold });
      } catch (error) {
        // Fall back to keyword-only search if semantic search fails
        console.warn('Semantic search failed, falling back to keyword search:', error);
      }
    }

    // Keyword-only search (fallback or when embeddings not available)
    return await this.keywordOnlySearch(queryKeywords, { limit, scoreThreshold });
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
    // Generate query embedding
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);
    if (!queryEmbedding) {
      // Fall back to keyword search
      return await this.keywordOnlySearch(queryKeywords, options);
    }

    // Semantic search using vector similarity
    const semanticResults = await this.vectorDB.searchSimilar(
      queryEmbedding,
      {
        limit: options.limit * 2, // Get more candidates for hybrid ranking
        scoreThreshold: 0.5 // Lower threshold for semantic similarity
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
   * Keyword-only search (fallback when embeddings not available)
   */
  private async keywordOnlySearch(
    queryKeywords: string[],
    options: { limit: number; scoreThreshold: number }
  ): Promise<BaseSearchResult<T>[]> {
    const keywordResults = await this.vectorDB.searchByKeywords(
      queryKeywords,
      options
    );

    return keywordResults
      .map(result => {
        const data = this.payloadToData(result.payload);
        (data as any).id = result.id;
        return {
          data,
          score: result.score,
          matchType: 'keyword' as const
        };
      })
      .filter(result => result.score >= options.scoreThreshold); // Apply score filtering
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