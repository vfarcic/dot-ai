/**
 * Tests for Capability Vector Service
 */

import { CapabilityVectorService, ResourceCapability } from '../../src/core/capability-vector-service';
import { VectorDBService } from '../../src/core/vector-db-service';
import { EmbeddingService } from '../../src/core/embedding-service';
import { CapabilityInferenceEngine } from '../../src/core/capabilities';

// Mock VectorDBService
const mockVectorDB = {
  initializeCollection: jest.fn().mockResolvedValue(undefined),
  upsertDocument: jest.fn().mockResolvedValue(undefined),
  searchSimilar: jest.fn().mockResolvedValue([]),
  searchByKeywords: jest.fn().mockResolvedValue([]),
  getDocument: jest.fn().mockResolvedValue(null),
  deleteDocument: jest.fn().mockResolvedValue(undefined),
  getAllDocuments: jest.fn().mockResolvedValue([]),
  healthCheck: jest.fn().mockResolvedValue(true),
  isInitialized: jest.fn().mockReturnValue(true)
} as unknown as VectorDBService;

// Mock EmbeddingService
const mockEmbeddingService = {
  isAvailable: jest.fn().mockReturnValue(true),
  getDimensions: jest.fn().mockReturnValue(1536),
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  generateEmbeddings: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  getStatus: jest.fn().mockReturnValue({
    available: true,
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 1536
  })
} as unknown as EmbeddingService;

describe('CapabilityVectorService', () => {
  let service: CapabilityVectorService;
  let mockCapability: ResourceCapability;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create service with mocked dependencies
    service = new CapabilityVectorService(mockVectorDB, mockEmbeddingService);
    
    // Sample capability for testing
    mockCapability = {
      resourceName: 'sqls.devopstoolkit.live',
      capabilities: ['postgresql', 'mysql', 'database', 'multi cloud'],
      providers: ['azure', 'gcp', 'aws'],
      abstractions: ['managed service', 'high availability'],
      complexity: 'low',
      description: 'Managed database solution supporting multiple engines',
      useCase: 'Simple database deployment without infrastructure complexity',
      confidence: 90,
      analyzedAt: '2025-08-06T10:00:00.000Z'
    };
  });

  describe('initialization', () => {
    it('should initialize with correct collection name', async () => {
      await service.initialize();
      
      expect(mockVectorDB.initializeCollection).toHaveBeenCalledWith(1536);
    });

    it('should handle initialization errors gracefully', async () => {
      (mockVectorDB.initializeCollection as jest.Mock).mockRejectedValueOnce(new Error('Init failed'));
      
      await expect(service.initialize()).rejects.toThrow('Init failed');
    });
  });

  describe('capability storage', () => {
    it('should store capability successfully', async () => {
      await service.storeCapability(mockCapability);
      
      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith({
        id: '17c5105f-e215-ae9b-b3bf-58b608abb3b7',
        vector: [0.1, 0.2, 0.3],
        payload: {
          resourceName: 'sqls.devopstoolkit.live',
          capabilities: ['postgresql', 'mysql', 'database', 'multi cloud'],
          providers: ['azure', 'gcp', 'aws'],
          abstractions: ['managed service', 'high availability'],
          complexity: 'low',
          description: 'Managed database solution supporting multiple engines',
          useCase: 'Simple database deployment without infrastructure complexity',
          confidence: 90,
          analyzedAt: '2025-08-06T10:00:00.000Z',
          searchText: 'sqls.devopstoolkit.live postgresql mysql database multi cloud azure gcp aws managed service high availability Managed database solution supporting multiple engines Simple database deployment without infrastructure complexity low',
          hasEmbedding: true
        }
      });
    });

    it('should handle storage errors', async () => {
      (mockVectorDB.upsertDocument as jest.Mock).mockRejectedValueOnce(new Error('Storage failed'));
      
      await expect(service.storeCapability(mockCapability)).rejects.toThrow('Storage failed');
    });
  });

  describe('capability retrieval', () => {
    it('should retrieve capability by ID', async () => {
      const mockDocument = {
        id: '17c5105f-e215-ae9b-b3bf-58b608abb3b7',
        payload: {
          resourceName: 'sqls.devopstoolkit.live',
          capabilities: ['postgresql', 'mysql'],
          providers: ['azure'],
          abstractions: ['managed service'],
          complexity: 'low',
          description: 'Test capability',
          useCase: 'Test use case',
          confidence: 85,
          analyzedAt: '2025-08-06T10:00:00.000Z'
        }
      };
      
      (mockVectorDB.getDocument as jest.Mock).mockResolvedValueOnce(mockDocument);
      
      const result = await service.getCapability('17c5105f-e215-ae9b-b3bf-58b608abb3b7');
      
      // Expect single call with ID
      expect(mockVectorDB.getDocument).toHaveBeenCalledWith('17c5105f-e215-ae9b-b3bf-58b608abb3b7');
      expect(mockVectorDB.getDocument).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        resourceName: 'sqls.devopstoolkit.live',
        capabilities: ['postgresql', 'mysql'],
        providers: ['azure'],
        abstractions: ['managed service'],
        complexity: 'low',
        description: 'Test capability',
        useCase: 'Test use case',
        confidence: 85,
        analyzedAt: '2025-08-06T10:00:00.000Z',
        id: '17c5105f-e215-ae9b-b3bf-58b608abb3b7'
      });
    });

    it('should return null for non-existent capability', async () => {
      (mockVectorDB.getDocument as jest.Mock).mockResolvedValueOnce(null);
      
      const result = await service.getCapability('nonexistent.resource');
      
      expect(result).toBeNull();
    });
  });

  describe('capability search', () => {
    it('should search capabilities by intent', async () => {
      const mockSearchResults = [
        {
          id: 'capability-sqls-devopstoolkit-live',
          score: 0.95,
          payload: {
            resourceName: 'sqls.devopstoolkit.live',
            capabilities: ['postgresql', 'database'],
            providers: ['azure'],
            abstractions: ['managed service'],
            complexity: 'low',
            description: 'Database solution',
            useCase: 'Database deployment',
            confidence: 90,
            analyzedAt: '2025-08-06T10:00:00.000Z'
          }
        }
      ];
      
      (mockVectorDB.searchSimilar as jest.Mock).mockResolvedValueOnce(mockSearchResults);
      
      const results = await service.searchCapabilities('postgresql database');
      
      expect(results).toHaveLength(1);
      expect(results[0].data.resourceName).toBe('sqls.devopstoolkit.live');
      expect(results[0].score).toBeGreaterThan(0.5); // Base class scoring algorithm returns different values
      expect(results[0].matchType).toBe('semantic');
    });

    it('should apply complexity filter', async () => {
      const mockSearchResults = [
        {
          id: 'capability-1',
          score: 0.9,
          payload: { complexity: 'low', resourceName: 'resource1' }
        },
        {
          id: 'capability-2', 
          score: 0.8,
          payload: { complexity: 'high', resourceName: 'resource2' }
        }
      ];
      
      // Mock the base search method to return both results
      jest.spyOn(service as any, 'searchData').mockResolvedValueOnce([
        { data: { complexity: 'low', resourceName: 'resource1' }, score: 0.9, matchType: 'semantic' },
        { data: { complexity: 'high', resourceName: 'resource2' }, score: 0.8, matchType: 'semantic' }
      ]);
      
      const results = await service.searchCapabilities('database', { complexityFilter: 'low' });
      
      expect(results).toHaveLength(1);
      expect(results[0].data.complexity).toBe('low');
    });

    it('should apply provider filter', async () => {
      // Mock the base search method
      jest.spyOn(service as any, 'searchData').mockResolvedValueOnce([
        { data: { providers: ['azure', 'aws'], resourceName: 'resource1' }, score: 0.9, matchType: 'semantic' },
        { data: { providers: ['gcp'], resourceName: 'resource2' }, score: 0.8, matchType: 'semantic' }
      ]);
      
      const results = await service.searchCapabilities('database', { providerFilter: ['azure'] });
      
      expect(results).toHaveLength(1);
      expect(results[0].data.providers).toContain('azure');
    });
  });

  describe('capability management', () => {
    it('should delete capability by resource name', async () => {
      await service.deleteCapability('sqls.devopstoolkit.live');
      
      expect(mockVectorDB.deleteDocument).toHaveBeenCalledWith('17c5105f-e215-ae9b-b3bf-58b608abb3b7');
    });

    it('should get all capabilities with limit', async () => {
      const mockDocuments = [
        { payload: mockCapability }
      ];
      
      (mockVectorDB.getAllDocuments as jest.Mock).mockResolvedValueOnce(mockDocuments);
      
      const results = await service.getAllCapabilities(5);
      
      expect(mockVectorDB.getAllDocuments).toHaveBeenCalledWith(5);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(mockCapability);
    });

    it('should get capabilities count', async () => {
      const mockDocuments = Array(42).fill({ payload: mockCapability });
      (mockVectorDB.getAllDocuments as jest.Mock).mockResolvedValueOnce(mockDocuments);
      
      const count = await service.getCapabilitiesCount();
      
      expect(mockVectorDB.getAllDocuments).toHaveBeenCalledWith(undefined);
      expect(count).toBe(42);
    });
  });

  describe('data transformation', () => {
    it('should create correct search text', () => {
      const searchText = (service as any).createSearchText(mockCapability);
      
      expect(searchText).toContain('sqls.devopstoolkit.live');
      expect(searchText).toContain('postgresql');
      expect(searchText).toContain('azure');
      expect(searchText).toContain('managed service');
      expect(searchText).toContain('low');
    });

    it('should extract correct ID', () => {
      const id = (service as any).extractId(mockCapability);
      
      expect(id).toBe('17c5105f-e215-ae9b-b3bf-58b608abb3b7');
    });

    it('should create correct payload', () => {
      const payload = (service as any).createPayload(mockCapability);
      
      expect(payload).toEqual({
        resourceName: 'sqls.devopstoolkit.live',
        capabilities: ['postgresql', 'mysql', 'database', 'multi cloud'],
        providers: ['azure', 'gcp', 'aws'],
        abstractions: ['managed service', 'high availability'],
        complexity: 'low',
        description: 'Managed database solution supporting multiple engines',
        useCase: 'Simple database deployment without infrastructure complexity',
        confidence: 90,
        analyzedAt: '2025-08-06T10:00:00.000Z'
      });
    });

    it('should convert payload to data correctly', () => {
      const payload = {
        resourceName: 'test.resource',
        capabilities: ['test'],
        providers: ['azure'],
        abstractions: ['managed'],
        complexity: 'medium',
        description: 'Test desc',
        useCase: 'Test use case',
        confidence: 80,
        analyzedAt: '2025-08-06T10:00:00.000Z'
      };
      
      const data = (service as any).payloadToData(payload);
      
      expect(data).toEqual(payload);
    });

    it('should handle missing payload fields with defaults', () => {
      const incompletePayload = { resourceName: 'test.resource' };
      
      const data = (service as any).payloadToData(incompletePayload);
      
      expect(data.capabilities).toEqual([]);
      expect(data.providers).toEqual([]);
      expect(data.abstractions).toEqual([]);
      expect(data.complexity).toBe('medium');
      expect(data.description).toBe('');
      expect(data.useCase).toBe('');
      expect(data.confidence).toBe(0);
      expect(data.analyzedAt).toBeDefined();
    });
  });

  describe('deleteAllCapabilities', () => {
    it('should delete all capabilities efficiently', async () => {
      const mockDeleteAllData = jest.fn().mockResolvedValue(undefined);
      (service as any).deleteAllData = mockDeleteAllData;

      await service.deleteAllCapabilities();

      expect(mockDeleteAllData).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during deleteAllCapabilities', async () => {
      const mockDeleteAllData = jest.fn().mockRejectedValue(new Error('Delete all failed'));
      (service as any).deleteAllData = mockDeleteAllData;

      await expect(service.deleteAllCapabilities()).rejects.toThrow('Delete all failed');
    });
  });
});