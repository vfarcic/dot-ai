/**
 * Tests for Pattern Operations Core Module
 */

import { 
  handlePatternOperation,
  validatePattern,
  createPattern,
  serializePattern,
  deserializePattern
} from '../../src/core/pattern-operations';
import { CreatePatternRequest } from '../../src/core/pattern-types';

// Mock PatternVectorService methods
const mockStorePattern = jest.fn();
const mockSearchPatterns = jest.fn();
const mockGetPattern = jest.fn();
const mockGetAllPatterns = jest.fn();
const mockGetPatternsCount = jest.fn();
const mockDeletePattern = jest.fn();
const mockPatternHealthCheck = jest.fn();
const mockPatternInitialize = jest.fn();
const mockGetSearchMode = jest.fn();

jest.mock('../../src/core/pattern-vector-service', () => ({
  PatternVectorService: jest.fn().mockImplementation(() => ({
    storePattern: mockStorePattern,
    searchPatterns: mockSearchPatterns,
    getPattern: mockGetPattern,
    getAllPatterns: mockGetAllPatterns,
    getPatternsCount: mockGetPatternsCount,
    deletePattern: mockDeletePattern,
    healthCheck: mockPatternHealthCheck,
    initialize: mockPatternInitialize,
    getSearchMode: mockGetSearchMode
  })),
}));

// Mock Vector DB Service
jest.mock('../../src/core/vector-db-service', () => ({
  VectorDBService: jest.fn().mockImplementation(() => ({
    getConfig: jest.fn().mockReturnValue({
      url: 'http://localhost:6333',
      collectionName: 'patterns'
    })
  }))
}));

// Mock unified creation session manager
const mockCreateSession = jest.fn();
const mockLoadSession = jest.fn();
const mockProcessResponse = jest.fn();
const mockGetNextWorkflowStep = jest.fn();

jest.mock('../../src/core/unified-creation-session', () => ({
  UnifiedCreationSessionManager: jest.fn().mockImplementation(() => ({
    createSession: mockCreateSession,
    loadSession: mockLoadSession,
    processResponse: mockProcessResponse,
    getNextWorkflowStep: mockGetNextWorkflowStep
  }))
}));

// Mock session utils
jest.mock('../../src/core/session-utils', () => ({
  getAndValidateSessionDirectory: jest.fn().mockReturnValue('/tmp/test-sessions')
}));

// Mock file system
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  unlinkSync: jest.fn()
}));

const testLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn()
};

describe('Pattern Operations Core Module', () => {
  const validPatternRequest: CreatePatternRequest = {
    description: 'Standard pattern for stateless web applications and APIs',
    triggers: ['stateless app', 'web application', 'API service'],
    suggestedResources: ['Deployment', 'Service', 'HorizontalPodAutoscaler'],
    rationale: 'Provides scalability and reliability for stateless workloads',
    createdBy: 'platform-team'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mocks to working defaults
    mockPatternHealthCheck.mockResolvedValue(true);
    mockPatternInitialize.mockResolvedValue(undefined);
    mockGetAllPatterns.mockResolvedValue([]);
    mockGetPatternsCount.mockResolvedValue(0);
    mockGetSearchMode.mockReturnValue({
      semantic: false,
      provider: null,
      reason: 'OPENAI_API_KEY not set - vector operations will fail'
    });
  });

  describe('Core Pattern Functions', () => {
    it('should validate pattern correctly', () => {
      const errors = validatePattern(validPatternRequest);
      expect(errors).toEqual([]);
    });

    it('should create pattern with valid request', () => {
      const pattern = createPattern(validPatternRequest);
      expect(pattern.description).toBe('Standard pattern for stateless web applications and APIs');
      expect(pattern.triggers).toEqual(['stateless app', 'web application', 'API service']);
      expect(pattern.id).toBeDefined();
      expect(pattern.createdAt).toBeDefined();
    });

    it('should serialize and deserialize patterns correctly', () => {
      const pattern = createPattern(validPatternRequest);
      const json = serializePattern(pattern);
      const deserialized = deserializePattern(json);
      expect(deserialized).toEqual(pattern);
    });
  });

  describe('handlePatternOperation', () => {
    const mockValidateVectorDB = jest.fn();
    const mockValidateEmbedding = jest.fn();

    beforeEach(() => {
      mockValidateVectorDB.mockResolvedValue({ success: true });
      mockValidateEmbedding.mockResolvedValue({ success: true });
    });

    it('should handle list operation successfully', async () => {
      const testPatterns = [
        {
          id: 'test-1',
          description: 'Test pattern 1',
          triggers: ['trigger1'],
          suggestedResources: ['Deployment'],
          rationale: 'Test',
          createdAt: '2024-01-01',
          createdBy: 'test'
        }
      ];

      mockGetAllPatterns.mockResolvedValue(testPatterns);
      mockGetPatternsCount.mockResolvedValue(1);

      const result = await handlePatternOperation(
        'list',
        { limit: 10 },
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(true);
      expect(result.operation).toBe('list');
      expect(result.dataType).toBe('pattern');
      expect(result.data.patterns).toHaveLength(1);
    });

    it('should handle Vector DB connection failure', async () => {
      mockValidateVectorDB.mockResolvedValue({ 
        success: false, 
        error: { message: 'Connection failed' } 
      });

      const result = await handlePatternOperation(
        'list',
        {},
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Connection failed');
    });

    it('should handle embedding service failure for create operation', async () => {
      mockValidateEmbedding.mockResolvedValue({ 
        success: false, 
        error: { message: 'OpenAI key missing' } 
      });

      const result = await handlePatternOperation(
        'create',
        {},
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('OpenAI key missing');
    });

    it('should handle get operation for non-existent pattern', async () => {
      mockGetPattern.mockResolvedValue(null);

      await expect(
        handlePatternOperation(
          'get',
          { id: 'non-existent-id' },
          testLogger,
          'test-request',
          mockValidateVectorDB,
          mockValidateEmbedding
        )
      ).rejects.toThrow('Pattern not found with ID: non-existent-id');
    });

    it('should handle search operation successfully', async () => {
      const searchResults = [
        {
          data: {
            id: 'pattern-1',
            description: 'Test pattern for search',
            triggers: ['search', 'test'],
            suggestedResources: ['Deployment'],
            rationale: 'Test search',
            createdAt: '2024-01-01',
            createdBy: 'test-user'
          },
          score: 0.95
        }
      ];

      mockSearchPatterns.mockResolvedValue(searchResults);

      const result = await handlePatternOperation(
        'search',
        { id: 'search query', limit: 10 },
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(true);
      expect(result.operation).toBe('search');
      expect(result.data.patterns).toHaveLength(1);
      expect(result.data.patterns[0].relevanceScore).toBe(0.95);
    });

    it('should handle delete operation successfully', async () => {
      const mockPattern = {
        id: 'pattern-123',
        description: 'Pattern to delete',
        triggers: ['delete'],
        suggestedResources: ['Deployment'],
        rationale: 'Test deletion',
        createdAt: '2024-01-01',
        createdBy: 'test-user'
      };

      mockGetPattern.mockResolvedValue(mockPattern);
      mockDeletePattern.mockResolvedValue(undefined);

      const result = await handlePatternOperation(
        'delete',
        { id: 'pattern-123' },
        testLogger,
        'test-request',
        mockValidateVectorDB,
        mockValidateEmbedding
      );

      expect(result.success).toBe(true);
      expect(result.operation).toBe('delete');
      expect(result.data.id).toBe('pattern-123');
    });

    it('should require id parameter for get operation', async () => {
      await expect(
        handlePatternOperation(
          'get',
          {},
          testLogger,
          'test-request',
          mockValidateVectorDB,
          mockValidateEmbedding
        )
      ).rejects.toThrow('Pattern ID is required for get operation');
    });

    it('should require search query for search operation', async () => {
      await expect(
        handlePatternOperation(
          'search',
          {},
          testLogger,
          'test-request',
          mockValidateVectorDB,
          mockValidateEmbedding
        )
      ).rejects.toThrow('Search query is required for pattern search operation');
    });

    it('should handle unsupported operation', async () => {
      await expect(
        handlePatternOperation(
          'unsupported',
          {},
          testLogger,
          'test-request',
          mockValidateVectorDB,
          mockValidateEmbedding
        )
      ).rejects.toThrow('Unsupported pattern operation: unsupported');
    });
  });
});