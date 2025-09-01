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
  reason: 'OPENAI_API_KEY not set - vector operations will fail'
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

// Mock functions that can be updated per test
const mockIsAvailable = jest.fn();
const mockGetStatus = jest.fn();

jest.mock('../../src/core/embedding-service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    isAvailable: mockIsAvailable,
    getStatus: mockGetStatus
  }))
}));

// Policy mocks moved to tests/core/policy-operations.test.ts

// Mock CapabilityVectorService
jest.mock('../../src/core/capability-vector-service', () => ({
  CapabilityVectorService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue(true), // Add healthCheck for upfront validation
    storeCapability: jest.fn().mockResolvedValue(undefined),
    getCapability: jest.fn().mockResolvedValue({
      resourceName: 'test.resource',
      capabilities: ['test'],
      providers: ['azure'],
      complexity: 'low',
      confidence: 85
    }),
    getAllCapabilities: jest.fn().mockResolvedValue([]),
    getCapabilitiesCount: jest.fn().mockResolvedValue(0),
    searchCapabilities: jest.fn().mockResolvedValue([])
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
  let mockExecuteKubectl: jest.MockedFunction<any>;

  beforeEach(() => {
    // Create a unique test directory for each test
    testSessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-ai-test-'));
    
    // Get reference to mocked kubectl function
    mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
    
    // Set test session directory (this is OK since it's test-specific)
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
      reason: 'OPENAI_API_KEY not set - vector operations will fail'
    });

    // Reset embedding service mocks to default (available) state - always available in tests
    mockIsAvailable.mockReturnValue(true);
    mockGetStatus.mockReturnValue({
      available: true,
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536
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
    delete process.env.OPENAI_API_KEY;
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
      expect(step1Response.workflow.prompt).toContain('What types of infrastructure should this apply to');
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
      // Mock PatternVectorService to fail health check (new error handling approach)
      const mockPatternVectorService = require('../../src/core/pattern-vector-service').PatternVectorService;
      mockPatternVectorService.mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(false),
        getAllPatterns: mockGetAllPatterns,
        getPatternsCount: mockGetPatternsCount,
        getPattern: mockGetPattern,
        deletePattern: mockDeletePattern,
        storePattern: mockStorePattern,
        getSearchMode: mockGetSearchMode
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
      expect(response.error.message).toContain('Vector DB connection required');
      expect(response.message).toContain('Vector DB connection required for pattern management');
    });

  });

  describe('Extended Data Types - Capabilities', () => {
    it('should return error for unsupported capabilities create operation', async () => {
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
      expect(response.error.message).toContain('Unsupported capabilities operation');
      expect(response.error.supportedOperations).toContain('scan');
    });


    it('should return error for unsupported capabilities analyze operation', async () => {
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
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Unsupported capabilities operation');
      expect(response.error.supportedOperations).toContain('scan');
    });




    it('should successfully list capabilities (now implemented)', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-capabilities-7'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.dataType).toBe('capabilities');
      expect(response.data).toBeDefined();
      expect(response.data.capabilities).toBeDefined();
      expect(response.data.returnedCount).toBe(0); // Mock returns empty array
      
      // Test comprehensive client display instructions for list operation
      expect(response.clientInstructions).toBeDefined();
      expect(response.clientInstructions.behavior).toContain('Display capability list with IDs prominently visible');
      expect(response.clientInstructions.requirement).toContain('Each capability must show: ID, resource name, main capabilities, and description');
      expect(response.clientInstructions.format).toContain('List format with ID clearly labeled');
      expect(response.clientInstructions.prohibit).toContain('Do not hide or omit capability IDs from the display');
    });

    it('should format capability list data with user-friendly summary objects', async () => {
      // Mock capabilities with sample data to test data formatting
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        getAllCapabilities: jest.fn().mockResolvedValue([
          {
            id: 'test-id-123',
            resourceName: 'test.resource.example',
            capabilities: ['database', 'postgresql'],
            description: 'This is a very long description that should be truncated because it exceeds 100 characters and we want to test the truncation functionality',
            complexity: 'medium',
            confidence: 0.85,
            analyzedAt: '2025-01-01T12:00:00Z'
          }
        ]),
        getCapabilitiesCount: jest.fn().mockResolvedValue(1)
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-capabilities-formatting'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.capabilities).toBeDefined();
      expect(response.data.capabilities).toHaveLength(1);
      
      const capability = response.data.capabilities[0];
      expect(capability.id).toBe('test-id-123');
      expect(capability.resourceName).toBe('test.resource.example');
      expect(capability.capabilities).toEqual(['database', 'postgresql']);
      expect(capability.complexity).toBe('medium');
      expect(capability.confidence).toBe(0.85);
      expect(capability.analyzedAt).toBe('2025-01-01T12:00:00Z');
      
      // Test description truncation
      expect(capability.description.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(capability.description).toContain('...');
      
      // Test metadata structure
      expect(response.data.totalCount).toBe(1);
      expect(response.data.returnedCount).toBe(1);
      expect(response.data.limit).toBeDefined();
    });

    it('should return error for capabilities get operation without id parameter', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'get'
          // Missing id parameter
        },
        null,
        testLogger,
        'test-request-capabilities-8'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('get');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Missing required parameter: id');
    });

    it('should successfully get capability with id parameter', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'get',
          id: 'test-capability-id'
        },
        null,
        testLogger,
        'test-request-capabilities-9'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('get');
      expect(response.dataType).toBe('capabilities');
      expect(response.data.resourceName).toBe('test.resource');
      expect(response.data.capabilities).toEqual(['test']);
      
      // Test client display instructions for get operation
      expect(response.clientInstructions).toBeDefined();
      expect(response.clientInstructions.behavior).toContain('Display comprehensive capability details in organized sections');
      expect(response.clientInstructions.requirement).toContain('Show resource name, capabilities, providers, complexity');
      expect(response.clientInstructions.format).toContain('Structured display with clear sections');
      expect(response.clientInstructions.sections).toBeDefined();
      expect(response.clientInstructions.sections.resourceInfo).toContain('Resource name and description');
      expect(response.clientInstructions.sections.capabilities).toContain('List all capabilities, providers, and abstractions');
      expect(response.clientInstructions.sections.technicalDetails).toContain('Complexity level and provider');
      expect(response.clientInstructions.sections.analysisResults).toContain('Confidence score, analysis timestamp');
    });

    it('should return error for capabilities delete operation without id parameter', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'delete'
          // Missing id parameter
        },
        null,
        testLogger,
        'test-request-capabilities-delete-no-id'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('delete');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Missing required parameter: id');
    });

    it('should return error when trying to delete non-existent capability', async () => {
      // Mock capability service to return null for getCapability
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        getCapability: jest.fn().mockResolvedValue(null), // Capability not found
        deleteCapabilityById: jest.fn().mockResolvedValue(undefined)
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'delete',
          id: 'non-existent-capability-id'
        },
        null,
        testLogger,
        'test-request-capabilities-delete-not-found'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('delete');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Capability not found for ID: non-existent-capability-id');
    });

    it('should successfully delete capability with valid id', async () => {
      // Mock capability service
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        getCapability: jest.fn().mockResolvedValue({
          resourceName: 'test.resource.example',
          capabilities: ['test'],
          providers: ['azure'],
          complexity: 'low',
          confidence: 85
        }),
        deleteCapabilityById: jest.fn().mockResolvedValue(undefined)
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'delete',
          id: 'test-capability-id'
        },
        null,
        testLogger,
        'test-request-capabilities-delete-success'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('delete');
      expect(response.dataType).toBe('capabilities');
      expect(response.message).toContain('Capability deleted: test.resource.example');
      expect(response.deletedCapability.id).toBe('test-capability-id');
      expect(response.deletedCapability.resourceName).toBe('test.resource.example');
    });

    it('should efficiently delete all capabilities using collection recreation', async () => {
      // Mock capability service with efficient deleteAllCapabilities method
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      const mockDeleteAllCapabilities = jest.fn().mockResolvedValue(undefined);
      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        getCapabilitiesCount: jest.fn().mockResolvedValue(2),
        deleteAllCapabilities: mockDeleteAllCapabilities
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'deleteAll'
        },
        null,
        testLogger,
        'test-request-capabilities-delete-all'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('deleteAll');
      expect(response.dataType).toBe('capabilities');
      expect(response.deletedCount).toBe(2);
      expect(response.totalCount).toBe(2);
      expect(response.errorCount).toBe(0);
      expect(response.message).toContain('Successfully deleted all 2 capabilities');
      expect(response.confirmation).toContain('All capability data has been permanently removed');
      expect(response.method).toContain('Efficient collection recreation');
      
      // Verify efficient method was called (no individual record retrieval/deletion)
      expect(mockDeleteAllCapabilities).toHaveBeenCalledTimes(1);
    });

    it('should handle deleteAll when no capabilities exist', async () => {
      // Mock capability service with no capabilities (no deleteAllCapabilities needed)
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        getCapabilitiesCount: jest.fn().mockResolvedValue(0)
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'deleteAll'
        },
        null,
        testLogger,
        'test-request-capabilities-delete-all-empty'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('deleteAll');
      expect(response.dataType).toBe('capabilities');
      expect(response.deletedCount).toBe(0);
      expect(response.message).toContain('No capabilities found to delete');
    });

    it('should provide immediate error feedback when Vector DB is unavailable', async () => {
      // Mock capability service to return unhealthy Vector DB
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(false), // Vector DB unhealthy
        storeCapability: jest.fn().mockResolvedValue(undefined),
        getCapability: jest.fn().mockResolvedValue(null),
        getAllCapabilities: jest.fn().mockResolvedValue([]),
        getCapabilitiesCount: jest.fn().mockResolvedValue(0),
        searchCapabilities: jest.fn().mockResolvedValue([])
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-capabilities-vector-db-fail'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Vector DB (Qdrant) connection required');
      expect(response.error.setup.docker).toBe('docker run -p 6333:6333 qdrant/qdrant');
      expect(response.error.currentConfig.status).toBe('connection failed');
    });

    it('should provide immediate error feedback when Vector DB connection fails', async () => {
      // Mock capability service to throw connection error
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockRejectedValue(new Error('Connection refused')), // Connection error
        storeCapability: jest.fn().mockResolvedValue(undefined),
        getCapability: jest.fn().mockResolvedValue(null),
        getAllCapabilities: jest.fn().mockResolvedValue([]),
        getCapabilitiesCount: jest.fn().mockResolvedValue(0),
        searchCapabilities: jest.fn().mockResolvedValue([])
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-capabilities-connection-error'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Vector DB (Qdrant) connection failed');
      expect(response.error.technicalDetails).toBe('Connection refused');
      expect(response.error.setup.docker).toBe('docker run -p 6333:6333 qdrant/qdrant');
    });

    it('should provide immediate error feedback when OpenAI API is unavailable', async () => {
      // Mock embedding service to be unavailable
      mockIsAvailable.mockReturnValueOnce(false);
      mockGetStatus.mockReturnValueOnce({
        available: false,
        reason: 'OPENAI_API_KEY not set',
        model: null,
        provider: null
      });

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-capabilities-openai-fail'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('capabilities');
      // Verify it's checking for OpenAI API - exact message may vary from validateEmbeddingService
      expect(response.error.message).toContain('OpenAI API');
      expect(response.error.setup || response.error.currentConfig).toBeDefined(); // Should have setup guidance
    });





    it('should handle progress operation to query scan status', async () => {
      // Test progress query functionality by creating a session file manually
      
      const sessionId = 'test-progress-session-123';
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      // Set up test session directory
      const sessionDir = path.join(os.tmpdir(), '.dot-ai-test-progress');
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      // Set environment variable for session directory
      const originalSessionDir = process.env.DOT_AI_SESSION_DIR;
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      // Create capability-sessions subdirectory
      const sessionSubDir = path.join(sessionDir, 'capability-sessions');
      if (!fs.existsSync(sessionSubDir)) {
        fs.mkdirSync(sessionSubDir, { recursive: true });
      }
      
      const sessionFilePath = path.join(sessionSubDir, `${sessionId}.json`);
      const testSessionData = {
        sessionId,
        currentStep: 'resource-selection',
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
      
      fs.writeFileSync(sessionFilePath, JSON.stringify(testSessionData, null, 2));
      
      try {
        // Test progress query for the created session
        const progressResult = await handleOrganizationalDataTool(
          {
            dataType: 'capabilities',
            operation: 'progress',
            sessionId
          },
          null,
          testLogger,
          'test-progress-query'
        );

        const progressResponse = JSON.parse(progressResult.content[0].text);
        
        // Should succeed and provide session information
        expect(progressResponse.success).toBe(true);
        expect(progressResponse.operation).toBe('progress');
        expect(progressResponse.dataType).toBe('capabilities');
        expect(progressResponse.sessionId).toBe(sessionId);
        
        // Should indicate no progress data but session exists
        expect(progressResponse.status).toBe('no-progress-data');
        expect(progressResponse.currentStep).toBe('resource-selection');
        expect(progressResponse.startedAt).toBeDefined();
        expect(progressResponse.lastActivity).toBeDefined();

        // Should not have client instructions for no-progress state
        expect(progressResponse.clientInstructions).toBeUndefined();
        
      } finally {
        // Clean up test session file and restore environment
        if (fs.existsSync(sessionFilePath)) {
          fs.unlinkSync(sessionFilePath);
        }
        // Remove subdirectory first, then main directory
        if (fs.existsSync(sessionSubDir)) {
          fs.rmdirSync(sessionSubDir);
        }
        if (fs.existsSync(sessionDir)) {
          fs.rmdirSync(sessionDir);
        }
        
        // Restore original environment variable
        if (originalSessionDir) {
          process.env.DOT_AI_SESSION_DIR = originalSessionDir;
        } else {
          delete process.env.DOT_AI_SESSION_DIR;
        }
      }
    });

    it('should auto-discover latest session when no sessionId provided', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      // Set up test session directory
      const sessionDir = path.join(os.tmpdir(), '.dot-ai-test-autodiscover');
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      // Set environment variable for session directory
      const originalSessionDir = process.env.DOT_AI_SESSION_DIR;
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      // Create capability-sessions subdirectory
      const sessionSubDir = path.join(sessionDir, 'capability-sessions');
      if (!fs.existsSync(sessionSubDir)) {
        fs.mkdirSync(sessionSubDir, { recursive: true });
      }
      
      // Create multiple session files with different timestamps
      const session1Id = 'test-session-old';
      const session2Id = 'test-session-recent';
      
      const oldSessionData = {
        sessionId: session1Id,
        currentStep: 'complete',
        startedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        lastActivity: new Date(Date.now() - 3600000).toISOString()
      };
      
      const recentSessionData = {
        sessionId: session2Id,
        currentStep: 'resource-selection',
        startedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
        lastActivity: new Date().toISOString()
      };
      
      const oldSessionPath = path.join(sessionSubDir, `${session1Id}.json`);
      const recentSessionPath = path.join(sessionSubDir, `${session2Id}.json`);
      
      // Write old session first
      fs.writeFileSync(oldSessionPath, JSON.stringify(oldSessionData, null, 2));
      
      // Wait a small amount to ensure different mtime
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Write recent session after delay
      fs.writeFileSync(recentSessionPath, JSON.stringify(recentSessionData, null, 2));
      
      try {
        
        const result = await handleOrganizationalDataTool(
          {
            dataType: 'capabilities',
            operation: 'progress'
            // No sessionId provided - should auto-discover latest
          },
          null,
          testLogger,
          'test-progress-autodiscover'
        );

        const response = JSON.parse(result.content[0].text);
        
        // Should succeed and use the most recent session
        expect(response.success).toBe(true);
        expect(response.operation).toBe('progress');
        expect(response.sessionId).toBe(session2Id); // Should pick the most recent session
        expect(response.status).toBe('no-progress-data'); // Since no actual progress data
        expect(response.currentStep).toBe('resource-selection');
        
      } finally {
        // Clean up
        [oldSessionPath, recentSessionPath].forEach(filePath => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
        
        // Remove subdirectory first, then main directory
        if (fs.existsSync(sessionSubDir)) {
          fs.rmdirSync(sessionSubDir);
        }
        if (fs.existsSync(sessionDir)) {
          fs.rmdirSync(sessionDir);
        }
        
        // Restore environment
        if (originalSessionDir) {
          process.env.DOT_AI_SESSION_DIR = originalSessionDir;
        } else {
          delete process.env.DOT_AI_SESSION_DIR;
        }
      }
    });

    it('should return error when no sessions exist and no sessionId provided', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      // Set up empty test session directory
      const sessionDir = path.join(os.tmpdir(), '.dot-ai-test-no-sessions');
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      // Set environment variable for session directory
      const originalSessionDir = process.env.DOT_AI_SESSION_DIR;
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      try {
        const result = await handleOrganizationalDataTool(
          {
            dataType: 'capabilities',
            operation: 'progress'
          },
          null,
          testLogger,
          'test-progress-no-sessions'
        );

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(false);
        expect(response.operation).toBe('progress');
        expect(response.error.message).toContain('No capability scan sessions found');
        
      } finally {
        // Clean up
        if (fs.existsSync(sessionDir)) {
          fs.rmdirSync(sessionDir);
        }
        
        // Restore environment
        if (originalSessionDir) {
          process.env.DOT_AI_SESSION_DIR = originalSessionDir;
        } else {
          delete process.env.DOT_AI_SESSION_DIR;
        }
      }
    });

    it('should include client instructions for readable progress formatting', async () => {
      // Test that active progress includes client formatting instructions
      const sessionId = 'test-progress-formatting-123';
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const sessionDir = path.join(os.tmpdir(), '.dot-ai-test-formatting');
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      const originalSessionDir = process.env.DOT_AI_SESSION_DIR;
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      const sessionSubDir = path.join(sessionDir, 'capability-sessions');
      if (!fs.existsSync(sessionSubDir)) {
        fs.mkdirSync(sessionSubDir, { recursive: true });
      }
      
      const sessionFilePath = path.join(sessionSubDir, `${sessionId}.json`);
      const testSessionData = {
        sessionId,
        currentStep: 'scanning',
        startedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        progress: {
          status: 'processing',
          current: 8,
          total: 415,
          percentage: 2,
          currentResource: 'PersistentVolumeClaim',
          startedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          estimatedTimeRemaining: '26.6 minutes'
        }
      };
      
      fs.writeFileSync(sessionFilePath, JSON.stringify(testSessionData, null, 2));
      
      try {
        const result = await handleOrganizationalDataTool(
          {
            dataType: 'capabilities',
            operation: 'progress',
            sessionId
          },
          null,
          testLogger,
          'test-progress-formatting'
        );

        const response = JSON.parse(result.content[0].text);
        
        expect(response.success).toBe(true);
        expect(response.operation).toBe('progress');
        expect(response.progress.status).toBe('processing');
        
        // Verify client instructions for readable formatting are included
        expect(response.clientInstructions).toBeDefined();
        expect(response.clientInstructions.behavior).toContain('clean, readable format');
        expect(response.clientInstructions.requirement).toContain('separate lines');
        expect(response.clientInstructions.format).toContain('Status line, current resource line');
        expect(response.clientInstructions.example).toContain('Progress: X/Y resources');
        expect(response.clientInstructions.prohibit).toContain('single line');
        
      } finally {
        // Clean up
        if (fs.existsSync(sessionFilePath)) {
          fs.unlinkSync(sessionFilePath);
        }
        if (fs.existsSync(sessionSubDir)) {
          fs.rmdirSync(sessionSubDir);
        }
        if (fs.existsSync(sessionDir)) {
          fs.rmdirSync(sessionDir);
        }
        
        if (originalSessionDir) {
          process.env.DOT_AI_SESSION_DIR = originalSessionDir;
        } else {
          delete process.env.DOT_AI_SESSION_DIR;
        }
      }
    });

    it('should return error for progress query with non-existent session', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'progress',
          sessionId: 'non-existent-session-id'
        },
        null,
        testLogger,
        'test-progress-not-found'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('progress');
      expect(response.error.message).toContain('Session not found');
      expect(response.error.details).toContain('non-existent-session-id');
    });

    it('should return error for invalid resource selection response', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'resource-selection',
          sessionId: 'cap-scan-12345',
          response: 'invalid-response'
        },
        null,
        testLogger,
        'test-request-capabilities-9'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Invalid resource selection response');
      expect(response.error.details).toContain('Expected \'all\' or \'specific\'');
    });

    it('should validate step parameter and provide error recovery', async () => {
      // Start a workflow to get a session
      const startResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-step-validation-1'
      );

      const startResponse = JSON.parse(startResult.content[0].text);
      const sessionId = startResponse.workflow.sessionId;

      // Try to call wrong step
      const wrongStepResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'processing-mode', // Wrong step - should be 'resource-selection'
          sessionId,
          response: 'auto'
        },
        null,
        testLogger,
        'test-step-validation-2'
      );

      const wrongStepResponse = JSON.parse(wrongStepResult.content[0].text);
      expect(wrongStepResponse.success).toBe(false);
      expect(wrongStepResponse.error.message).toBe('Step validation failed');
      expect(wrongStepResponse.error.details).toContain('you\'re on step \'resource-selection\'');
      expect(wrongStepResponse.error.details).toContain('but called with step \'processing-mode\'');
      expect(wrongStepResponse.error.currentStep).toBe('resource-selection');
      expect(wrongStepResponse.error.expectedCall).toContain('Call with step=\'resource-selection\'');
    });

    it('should require step parameter and reject calls without it', async () => {
      // Start a workflow
      const startResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-step-required-1'
      );

      const startResponse = JSON.parse(startResult.content[0].text);
      const sessionId = startResponse.workflow.sessionId;

      // Call without step parameter (should fail)
      const noStepResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          sessionId,
          response: 'all'
        },
        null,
        testLogger,
        'test-step-required-2'
      );

      const noStepResponse = JSON.parse(noStepResult.content[0].text);
      expect(noStepResponse.success).toBe(false);
      expect(noStepResponse.error.message).toBe('Step validation failed');
      expect(noStepResponse.error.details).toContain('Step parameter is required');
      expect(noStepResponse.error.details).toContain('currently on step \'resource-selection\'');
      expect(noStepResponse.error.expectedCall).toContain('Call with step=\'resource-selection\'');
    });

    // Capability Search Tests
    it('should successfully search capabilities with query in id field', async () => {
      // Mock capability service with search results
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      const mockSearchResults = [
        {
          score: 0.95,
          data: {
            id: 'capability-sqls-devopstoolkit-live',
            resourceName: 'sqls.devopstoolkit.live',
            capabilities: ['postgresql', 'mysql', 'database'],
            providers: ['azure', 'aws', 'gcp'],
            complexity: 'low',
            description: 'Managed database solution supporting multiple engines',
            useCase: 'Simple database deployment without infrastructure complexity',
            confidence: 90,
            analyzedAt: '2025-08-06T10:30:00.000Z'
          }
        },
        {
          score: 0.87,
          data: {
            id: 'capability-servers-postgresql-azure',
            resourceName: 'servers.postgresql.azure',
            capabilities: ['postgresql', 'azure', 'database'],
            providers: ['azure'],
            complexity: 'medium',
            description: 'Azure PostgreSQL database service',
            useCase: 'Azure-specific PostgreSQL deployment',
            confidence: 85,
            analyzedAt: '2025-08-06T10:30:00.000Z'
          }
        }
      ];

      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        searchCapabilities: jest.fn().mockResolvedValue(mockSearchResults)
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'search',
          id: 'postgresql database in azure'
        },
        null,
        testLogger,
        'test-request-capability-search-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('search');
      expect(response.dataType).toBe('capabilities');
      expect(response.data.query).toBe('postgresql database in azure');
      expect(response.data.results).toHaveLength(2);
      expect(response.data.results[0].rank).toBe(1);
      expect(response.data.results[0].score).toBe(0.95);
      expect(response.data.results[0].resourceName).toBe('sqls.devopstoolkit.live');
      expect(response.data.results[0].capabilities).toEqual(['postgresql', 'mysql', 'database']);
      expect(response.message).toContain('Found 2 capabilities matching "postgresql database in azure"');
    });

    it('should require search query in id field for search operation', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'search'
          // Missing id field with query
        },
        null,
        testLogger,
        'test-request-capability-search-no-query'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('search');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toBe('Search query required');
      expect(response.error.details).toContain('The id field must contain a search query');
    });

    it('should reject empty search query for search operation', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'search',
          id: '   ' // Empty/whitespace query
        },
        null,
        testLogger,
        'test-request-capability-search-empty-query'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('search');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toBe('Search query required');
      expect(response.error.details).toContain('The id field must contain a search query');
    });

    it('should handle search with limit parameter', async () => {
      // Mock capability service with more results than limit
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      const mockSearchResults = [
        {
          score: 0.90,
          data: {
            id: 'capability-storage-azure',
            resourceName: 'storageaccounts.azure',
            capabilities: ['storage', 'azure'],
            providers: ['azure'],
            complexity: 'medium',
            description: 'Azure storage account',
            useCase: 'Cloud storage for applications',
            confidence: 88,
            analyzedAt: '2025-08-06T10:30:00.000Z'
          }
        }
      ];

      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        searchCapabilities: jest.fn().mockImplementation((query, options) => {
          expect(options.limit).toBe(5); // Verify limit passed through
          return Promise.resolve(mockSearchResults.slice(0, options.limit));
        })
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'search',
          id: 'azure storage',
          limit: 5
        },
        null,
        testLogger,
        'test-request-capability-search-with-limit'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.limit).toBe(5);
      expect(response.data.results).toHaveLength(1);
    });

    it('should return no results when no capabilities match search query', async () => {
      // Mock capability service with no results
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        searchCapabilities: jest.fn().mockResolvedValue([])
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'search',
          id: 'nonexistent capability type'
        },
        null,
        testLogger,
        'test-request-capability-search-no-results'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('search');
      expect(response.data.results).toHaveLength(0);
      expect(response.message).toContain('Found 0 capabilities matching "nonexistent capability type"');
    });

    it('should provide comprehensive client instructions for search results', async () => {
      // Mock capability service with search results
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      const mockSearchResults = [
        {
          score: 0.85,
          data: {
            id: 'capability-test-resource',
            resourceName: 'tests.example.com',
            capabilities: ['testing', 'validation'],
            providers: ['aws'],
            complexity: 'low',
            description: 'Test resource for validation',
            useCase: 'Testing and validation scenarios',
            confidence: 80,
            analyzedAt: '2025-08-06T10:30:00.000Z'
          }
        }
      ];

      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        searchCapabilities: jest.fn().mockResolvedValue(mockSearchResults)
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'search',
          id: 'testing capabilities'
        },
        null,
        testLogger,
        'test-request-capability-search-client-instructions'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.clientInstructions).toBeDefined();
      expect(response.clientInstructions.behavior).toBe('Display search results with relevance scores and capability details');
      expect(response.clientInstructions.sections.searchSummary).toBe('Show query and result count prominently');
      expect(response.clientInstructions.sections.resultsList).toBe('Display each result with rank, score, resource name, and capabilities');
      expect(response.clientInstructions.format).toBe('Ranked list with scores (higher scores = better matches)');
      expect(response.clientInstructions.emphasize).toBe('Resource names and main capabilities for easy scanning');
    });

    it('should handle search operation errors gracefully', async () => {
      // Mock capability service to throw error during search
      const MockCapabilityVectorService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      MockCapabilityVectorService.mockImplementationOnce(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue(true),
        searchCapabilities: jest.fn().mockRejectedValue(new Error('Vector DB search failed'))
      }));

      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'search',
          id: 'test query'
        },
        null,
        testLogger,
        'test-request-capability-search-error'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('search');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toBe('Capability search failed');
      expect(response.error.details).toBe('Vector DB search failed');
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
      expect(response.error.message).toContain('pattern, policy, capabilities');
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
    // Isolate these tests with fresh mocks to prevent interference
    beforeEach(() => {
      // Completely reset the mocks for this test suite
      jest.resetAllMocks();
      jest.clearAllMocks();
      
      // Reset PatternVectorService mocks to working state
      mockInitialize.mockResolvedValue(undefined);
      mockHealthCheck.mockResolvedValue(true);
    });
    it.skip('should fail pattern create operation when OpenAI key missing', async () => {
      // Clear environment to simulate missing OPENAI_API_KEY
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      
      // Update mocks to simulate missing API key
      mockIsAvailable.mockReturnValue(false);
      mockGetStatus.mockReturnValue({
        available: false,
        provider: null,
        reason: 'OPENAI_API_KEY not set - vector operations will fail'
      });

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

    it.skip('should fail pattern list operation when OpenAI key missing', async () => {
      // Clear environment to simulate missing OPENAI_API_KEY
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      
      // Update mocks to simulate missing API key
      mockIsAvailable.mockReturnValue(false);
      mockGetStatus.mockReturnValue({
        available: false,
        provider: null,
        reason: 'OPENAI_API_KEY not set - vector operations will fail'
      });

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

    it.skip('should succeed when embedding service is available', async () => {
      // Set environment to simulate available OPENAI_API_KEY
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-api-key';
      
      // Update mocks to simulate available API key
      mockIsAvailable.mockReturnValue(true);
      mockGetStatus.mockReturnValue({
        available: true,
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536
      });

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

  // Policy Operations Tests moved to tests/core/policy-operations.test.ts
});