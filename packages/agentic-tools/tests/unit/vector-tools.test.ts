/**
 * Unit tests for vector tools
 *
 * Tests tool definitions, validation, and handler behavior.
 * Note: These tests mock Qdrant operations to avoid cluster dependencies.
 *
 * PRD #359: Qdrant Operations Plugin Migration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TOOLS, TOOL_HANDLERS } from '../../src/tools';
import * as operations from '../../src/qdrant/operations';

// Mock Qdrant operations to avoid actual Qdrant calls
vi.mock('../../src/qdrant/operations', async () => {
  return {
    search: vi.fn(),
    store: vi.fn(),
    query: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
    initializeCollection: vi.fn(),
    getCollectionStats: vi.fn(),
  };
});

describe('Vector Tool Definitions', () => {
  it('should have all required vector tools', () => {
    const toolNames = TOOLS.map((t) => t.name);

    expect(toolNames).toContain('vector_search');
    expect(toolNames).toContain('vector_store');
    expect(toolNames).toContain('vector_query');
    expect(toolNames).toContain('vector_get');
    expect(toolNames).toContain('vector_delete');
    expect(toolNames).toContain('vector_list');
    expect(toolNames).toContain('collection_initialize');
    expect(toolNames).toContain('collection_stats');
  });

  it('should have matching handlers for all vector tools', () => {
    const vectorToolNames = [
      'vector_search',
      'vector_store',
      'vector_query',
      'vector_get',
      'vector_delete',
      'vector_list',
      'collection_initialize',
      'collection_stats',
    ];

    for (const toolName of vectorToolNames) {
      expect(TOOL_HANDLERS[toolName]).toBeDefined();
      expect(typeof TOOL_HANDLERS[toolName]).toBe('function');
    }
  });

  describe('Tool definition structure', () => {
    const vectorToolNames = [
      'vector_search',
      'vector_store',
      'vector_query',
      'vector_get',
      'vector_delete',
      'vector_list',
      'collection_initialize',
      'collection_stats',
    ];

    for (const toolName of vectorToolNames) {
      describe(toolName, () => {
        it('should have correct type', () => {
          const tool = TOOLS.find((t) => t.name === toolName);
          expect(tool?.type).toBe('agentic');
        });

        it('should have a description', () => {
          const tool = TOOLS.find((t) => t.name === toolName);
          expect(tool?.description).toBeTruthy();
          expect(typeof tool?.description).toBe('string');
        });

        it('should have valid inputSchema', () => {
          const tool = TOOLS.find((t) => t.name === toolName);
          expect(tool?.inputSchema).toBeDefined();
          expect(tool?.inputSchema.type).toBe('object');
          expect(tool?.inputSchema.properties).toBeDefined();
        });

        it('should have required array', () => {
          const tool = TOOLS.find((t) => t.name === toolName);
          expect(Array.isArray(tool?.inputSchema.required)).toBe(true);
        });
      });
    }
  });
});

describe('Vector Tool Handlers', () => {
  const mockSearch = vi.mocked(operations.search);
  const mockStore = vi.mocked(operations.store);
  const mockQuery = vi.mocked(operations.query);
  const mockGet = vi.mocked(operations.get);
  const mockRemove = vi.mocked(operations.remove);
  const mockList = vi.mocked(operations.list);
  const mockInitializeCollection = vi.mocked(operations.initializeCollection);
  const mockGetCollectionStats = vi.mocked(operations.getCollectionStats);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('vector_search', () => {
    it('should require collection parameter', async () => {
      const handler = TOOL_HANDLERS['vector_search'];
      const result = await handler({ embedding: [0.1, 0.2, 0.3] });

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('collection'),
      });
    });

    it('should require embedding parameter', async () => {
      const handler = TOOL_HANDLERS['vector_search'];
      const result = await handler({ collection: 'test' });

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('embedding'),
      });
    });

    it('should call search with correct parameters', async () => {
      mockSearch.mockResolvedValue([
        { id: 'doc-1', score: 0.95, payload: { text: 'test' } },
      ]);

      const handler = TOOL_HANDLERS['vector_search'];
      const result = await handler({
        collection: 'capabilities',
        embedding: [0.1, 0.2, 0.3],
        limit: 5,
        scoreThreshold: 0.7,
      });

      expect(mockSearch).toHaveBeenCalledWith('capabilities', [0.1, 0.2, 0.3], {
        limit: 5,
        filter: undefined,
        scoreThreshold: 0.7,
      });
      expect(result).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'doc-1', score: 0.95 }),
        ]),
      });
    });

    it('should use default values when optional params not provided', async () => {
      mockSearch.mockResolvedValue([]);

      const handler = TOOL_HANDLERS['vector_search'];
      await handler({
        collection: 'capabilities',
        embedding: [0.1, 0.2, 0.3],
      });

      expect(mockSearch).toHaveBeenCalledWith('capabilities', [0.1, 0.2, 0.3], {
        limit: 10,
        filter: undefined,
        scoreThreshold: 0.5,
      });
    });

    it('should handle errors', async () => {
      mockSearch.mockRejectedValue(new Error('Connection failed'));

      const handler = TOOL_HANDLERS['vector_search'];
      const result = await handler({
        collection: 'capabilities',
        embedding: [0.1, 0.2, 0.3],
      });

      expect(result).toMatchObject({
        success: false,
        error: 'Connection failed',
      });
    });
  });

  describe('vector_store', () => {
    it('should require all parameters', async () => {
      const handler = TOOL_HANDLERS['vector_store'];

      const result1 = await handler({});
      expect(result1).toMatchObject({ success: false, error: expect.stringContaining('collection') });

      const result2 = await handler({ collection: 'test' });
      expect(result2).toMatchObject({ success: false, error: expect.stringContaining('id') });

      const result3 = await handler({ collection: 'test', id: 'doc-1' });
      expect(result3).toMatchObject({ success: false, error: expect.stringContaining('embedding') });

      const result4 = await handler({ collection: 'test', id: 'doc-1', embedding: [0.1] });
      expect(result4).toMatchObject({ success: false, error: expect.stringContaining('payload') });
    });

    it('should call store with correct parameters', async () => {
      mockStore.mockResolvedValue(undefined);

      const handler = TOOL_HANDLERS['vector_store'];
      const result = await handler({
        collection: 'capabilities',
        id: 'doc-1',
        embedding: [0.1, 0.2, 0.3],
        payload: { text: 'test document' },
      });

      expect(mockStore).toHaveBeenCalledWith('capabilities', 'doc-1', [0.1, 0.2, 0.3], {
        text: 'test document',
      });
      expect(result).toMatchObject({
        success: true,
        data: { id: 'doc-1' },
      });
    });

    it('should handle errors', async () => {
      mockStore.mockRejectedValue(new Error('Storage failed'));

      const handler = TOOL_HANDLERS['vector_store'];
      const result = await handler({
        collection: 'capabilities',
        id: 'doc-1',
        embedding: [0.1, 0.2, 0.3],
        payload: { text: 'test' },
      });

      expect(result).toMatchObject({
        success: false,
        error: 'Storage failed',
      });
    });
  });

  describe('vector_query', () => {
    it('should require collection and filter parameters', async () => {
      const handler = TOOL_HANDLERS['vector_query'];

      const result1 = await handler({});
      expect(result1).toMatchObject({ success: false, error: expect.stringContaining('collection') });

      const result2 = await handler({ collection: 'test' });
      expect(result2).toMatchObject({ success: false, error: expect.stringContaining('filter') });
    });

    it('should call query with correct parameters', async () => {
      mockQuery.mockResolvedValue([{ id: 'doc-1', payload: { type: 'capability' } }]);

      const handler = TOOL_HANDLERS['vector_query'];
      const result = await handler({
        collection: 'capabilities',
        filter: { must: [{ key: 'type', match: { value: 'capability' } }] },
        limit: 50,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        'capabilities',
        { must: [{ key: 'type', match: { value: 'capability' } }] },
        { limit: 50 }
      );
      expect(result).toMatchObject({
        success: true,
        data: expect.arrayContaining([expect.objectContaining({ id: 'doc-1' })]),
      });
    });

    it('should use default limit', async () => {
      mockQuery.mockResolvedValue([]);

      const handler = TOOL_HANDLERS['vector_query'];
      await handler({
        collection: 'capabilities',
        filter: { must: [] },
      });

      expect(mockQuery).toHaveBeenCalledWith('capabilities', { must: [] }, { limit: 100 });
    });
  });

  describe('vector_get', () => {
    it('should require collection and id parameters', async () => {
      const handler = TOOL_HANDLERS['vector_get'];

      const result1 = await handler({});
      expect(result1).toMatchObject({ success: false, error: expect.stringContaining('collection') });

      const result2 = await handler({ collection: 'test' });
      expect(result2).toMatchObject({ success: false, error: expect.stringContaining('id') });
    });

    it('should call get with correct parameters', async () => {
      mockGet.mockResolvedValue({
        id: 'doc-1',
        payload: { text: 'test' },
        vector: [0.1, 0.2, 0.3],
      });

      const handler = TOOL_HANDLERS['vector_get'];
      const result = await handler({
        collection: 'capabilities',
        id: 'doc-1',
      });

      expect(mockGet).toHaveBeenCalledWith('capabilities', 'doc-1');
      expect(result).toMatchObject({
        success: true,
        data: expect.objectContaining({ id: 'doc-1' }),
      });
    });

    it('should handle document not found', async () => {
      mockGet.mockResolvedValue(null);

      const handler = TOOL_HANDLERS['vector_get'];
      const result = await handler({
        collection: 'capabilities',
        id: 'nonexistent',
      });

      expect(result).toMatchObject({
        success: true,
        data: null,
        message: expect.stringContaining('not found'),
      });
    });
  });

  describe('vector_delete', () => {
    it('should require collection and id parameters', async () => {
      const handler = TOOL_HANDLERS['vector_delete'];

      const result1 = await handler({});
      expect(result1).toMatchObject({ success: false, error: expect.stringContaining('collection') });

      const result2 = await handler({ collection: 'test' });
      expect(result2).toMatchObject({ success: false, error: expect.stringContaining('id') });
    });

    it('should call remove with correct parameters', async () => {
      mockRemove.mockResolvedValue(undefined);

      const handler = TOOL_HANDLERS['vector_delete'];
      const result = await handler({
        collection: 'capabilities',
        id: 'doc-1',
      });

      expect(mockRemove).toHaveBeenCalledWith('capabilities', 'doc-1');
      expect(result).toMatchObject({
        success: true,
        data: { id: 'doc-1' },
      });
    });

    it('should handle errors', async () => {
      mockRemove.mockRejectedValue(new Error('Delete failed'));

      const handler = TOOL_HANDLERS['vector_delete'];
      const result = await handler({
        collection: 'capabilities',
        id: 'doc-1',
      });

      expect(result).toMatchObject({
        success: false,
        error: 'Delete failed',
      });
    });
  });

  describe('vector_list', () => {
    it('should require collection parameter', async () => {
      const handler = TOOL_HANDLERS['vector_list'];
      const result = await handler({});

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('collection'),
      });
    });

    it('should call list with correct parameters', async () => {
      mockList.mockResolvedValue([
        { id: 'doc-1', payload: { text: 'test 1' } },
        { id: 'doc-2', payload: { text: 'test 2' } },
      ]);

      const handler = TOOL_HANDLERS['vector_list'];
      const result = await handler({
        collection: 'capabilities',
        limit: 100,
      });

      expect(mockList).toHaveBeenCalledWith('capabilities', { limit: 100, filter: undefined });
      expect(result).toMatchObject({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'doc-1' }),
          expect.objectContaining({ id: 'doc-2' }),
        ]),
      });
    });

    it('should use default limit', async () => {
      mockList.mockResolvedValue([]);

      const handler = TOOL_HANDLERS['vector_list'];
      await handler({ collection: 'capabilities' });

      expect(mockList).toHaveBeenCalledWith('capabilities', { limit: 10000, filter: undefined });
    });

    it('should pass filter when provided', async () => {
      mockList.mockResolvedValue([]);

      const handler = TOOL_HANDLERS['vector_list'];
      await handler({
        collection: 'capabilities',
        filter: { must: [{ key: 'type', match: { value: 'database' } }] },
      });

      expect(mockList).toHaveBeenCalledWith('capabilities', {
        limit: 10000,
        filter: { must: [{ key: 'type', match: { value: 'database' } }] },
      });
    });
  });

  describe('collection_initialize', () => {
    it('should require collection and vectorSize parameters', async () => {
      const handler = TOOL_HANDLERS['collection_initialize'];

      const result1 = await handler({});
      expect(result1).toMatchObject({ success: false, error: expect.stringContaining('collection') });

      const result2 = await handler({ collection: 'test' });
      expect(result2).toMatchObject({ success: false, error: expect.stringContaining('vectorSize') });
    });

    it('should call initializeCollection with correct parameters', async () => {
      mockInitializeCollection.mockResolvedValue(undefined);

      const handler = TOOL_HANDLERS['collection_initialize'];
      const result = await handler({
        collection: 'capabilities',
        vectorSize: 1536,
        createTextIndex: false,
      });

      expect(mockInitializeCollection).toHaveBeenCalledWith('capabilities', {
        vectorSize: 1536,
        createTextIndex: false,
      });
      expect(result).toMatchObject({
        success: true,
        data: { collection: 'capabilities', vectorSize: 1536, createTextIndex: false },
      });
    });

    it('should use default createTextIndex', async () => {
      mockInitializeCollection.mockResolvedValue(undefined);

      const handler = TOOL_HANDLERS['collection_initialize'];
      await handler({
        collection: 'capabilities',
        vectorSize: 1536,
      });

      expect(mockInitializeCollection).toHaveBeenCalledWith('capabilities', {
        vectorSize: 1536,
        createTextIndex: true,
      });
    });
  });

  describe('collection_stats', () => {
    it('should require collection parameter', async () => {
      const handler = TOOL_HANDLERS['collection_stats'];
      const result = await handler({});

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('collection'),
      });
    });

    it('should call getCollectionStats with correct parameters', async () => {
      mockGetCollectionStats.mockResolvedValue({
        pointsCount: 1000,
        vectorSize: 1536,
        status: 'green',
        exists: true,
      });

      const handler = TOOL_HANDLERS['collection_stats'];
      const result = await handler({ collection: 'capabilities' });

      expect(mockGetCollectionStats).toHaveBeenCalledWith('capabilities');
      expect(result).toMatchObject({
        success: true,
        data: {
          pointsCount: 1000,
          vectorSize: 1536,
          status: 'green',
          exists: true,
        },
      });
    });

    it('should handle non-existent collection', async () => {
      mockGetCollectionStats.mockResolvedValue({
        pointsCount: 0,
        vectorSize: 0,
        status: 'not_found',
        exists: false,
      });

      const handler = TOOL_HANDLERS['collection_stats'];
      const result = await handler({ collection: 'nonexistent' });

      expect(result).toMatchObject({
        success: true,
        data: { exists: false },
        message: expect.stringContaining('does not exist'),
      });
    });
  });
});
