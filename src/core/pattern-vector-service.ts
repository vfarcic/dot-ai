/**
 * Pattern Vector Service
 * 
 * Handles pattern-specific Vector DB operations with keyword-based matching
 */

import { VectorDBService, VectorDocument } from './vector-db-service';
import { OrganizationalPattern } from './pattern-types';
import { EmbeddingService } from './embedding-service';

export interface PatternSearchOptions {
  limit?: number;
  scoreThreshold?: number;
  keywordWeight?: number; // Weight for keyword vs semantic search
}

export interface PatternSearchResult {
  pattern: OrganizationalPattern;
  score: number;
  matchType: 'keyword' | 'semantic' | 'hybrid';
}

export class PatternVectorService {
  private vectorDB: VectorDBService;
  private embeddingService: EmbeddingService;
  private collectionName = 'patterns';

  constructor(vectorDB: VectorDBService, embeddingService?: EmbeddingService) {
    this.vectorDB = vectorDB;
    this.embeddingService = embeddingService || new EmbeddingService();
  }

  /**
   * Initialize the patterns collection
   */
  async initialize(): Promise<void> {
    // Use embedding dimensions if available, otherwise default to 1536 (OpenAI default)
    const dimensions = this.embeddingService.isAvailable() ? 
      this.embeddingService.getDimensions() : 
      1536;
    await this.vectorDB.initializeCollection(dimensions);
  }

  /**
   * Store a pattern in Vector DB with optional semantic embedding
   */
  async storePattern(pattern: OrganizationalPattern): Promise<void> {
    const searchText = this.createSearchText(pattern);
    
    // Try to generate embedding if service is available
    let embedding: number[] | null = null;
    if (this.embeddingService.isAvailable()) {
      try {
        embedding = await this.embeddingService.generateEmbedding(searchText);
      } catch (error) {
        // Log but don't fail - fall back to keyword-only storage
        console.warn('Failed to generate embedding for pattern, using keyword-only storage:', error);
      }
    }

    const document: VectorDocument = {
      id: pattern.id,
      payload: {
        description: pattern.description,
        triggers: pattern.triggers.map(t => t.toLowerCase()), // Store lowercase for matching
        suggestedResources: pattern.suggestedResources,
        rationale: pattern.rationale,  
        createdAt: pattern.createdAt,
        createdBy: pattern.createdBy,
        searchText: searchText,
        // Store embedding status for debugging
        hasEmbedding: embedding !== null
      },
      vector: embedding || undefined // Use real embedding or let VectorDB use zero vector
    };

    await this.vectorDB.upsertDocument(document);
  }

  /**
   * Search for patterns using hybrid semantic + keyword matching
   */
  async searchPatterns(
    query: string, 
    options: PatternSearchOptions = {}
  ): Promise<PatternSearchResult[]> {
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
   * Hybrid search combining semantic and keyword matching
   */
  private async hybridSearch(
    query: string, 
    queryKeywords: string[],
    options: { limit: number; scoreThreshold: number }
  ): Promise<PatternSearchResult[]> {
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
  ): Promise<PatternSearchResult[]> {
    const keywordResults = await this.vectorDB.searchByKeywords(
      queryKeywords,
      {
        limit: options.limit,
        scoreThreshold: options.scoreThreshold
      }
    );

    return keywordResults.map(result => ({
      pattern: this.payloadToPattern(result.payload, result.id),
      score: this.calculateKeywordScore(queryKeywords, result.payload.triggers || []),
      matchType: 'keyword' as const
    }))
    .filter(result => result.score > options.scoreThreshold)
    .sort((a, b) => b.score - a.score);
  }

  /**
   * Combine semantic and keyword search results with hybrid ranking
   */
  private combineHybridResults(
    semanticResults: any[],
    keywordResults: any[],
    queryKeywords: string[],
    options: { limit: number; scoreThreshold: number }
  ): PatternSearchResult[] {
    // Create map to avoid duplicates and combine scores
    const resultMap = new Map<string, PatternSearchResult>();

    // Process semantic results
    semanticResults.forEach(result => {
      const pattern = this.payloadToPattern(result.payload, result.id);
      const semanticScore = result.score; // Cosine similarity from Vector DB
      
      resultMap.set(result.id, {
        pattern,
        score: semanticScore * 0.7, // Weight semantic score at 70%
        matchType: 'semantic' as const
      });
    });

    // Process keyword results and combine with semantic
    keywordResults.forEach(result => {
      const pattern = this.payloadToPattern(result.payload, result.id);
      const keywordScore = this.calculateKeywordScore(queryKeywords, result.payload.triggers || []);
      
      if (resultMap.has(result.id)) {
        // Combine scores for hybrid result
        const existing = resultMap.get(result.id)!;
        resultMap.set(result.id, {
          pattern,
          score: existing.score + (keywordScore * 0.3), // Add 30% keyword weight
          matchType: 'hybrid' as const
        });
      } else {
        // Keyword-only result - give fair weight, don't penalize
        resultMap.set(result.id, {
          pattern,
          score: keywordScore, // Use full keyword score for keyword-only results
          matchType: 'keyword' as const
        });
      }
    });

    // Convert to array, filter, and sort
    return Array.from(resultMap.values())
      .filter(result => result.score > options.scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit);
  }

  /**
   * Get search mode information for debugging
   */
  getSearchMode(): {
    semantic: boolean;
    provider: string | null;
    reason?: string;
  } {
    const status = this.embeddingService.getStatus();
    return {
      semantic: status.available,
      provider: status.provider,
      reason: status.reason
    };
  }

  /**
   * Get pattern by ID
   */
  async getPattern(id: string): Promise<OrganizationalPattern | null> {
    const document = await this.vectorDB.getDocument(id);
    if (!document) {
      return null;
    }
    return this.payloadToPattern(document.payload, document.id);
  }

  /**
   * Get all patterns
   */
  async getAllPatterns(): Promise<OrganizationalPattern[]> {
    const documents = await this.vectorDB.getAllDocuments();
    return documents.map(doc => this.payloadToPattern(doc.payload, doc.id));
  }

  /**
   * Delete pattern by ID
   */
  async deletePattern(id: string): Promise<void> {
    await this.vectorDB.deleteDocument(id);
  }

  /**
   * Get patterns count
   */
  async getPatternsCount(): Promise<number> {
    try {
      const info = await this.vectorDB.getCollectionInfo();
      return info.points_count || 0;
    } catch (error) {
      // Fallback: get all and count
      const patterns = await this.getAllPatterns();
      return patterns.length;
    }
  }

  /**
   * Health check for pattern storage
   */
  async healthCheck(): Promise<boolean> {
    return await this.vectorDB.healthCheck();
  }

  /**
   * Extract keywords from query text
   */
  private extractKeywords(query: string): string[] {
    // Simple keyword extraction - split on whitespace and punctuation
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter(word => word.length > 2) // Filter out very short words
      .filter(word => !this.isStopWord(word)); // Filter out stop words
  }

  /**
   * Simple stop words list
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his',
      'our', 'their', 'a', 'an'
    ]);
    return stopWords.has(word);
  }

  /**
   * Calculate keyword match score
   */
  private calculateKeywordScore(queryKeywords: string[], patternTriggers: string[]): number {
    if (queryKeywords.length === 0 || patternTriggers.length === 0) {
      return 0;
    }

    const lowerTriggers = patternTriggers.map(t => t.toLowerCase());
    let matchCount = 0;
    let exactMatches = 0;

    for (const keyword of queryKeywords) {
      // Check for exact matches
      if (lowerTriggers.includes(keyword)) {
        exactMatches++;
        matchCount++;
        continue;
      }

      // Check for partial matches (keyword contains trigger or vice versa)
      const hasPartialMatch = lowerTriggers.some(trigger => 
        keyword.includes(trigger) || trigger.includes(keyword)
      );
      
      if (hasPartialMatch) {
        matchCount++;
      }
    }

    // Calculate score: exact matches worth more than partial matches
    const exactScore = (exactMatches / queryKeywords.length) * 1.0;
    const partialScore = ((matchCount - exactMatches) / queryKeywords.length) * 0.5;
    
    return Math.min(exactScore + partialScore, 1.0);
  }

  /**
   * Create searchable text from pattern
   */
  private createSearchText(pattern: OrganizationalPattern): string {
    return [
      pattern.description,
      ...pattern.triggers,
      ...pattern.suggestedResources,
      pattern.rationale
    ].join(' ').toLowerCase();
  }

  /**
   * Convert Vector DB payload back to OrganizationalPattern
   */
  private payloadToPattern(payload: Record<string, any>, id?: string): OrganizationalPattern {
    return {
      id: id || payload.id || '',
      description: payload.description || '',
      triggers: payload.triggers || [],
      suggestedResources: payload.suggestedResources || [],
      rationale: payload.rationale || '',
      createdAt: payload.createdAt || new Date().toISOString(),
      createdBy: payload.createdBy || 'unknown'
    };
  }
}