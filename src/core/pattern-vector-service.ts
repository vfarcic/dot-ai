/**
 * Pattern Vector Service
 * 
 * Handles pattern-specific Vector DB operations with keyword-based matching
 */

import { VectorDBService, VectorDocument } from './vector-db-service';
import { OrganizationalPattern } from './pattern-types';

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
  private collectionName = 'patterns';

  constructor(vectorDB: VectorDBService) {
    this.vectorDB = vectorDB;
  }

  /**
   * Initialize the patterns collection
   */
  async initialize(): Promise<void> {
    await this.vectorDB.initializeCollection(384); // Using 384 dimensions for potential future embeddings
  }

  /**
   * Store a pattern in Vector DB
   */
  async storePattern(pattern: OrganizationalPattern): Promise<void> {
    const document: VectorDocument = {
      id: pattern.id,
      payload: {
        description: pattern.description,
        triggers: pattern.triggers.map(t => t.toLowerCase()), // Store lowercase for matching
        suggestedResources: pattern.suggestedResources,
        rationale: pattern.rationale,
        createdAt: pattern.createdAt,
        createdBy: pattern.createdBy,
        // Add searchable text combining all text fields
        searchText: this.createSearchText(pattern)
      }
      // No vector for now - using keyword matching only
    };

    await this.vectorDB.upsertDocument(document);
  }

  /**
   * Search for patterns using keyword matching
   */
  async searchPatterns(
    query: string, 
    options: PatternSearchOptions = {}
  ): Promise<PatternSearchResult[]> {
    // Extract keywords from query
    const queryKeywords = this.extractKeywords(query);
    
    if (queryKeywords.length === 0) {
      return [];
    }

    // Search using keyword matching
    const keywordResults = await this.vectorDB.searchByKeywords(
      queryKeywords,
      {
        limit: options.limit || 10,
        scoreThreshold: options.scoreThreshold || 0.1
      }
    );

    // Convert results to pattern search results
    return keywordResults.map(result => ({
      pattern: this.payloadToPattern(result.payload, result.id),
      score: this.calculateKeywordScore(queryKeywords, result.payload.triggers || []),
      matchType: 'keyword' as const
    }))
    .filter(result => result.score > (options.scoreThreshold || 0.1))
    .sort((a, b) => b.score - a.score);
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