/**
 * Tests for Organizational Data Tool
 */

import { handleOrganizationalDataTool } from '../../src/tools/organizational-data';
import { Logger } from '../../src/core/error-handling';
import { VectorDBService, PatternVectorService } from '../../src/core/index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock the getPatternService function and Vector DB connection validation
const mockHealthCheck = jest.fn().mockResolvedValue(true);
const mockGetAllPatterns = jest.fn().mockResolvedValue([]);
const mockGetPatternsCount = jest.fn().mockResolvedValue(0);
const mockGetPattern = jest.fn().mockResolvedValue(null);
const mockDeletePattern = jest.fn().mockResolvedValue(undefined);
const mockStorePattern = jest.fn().mockResolvedValue(undefined);
const mockInitialize = jest.fn().mockResolvedValue(undefined);
const mockGetSearchMode = jest.fn().mockReturnValue({
  semantic: false,
  provider: null,
  reason: 'OPENAI_API_KEY not set - using keyword-only pattern search'
});

// Mock the imports at the module level
jest.mock('../../src/core/vector-db-service', () => ({
  VectorDBService: jest.fn().mockImplementation(() => ({
    isInitialized: jest.fn().mockReturnValue(true),
    healthCheck: jest.fn().mockResolvedValue(true),
    getConfig: jest.fn().mockReturnValue({
      url: 'http://localhost:6333',
      collectionName: 'patterns'
    })
  }))
}));

jest.mock('../../src/core/pattern-vector-service', () => ({
  PatternVectorService: jest.fn().mockImplementation(() => ({
    healthCheck: mockHealthCheck,
    initialize: mockInitialize,
    getAllPatterns: mockGetAllPatterns,
    getPatternsCount: mockGetPatternsCount,
    getPattern: mockGetPattern,
    deletePattern: mockDeletePattern,
    storePattern: mockStorePattern,
    getSearchMode: mockGetSearchMode
  }))
}));

jest.mock('../../src/core/embedding-service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    isAvailable: jest.fn().mockReturnValue(false),
    getStatus: jest.fn().mockReturnValue({
      available: false,
      provider: null,
      reason: 'OPENAI_API_KEY not set - using keyword-only pattern search'
    })
  }))
}));

// Create a test logger
const testLogger: Logger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn()
};

describe('Organizational Data Tool', () => {
  let testSessionDir: string;

  beforeEach(() => {
    // Create a unique test directory for each test
    testSessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ai-test-'));
    process.env.DOT_AI_SESSION_DIR = testSessionDir;

    // Reset all mocks to default state
    mockHealthCheck.mockResolvedValue(true);
    mockGetAllPatterns.mockResolvedValue([]);
    mockGetPatternsCount.mockResolvedValue(0);
    mockGetPattern.mockResolvedValue(null);
    mockDeletePattern.mockResolvedValue(undefined);
    mockStorePattern.mockResolvedValue(undefined);
    mockInitialize.mockResolvedValue(undefined);
    mockGetSearchMode.mockReturnValue({
      semantic: false,
      provider: null,
      reason: 'OPENAI_API_KEY not set - using keyword-only pattern search'
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testSessionDir)) {
      fs.rmSync(testSessionDir, { recursive: true, force: true });
    }
    delete process.env.DOT_AI_SESSION_DIR;
  });

  describe('Vector DB Connection Requirement', () => {
    it('should return connection required error when Vector DB unavailable', async () => {
      // Mock unhealthy Vector DB
      mockHealthCheck.mockResolvedValue(false);

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Vector DB connection required for pattern management');
      expect(response.error.setup.selfHosted.docker).toContain('docker run');
      expect(response.error.setup.saas.signup).toContain('cloud.qdrant.io');
      expect(response.error.setup.saas.environment.some((env: string) => env.includes('QDRANT_URL'))).toBe(true);
      expect(response.error.setup.saas.environment.some((env: string) => env.includes('QDRANT_API_KEY'))).toBe(true);
    });
  });

  describe('Pattern Operations', () => {
    it('should start pattern creation workflow when create operation called', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'create'
        },
        null,
        testLogger,
        'test-request-1'
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('create');
      expect(response.dataType).toBe('pattern');
      expect(response.workflow).toBeDefined();
      expect(response.workflow.step).toBe('description');
      expect(response.workflow.prompt).toContain('What deployment capability does this pattern provide');
    });

    it('should progress through workflow with user responses', async () => {
      // Start workflow
      const startResult = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'create'
        },
        null,
        testLogger,
        'test-request-1'
      );
      
      const startResponse = JSON.parse(startResult.content[0].text);
      const sessionId = startResponse.workflow.sessionId;

      // Step 1: Provide description
      const step1Result = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'create',
          sessionId: sessionId,
          response: 'Horizontal scaling'
        },
        null,
        testLogger,
        'test-request-2'
      );
      
      const step1Response = JSON.parse(step1Result.content[0].text);
      expect(step1Response.workflow.step).toBe('triggers');
      expect(step1Response.workflow.prompt).toContain('What keywords or phrases should trigger this pattern');
    });

    it('should list patterns (empty initially)', async () => {
      const listResult = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-1'
      );

      const response = JSON.parse(listResult.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.data.patterns).toHaveLength(0);
      expect(response.data.totalCount).toBe(0);
      expect(response.data.searchCapabilities).toBeDefined();
      expect(response.data.searchCapabilities.semantic).toBe(false);
      expect(response.data.searchCapabilities.mode).toBe('keyword-only search');
      expect(response.message).toContain('keyword-only');
    });

    it('should handle errors for non-existent pattern get requests', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'get',
          id: 'non-existent-id'
        },
        null,
        testLogger,
        'test-request-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Pattern not found');
    });

    it('should handle missing required parameters', async () => {
      const result = await handleOrganizationalDataTool(
        {
          // Missing dataType and operation
        },
        null,
        testLogger,
        'test-request-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('dataType parameter is required');
    });

    it('should clean up session file after successful Vector DB storage', async () => {
      // Start workflow
      const startResult = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'create'
        },
        null,
        testLogger,
        'test-request-1'
      );
      
      const startResponse = JSON.parse(startResult.content[0].text);
      const sessionId = startResponse.workflow.sessionId;

      // Verify session file exists
      const sessionFile = path.join(testSessionDir, 'pattern-sessions', `${sessionId}.json`);
      expect(fs.existsSync(sessionFile)).toBe(true);

      // Complete the workflow with all required steps
      let currentResponse = startResponse;
      const responses = [
        'Horizontal scaling',        // description
        'scale, scaling, horizontal', // triggers
        'scale, scaling, horizontal, autoscale, hpa', // trigger expansion
        'Deployment, HorizontalPodAutoscaler',       // resources
        'HPA automatically scales pods based on metrics', // rationale
        'test-user',                // created-by
        'confirm'                   // review confirmation
      ];

      for (let i = 0; i < responses.length; i++) {
        const result = await handleOrganizationalDataTool(
          {
            dataType: 'pattern',
            operation: 'create',
            sessionId: sessionId,
            response: responses[i]
          },
          null,
          testLogger,
          `test-request-${i + 2}`
        );
        currentResponse = JSON.parse(result.content[0].text);
      }

      // Final result should be successful
      expect(currentResponse.success).toBe(true);
      expect(currentResponse.message).toContain('Pattern created successfully');
      expect(currentResponse.storage.stored).toBe(true);

      // Session file should be cleaned up after successful storage
      expect(fs.existsSync(sessionFile)).toBe(false);
    });

    it('should handle Vector DB initialization failures with helpful error', async () => {
      // Mock PatternVectorService constructor to throw initialization error
      const mockPatternVectorService = require('../../src/core/pattern-vector-service').PatternVectorService;
      mockPatternVectorService.mockImplementation(() => ({
        initialize: jest.fn().mockRejectedValue(new Error('Dimension mismatch detected')),
        healthCheck: mockHealthCheck,
        getAllPatterns: mockGetAllPatterns
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Vector DB collection initialization failed');
      expect(response.error.message).toContain('dimension mismatch');
    });

  });

  describe('Extended Data Types - Capabilities', () => {
    it('should return "coming soon" for capabilities create operation', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'create'
        },
        null,
        testLogger,
        'test-request-capabilities-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('create');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Resource capabilities management not yet implemented');
      expect(response.error.details).toContain('PRD #48');
      expect(response.error.implementationPlan.prd).toBe('PRD #48');
      expect(response.error.implementationPlan.expectedFeatures).toContain('Cluster resource scanning');
      expect(response.message).toContain('PRD #48 implementation');
    });

    it('should return "coming soon" for capabilities scan operation', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-capabilities-2'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.status).toBe('coming-soon');
    });

    it('should return "coming soon" for capabilities analyze with resource', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'analyze',
          resource: {
            kind: 'SQL',
            group: 'devopstoolkit.live',
            apiVersion: 'devopstoolkit.live/v1beta1'
          }
        },
        null,
        testLogger,
        'test-request-capabilities-3'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('analyze');
      expect(response.error.implementationPlan.expectedFeatures).toContain('Semantic resource matching');
    });
  });

  describe('Extended Data Types - Dependencies', () => {
    it('should return "coming soon" for dependencies create operation', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'dependencies',
          operation: 'create'
        },
        null,
        testLogger,
        'test-request-dependencies-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('create');
      expect(response.dataType).toBe('dependencies');
      expect(response.error.message).toContain('Resource dependencies management not yet implemented');
      expect(response.error.details).toContain('PRD #49');
      expect(response.error.implementationPlan.prd).toBe('PRD #49');
      expect(response.error.implementationPlan.expectedFeatures).toContain('Dependency relationship discovery');
      expect(response.message).toContain('PRD #49 implementation');
    });

    it('should return "coming soon" for dependencies scan operation', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'dependencies',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-dependencies-2'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('dependencies');
      expect(response.error.status).toBe('coming-soon');
    });

    it('should return "coming soon" for dependencies analyze with resource', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'dependencies',
          operation: 'analyze',
          resource: {
            kind: 'Server',
            group: 'dbforpostgresql.azure.upbound.io',
            apiVersion: 'dbforpostgresql.azure.upbound.io/v1beta1'
          }
        },
        null,
        testLogger,
        'test-request-dependencies-3'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('analyze');
      expect(response.error.implementationPlan.expectedFeatures).toContain('Complete solution assembly');
      expect(response.error.implementationPlan.expectedFeatures).toContain('Deployment order optimization');
    });
  });

  describe('Extended Schema Validation', () => {
    it('should reject unsupported data types', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'unsupported',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-invalid-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Unsupported data type: unsupported');
      expect(response.error.message).toContain('pattern, capabilities, dependencies');
    });

    it('should route pattern operations to pattern handler (not capabilities/dependencies)', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-pattern-routing'
      );

      // Should route to pattern handler, not return "coming soon" message
      const response = JSON.parse(result.content[0].text);
      const errorMessage = response.error?.message || '';
      const errorDetails = response.error?.details || '';
      expect(errorMessage).not.toContain('not yet implemented');
      expect(errorDetails).not.toContain('PRD #');
      // Pattern operations go to handlePatternOperation, not capabilities/dependencies handlers
    });
  });

  describe('Embedding Service Validation', () => {
    it('should fail pattern create operation when OpenAI key missing', async () => {
      // Clear environment to simulate missing OPENAI_API_KEY
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'create'
        },
        null,
        testLogger,
        'test-request-embedding-error-create'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('create');
      expect(response.dataType).toBe('pattern');
      expect(response.error.message).toBe('OpenAI API key required for pattern management');
      expect(response.error.setup.required).toContain('export OPENAI_API_KEY=');
      expect(response.error.currentConfig.OPENAI_API_KEY).toBe('not set');
      expect(response.message).toBe('OpenAI API key required for pattern management');

      // Restore original environment
      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    });

    it('should fail pattern list operation when OpenAI key missing', async () => {
      // Clear environment to simulate missing OPENAI_API_KEY
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-embedding-error-list'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('list');
      expect(response.dataType).toBe('pattern');
      expect(response.error.message).toBe('OpenAI API key required for pattern management');
      expect(response.error.details).toContain('Pattern management requires OpenAI embeddings');
      expect(response.error.setup.docs).toContain('https://platform.openai.com/api-keys');

      // Restore original environment
      if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    });

    it('should succeed when embedding service is available', async () => {
      // Set environment to simulate available OPENAI_API_KEY
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-api-key';

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-embedding-success'
      );

      const response = JSON.parse(result.content[0].text);
      // Should succeed when OpenAI key is available
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.dataType).toBe('pattern');

      // Restore original environment
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });
  });
});