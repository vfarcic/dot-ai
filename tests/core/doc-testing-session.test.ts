/**
 * Tests for DocTestingSessionManager
 * 
 * Tests the session-based documentation testing functionality
 */

import { DocTestingSessionManager } from '../../src/core/doc-testing-session';
import { ValidationSession, ValidationPhase, SessionStatus, SessionMetadata } from '../../src/core/doc-testing-types';
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
      expect(session.reportFile).toContain('doc-test-report-');
      expect(session.metadata).toBeDefined();
      expect(session.metadata.totalItems).toBe(0);
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
        totalItems: 0,
        completedItems: 0,
        skippedItems: 0,
        blockedItems: 0,
        pendingItems: 0,
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z'
      };

      const mockSession: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
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
        totalItems: 0,
        completedItems: 0,
        skippedItems: 0,
        blockedItems: 0,
        pendingItems: 0,
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z'
      };

      const mockSession: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.TEST,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
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
        totalItems: 0,
        completedItems: 0,
        skippedItems: 0,
        blockedItems: 0,
        pendingItems: 0,
        sessionDir: '/tmp/sessions',
        lastUpdated: '2025-07-18T10:30:00Z'
      };

      const mockSession: ValidationSession = {
        sessionId: '2025-07-18T10-30-00-abc12345',
        filePath: 'README.md',
        startTime: '2025-07-18T10:30:00Z',
        currentPhase: ValidationPhase.SCAN,
        status: SessionStatus.ACTIVE,
        reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
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
      totalItems: 0,
      completedItems: 0,
      skippedItems: 0,
      blockedItems: 0,
      pendingItems: 0,
      sessionDir: '/tmp/sessions',
      lastUpdated: '2025-07-18T10:30:00Z'
    };

    const mockSession: ValidationSession = {
      sessionId: '2025-07-18T10-30-00-abc12345',
      filePath: 'README.md',
      startTime: '2025-07-18T10:30:00Z',
      currentPhase: ValidationPhase.SCAN,
      status: SessionStatus.ACTIVE,
      reportFile: 'doc-test-report-2025-07-18T10-30-00-abc12345.md',
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
      const step = sessionManager.getNextStep(
        '2025-07-18T10-30-00-abc12345', 
        { sessionDir: mockSessionDir }, 
        ValidationPhase.TEST
      );
      
      expect(step!.phase).toBe(ValidationPhase.TEST);
      expect(step!.nextPhase).toBe(ValidationPhase.ANALYZE);
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
});