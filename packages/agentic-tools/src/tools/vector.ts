/**
 * Vector Database Tools
 *
 * Generic vector operations exposed as plugin tools.
 * These tools are collection-agnostic - domain logic stays in MCP server.
 *
 * PRD #359: Qdrant Operations Plugin Migration
 */

import {
  QdrantTool,
  requireQdrantParam,
  requireEmbeddingParam,
  optionalQdrantParam,
  qdrantSuccessResult,
  qdrantErrorResult,
  withQdrantValidation,
} from './qdrant-base';
import {
  search,
  store,
  query,
  get,
  remove,
  removeAll,
  list,
  initializeCollection,
  getCollectionStats,
  searchByKeywords,
  listCollections,
  deleteCollection as deleteCollectionOp,
} from '../qdrant/operations';

/**
 * vector_search - Semantic search using pre-computed embedding
 */
export const vectorSearch: QdrantTool = {
  definition: {
    name: 'vector_search',
    type: 'agentic',
    description:
      'Search for similar documents using vector similarity. Requires a pre-computed embedding vector.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection name to search in',
        },
        embedding: {
          type: 'array',
          items: { type: 'number' },
          description: 'Pre-computed embedding vector for similarity search',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
        filter: {
          type: 'object',
          description: 'Optional Qdrant filter to narrow search scope',
        },
        scoreThreshold: {
          type: 'number',
          description: 'Minimum similarity score threshold (default: 0.5)',
        },
      },
      required: ['collection', 'embedding'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'vector_search'
    );
    const embedding = requireEmbeddingParam(args, 'embedding', 'vector_search');
    const limit = optionalQdrantParam<number>(args, 'limit', 10);
    const filter = optionalQdrantParam<Record<string, unknown> | undefined>(
      args,
      'filter',
      undefined
    );
    const scoreThreshold = optionalQdrantParam<number>(
      args,
      'scoreThreshold',
      0.5
    );

    try {
      const results = await search(collection, embedding, {
        limit,
        filter,
        scoreThreshold,
      });
      return qdrantSuccessResult(
        results,
        `Found ${results.length} similar documents in '${collection}'`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Search failed in '${collection}': ${message}`
      );
    }
  }),
};

/**
 * vector_store - Store a document with its embedding
 */
export const vectorStore: QdrantTool = {
  definition: {
    name: 'vector_store',
    type: 'agentic',
    description:
      'Store a document with its vector embedding. Upserts if document with same ID exists.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection name to store in',
        },
        id: { type: 'string', description: 'Unique document identifier' },
        embedding: {
          type: 'array',
          items: { type: 'number' },
          description: 'Pre-computed embedding vector for the document',
        },
        payload: {
          type: 'object',
          description: 'Document metadata/payload to store',
        },
      },
      required: ['collection', 'id', 'embedding', 'payload'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'vector_store'
    );
    const id = requireQdrantParam<string>(args, 'id', 'vector_store');
    const embedding = requireEmbeddingParam(args, 'embedding', 'vector_store');
    const payload = requireQdrantParam<Record<string, unknown>>(
      args,
      'payload',
      'vector_store'
    );

    try {
      await store(collection, id, embedding, payload);
      return qdrantSuccessResult(
        { id },
        `Stored document '${id}' in '${collection}'`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Failed to store document '${id}' in '${collection}': ${message}`
      );
    }
  }),
};

/**
 * vector_query - Filter-based query (no embedding needed)
 */
export const vectorQuery: QdrantTool = {
  definition: {
    name: 'vector_query',
    type: 'agentic',
    description:
      'Query documents using Qdrant filter conditions. Does not require an embedding vector.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', description: 'Collection name to query' },
        filter: {
          type: 'object',
          description: 'Qdrant filter object to match documents',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 100)',
        },
      },
      required: ['collection', 'filter'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'vector_query'
    );
    const filter = requireQdrantParam<Record<string, unknown>>(
      args,
      'filter',
      'vector_query'
    );
    const limit = optionalQdrantParam<number>(args, 'limit', 100);

    try {
      const results = await query(collection, filter, { limit });
      return qdrantSuccessResult(
        results,
        `Found ${results.length} documents matching filter in '${collection}'`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Query failed in '${collection}': ${message}`
      );
    }
  }),
};

/**
 * vector_get - Get a document by ID
 */
export const vectorGet: QdrantTool = {
  definition: {
    name: 'vector_get',
    type: 'agentic',
    description:
      'Retrieve a single document by its ID, including its vector and payload.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', description: 'Collection name' },
        id: { type: 'string', description: 'Document ID to retrieve' },
      },
      required: ['collection', 'id'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'vector_get'
    );
    const id = requireQdrantParam<string>(args, 'id', 'vector_get');

    try {
      const document = await get(collection, id);
      if (document === null) {
        return qdrantSuccessResult(
          null,
          `Document '${id}' not found in '${collection}'`
        );
      }
      return qdrantSuccessResult(
        document,
        `Retrieved document '${id}' from '${collection}'`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Failed to get document '${id}' from '${collection}': ${message}`
      );
    }
  }),
};

/**
 * vector_delete - Delete a document by ID
 */
export const vectorDelete: QdrantTool = {
  definition: {
    name: 'vector_delete',
    type: 'agentic',
    description: 'Delete a document by its ID from a collection.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', description: 'Collection name' },
        id: { type: 'string', description: 'Document ID to delete' },
      },
      required: ['collection', 'id'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'vector_delete'
    );
    const id = requireQdrantParam<string>(args, 'id', 'vector_delete');

    try {
      await remove(collection, id);
      return qdrantSuccessResult(
        { id },
        `Deleted document '${id}' from '${collection}'`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Failed to delete document '${id}' from '${collection}': ${message}`
      );
    }
  }),
};

/**
 * vector_list - List documents in a collection
 */
export const vectorList: QdrantTool = {
  definition: {
    name: 'vector_list',
    type: 'agentic',
    description: 'List documents from a collection with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', description: 'Collection name' },
        limit: {
          type: 'number',
          description: 'Maximum number of documents to return (default: 10000)',
        },
        filter: {
          type: 'object',
          description: 'Optional Qdrant filter to narrow results',
        },
      },
      required: ['collection'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'vector_list'
    );
    const limit = optionalQdrantParam<number>(args, 'limit', 10000);
    const filter = optionalQdrantParam<Record<string, unknown> | undefined>(
      args,
      'filter',
      undefined
    );

    try {
      const documents = await list(collection, { limit, filter });
      return qdrantSuccessResult(
        documents,
        `Listed ${documents.length} documents from '${collection}'`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Failed to list documents from '${collection}': ${message}`
      );
    }
  }),
};

/**
 * collection_initialize - Initialize or verify a collection
 */
export const collectionInitialize: QdrantTool = {
  definition: {
    name: 'collection_initialize',
    type: 'agentic',
    description:
      'Initialize a collection for vector storage. Creates if not exists, verifies dimensions if exists. Recreates if dimension mismatch.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection name to initialize',
        },
        vectorSize: {
          type: 'number',
          description: 'Vector dimension size (e.g., 1536 for OpenAI ada-002)',
        },
        createTextIndex: {
          type: 'boolean',
          description:
            'Whether to create a text index on searchText field (default: true)',
        },
      },
      required: ['collection', 'vectorSize'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'collection_initialize'
    );
    const vectorSize = requireQdrantParam<number>(
      args,
      'vectorSize',
      'collection_initialize'
    );
    const createTextIndex = optionalQdrantParam<boolean>(
      args,
      'createTextIndex',
      true
    );

    try {
      await initializeCollection(collection, { vectorSize, createTextIndex });
      return qdrantSuccessResult(
        { collection, vectorSize, createTextIndex },
        `Initialized collection '${collection}' with vector size ${vectorSize}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Failed to initialize collection '${collection}': ${message}`
      );
    }
  }),
};

/**
 * collection_stats - Get collection statistics
 */
export const collectionStats: QdrantTool = {
  definition: {
    name: 'collection_stats',
    type: 'agentic',
    description:
      'Get statistics for a collection including document count, vector size, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection name to get stats for',
        },
      },
      required: ['collection'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'collection_stats'
    );

    try {
      const stats = await getCollectionStats(collection);
      if (!stats.exists) {
        return qdrantSuccessResult(
          stats,
          `Collection '${collection}' does not exist`
        );
      }
      return qdrantSuccessResult(
        stats,
        `Collection '${collection}': ${stats.pointsCount} documents, ${stats.vectorSize}D vectors, status: ${stats.status}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Failed to get stats for collection '${collection}': ${message}`
      );
    }
  }),
};

/**
 * vector_delete_all - Delete all documents from a collection
 */
export const vectorDeleteAll: QdrantTool = {
  definition: {
    name: 'vector_delete_all',
    type: 'agentic',
    description:
      'Delete all documents from a collection. Preserves the collection structure (schema, indexes) but removes all points.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: { type: 'string', description: 'Collection name to clear' },
      },
      required: ['collection'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'vector_delete_all'
    );

    try {
      await removeAll(collection);
      return qdrantSuccessResult(
        { collection },
        `Deleted all documents from '${collection}'`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Failed to delete all documents from '${collection}': ${message}`
      );
    }
  }),
};

/**
 * vector_search_keywords - Keyword-based search with scoring
 */
export const vectorSearchKeywords: QdrantTool = {
  definition: {
    name: 'vector_search_keywords',
    type: 'agentic',
    description:
      'Search for documents using keyword matching. Scores results based on keyword matches in searchText and triggers fields. Does not require an embedding vector.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection name to search in',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords to search for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
        filter: {
          type: 'object',
          description: 'Optional Qdrant filter for additional filtering',
        },
      },
      required: ['collection', 'keywords'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'vector_search_keywords'
    );
    const keywords = requireQdrantParam<string[]>(
      args,
      'keywords',
      'vector_search_keywords'
    );
    const limit = optionalQdrantParam<number>(args, 'limit', 10);
    const filter = optionalQdrantParam<Record<string, unknown> | undefined>(
      args,
      'filter',
      undefined
    );

    if (!Array.isArray(keywords)) {
      return qdrantErrorResult(
        'keywords must be an array',
        'vector_search_keywords requires keywords as an array'
      );
    }

    try {
      const results = await searchByKeywords(collection, keywords, {
        limit,
        filter,
      });
      return qdrantSuccessResult(
        results,
        `Found ${results.length} documents matching keywords in '${collection}'`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Keyword search failed in '${collection}': ${message}`
      );
    }
  }),
};

/**
 * collection_list - List all collection names
 */
export const collectionList: QdrantTool = {
  definition: {
    name: 'collection_list',
    type: 'agentic',
    description: 'List all collection names in the vector database.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  handler: withQdrantValidation(async () => {
    try {
      const names = await listCollections();
      return qdrantSuccessResult(names, `Found ${names.length} collections`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Failed to list collections: ${message}`
      );
    }
  }),
};

/**
 * collection_delete - Delete a collection entirely
 */
export const collectionDelete: QdrantTool = {
  definition: {
    name: 'collection_delete',
    type: 'agentic',
    description:
      'Delete a collection entirely (not just its points). Removes the collection and all its data.',
    inputSchema: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection name to delete',
        },
      },
      required: ['collection'],
    },
  },
  handler: withQdrantValidation(async args => {
    const collection = requireQdrantParam<string>(
      args,
      'collection',
      'collection_delete'
    );

    try {
      await deleteCollectionOp(collection);
      return qdrantSuccessResult(
        { collection },
        `Deleted collection '${collection}'`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return qdrantErrorResult(
        message,
        `Failed to delete collection '${collection}': ${message}`
      );
    }
  }),
};

/**
 * All vector tools for registration
 */
export const VECTOR_TOOLS: QdrantTool[] = [
  vectorSearch,
  vectorSearchKeywords,
  vectorStore,
  vectorQuery,
  vectorGet,
  vectorDelete,
  vectorDeleteAll,
  vectorList,
  collectionInitialize,
  collectionStats,
  collectionList,
  collectionDelete,
];
