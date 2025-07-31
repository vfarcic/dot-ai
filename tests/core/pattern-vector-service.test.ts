/**
 * Tests for Pattern Vector Service
 */

import { PatternVectorService, PatternSearchOptions } from '../../src/core/pattern-vector-service';
import { VectorDBService } from '../../src/core/vector-db-service';
import { EmbeddingService } from '../../src/core/embedding-service';
import { OrganizationalPattern } from '../../src/core/pattern-types';

// Mock VectorDBService and EmbeddingService
jest.mock('../../src/core/vector-db-service');
jest.mock('../../src/core/embedding-service');

describe('PatternVectorService', () => {
  let patternService: PatternVectorService;
  let mockVectorDB: jest.Mocked<VectorDBService>;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;

  const samplePattern: OrganizationalPattern = {
    id: 'pattern-1',
    description: 'Horizontal scaling pattern',
    triggers: ['scaling', 'autoscaling', 'scale'],
    suggestedResources: ['HorizontalPodAutoscaler', 'Deployment'],
    rationale: 'Provides automatic scaling based on CPU usage',
    createdAt: '2025-01-30T12:00:00Z',
    createdBy: 'test-user'
  };

  beforeEach(() => {
    mockVectorDB = new VectorDBService({ url: 'test-url' }) as jest.Mocked<VectorDBService>;
    mockEmbeddingService = new EmbeddingService() as jest.Mocked<EmbeddingService>;
    
    // Mock embedding service to be unavailable by default (keyword-only mode)
    mockEmbeddingService.isAvailable = jest.fn().mockReturnValue(false);
    mockEmbeddingService.generateEmbedding = jest.fn().mockResolvedValue(null);
    mockEmbeddingService.getDimensions = jest.fn().mockReturnValue(1536);
    mockEmbeddingService.getStatus = jest.fn().mockReturnValue({
      available: false,
      provider: null,
      reason: 'OPENAI_API_KEY not set - using keyword-only pattern search'
    });
    
    patternService = new PatternVectorService(mockVectorDB, mockEmbeddingService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize collection with correct vector size', async () => {
      mockVectorDB.initializeCollection.mockResolvedValue();

      await patternService.initialize();

      // Uses embedding service dimensions (1536 for unavailable OpenAI, defaults to 1536)
      expect(mockVectorDB.initializeCollection).toHaveBeenCalledWith(1536);
    });

    it('should handle initialization errors gracefully', async () => {
      mockVectorDB.initializeCollection.mockRejectedValue(new Error('Connection failed'));

      await expect(patternService.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('Pattern Storage', () => {
    it('should store pattern with correct document structure', async () => {
      mockVectorDB.upsertDocument.mockResolvedValue();

      await patternService.storePattern(samplePattern);

      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith({
        id: 'pattern-1',
        payload: {
          description: 'Horizontal scaling pattern',
          triggers: ['scaling', 'autoscaling', 'scale'],
          suggestedResources: ['HorizontalPodAutoscaler', 'Deployment'],
          rationale: 'Provides automatic scaling based on CPU usage',
          createdAt: '2025-01-30T12:00:00Z',
          createdBy: 'test-user',
          searchText: expect.stringContaining('horizontal scaling pattern'),
          hasEmbedding: false
        },
        vector: undefined
      });
    });

    it('should create searchable text from pattern fields', async () => {
      mockVectorDB.upsertDocument.mockResolvedValue();

      await patternService.storePattern(samplePattern);

      const expectedSearchText = 'horizontal scaling pattern scaling autoscaling scale horizontalpodautoscaler deployment provides automatic scaling based on cpu usage';
      
      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            searchText: expectedSearchText
          })
        })
      );
    });
  });

  describe('Pattern Retrieval', () => {
    it('should get pattern by ID', async () => {
      mockVectorDB.getDocument.mockResolvedValue({
        id: 'pattern-1',
        payload: {
          description: 'Horizontal scaling pattern',
          triggers: ['scaling', 'autoscaling', 'scale'],
          suggestedResources: ['HorizontalPodAutoscaler', 'Deployment'],
          rationale: 'Provides automatic scaling based on CPU usage',
          createdAt: '2025-01-30T12:00:00Z',
          createdBy: 'test-user'
        }
      });

      const pattern = await patternService.getPattern('pattern-1');

      expect(pattern).toEqual(samplePattern);
      expect(mockVectorDB.getDocument).toHaveBeenCalledWith('pattern-1');
    });

    it('should return null for non-existent pattern', async () => {
      mockVectorDB.getDocument.mockResolvedValue(null);

      const pattern = await patternService.getPattern('non-existent');

      expect(pattern).toBeNull();
    });

    it('should get all patterns', async () => {
      mockVectorDB.getAllDocuments.mockResolvedValue([
        {
          id: 'pattern-1',
          payload: {
            description: 'Pattern 1',
            triggers: ['test1'],
            suggestedResources: ['Resource1'],
            rationale: 'Test rationale 1',
            createdAt: '2025-01-30T12:00:00Z',
            createdBy: 'user1'
          }
        }
      ]);

      const patterns = await patternService.getAllPatterns();

      expect(patterns).toHaveLength(1);
      expect(patterns[0].id).toBe('pattern-1');
    });
  });

  describe('Pattern Search', () => {
    beforeEach(() => {
      mockVectorDB.searchByKeywords.mockResolvedValue([
        {
          id: 'pattern-1',
          score: 1.0,
          payload: {
            description: 'Horizontal scaling pattern',
            triggers: ['scaling', 'autoscaling', 'scale'],
            suggestedResources: ['HorizontalPodAutoscaler', 'Deployment'],
            rationale: 'Provides automatic scaling based on CPU usage',
            createdAt: '2025-01-30T12:00:00Z',
            createdBy: 'test-user'
          }
        }
      ]);
    });

    it('should search patterns by keywords', async () => {
      const results = await patternService.searchPatterns('horizontal scaling');

      expect(results).toHaveLength(1);
      expect(results[0].pattern.id).toBe('pattern-1');
      expect(results[0].matchType).toBe('keyword');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should extract keywords from query', async () => {
      await patternService.searchPatterns('I need horizontal pod autoscaling');

      expect(mockVectorDB.searchByKeywords).toHaveBeenCalledWith(
        ['need', 'horizontal', 'pod', 'autoscaling'],
        expect.any(Object)
      );
    });

    it('should filter out stop words', async () => {
      await patternService.searchPatterns('I want to scale the application');

      expect(mockVectorDB.searchByKeywords).toHaveBeenCalledWith(
        ['want', 'scale', 'application'],
        expect.any(Object)
      );
    });

    it('should handle empty query', async () => {
      const results = await patternService.searchPatterns('');

      expect(results).toHaveLength(0);
      expect(mockVectorDB.searchByKeywords).not.toHaveBeenCalled();
    });

    it('should apply search options', async () => {
      const options: PatternSearchOptions = {
        limit: 5,
        scoreThreshold: 0.8
      };

      await patternService.searchPatterns('scaling', options);

      expect(mockVectorDB.searchByKeywords).toHaveBeenCalledWith(
        ['scaling'],
        {
          limit: 5,
          scoreThreshold: 0.8
        }
      );
    });

    it('should filter results by score threshold', async () => {
      // Mock low-score result
      mockVectorDB.searchByKeywords.mockResolvedValue([
        {
          id: 'pattern-1',
          score: 1.0,
          payload: {
            triggers: ['different', 'keywords'],
            description: 'Different pattern',
            suggestedResources: ['Resource'],
            rationale: 'Different rationale',
            createdAt: '2025-01-30T12:00:00Z',
            createdBy: 'user'
          }
        }
      ]);

      const results = await patternService.searchPatterns('scaling', { scoreThreshold: 0.9 });

      // Should filter out low-scoring results
      expect(results).toHaveLength(0);
    });
  });

  describe('Pattern Deletion', () => {
    it('should delete pattern by ID', async () => {
      mockVectorDB.deleteDocument.mockResolvedValue();

      await patternService.deletePattern('pattern-1');

      expect(mockVectorDB.deleteDocument).toHaveBeenCalledWith('pattern-1');
    });
  });

  describe('Health Check', () => {
    it('should return health check result', async () => {
      mockVectorDB.healthCheck.mockResolvedValue(true);

      const isHealthy = await patternService.healthCheck();

      expect(isHealthy).toBe(true);
      expect(mockVectorDB.healthCheck).toHaveBeenCalled();
    });
  });

  describe('Pattern Count', () => {
    it('should get patterns count from collection info', async () => {
      mockVectorDB.getCollectionInfo.mockResolvedValue({ points_count: 5 });

      const count = await patternService.getPatternsCount();

      expect(count).toBe(5);
    });

    it('should fallback to getAllPatterns if collection info fails', async () => {
      mockVectorDB.getCollectionInfo.mockRejectedValue(new Error('Collection info failed'));
      mockVectorDB.getAllDocuments.mockResolvedValue([
        { id: '1', payload: {} },
        { id: '2', payload: {} }
      ]);

      const count = await patternService.getPatternsCount();

      expect(count).toBe(2);
    });
  });

  describe('Keyword Score Calculation', () => {
    it('should calculate exact match scores correctly', async () => {
      mockVectorDB.searchByKeywords.mockResolvedValue([
        {
          id: 'pattern-1',
          score: 1.0,
          payload: {
            triggers: ['scaling', 'autoscaling'],
            description: 'Scaling pattern',
            suggestedResources: ['HPA'],
            rationale: 'For scaling',
            createdAt: '2025-01-30T12:00:00Z',
            createdBy: 'user'
          }
        }
      ]);

      const results = await patternService.searchPatterns('scaling autoscaling');

      expect(results[0].score).toBe(1.0); // Perfect match
    });
  });

  describe('Embedding Integration', () => {
    beforeEach(() => {
      // Mock embedding service as available
      mockEmbeddingService.isAvailable = jest.fn().mockReturnValue(true);
      mockEmbeddingService.getDimensions = jest.fn().mockReturnValue(1536);
      mockEmbeddingService.getStatus = jest.fn().mockReturnValue({
        available: true,
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536
      });
    });

    it('should store pattern with embedding when available', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbeddingService.generateEmbedding = jest.fn().mockResolvedValue(mockEmbedding);
      mockVectorDB.upsertDocument = jest.fn().mockResolvedValue(undefined);

      await patternService.storePattern(samplePattern);

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        'horizontal scaling pattern scaling autoscaling scale horizontalpodautoscaler deployment provides automatic scaling based on cpu usage'
      );
      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith({
        id: samplePattern.id,
        payload: expect.objectContaining({
          hasEmbedding: true
        }),
        vector: mockEmbedding
      });
    });

    it('should fallback to keyword-only storage when embedding fails', async () => {
      mockEmbeddingService.generateEmbedding = jest.fn().mockRejectedValue(new Error('API error'));
      mockVectorDB.upsertDocument = jest.fn().mockResolvedValue(undefined);

      await patternService.storePattern(samplePattern);

      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith({
        id: samplePattern.id,
        payload: expect.objectContaining({
          hasEmbedding: false
        }),
        vector: undefined
      });
    });

    it('should use hybrid search when embeddings available', async () => {
      const mockQueryEmbedding = [0.5, 0.6, 0.7];
      mockEmbeddingService.generateEmbedding = jest.fn().mockResolvedValue(mockQueryEmbedding);
      
      mockVectorDB.searchSimilar = jest.fn().mockResolvedValue([{
        id: 'pattern-1',
        score: 0.8,
        payload: {
          description: 'Semantic match',
          triggers: ['different', 'keywords'],
          hasEmbedding: true
        }
      }]);
      
      mockVectorDB.searchByKeywords = jest.fn().mockResolvedValue([{
        id: 'pattern-2', 
        score: 0.7,
        payload: {
          description: 'Keyword match',
          triggers: ['scale', 'scaling'],
          hasEmbedding: false
        }
      }]);

      const results = await patternService.searchPatterns('scale my application');

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('scale my application');
      expect(mockVectorDB.searchSimilar).toHaveBeenCalledWith(mockQueryEmbedding, expect.any(Object));
      expect(mockVectorDB.searchByKeywords).toHaveBeenCalled();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should provide search mode information', () => {
      const searchMode = patternService.getSearchMode();
      
      expect(searchMode.semantic).toBe(true);
      expect(searchMode.provider).toBe('openai');
    });

    it('should initialize collection with embedding dimensions', async () => {
      mockVectorDB.initializeCollection = jest.fn().mockResolvedValue(undefined);

      await patternService.initialize();

      expect(mockVectorDB.initializeCollection).toHaveBeenCalledWith(1536);
    });
  });

  describe('Graceful Degradation', () => {
    it('should use keyword-only search when embeddings unavailable', async () => {
      // Embedding service unavailable (default mock state)
      mockVectorDB.searchByKeywords = jest.fn().mockResolvedValue([{
        id: 'pattern-1',
        score: 0.9,
        payload: {
          description: 'Test pattern',
          triggers: ['scale', 'scaling']
        }
      }]);

      const results = await patternService.searchPatterns('scale application');

      expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
      expect(mockVectorDB.searchSimilar).not.toHaveBeenCalled();
      expect(mockVectorDB.searchByKeywords).toHaveBeenCalled();
      expect(results[0].matchType).toBe('keyword');
    });

    it('should fallback to keyword search when semantic search fails', async () => {
      // Mock embedding service as available but generateEmbedding fails
      mockEmbeddingService.isAvailable = jest.fn().mockReturnValue(true);
      mockEmbeddingService.generateEmbedding = jest.fn().mockRejectedValue(new Error('Network error'));
      
      mockVectorDB.searchByKeywords = jest.fn().mockResolvedValue([{
        id: 'pattern-1',
        score: 0.9,
        payload: {
          description: 'Test pattern',
          triggers: ['scale', 'scaling']
        }
      }]);

      const results = await patternService.searchPatterns('scale application');

      expect(mockVectorDB.searchByKeywords).toHaveBeenCalled();
      expect(results[0].matchType).toBe('keyword');
    });
  });
});