/**
 * Qdrant-specific types for the agentic-tools plugin
 *
 * Defines types for vector storage operations.
 */

/**
 * Options for storing a document
 */
export interface StoreOptions {
  /** Wait for write to complete (default: true) */
  wait?: boolean;
}

/**
 * Options for vector similarity search
 */
export interface SearchOptions {
  /** Maximum results to return (default: 10) */
  limit?: number;
  /** Minimum score threshold (default: 0.5) */
  scoreThreshold?: number;
  /** Qdrant filter object for exact filtering */
  filter?: Record<string, unknown>;
}

/**
 * Options for filter-based queries
 */
export interface QueryOptions {
  /** Maximum results to return (default: 100) */
  limit?: number;
}

/**
 * Options for listing documents
 */
export interface ListOptions {
  /** Maximum results to return (default: 10000) */
  limit?: number;
  /** Qdrant filter object for filtering */
  filter?: Record<string, unknown>;
}

/**
 * A document stored in the vector database
 */
export interface VectorDocument {
  /** Unique identifier */
  id: string;
  /** Document payload/metadata */
  payload: Record<string, unknown>;
  /** Optional vector embedding */
  vector?: number[];
}

/**
 * A search result from vector similarity search
 */
export interface SearchResult {
  /** Document identifier */
  id: string;
  /** Similarity score (0-1) */
  score: number;
  /** Document payload/metadata */
  payload: Record<string, unknown>;
}

/**
 * Collection statistics
 */
export interface CollectionStats {
  /** Number of points in the collection */
  pointsCount: number;
  /** Vector dimensions */
  vectorSize: number;
  /** Collection status */
  status: string;
  /** Whether the collection exists */
  exists: boolean;
}

/**
 * Options for initializing a collection
 */
export interface InitializeCollectionOptions {
  /** Vector dimensions */
  vectorSize: number;
  /** Create text index on searchText field (default: true) */
  createTextIndex?: boolean;
}
