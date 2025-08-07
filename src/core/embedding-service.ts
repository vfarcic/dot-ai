/**
 * Embedding Service
 * 
 * Optional semantic search enhancement for pattern matching.
 * Gracefully falls back to keyword-only search when OpenAI API key is not available.
 */

import OpenAI from 'openai';

export interface EmbeddingConfig {
  provider?: 'openai';
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  isAvailable(): boolean;
  getDimensions(): number;
}

/**
 * OpenAI Embedding Provider
 * Optional provider for semantic search enhancement
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI | null = null;
  private model: string;
  private dimensions: number;
  private available: boolean;

  constructor(config: EmbeddingConfig = {}) {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.model = config.model || 'text-embedding-3-small';
    this.dimensions = config.dimensions || 1536; // text-embedding-3-small default
    this.available = false;
    
    if (apiKey) {
      try {
        this.client = new OpenAI({ apiKey: apiKey });
        this.available = true;
      } catch (error) {
        // Client creation failed, remain unavailable
        this.available = false;
        this.client = null;
      }
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error('OpenAI embedding provider not available');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty for embedding generation');
    }

    try {
      const response = await this.client!.embeddings.create({
        model: this.model,
        input: text.trim(),
        encoding_format: 'float'
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned from OpenAI API');
      }

      return response.data[0].embedding;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI embedding failed: ${error.message}`);
      }
      throw new Error(`OpenAI embedding failed: ${String(error)}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isAvailable()) {
      throw new Error('OpenAI embedding provider not available');
    }

    if (!texts || texts.length === 0) {
      return [];
    }

    const validTexts = texts
      .map(t => t?.trim())
      .filter(t => t && t.length > 0);

    if (validTexts.length === 0) {
      return [];
    }

    try {
      const response = await this.client!.embeddings.create({
        model: this.model,
        input: validTexts,
        encoding_format: 'float'
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenAI batch embedding failed: ${error.message}`);
      }
      throw new Error(`OpenAI batch embedding failed: ${String(error)}`);
    }
  }

  isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}

/**
 * Main Embedding Service
 * Provides optional semantic search capabilities with graceful degradation
 */
export class EmbeddingService {
  private provider: EmbeddingProvider | null;

  constructor(config: EmbeddingConfig = {}) {
    // Try to initialize OpenAI provider, but don't fail if unavailable
    try {
      const provider = new OpenAIEmbeddingProvider(config);
      this.provider = provider.isAvailable() ? provider : null;
    } catch (error) {
      this.provider = null;
    }
  }

  /**
   * Generate embedding for text 
   * Throws error if embeddings not available or generation fails
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error('Embedding service not available');
    }

    try {
      return await this.provider!.generateEmbedding(text);
    } catch (error) {
      // Throw error immediately - no silent fallback
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (optional enhancement)
   * Returns empty array if embeddings not available
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      return await this.provider!.generateEmbeddings(texts);
    } catch (error) {
      // Log error but don't throw - allow graceful fallback
      console.warn('Batch embedding generation failed, falling back to keyword search:', error);
      return [];
    }
  }

  /**
   * Check if semantic search is available
   */
  isAvailable(): boolean {
    return this.provider !== null && this.provider.isAvailable();
  }

  /**
   * Get embedding dimensions (if available)
   */
  getDimensions(): number {
    return this.provider?.getDimensions() || 1536;
  }

  /**
   * Get status information for debugging/logging
   */
  getStatus(): {
    available: boolean;
    provider: string | null;
    model?: string;
    dimensions?: number;
    reason?: string;
  } {
    if (this.isAvailable()) {
      const openaiProvider = this.provider as OpenAIEmbeddingProvider;
      return {
        available: true,
        provider: 'openai',
        model: openaiProvider.getModel(),
        dimensions: openaiProvider.getDimensions()
      };
    }

    return {
      available: false,
      provider: null,
      reason: 'OPENAI_API_KEY not set - vector operations will fail'
    };
  }

  /**
   * Create searchable text from pattern data
   */
  createPatternSearchText(pattern: {
    description: string;
    triggers: string[];
    suggestedResources: string[];
    rationale: string;
  }): string {
    return [
      pattern.description,
      ...pattern.triggers,
      pattern.rationale,
      // Include resource types for better semantic matching
      ...pattern.suggestedResources.map(r => `kubernetes ${r.toLowerCase()}`)
    ].join(' ').trim();
  }
}