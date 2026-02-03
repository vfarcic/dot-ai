/**
 * Knowledge Base Type Definitions
 *
 * Types for the knowledge base system including chunks, ingestion requests/responses,
 * and search results.
 *
 * PRD #356: Knowledge Base System
 */

/**
 * Knowledge Chunk - stored in Qdrant "knowledge-base" collection
 *
 * Each chunk represents a portion of a source document with its embedding.
 * Chunks are identified by a deterministic UUID v5 based on URI + chunk index.
 */
export interface KnowledgeChunk {
  /** Deterministic UUID v5 from uri#chunkIndex */
  id: string;

  /** Chunk text content */
  content: string;

  /** Full URL identifying the source document (e.g., 'https://github.com/org/repo/blob/main/docs/guide.md') */
  uri: string;

  /** Optional source-specific metadata */
  metadata: Record<string, unknown>;

  /** SHA-256 hash of content for change detection */
  checksum: string;

  /** ISO 8601 timestamp when chunk was ingested */
  ingestedAt: string;

  /** Zero-based index of this chunk within the source document */
  chunkIndex: number;

  /** Total number of chunks from the source document */
  totalChunks: number;

  /** IDs of policies extracted from this chunk (populated by PRD #357) */
  extractedPolicyIds?: string[];
}

/**
 * Result from the plugin's knowledge_chunk tool
 */
export interface PluginChunkResult {
  id: string;
  content: string;
  checksum: string;
  chunkIndex: number;
  totalChunks: number;
}

/**
 * Response from the plugin's knowledge_chunk tool
 */
export interface PluginChunkResponse {
  success: boolean;
  data?: {
    chunks: PluginChunkResult[];
    totalChunks: number;
    uri: string;
  };
  error?: string;
  message: string;
}

/**
 * Ingest operation response
 */
export interface IngestResponse {
  success: boolean;
  operation: 'ingest';
  chunksCreated: number;
  chunkIds: string[];
  uri: string;
  message: string;
}

/**
 * Search result for a single chunk
 */
export interface KnowledgeSearchResultItem {
  id: string;
  content: string;
  score: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
  uri: string;
  metadata: Record<string, unknown>;
  chunkIndex: number;
  totalChunks: number;
  /** Policies extracted from this chunk (populated by PRD #357) */
  extractedPolicies?: Array<{
    id: string;
    description: string;
  }>;
}

/**
 * Search operation response
 */
export interface KnowledgeSearchResponse {
  success: boolean;
  operation: 'search';
  chunks: KnowledgeSearchResultItem[];
  totalMatches: number;
  query: string;
  message: string;
}

/**
 * DeleteByUri operation response
 */
export interface DeleteByUriResponse {
  success: boolean;
  operation: 'deleteByUri';
  uri: string;
  chunksDeleted: number;
  message: string;
}

/**
 * GetChunk operation response
 */
export interface GetChunkResponse {
  success: boolean;
  operation: 'getChunk';
  chunk: KnowledgeChunk | null;
  message: string;
}

/**
 * GetByUri operation response
 */
export interface GetByUriResponse {
  success: boolean;
  operation: 'getByUri';
  uri: string;
  chunks: KnowledgeChunk[];
  totalChunks: number;
  message: string;
}

/**
 * Union type for all manageKnowledge operation responses
 */
export type ManageKnowledgeResponse =
  | IngestResponse
  | KnowledgeSearchResponse
  | DeleteByUriResponse
  | GetChunkResponse
  | GetByUriResponse;
