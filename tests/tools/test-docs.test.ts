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
import { ValidationPhase, SessionStatus, SessionMetadata, SectionStatus } from '../../src/core/doc-testing-types';
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
      totalSections: 0,
      completedSections: 0,
      sectionStatus: {},
      sessionDir: '/tmp/sessions',
      lastUpdated: '2025-07-18T10:30:00Z',
      nextItemId: 1
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
      expect(responseData.instruction).toContain('You must ask the user which file they want to test');
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

      await expect(handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id')).rejects.toThrow('Failed to get workflow step for session');
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
        undefined  // No phase override when no phase specified and creating new session
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

  describe('Results Handling', () => {
    test('should store section test results when provided', async () => {
      const args = {
        filePath: 'README.md', // Need to provide filePath to avoid discovery mode
        sessionId: 'existing-session-id',
        sectionId: 'section1',
        results: '{"whatWasDone": "Tested installation commands", "issues": ["Missing verification step"], "recommendations": ["Add verification command"]}',
        phase: 'test'
      };

      mockSessionManager.storeSectionTestResults = jest.fn();

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.storeSectionTestResults).toHaveBeenCalledWith(
        'existing-session-id',
        'section1', 
        '{"whatWasDone": "Tested installation commands", "issues": ["Missing verification step"], "recommendations": ["Add verification command"]}',
        args
      );
    });

    test('should not store results if sessionId is missing', async () => {
      const args = {
        filePath: 'README.md',
        sectionId: 'section1',
        results: '{"whatWasDone": "Test results", "issues": [], "recommendations": []}',
        phase: 'test'
      };

      mockSessionManager.storeSectionTestResults = jest.fn();

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.storeSectionTestResults).not.toHaveBeenCalled();
    });

    test('should process scan results when sectionId is missing', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        results: '{"sections": ["Test Section"]}',
        phase: 'test'
      };

      mockSessionManager.processScanResults = jest.fn();
      mockSessionManager.storeSectionTestResults = jest.fn();

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.processScanResults).toHaveBeenCalled();
      expect(mockSessionManager.storeSectionTestResults).not.toHaveBeenCalled();
    });

    test('should not store results if results are missing', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        sectionId: 'section1',
        phase: 'test'
      };

      mockSessionManager.storeSectionTestResults = jest.fn();

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.storeSectionTestResults).not.toHaveBeenCalled();
    });

    test('should store results and automatically return next workflow step', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        sectionId: 'section1',
        results: '{"whatWasDone": "Test results", "issues": [], "recommendations": []}',
        phase: 'test'
      };

      const nextWorkflowStep = {
        sessionId: 'existing-session-id',
        phase: ValidationPhase.TEST,
        prompt: 'Test next section prompt',
        nextPhase: ValidationPhase.TEST,
        nextAction: 'testDocs',
        instruction: 'Test the next section',
        agentInstructions: 'Universal instructions...',
        workflow: {
          completed: ['scan'],
          current: 'test',
          remaining: ['test', 'analyze', 'fix']
        },
        data: {
          currentSection: { id: 'section_2', title: 'Next Section' },
          filePath: 'README.md',
          sessionDir: '/tmp/sessions'
        }
      };

      mockSessionManager.storeSectionTestResults = jest.fn();
      mockSessionManager.getNextStep = jest.fn().mockReturnValue(nextWorkflowStep);
      mockSessionManager.loadSession.mockReturnValue({
        sessionId: 'existing-session-id',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-existing-session-id.md',
        metadata: {
          totalSections: 2,
          completedSections: 1,
          sectionStatus: { section1: SectionStatus.COMPLETED, section2: SectionStatus.PENDING },
          sessionDir: '/tmp/sessions',
          lastUpdated: '2025-07-18T10:30:00Z',
          nextItemId: 1
        }
      });

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.storeSectionTestResults).toHaveBeenCalledWith(
        'existing-session-id',
        'section1',
        '{"whatWasDone": "Test results", "issues": [], "recommendations": []}',
        args
      );
      
      expect(mockSessionManager.getNextStep).toHaveBeenCalledWith('existing-session-id', args);
      
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.data).toEqual(nextWorkflowStep);
      expect(responseData.data.instruction).toBe('Test the next section');
      expect(responseData.data.data.currentSection.title).toBe('Next Section');
    });

    test('should automatically move to analyze phase when all sections completed', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        sectionId: 'section2', // Last section
        results: '{"whatWasDone": "Final section test results", "issues": [], "recommendations": []}',
        phase: 'test'
      };

      const analyzeWorkflowStep = {
        sessionId: 'existing-session-id',
        phase: ValidationPhase.ANALYZE,
        prompt: 'Analyze all test results prompt',
        nextPhase: ValidationPhase.FIX,
        nextAction: 'testDocs',
        instruction: 'Complete the analyze phase and submit your results to continue the workflow.',
        agentInstructions: 'Universal instructions...',
        workflow: {
          completed: ['scan', 'test'],
          current: 'analyze',
          remaining: ['fix']
        },
        data: {
          filePath: 'README.md',
          sessionDir: '/tmp/sessions',
          allSectionsTested: true
        }
      };

      mockSessionManager.storeSectionTestResults = jest.fn();
      mockSessionManager.getNextStep = jest.fn().mockReturnValue(analyzeWorkflowStep);
      mockSessionManager.loadSession.mockReturnValue({
        sessionId: 'existing-session-id',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-existing-session-id.md',
        metadata: {
          totalSections: 2,
          completedSections: 2,
          sectionStatus: { 
            section1: SectionStatus.COMPLETED, 
            section2: SectionStatus.COMPLETED 
          },
          sessionDir: '/tmp/sessions',
          lastUpdated: '2025-07-18T10:30:00Z',
          nextItemId: 1
        }
      });

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.storeSectionTestResults).toHaveBeenCalledWith(
        'existing-session-id',
        'section2',
        '{"whatWasDone": "Final section test results", "issues": [], "recommendations": []}',
        args
      );
      
      expect(mockSessionManager.getNextStep).toHaveBeenCalledWith('existing-session-id', args);
      
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.data.phase).toBe('analyze');
      expect(responseData.data.instruction).toBe('Complete the analyze phase and submit your results to continue the workflow.');
      expect(responseData.data.data.allSectionsTested).toBe(true);
    });

    test('should log result storage activity', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        sectionId: 'section1', 
        results: '{"whatWasDone": "Test results", "issues": [], "recommendations": []}',
        phase: 'test'
      };

      mockSessionManager.storeSectionTestResults = jest.fn();

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Storing section test results',
        expect.objectContaining({
          requestId: 'test-request-id',
          sessionId: 'existing-session-id',
          sectionId: 'section1'
        })
      );
    });
  });

  describe('Scan Results Processing', () => {
    test('should process valid scan results JSON', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        results: '{"sections": ["Prerequisites", "Installation", "Usage"]}',
        phase: 'test'
      };

      mockSessionManager.processScanResults = jest.fn();
      mockSessionManager.loadSession.mockReturnValue({
        sessionId: 'existing-session-id',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-existing-session-id.md',
        metadata: {
          totalSections: 3,
          completedSections: 0,
          sectionStatus: {},
          sessionDir: '/tmp/sessions',
          lastUpdated: '2025-07-18T10:30:00Z',
          nextItemId: 1
        }
      });

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.processScanResults).toHaveBeenCalledWith(
        'existing-session-id',
        ['Prerequisites', 'Installation', 'Usage'],
        args
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scan results processed successfully',
        expect.objectContaining({
          requestId: 'test-request-id',
          sessionId: 'existing-session-id',
          sectionsCount: 3
        })
      );
      expect(result).toBeDefined();
    });

    test('should handle invalid scan results JSON', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        results: '{"invalid": "format"}',
        phase: 'test'
      };

      await expect(handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id')).rejects.toThrow(
        'Invalid scan results format - expected {sections: [...]} structure'
      );
    });

    test('should handle malformed JSON in scan results', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        results: '{invalid json}',
        phase: 'test'
      };

      await expect(handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id')).rejects.toThrow(
        /Failed to process scan results/
      );
    });

    test('should log scan results processing activity', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        results: '{"sections": ["Section A", "Section B"]}',
        phase: 'test'
      };

      mockSessionManager.processScanResults = jest.fn();

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing scan results',
        expect.objectContaining({
          requestId: 'test-request-id',
          sessionId: 'existing-session-id'
        })
      );
    });

    test('should handle empty sections array in scan results', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        results: '{"sections": []}',
        phase: 'test'
      };

      mockSessionManager.processScanResults = jest.fn();

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.processScanResults).toHaveBeenCalledWith(
        'existing-session-id',
        [],
        args
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scan results processed successfully',
        expect.objectContaining({
          sectionsCount: 0
        })
      );
      expect(result).toBeDefined();
    });

    test('should differentiate between scan results and section results', async () => {
      // Test scan results (no sectionId)
      const scanArgs = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        results: '{"sections": ["Section 1"]}',
        phase: 'test'
      };

      mockSessionManager.processScanResults = jest.fn();
      mockSessionManager.storeSectionTestResults = jest.fn();

      await handleTestDocsTool(scanArgs, mockDotAI, mockLogger, 'test-request-id-1');

      expect(mockSessionManager.processScanResults).toHaveBeenCalled();
      expect(mockSessionManager.storeSectionTestResults).not.toHaveBeenCalled();

      // Reset mocks
      mockSessionManager.processScanResults.mockClear();
      mockSessionManager.storeSectionTestResults.mockClear();

      // Test section results (with sectionId)
      const sectionArgs = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        sectionId: 'section1',
        results: 'Section test results',
        phase: 'test'
      };

      await handleTestDocsTool(sectionArgs, mockDotAI, mockLogger, 'test-request-id-2');

      expect(mockSessionManager.storeSectionTestResults).toHaveBeenCalled();
      expect(mockSessionManager.processScanResults).not.toHaveBeenCalled();
    });

    test('should return next workflow step after processing scan results', async () => {
      const args = {
        filePath: 'README.md',
        sessionId: 'existing-session-id',
        results: '{"sections": ["Prerequisites", "Installation"]}',
        phase: 'test'
      };

      mockSessionManager.processScanResults = jest.fn();
      mockSessionManager.getNextStep = jest.fn().mockReturnValue({
        sessionId: 'existing-session-id',
        phase: 'test',
        prompt: 'Test first section prompt',
        nextPhase: 'test',
        nextAction: 'testDocs',
        instruction: 'Test the Prerequisites section',
        agentInstructions: 'Universal instructions...',
        workflow: { completed: ['scan'], current: 'test', remaining: ['test', 'analyze', 'fix'] },
        data: { currentSection: { id: 'section_1', title: 'Prerequisites' } }
      });

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      expect(mockSessionManager.processScanResults).toHaveBeenCalledWith(
        'existing-session-id',
        ['Prerequisites', 'Installation'],
        args
      );
      
      // Should call getNextStep after processing scan results
      expect(mockSessionManager.getNextStep).toHaveBeenCalledWith('existing-session-id', args);
      
      expect(result).toBeDefined();
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.success).toBe(true);
      expect(responseData.data.phase).toBe('test');
      expect(responseData.data.instruction).toBe('Test the Prerequisites section');
      expect(responseData.data.nextAction).toBe('testDocs');
    });

    test('should load filePath from session when sessionId provided without filePath', async () => {
      const args = {
        sessionId: 'existing-session-id',
        results: '{"sections": ["Test Section"]}',
        phase: 'test'
      };

      // Mock session with filePath
      const sessionWithFile = {
        sessionId: 'existing-session-id',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.SCAN,
        status: SessionStatus.ACTIVE,
        reportFile: 'report.md',
        metadata: {
          totalSections: 0,
          completedSections: 0,
          sectionStatus: {},
          sessionDir: '/tmp/sessions',
          lastUpdated: '2025-07-18T10:30:00Z',
          nextItemId: 1
        }
      };

      mockSessionManager.loadSession.mockReturnValue(sessionWithFile);
      mockSessionManager.processScanResults = jest.fn();
      mockFs.existsSync.mockReturnValue(true);

      const result = await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      // Should load session and use its filePath
      expect(mockSessionManager.loadSession).toHaveBeenCalledWith('existing-session-id', args);
      expect(mockFs.existsSync).toHaveBeenCalledWith('README.md');
      expect(result).toBeDefined();
    });

    test('should use session currentPhase when no phase override provided', async () => {
      const args = {
        sessionId: 'existing-session-id',
        // No phase specified - should use session's currentPhase
      };

      const sessionInTestPhase = {
        sessionId: 'existing-session-id',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST, // Session is in TEST phase
        status: SessionStatus.ACTIVE,
        reportFile: 'report.md',
        metadata: {
          totalSections: 1,
          completedSections: 0,
          sectionStatus: { section1: SectionStatus.PENDING },
          sessionDir: '/tmp/sessions',
          lastUpdated: '2025-07-18T10:30:00Z',
          nextItemId: 1
        },
        sections: [{ id: 'section1', title: 'Test Section' }]
      };

      mockSessionManager.loadSession.mockReturnValue(sessionInTestPhase);
      mockSessionManager.getNextStep = jest.fn().mockReturnValue({
        sessionId: 'existing-session-id',
        phase: ValidationPhase.TEST,
        prompt: 'Test section prompt',
        workflow: { completed: ['scan'], current: 'test', remaining: ['analyze', 'fix'] }
      });
      mockFs.existsSync.mockReturnValue(true);

      await handleTestDocsTool(args, mockDotAI, mockLogger, 'test-request-id');

      // Should call getNextStep without phase override (undefined)
      expect(mockSessionManager.getNextStep).toHaveBeenCalledWith('existing-session-id', args, undefined);
    });
  });
});