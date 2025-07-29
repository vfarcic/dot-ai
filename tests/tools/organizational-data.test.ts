/**
 * Tests for Organizational Data Tool
 */

import { handleOrganizationalDataTool } from '../../src/tools/organizational-data';
import { Logger } from '../../src/core/error-handling';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testSessionDir)) {
      fs.rmSync(testSessionDir, { recursive: true, force: true });
    }
    delete process.env.DOT_AI_SESSION_DIR;
  });

  describe('Pattern Operations', () => {
    const validPatternArgs = {
      dataType: 'pattern',
      operation: 'create',
      description: 'A test pattern for validation',
      triggers: ['test app', 'validation service'],
      suggestedResources: ['Deployment', 'Service'],
      rationale: 'Standard pattern for testing applications',
      createdBy: 'test-user'
    };

    it('should create a pattern successfully', async () => {
      const result = await handleOrganizationalDataTool(
        validPatternArgs,
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
      expect(response.data.description).toBe('A test pattern for validation');
      expect(response.data.id).toBeDefined();
    });

    it('should list patterns after creation', async () => {
      // First create a pattern
      await handleOrganizationalDataTool(validPatternArgs, null, testLogger, 'test-request-1');

      // Then list patterns
      const listResult = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'list'
        },
        null,
        testLogger,
        'test-request-2'
      );

      const response = JSON.parse(listResult.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('list');
      expect(response.data.patterns).toHaveLength(1);
      expect(response.data.totalCount).toBe(1);
    });

    it('should get a specific pattern by ID', async () => {
      // First create a pattern
      const createResult = await handleOrganizationalDataTool(validPatternArgs, null, testLogger, 'test-request-1');
      const createResponse = JSON.parse(createResult.content[0].text);
      const patternId = createResponse.data.id;

      // Then get the pattern
      const getResult = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'get',
          id: patternId
        },
        null,
        testLogger,
        'test-request-2'
      );

      const response = JSON.parse(getResult.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('get');
      expect(response.data.id).toBe(patternId);
      expect(response.data.description).toBe('A test pattern for validation');
    });

    it('should delete a pattern by ID', async () => {
      // First create a pattern
      const createResult = await handleOrganizationalDataTool(validPatternArgs, null, testLogger, 'test-request-1');
      const createResponse = JSON.parse(createResult.content[0].text);
      const patternId = createResponse.data.id;

      // Then delete the pattern
      const deleteResult = await handleOrganizationalDataTool(
        {
          dataType: 'pattern',
          operation: 'delete',
          id: patternId
        },
        null,
        testLogger,
        'test-request-2'
      );

      const response = JSON.parse(deleteResult.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('delete');
      expect(response.data.id).toBe(patternId);
    });

    it('should handle validation errors for incomplete create requests', async () => {
      const incompleteArgs = {
        dataType: 'pattern',
        operation: 'create',
        description: 'Incomplete Pattern'
        // Missing required fields
      };

      const result = await handleOrganizationalDataTool(
        incompleteArgs,
        null,
        testLogger,
        'test-request-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Missing required fields');
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

    it('should handle errors for unsupported data types', async () => {
      const result = await handleOrganizationalDataTool(
        {
          dataType: 'unsupported',
          operation: 'create'
        },
        null,
        testLogger,
        'test-request-1'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Unsupported data type');
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
  });
});