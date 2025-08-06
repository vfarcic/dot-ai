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

// Mock functions that can be updated per test
const mockIsAvailable = jest.fn();
const mockGetStatus = jest.fn();

jest.mock('../../src/core/embedding-service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    isAvailable: mockIsAvailable,
    getStatus: mockGetStatus
  }))
}));

// Mock Claude integration and capability inference for scanning tests
jest.mock('../../src/core/claude', () => ({
  ClaudeIntegration: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockResolvedValue('Mock Claude response')
  }))
}));

jest.mock('../../src/core/capabilities', () => ({
  CapabilityInferenceEngine: jest.fn().mockImplementation(() => ({
    inferCapabilities: jest.fn().mockResolvedValue({
      capabilities: ['resource-group', 'organization', 'management'],
      providers: ['azure'],
      complexity: 'low',
      confidence: 95,
      description: 'Mock capability analysis for testing',
      useCase: 'Mock use case description'
    })
  }))
}));

// Mock the static method separately
const mockCapabilityInferenceEngine = require('../../src/core/capabilities').CapabilityInferenceEngine;
mockCapabilityInferenceEngine.generateCapabilityId = jest.fn().mockReturnValue('mock-capability-id');

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
    // Set OpenAI API key for tests to pass embedding service validation
    process.env.OPENAI_API_KEY = 'test-api-key';
    // Set Anthropic API key for capability scanning tests
    process.env.ANTHROPIC_API_KEY = 'test-api-key';

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

    // Reset embedding service mocks to default (available) state
    mockIsAvailable.mockReturnValue(!!process.env.OPENAI_API_KEY);
    mockGetStatus.mockReturnValue(process.env.OPENAI_API_KEY ? {
      available: true,
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536
    } : {
      available: false,
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

    it('should start capability scan workflow with step-based client instructions', async () => {
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
      expect(response.success).toBe(true);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('capabilities');
      expect(response.workflow.step).toBe('resource-selection');
      expect(response.workflow.question).toContain('Scan all cluster resources');
      expect(response.workflow.options).toEqual([
        { number: 1, value: 'all', display: '1. all - Scan all available cluster resources' },
        { number: 2, value: 'specific', display: '2. specific - Specify particular resource types to scan' }
      ]);
      expect(response.workflow.sessionId).toMatch(/^cap-scan-\d+$/);
      
      // Test step-based client instructions
      expect(response.workflow.instruction).toContain('IMPORTANT: You MUST ask the user to make a choice');
      expect(response.workflow.clientInstructions).toBeDefined();
      expect(response.workflow.clientInstructions.behavior).toBe('interactive');
      expect(response.workflow.clientInstructions.requirement).toContain('Ask user to choose between options');
      expect(response.workflow.clientInstructions.prohibit).toContain('Do not auto-select options');
      expect(response.workflow.clientInstructions.nextStep).toContain(`Call with step='resource-selection'`);
      expect(response.workflow.clientInstructions.responseFormat).toContain('Convert user input to semantic values');
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

    it('should handle step-based workflow continuation - processing mode selection', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'resource-selection',
          sessionId: 'cap-scan-12345',
          response: 'all'
        },
        null,
        testLogger,
        'test-request-capabilities-4'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('capabilities');
      expect(response.workflow.step).toBe('processing-mode');
      expect(response.workflow.question).toContain('Processing mode');
      expect(response.workflow.options).toEqual([
        { number: 1, value: 'auto', display: '1. auto - Batch process automatically' },
        { number: 2, value: 'manual', display: '2. manual - Review each step' }
      ]);
      expect(response.workflow.sessionId).toBe('cap-scan-12345');
      expect(response.workflow.selectedResources).toBe('all');
      
      // Test step-based client instructions for processing mode
      expect(response.workflow.instruction).toContain('IMPORTANT: You MUST ask the user to make a choice');
      expect(response.workflow.clientInstructions).toBeDefined();
      expect(response.workflow.clientInstructions.behavior).toBe('interactive');
      expect(response.workflow.clientInstructions.prohibit).toContain('Do not auto-select processing mode');
      expect(response.workflow.clientInstructions.nextStep).toContain(`Call with step='processing-mode'`);
      expect(response.workflow.clientInstructions.responseFormat).toContain('Convert user input to semantic values');
    });

    it('should handle specific resource selection workflow with step-based instructions', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'resource-selection',
          sessionId: 'cap-scan-12345',
          response: 'specific'
        },
        null,
        testLogger,
        'test-request-capabilities-5'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('capabilities');
      expect(response.workflow.step).toBe('resource-specification');
      expect(response.workflow.question).toContain('Which resources would you like to scan');
      
      // Test step-based client instructions for resource specification
      expect(response.workflow.instruction).toContain('IMPORTANT: You MUST ask the user to specify');
      expect(response.workflow.resourceFormat).toBeDefined();
      expect(response.workflow.resourceFormat.format).toContain('Kind.group for CRDs');
      expect(response.workflow.resourceFormat.examples.crds).toContain('SQL.devopstoolkit.live');
      expect(response.workflow.resourceFormat.examples.core).toContain('Pod');
      expect(response.workflow.clientInstructions.requirement).toContain('Ask user to provide specific resource list');
      expect(response.workflow.clientInstructions.prohibit).toContain('Do not suggest or auto-select resources');
      expect(response.workflow.clientInstructions.nextStep).toContain(`Call with step='resource-specification'`);
    });

    it('should handle resource list provided with step-based processing mode selection', async () => {
      // First create a session and transition to resource-specification step
      const startResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-capabilities-6a'
      );

      const startResponse = JSON.parse(startResult.content[0].text);
      const sessionId = startResponse.workflow.sessionId;

      // Transition to specific resource selection
      const specificResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'resource-selection',
          sessionId,
          response: 'specific'
        },
        null,
        testLogger,
        'test-request-capabilities-6b'
      );

      // Now provide resource list
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'resource-specification',
          sessionId,
          resourceList: 'SQL.devopstoolkit.live, Deployment.apps, Pod'
        },
        null,
        testLogger,
        'test-request-capabilities-6c'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('scan');
      expect(response.dataType).toBe('capabilities');
      expect(response.workflow.step).toBe('processing-mode');
      expect(response.workflow.selectedResources).toEqual(['SQL.devopstoolkit.live', 'Deployment.apps', 'Pod']);
      expect(response.workflow.question).toContain('Processing mode for 3 selected resources');
      
      // Test step-based instructions for specific resource processing
      expect(response.workflow.clientInstructions.context).toContain('SQL.devopstoolkit.live, Deployment.apps, Pod');
      expect(response.workflow.clientInstructions.nextStep).toContain(`Call with step='processing-mode'`);
      expect(response.workflow.clientInstructions.responseFormat).toContain('Convert user input to semantic values');
    });

    it('should return error for capabilities list operation (not yet implemented)', async () => {
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
      expect(response.success).toBe(false);
      expect(response.operation).toBe('list');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Capability listing not yet implemented');
      expect(response.error.details).toContain('Milestone 2');
    });

    it('should return error for capabilities get operation (not yet implemented)', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'get',
          id: 'capability-test-id'
        },
        null,
        testLogger,
        'test-request-capabilities-8'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.operation).toBe('get');
      expect(response.dataType).toBe('capabilities');
      expect(response.error.message).toContain('Capability retrieval not yet implemented');
      expect(response.error.details).toContain('Milestone 2');
    });

    it('should handle numeric responses for workflow options', async () => {
      // Start new workflow session properly
      const startResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-capabilities-numeric-start'
      );

      const startResponse = JSON.parse(startResult.content[0].text);
      expect(startResponse.success).toBe(true);
      expect(startResponse.workflow.step).toBe('resource-selection');
      const sessionId = startResponse.workflow.sessionId;

      // Test numeric response for resource selection with proper step parameter
      const result1 = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          sessionId: sessionId,
          step: 'resource-selection',
          response: '1' // Should be interpreted as 'all'
        },
        null,
        testLogger,
        'test-request-capabilities-numeric-1'
      );

      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.success).toBe(true);
      expect(response1.workflow.step).toBe('processing-mode');
      expect(response1.workflow.selectedResources).toBe('all');

      // Test numeric response for processing mode with proper step parameter
      const result2 = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          sessionId: sessionId,
          step: 'processing-mode',
          response: '2' // Should be interpreted as 'manual'
        },
        null,
        testLogger,
        'test-request-capabilities-numeric-2'
      );

      const response2 = JSON.parse(result2.content[0].text);
      expect(response2.success).toBe(true);
      // Should trigger capability scanning with manual mode
      expect(response2.operation).toBe('scan');
      expect(response2.dataType).toBe('capabilities');
      // In manual mode, it returns a preview with capability data
      if (response2.mode) {
        expect(response2.mode).toBe('manual');
      } else if (response2.preview) {
        expect(response2.preview.question).toContain('Continue storing this capability');
      }
    });

    it('should handle the exact user scenario with step-based workflow - manual mode capability preview', async () => {
      // Create a full workflow session properly
      const startResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-capabilities-user-scenario-start'
      );

      const startResponse = JSON.parse(startResult.content[0].text);
      const sessionId = startResponse.workflow.sessionId;

      // Choose specific resources
      const specificResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'resource-selection',
          sessionId,
          response: 'specific'
        },
        null,
        testLogger,
        'test-request-capabilities-user-scenario-1a'
      );

      // Step 1: Provide resource list (step-based)
      const step1Result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'resource-specification',
          sessionId,
          resourceList: 'resourcegroups.azure.upbound.io, servers.dbforpostgresql.azure.upbound.io, firewallrules.dbforpostgresql.azure.upbound.io'
        },
        null,
        testLogger,
        'test-request-capabilities-user-scenario-1'
      );

      const step1Response = JSON.parse(step1Result.content[0].text);
      expect(step1Response.success).toBe(true);
      expect(step1Response.workflow.step).toBe('processing-mode');

      // Step 2: Select manual mode (step-based)
      const step2Result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'processing-mode',
          sessionId,
          response: 'manual'
        },
        null,
        testLogger,
        'test-request-capabilities-user-scenario-2'
      );

      const step2Response = JSON.parse(step2Result.content[0].text);
      
      // Should succeed and show capability preview (this was the bug - it was failing before)
      expect(step2Response.success).toBe(true);
      expect(step2Response.operation).toBe('scan');
      expect(step2Response.dataType).toBe('capabilities');
      expect(step2Response.mode).toBe('manual');
      expect(step2Response.step).toBe('scanning');
      expect(step2Response.preview).toBeDefined();
      expect(step2Response.preview.data).toBeDefined();
      expect(step2Response.preview.question).toContain('Continue storing this capability');
    });

    it('should handle context-aware response parsing - resource selection vs processing mode', async () => {
      // Test 1: Start new session and test resource selection with "1" (all)
      const startResult1 = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-capabilities-context-start-1'
      );

      const startResponse1 = JSON.parse(startResult1.content[0].text);
      expect(startResponse1.success).toBe(true);
      expect(startResponse1.workflow.step).toBe('resource-selection');
      const sessionId1 = startResponse1.workflow.sessionId;

      const result1 = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          sessionId: sessionId1,
          step: 'resource-selection',
          response: '1' // Should be interpreted as 'all' (resource selection)
        },
        null,
        testLogger,
        'test-request-capabilities-context-1'
      );

      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.success).toBe(true);
      expect(response1.workflow.step).toBe('processing-mode');
      expect(response1.workflow.selectedResources).toBe('all');

      // Test 2: Continue with processing mode selection using "1" (auto)
      const result2 = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          sessionId: sessionId1,
          step: 'processing-mode',
          response: '1' // Should be interpreted as 'auto' (processing mode)
        },
        null,
        testLogger,
        'test-request-capabilities-context-2'
      );

      const response2 = JSON.parse(result2.content[0].text);
      expect(response2.success).toBe(true);
      expect(response2.operation).toBe('scan');
      expect(response2.dataType).toBe('capabilities');
      // Should trigger capability scanning in auto mode
    });

    it('should prevent the workflow bug with proper step validation', async () => {
      // Create proper workflow session first
      const startResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan'
        },
        null,
        testLogger,
        'test-request-capabilities-bug-start'
      );

      const startResponse = JSON.parse(startResult.content[0].text);
      const sessionId = startResponse.workflow.sessionId;

      // Choose specific resources
      const specificResult = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'resource-selection',
          sessionId,
          response: 'specific'
        },
        null,
        testLogger,
        'test-request-capabilities-bug-0'
      );

      // Step 1: Provide resourceList with correct step
      const step1Result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'resource-specification',
          sessionId,
          resourceList: 'resourcegroups.azure.upbound.io'
        },
        null,
        testLogger,
        'test-request-capabilities-bug-1'
      );

      const step1Response = JSON.parse(step1Result.content[0].text);
      expect(step1Response.success).toBe(true);
      expect(step1Response.workflow.step).toBe('processing-mode');
      expect(step1Response.workflow.selectedResources).toEqual(['resourcegroups.azure.upbound.io']);

      // Step 2: Respond with processing mode using correct step
      const step2Result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          step: 'processing-mode', // Correct step prevents confusion
          sessionId,
          response: 'manual' // Server knows this is processing mode, not resource selection
        },
        null,
        testLogger,
        'test-request-capabilities-bug-2'
      );

      const step2Response = JSON.parse(step2Result.content[0].text);
      
      // With step-based workflow, this succeeds and shows capability preview
      expect(step2Response.success).toBe(true);
      expect(step2Response.operation).toBe('scan');
      expect(step2Response.dataType).toBe('capabilities');
      expect(step2Response.mode).toBe('manual');
      expect(step2Response.step).toBe('scanning');
      expect(step2Response.preview).toBeDefined();
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

    it('should handle step-based workflow from resourceList entry point', async () => {
      // Test the direct resourceList entry point that caused the original bug
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'capabilities',
          operation: 'scan',
          resourceList: 'resourcegroups.azure.upbound.io, servers.dbforpostgresql.azure.upbound.io'
        },
        null,
        testLogger,
        'test-resourcelist-entry'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.workflow.step).toBe('resource-selection'); // Should start at beginning, not jump to processing-mode
      expect(response.workflow.sessionId).toMatch(/^cap-scan-\d+$/);
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
        reason: 'OPENAI_API_KEY not set - using keyword-only pattern search'
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
        reason: 'OPENAI_API_KEY not set - using keyword-only pattern search'
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
});