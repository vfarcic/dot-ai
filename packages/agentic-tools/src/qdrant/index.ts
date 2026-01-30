/**
 * Qdrant Module
 *
 * Exports shared internal functions for Qdrant vector database operations.
 * These are used by domain-specific tools (capabilities, patterns, policies, resources).
 */

// Types
export type {
  VectorDocument,
  SearchResult,
  SearchOptions,
  QueryOptions,
  ListOptions,
  StoreOptions,
  CollectionStats,
  InitializeCollectionOptions,
} from './types';

// Client
export { getQdrantClient, resetQdrantClient, isClientInitialized, getQdrantConfig } from './client';

// Operations (shared internal functions)
export {
  store,
  search,
  query,
  get,
  remove,
  removeAll,
  list,
  initializeCollection,
  getCollectionStats,
  healthCheck,
  collectionExists,
} from './operations';
