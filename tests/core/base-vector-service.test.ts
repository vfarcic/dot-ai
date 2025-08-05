/**
 * BaseVectorService Tests
 * 
 * Tests the generic vector service base class functionality using mocks
 */

import { BaseVectorService, BaseSearchOptions, BaseSearchResult } from '../../src/core/base-vector-service';
import { VectorDBService } from '../../src/core/vector-db-service';
import { EmbeddingService } from '../../src/core/embedding-service';

// Test data type
interface TestData {
  id: string;
  name: string;
  description: string;
}

// Concrete implementation for testing
class TestVectorService extends BaseVectorService<TestData> {
  constructor(vectorDB?: VectorDBService, embeddingService?: EmbeddingService) {
    super('test-collection', vectorDB, embeddingService);
  }

  protected createSearchText(data: TestData): string {
    return `${data.name} ${data.description}`.toLowerCase();
  }

  protected extractId(data: TestData): string {
    return data.id;
  }

  protected createPayload(data: TestData): Record<string, any> {
    return {
      name: data.name,
      description: data.description
    };
  }

  protected payloadToData(payload: Record<string, any>): TestData {
    return {
      id: '', // Will be set from document ID
      name: payload.name,
      description: payload.description
    };
  }
}

describe('BaseVectorService', () => {
  let mockVectorDB: jest.Mocked<VectorDBService>;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;
  let testService: TestVectorService;

  const testData: TestData = {
    id: 'test-1',
    name: 'Test Item',
    description: 'A test description'
  };

  beforeEach(() => {
    // Mock VectorDBService
    mockVectorDB = {
      initializeCollection: jest.fn().mockResolvedValue(undefined),
      upsertDocument: jest.fn().mockResolvedValue(undefined),
      getDocument: jest.fn().mockResolvedValue(null),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
      getAllDocuments: jest.fn().mockResolvedValue([]),
      getCollectionInfo: jest.fn().mockResolvedValue({ points_count: 0 }),
      searchByKeywords: jest.fn().mockResolvedValue([]),
      searchSimilar: jest.fn().mockResolvedValue([]),
      healthCheck: jest.fn().mockResolvedValue(true)
    } as any;

    // Mock EmbeddingService
    mockEmbeddingService = {
      isAvailable: jest.fn().mockReturnValue(false),
      generateEmbedding: jest.fn().mockResolvedValue(null),
      getDimensions: jest.fn().mockReturnValue(1536),
      getStatus: jest.fn().mockReturnValue({
        available: false,
        provider: null,
        reason: 'No API key provided'
      })
    } as any;

    testService = new TestVectorService(mockVectorDB, mockEmbeddingService);
  });

  describe('Initialization', () => {
    it('should initialize collection with correct dimensions', async () => {
      mockEmbeddingService.isAvailable.mockReturnValue(true);
      mockEmbeddingService.getDimensions.mockReturnValue(1536);

      await testService.initialize();

      expect(mockVectorDB.initializeCollection).toHaveBeenCalledWith(1536);
    });

    it('should use default dimensions when embedding service unavailable', async () => {
      mockEmbeddingService.isAvailable.mockReturnValue(false);

      await testService.initialize();

      expect(mockVectorDB.initializeCollection).toHaveBeenCalledWith(1536);
    });
  });

  describe('Health Check', () => {
    it('should return health check result from vector DB', async () => {
      mockVectorDB.healthCheck.mockResolvedValue(true);

      const result = await testService.healthCheck();

      expect(result).toBe(true);
      expect(mockVectorDB.healthCheck).toHaveBeenCalled();
    });
  });

  describe('Data Storage', () => {
    it('should store data with embedding when available', async () => {
      const embedding = [0.1, 0.2, 0.3];
      mockEmbeddingService.isAvailable.mockReturnValue(true);
      mockEmbeddingService.generateEmbedding.mockResolvedValue(embedding);

      await testService.storeData(testData);

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('test item a test description');
      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith({
        id: 'test-1',
        payload: {
          name: 'Test Item',
          description: 'A test description',
          searchText: 'test item a test description',
          hasEmbedding: true
        },
        vector: embedding
      });
    });

    it('should store data without embedding when service unavailable', async () => {
      mockEmbeddingService.isAvailable.mockReturnValue(false);

      await testService.storeData(testData);

      expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith({
        id: 'test-1',
        payload: {
          name: 'Test Item',
          description: 'A test description',
          searchText: 'test item a test description',
          hasEmbedding: false
        },
        vector: undefined
      });
    });

    it('should handle embedding generation failure gracefully', async () => {
      mockEmbeddingService.isAvailable.mockReturnValue(true);
      mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('API error'));
      
      // Mock console.warn to avoid test output noise
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await testService.storeData(testData);

      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith({
        id: 'test-1',
        payload: {
          name: 'Test Item',
          description: 'A test description',
          searchText: 'test item a test description',
          hasEmbedding: false
        },
        vector: undefined
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Data Retrieval', () => {
    it('should get data by ID and set document ID', async () => {
      mockVectorDB.getDocument.mockResolvedValue({
        id: 'doc-123',
        payload: {
          name: 'Retrieved Item',
          description: 'Retrieved description'
        }
      });

      const result = await testService.getData('doc-123');

      expect(result).toEqual({
        id: 'doc-123',
        name: 'Retrieved Item',
        description: 'Retrieved description'
      });
      expect(mockVectorDB.getDocument).toHaveBeenCalledWith('doc-123');
    });

    it('should return null when document not found', async () => {
      mockVectorDB.getDocument.mockResolvedValue(null);

      const result = await testService.getData('nonexistent');

      expect(result).toBeNull();
    });

    it('should get all data with IDs set', async () => {
      mockVectorDB.getAllDocuments.mockResolvedValue([
        {
          id: 'doc-1',
          payload: { name: 'Item 1', description: 'Description 1' }
        },
        {
          id: 'doc-2',
          payload: { name: 'Item 2', description: 'Description 2' }
        }
      ]);

      const results = await testService.getAllData();

      expect(results).toEqual([
        { id: 'doc-1', name: 'Item 1', description: 'Description 1' },
        { id: 'doc-2', name: 'Item 2', description: 'Description 2' }
      ]);
      expect(mockVectorDB.getAllDocuments).toHaveBeenCalledWith(undefined);
    });

    it('should get all data with limit', async () => {
      mockVectorDB.getAllDocuments.mockResolvedValue([]);

      await testService.getAllData(5);

      expect(mockVectorDB.getAllDocuments).toHaveBeenCalledWith(5);
    });
  });

  describe('Data Count', () => {
    it('should get count from collection info', async () => {
      mockVectorDB.getCollectionInfo.mockResolvedValue({ points_count: 42 });

      const count = await testService.getDataCount();

      expect(count).toBe(42);
    });

    it('should fallback to getAllData count when collection info fails', async () => {
      mockVectorDB.getCollectionInfo.mockRejectedValue(new Error('Collection error'));
      mockVectorDB.getAllDocuments.mockResolvedValue([
        { id: '1', payload: {} },
        { id: '2', payload: {} }
      ]);

      const count = await testService.getDataCount();

      expect(count).toBe(2);
    });
  });

  describe('Data Deletion', () => {
    it('should delete data by ID', async () => {
      await testService.deleteData('test-id');

      expect(mockVectorDB.deleteDocument).toHaveBeenCalledWith('test-id');
    });
  });

  describe('Search Functionality', () => {
    const searchOptions: BaseSearchOptions = {
      limit: 5,
      scoreThreshold: 0.5
    };

    it('should perform keyword-only search when embeddings unavailable', async () => {
      mockEmbeddingService.isAvailable.mockReturnValue(false);
      mockVectorDB.searchByKeywords.mockResolvedValue([
        {
          id: 'result-1',
          score: 0.8,
          payload: { name: 'Match', description: 'Matching item' }
        }
      ]);

      const results = await testService.searchData('test query', searchOptions);

      expect(mockVectorDB.searchByKeywords).toHaveBeenCalledWith(
        ['test', 'query'],
        { limit: 5, scoreThreshold: 0.5 }
      );
      expect(results).toEqual([
        {
          data: { id: 'result-1', name: 'Match', description: 'Matching item' },
          score: 0.8,
          matchType: 'keyword'
        }
      ]);
    });

    it('should filter results by score threshold', async () => {
      mockEmbeddingService.isAvailable.mockReturnValue(false);
      mockVectorDB.searchByKeywords.mockResolvedValue([
        {
          id: 'high-score',
          score: 0.8,
          payload: { name: 'High', description: 'High score item' }
        },
        {
          id: 'low-score',
          score: 0.3,
          payload: { name: 'Low', description: 'Low score item' }
        }
      ]);

      const results = await testService.searchData('test', { scoreThreshold: 0.5 });

      expect(results).toHaveLength(1);
      expect(results[0].data.name).toBe('High');
    });

    it('should attempt hybrid search when embeddings available', async () => {
      const embedding = [0.1, 0.2, 0.3];
      mockEmbeddingService.isAvailable.mockReturnValue(true);
      mockEmbeddingService.generateEmbedding.mockResolvedValue(embedding);
      
      mockVectorDB.searchSimilar.mockResolvedValue([
        {
          id: 'semantic-result',
          score: 0.9,
          payload: { name: 'Semantic', description: 'Semantic match' }
        }
      ]);
      mockVectorDB.searchByKeywords.mockResolvedValue([]);

      const results = await testService.searchData('test query', searchOptions);

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('test query');
      expect(mockVectorDB.searchSimilar).toHaveBeenCalledWith(
        embedding,
        { limit: 10, scoreThreshold: 0.5 }
      );
      expect(results[0].matchType).toBe('semantic');
    });

    it('should fallback to keyword search when embedding generation fails', async () => {
      mockEmbeddingService.isAvailable.mockReturnValue(true);
      mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('API error'));
      mockVectorDB.searchByKeywords.mockResolvedValue([]);
      
      // Mock console.warn to avoid test output noise
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await testService.searchData('test query', searchOptions);

      expect(mockVectorDB.searchByKeywords).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should return empty results for empty query', async () => {
      const results = await testService.searchData('', searchOptions);

      expect(results).toEqual([]);
      expect(mockVectorDB.searchByKeywords).not.toHaveBeenCalled();
    });

    it('should extract keywords correctly', async () => {
      mockEmbeddingService.isAvailable.mockReturnValue(false);
      mockVectorDB.searchByKeywords.mockResolvedValue([]);

      await testService.searchData('I want to scale the application');

      expect(mockVectorDB.searchByKeywords).toHaveBeenCalledWith(
        ['want', 'scale', 'the', 'application'],  // Length > 2 filter
        expect.any(Object)
      );
    });
  });

  describe('Search Mode Detection', () => {
    it('should return semantic mode when embedding service available', () => {
      mockEmbeddingService.getStatus.mockReturnValue({
        available: true,
        provider: 'openai',
        model: 'text-embedding-ada-002',
        dimensions: 1536
      });

      const mode = testService.getSearchMode();

      expect(mode).toEqual({
        semantic: true,
        provider: 'openai',
        reason: 'Embedding service available'
      });
    });

    it('should return keyword-only mode when embedding service unavailable', () => {
      mockEmbeddingService.getStatus.mockReturnValue({
        available: false,
        provider: null,
        reason: 'No API key provided'
      });

      const mode = testService.getSearchMode();

      expect(mode).toEqual({
        semantic: false,
        provider: undefined,
        reason: 'No API key provided'
      });
    });
  });

  describe('Hybrid Search Results Combination', () => {
    it('should combine semantic and keyword results with proper scoring', async () => {
      const embedding = [0.1, 0.2, 0.3];
      mockEmbeddingService.isAvailable.mockReturnValue(true);
      mockEmbeddingService.generateEmbedding.mockResolvedValue(embedding);
      
      // Mock results that will create hybrid matches
      mockVectorDB.searchSimilar.mockResolvedValue([
        {
          id: 'hybrid-match',
          score: 0.8,
          payload: { name: 'Hybrid', description: 'Found by both methods' }
        }
      ]);
      mockVectorDB.searchByKeywords.mockResolvedValue([
        {
          id: 'hybrid-match', // Same ID - should boost score
          score: 0.7,
          payload: { name: 'Hybrid', description: 'Found by both methods' }
        },
        {
          id: 'keyword-only',
          score: 0.6,
          payload: { name: 'Keyword', description: 'Keyword only match' }
        }
      ]);

      const results = await testService.searchData('test query', { limit: 10, scoreThreshold: 0.1 });

      // Should have hybrid match with boosted score and keyword-only match
      expect(results).toHaveLength(2);
      expect(results[0].matchType).toBe('hybrid');
      expect(results[1].matchType).toBe('keyword');
      // Results should be sorted by score (highest first)
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });
  });
});