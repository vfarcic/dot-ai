/**
 * Unit tests for Qdrant operations
 *
 * Tests shared internal functions with mocked Qdrant client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as clientModule from '../../src/qdrant/client';
import * as operations from '../../src/qdrant/operations';

// Mock the client module
vi.mock('../../src/qdrant/client', () => ({
  getQdrantClient: vi.fn(),
  resetQdrantClient: vi.fn(),
  isClientInitialized: vi.fn(),
  getQdrantConfig: vi.fn(),
}));

// Create a mock Qdrant client
function createMockClient() {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    scroll: vi.fn().mockResolvedValue({ points: [] }),
    retrieve: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    getCollections: vi.fn().mockResolvedValue({ collections: [] }),
    getCollection: vi.fn().mockResolvedValue({
      points_count: 0,
      config: { params: { vectors: { size: 1536 } } },
      status: 'green',
      payload_schema: {},
    }),
    createCollection: vi.fn().mockResolvedValue(undefined),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
    createPayloadIndex: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Qdrant Operations', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  const mockGetQdrantClient = vi.mocked(clientModule.getQdrantClient);

  beforeEach(() => {
    mockClient = createMockClient();
    mockGetQdrantClient.mockReturnValue(mockClient as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('store', () => {
    it('should store document with embedding and payload', async () => {
      const collection = 'test-collection';
      const id = 'doc-1';
      const embedding = [0.1, 0.2, 0.3];
      const payload = { name: 'test', description: 'A test document' };

      await operations.store(collection, id, embedding, payload);

      expect(mockClient.upsert).toHaveBeenCalledWith(collection, {
        wait: true,
        points: [
          {
            id,
            vector: embedding,
            payload,
          },
        ],
      });
    });

    it('should respect wait option', async () => {
      await operations.store('collection', 'id', [0.1], { key: 'value' }, { wait: false });

      expect(mockClient.upsert).toHaveBeenCalledWith(
        'collection',
        expect.objectContaining({ wait: false })
      );
    });

    it('should throw error if embedding is empty', async () => {
      await expect(operations.store('collection', 'id', [], { key: 'value' })).rejects.toThrow(
        'Vector embedding is required'
      );
    });
  });

  describe('search', () => {
    it('should search with embedding and return results', async () => {
      const mockResults = [
        { id: 'doc-1', score: 0.95, payload: { name: 'match1' } },
        { id: 'doc-2', score: 0.85, payload: { name: 'match2' } },
      ];
      mockClient.search.mockResolvedValue(mockResults);

      const results = await operations.search('collection', [0.1, 0.2, 0.3]);

      expect(mockClient.search).toHaveBeenCalledWith('collection', {
        vector: [0.1, 0.2, 0.3],
        limit: 10,
        score_threshold: 0.5,
        with_payload: true,
      });
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ id: 'doc-1', score: 0.95, payload: { name: 'match1' } });
    });

    it('should apply custom options', async () => {
      mockClient.search.mockResolvedValue([]);

      await operations.search('collection', [0.1], {
        limit: 5,
        scoreThreshold: 0.7,
        filter: { must: [{ key: 'type', match: { value: 'pattern' } }] },
      });

      expect(mockClient.search).toHaveBeenCalledWith('collection', {
        vector: [0.1],
        limit: 5,
        score_threshold: 0.7,
        with_payload: true,
        filter: { must: [{ key: 'type', match: { value: 'pattern' } }] },
      });
    });
  });

  describe('query', () => {
    it('should query with filter and return documents', async () => {
      const mockPoints = [
        { id: 'doc-1', payload: { name: 'item1' } },
        { id: 'doc-2', payload: { name: 'item2' } },
      ];
      mockClient.scroll.mockResolvedValue({ points: mockPoints });

      const filter = { must: [{ key: 'type', match: { value: 'capability' } }] };
      const results = await operations.query('collection', filter);

      expect(mockClient.scroll).toHaveBeenCalledWith('collection', {
        filter,
        limit: 100,
        with_payload: true,
        with_vector: false,
      });
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ id: 'doc-1', payload: { name: 'item1' } });
    });

    it('should apply custom limit', async () => {
      mockClient.scroll.mockResolvedValue({ points: [] });

      await operations.query('collection', {}, { limit: 50 });

      expect(mockClient.scroll).toHaveBeenCalledWith(
        'collection',
        expect.objectContaining({ limit: 50 })
      );
    });
  });

  describe('get', () => {
    it('should retrieve document by ID', async () => {
      const mockPoint = {
        id: 'doc-1',
        payload: { name: 'test' },
        vector: [0.1, 0.2, 0.3],
      };
      mockClient.retrieve.mockResolvedValue([mockPoint]);

      const result = await operations.get('collection', 'doc-1');

      expect(mockClient.retrieve).toHaveBeenCalledWith('collection', {
        ids: ['doc-1'],
        with_payload: true,
        with_vector: true,
      });
      expect(result).toEqual({
        id: 'doc-1',
        payload: { name: 'test' },
        vector: [0.1, 0.2, 0.3],
      });
    });

    it('should return null if document not found', async () => {
      mockClient.retrieve.mockResolvedValue([]);

      const result = await operations.get('collection', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('should delete document by ID', async () => {
      await operations.remove('collection', 'doc-1');

      expect(mockClient.delete).toHaveBeenCalledWith('collection', {
        wait: true,
        points: ['doc-1'],
      });
    });
  });

  describe('removeAll', () => {
    it('should delete all documents when collection exists', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'collection' }],
      });

      await operations.removeAll('collection');

      expect(mockClient.delete).toHaveBeenCalledWith('collection', {
        filter: { must: [] },
        wait: true,
      });
    });

    it('should do nothing if collection does not exist', async () => {
      mockClient.getCollections.mockResolvedValue({ collections: [] });

      await operations.removeAll('nonexistent');

      expect(mockClient.delete).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should list all documents in collection', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'collection' }],
      });
      mockClient.scroll.mockResolvedValue({
        points: [
          { id: 'doc-1', payload: { name: 'item1' } },
          { id: 'doc-2', payload: { name: 'item2' } },
        ],
      });

      const results = await operations.list('collection');

      expect(mockClient.scroll).toHaveBeenCalledWith('collection', {
        limit: 10000,
        with_payload: true,
        with_vector: false,
      });
      expect(results).toHaveLength(2);
    });

    it('should apply custom limit', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'collection' }],
      });
      mockClient.scroll.mockResolvedValue({ points: [] });

      await operations.list('collection', { limit: 50 });

      expect(mockClient.scroll).toHaveBeenCalledWith(
        'collection',
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should apply filter when provided', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'collection' }],
      });
      mockClient.scroll.mockResolvedValue({ points: [] });

      const filter = { must: [{ key: 'type', match: { value: 'pattern' } }] };
      await operations.list('collection', { filter });

      expect(mockClient.scroll).toHaveBeenCalledWith(
        'collection',
        expect.objectContaining({ filter })
      );
    });

    it('should throw error if collection does not exist', async () => {
      mockClient.getCollections.mockResolvedValue({ collections: [] });

      await expect(operations.list('nonexistent')).rejects.toThrow(
        "Collection 'nonexistent' does not exist"
      );
    });
  });

  describe('initializeCollection', () => {
    it('should create new collection if not exists', async () => {
      mockClient.getCollections.mockResolvedValue({ collections: [] });

      await operations.initializeCollection('new-collection', { vectorSize: 1536 });

      expect(mockClient.createCollection).toHaveBeenCalledWith('new-collection', {
        vectors: {
          size: 1536,
          distance: 'Cosine',
          on_disk: true,
        },
        optimizers_config: {
          default_segment_number: 2,
        },
      });
    });

    it('should skip creation if collection exists with same dimensions', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'existing' }],
      });
      mockClient.getCollection.mockResolvedValue({
        config: { params: { vectors: { size: 1536 } } },
        payload_schema: {},
      });

      await operations.initializeCollection('existing', { vectorSize: 1536 });

      expect(mockClient.createCollection).not.toHaveBeenCalled();
    });

    it('should recreate collection if dimensions mismatch', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'existing' }],
      });
      mockClient.getCollection.mockResolvedValue({
        config: { params: { vectors: { size: 384 } } },
        payload_schema: {},
      });

      await operations.initializeCollection('existing', { vectorSize: 1536 });

      expect(mockClient.deleteCollection).toHaveBeenCalledWith('existing');
      expect(mockClient.createCollection).toHaveBeenCalled();
    });

    it('should create text index when requested', async () => {
      mockClient.getCollections.mockResolvedValue({ collections: [] });

      await operations.initializeCollection('collection', {
        vectorSize: 1536,
        createTextIndex: true,
      });

      expect(mockClient.createPayloadIndex).toHaveBeenCalledWith('collection', {
        field_name: 'searchText',
        field_schema: 'text',
      });
    });

    it('should skip text index when not requested', async () => {
      mockClient.getCollections.mockResolvedValue({ collections: [] });

      await operations.initializeCollection('collection', {
        vectorSize: 1536,
        createTextIndex: false,
      });

      expect(mockClient.createPayloadIndex).not.toHaveBeenCalled();
    });
  });

  describe('getCollectionStats', () => {
    it('should return stats for existing collection', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'collection' }],
      });
      mockClient.getCollection.mockResolvedValue({
        points_count: 100,
        config: { params: { vectors: { size: 1536 } } },
        status: 'green',
      });

      const stats = await operations.getCollectionStats('collection');

      expect(stats).toEqual({
        pointsCount: 100,
        vectorSize: 1536,
        status: 'green',
        exists: true,
      });
    });

    it('should return not_found status for non-existent collection', async () => {
      mockClient.getCollections.mockResolvedValue({ collections: [] });

      const stats = await operations.getCollectionStats('nonexistent');

      expect(stats).toEqual({
        pointsCount: 0,
        vectorSize: 0,
        status: 'not_found',
        exists: false,
      });
    });
  });

  describe('healthCheck', () => {
    it('should return true when Qdrant is healthy', async () => {
      mockClient.getCollections.mockResolvedValue({ collections: [] });

      const result = await operations.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when Qdrant is unavailable', async () => {
      mockClient.getCollections.mockRejectedValue(new Error('Connection refused'));

      const result = await operations.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('collectionExists', () => {
    it('should return true if collection exists', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'collection' }],
      });

      const result = await operations.collectionExists('collection');

      expect(result).toBe(true);
    });

    it('should return false if collection does not exist', async () => {
      mockClient.getCollections.mockResolvedValue({ collections: [] });

      const result = await operations.collectionExists('nonexistent');

      expect(result).toBe(false);
    });
  });
});

describe('Qdrant Client (integration)', () => {
  // Note: Client initialization tests require unmocked module
  // These are tested via integration tests with a real Qdrant instance

  it('should export required functions', () => {
    // Verify the mock returns expected functions
    const { getQdrantClient, resetQdrantClient, isClientInitialized, getQdrantConfig } =
      clientModule;

    expect(typeof getQdrantClient).toBe('function');
    expect(typeof resetQdrantClient).toBe('function');
    expect(typeof isClientInitialized).toBe('function');
    expect(typeof getQdrantConfig).toBe('function');
  });
});
