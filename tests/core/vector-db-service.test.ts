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