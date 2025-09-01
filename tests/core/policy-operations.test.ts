/**
 * Tests for Policy Operations Core Module
 */

import { 
  handlePolicyOperation,
  getPolicyService,
  handlePolicyDelete,
  handlePolicyDeleteAll,
  findKyvernoPoliciesByPolicyId,
  deleteKyvernoPoliciesByPolicyId,
  findAllKyvernoPoliciesForPolicyIntents,
  deleteAllKyvernoPoliciesForPolicyIntents
} from '../../src/core/policy-operations';
// Mock PolicyVectorService methods
const mockStorePolicyIntent = jest.fn();
const mockSearchPolicyIntents = jest.fn();
const mockGetPolicyIntent = jest.fn();
const mockGetAllPolicyIntents = jest.fn();
const mockGetPolicyIntentsCount = jest.fn();
const mockDeletePolicyIntent = jest.fn();
const mockPolicyHealthCheck = jest.fn();
const mockPolicyInitialize = jest.fn();

jest.mock('../../src/core/policy-vector-service', () => ({
  PolicyVectorService: jest.fn().mockImplementation(() => ({
    storePolicyIntent: mockStorePolicyIntent,
    searchPolicyIntents: mockSearchPolicyIntents,
    getPolicyIntent: mockGetPolicyIntent,
    getAllPolicyIntents: mockGetAllPolicyIntents,
    getPolicyIntentsCount: mockGetPolicyIntentsCount,
    deletePolicyIntent: mockDeletePolicyIntent,
    healthCheck: mockPolicyHealthCheck,
    initialize: mockPolicyInitialize
  })),
}));

// Mock Vector DB Service
jest.mock('../../src/core/vector-db-service', () => ({
  VectorDBService: jest.fn().mockImplementation(() => ({
    getConfig: jest.fn().mockReturnValue({
      url: 'http://localhost:6333',
      collectionName: 'policies'
    })
  }))
}));

// Mock embedding service
const mockIsAvailable = jest.fn();
const mockGetStatus = jest.fn();

jest.mock('../../src/core/embedding-service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    isAvailable: mockIsAvailable,
    getStatus: mockGetStatus
  }))
}));

// Mock kubernetes-utils for Kyverno operations  
jest.mock('../../src/core/kubernetes-utils', () => ({
  executeKubectl: jest.fn()
}));

const { executeKubectl: mockExecuteKubectl } = require('../../src/core/kubernetes-utils');

// Mock unified creation session manager
jest.mock('../../src/core/unified-creation-session', () => ({
  UnifiedCreationSessionManager: jest.fn().mockImplementation(() => ({
    createSession: jest.fn().mockReturnValue({
      id: 'test-session-id',
      entityType: 'policy',
      createdAt: new Date().toISOString()
    }),
    processResponse: jest.fn().mockReturnValue({
      id: 'test-session-id',
      entityType: 'policy'
    }),
    loadSession: jest.fn().mockReturnValue({
      id: 'test-session-id',
      entityType: 'policy'
    }),
    getNextWorkflowStep: jest.fn().mockResolvedValue({
      entityType: 'policy',
      sessionId: 'test-session-id',
      nextStep: 'triggers',
      prompt: 'Please describe the policy intent'
    })
  }))
}));

const testLogger = {
  info: jest.fn(),
  warn: jest.fn(), 
  error: jest.fn()
} as any;

describe('Policy Operations Core Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set default mock implementations
    mockPolicyInitialize.mockResolvedValue(undefined);
    mockPolicyHealthCheck.mockResolvedValue(true);
    mockStorePolicyIntent.mockResolvedValue(undefined);
    mockGetAllPolicyIntents.mockResolvedValue([]);
    mockGetPolicyIntentsCount.mockResolvedValue(0);
    mockGetPolicyIntent.mockResolvedValue(null);
    mockSearchPolicyIntents.mockResolvedValue([]);
    mockDeletePolicyIntent.mockResolvedValue(undefined);
    mockIsAvailable.mockReturnValue(true);
    mockGetStatus.mockReturnValue({ available: true });
    mockExecuteKubectl.mockResolvedValue(JSON.stringify({ items: [] }));
  });

  describe('getPolicyService', () => {
    it('should create and initialize policy service', async () => {
      const service = await getPolicyService();
      expect(service).toBeDefined();
      expect(mockPolicyInitialize).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockPolicyInitialize.mockRejectedValue(new Error('Collection dimension mismatch'));
      
      await expect(getPolicyService()).rejects.toThrow('Vector DB collection initialization failed');
    });
  });

  describe('findKyvernoPoliciesByPolicyId', () => {
    it('should find deployed Kyverno policies by policy ID', async () => {
      mockExecuteKubectl.mockResolvedValue(JSON.stringify({
        items: [{
          metadata: {
            name: 'test-policy',
            labels: { 'policy-intent/id': 'policy-123' },
            creationTimestamp: '2025-08-31T10:00:00Z'
          }
        }]
      }));

      const policies = await findKyvernoPoliciesByPolicyId('policy-123', testLogger, 'test-request');
      
      expect(policies).toHaveLength(1);
      expect(policies[0].name).toBe('test-policy');
      expect(mockExecuteKubectl).toHaveBeenCalledWith(
        ['get', 'clusterpolicy', '-l', 'policy-intent/id=policy-123', '-o', 'json'],
        { kubeconfig: undefined, timeout: 15000 }
      );
    });

    it('should handle kubectl errors gracefully', async () => {
      mockExecuteKubectl.mockRejectedValue(new Error('Cluster connection failed'));
      
      const policies = await findKyvernoPoliciesByPolicyId('policy-123', testLogger, 'test-request');
      
      expect(policies).toEqual([]);
    });
  });

  describe('deleteKyvernoPoliciesByPolicyId', () => {
    it('should delete Kyverno policies successfully', async () => {
      mockExecuteKubectl.mockResolvedValue('clusterpolicy.kyverno.io/test-policy deleted');
      
      const result = await deleteKyvernoPoliciesByPolicyId('policy-123', testLogger, 'test-request');
      
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(0);
      expect(mockExecuteKubectl).toHaveBeenCalledWith(
        ['delete', 'clusterpolicy', '-l', 'policy-intent/id=policy-123'],
        { kubeconfig: undefined, timeout: 30000 }
      );
    });

    it('should handle deletion errors', async () => {
      mockExecuteKubectl.mockRejectedValue(new Error('Permission denied'));
      
      const result = await deleteKyvernoPoliciesByPolicyId('policy-123', testLogger, 'test-request');
      
      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Permission denied');
    });
  });

  describe('handlePolicyDelete', () => {
    const mockValidateVectorDB = jest.fn().mockResolvedValue({ success: true });
    const mockValidateEmbedding = jest.fn().mockResolvedValue({ success: true });

    it('should delete policy with no deployed Kyverno policies', async () => {
      mockGetPolicyIntent.mockResolvedValue({
        id: 'policy-123',
        description: 'Test policy',
        triggers: ['test'],
        rationale: 'Testing'
      });
      
      mockExecuteKubectl.mockResolvedValue(JSON.stringify({ items: [] }));
      mockDeletePolicyIntent.mockResolvedValue(undefined);

      const result = await handlePolicyDelete(
        'policy-123',
        { getPolicyIntent: mockGetPolicyIntent, deletePolicyIntent: mockDeletePolicyIntent },
        {},
        testLogger,
        'test-request'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('no Kyverno policies to cleanup');
      expect(mockDeletePolicyIntent).toHaveBeenCalledWith('policy-123');
    });

    it('should show confirmation when Kyverno policies exist', async () => {
      mockGetPolicyIntent.mockResolvedValue({
        id: 'policy-456',
        description: 'Resource limits policy',
        triggers: ['resource limits']
      });
      
      mockExecuteKubectl.mockResolvedValue(JSON.stringify({
        items: [{
          metadata: {
            name: 'require-resource-limits',
            labels: { 'policy-intent/id': 'policy-456' }
          }
        }]
      }));

      const result = await handlePolicyDelete(
        'policy-456',
        { getPolicyIntent: mockGetPolicyIntent, deletePolicyIntent: mockDeletePolicyIntent },
        {},
        testLogger,
        'test-request'
      );

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.confirmation.question).toContain('require-resource-limits');
      expect(mockDeletePolicyIntent).not.toHaveBeenCalled();
    });

    it('should handle non-existent policy', async () => {
      mockGetPolicyIntent.mockResolvedValue(null);

      const result = await handlePolicyDelete(
        'non-existent',
        { getPolicyIntent: mockGetPolicyIntent, deletePolicyIntent: mockDeletePolicyIntent },
        {},
        testLogger,
        'test-request'
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Policy intent not found: non-existent');
    });
  });

  describe('handlePolicyDeleteAll', () => {
    it('should delete all policies with no deployed Kyverno policies', async () => {
      mockGetAllPolicyIntents.mockResolvedValue([
        { id: 'policy-1', description: 'Policy 1' },
        { id: 'policy-2', description: 'Policy 2' }
      ]);
      
      mockExecuteKubectl.mockResolvedValue(JSON.stringify({ items: [] }));
      mockDeletePolicyIntent.mockResolvedValue(undefined);

      const result = await handlePolicyDeleteAll(
        { 
          getAllPolicyIntents: mockGetAllPolicyIntents, 
          deletePolicyIntent: mockDeletePolicyIntent 
        },
        {},
        testLogger,
        'test-request'
      );

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.message).toContain('no Kyverno policies to cleanup');
      expect(mockDeletePolicyIntent).toHaveBeenCalledTimes(2);
    });

    it('should handle empty policy list', async () => {
      mockGetAllPolicyIntents.mockResolvedValue([]);

      const result = await handlePolicyDeleteAll(
        { getAllPolicyIntents: mockGetAllPolicyIntents },
        {},
        testLogger,
        'test-request'
      );

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
      expect(result.message).toBe('No policy intents found to delete');
    });
  });

  describe('handlePolicyOperation', () => {
    const mockValidateVectorDB = jest.fn().mockResolvedValue({ success: true });
    const mockValidateEmbedding = jest.fn().mockResolvedValue({ success: true });

    beforeEach(() => {
      mockValidateVectorDB.mockResolvedValue({ success: true });
      mockValidateEmbedding.mockResolvedValue({ success: true });
    });

    it('should handle Vector DB connection failure', async () => {
      mockValidateVectorDB.mockResolvedValue({ 
        success: false, 
        error: { message: 'Vector DB unavailable' } 
      });

      const result = await handlePolicyOperation(
        'list',
        {},
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Vector DB connection required for policy management');
    });

    it('should handle embedding service failure for create operations', async () => {
      mockValidateEmbedding.mockResolvedValue({ 
        success: false, 
        error: { message: 'OpenAI API key required' } 
      });

      const result = await handlePolicyOperation(
        'create',
        {},
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('OpenAI API key required for policy management');
    });

    it('should handle list operation successfully', async () => {
      const mockPolicyIntents = [{
        id: 'policy-1',
        description: 'Test policy',
        triggers: ['test']
      }];

      mockGetAllPolicyIntents.mockResolvedValue(mockPolicyIntents);
      mockGetPolicyIntentsCount.mockResolvedValue(1);

      const result = await handlePolicyOperation(
        'list',
        {},
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(true);
      expect(result.operation).toBe('list');
      expect(result.policyIntents).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });

    it('should handle get operation successfully', async () => {
      const mockPolicyIntent = {
        id: 'policy-123',
        description: 'Test policy',
        triggers: ['test']
      };

      mockGetPolicyIntent.mockResolvedValue(mockPolicyIntent);

      const result = await handlePolicyOperation(
        'get',
        { id: 'policy-123' },
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(true);
      expect(result.policyIntent.id).toBe('policy-123');
      expect(mockGetPolicyIntent).toHaveBeenCalledWith('policy-123');
    });

    it('should handle search operation successfully', async () => {
      const mockSearchResults = [{
        data: {
          id: 'policy-1',
          description: 'Resource limits policy',
          triggers: ['resource limits']
        },
        score: 0.85
      }];

      mockSearchPolicyIntents.mockResolvedValue(mockSearchResults);

      const result = await handlePolicyOperation(
        'search',
        { id: 'resource limits' },
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(true);
      expect(result.searchResults).toHaveLength(1);
      expect(result.searchResults[0].score).toBe(0.85);
    });

    it('should handle unsupported operations', async () => {
      const result = await handlePolicyOperation(
        'unsupported',
        {},
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unsupported operation');
    });
  });
});