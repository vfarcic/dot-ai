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
  });
});