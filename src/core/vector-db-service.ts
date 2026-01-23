/**
 * Vector DB Service
 *
 * Handles Qdrant Vector Database integration for semantic search and storage
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { withQdrantTracing } from './tracing/qdrant-tracing';

/**
 * Escape special regex characters to prevent ReDoS attacks
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Simple semaphore to limit concurrent Qdrant operations
 * Prevents overwhelming Qdrant with too many parallel requests
 */
class QdrantSemaphore {
  private maxConcurrent: number;
  private currentCount: number = 0;
  private waitQueue: Array<() => void> = [];

  constructor(maxConcurrent: number = 20) {
    this.maxConcurrent = maxConcurrent;
  }

  async acquire(): Promise<void> {
    if (this.currentCount < this.maxConcurrent) {
      this.currentCount++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.currentCount--;
    }
  }
}

// Limit concurrent Qdrant bulk operations (scroll, getAllDocuments)
const qdrantSemaphore = new QdrantSemaphore(100);

export interface VectorDBConfig {
  url?: string;
  apiKey?: string;
  collectionName?: string;
}

export interface VectorDocument {
  id: string;
  payload: Record<string, any>;
  vector?: number[];
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
}

export interface SearchOptions {
  limit?: number;
  scoreThreshold?: number;
  filter?: Record<string, any>;  // Qdrant filter object for exact filtering
}

export class VectorDBService {
  private client: QdrantClient | null = null;
  private config: VectorDBConfig;
  private collectionName: string;

  constructor(config: VectorDBConfig = {}) {
    if (!config.collectionName) {
      throw new Error('Collection name is required for Vector DB service');
    }
    
    this.config = {
      url: config.url !== undefined ? config.url : (process.env.QDRANT_URL || 'http://localhost:6333'),
      apiKey: config.apiKey || process.env.QDRANT_API_KEY,
      collectionName: config.collectionName
    };
    
    this.collectionName = this.config.collectionName!;
    this.validateConfig();
    
    if (this.shouldInitializeClient()) {
      this.client = new QdrantClient({
        url: this.config.url!,
        apiKey: this.config.apiKey,
        maxConnections: 100,  // HTTP keep-alive pool for connection reuse
      });
    }
  }

  private validateConfig(): void {
    // Allow test-friendly initialization
    if (this.config.url === 'test-url' || this.config.url === 'mock-url') {
      return; // Allow test configurations
    }
    
    if (!this.config.url || this.config.url.trim() === '') {
      throw new Error('Qdrant URL is required for Vector DB integration');
    }
  }

  private shouldInitializeClient(): boolean {
    // Don't initialize for test configurations
    const testUrls = ['test-url', 'mock-url'];
    return !testUrls.includes(this.config.url || '');
  }

  /**
   * Check if collection exists without creating it
   */
  async collectionExists(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const collections = await this.client.getCollections();
      return collections.collections.some(col => col.name === this.collectionName);
    } catch {
      return false;
    }
  }

  /**
   * Initialize the collection if it doesn't exist
   */
  async initializeCollection(vectorSize: number = 384): Promise<void> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    return withQdrantTracing(
      {
        operation: 'collection.initialize',
        collectionName: this.collectionName,
        vectorSize,
        serverUrl: this.config.url
      },
      async () => {
        try {
          // Check if collection exists
          const collections = await this.client!.getCollections();
          const collectionExists = collections.collections.some(
            col => col.name === this.collectionName
          );

          if (collectionExists) {
            // Verify existing collection has correct vector dimensions
            try {
              const collectionInfo = await this.client!.getCollection(this.collectionName);
              const existingVectorSize = collectionInfo.config?.params?.vectors?.size;

              if (existingVectorSize && existingVectorSize !== vectorSize) {
                // Dimension mismatch - recreate collection
                console.warn(`Vector dimension mismatch: existing collection has ${existingVectorSize} dimensions, but ${vectorSize} expected. Recreating collection.`);
                await this.client!.deleteCollection(this.collectionName);
                await this.createCollection(vectorSize);
              } else {
                // Ensure text index exists for existing collections (transparent upgrade)
                await this.ensureTextIndex();
              }
            } catch (error) {
              // If we can't get collection info, assume it's corrupted and recreate
              console.warn(`Failed to get collection info, recreating collection: ${error}`);
              await this.client!.deleteCollection(this.collectionName);
              await this.createCollection(vectorSize);
            }
          } else {
            // Create new collection
            await this.createCollection(vectorSize);
          }
        } catch (error) {
          throw new Error(`Failed to initialize collection: ${error}`);
        }
      }
    );
  }

  /**
   * Create collection with specified vector size
   * Handles conflict errors gracefully (collection already exists from race condition or restart)
   */
  private async createCollection(vectorSize: number): Promise<void> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    try {
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
          on_disk: true // Enable on-disk storage for better performance with large collections
        },
        optimizers_config: {
          default_segment_number: 2
        }
      });

      // Create text index on searchText field for efficient keyword search
      await this.ensureTextIndex();
    } catch (error) {
      // Handle race condition where collection was created between check and create
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('conflict') ||
          errorMessage.toLowerCase().includes('already exists')) {
        // Collection exists - this is fine (race condition or restart)
        if (process.env.DEBUG_DOT_AI) {
          console.debug(`Collection ${this.collectionName} already exists, skipping creation`);
        }
        return;
      }
      throw error;
    }
  }

  /**
   * Ensure text index exists on searchText field for efficient keyword search
   * This is idempotent - safe to call multiple times
   */
  private async ensureTextIndex(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      // Check if index already exists
      const collectionInfo = await this.client.getCollection(this.collectionName);
      const payloadSchema = collectionInfo.payload_schema || {};

      // Check if searchText already has a text index
      const searchTextIndex = payloadSchema['searchText'];
      if (searchTextIndex && searchTextIndex.data_type === 'text') {
        return; // Index already exists
      }

      // Create text index on searchText field
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'searchText',
        field_schema: 'text',
      });

      if (process.env.DEBUG_DOT_AI) {
        console.debug(`Created text index on searchText field for collection ${this.collectionName}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAlreadyExists = errorMessage.toLowerCase().includes('already exists') ||
                              errorMessage.toLowerCase().includes('conflict');
      if (isAlreadyExists) {
        if (process.env.DEBUG_DOT_AI) {
          console.debug(`Text index already exists for collection ${this.collectionName}`);
        }
      } else {
        // Unexpected error - log at warn level for visibility
        console.warn(`Failed to create text index on ${this.collectionName}: ${errorMessage}`);
      }
    }
  }

  /**
   * Store a document with optional vector
   */
  async upsertDocument(document: VectorDocument): Promise<void> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    return withQdrantTracing(
      {
        operation: 'vector.upsert',
        collectionName: this.collectionName,
        documentId: document.id,
        vectorSize: document.vector?.length,
        serverUrl: this.config.url
      },
      async () => {
        try {
          const point: any = {
            id: document.id,
            payload: document.payload,
            vector: document.vector
          };

          // Validate vector is provided
          if (!document.vector || document.vector.length === 0) {
            throw new Error('Vector is required for vector database storage');
          }

          await this.client!.upsert(this.collectionName, {
            wait: true,
            points: [point]
          });
        } catch (error) {
          throw new Error(`Failed to upsert document: ${error}`);
        }
      }
    );
  }

  /**
   * Search for similar documents using vector similarity
   */
  async searchSimilar(
    vector: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    const limit = options.limit || 10;
    const scoreThreshold = options.scoreThreshold || 0.5;

    return withQdrantTracing(
      {
        operation: 'vector.search',
        collectionName: this.collectionName,
        vectorSize: vector.length,
        limit,
        scoreThreshold,
        serverUrl: this.config.url
      },
      async () => {
        try {
          const searchResult = await this.client!.search(this.collectionName, {
            vector,
            limit,
            score_threshold: scoreThreshold,
            with_payload: true,
            ...(options.filter && { filter: options.filter })
          });

          return searchResult.map(result => ({
            id: result.id.toString(),
            score: result.score,
            payload: result.payload || {}
          }));
        } catch (error) {
          throw new Error(`Failed to search documents: ${error}`);
        }
      }
    );
  }

  /**
   * Search for documents using payload filtering (keyword search)
   * Uses Qdrant's native text index for efficient server-side filtering
   */
  async searchByKeywords(
    keywords: string[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    const limit = options.limit || 10;

    return withQdrantTracing(
      {
        operation: 'vector.search_keywords',
        collectionName: this.collectionName,
        keywordCount: keywords.length,
        limit,
        serverUrl: this.config.url
      },
      async () => {
        try {
          // Build Qdrant filter for text search
          // Use "should" (OR) to match any keyword in searchText or triggers
          const keywordConditions: any[] = [];

          for (const keyword of keywords) {
            // Text match on searchText field (uses text index)
            keywordConditions.push({
              key: 'searchText',
              match: { text: keyword }
            });

            // Match on triggers array (for patterns/policies)
            keywordConditions.push({
              key: 'triggers',
              match: { any: [keyword, keyword.toLowerCase()] }
            });
          }

          // Combine keyword conditions with any user-provided filter
          const filter: any = {
            should: keywordConditions
          };

          // If user provided additional filters, merge them properly
          if (options.filter) {
            // Merge must conditions
            if (options.filter.must) {
              filter.must = Array.isArray(options.filter.must)
                ? options.filter.must
                : [options.filter.must];
            }
            // Preserve must_not conditions
            if (options.filter.must_not) {
              filter.must_not = options.filter.must_not;
            }
            // If user filter has should conditions, wrap in must to AND with keyword should
            if (options.filter.should) {
              filter.must = [...(filter.must || []), { should: options.filter.should }];
            }
          }

          // Use scroll with native Qdrant filtering - much faster than client-side
          const scrollResult = await this.client!.scroll(this.collectionName, {
            limit: limit * 10, // Get more candidates for scoring, but not 1000
            with_payload: true,
            with_vector: false,
            filter
          });

          // Score the filtered results (small set now)
          const scoredPoints = scrollResult.points
            .map(point => {
              if (!point.payload) return null;

              const searchText = (point.payload.searchText as string || '').toLowerCase();
              const triggers = Array.isArray(point.payload.triggers)
                ? (point.payload.triggers as string[]).map(t => t.toLowerCase())
                : [];

              // Count keyword matches for scoring
              let matchCount = 0;
              let exactMatch = false;

              for (const keyword of keywords) {
                const kw = keyword.toLowerCase();

                // Check searchText
                if (searchText.includes(kw)) {
                  matchCount++;
                  const wordPattern = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i');
                  if (wordPattern.test(searchText)) {
                    exactMatch = true;
                  }
                }

                // Check triggers
                if (triggers.some(t => t.includes(kw) || kw.includes(t))) {
                  matchCount++;
                }
              }

              if (matchCount === 0) return null;

              const baseScore = matchCount / keywords.length;
              const score = exactMatch ? Math.min(1.0, baseScore + 0.3) : baseScore;

              return { point, score };
            })
            .filter((item): item is { point: any; score: number } => item !== null)
            .sort((a, b) => b.score - a.score);

          const limitedResults = scoredPoints.slice(0, limit);

          return limitedResults.map(({ point, score }) => ({
            id: point.id.toString(),
            score,
            payload: point.payload || {}
          }));
        } catch (error) {
          throw new Error(`Failed to search by keywords: ${error}`);
        }
      }
    );
  }

  /**
   * Get a document by ID
   */
  async getDocument(id: string): Promise<VectorDocument | null> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    return withQdrantTracing(
      {
        operation: 'vector.retrieve',
        collectionName: this.collectionName,
        documentId: id,
        serverUrl: this.config.url
      },
      async () => {
        try {
          const result = await this.client!.retrieve(this.collectionName, {
            ids: [id],
            with_payload: true,
            with_vector: true
          });

          if (result.length === 0) {
            return null;
          }

          const point = result[0];
          return {
            id: point.id.toString(),
            payload: point.payload || {},
            vector: point.vector as number[] || undefined
          };
        } catch (error) {
          throw new Error(`Failed to get document: ${error}`);
        }
      }
    );
  }

  /**
   * Delete a document by ID
   */
  async deleteDocument(id: string): Promise<void> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    return withQdrantTracing(
      {
        operation: 'vector.delete',
        collectionName: this.collectionName,
        documentId: id,
        serverUrl: this.config.url
      },
      async () => {
        try {
          await this.client!.delete(this.collectionName, {
            wait: true,
            points: [id]
          });
          // Qdrant's wait:true ensures the write operation completes, but there can be
          // a brief window where subsequent reads may still return stale data due to
          // internal segment synchronization. This delay ensures consistency for
          // immediate read-after-delete operations in integration tests and workflows.
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          throw new Error(`Failed to delete document: ${error}`);
        }
      }
    );
  }

  /**
   * Delete all documents by clearing all points from the collection
   * More efficient than retrieving and deleting individual records
   * Collection structure is preserved, avoiding Qdrant storage cleanup issues
   */
  async deleteAllDocuments(): Promise<void> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    return withQdrantTracing(
      {
        operation: 'vector.delete_all',
        collectionName: this.collectionName,
        serverUrl: this.config.url
      },
      async () => {
        try {
          // Check if collection exists first
          const collections = await this.client!.getCollections();
          const collectionExists = collections.collections.some(col => col.name === this.collectionName);

          if (!collectionExists) {
            // Collection doesn't exist, nothing to delete
            return;
          }

          // Delete all points from collection instead of deleting entire collection
          // This avoids Qdrant's known storage directory cleanup bug
          await this.client!.delete(this.collectionName, {
            filter: {
              must: [] // Empty must array matches all points
            },
            wait: true // Wait for operation to complete synchronously
          });

          console.warn(`All points deleted from collection ${this.collectionName} (collection structure preserved)`);
        } catch (error) {
          throw new Error(`Failed to delete all documents: ${error}`);
        }
      }
    );
  }

  /**
   * Scroll documents with Qdrant filter
   * @param filter - Qdrant filter object (must/should/must_not conditions)
   * @param limit - Maximum documents to retrieve
   * Uses semaphore to limit concurrent Qdrant operations
   */
  async scrollWithFilter(filter: any, limit: number = 100): Promise<VectorDocument[]> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    // Acquire semaphore slot before executing
    await qdrantSemaphore.acquire();

    try {
      return await withQdrantTracing(
        {
          operation: 'vector.scroll_filtered',
          collectionName: this.collectionName,
          limit,
          serverUrl: this.config.url
        },
        async () => {
          try {
            const scrollResult = await this.client!.scroll(this.collectionName, {
              filter,
              limit,
              with_payload: true,
              with_vector: false
            });

            return scrollResult.points.map(point => ({
              id: point.id.toString(),
              payload: point.payload || {}
            }));
          } catch (error) {
            throw new Error(`Failed to scroll with filter: ${error}`);
          }
        }
      );
    } finally {
      qdrantSemaphore.release();
    }
  }

  /**
   * Get all documents (for listing)
   * @param limit - Maximum number of documents to retrieve. Defaults to unlimited (10000).
   * Uses semaphore to limit concurrent Qdrant operations
   */
  async getAllDocuments(limit: number = 10000): Promise<VectorDocument[]> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    // Acquire semaphore slot before executing
    await qdrantSemaphore.acquire();

    try {
      return await withQdrantTracing(
        {
          operation: 'vector.list',
          collectionName: this.collectionName,
          limit,
          serverUrl: this.config.url
        },
        async () => {
          try {
            // Check if collection exists first
            const collections = await this.client!.getCollections();
            const collectionExists = collections.collections.some(
              col => col.name === this.collectionName
            );

            if (!collectionExists) {
              throw new Error(`Collection '${this.collectionName}' does not exist. No data has been stored yet.`);
            }

            const scrollResult = await this.client!.scroll(this.collectionName, {
              limit,
              with_payload: true,
              with_vector: false
            });

            return scrollResult.points.map(point => ({
              id: point.id.toString(),
              payload: point.payload || {}
            }));
          } catch (error) {
            throw new Error(`Failed to get all documents: ${error}`);
          }
        }
      );
    } finally {
      qdrantSemaphore.release();
    }
  }

  /**
   * Get collection info and statistics
   */
  async getCollectionInfo(): Promise<any> {
    if (!this.client) {
      throw new Error('Vector DB client not initialized');
    }

    return withQdrantTracing(
      {
        operation: 'collection.get',
        collectionName: this.collectionName,
        serverUrl: this.config.url
      },
      async () => {
        try {
          return await this.client!.getCollection(this.collectionName);
        } catch (error) {
          throw new Error(`Failed to get collection info: ${error}`);
        }
      }
    );
  }

  /**
   * Check if Vector DB is available and responsive
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    return withQdrantTracing(
      {
        operation: 'health_check',
        collectionName: this.collectionName,
        serverUrl: this.config.url
      },
      async () => {
        try {
          await this.client!.getCollections();
          return true;
        } catch (error) {
          return false;
        }
      }
    );
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.client !== null;
  }

  /**
   * Get configuration (for debugging)
   */
  getConfig(): VectorDBConfig {
    return { ...this.config };
  }
}