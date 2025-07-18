/**
 * Tests for Test Docs Tool
 * 
 * Tests the documentation testing workflow orchestrator
 */

import { 
  TESTDOCS_TOOL_NAME, 
  TESTDOCS_TOOL_DESCRIPTION, 
  TESTDOCS_TOOL_INPUT_SCHEMA,
  handleTestDocsTool 
} from '../../src/tools/test-docs';
import { DotAI } from '../../src/core';
import { Logger } from '../../src/core/error-handling';
import { DocTestingSessionManager } from '../../src/core/doc-testing-session';
import { DocDiscovery } from '../../src/core/doc-discovery';
import { ValidationPhase, SessionStatus, SessionMetadata } from '../../src/core/doc-testing-types';
import * as fs from 'fs';

// Mock dependencies
jest.mock('../../src/core/doc-testing-session');
jest.mock('../../src/core/doc-discovery');
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;
const MockDocTestingSessionManager = DocTestingSessionManager as jest.MockedClass<typeof DocTestingSessionManager>;
const MockDocDiscovery = DocDiscovery as jest.MockedClass<typeof DocDiscovery>;

describe('Test Docs Tool', () => {
  let mockDotAI: DotAI | null;
  let mockLogger: jest.Mocked<Logger>;
  let mockSessionManager: jest.Mocked<DocTestingSessionManager>;
  let mockDiscovery: jest.Mocked<DocDiscovery>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDotAI = null;
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    // Setup session manager mock
    mockSessionManager = new MockDocTestingSessionManager() as jest.Mocked<DocTestingSessionManager>;
    
    const mockMetadata: SessionMetadata = {
      totalItems: 0,
      completedItems: 0,
      skippedItems: 0,
      blockedItems: 0,
      pendingItems: 0,
      sessionDir: '/tmp/sessions',
      lastUpdated: '2025-07-18T10:30:00Z'
    };

    mockSessionManager.createSession.mockReturnValue({
      sessionId: '2025-07-18T10-30-00-abc12345',
      filePath: 'README.md',
      startTime: '2025-07-18T10:30:00Z',
      currentPhase: ValidationPhase.SCAN,
      status: SessionStatus.ACTIVE,
      reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
      metadata: mockMetadata
    });

    mockSessionManager.loadSession.mockReturnValue({
      sessionId: '2025-07-18T10-30-00-abc12345',
      filePath: 'README.md',
      startTime: '2025-07-18T10:30:00Z',
      currentPhase: ValidationPhase.SCAN,
      status: SessionStatus.ACTIVE,
      reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
      metadata: mockMetadata
    });

    mockSessionManager.getNextStep.mockReturnValue({
      sessionId: '2025-07-18T10-30-00-abc12345',
      phase: ValidationPhase.SCAN,
      nextPhase: ValidationPhase.TEST,
      prompt: 'Test prompt with file README.md',
      workflow: {
        completed: [],
        current: ValidationPhase.SCAN,
        remaining: [ValidationPhase.TEST, ValidationPhase.ANALYZE, ValidationPhase.FIX]
      }
    });

    MockDocTestingSessionManager.mockImplementation(() => mockSessionManager);

    // Setup discovery mock
    mockDiscovery = new MockDocDiscovery() as jest.Mocked<DocDiscovery>;
    mockDiscovery.getFilePattern.mockReturnValue('**/*.md');
    mockDiscovery.discoverFiles.mockResolvedValue([
      {
        path: '/test/README.md',
        name: 'README.md',
        priority: 1,
        category: 'readme',
        relativePath: 'README.md'
      },
      {
        path: '/test/docs/guide.md',
        name: 'guide.md',
        priority: 100,
        category: 'docs',
        relativePath: 'docs/guide.md'
      }
    ]);

    mockDiscovery.formatForDisplay.mockReturnValue('Found 2 files: README.md (default), docs/guide.md');
    MockDocDiscovery.mockImplementation(() => mockDiscovery);

    // Setup fs mock
    mockFs.existsSync.mockReturnValue(true);
  });

  describe('Tool Metadata', () => {
    test('should have correct tool name', () => {
      expect(TESTDOCS_TOOL_NAME).toBe('testDocs');
    });

    test('should have comprehensive description', () => {
      expect(TESTDOCS_TOOL_DESCRIPTION).toContain('Test, validate, check, scan, verify, analyze, or review documentation');
      expect(TESTDOCS_TOOL_DESCRIPTION).toContain('you must execute that prompt immediately');
    });

    test('should have valid input schema', () => {
      expect(TESTDOCS_TOOL_INPUT_SCHEMA.filePath).toBeDefined();
      expect(TESTDOCS_TOOL_INPUT_SCHEMA.sessionId).toBeDefined();
      expect(TESTDOCS_TOOL_INPUT_SCHEMA.phase).toBeDefined();
    });
  });

  describe('Discovery Mode', () => {
    test('should discover files when no filePath provided', async () => {
      const args = {
        sessionId: undefined,
        phase: 'scan'
      };

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockDiscovery.discoverFiles).toHaveBeenCalledWith(process.cwd(), '**/*.md');
      expect(result.content[0].text).toContain('discovery');
      expect(result.content[0].text).toContain('README.md');
      expect(result.content[0].text).toContain('filesFound');
    });

    test('should use custom file pattern when provided', async () => {
      const args = {
        sessionId: undefined,
        phase: 'scan',
        filePattern: '*.rst'
      };

      // Mock getFilePattern to return the custom pattern
      mockDiscovery.getFilePattern.mockReturnValue('*.rst');

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockDiscovery.getFilePattern).toHaveBeenCalledWith(args);
      expect(mockDiscovery.discoverFiles).toHaveBeenCalledWith(process.cwd(), '*.rst');
    });

    test('should return error when no files found', async () => {
      mockDiscovery.discoverFiles.mockResolvedValue([]);

      const args = {
        sessionId: undefined,
        phase: 'scan'
      };

      await expect(handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id')).rejects.toThrow('No documentation files found matching pattern');
    });

    test('should return discovery results with proper structure', async () => {
      const args = {
        sessionId: undefined,
        phase: 'scan'
      };

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');
      const responseData = JSON.parse(result.content[0].text);

      expect(responseData.mode).toBe('discovery');
      expect(responseData.pattern).toBe('**/*.md');
      expect(responseData.filesFound).toBe(2);
      expect(responseData.defaultFile).toBe('README.md');
      expect(responseData.files).toHaveLength(2);
      expect(responseData.displayText).toContain('Found 2 files');
      expect(responseData.instruction).toContain('Please choose which file');
    });
  });

  describe('Direct File Mode', () => {
    test('should validate file exists when filePath provided', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: undefined,
        phase: 'scan'
      };

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockFs.existsSync).toHaveBeenCalledWith('README.md');
    });

    test('should return error when file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const args = {
        filePath: 'nonexistent.md',
        sessionId: undefined,
        phase: 'scan'
      };

      await expect(handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id')).rejects.toThrow('Documentation file not found');
    });

    test('should create new session when no sessionId provided', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: undefined,
        phase: 'scan'
      };

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.createSession).toHaveBeenCalledWith('README.md', args);
      expect(mockSessionManager.loadSession).not.toHaveBeenCalled();
    });

    test('should load existing session when sessionId provided', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        phase: 'scan'
      };

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.loadSession).toHaveBeenCalledWith('existing-session-id', args);
      expect(mockSessionManager.createSession).not.toHaveBeenCalled();
    });

    test('should return error when session not found', async () => {
      mockSessionManager.loadSession.mockReturnValue(null);

      const args = {
        filePath: 'README.md',
        sessionId: 'nonexistent-session',
        phase: 'scan'
      };

      await expect(handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id')).rejects.toThrow('Session not found');
    });

    test('should get workflow step with correct parameters', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: undefined,
        phase: 'test'
      };

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.getNextStep).toHaveBeenCalledWith(
        '2025-07-18T10-30-00-abc12345',
        args,
        'test'
      );
    });

    test('should return error when workflow step generation fails', async () => {
      mockSessionManager.getNextStep.mockReturnValue(null);

      const args = {
        filePath: 'README.md',
        sessionId: undefined,
        phase: 'scan'
      };

      await expect(handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id')).rejects.toThrow('Failed to get workflow step for phase');
    });

    test('should return proper workflow response structure', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: undefined,
        phase: 'scan'
      };

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');
      const responseData = JSON.parse(result.content[0].text);

      expect(responseData.sessionId).toBe('2025-07-18T10-30-00-abc12345');
      expect(responseData.phase).toBe(ValidationPhase.SCAN);
      expect(responseData.filePath).toBe('README.md');
      expect(responseData.prompt).toBe('Test prompt with file README.md');
      expect(responseData.nextPhase).toBe(ValidationPhase.TEST);
      expect(responseData.workflow).toBeDefined();
      expect(responseData.reportFile).toBe('doc-test-report-2025-07-18T10-30-00-abc12345.md');
    });
  });

  describe('Error Handling', () => {
    test('should handle generic errors gracefully', async () => {
      mockSessionManager.createSession.mockImplementation(() => {
        throw new Error('Generic error');
      });

      const args = {
        filePath: 'README.md',
        sessionId: undefined,
        phase: 'scan'
      };

      await expect(handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id')).rejects.toThrow('Generic error');
    });

    test('should log errors appropriately', async () => {
      mockSessionManager.createSession.mockImplementation(() => {
        throw new Error('Test error');
      });

      const args = {
        filePath: 'README.md',
        sessionId: undefined,
        phase: 'scan'
      };

      try {
        await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');
      } catch (error) {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith('Test-docs tool failed', expect.any(Error));
    });
  });

  describe('Logging', () => {
    test('should log discovery mode correctly', async () => {
      const args = {
        sessionId: undefined,
        phase: 'scan'
      };

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Running in discovery mode - scanning for documentation files',
        { requestId: 'test-request-id' }
      );
    });

    test('should log successful operations', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: undefined,
        phase: 'scan'
      };

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Generated workflow step',
        expect.objectContaining({
          requestId: 'test-request-id',
          sessionId: '2025-07-18T10-30-00-abc12345',
          phase: ValidationPhase.SCAN,
          nextPhase: ValidationPhase.TEST
        })
      );
    });
  });

  describe('Phase Handling', () => {
    test('should default to scan phase when no phase specified', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: undefined
      };

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.getNextStep).toHaveBeenCalledWith(
        expect.any(String),
        args,
        ValidationPhase.SCAN
      );
    });

    test('should use specified phase', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: undefined,
        phase: 'test'
      };

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.getNextStep).toHaveBeenCalledWith(
        expect.any(String),
        args,
        ValidationPhase.TEST
      );
    });
  });
});