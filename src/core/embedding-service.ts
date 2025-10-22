/**
 * Embedding Service
 * 
 * Optional semantic search enhancement for pattern matching.
 * Gracefully falls back to keyword-only search when embedding providers are not available.
 */

import OpenAI from 'openai';
import { google } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { embed } from 'ai';
import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from "@aws-sdk/client-bedrock-runtime";

export interface EmbeddingConfig {
  provider?: 'openai' | 'google' | 'mistral' | 'bedrock';
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  isAvailable(): boolean;
  getDimensions(): number;
  getModel(): string;
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
 * Google Embedding Provider
 * Optional provider using Google's text-embedding-004 model
 */
export class GoogleEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string | null = null;
  private model: string;
  private dimensions: number;
  private available: boolean;

  constructor(config: EmbeddingConfig = {}) {
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY || null;
    this.model = config.model || 'text-embedding-004';
    this.dimensions = config.dimensions || 768; // text-embedding-004 default
    this.available = !!this.apiKey;
    
    // Set the environment variable that Google SDK expects
    if (this.apiKey) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = this.apiKey;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error('Google embedding provider not available');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty for embedding generation');
    }

    try {
      const model = google.textEmbedding(this.model);
      const result = await embed({
        model,
        value: text.trim(),
        providerOptions: {
          google: {
            outputDimensionality: this.dimensions,
            taskType: 'SEMANTIC_SIMILARITY'
          }
        }
      });

      return result.embedding;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Google embedding failed: ${error.message}`);
      }
      throw new Error(`Google embedding failed: ${String(error)}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isAvailable()) {
      throw new Error('Google embedding provider not available');
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
      const model = google.textEmbedding(this.model);
      const results = await Promise.all(
        validTexts.map(text => 
          embed({
            model,
            value: text,
            providerOptions: {
              google: {
                outputDimensionality: this.dimensions,
                taskType: 'SEMANTIC_SIMILARITY'
              }
            }
          })
        )
      );

      return results.map(result => result.embedding);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Google batch embedding failed: ${error.message}`);
      }
      throw new Error(`Google batch embedding failed: ${String(error)}`);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}

/**
 * Mistral Embedding Provider
 * Optional provider using Mistral's text-embedding-v1 model
 */
export class MistralEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string | null = null;
  private model: string;
  private dimensions: number;
  private available: boolean;

  constructor(config: EmbeddingConfig = {}) {
    this.apiKey = config.apiKey || process.env.MISTRAL_API_KEY || null;
    this.model = config.model || 'mistral-embed';
    this.dimensions = config.dimensions || 1024; // mistral-embed default
    this.available = !!this.apiKey;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error('Mistral embedding provider not available');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty for embedding generation');
    }

    try {
      const mistral = createMistral({ apiKey: this.apiKey! });
      const model = mistral.textEmbedding(this.model);
      const result = await embed({
        model,
        value: text.trim()
      });

      return result.embedding;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Mistral embedding failed: ${error.message}`);
      }
      throw new Error(`Mistral embedding failed: ${String(error)}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isAvailable()) {
      throw new Error('Mistral embedding provider not available');
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
      const mistral = createMistral({ apiKey: this.apiKey! });
      const model = mistral.textEmbedding(this.model);
      const results = await Promise.all(
        validTexts.map(text =>
          embed({
            model,
            value: text
          })
        )
      );

      return results.map(result => result.embedding);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Mistral batch embedding failed: ${error.message}`);
      }
      throw new Error(`Mistral batch embedding failed: ${String(error)}`);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModel(): string {
    return this.model;
  }
}

/**
 * Bedrock Embedding Provider
 * Optional provider using Amazon Bedrock embedding models
 */
export class BedrockEmbeddingProvider implements EmbeddingProvider {
  private client: BedrockRuntimeClient | null = null;
  private model: string;
  private dimensions: number;
  private available: boolean;
  private region: string;

  constructor(config: EmbeddingConfig = {}) {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.model = config.model || process.env.BEDROCK_EMBEDDING_MODEL || 'amazon.titan-embed-text-v1';
    this.dimensions = config.dimensions || 1536; // Default dimensions for most Bedrock embedding models
    this.available = false;

    // Initialize client with appropriate authentication
    const clientOptions: any = {
      region: this.region
    };

    // Check if API key authentication is available
    if (process.env.BEDROCK_API_KEY) {
      clientOptions.apiKey = process.env.BEDROCK_API_KEY;
      this.available = true;
    } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      // Use AWS credentials
      this.available = true;
    } else {
      this.available = false;
      return;
    }

    try {
      this.client = new BedrockRuntimeClient(clientOptions);
      this.available = true;
    } catch (error) {
      this.available = false;
      this.client = null;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error('Bedrock embedding provider not available');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty for embedding generation');
    }

    try {
      const provider = this.getModelProvider();
      const requestBody = this.formatRequestForModel(provider, text.trim());

      const command = new InvokeModelCommand({
        modelId: this.model,
        body: JSON.stringify(requestBody)
      });

      const response = await this.client!.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return this.extractEmbeddingFromResponse(provider, responseBody);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bedrock embedding failed: ${error.message}`);
      }
      throw new Error(`Bedrock embedding failed: ${String(error)}`);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isAvailable()) {
      throw new Error('Bedrock embedding provider not available');
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
      // Process each text individually to handle provider-specific formatting
      const results = await Promise.all(
        validTexts.map(text => this.generateEmbedding(text))
      );
      return results;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bedrock batch embedding failed: ${error.message}`);
      }
      throw new Error(`Bedrock batch embedding failed: ${String(error)}`);
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

  private getModelProvider(): string {
    return this.model.split('.')[0];
  }

  private formatRequestForModel(provider: string, text: string): any {
    switch (provider) {
      case 'amazon':
        return {
          inputText: text
        };
      case 'cohere':
        return {
          texts: [text],
          input_type: "search_document"
        };
      default:
        throw new Error(`Unsupported Bedrock embedding model provider: ${provider}`);
    }
  }

  private extractEmbeddingFromResponse(provider: string, response: any): number[] {
    switch (provider) {
      case 'amazon':
        return response.embedding;
      case 'cohere':
        return response.embeddings[0];
      default:
        throw new Error(`Unsupported Bedrock embedding model provider: ${provider}`);
    }
  }
}

/**
 * Factory function to create embedding provider based on configuration
 */
function createEmbeddingProvider(config: EmbeddingConfig = {}): EmbeddingProvider | null {
  const provider = config.provider || process.env.EMBEDDINGS_PROVIDER || 'openai';

  try {
    switch (provider.toLowerCase()) {
      case 'google': {
        const googleProvider = new GoogleEmbeddingProvider(config);
        return googleProvider.isAvailable() ? googleProvider : null;
      }

      case 'mistral': {
        const mistralProvider = new MistralEmbeddingProvider(config);
        return mistralProvider.isAvailable() ? mistralProvider : null;
      }

      case 'bedrock': {
        const bedrockProvider = new BedrockEmbeddingProvider(config);
        return bedrockProvider.isAvailable() ? bedrockProvider : null;
      }

      case 'openai':
      default: {
        const openaiProvider = new OpenAIEmbeddingProvider(config);
        return openaiProvider.isAvailable() ? openaiProvider : null;
      }
    }
  } catch (error) {
    return null;
  }
}

/**
 * Main Embedding Service
 * Provides optional semantic search capabilities with graceful degradation
 */
export class EmbeddingService {
  private provider: EmbeddingProvider | null;

  constructor(config: EmbeddingConfig = {}) {
    // Use factory to initialize appropriate provider
    this.provider = createEmbeddingProvider(config);
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
      // Determine provider type based on instance
      let providerName: string;
      if (this.provider instanceof GoogleEmbeddingProvider) {
        providerName = 'google';
      } else if (this.provider instanceof MistralEmbeddingProvider) {
        providerName = 'mistral';
      } else if (this.provider instanceof OpenAIEmbeddingProvider) {
        providerName = 'openai';
      } else if (this.provider instanceof BedrockEmbeddingProvider) {
        providerName = 'bedrock';
      } else {
        providerName = 'unknown';
      }

      return {
        available: true,
        provider: providerName,
        model: this.provider!.getModel(),
        dimensions: this.provider!.getDimensions()
      };
    }

    const requestedProvider = process.env.EMBEDDINGS_PROVIDER || 'openai';
    const keyMap = {
      'openai': 'OPENAI_API_KEY',
      'google': 'GOOGLE_API_KEY',
      'mistral': 'MISTRAL_API_KEY',
      'bedrock': 'BEDROCK_API_KEY or AWS credentials'
    };
    const requiredKey = keyMap[requestedProvider as keyof typeof keyMap] || 'OPENAI_API_KEY';

    return {
      available: false,
      provider: null,
      reason: `${requiredKey} not set - vector operations will fail`
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