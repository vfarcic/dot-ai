/**
 * Tests for DocTestingSessionManager
 * 
 * Tests the session-based documentation testing functionality
 */

import { DocTestingSessionManager } from '../../src/core/doc-testing-session';
import { ValidationSession, ValidationPhase, SessionStatus, SessionMetadata, SectionStatus } from '../../src/core/doc-testing-types';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('../../src/core/session-utils', () => ({
  getAndValidateSessionDirectory: jest.fn()
}));

jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockGetAndValidateSessionDirectory = require('../../src/core/session-utils').getAndValidateSessionDirectory as jest.MockedFunction<any>;

describe('DocTestingSessionManager', () => {
  let sessionManager: DocTestingSessionManager;
  const mockSessionDir = '/tmp/test-sessions';

  beforeEach(() => {
    sessionManager = new DocTestingSessionManager();
    jest.clearAllMocks();
    
    // Setup path mocks
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.basename.mockImplementation((filePath: string) => filePath.split('/').pop() || '');
    
    // Setup session directory mock
    mockGetAndValidateSessionDirectory.mockReturnValue(mockSessionDir);
    
    // Setup fs mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.readFileSync.mockImplementation(() => '{}');
    mockFs.readdirSync.mockImplementation(() => []);
  });

  describe('createSession', () => {
    test('should create a new session with unique ID', () => {
      const session = sessionManager.createSession('README.md', { sessionDir: mockSessionDir });
      
      expect(session.sessionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-z0-9]{8}$/);
      expect(session.filePath).toBe('README.md');
      expect(session.currentPhase).toBe(ValidationPhase.SCAN);
      expect(session.status).toBe(SessionStatus.ACTIVE);
      expect(session.startTime).toBeDefined();
      expect(session.metadata).toBeDefined();
      expect(session.metadata.totalSections).toBe(0);
    });

    test('should use session directory from args', () => {
      const args = { sessionDir: '/custom/session/dir' };
      mockGetAndValidateSessionDirectory.mockReturnValue('/custom/session/dir');
      
      const session = sessionManager.createSession('README.md', args);
      
      expect(mockGetAndValidateSessionDirectory).toHaveBeenCalledWith(args, true);
      expect(session.sessionId).toBeDefined();
    });

    test('should save session to file', () => {
      const session = sessionManager.createSession('README.md', { sessionDir: mockSessionDir });
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(`${session.sessionId}.json`),
        expect.stringContaining(session.sessionId)
      );
    });

    test('should create unique session IDs', () => {
      const session1 = sessionManager.createSession('README.md', { sessionDir: mockSessionDir });
      const session2 = sessionManager.createSession('README.md', { sessionDir: mockSessionDir });
      
      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });

  describe('loadSession', () => {
    test('should load existing session from file', () => {
      const mockMetadata: SessionMetadata = {
        totalSections: 0,
        completedSections: 0,
        sectionStatus: {},
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z',
        nextItemId: 1
      };

      const mockSession: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        metadata: mockMetadata
      };

      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockSession));
      
      const session = sessionManager.loadSession('2025-07-18T10-30-00-abc12345', { sessionDir: mockSessionDir });
      
      expect(session).toEqual(mockSession);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('2025-07-18T10-30-00-abc12345.json'),
        'utf8'
      );
    });

    test('should return null if session file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const session = sessionManager.loadSession('nonexistent', { sessionDir: mockSessionDir });
      
      expect(session).toBeNull();
    });

    test('should return null if session file is invalid JSON', () => {
      mockFs.readFileSync.mockReturnValue('invalid json');
      
      const session = sessionManager.loadSession('invalid', { sessionDir: mockSessionDir });
      
      expect(session).toBeNull();
    });

    test('should handle fs.readFileSync errors gracefully', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });
      
      const session = sessionManager.loadSession('error', { sessionDir: mockSessionDir });
      
      expect(session).toBeNull();
    });
  });

  describe('saveSession', () => {
    test('should save session to file', () => {
      const mockMetadata: SessionMetadata = {
        totalSections: 0,
        completedSections: 0,
        sectionStatus: {},
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z',
        nextItemId: 1
      };

      const mockSession: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        metadata: mockMetadata
      };

      sessionManager.saveSession(mockSession, { sessionDir: mockSessionDir });
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('2025-07-18T10-30-00-abc12345.json'),
        JSON.stringify(mockSession, null, 2)
      );
    });

    test('should handle fs.writeFileSync errors by throwing', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('File write error');
      });
      
      const mockMetadata: SessionMetadata = {
        totalSections: 0,
        completedSections: 0,
        sectionStatus: {},
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z',
        nextItemId: 1
      };

      const mockSession: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.SCAN,
        status: SessionStatus.ACTIVE,
        metadata: mockMetadata
      };

      // Should throw an error (the implementation doesn't catch it)
      expect(() => {
        sessionManager.saveSession(mockSession, { sessionDir: mockSessionDir });
      }).toThrow('File write error');
    });
  });

  describe('getNextStep', () => {
    const mockMetadata: SessionMetadata = {
      totalSections: 0,
      completedSections: 0,
      sectionStatus: {},
      sessionDir: '/tmp/sessions',
      lastUpdated: '2025-07-18T10:30:00Z',
      nextItemId: 1
    };

    const mockSession: ValidationSession = {
      sessionId: '2025-07-18T10-30-00-abc12345',
      filePath: 'README.md',
      startTime: '2025-07-18T10:30:00Z',
      currentPhase: ValidationPhase.SCAN,
      status: SessionStatus.ACTIVE,
      metadata: mockMetadata
    };

    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockSession));
    });

    test('should return scan phase workflow step', () => {
      const mockPrompt = '# Scan Phase Prompt\nScan this document for {filePath} with session {sessionId}...';
      mockFs.existsSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('doc-testing-scan.md')) {
          return true;
        }
        if (typeof filePath === 'string' && filePath.includes('doc-test-2025-07-18T10-30-00-abc12345.json')) {
          return true;
        }
        return false;
      });
      
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('doc-testing-scan.md')) {
          return mockPrompt;
        }
        if (typeof filePath === 'string' && filePath.includes('doc-test-2025-07-18T10-30-00-abc12345.json')) {
          return JSON.stringify(mockSession);
        }
        return JSON.stringify(mockSession);
      });

      const step = sessionManager.getNextStep('2025-07-18T10-30-00-abc12345', { sessionDir: mockSessionDir });
      
      expect(step).toBeDefined();
      expect(step!.phase).toBe(ValidationPhase.SCAN);
      expect(step!.nextPhase).toBe(ValidationPhase.TEST);
      expect(step!.prompt).toContain('README.md');
      expect(step!.prompt).toContain('2025-07-18T10-30-00-abc12345');
      expect(step!.workflow.current).toBe(ValidationPhase.SCAN);
      expect(step!.workflow.remaining).toEqual([ValidationPhase.TEST, ValidationPhase.ANALYZE, ValidationPhase.FIX]);
    });

    test('should use specified phase instead of session current phase', () => {
      // Create session with sections to trigger section-by-section testing workflow
      const sessionWithSections = {
        ...mockSession,
        sections: [
          { id: 'section_1', title: 'Prerequisites', lineRange: [1, 20], sectionDependencies: [] }
        ],
        metadata: {
          ...mockSession.metadata,
          totalSections: 1,
          sectionStatus: { 'section_1': SectionStatus.PENDING }
        }
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(sessionWithSections));
      
      // Mock writeFileSync to capture session updates (for updateSectionStatus calls)
      let savedSession: any;
      mockFs.writeFileSync.mockImplementation((path, data) => {
        if (typeof data === 'string') {
          savedSession = JSON.parse(data);
        }
      });
      
      const step = sessionManager.getNextStep(
        '2025-07-18T10-30-00-abc12345', 
        { sessionDir: mockSessionDir }, 
        ValidationPhase.TEST
      );
      
      expect(step!.phase).toBe(ValidationPhase.TEST);
      expect(step!.nextPhase).toBe(ValidationPhase.TEST); // Still more sections to test
      
      // Verify new instruction fields are set
      expect(step!.nextAction).toBe('testDocs');
      expect(step!.instruction).toContain('Test the "Prerequisites" section');
      expect(step!.agentInstructions).toBeDefined();
      expect(step!.agentInstructions).toContain('DOCUMENTATION TESTING WORKFLOW');
      expect(step!.agentInstructions).toContain('Submit results by calling testDocs');
      
      // Verify that updateSectionStatus was called with proper args (session was saved with updated status)
      expect(savedSession).toBeDefined();
      expect(savedSession.metadata.sectionStatus['section_1']).toBe(SectionStatus.TESTING);
      expect(step!.data.currentSection).toBeDefined();
      expect(step!.data.currentSection.id).toBe('section_1');
    });

    test('should return null if session not found', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const step = sessionManager.getNextStep('nonexistent', { sessionDir: mockSessionDir });
      
      expect(step).toBeNull();
    });

    test('should handle prompt file read errors gracefully', () => {
      mockFs.existsSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('doc-testing-scan.md')) {
          return true;
        }
        if (typeof filePath === 'string' && filePath.includes('doc-test-2025-07-18T10-30-00-abc12345.json')) {
          return true;
        }
        return false;
      });
      
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('doc-testing-scan.md')) {
          throw new Error('Prompt file error');
        }
        if (typeof filePath === 'string' && filePath.includes('doc-test-2025-07-18T10-30-00-abc12345.json')) {
          return JSON.stringify(mockSession);
        }
        return JSON.stringify(mockSession);
      });

      const step = sessionManager.getNextStep('2025-07-18T10-30-00-abc12345', { sessionDir: mockSessionDir });
      
      expect(step).toBeDefined();
      expect(step!.prompt).toContain('README.md');
      expect(step!.prompt).toContain('process it for phase scan');
    });

    test('should replace template variables in prompt', () => {
      const mockPrompt = '# Test {filePath} for session {sessionId}';
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('doc-testing-scan.md')) {
          return mockPrompt;
        }
        return JSON.stringify(mockSession);
      });

      const step = sessionManager.getNextStep('2025-07-18T10-30-00-abc12345', { sessionDir: mockSessionDir });
      
      expect(step!.prompt).toContain('README.md');
      expect(step!.prompt).toContain('2025-07-18T10-30-00-abc12345');
      expect(step!.prompt).not.toContain('{filePath}');
      expect(step!.prompt).not.toContain('{sessionId}');
    });
  });

  describe('getActiveSessions', () => {
    test('should return list of active sessions', () => {
      const mockSessions = [
        'doc-test-session1.json',
        'doc-test-session2.json',
        'not-a-session.txt'
      ];
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(mockSessions as any);
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('doc-test-session1.json')) {
          return JSON.stringify({
            sessionId: 'session1',
            status: SessionStatus.ACTIVE
          });
        }
        if (typeof filePath === 'string' && filePath.includes('doc-test-session2.json')) {
          return JSON.stringify({
            sessionId: 'session2',
            status: SessionStatus.COMPLETED
          });
        }
        return '{}';
      });

      const sessions = sessionManager.getActiveSessions({ sessionDir: mockSessionDir });
      
      expect(sessions).toHaveLength(1); // Only the active session
      expect(sessions[0].sessionId).toBe('session1');
    });

    test('should handle session directory read errors by throwing', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Directory read error');
      });

      expect(() => {
        sessionManager.getActiveSessions({ sessionDir: mockSessionDir });
      }).toThrow('Directory read error');
    });

    test('should skip invalid session files', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['doc-test-valid.json', 'doc-test-invalid.json'] as any);
      mockFs.readFileSync.mockImplementation((filePath: any) => {
        if (typeof filePath === 'string' && filePath.includes('doc-test-valid.json')) {
          return JSON.stringify({ 
            sessionId: 'valid',
            status: SessionStatus.ACTIVE 
          });
        }
        if (typeof filePath === 'string' && filePath.includes('doc-test-invalid.json')) {
          return 'invalid json';
        }
        return '{}';
      });

      const sessions = sessionManager.getActiveSessions({ sessionDir: mockSessionDir });
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('valid');
    });
  });

  describe('generateSessionId', () => {
    test('should generate unique session ID with correct format', () => {
      const sessionId = (sessionManager as any).generateSessionId();
      
      expect(sessionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-z0-9]{8}$/);
    });

    test('should generate different IDs on subsequent calls', () => {
      const id1 = (sessionManager as any).generateSessionId();
      const id2 = (sessionManager as any).generateSessionId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('getNextPhase', () => {
    test('should return correct next phase for each phase', () => {
      expect((sessionManager as any).getNextPhase(ValidationPhase.SCAN)).toBe(ValidationPhase.TEST);
      expect((sessionManager as any).getNextPhase(ValidationPhase.TEST)).toBe(ValidationPhase.ANALYZE);
      expect((sessionManager as any).getNextPhase(ValidationPhase.ANALYZE)).toBe(ValidationPhase.FIX);
      expect((sessionManager as any).getNextPhase(ValidationPhase.FIX)).toBe(undefined);
    });
  });

  describe('storeSectionTestResults', () => {
    const mockMetadata: SessionMetadata = {
      totalSections: 2,
      completedSections: 0,
      sectionStatus: {
        'section1': SectionStatus.TESTING,
        'section2': SectionStatus.PENDING
      },
      sessionDir: '/tmp/sessions',
      lastUpdated: '2025-07-18T10:30:00Z',
      nextItemId: 1
    };

    const mockSession: ValidationSession = {
      sessionId: '2025-07-18T10-30-00-abc12345',
      filePath: 'README.md',
      startTime: '2025-07-18T10:30:00Z',
      currentPhase: ValidationPhase.TEST,
      status: SessionStatus.ACTIVE,
      metadata: mockMetadata,
      sections: [
        { id: 'section1', title: 'Section 1' },
        { id: 'section2', title: 'Section 2' }
      ]
    };

    beforeEach(() => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockSession));
    });

    test('should store section test results and mark section as completed', () => {
      const testResults = '{"whatWasDone": "Section 1 test results: All commands executed successfully.", "issues": []}';
      
      sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', testResults, { sessionDir: mockSessionDir });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('2025-07-18T10-30-00-abc12345.json'),
        expect.stringContaining('whatWasDone')
      );
    });

    test('should update section status to completed', () => {
      const testResults = '{"whatWasDone": "Test results", "issues": []}';
      const updatedSession = { ...mockSession };
      
      // Mock writeFileSync to capture the saved session
      let savedSession: ValidationSession;
      mockFs.writeFileSync.mockImplementation((path, data) => {
        if (typeof data === 'string') {
          savedSession = JSON.parse(data);
        }
      });

      sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', testResults, { sessionDir: mockSessionDir });

      expect(savedSession!.metadata.sectionStatus['section1']).toBe(SectionStatus.COMPLETED);
      expect(savedSession!.metadata.completedSections).toBe(1);
    });

    test('should initialize sectionResults if it does not exist', () => {
      const sessionWithoutResults = { ...mockSession };
      delete sessionWithoutResults.sectionResults;
      mockFs.readFileSync.mockReturnValue(JSON.stringify(sessionWithoutResults));

      const testResults = '{"whatWasDone": "Test results", "issues": []}';
      let savedSession: ValidationSession;
      mockFs.writeFileSync.mockImplementation((path, data) => {
        if (typeof data === 'string') {
          savedSession = JSON.parse(data);
        }
      });

      sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', testResults, { sessionDir: mockSessionDir });

      expect(savedSession!.sectionResults).toBeDefined();
      expect(savedSession!.sectionResults!['section1']).toEqual({
        whatWasDone: "Test results",
        issues: [],
      });
    });

    test('should throw error if session not found', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        sessionManager.storeSectionTestResults('nonexistent-session', 'section1', '{"whatWasDone":"test","issues":[]}', { sessionDir: mockSessionDir });
      }).toThrow('Session nonexistent-session not found');
    });

    test('should handle multiple section results', () => {
      const results1 = '{"whatWasDone": "Results for section 1", "issues": []}';
      const results2 = '{"whatWasDone": "Results for section 2", "issues": []}';
      
      let savedSession: ValidationSession;
      mockFs.writeFileSync.mockImplementation((path, data) => {
        if (typeof data === 'string') {
          savedSession = JSON.parse(data);
        }
      });

      // Store results for first section
      sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', results1, { sessionDir: mockSessionDir });
      const sessionAfterFirst = savedSession!;

      // Mock the updated session for the second call
      mockFs.readFileSync.mockReturnValue(JSON.stringify(sessionAfterFirst));
      
      // Store results for second section
      sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section2', results2, { sessionDir: mockSessionDir });

      expect(savedSession!.sectionResults!['section1']).toEqual({
        whatWasDone: "Results for section 1",
        issues: [],
      });
      expect(savedSession!.sectionResults!['section2']).toEqual({
        whatWasDone: "Results for section 2", 
        issues: [],
      });
      expect(savedSession!.metadata.completedSections).toBe(2);
    });

    test('should validate JSON format and reject invalid JSON', () => {
      expect(() => {
        sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', 'invalid json', { sessionDir: mockSessionDir });
      }).toThrow('Invalid JSON results format');
    });

    test('should validate required fields and reject missing whatWasDone', () => {
      const invalidResults = '{"issues": []}';
      expect(() => {
        sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', invalidResults, { sessionDir: mockSessionDir });
      }).toThrow('Missing or invalid "whatWasDone" field');
    });

    test('should validate required fields and reject missing issues array', () => {
      const invalidResults = '{"whatWasDone": "test"}';
      expect(() => {
        sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', invalidResults, { sessionDir: mockSessionDir });
      }).toThrow('Missing or invalid "issues" field - must be array');
    });

    test('should accept valid results without recommendations field (consolidated format)', () => {
      const validResults = '{"whatWasDone": "test", "issues": []}';
      expect(() => {
        sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', validResults, { sessionDir: mockSessionDir });
      }).not.toThrow();
    });

    test('should validate field types and reject non-string whatWasDone', () => {
      const invalidResults = '{"whatWasDone": 123, "issues": []}';
      expect(() => {
        sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', invalidResults, { sessionDir: mockSessionDir });
      }).toThrow('Missing or invalid "whatWasDone" field');
    });

    test('should validate field types and reject non-array issues', () => {
      const invalidResults = '{"whatWasDone": "test", "issues": "not an array"}';
      expect(() => {
        sessionManager.storeSectionTestResults('2025-07-18T10-30-00-abc12345', 'section1', invalidResults, { sessionDir: mockSessionDir });
      }).toThrow('Missing or invalid "issues" field - must be array');
    });

  });

  describe('processScanResults', () => {
    beforeEach(() => {
      const mockSession: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.SCAN,
        status: SessionStatus.ACTIVE,
        metadata: {
          totalSections: 0,
          completedSections: 0,
          sectionStatus: {},
          sessionDir: mockSessionDir,
          lastUpdated: '2025-07-18T10:30:00Z',
          nextItemId: 1
        }
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockSession));
    });

    test('should process scan results and create DocumentSection objects', () => {
      const sectionTitles = ['Prerequisites', 'Installation', 'Usage Examples'];
      let savedSession: ValidationSession;
      mockFs.writeFileSync.mockImplementation((path, data) => {
        if (typeof data === 'string') {
          savedSession = JSON.parse(data);
        }
      });

      sessionManager.processScanResults('2025-07-18T10-30-00-abc12345', sectionTitles, { sessionDir: mockSessionDir });

      expect(savedSession!.sections).toBeDefined();
      expect(savedSession!.sections!.length).toBe(3);
      expect(savedSession!.metadata.totalSections).toBe(3);
      expect(savedSession!.metadata.completedSections).toBe(0);
      expect(savedSession!.currentPhase).toBe(ValidationPhase.TEST);

      // Check section structure
      expect(savedSession!.sections![0]).toEqual({
        id: 'section_1',
        title: 'Prerequisites'
      });

      expect(savedSession!.sections![1]).toEqual({
        id: 'section_2',
        title: 'Installation'
      });

      expect(savedSession!.sections![2]).toEqual({
        id: 'section_3',
        title: 'Usage Examples'
      });
    });

    test('should initialize section status for all sections', () => {
      const sectionTitles = ['Section A', 'Section B'];
      let savedSession: ValidationSession;
      mockFs.writeFileSync.mockImplementation((path, data) => {
        if (typeof data === 'string') {
          savedSession = JSON.parse(data);
        }
      });

      sessionManager.processScanResults('2025-07-18T10-30-00-abc12345', sectionTitles, { sessionDir: mockSessionDir });

      expect(savedSession!.metadata.sectionStatus['section_1']).toBe(SectionStatus.PENDING);
      expect(savedSession!.metadata.sectionStatus['section_2']).toBe(SectionStatus.PENDING);
    });

    test('should handle empty section titles array', () => {
      const sectionTitles: string[] = [];
      let savedSession: ValidationSession;
      mockFs.writeFileSync.mockImplementation((path, data) => {
        if (typeof data === 'string') {
          savedSession = JSON.parse(data);
        }
      });

      sessionManager.processScanResults('2025-07-18T10-30-00-abc12345', sectionTitles, { sessionDir: mockSessionDir });

      expect(savedSession!.sections).toEqual([]);
      expect(savedSession!.metadata.totalSections).toBe(0);
      expect(savedSession!.metadata.completedSections).toBe(0);
      expect(savedSession!.metadata.sectionStatus).toEqual({});
    });

    test('should trim whitespace from section titles', () => {
      const sectionTitles = ['  Prerequisites  ', '\tInstallation\n', ' Usage Examples '];
      let savedSession: ValidationSession;
      mockFs.writeFileSync.mockImplementation((path, data) => {
        if (typeof data === 'string') {
          savedSession = JSON.parse(data);
        }
      });

      sessionManager.processScanResults('2025-07-18T10-30-00-abc12345', sectionTitles, { sessionDir: mockSessionDir });

      expect(savedSession!.sections![0].title).toBe('Prerequisites');
      expect(savedSession!.sections![1].title).toBe('Installation');
      expect(savedSession!.sections![2].title).toBe('Usage Examples');
    });

    test('should throw error if session not found', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        sessionManager.processScanResults('nonexistent-session', ['Section 1'], { sessionDir: mockSessionDir });
      }).toThrow('Session nonexistent-session not found');
    });

    test('should handle single section', () => {
      const sectionTitles = ['Single Section'];
      let savedSession: ValidationSession;
      mockFs.writeFileSync.mockImplementation((path, data) => {
        if (typeof data === 'string') {
          savedSession = JSON.parse(data);
        }
      });

      sessionManager.processScanResults('2025-07-18T10-30-00-abc12345', sectionTitles, { sessionDir: mockSessionDir });

      expect(savedSession!.sections!.length).toBe(1);
      expect(savedSession!.sections![0].id).toBe('section_1');
      expect(savedSession!.sections![0].title).toBe('Single Section');
      expect(savedSession!.metadata.totalSections).toBe(1);
    });
  });

  describe('Template Variable Validation', () => {
    const mockMetadata: SessionMetadata = {
      totalSections: 1,
      completedSections: 0,
      sectionStatus: { section1: SectionStatus.PENDING },
      sessionDir: mockSessionDir,
      lastUpdated: '2025-07-18T10:30:00Z',
      nextItemId: 1
    };

    const testSession: ValidationSession = {
      sessionId: '2025-07-18T10-30-00-abc12345',
      filePath: 'README.md',
      startTime: '2025-07-18T10:30:00Z',
      currentPhase: ValidationPhase.SCAN,
      status: SessionStatus.ACTIVE,
      metadata: mockMetadata
    };

    test('should warn about unreplaced variables in phase prompt', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockTemplate = 'File: {filePath}, Session: {sessionId}, Unknown: {unknownVariable}';
      
      mockFs.readFileSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('.md')) {
          return mockTemplate;
        }
        return JSON.stringify(testSession);
      });
      mockFs.existsSync.mockReturnValue(true);

      const result = sessionManager.getNextStep('2025-07-18T10-30-00-abc12345', { sessionDir: mockSessionDir });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Unreplaced template variables in scan prompt:',
        ['{unknownVariable}']
      );
      expect(result?.prompt).toContain('{unknownVariable}');
      consoleSpy.mockRestore();
    });

    test('should warn about unreplaced variables in section test prompt', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockTemplate = 'Section: {sectionTitle}, Unknown: {missingVariable}';
      
      // Create session with sections to trigger section test prompt
      const sessionWithSections: ValidationSession = {
        ...testSession,
        currentPhase: ValidationPhase.TEST,
        sections: [{ id: 'section1', title: 'Test Section' }],
        metadata: {
          ...mockMetadata,
          sectionStatus: { section1: SectionStatus.PENDING },
          totalSections: 1
        }
      };
      
      mockFs.readFileSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('doc-testing-test-section.md')) {
          return mockTemplate;
        }
        return JSON.stringify(sessionWithSections);
      });
      mockFs.existsSync.mockReturnValue(true);

      const result = sessionManager.getNextStep('2025-07-18T10-30-00-abc12345', { sessionDir: mockSessionDir });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Warning: Unreplaced template variables in section test prompt:',
        ['{missingVariable}']
      );
      expect(result?.prompt).toContain('{missingVariable}');
      consoleSpy.mockRestore();
    });

    test('should not warn when all variables are replaced', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockTemplate = 'File: {filePath}, Session: {sessionId}';
      
      mockFs.readFileSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('.md')) {
          return mockTemplate;
        }
        return JSON.stringify(testSession);
      });
      mockFs.existsSync.mockReturnValue(true);

      const result = sessionManager.getNextStep('2025-07-18T10-30-00-abc12345', { sessionDir: mockSessionDir });

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Unreplaced template variables'),
        expect.anything()
      );
      expect(result?.prompt).not.toContain('{');
      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle missing prompt files with fallback', () => {
      const testSession: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.SCAN,
        status: SessionStatus.ACTIVE,
        metadata: {
          totalSections: 0,
          completedSections: 0,
          sectionStatus: {},
          sessionDir: mockSessionDir,
          lastUpdated: '2025-07-18T10:30:00Z',
          nextItemId: 1
        }
      };

      mockFs.readFileSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('.json')) {
          return JSON.stringify(testSession);
        }
        throw new Error('Prompt file not found');
      });

      mockFs.existsSync.mockImplementation((path) => {
        // Session file exists, but prompt file doesn't
        return typeof path === 'string' && path.includes('.json');
      });
      
      const result = sessionManager.getNextStep('2025-07-18T10-30-00-abc12345', { sessionDir: mockSessionDir });

      expect(result?.prompt).toBe('Read the file at "README.md" and process it for phase scan.');
    });

    test('should handle non-existent session directory in getActiveSessions', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = sessionManager.getActiveSessions({ sessionDir: '/non/existent/dir' });

      expect(result).toEqual([]);
    });

    test('should handle file system errors in loadSession', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      const result = sessionManager.loadSession('test-session', { sessionDir: mockSessionDir });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load session test-session:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    test('should handle malformed JSON in loadSession', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json content');

      const result = sessionManager.loadSession('test-session', { sessionDir: mockSessionDir });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load session test-session:', expect.any(Error));
      consoleSpy.mockRestore();
    });

    test('should handle missing section test prompt file with fallback', () => {
      const sessionWithSections: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        metadata: {
          totalSections: 1,
          completedSections: 0,
          sectionStatus: { section1: SectionStatus.PENDING },
          sessionDir: mockSessionDir,
          lastUpdated: '2025-07-18T10:30:00Z',
          nextItemId: 1
        },
        sections: [{ id: 'section1', title: 'Test Section' }]
      };

      mockFs.readFileSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('.json')) {
          return JSON.stringify(sessionWithSections);
        }
        throw new Error('File not found');
      });

      mockFs.existsSync.mockImplementation((path) => {
        // Session file exists, but prompt file doesn't
        return typeof path === 'string' && path.includes('.json');
      });

      const result = sessionManager.getNextStep('2025-07-18T10-30-00-abc12345', { sessionDir: mockSessionDir });

      expect(result?.prompt).toBe('Test the "Test Section" section of README.md.\n\nAnalyze this section and test everything you determine is testable within it.');
    });

    test('should filter inactive sessions in getActiveSessions', () => {
      const inactiveSession: ValidationSession = {
        sessionId: 'inactive-session',
        filePath: 'test.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.SCAN,
        status: SessionStatus.COMPLETED, // Not active
        metadata: {
          totalSections: 0,
          completedSections: 0,
          sectionStatus: {},
          sessionDir: mockSessionDir,
          lastUpdated: '2025-07-18T10:30:00Z',
          nextItemId: 1
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['doc-test-inactive-session.json'] as any);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(inactiveSession));

      const result = sessionManager.getActiveSessions({ sessionDir: mockSessionDir });

      expect(result).toEqual([]); // Should filter out completed sessions
    });

    test('should handle errors in storeSectionTestResults', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        sessionManager.storeSectionTestResults('nonexistent-session', 'section1', 'results', { sessionDir: mockSessionDir });
      }).toThrow('Session nonexistent-session not found');
    });
  });

  describe('Fix Phase Functionality', () => {
    const createMockSessionWithResults = (): ValidationSession => ({
      sessionId: 'fix-test-session',
      filePath: 'README.md',
      startTime: '2025-07-18T10:30:00Z',
      currentPhase: ValidationPhase.FIX,
      status: SessionStatus.ACTIVE,
      metadata: {
        totalSections: 2,
        completedSections: 2,
        sectionStatus: {
          'section_1': SectionStatus.COMPLETED,
          'section_2': SectionStatus.COMPLETED
        },
        sessionDir: mockSessionDir,
        lastUpdated: '2025-07-18T10:30:00Z',
        nextItemId: 6 // Next ID after 5 existing items
      },
      sectionResults: {
        'section_1': {
          whatWasDone: 'Tested section 1',
          issues: [
            { id: 1, text: 'Fix broken command', status: 'pending' },
            { id: 2, text: 'Update outdated link', status: 'fixed', explanation: 'Updated URL' },
            { id: 3, text: 'Add error handling example', status: 'pending' },
            { id: 4, text: 'Improve documentation clarity', status: 'deferred', explanation: 'Created GitHub issue' }
          ]
        },
        'section_2': {
          whatWasDone: 'Tested section 2',
          issues: [
            { id: 5, text: 'Fix typo in code example', status: 'failed', explanation: 'Initial fix attempt failed' }
          ]
        }
      }
    });

    beforeEach(() => {
      // Reset mocks for each test
      jest.clearAllMocks();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});
      // Default to returning a fresh mock session with results
      mockFs.readFileSync.mockReturnValue(JSON.stringify(createMockSessionWithResults()));
    });

    describe('generateStatusSummary', () => {
      test('should generate correct status summary with mixed statuses', () => {
        const mockSession = createMockSessionWithResults();
        const summary = (sessionManager as any).generateStatusSummary(mockSession);
        
        expect(summary).toContain('**Total Items**: 5');
        expect(summary).toContain('✅ **Fixed**: 1');
        expect(summary).toContain('📋 **Deferred**: 1');
        expect(summary).toContain('⏳ **Remaining**: 3 (2 pending, 1 failed)');
      });

      test('should show completion message when all items addressed', () => {
        const completedSession = createMockSessionWithResults();
        completedSession.sectionResults!['section_1'].issues[0].status = 'fixed';
        completedSession.sectionResults!['section_1'].issues[2].status = 'fixed';
        completedSession.sectionResults!['section_2'].issues[0].status = 'fixed';

        const summary = (sessionManager as any).generateStatusSummary(completedSession);
        
        expect(summary).toContain('🎉 All items have been addressed!');
        expect(summary).toContain('✅ **Fixed**: 4');
        expect(summary).toContain('📋 **Deferred**: 1');
        expect(summary).not.toContain('⏳ **Remaining**');
      });

      test('should handle session with no results', () => {
        const emptySession = createMockSessionWithResults();
        delete emptySession.sectionResults;

        const summary = (sessionManager as any).generateStatusSummary(emptySession);
        
        expect(summary).toBe('No test results available.');
      });

      test('should handle session with empty results', () => {
        const emptyResultsSession = createMockSessionWithResults();
        emptyResultsSession.sectionResults = {
          'section_1': { whatWasDone: 'Nothing found', issues: [] }
        };

        const summary = (sessionManager as any).generateStatusSummary(emptyResultsSession);
        
        expect(summary).toBe('No issues found during testing.');
      });
    });

    describe('generatePendingItemsList', () => {
      test('should generate formatted list of pending and failed items only', () => {
        const testSession = createMockSessionWithResults();
        const list = (sessionManager as any).generatePendingItemsList(testSession);
        
        expect(list).toContain('### Items Requiring Attention');
        expect(list).toContain('1. Fix broken command');
        expect(list).toContain('5. Fix typo in code example ❌ [RETRY]');
        expect(list).toContain('*Each item includes both the problem and its fix*');
        expect(list).toContain('3. Add error handling example');
        
        // Should not include fixed or deferred items
        expect(list).not.toContain('Update outdated link');
        expect(list).not.toContain('Improve documentation clarity');
      });

      test('should show completion message when no pending items', () => {
        const completedSession = createMockSessionWithResults();
        completedSession.sectionResults!['section_1'].issues[0].status = 'fixed';
        completedSession.sectionResults!['section_1'].issues[2].status = 'fixed';
        completedSession.sectionResults!['section_2'].issues[0].status = 'fixed';

        const list = (sessionManager as any).generatePendingItemsList(completedSession);
        
        expect(list).toBe('No pending items - all issues have been addressed!');
      });

      test('should handle consolidated format with mixed items', () => {
        const mixedSession = createMockSessionWithResults();
        mixedSession.sectionResults!['section_1'].issues[2].status = 'fixed';

        const list = (sessionManager as any).generatePendingItemsList(mixedSession);
        
        expect(list).toContain('### Items Requiring Attention');
        expect(list).toContain('*Each item includes both the problem and its fix*');
        expect(list).toContain('1. Fix broken command');
        expect(list).toContain('5. Fix typo in code example ❌ [RETRY]');
        expect(list).not.toContain('3. Add error handling example'); // This one should be fixed
      });
    });

    describe('updateFixableItemStatus', () => {
      test('should update status of existing item in issues', () => {
        let savedSession: ValidationSession;
        mockFs.writeFileSync.mockImplementation((path, data) => {
          if (typeof data === 'string') {
            savedSession = JSON.parse(data);
          }
        });

        sessionManager.updateFixableItemStatus('fix-test-session', 1, 'fixed', 'Successfully resolved', { sessionDir: mockSessionDir });

        expect(savedSession!.sectionResults!['section_1'].issues[0].status).toBe('fixed');
        expect(savedSession!.sectionResults!['section_1'].issues[0].explanation).toBe('Successfully resolved');
      });

      test('should update status of existing item in recommendations', () => {
        let savedSession: ValidationSession;
        mockFs.writeFileSync.mockImplementation((path, data) => {
          if (typeof data === 'string') {
            savedSession = JSON.parse(data);
          }
        });

        sessionManager.updateFixableItemStatus('fix-test-session', 3, 'deferred', 'Created GitHub issue #123', { sessionDir: mockSessionDir });

        expect(savedSession!.sectionResults!['section_1'].issues[2].status).toBe('deferred');
        expect(savedSession!.sectionResults!['section_1'].issues[2].explanation).toBe('Created GitHub issue #123');
      });

      test('should throw error for non-existent item ID', () => {
        expect(() => {
          sessionManager.updateFixableItemStatus('fix-test-session', 999, 'fixed', undefined, { sessionDir: mockSessionDir });
        }).toThrow('FixableItem with ID 999 not found in session fix-test-session');
      });

      test('should throw error for non-existent session', () => {
        mockFs.existsSync.mockReturnValue(false);

        expect(() => {
          sessionManager.updateFixableItemStatus('nonexistent-session', 1, 'fixed', undefined, { sessionDir: mockSessionDir });
        }).toThrow('Session nonexistent-session not found or has no test results');
      });
    });

    describe('updateMultipleFixableItemStatuses', () => {
      test('should update multiple items successfully', () => {
        let savedSession: ValidationSession;
        mockFs.writeFileSync.mockImplementation((path, data) => {
          if (typeof data === 'string') {
            savedSession = JSON.parse(data);
          }
        });

        const updates = [
          { itemId: 1, status: 'fixed' as const, explanation: 'Command updated' },
          { itemId: 3, status: 'deferred' as const, explanation: 'Added to backlog' },
          { itemId: 5, status: 'failed' as const, explanation: 'Still broken after retry' }
        ];

        sessionManager.updateMultipleFixableItemStatuses('fix-test-session', updates, { sessionDir: mockSessionDir });

        expect(savedSession!.sectionResults!['section_1'].issues[0].status).toBe('fixed');
        expect(savedSession!.sectionResults!['section_1'].issues[0].explanation).toBe('Command updated');
        expect(savedSession!.sectionResults!['section_1'].issues[2].status).toBe('deferred');
        expect(savedSession!.sectionResults!['section_1'].issues[2].explanation).toBe('Added to backlog');
        expect(savedSession!.sectionResults!['section_2'].issues[0].status).toBe('failed');
        expect(savedSession!.sectionResults!['section_2'].issues[0].explanation).toBe('Still broken after retry');
      });

      test('should throw error if any item ID not found', () => {
        const updates = [
          { itemId: 1, status: 'fixed' as const },
          { itemId: 999, status: 'fixed' as const } // Non-existent
        ];

        expect(() => {
          sessionManager.updateMultipleFixableItemStatuses('fix-test-session', updates, { sessionDir: mockSessionDir });
        }).toThrow('FixableItems with IDs not found: 999');
      });
    });

    describe('getPendingFixableItems', () => {
      test('should return only pending and failed items sorted by ID', () => {
        // Ensure the mock returns the correct session data
        const testSession = createMockSessionWithResults();
        mockFs.readFileSync.mockImplementation((path) => {
          if (typeof path === 'string' && path.includes('fix-test-session.json')) {
            return JSON.stringify(testSession);
          }
          return '{}';
        });

        const pendingItems = sessionManager.getPendingFixableItems('fix-test-session', { sessionDir: mockSessionDir });

        expect(pendingItems).toHaveLength(3);
        expect(pendingItems[0].id).toBe(1);
        expect(pendingItems[0].text).toBe('Fix broken command');
        expect(pendingItems[0].status).toBe('pending');
        expect(pendingItems[1].id).toBe(3);
        expect(pendingItems[1].text).toBe('Add error handling example');
        expect(pendingItems[1].status).toBe('pending');
        expect(pendingItems[2].id).toBe(5);
        expect(pendingItems[2].text).toBe('Fix typo in code example');
        expect(pendingItems[2].status).toBe('failed');
      });

      test('should return empty array for session with no results', () => {
        const emptySession = createMockSessionWithResults();
        delete emptySession.sectionResults;
        mockFs.readFileSync.mockReturnValue(JSON.stringify(emptySession));

        const pendingItems = sessionManager.getPendingFixableItems('fix-test-session', { sessionDir: mockSessionDir });

        expect(pendingItems).toEqual([]);
      });

      test('should return empty array for non-existent session', () => {
        mockFs.existsSync.mockReturnValue(false);

        const pendingItems = sessionManager.getPendingFixableItems('nonexistent-session', { sessionDir: mockSessionDir });

        expect(pendingItems).toEqual([]);
      });
    });

    describe('Fix Phase Prompt Template Integration', () => {
      test('should load fix phase prompt with populated template variables', () => {
        const mockFixPrompt = '# Fix Phase\n\n## Current Status\n{statusSummary}\n\n## Items\n{pendingItems}';
        
        // Create a test session that definitely has pending items
        const testSessionWithPending = createMockSessionWithResults();
        
        mockFs.existsSync.mockImplementation((path) => {
          if (typeof path === 'string' && path.includes('doc-testing-fix.md')) {
            return true;
          }
          return typeof path === 'string' && path.includes('.json');
        });

        mockFs.readFileSync.mockImplementation((path) => {
          if (typeof path === 'string' && path.includes('doc-testing-fix.md')) {
            return mockFixPrompt;
          }
          if (typeof path === 'string' && path.includes('fix-test-session.json')) {
            return JSON.stringify(testSessionWithPending);
          }
          return JSON.stringify(testSessionWithPending);
        });

        const step = sessionManager.getNextStep('fix-test-session', { sessionDir: mockSessionDir }, ValidationPhase.FIX);

        expect(step).toBeDefined();
        expect(step!.phase).toBe(ValidationPhase.FIX);
        expect(step!.prompt).toContain('**Total Items**: 5');
        expect(step!.prompt).toContain('1. Fix broken command');
        expect(step!.prompt).toContain('3. Add error handling example');
        expect(step!.prompt).toContain('5. Fix typo in code example ❌ [RETRY]');
        expect(step!.prompt).not.toContain('{statusSummary}');
        expect(step!.prompt).not.toContain('{pendingItems}');
      });

      test('should handle fix phase when all items are resolved', () => {
        const completedSession = createMockSessionWithResults();
        completedSession.sectionResults!['section_1'].issues[0].status = 'fixed';
        completedSession.sectionResults!['section_1'].issues[2].status = 'fixed';
        completedSession.sectionResults!['section_2'].issues[0].status = 'fixed';

        mockFs.readFileSync.mockImplementation((path) => {
          if (typeof path === 'string' && path.includes('doc-testing-fix.md')) {
            return 'Status: {statusSummary}\nItems: {pendingItems}';
          }
          return JSON.stringify(completedSession);
        });

        const step = sessionManager.getNextStep('fix-test-session', { sessionDir: mockSessionDir }, ValidationPhase.FIX);

        expect(step!.prompt).toContain('🎉 All items have been addressed!');
        expect(step!.prompt).toContain('No pending items - all issues have been addressed!');
      });
    });
  });
});