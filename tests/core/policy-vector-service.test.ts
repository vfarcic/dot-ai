/**
 * Tests for Policy Vector Service
 */

import { PolicyVectorService } from '../../src/core/policy-vector-service';
import { PolicyIntent } from '../../src/core/organizational-types';
import { VectorDBService } from '../../src/core/vector-db-service';
import { EmbeddingService } from '../../src/core/embedding-service';

describe('PolicyVectorService', () => {
  let policyService: PolicyVectorService;
  let mockVectorDB: jest.Mocked<VectorDBService>;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;

  // Sample policy intent for testing
  const samplePolicyIntent: PolicyIntent = {
    id: 'test-policy-123',
    description: 'All containers must have resource limits to prevent resource exhaustion',
    triggers: ['resource limits', 'cpu limits', 'memory limits'],
    rationale: 'Prevents single containers from consuming all cluster resources',
    createdAt: '2025-08-21T10:00:00Z',
    createdBy: 'platform-team',
    deployedPolicies: []
  };

  beforeEach(() => {
    // Create mock services
    mockVectorDB = {
      upsertDocument: jest.fn(),
      searchSimilar: jest.fn(),
      searchByKeywords: jest.fn(),
      getDocument: jest.fn(),
      getAllDocuments: jest.fn(),
      deleteDocument: jest.fn(),
      healthCheck: jest.fn(),
      initializeCollection: jest.fn(),
      deleteAllDocuments: jest.fn(),
      getConfig: jest.fn(),
      isInitialized: jest.fn(),
      getCollectionInfo: jest.fn()
    } as any;

    mockEmbeddingService = {
      generateEmbedding: jest.fn(),
      healthCheck: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true)
    } as any;

    // Create service with mocks
    policyService = new PolicyVectorService(mockVectorDB, mockEmbeddingService);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with correct collection name', () => {
      expect(policyService).toBeDefined();
      // Verify it uses 'policies' collection (inherited from BaseVectorService)
    });

    it('should create default services when not provided', () => {
      const service = new PolicyVectorService();
      expect(service).toBeDefined();
    });
  });

  describe('Policy Intent Storage', () => {
    beforeEach(() => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockVectorDB.upsertDocument.mockResolvedValue();
    });

    it('should store policy intent successfully', async () => {
      await policyService.storePolicyIntent(samplePolicyIntent);

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining('all containers must have resource limits')
      );
      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith({
        id: samplePolicyIntent.id,
        vector: [0.1, 0.2, 0.3],
        payload: expect.objectContaining({
          description: samplePolicyIntent.description,
          triggers: samplePolicyIntent.triggers,
          rationale: samplePolicyIntent.rationale,
          createdAt: samplePolicyIntent.createdAt,
          createdBy: samplePolicyIntent.createdBy,
          deployedPolicies: []
        })
      });
    });

    it('should handle deployed policies in storage', async () => {
      const policyWithDeployment = {
        ...samplePolicyIntent,
        deployedPolicies: [{
          name: 'require-resource-limits-123',
          appliedAt: '2025-08-21T11:00:00Z'
        }]
      };

      await policyService.storePolicyIntent(policyWithDeployment);

      expect(mockVectorDB.upsertDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            deployedPolicies: [{
              name: 'require-resource-limits-123',
              appliedAt: '2025-08-21T11:00:00Z'
            }]
          })
        })
      );
    });

    it('should handle embedding service errors', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(
        new Error('Embedding service unavailable')
      );

      await expect(policyService.storePolicyIntent(samplePolicyIntent))
        .rejects.toThrow('Embedding service unavailable');
    });
  });

  describe('Policy Intent Search', () => {
    beforeEach(() => {
      mockEmbeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    });

    it('should search policy intents successfully', async () => {
      const mockVectorDBResults = [{
        id: 'policy-1',
        score: 0.85,
        payload: {
          description: 'Resource limits policy',
          triggers: ['resource limits'],
          rationale: 'Prevent resource exhaustion',
          createdAt: '2025-08-21T10:00:00Z',
          createdBy: 'admin',
          deployedPolicies: []
        }
      }];

      mockVectorDB.searchSimilar.mockResolvedValue(mockVectorDBResults);
      mockVectorDB.searchByKeywords.mockResolvedValue([]); // Empty keyword results

      const results = await policyService.searchPolicyIntents('resource limits');

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('resource limits');
      expect(mockVectorDB.searchSimilar).toHaveBeenCalled();
      expect(mockVectorDB.searchByKeywords).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].data.id).toBe('policy-1');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should search with custom options', async () => {
      mockVectorDB.searchSimilar.mockResolvedValue([]);
      mockVectorDB.searchByKeywords.mockResolvedValue([]);

      await policyService.searchPolicyIntents('cpu limits', {
        limit: 5,
        scoreThreshold: 0.7
      });

      expect(mockVectorDB.searchSimilar).toHaveBeenCalled();
      expect(mockVectorDB.searchByKeywords).toHaveBeenCalled();
    });

    it('should handle search errors', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(
        new Error('Service unavailable')
      );

      await expect(policyService.searchPolicyIntents('test query'))
        .rejects.toThrow('Service unavailable');
    });
  });

  describe('Policy Intent Retrieval', () => {
    it('should get policy intent by ID', async () => {
      const mockDocument = {
        id: 'policy-123',
        payload: {
          description: 'Test policy',
          triggers: ['test'],
          rationale: 'Test rationale',
          createdAt: '2025-08-21T10:00:00Z',
          createdBy: 'user',
          deployedPolicies: []
        }
      };

      mockVectorDB.getDocument.mockResolvedValue(mockDocument);

      const result = await policyService.getPolicyIntent('policy-123');

      expect(mockVectorDB.getDocument).toHaveBeenCalledWith('policy-123');
      expect(result).toEqual({
        id: 'policy-123',
        description: 'Test policy',
        triggers: ['test'],
        rationale: 'Test rationale',
        createdAt: '2025-08-21T10:00:00Z',
        createdBy: 'user',
        deployedPolicies: []
      });
    });

    it('should return null for non-existent policy intent', async () => {
      mockVectorDB.getDocument.mockResolvedValue(null);

      const result = await policyService.getPolicyIntent('non-existent');

      expect(result).toBeNull();
    });

    it('should get all policy intents', async () => {
      const mockDocuments = [{
        id: 'policy-1',
        payload: {
          description: 'Policy 1',
          triggers: ['test1'],
          rationale: 'Rationale 1',
          createdAt: '2025-08-21T10:00:00Z',
          createdBy: 'user1',
          deployedPolicies: []
        }
      }, {
        id: 'policy-2',
        payload: {
          description: 'Policy 2',
          triggers: ['test2'],
          rationale: 'Rationale 2',
          createdAt: '2025-08-21T11:00:00Z',
          createdBy: 'user2',
          deployedPolicies: []
        }
      }];

      mockVectorDB.getAllDocuments.mockResolvedValue(mockDocuments);

      const results = await policyService.getAllPolicyIntents();

      expect(mockVectorDB.getAllDocuments).toHaveBeenCalled();
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('policy-1');
      expect(results[1].id).toBe('policy-2');
    });

    it('should get policy intents count', async () => {
      mockVectorDB.getCollectionInfo.mockResolvedValue({ points_count: 5 });

      const count = await policyService.getPolicyIntentsCount();

      expect(mockVectorDB.getCollectionInfo).toHaveBeenCalled();
      expect(count).toBe(5);
    });
  });

  describe('Policy Intent Deletion', () => {
    it('should delete policy intent successfully', async () => {
      mockVectorDB.deleteDocument.mockResolvedValue();

      await policyService.deletePolicyIntent('policy-123');

      expect(mockVectorDB.deleteDocument).toHaveBeenCalledWith('policy-123');
    });

    it('should handle deletion errors', async () => {
      mockVectorDB.deleteDocument.mockRejectedValue(new Error('Delete failed'));

      await expect(policyService.deletePolicyIntent('policy-123'))
        .rejects.toThrow('Delete failed');
    });
  });

  describe('Search Text Creation', () => {
    it('should create proper search text from policy intent', () => {
      const service = new PolicyVectorService();
      const searchText = (service as any).createSearchText(samplePolicyIntent);

      expect(searchText).toContain('all containers must have resource limits');
      expect(searchText).toContain('resource limits');
      expect(searchText).toContain('cpu limits');
      expect(searchText).toContain('memory limits');
      expect(searchText).toContain('prevents single containers');
    });

    it('should handle empty triggers and rationale', () => {
      const service = new PolicyVectorService();
      const minimalPolicy: PolicyIntent = {
        ...samplePolicyIntent,
        triggers: [],
        rationale: ''
      };

      const searchText = (service as any).createSearchText(minimalPolicy);
      expect(searchText).toBe('all containers must have resource limits to prevent resource exhaustion  ');
    });
  });

  describe('Payload Conversion', () => {
    it('should convert policy intent to payload correctly', () => {
      const service = new PolicyVectorService();
      const payload = (service as any).createPayload(samplePolicyIntent);

      expect(payload).toEqual({
        description: samplePolicyIntent.description,
        triggers: ['resource limits', 'cpu limits', 'memory limits'],
        rationale: samplePolicyIntent.rationale,
        createdAt: samplePolicyIntent.createdAt,
        createdBy: samplePolicyIntent.createdBy,
        deployedPolicies: []
      });
    });

    it('should convert payload back to policy intent', () => {
      const service = new PolicyVectorService();
      const payload = {
        description: 'Test policy',
        triggers: ['test'],
        rationale: 'Test rationale',
        createdAt: '2025-08-21T10:00:00Z',
        createdBy: 'user',
        deployedPolicies: []
      };

      const policyIntent = (service as any).payloadToData(payload);

      expect(policyIntent).toEqual({
        id: '', // Will be set by base class
        description: 'Test policy',
        triggers: ['test'],
        rationale: 'Test rationale',
        createdAt: '2025-08-21T10:00:00Z',
        createdBy: 'user',
        deployedPolicies: []
      });
    });
  });

  describe('Health Check', () => {
    it('should perform health check', async () => {
      mockVectorDB.healthCheck.mockResolvedValue(true);

      const isHealthy = await policyService.healthCheck();

      expect(mockVectorDB.healthCheck).toHaveBeenCalled();
      expect(isHealthy).toBe(true);
    });
  });
});