/**
 * Embedding Service
 *
 * Optional semantic search enhancement for pattern matching.
 * Gracefully falls back to keyword-only search when embedding providers are not available.
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { google } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { embed, EmbeddingModel } from 'ai';
import { CircuitBreaker, CircuitBreakerStats, CircuitOpenError } from './circuit-breaker';
import { withAITracing } from './tracing';

/**
 * Module-level circuit breaker for embedding API calls.
 * Shared across all EmbeddingService instances since they hit the same API.
 * Opens after 3 consecutive failures, blocks for 30s before testing recovery.
 */
const embeddingCircuitBreaker = new CircuitBreaker('embedding-api', {
  failureThreshold: 3,      // Open after 3 consecutive failures
  cooldownPeriodMs: 30000,  // 30s cooldown before half-open
  halfOpenMaxAttempts: 1    // Allow 1 test request in half-open
});

/**
 * Supported embedding providers - single source of truth
 */
export const EMBEDDING_PROVIDERS = ['openai', 'google', 'amazon_bedrock'] as const;
export type EmbeddingProviderType = typeof EMBEDDING_PROVIDERS[number];

export interface EmbeddingConfig {
  provider?: EmbeddingProviderType;
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
 * Options for the embed() function
 */
interface EmbedOptions {
  model: EmbeddingModel<string>;
  value: string;
  providerOptions?: {
    google?: {
      outputDimensionality: number;
      taskType: string;
    };
  };
}

/**
 * Unified Vercel AI SDK Embedding Provider
 * Supports OpenAI, Google, and Amazon Bedrock through Vercel AI SDK
 */
export class VercelEmbeddingProvider implements EmbeddingProvider {
  private providerType: EmbeddingProviderType;
  private apiKey: string;
  private model: string;
  private dimensions: number;
  private available: boolean;
  private modelInstance: EmbeddingModel<string> | undefined;

  constructor(config: EmbeddingConfig & { provider: EmbeddingProviderType }) {
    this.providerType = config.provider;
    this.available = false;

    // Get API key based on provider
    switch (this.providerType) {
      case 'openai':
        this.apiKey = config.apiKey || process.env.CUSTOM_EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || '';
        this.model = config.model || process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small';
        this.dimensions = config.dimensions || (process.env.EMBEDDINGS_DIMENSIONS ? parseInt(process.env.EMBEDDINGS_DIMENSIONS, 10) : 1536);
        break;
      case 'google':
        this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY || '';
        this.model = config.model || process.env.EMBEDDINGS_MODEL || 'gemini-embedding-001';
        this.dimensions = config.dimensions || 768;
        break;
      case 'amazon_bedrock':
        // AWS SDK handles credentials automatically - no API key needed
        this.apiKey = 'bedrock-uses-aws-credentials';
        this.model = config.model || process.env.EMBEDDINGS_MODEL || 'amazon.titan-embed-text-v2:0';
        this.dimensions = config.dimensions || 1024; // Titan v2 default
        break;
    }

    if (!this.apiKey) {
      this.available = false;
      return;
    }

    try {
      // Initialize model instance based on provider
      switch (this.providerType) {
        case 'openai': {
          const baseURL = process.env.CUSTOM_EMBEDDINGS_BASE_URL;
          const openai = createOpenAI({
            apiKey: this.apiKey,
            ...(baseURL && { baseURL })
          });
          this.modelInstance = openai.textEmbedding(this.model);
          break;
        }
        case 'google':
          // Set environment variable that Google SDK expects
          process.env.GOOGLE_GENERATIVE_AI_API_KEY = this.apiKey;
          this.modelInstance = google.textEmbedding(this.model);
          break;
        case 'amazon_bedrock': {
          // AWS SDK automatically uses credential chain:
          // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
          // 2. ~/.aws/credentials file
          // 3. IAM roles (EC2 instance profiles, ECS roles, EKS service accounts)
          const bedrock = createAmazonBedrock({
            region: process.env.AWS_REGION || 'us-east-1',
          });
          this.modelInstance = bedrock.textEmbeddingModel(this.model);
          break;
        }
      }
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error(`${this.providerType} embedding provider not available`);
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty for embedding generation');
    }

    // Wrap embed() call with OpenTelemetry tracing
    return await withAITracing(
      {
        provider: this.providerType,
        model: this.model,
        operation: 'embeddings'
      },
      async () => {
        try {
          // Execute through circuit breaker to prevent cascading failures
          return await embeddingCircuitBreaker.execute(async () => {
            const embedOptions: EmbedOptions = {
              model: this.modelInstance!,
              value: text.trim()
            };

            // Add Google-specific options
            if (this.providerType === 'google') {
              embedOptions.providerOptions = {
                google: {
                  outputDimensionality: this.dimensions,
                  taskType: 'SEMANTIC_SIMILARITY'
                }
              };
            }

            const result = await embed(embedOptions);
            return result.embedding;
          });
        } catch (error) {
          // Convert CircuitOpenError to descriptive message
          if (error instanceof CircuitOpenError) {
            throw new Error(`Embedding API circuit open: ${error.message}`);
          }
          if (error instanceof Error) {
            throw new Error(`${this.providerType} embedding failed: ${error.message}`);
          }
          throw new Error(`${this.providerType} embedding failed: ${String(error)}`);
        }
      },
      (embedding) => ({
        embeddingCount: 1,
        embeddingDimensions: embedding.length
      })
    );
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isAvailable()) {
      throw new Error(`${this.providerType} embedding provider not available`);
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

    // Wrap batch embed calls with OpenTelemetry tracing
    return await withAITracing(
      {
        provider: this.providerType,
        model: this.model,
        operation: 'embeddings'
      },
      async () => {
        try {
          // Execute through circuit breaker to prevent cascading failures
          return await embeddingCircuitBreaker.execute(async () => {
            const results = await Promise.all(
              validTexts.map(text => {
                const embedOptions: EmbedOptions = {
                  model: this.modelInstance!,
                  value: text
                };

                // Add Google-specific options
                if (this.providerType === 'google') {
                  embedOptions.providerOptions = {
                    google: {
                      outputDimensionality: this.dimensions,
                      taskType: 'SEMANTIC_SIMILARITY'
                    }
                  };
                }

                return embed(embedOptions);
              })
            );

            return results.map(result => result.embedding);
          });
        } catch (error) {
          // Convert CircuitOpenError to descriptive message
          if (error instanceof CircuitOpenError) {
            throw new Error(`Embedding API circuit open: ${error.message}`);
          }
          if (error instanceof Error) {
            throw new Error(`${this.providerType} batch embedding failed: ${error.message}`);
          }
          throw new Error(`${this.providerType} batch embedding failed: ${String(error)}`);
        }
      },
      (embeddings) => ({
        embeddingCount: embeddings.length,
        embeddingDimensions: embeddings[0]?.length || this.dimensions
      })
    );
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

  getProviderType(): string {
    return this.providerType;
  }
}

/**
 * Factory function to create embedding provider based on configuration
 */
function createEmbeddingProvider(config: EmbeddingConfig = {}): EmbeddingProvider | null {
  const providerType = (config.provider || process.env.EMBEDDINGS_PROVIDER || 'openai').toLowerCase();

  // Validate provider type using centralized list
  if (!EMBEDDING_PROVIDERS.includes(providerType as EmbeddingProviderType)) {
    console.warn(`Unknown embedding provider: ${providerType}, falling back to openai`);
    return createEmbeddingProvider({ ...config, provider: 'openai' });
  }

  try {
    const provider = new VercelEmbeddingProvider({
      ...config,
      provider: providerType as EmbeddingProviderType
    });
    return provider.isAvailable() ? provider : null;
  } catch (error) {
    console.error(`Failed to create ${providerType} embedding provider:`, error);
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
      // Get provider type from VercelEmbeddingProvider
      const providerName = (this.provider as VercelEmbeddingProvider).getProviderType?.() || 'unknown';

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
      'amazon_bedrock': 'AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)'
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

  /**
   * Get circuit breaker statistics for monitoring
   * Returns null if embedding service is not available
   */
  getCircuitBreakerStats(): CircuitBreakerStats | null {
    return embeddingCircuitBreaker.getStats();
  }
}