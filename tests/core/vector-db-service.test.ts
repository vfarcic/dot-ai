/**
 * Tests for Vector DB Service
 */

import { VectorDBService, VectorDocument, SearchOptions } from '../../src/core/vector-db-service';

describe('VectorDBService', () => {
  let vectorService: VectorDBService;

  beforeEach(() => {
    // Use test configuration to avoid actual Qdrant connection
    vectorService = new VectorDBService({
      url: 'test-url',
      apiKey: 'test-key',
      collectionName: 'test-patterns'
    });
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const service = new VectorDBService();
      const config = service.getConfig();
      
      expect(config.url).toBe('http://localhost:6333');
      expect(config.collectionName).toBe('patterns');
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        url: 'http://custom:6333',
        apiKey: 'custom-key',
        collectionName: 'custom-patterns'
      };
      
      const service = new VectorDBService(customConfig);
      const config = service.getConfig();
      
      expect(config.url).toBe('http://custom:6333');
      expect(config.apiKey).toBe('custom-key');
      expect(config.collectionName).toBe('custom-patterns');
    });

    it('should use environment variables', () => {
      process.env.QDRANT_URL = 'http://env:6333';
      process.env.QDRANT_API_KEY = 'env-key';
      
      const service = new VectorDBService();
      const config = service.getConfig();
      
      expect(config.url).toBe('http://env:6333');
      expect(config.apiKey).toBe('env-key');
      
      delete process.env.QDRANT_URL;
      delete process.env.QDRANT_API_KEY;
    });
  });

  describe('Client Initialization', () => {
    it('should not initialize client for test configurations', () => {
      expect(vectorService.isInitialized()).toBe(false);
    });

    it('should validate required configuration', () => {
      expect(() => new VectorDBService({ url: '' })).toThrow('Qdrant URL is required');
    });

    it('should allow test configurations', () => {
      expect(() => new VectorDBService({ url: 'test-url' })).not.toThrow();
      expect(() => new VectorDBService({ url: 'mock-url' })).not.toThrow();
    });
  });

  describe('Health Check', () => {
    it('should return false for uninitialized client', async () => {
      const isHealthy = await vectorService.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Document Operations', () => {
    it('should throw error for uninitialized client operations', async () => {
      const document: VectorDocument = {
        id: 'test-1',
        payload: { test: 'data' }
      };

      await expect(vectorService.upsertDocument(document))
        .rejects.toThrow('Vector DB client not initialized');
      
      await expect(vectorService.getDocument('test-1'))
        .rejects.toThrow('Vector DB client not initialized');
      
      await expect(vectorService.deleteDocument('test-1'))
        .rejects.toThrow('Vector DB client not initialized');
      
      await expect(vectorService.getAllDocuments())
        .rejects.toThrow('Vector DB client not initialized');
    });

    it('should throw error for search operations', async () => {
      const vector = [0.1, 0.2, 0.3];
      const keywords = ['test'];

      await expect(vectorService.searchSimilar(vector))
        .rejects.toThrow('Vector DB client not initialized');
      
      await expect(vectorService.searchByKeywords(keywords))
        .rejects.toThrow('Vector DB client not initialized');
    });

    it('should throw error for collection operations', async () => {
      await expect(vectorService.initializeCollection(384))
        .rejects.toThrow('Vector DB client not initialized');
      
      await expect(vectorService.getCollectionInfo())
        .rejects.toThrow('Vector DB client not initialized');
    });
  });

  describe('Collection Initialization with Dimension Handling', () => {
    let mockService: VectorDBService;
    let mockClient: any;

    beforeEach(() => {
      // Create a mock client for testing initialization logic
      mockClient = {
        getCollections: jest.fn(),
        getCollection: jest.fn(),
        createCollection: jest.fn(),
        deleteCollection: jest.fn()
      };

      // Create service with mock client
      mockService = new VectorDBService({ url: 'http://test:6333' });
      // Inject mock client for testing
      (mockService as any).client = mockClient;
    });

    it('should create new collection when none exists', async () => {
      mockClient.getCollections.mockResolvedValue({ collections: [] });

      await mockService.initializeCollection(1536);

      expect(mockClient.getCollections).toHaveBeenCalled();
      expect(mockClient.createCollection).toHaveBeenCalledWith('patterns', {
        vectors: {
          size: 1536,
          distance: 'Cosine',
          on_disk: true
        },
        optimizers_config: {
          default_segment_number: 2
        }
      });
    });

    it('should keep existing collection with correct dimensions', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'patterns' }]
      });
      mockClient.getCollection.mockResolvedValue({
        config: {
          params: {
            vectors: { size: 1536 }
          }
        }
      });

      await mockService.initializeCollection(1536);

      expect(mockClient.getCollections).toHaveBeenCalled();
      expect(mockClient.getCollection).toHaveBeenCalledWith('patterns');
      expect(mockClient.deleteCollection).not.toHaveBeenCalled();
      expect(mockClient.createCollection).not.toHaveBeenCalled();
    });

    it('should recreate collection when dimensions mismatch', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'patterns' }]
      });
      mockClient.getCollection.mockResolvedValue({
        config: {
          params: {
            vectors: { size: 384 } // Wrong dimension
          }
        }
      });

      // Mock console.warn to verify warning is logged
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await mockService.initializeCollection(1536);

      expect(mockClient.getCollection).toHaveBeenCalledWith('patterns');
      expect(mockClient.deleteCollection).toHaveBeenCalledWith('patterns');
      expect(mockClient.createCollection).toHaveBeenCalledWith('patterns', {
        vectors: {
          size: 1536,
          distance: 'Cosine',
          on_disk: true
        },
        optimizers_config: {
          default_segment_number: 2
        }
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vector dimension mismatch: existing collection has 384 dimensions, but 1536 expected')
      );

      consoleSpy.mockRestore();
    });

    it('should recreate collection when getCollection fails', async () => {
      mockClient.getCollections.mockResolvedValue({
        collections: [{ name: 'patterns' }]
      });
      mockClient.getCollection.mockRejectedValue(new Error('Collection corrupted'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await mockService.initializeCollection(1536);

      expect(mockClient.deleteCollection).toHaveBeenCalledWith('patterns');
      expect(mockClient.createCollection).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get collection info, recreating collection')
      );

      consoleSpy.mockRestore();
    });

    it('should handle collection creation failures with helpful error', async () => {
      mockClient.getCollections.mockRejectedValue(new Error('Connection failed'));

      await expect(mockService.initializeCollection(1536))
        .rejects.toThrow('Failed to initialize collection: Error: Connection failed');
    });
  });

  describe('Search Options', () => {
    const searchOptions: SearchOptions = {
      limit: 5,
      scoreThreshold: 0.8
    };

    it('should handle search options correctly', () => {
      expect(searchOptions.limit).toBe(5);
      expect(searchOptions.scoreThreshold).toBe(0.8);
    });

    it('should use default search options', () => {
      const defaultOptions: SearchOptions = {};
      expect(defaultOptions.limit).toBeUndefined();
      expect(defaultOptions.scoreThreshold).toBeUndefined();
    });
  });
});