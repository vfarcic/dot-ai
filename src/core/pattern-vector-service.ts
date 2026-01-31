/**
 * Pattern Vector Service
 * 
 * Handles pattern-specific Vector DB operations
 * Extends BaseVectorService for organizational patterns
 */

import { OrganizationalPattern } from './pattern-types';
import { EmbeddingService } from './embedding-service';
import { BaseVectorService, BaseSearchOptions, BaseSearchResult } from './base-vector-service';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PatternSearchOptions extends BaseSearchOptions {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PatternSearchResult extends BaseSearchResult<OrganizationalPattern> {}

export class PatternVectorService extends BaseVectorService<OrganizationalPattern> {
  constructor(collectionName: string = 'patterns', embeddingService?: EmbeddingService) {
    super(collectionName, embeddingService);
  }

  // Implement abstract methods from BaseVectorService
  protected createSearchText(pattern: OrganizationalPattern): string {
    const triggerText = pattern.triggers.join(' ');
    const resourceText = pattern.suggestedResources.join(' ');
    
    return `${pattern.description} ${triggerText} ${resourceText} ${pattern.rationale}`.toLowerCase();
  }

  protected extractId(pattern: OrganizationalPattern): string {
    return pattern.id;
  }

  protected createPayload(pattern: OrganizationalPattern): Record<string, unknown> {
    return {
      description: pattern.description,
      triggers: pattern.triggers.map(t => t.toLowerCase()),
      suggestedResources: pattern.suggestedResources,
      rationale: pattern.rationale,  
      createdAt: pattern.createdAt,
      createdBy: pattern.createdBy
    };
  }

  protected payloadToData(payload: Record<string, unknown>): OrganizationalPattern {
    return {
      id: '', // Will be set from document ID in base class
      description: payload.description as string,
      triggers: payload.triggers as string[],
      suggestedResources: payload.suggestedResources as string[],
      rationale: payload.rationale as string,
      createdAt: payload.createdAt as string,
      createdBy: payload.createdBy as string
    };
  }

  // Public API methods - delegate to base class with appropriate names
  async storePattern(pattern: OrganizationalPattern): Promise<void> {
    await this.storeData(pattern);
  }

  async searchPatterns(query: string, options: PatternSearchOptions = {}): Promise<PatternSearchResult[]> {
    return await this.searchData(query, options);
  }

  async getPattern(id: string): Promise<OrganizationalPattern | null> {
    return await this.getData(id);
  }

  async getAllPatterns(): Promise<OrganizationalPattern[]> {
    return await this.getAllData();
  }

  async deletePattern(id: string): Promise<void> {
    await this.deleteData(id);
  }

  async getPatternsCount(): Promise<number> {
    return await this.getDataCount();
  }
}