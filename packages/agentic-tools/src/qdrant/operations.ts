/**
 * Qdrant Operations
 *
 * Shared internal functions for Qdrant vector database operations.
 * These are NOT exposed as tools directly - domain tools call these functions.
 */

import { getQdrantClient, getQdrantConfig } from './client';
import type {
  VectorDocument,
  SearchResult,
  SearchOptions,
  QueryOptions,
  ListOptions,
  StoreOptions,
  CollectionStats,
  InitializeCollectionOptions,
} from './types';

/**
 * Store a document with its vector embedding
 *
 * @param collection - Collection name
 * @param id - Document ID
 * @param embedding - Vector embedding
 * @param payload - Document payload/metadata
 * @param options - Store options
 */
export async function store(
  collection: string,
  id: string,
  embedding: number[],
  payload: Record<string, unknown>,
  options: StoreOptions = {}
): Promise<void> {
  const client = getQdrantClient();
  const wait = options.wait !== false; // Default to true

  if (!embedding || embedding.length === 0) {
    throw new Error('Vector embedding is required for storage');
  }

  await client.upsert(collection, {
    wait,
    points: [
      {
        id,
        vector: embedding,
        payload,
      },
    ],
  });
}

/**
 * Search for similar documents using vector similarity
 *
 * @param collection - Collection name
 * @param embedding - Query vector embedding
 * @param options - Search options
 * @returns Array of search results with scores
 */
export async function search(
  collection: string,
  embedding: number[],
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const client = getQdrantClient();
  const limit = options.limit ?? 10;
  const scoreThreshold = options.scoreThreshold ?? 0.5;

  const searchResult = await client.search(collection, {
    vector: embedding,
    limit,
    score_threshold: scoreThreshold,
    with_payload: true,
    ...(options.filter && { filter: options.filter }),
  });

  return searchResult.map((result) => ({
    id: result.id.toString(),
    score: result.score,
    payload: (result.payload as Record<string, unknown>) || {},
  }));
}

/**
 * Query documents using Qdrant filter (no vector search)
 *
 * @param collection - Collection name
 * @param filter - Qdrant filter object
 * @param options - Query options
 * @returns Array of matching documents
 */
export async function query(
  collection: string,
  filter: Record<string, unknown>,
  options: QueryOptions = {}
): Promise<VectorDocument[]> {
  const client = getQdrantClient();
  const limit = options.limit ?? 100;

  const scrollResult = await client.scroll(collection, {
    filter,
    limit,
    with_payload: true,
    with_vector: false,
  });

  return scrollResult.points.map((point) => ({
    id: point.id.toString(),
    payload: (point.payload as Record<string, unknown>) || {},
  }));
}

/**
 * Get a document by ID
 *
 * @param collection - Collection name
 * @param id - Document ID
 * @returns Document or null if not found
 */
export async function get(collection: string, id: string): Promise<VectorDocument | null> {
  const client = getQdrantClient();

  const result = await client.retrieve(collection, {
    ids: [id],
    with_payload: true,
    with_vector: true,
  });

  if (result.length === 0) {
    return null;
  }

  const point = result[0];
  return {
    id: point.id.toString(),
    payload: (point.payload as Record<string, unknown>) || {},
    vector: (point.vector as number[]) || undefined,
  };
}

/**
 * Delete a document by ID
 *
 * @param collection - Collection name
 * @param id - Document ID
 */
export async function remove(collection: string, id: string): Promise<void> {
  const client = getQdrantClient();

  await client.delete(collection, {
    wait: true,
    points: [id],
  });

  // Brief delay for Qdrant internal segment synchronization
  // Ensures consistency for immediate read-after-delete operations
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Delete all documents from a collection (preserves collection structure)
 *
 * @param collection - Collection name
 */
export async function removeAll(collection: string): Promise<void> {
  const client = getQdrantClient();

  // Check if collection exists first
  const collections = await client.getCollections();
  const collectionExists = collections.collections.some((col) => col.name === collection);

  if (!collectionExists) {
    return; // Nothing to delete
  }

  // Delete all points (empty must array matches all)
  await client.delete(collection, {
    filter: {
      must: [],
    },
    wait: true,
  });
}

/**
 * List documents from a collection
 *
 * @param collection - Collection name
 * @param options - List options
 * @returns Array of documents
 */
export async function list(collection: string, options: ListOptions = {}): Promise<VectorDocument[]> {
  const client = getQdrantClient();
  const limit = options.limit ?? 10000;

  // Check if collection exists first
  const collections = await client.getCollections();
  const collectionExists = collections.collections.some((col) => col.name === collection);

  if (!collectionExists) {
    throw new Error(`Collection '${collection}' does not exist. No data has been stored yet.`);
  }

  const scrollResult = await client.scroll(collection, {
    limit,
    with_payload: true,
    with_vector: false,
    ...(options.filter && { filter: options.filter }),
  });

  return scrollResult.points.map((point) => ({
    id: point.id.toString(),
    payload: (point.payload as Record<string, unknown>) || {},
  }));
}

/**
 * Initialize a collection (create if not exists, verify dimensions if exists)
 *
 * @param collection - Collection name
 * @param options - Initialization options
 */
export async function initializeCollection(
  collection: string,
  options: InitializeCollectionOptions
): Promise<void> {
  const client = getQdrantClient();
  const { vectorSize, createTextIndex = true } = options;

  // Check if collection exists
  const collections = await client.getCollections();
  const collectionExists = collections.collections.some((col) => col.name === collection);

  if (collectionExists) {
    // Verify existing collection has correct vector dimensions
    const collectionInfo = await client.getCollection(collection);
    const vectorsConfig = collectionInfo.config?.params?.vectors;
    let existingVectorSize: number | undefined;
    if (typeof vectorsConfig === 'number') {
      existingVectorSize = vectorsConfig;
    } else if (vectorsConfig && typeof vectorsConfig === 'object' && 'size' in vectorsConfig) {
      existingVectorSize = (vectorsConfig as { size: number }).size;
    }

    if (existingVectorSize && existingVectorSize !== vectorSize) {
      // Dimension mismatch - recreate collection
      await client.deleteCollection(collection);
      await createCollection(collection, vectorSize, createTextIndex);
    } else if (createTextIndex) {
      // Ensure text index exists (transparent upgrade)
      await ensureTextIndex(collection);
    }
  } else {
    // Create new collection
    await createCollection(collection, vectorSize, createTextIndex);
  }
}

/**
 * Create a new collection
 */
async function createCollection(
  collection: string,
  vectorSize: number,
  createTextIndex: boolean
): Promise<void> {
  const client = getQdrantClient();

  try {
    await client.createCollection(collection, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
        on_disk: true, // Enable on-disk storage for better performance with large collections
      },
      optimizers_config: {
        default_segment_number: 2,
      },
    });

    if (createTextIndex) {
      await ensureTextIndex(collection);
    }
  } catch (error) {
    // Handle race condition where collection was created between check and create
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.toLowerCase().includes('conflict') || errorMessage.toLowerCase().includes('already exists')) {
      // Collection exists - this is fine (race condition or restart)
      if (createTextIndex) {
        await ensureTextIndex(collection);
      }
      return;
    }
    throw error;
  }
}

/**
 * Ensure text index exists on searchText field
 */
async function ensureTextIndex(collection: string): Promise<void> {
  const client = getQdrantClient();

  try {
    // Check if index already exists
    const collectionInfo = await client.getCollection(collection);
    const payloadSchema = collectionInfo.payload_schema || {};

    // Check if searchText already has a text index
    const searchTextIndex = payloadSchema['searchText'];
    if (searchTextIndex && searchTextIndex.data_type === 'text') {
      return; // Index already exists
    }

    // Create text index on searchText field
    await client.createPayloadIndex(collection, {
      field_name: 'searchText',
      field_schema: 'text',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isAlreadyExists =
      errorMessage.toLowerCase().includes('already exists') || errorMessage.toLowerCase().includes('conflict');
    if (!isAlreadyExists) {
      // Log but don't throw - text index is an optimization, not critical
      console.warn(`Failed to create text index on ${collection}: ${errorMessage}`);
    }
  }
}

/**
 * Get collection statistics
 *
 * @param collection - Collection name
 * @returns Collection statistics
 */
export async function getCollectionStats(collection: string): Promise<CollectionStats> {
  const client = getQdrantClient();
  const { url } = getQdrantConfig();

  // Check if collection exists
  const collections = await client.getCollections();
  const collectionExists = collections.collections.some((col) => col.name === collection);

  if (!collectionExists) {
    return {
      pointsCount: 0,
      vectorSize: 0,
      status: 'not_found',
      exists: false,
      url: url || 'unknown',
    };
  }

  const info = await client.getCollection(collection);

  // Handle vectors config which can be a number or an object with size property
  const vectorsConfig = info.config?.params?.vectors;
  let vectorSize = 0;
  if (typeof vectorsConfig === 'number') {
    vectorSize = vectorsConfig;
  } else if (vectorsConfig && typeof vectorsConfig === 'object' && 'size' in vectorsConfig) {
    vectorSize = (vectorsConfig as { size: number }).size || 0;
  }

  return {
    pointsCount: info.points_count || 0,
    vectorSize,
    status: info.status || 'unknown',
    exists: true,
    url: url || 'unknown',
  };
}

/**
 * Check if Qdrant is available and responsive
 *
 * @returns true if healthy, false otherwise
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = getQdrantClient();
    await client.getCollections();
    return true;
  } catch {
    return false;
  }
}

/**
 * Escape special regex characters to prevent ReDoS attacks
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Search for documents using keyword matching with scoring
 *
 * Uses Qdrant's native text index for efficient server-side filtering,
 * then scores results based on keyword matches in searchText and triggers fields.
 *
 * @param collection - Collection name
 * @param keywords - Keywords to search for
 * @param options - Search options
 * @returns Array of search results with scores
 */
export async function searchByKeywords(
  collection: string,
  keywords: string[],
  options: { limit?: number; filter?: Record<string, unknown> } = {}
): Promise<SearchResult[]> {
  if (keywords.length === 0) {
    return [];
  }

  const client = getQdrantClient();
  const limit = options.limit ?? 10;

  // Build Qdrant filter for text search
  // Use "should" (OR) to match any keyword in searchText or triggers
  const keywordConditions: Record<string, unknown>[] = [];

  for (const keyword of keywords) {
    // Text match on searchText field (uses text index)
    keywordConditions.push({
      key: 'searchText',
      match: { text: keyword },
    });

    // Match on triggers array (for patterns/policies)
    keywordConditions.push({
      key: 'triggers',
      match: { any: [keyword, keyword.toLowerCase()] },
    });
  }

  // Combine keyword conditions with any user-provided filter
  const filter: Record<string, unknown> = {
    should: keywordConditions,
  };

  // If user provided additional filters, merge them properly
  if (options.filter) {
    const userFilter = options.filter as Record<string, unknown>;
    // Merge must conditions
    if (userFilter.must) {
      filter.must = Array.isArray(userFilter.must) ? userFilter.must : [userFilter.must];
    }
    // Preserve must_not conditions
    if (userFilter.must_not) {
      filter.must_not = userFilter.must_not;
    }
    // If user filter has should conditions, wrap in must to AND with keyword should
    if (userFilter.should) {
      filter.must = [...((filter.must as unknown[]) || []), { should: userFilter.should }];
    }
  }

  // Use scroll with native Qdrant filtering
  const scrollResult = await client.scroll(collection, {
    limit: limit * 10, // Get more candidates for scoring
    with_payload: true,
    with_vector: false,
    filter,
  });

  // Score the filtered results
  const scoredPoints = scrollResult.points
    .map((point) => {
      if (!point.payload) return null;

      const searchText = ((point.payload.searchText as string) || '').toLowerCase();
      const triggers = Array.isArray(point.payload.triggers)
        ? (point.payload.triggers as string[]).map((t) => t.toLowerCase())
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
        if (triggers.some((t) => t.includes(kw) || kw.includes(t))) {
          matchCount++;
        }
      }

      if (matchCount === 0) return null;

      const baseScore = matchCount / keywords.length;
      const score = exactMatch ? Math.min(1.0, baseScore + 0.3) : baseScore;

      return { point, score };
    })
    .filter((item): item is { point: (typeof scrollResult.points)[0]; score: number } => item !== null)
    .sort((a, b) => b.score - a.score);

  const limitedResults = scoredPoints.slice(0, limit);

  return limitedResults.map(({ point, score }) => ({
    id: point.id.toString(),
    score,
    payload: (point.payload as Record<string, unknown>) || {},
  }));
}

/**
 * Check if a collection exists
 *
 * @param collection - Collection name
 * @returns true if collection exists
 */
export async function collectionExists(collection: string): Promise<boolean> {
  try {
    const client = getQdrantClient();
    const collections = await client.getCollections();
    return collections.collections.some((col) => col.name === collection);
  } catch {
    return false;
  }
}
